import { useCallback, useEffect, useRef } from 'react';

import { trackObservabilityEvent } from '../../observability';
import { useErrorToast } from '../../providers/ErrorToastProvider';

export interface PageErrorToastProps {
  errorMessage?: string | null;
  title?: string;
  actionLabel?: string;
  onAction?: () => void;
}

const DEFAULT_ERROR_TITLE = 'Something went wrong';

export function PageErrorToast({
  errorMessage,
  title = DEFAULT_ERROR_TITLE,
  actionLabel,
  onAction,
}: PageErrorToastProps) {
  const { showError } = useErrorToast();
  const lastShownKeyRef = useRef<string | null>(null);
  const handleAction = useCallback(() => {
    trackObservabilityEvent('PAGE_ERROR_TOAST_ACTION_TAPPED', {
      actionLabel: actionLabel ?? null,
      source: 'PageErrorToast',
      title,
    });
    onAction?.();
  }, [actionLabel, onAction, title]);

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
  }, [actionLabel, errorMessage, handleAction, onAction, showError, title]);

  return null;
}
