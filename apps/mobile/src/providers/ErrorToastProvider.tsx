import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Platform, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getPlatformPointerEventsProps, getPlatformPointerEventsStyle } from '../lib/platformPointerEvents';
import { trackObservabilityEvent } from '../observability';
import { useTheme } from '../theme';
import { Text } from '../ui';

type ToastTone = 'danger' | 'info' | 'success' | 'warning';

interface ErrorToastState {
  id: number;
  title: string;
  message: string;
  tone: ToastTone;
  actionLabel?: string;
  onAction?: () => void;
  source?: string;
}

interface ShowToastOptions {
  title?: string;
  tone?: ToastTone;
  actionLabel?: string;
  onAction?: () => void;
  source?: string;
}

interface ErrorToastContextValue {
  showToast: (message: string, options?: ShowToastOptions) => void;
  showError: (message: string, options?: Omit<ShowToastOptions, 'tone'>) => void;
  dismissError: () => void;
}

const ErrorToastContext = createContext<ErrorToastContextValue | undefined>(undefined);

const DEFAULT_ERROR_TITLE = 'Something went wrong';
const ENTER_ANIMATION_MS = 180;
const EXIT_ANIMATION_MS = 140;
const HIDDEN_Y_OFFSET = -24;
const AUTO_DISMISS_MS = 5000;
const SHOULD_USE_NATIVE_ANIMATION_DRIVER = Platform.OS !== 'web';

function getDefaultTitle(tone: ToastTone): string {
  switch (tone) {
    case 'success':
      return 'Saved';
    case 'info':
      return 'Info';
    case 'warning':
      return 'Heads up';
    case 'danger':
    default:
      return DEFAULT_ERROR_TITLE;
  }
}

