import { useEffect, useRef } from 'react';

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
    showError(normalizedMessage, { title, actionLabel, onAction });
  }, [actionLabel, errorMessage, onAction, showError, title]);

  return null;
}
