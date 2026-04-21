import { useCallback, useEffect, useRef } from 'react';

import { trackObservabilityEvent, type JsonValue } from '../../observability';
import { useErrorToast } from '../../providers/ErrorToastProvider';

export interface PageErrorToastProps {
  errorMessage?: string | null;
  title?: string;
  actionLabel?: string;
  onAction?: () => void;
  analyticsSource?: string;
  analyticsProps?: Record<string, JsonValue>;
}

const DEFAULT_ERROR_TITLE = 'Something went wrong';

export function PageErrorToast({
  errorMessage,
  title = DEFAULT_ERROR_TITLE,
  actionLabel,
  onAction,
  analyticsSource,
  analyticsProps,
}: PageErrorToastProps) {
  const { showError } = useErrorToast();
  const lastShownKeyRef = useRef<string | null>(null);
  const handleAction = useCallback(() => {
    trackObservabilityEvent('PAGE_ERROR_TOAST_ACTION_TAPPED', {
      actionLabel: actionLabel ?? null,
      ...analyticsProps,
      analyticsSource: analyticsSource ?? null,
      source: 'PageErrorToast',
      title,
    });
    onAction?.();
  }, [actionLabel, analyticsProps, analyticsSource, onAction, title]);

  useEffect(() => {
    if (!errorMessage) {
      lastShownKeyRef.current = null;
      return;
    }

    const normalizedMessage = errorMessage.trim();
    if (!normalizedMessage) {
      return;
    }

    const dedupeKey = `${title}::${normalizedMessage}::${actionLabel ?? ''}`;
    if (lastShownKeyRef.current === dedupeKey) {
      return;
    }

    lastShownKeyRef.current = dedupeKey;
    trackObservabilityEvent('PAGE_ERROR_TOAST_SHOWN', {
      hasAction: Boolean(actionLabel && onAction),
      ...analyticsProps,
      analyticsSource: analyticsSource ?? null,
      messageLength: normalizedMessage.length,
      source: 'PageErrorToast',
      title,
    });
    showError(normalizedMessage, {
      actionLabel,
      onAction: actionLabel && onAction ? handleAction : undefined,
      source: 'PageErrorToast',
      title,
    });
  }, [actionLabel, analyticsProps, analyticsSource, errorMessage, handleAction, onAction, showError, title]);

  return null;
}