export function ErrorToastProvider({ children }: { children: React.ReactNode }) {
  const theme = useTheme();
  const [toast, setToast] = useState<ErrorToastState | null>(null);
  const nextToastIdRef = useRef(0);
  const lastTrackedToastIdRef = useRef<number | null>(null);
  const dismissTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const translateY = useRef(new Animated.Value(HIDDEN_Y_OFFSET)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  const animateIn = useCallback(() => {
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: 0,
        duration: ENTER_ANIMATION_MS,
        useNativeDriver: SHOULD_USE_NATIVE_ANIMATION_DRIVER,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: ENTER_ANIMATION_MS,
        useNativeDriver: SHOULD_USE_NATIVE_ANIMATION_DRIVER,
      }),
    ]).start();
  }, [opacity, translateY]);

  const dismissError = useCallback(() => {
    if (dismissTimeoutRef.current) {
      clearTimeout(dismissTimeoutRef.current);
      dismissTimeoutRef.current = null;
    }

    if (toast) {
      trackObservabilityEvent('ERROR_TOAST_DISMISSED', {
        hasAction: Boolean(toast.actionLabel && toast.onAction),
        source: 'ErrorToastProvider',
        title: toast.title,
        toastSource: toast.source ?? 'unknown',
      });
    }

    Animated.parallel([
      Animated.timing(translateY, {
        toValue: HIDDEN_Y_OFFSET,
        duration: EXIT_ANIMATION_MS,
        useNativeDriver: SHOULD_USE_NATIVE_ANIMATION_DRIVER,
      }),
      Animated.timing(opacity, {
        toValue: 0,
        duration: EXIT_ANIMATION_MS,
        useNativeDriver: SHOULD_USE_NATIVE_ANIMATION_DRIVER,
      }),
    ]).start(({ finished }) => {
      if (finished) {
        setToast(null);
      }
    });
  }, [opacity, toast, translateY]);

  const showToast = useCallback((messageValue: string, options?: ShowToastOptions) => {
    const message = messageValue.trim();
    if (!message) {
      return;
    }

    const tone = options?.tone ?? 'danger';
    nextToastIdRef.current += 1;
    setToast({
      id: nextToastIdRef.current,
      title: options?.title?.trim() || getDefaultTitle(tone),
      message,
      tone,
      actionLabel: options?.actionLabel?.trim() || undefined,
      onAction: options?.onAction,
      source: options?.source?.trim() || 'unknown',
    });
  }, []);

  const showError = useCallback<ErrorToastContextValue['showError']>(
    (message, options) => {
      showToast(message, {
        ...options,
        tone: 'danger',
      });
    },
    [showToast],
  );

  useEffect(() => {
    if (!toast) {
      return;
    }

    if (lastTrackedToastIdRef.current !== toast.id) {
      lastTrackedToastIdRef.current = toast.id;
      trackObservabilityEvent('ERROR_TOAST_SHOWN', {
        hasAction: Boolean(toast.actionLabel && toast.onAction),
        messageLength: toast.message.length,
        source: 'ErrorToastProvider',
        title: toast.title,
        tone: toast.tone,
        toastSource: toast.source ?? 'unknown',
      });
    }

    translateY.setValue(HIDDEN_Y_OFFSET);
    opacity.setValue(0);
    animateIn();

    dismissTimeoutRef.current = setTimeout(() => {
      dismissError();
    }, AUTO_DISMISS_MS);

    return () => {
      if (dismissTimeoutRef.current) {
        clearTimeout(dismissTimeoutRef.current);
        dismissTimeoutRef.current = null;
      }
    };
  }, [animateIn, dismissError, opacity, toast, translateY]);

  const handleActionPress = useCallback(() => {
    if (!toast?.onAction) {
      return;
    }

    trackObservabilityEvent('ERROR_TOAST_ACTION_TAPPED', {
      actionLabel: toast.actionLabel ?? null,
      source: 'ErrorToastProvider',
      title: toast.title,
      tone: toast.tone,
      toastSource: toast.source ?? 'unknown',
    });
    toast.onAction();
  }, [toast]);

  const contextValue = useMemo<ErrorToastContextValue>(
    () => ({
      showToast,
      showError,
      dismissError,
    }),
    [dismissError, showError, showToast],
  );

  const toastTone = toast?.tone ?? 'danger';
  const toastBorderColor =
    toastTone === 'success'
      ? theme.colors.status.successBorder
      : toastTone === 'info'
        ? theme.colors.status.infoBorder
        : toastTone === 'warning'
          ? theme.colors.status.warningBorder
          : theme.colors.status.dangerBorder;
  const toastBackgroundColor =
    toastTone === 'success'
      ? theme.colors.status.successBg
      : toastTone === 'info'
        ? theme.colors.status.infoBg
        : toastTone === 'warning'
          ? theme.colors.status.warningBg
          : theme.colors.status.dangerBg;

  const styles = StyleSheet.create({
    safeAreaContainer: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      zIndex: 60,
    },
    container: {
      paddingHorizontal: theme.spacing.sm,
      paddingTop: theme.spacing.xs,
      alignItems: 'center',
    },
    toast: {
      width: '100%',
      maxWidth: 640,
      borderRadius: theme.radii.md,
      borderWidth: 1,
      borderColor: toastBorderColor,
      backgroundColor: toastBackgroundColor,
      paddingVertical: theme.spacing.xs,
      paddingHorizontal: theme.spacing.sm,
      gap: theme.spacing.xs,
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
    },
    messageGroup: {
      flex: 1,
      gap: theme.spacing.xxs,
      paddingTop: 2,
      paddingRight: theme.spacing.sm,
    },
    dismissButton: {
      minHeight: 28,
      paddingHorizontal: theme.spacing.xs,
      alignItems: 'center',
      justifyContent: 'center',
    },
    actions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.sm,
      marginTop: theme.spacing.xxs,
    },
    actionButton: {
      minHeight: 24,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });

  return (
    <ErrorToastContext.Provider value={contextValue}>
      {children}
      {toast ? (
        <SafeAreaView
          edges={['top']}
          {...getPlatformPointerEventsProps('box-none')}
          style={[styles.safeAreaContainer, getPlatformPointerEventsStyle('box-none')]}
        >
          <Animated.View
            {...getPlatformPointerEventsProps('box-none')}
            style={[getPlatformPointerEventsStyle('box-none'), {
              transform: [{ translateY }],
              opacity,
            }]}
          >
            <View
              {...getPlatformPointerEventsProps('box-none')}
              style={[styles.container, getPlatformPointerEventsStyle('box-none')]}
            >
              <View
                accessibilityLiveRegion="polite"
                accessibilityRole="alert"
                style={styles.toast}
              >
                <View style={styles.messageGroup}>
                  <Text tone={toast.tone} variant="label" numberOfLines={1}>
                    {toast.title}
                  </Text>
                  <Text tone={toast.tone} numberOfLines={2}>
                    {toast.message}
                  </Text>
                  {toast.onAction && toast.actionLabel ? (
                    <View style={styles.actions}>
                      <Pressable
                        accessibilityLabel={toast.actionLabel}
                        accessibilityRole="button"
                        onPress={handleActionPress}
                        style={({ pressed }) => [styles.actionButton, pressed ? { opacity: 0.75 } : null]}
                      >
                        <Text tone={toast.tone} variant="label">
                          {toast.actionLabel}
                        </Text>
                      </Pressable>
                    </View>
                  ) : null}
                </View>
                <Pressable
                  accessibilityLabel="Dismiss message"
                  accessibilityRole="button"
                  onPress={dismissError}
                  style={({ pressed }) => [styles.dismissButton, pressed ? { opacity: 0.75 } : null]}
                >
                  <Text tone={toast.tone} variant="label">
                    Dismiss
                  </Text>
                </Pressable>
              </View>
            </View>
          </Animated.View>
        </SafeAreaView>
      ) : null}
    </ErrorToastContext.Provider>
  );
}

export function useErrorToast(): ErrorToastContextValue {
  const context = useContext(ErrorToastContext);

  if (!context) {
    throw new Error('useErrorToast must be used within an ErrorToastProvider.');
  }

  return context;
}
