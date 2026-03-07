import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  Image,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { captureRef } from 'react-native-view-shot';

import { buildPocketBaseFileUrl } from '../features';
import { LoadingState } from '../components/shared';
import { getRatingColor, getRatingLabel } from '../lib/ratingConstants';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { trackObservabilityEvent } from '../observability';
import { useTheme } from '../theme';
import { Button, Text } from '../ui';

type VisitShareCustomizationScreenProps = NativeStackScreenProps<RootStackParamList, 'VisitShareCustomization'>;
type VisitShareItem = RootStackParamList['VisitShareCustomization']['items'][number];
type ShareTheme = 'modern' | 'rustic' | 'minimal' | 'neon';

const visitDateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

function formatVisitDate(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return visitDateFormatter.format(parsed);
}

function buildPhotoUrl(item: VisitShareItem, thumb?: string): string {
  return buildPocketBaseFileUrl({
    collectionId: item.photoCollectionId,
    collectionName: item.photoCollectionName ?? 'visit_photos',
    recordId: item.photoId,
    filename: item.photoFilename,
    thumb,
  });
}

export function VisitShareCustomizationScreen({ navigation, route }: VisitShareCustomizationScreenProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { width: viewportWidth } = useWindowDimensions();
  const shareCanvasRef = useRef<View>(null);

  const [shareTheme, setShareTheme] = useState<ShareTheme>('modern');
  const [showDishNames, setShowDishNames] = useState(true);
  const [showRestaurantName, setShowRestaurantName] = useState(true);
  const [showRating, setShowRating] = useState(true);
  const [showDate, setShowDate] = useState(true);
  const [isSharing, setIsSharing] = useState(false);
  const [readyPhotoIds, setReadyPhotoIds] = useState<Set<string>>(new Set());
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const { items, restaurantName, visitDate } = route.params;
  const formattedVisitDate = useMemo(() => formatVisitDate(visitDate), [visitDate]);
  const previewItems = useMemo(
    () =>
      items.map((item) => ({
        ...item,
        photoUrl: buildPhotoUrl(item),
      })),
    [items],
  );

  const previewWidth = Math.min(viewportWidth - theme.spacing.lg * 2, 420);
  const areAllPhotosReady = readyPhotoIds.size >= previewItems.length;
  const hasVisibleOverlay = showDishNames || showRestaurantName || showRating || showDate;
  const isRusticTheme = shareTheme === 'rustic';
  const isMinimalTheme = shareTheme === 'minimal';
  const isNeonTheme = shareTheme === 'neon';
  const themedDateLabel = useMemo(() => {
    if (shareTheme === 'rustic') {
      return formattedVisitDate.replace(',', '').toUpperCase();
    }

    if (shareTheme === 'minimal') {
      return formattedVisitDate.replace(',', '');
    }

    if (shareTheme === 'neon') {
      return formattedVisitDate.replace(',', '').toUpperCase();
    }

    return formattedVisitDate;
  }, [formattedVisitDate, shareTheme]);

  const themeTokens = useMemo(() => {
    if (shareTheme === 'rustic') {
      return {
        canvasBackground: theme.colors.background.muted,
        canvasBorder: 'transparent',
        itemBorder: theme.colors.border.warning,
        itemBackground: theme.colors.background.surface,
        overlayBackground: 'rgba(64, 43, 26, 0.74)',
        primaryText: theme.colors.text.inverse,
        secondaryText: theme.colors.text.inverse,
        overlayTopBorderColor: 'rgba(255, 238, 214, 0.5)',
        overlayBottomBorderColor: 'rgba(255, 238, 214, 0.28)',
      };
    }

    if (shareTheme === 'minimal') {
      return {
        canvasBackground: theme.colors.background.surface,
        canvasBorder: 'transparent',
        itemBorder: 'rgba(255, 255, 255, 0.08)',
        itemBackground: theme.colors.background.surface,
        overlayBackground: 'rgba(255, 255, 255, 0.88)',
        primaryText: theme.colors.text.primary,
        secondaryText: theme.colors.text.secondary,
        overlayTopBorderColor: 'rgba(17, 24, 39, 0.2)',
        overlayBottomBorderColor: 'rgba(17, 24, 39, 0.08)',
      };
    }

    if (shareTheme === 'neon') {
      return {
        canvasBackground: 'rgba(6, 10, 20, 1)',
        canvasBorder: 'rgba(22, 217, 255, 1)',
        itemBorder: 'rgba(22, 217, 255, 1)',
        itemBackground: 'rgba(4, 8, 19, 1)',
        overlayBackground: 'rgba(3, 9, 24, 0.88)',
        primaryText: 'rgba(163, 240, 255, 1)',
        secondaryText: 'rgba(226, 246, 255, 1)',
        overlayTopBorderColor: 'rgba(22, 217, 255, 1)',
        overlayBottomBorderColor: 'rgba(140, 55, 255, 1)',
      };
    }

    return {
      canvasBackground: theme.colors.background.surface,
      canvasBorder: 'transparent',
      itemBorder: 'rgba(255, 255, 255, 0.08)',
      itemBackground: theme.colors.background.surface,
      overlayBackground: 'rgba(15, 23, 40, 0.72)',
      primaryText: theme.colors.text.inverse,
      secondaryText: theme.colors.text.inverse,
      overlayTopBorderColor: 'transparent',
      overlayBottomBorderColor: 'transparent',
    };
  }, [
    shareTheme,
    theme.colors.background.muted,
    theme.colors.background.surface,
    theme.colors.border.warning,
    theme.colors.text.inverse,
    theme.colors.text.primary,
    theme.colors.text.secondary,
  ]);

  const markPhotoReady = useCallback((photoId: string) => {
    setReadyPhotoIds((previous) => {
      if (previous.has(photoId)) {
        return previous;
      }

      const next = new Set(previous);
      next.add(photoId);
      return next;
    });
  }, []);

  const handleShare = useCallback(async () => {
    if (!shareCanvasRef.current) {
      return;
    }

    trackObservabilityEvent('VISIT_SHARE_RENDER_STARTED', {
      itemCount: items.length,
      source: 'VisitShareCustomizationScreen',
      theme: shareTheme,
    });
    setErrorMessage(null);
    setIsSharing(true);

    try {
      const capturedUri = await captureRef(shareCanvasRef, {
        format: 'jpg',
        quality: 0.95,
        result: 'tmpfile',
      });

      const shareResult = await Share.share({
        message:
          Platform.OS === 'android'
            ? `Check out what I tried at ${restaurantName}!`
            : undefined,
        url: capturedUri,
      });
      trackObservabilityEvent('VISIT_SHARE_COMPLETED', {
        action: shareResult.action,
        itemCount: items.length,
        source: 'VisitShareCustomizationScreen',
      });

      navigation.goBack();
    } catch (error) {
      trackObservabilityEvent('VISIT_SHARE_FAILED', {
        errorMessage: error instanceof Error ? error.message : String(error),
        errorType: error instanceof Error ? error.name : 'unknown_error',
        source: 'VisitShareCustomizationScreen',
      });
      setErrorMessage(error instanceof Error ? error.message : 'Could not share visit image.');
    } finally {
      setIsSharing(false);
    }
  }, [items.length, navigation, restaurantName, shareTheme]);

  const styles = StyleSheet.create({
    screen: {
      backgroundColor: 'rgba(0, 0, 0, 0.97)',
      flex: 1,
    },
    header: {
      alignItems: 'center',
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingHorizontal: theme.spacing.md,
    },
    headerTitleWrap: {
      flex: 1,
      gap: 2,
      paddingRight: theme.spacing.sm,
    },
    headerTitle: {
      color: theme.colors.text.inverse,
      fontSize: 20,
      fontWeight: '700',
      lineHeight: 24,
    },
    headerSubtitle: {
      color: 'rgba(255, 255, 255, 0.76)',
      fontSize: 13,
      lineHeight: 18,
    },
    closeButton: {
      alignItems: 'center',
      backgroundColor: 'rgba(255, 255, 255, 0.18)',
      borderRadius: theme.radii.pill,
      height: 38,
      justifyContent: 'center',
      width: 38,
    },
    previewScroll: {
      flex: 1,
      paddingHorizontal: theme.spacing.md,
    },
    previewScrollContent: {
      alignItems: 'center',
      gap: theme.spacing.md,
      paddingBottom: theme.spacing.lg,
      paddingTop: theme.spacing.md,
    },
    shareCanvas: {
      borderRadius: 0,
      borderWidth: 1,
      gap: 0,
      padding: 0,
    },
    shareItemCard: {
      borderRadius: 0,
      borderWidth: 1,
      overflow: 'hidden',
    },
    shareImage: {
      aspectRatio: 1,
      backgroundColor: theme.colors.background.muted,
      width: '100%',
    },
    shareOverlay: {
      bottom: 0,
      gap: 4,
      left: 0,
      paddingHorizontal: theme.spacing.sm,
      paddingVertical: theme.spacing.xs,
      position: 'absolute',
      right: 0,
    },
    shareOverlayModern: {
      borderTopWidth: 0,
      borderBottomWidth: 0,
      paddingVertical: theme.spacing.xs,
    },
    shareOverlayRustic: {
      borderTopWidth: 2,
      borderBottomWidth: 1,
      paddingVertical: theme.spacing.xs + 1,
    },
    shareOverlayMinimal: {
      borderTopWidth: 1,
      borderBottomWidth: 1,
      gap: 2,
      paddingVertical: theme.spacing.xs - 1,
    },
    shareOverlayNeon: {
      borderTopWidth: 2,
      borderBottomWidth: 2,
      gap: 3,
      paddingVertical: theme.spacing.xs - 1,
    },
    overlayPrimaryText: {
      fontSize: 17,
      fontWeight: '700',
      lineHeight: 22,
    },
    overlayPrimaryModern: {
      fontSize: 17,
      fontWeight: '700',
      lineHeight: 22,
    },
    overlayPrimaryRustic: {
      fontSize: 15,
      fontWeight: '700',
      letterSpacing: 0.8,
      lineHeight: 20,
      textTransform: 'uppercase',
    },
    overlayPrimaryMinimal: {
      fontSize: 16,
      fontWeight: '600',
      lineHeight: 20,
    },
    overlayPrimaryNeon: {
      fontSize: 15,
      fontWeight: '700',
      letterSpacing: 1.0,
      lineHeight: 19,
      textTransform: 'uppercase',
    },
    overlaySecondaryText: {
      fontSize: 15,
      lineHeight: 20,
    },
    overlaySecondaryModern: {
      fontSize: 15,
      lineHeight: 20,
    },
    overlaySecondaryRustic: {
      fontSize: 14,
      fontStyle: 'italic',
      letterSpacing: 0.45,
      lineHeight: 18,
    },
    overlaySecondaryMinimal: {
      fontSize: 14,
      lineHeight: 18,
    },
    overlaySecondaryNeon: {
      fontSize: 13,
      letterSpacing: 0.35,
      lineHeight: 17,
      textTransform: 'uppercase',
    },
    ratingRow: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: 6,
    },
    metaRow: {
      alignItems: 'center',
      flexDirection: 'row',
      justifyContent: 'space-between',
      minHeight: 20,
    },
    metaLeftText: {
      flexShrink: 1,
      paddingRight: theme.spacing.xs,
    },
    metaRight: {
      alignItems: 'center',
      flexDirection: 'row',
      flexShrink: 0,
      gap: 6,
      marginLeft: theme.spacing.xs,
    },
    metaRightModern: {
      paddingHorizontal: 0,
      paddingVertical: 0,
    },
    metaRightRustic: {
      backgroundColor: 'rgba(30, 16, 8, 0.45)',
      borderColor: 'rgba(255, 235, 210, 0.35)',
      borderRadius: 0,
      borderWidth: 1,
      paddingHorizontal: 8,
      paddingVertical: 2,
    },
    metaRightMinimal: {
      backgroundColor: 'rgba(17, 24, 39, 0.06)',
      borderColor: 'rgba(17, 24, 39, 0.2)',
      borderRadius: 0,
      borderWidth: 1,
      paddingHorizontal: 8,
      paddingVertical: 2,
    },
    metaRightNeon: {
      backgroundColor: 'rgba(7, 16, 38, 0.72)',
      borderColor: 'rgba(22, 217, 255, 1)',
      borderRadius: 0,
      borderWidth: 1,
      paddingHorizontal: 8,
      paddingVertical: 2,
    },
    ratingDot: {
      borderRadius: theme.radii.pill,
      height: 10,
      width: 10,
    },
    ratingDotRustic: {
      height: 11,
      width: 11,
    },
    ratingDotMinimal: {
      height: 9,
      width: 9,
    },
    dateTextRustic: {
      letterSpacing: 0.55,
      textTransform: 'uppercase',
    },
    dateTextMinimal: {
      letterSpacing: 0.2,
    },
    dateTextNeon: {
      letterSpacing: 0.55,
      textTransform: 'uppercase',
    },
    ratingTextRustic: {
      fontSize: 14,
      fontWeight: '600',
      letterSpacing: 0.35,
      lineHeight: 18,
    },
    ratingTextMinimal: {
      fontSize: 14,
      fontWeight: '500',
      lineHeight: 18,
    },
    ratingTextNeon: {
      fontSize: 13,
      fontWeight: '700',
      letterSpacing: 0.45,
      lineHeight: 17,
      textTransform: 'uppercase',
    },
    optionPanel: {
      backgroundColor: 'rgba(20, 20, 20, 0.98)',
      borderTopColor: 'rgba(255, 255, 255, 0.12)',
      borderTopWidth: 1,
      gap: theme.spacing.sm,
      paddingHorizontal: theme.spacing.md,
      paddingTop: theme.spacing.sm,
    },
    sectionTitle: {
      color: theme.colors.text.inverse,
      fontSize: 13,
      fontWeight: '600',
      lineHeight: 18,
      marginBottom: theme.spacing.xxs,
      opacity: 0.9,
    },
    chipRow: {
      flexDirection: 'row',
      gap: theme.spacing.xs,
    },
    chipButton: {
      alignItems: 'center',
      borderColor: 'rgba(255, 255, 255, 0.24)',
      borderRadius: theme.radii.md,
      borderWidth: 1,
      flex: 1,
      minHeight: 36,
      paddingHorizontal: theme.spacing.xs,
      paddingVertical: theme.spacing.xs,
    },
    chipButtonActive: {
      backgroundColor: 'rgba(255, 255, 255, 0.2)',
      borderColor: 'rgba(255, 255, 255, 0.62)',
    },
    chipLabel: {
      color: 'rgba(255, 255, 255, 0.72)',
      fontSize: 12,
      fontWeight: '600',
      lineHeight: 16,
    },
    chipLabelActive: {
      color: theme.colors.text.inverse,
    },
    statusText: {
      color: 'rgba(255, 255, 255, 0.72)',
      fontSize: 12,
      lineHeight: 16,
      minHeight: 16,
      textAlign: 'center',
    },
    statusLoading: {
      justifyContent: 'center',
      minHeight: 16,
    },
    statusErrorText: {
      color: theme.colors.text.danger,
    },
    shareButton: {
      marginTop: theme.spacing.xxs,
    },
  });

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: Math.max(theme.spacing.sm, insets.top + theme.spacing.xs) }]}>
        <View style={styles.headerTitleWrap}>
          <Text style={styles.headerTitle}>Share Visit</Text>
          <Text numberOfLines={1} style={styles.headerSubtitle}>
            {previewItems.length} dish{previewItems.length === 1 ? '' : 'es'} from {restaurantName}
          </Text>
        </View>
        <Pressable
          accessibilityLabel="Close share customization"
          onPress={() => {
            navigation.goBack();
          }}
          style={styles.closeButton}
        >
          <Ionicons color={theme.colors.text.inverse} name="close" size={22} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.previewScrollContent} style={styles.previewScroll}>
        <View
          collapsable={false}
          ref={shareCanvasRef}
          style={[
            styles.shareCanvas,
            {
              backgroundColor: themeTokens.canvasBackground,
              borderColor: themeTokens.canvasBorder,
              width: previewWidth,
            },
          ]}
        >
          {previewItems.map((item) => (
            <View
              key={item.itemId}
              style={[
                styles.shareItemCard,
                {
                  backgroundColor: themeTokens.itemBackground,
                  borderColor: themeTokens.itemBorder,
                },
                isRusticTheme ? { borderWidth: 2, borderRadius: 0 } : null,
                isMinimalTheme ? { borderWidth: 1, borderRadius: 0 } : null,
                isNeonTheme ? { borderWidth: 2, borderRadius: 0 } : null,
                shareTheme === 'modern' ? { borderWidth: 1, borderRadius: 0 } : null,
              ]}
            >
              <Image
                onError={() => {
                  markPhotoReady(item.photoId);
                }}
                onLoad={() => {
                  markPhotoReady(item.photoId);
                }}
                source={{ uri: item.photoUrl }}
                style={styles.shareImage}
              />
              {hasVisibleOverlay ? (
                <View
                  style={[
                    styles.shareOverlay,
                    isRusticTheme
                      ? styles.shareOverlayRustic
                      : isMinimalTheme
                        ? styles.shareOverlayMinimal
                        : isNeonTheme
                          ? styles.shareOverlayNeon
                          : styles.shareOverlayModern,
                    {
                      backgroundColor: themeTokens.overlayBackground,
                      borderTopColor: themeTokens.overlayTopBorderColor,
                      borderBottomColor: themeTokens.overlayBottomBorderColor,
                    },
                  ]}
                >
                  {showDishNames ? (
                    <Text
                      style={[
                        styles.overlayPrimaryText,
                        isRusticTheme
                          ? styles.overlayPrimaryRustic
                          : isMinimalTheme
                            ? styles.overlayPrimaryMinimal
                            : isNeonTheme
                              ? styles.overlayPrimaryNeon
                            : styles.overlayPrimaryModern,
                        { color: themeTokens.primaryText },
                      ]}
                    >
                      {item.itemName}
                    </Text>
                  ) : null}
                  {showRestaurantName ? (
                    <Text
                      style={[
                        styles.overlaySecondaryText,
                        isRusticTheme
                          ? styles.overlaySecondaryRustic
                          : isMinimalTheme
                            ? styles.overlaySecondaryMinimal
                            : isNeonTheme
                              ? styles.overlaySecondaryNeon
                            : styles.overlaySecondaryModern,
                        { color: themeTokens.secondaryText },
                      ]}
                    >
                      {restaurantName}
                    </Text>
                  ) : null}
                  {showRating || showDate ? (
                    showDate && showRating ? (
                      <View style={styles.metaRow}>
                        <Text
                          numberOfLines={1}
                          style={[
                            styles.overlaySecondaryText,
                            styles.metaLeftText,
                            isRusticTheme
                              ? styles.dateTextRustic
                              : isMinimalTheme
                                ? styles.dateTextMinimal
                                : isNeonTheme
                                  ? styles.dateTextNeon
                                : null,
                            { color: themeTokens.secondaryText },
                          ]}
                        >
                          {themedDateLabel}
                        </Text>
                        <View
                          style={[
                            styles.metaRight,
                            isRusticTheme
                              ? styles.metaRightRustic
                              : isMinimalTheme
                                ? styles.metaRightMinimal
                                : isNeonTheme
                                  ? styles.metaRightNeon
                                : styles.metaRightModern,
                          ]}
                        >
                          <View
                            style={[
                              styles.ratingDot,
                              isRusticTheme
                                ? styles.ratingDotRustic
                                : isMinimalTheme
                                  ? styles.ratingDotMinimal
                                  : null,
                              { backgroundColor: getRatingColor(theme, item.rating) },
                            ]}
                          />
                          <Text
                            style={[
                              styles.overlaySecondaryText,
                              isRusticTheme
                                ? styles.ratingTextRustic
                                : isMinimalTheme
                                  ? styles.ratingTextMinimal
                                  : isNeonTheme
                                    ? styles.ratingTextNeon
                                  : null,
                              { color: themeTokens.secondaryText },
                            ]}
                          >
                            {getRatingLabel(item.rating)}
                          </Text>
                        </View>
                      </View>
                    ) : showRating ? (
                      <View
                        style={[
                          styles.ratingRow,
                          styles.metaRight,
                          isRusticTheme
                            ? styles.metaRightRustic
                            : isMinimalTheme
                              ? styles.metaRightMinimal
                              : isNeonTheme
                                ? styles.metaRightNeon
                              : styles.metaRightModern,
                          { alignSelf: 'flex-end' },
                        ]}
                      >
                        <View
                          style={[
                            styles.ratingDot,
                            isRusticTheme
                              ? styles.ratingDotRustic
                              : isMinimalTheme
                                ? styles.ratingDotMinimal
                                : null,
                            { backgroundColor: getRatingColor(theme, item.rating) },
                          ]}
                        />
                        <Text
                          style={[
                            styles.overlaySecondaryText,
                            isRusticTheme
                              ? styles.ratingTextRustic
                              : isMinimalTheme
                                ? styles.ratingTextMinimal
                                : isNeonTheme
                                  ? styles.ratingTextNeon
                                : null,
                            { color: themeTokens.secondaryText },
                          ]}
                        >
                          {getRatingLabel(item.rating)}
                        </Text>
                      </View>
                    ) : (
                      <Text
                        style={[
                          styles.overlaySecondaryText,
                          isRusticTheme
                            ? styles.dateTextRustic
                            : isMinimalTheme
                              ? styles.dateTextMinimal
                              : isNeonTheme
                                ? styles.dateTextNeon
                              : null,
                          { color: themeTokens.secondaryText },
                        ]}
                      >
                        {themedDateLabel}
                      </Text>
                    )
                  ) : null}
                </View>
              ) : null}
            </View>
          ))}
        </View>
      </ScrollView>

      <View style={[styles.optionPanel, { paddingBottom: Math.max(theme.spacing.sm, insets.bottom) }]}>
        <View>
          <Text style={styles.sectionTitle}>Overlay style</Text>
          <View style={styles.chipRow}>
            {(['modern', 'rustic', 'minimal', 'neon'] as const).map((option) => {
              const isActive = shareTheme === option;
              return (
                <Pressable
                  key={option}
                  onPress={() => {
                    setShareTheme(option);
                  }}
                  style={[styles.chipButton, isActive && styles.chipButtonActive]}
                >
                  <Text style={[styles.chipLabel, isActive && styles.chipLabelActive]}>
                    {option[0].toUpperCase() + option.slice(1)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View>
          <Text style={styles.sectionTitle}>Show overlays</Text>
          <View style={styles.chipRow}>
            {[
              { key: 'dish' as const, label: 'Dish Name', active: showDishNames, setValue: setShowDishNames },
              { key: 'restaurant' as const, label: 'Restaurant', active: showRestaurantName, setValue: setShowRestaurantName },
            ].map((option) => (
              <Pressable
                key={option.key}
                onPress={() => {
                  option.setValue((previous) => !previous);
                }}
                style={[styles.chipButton, option.active && styles.chipButtonActive]}
              >
                <Text style={[styles.chipLabel, option.active && styles.chipLabelActive]}>{option.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View>
          <Text style={styles.sectionTitle}>Show on badge</Text>
          <View style={styles.chipRow}>
            {[
              { key: 'rating' as const, label: 'Rating', active: showRating, setValue: setShowRating },
              { key: 'date' as const, label: 'Date', active: showDate, setValue: setShowDate },
            ].map((option) => (
              <Pressable
                key={option.key}
                onPress={() => {
                  option.setValue((previous) => !previous);
                }}
                style={[styles.chipButton, option.active && styles.chipButtonActive]}
              >
                <Text style={[styles.chipLabel, option.active && styles.chipLabelActive]}>{option.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        {errorMessage ? (
          <Text style={[styles.statusText, styles.statusErrorText]}>{errorMessage}</Text>
        ) : !areAllPhotosReady ? (
          <LoadingState label="Loading photos..." style={styles.statusLoading} />
        ) : (
          <Text style={styles.statusText}>{''}</Text>
        )}

        <Button
          disabled={!areAllPhotosReady}
          label="Share Visit"
          loading={isSharing}
          onPress={() => {
            void handleShare();
          }}
          style={styles.shareButton}
        />
      </View>
    </View>
  );
}
