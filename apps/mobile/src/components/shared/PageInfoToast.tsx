import { useEffect, useRef } from 'react';

import { trackObservabilityEvent, type JsonValue } from '../../observability';
import { useErrorToast } from '../../providers/ErrorToastProvider';

type PageInfoToastTone = 'info' | 'success' | 'warning';

export interface PageInfoToastProps {
  message?: string | null;
  title?: string;
  tone?: PageInfoToastTone;
  analyticsSource?: string;
  analyticsProps?: Record<string, JsonValue>;
}

export function PageInfoToast({
  message,
  title = 'Update saved',
  tone = 'info',
  analyticsSource,
  analyticsProps,
}: PageInfoToastProps) {
  const { showToast } = useErrorToast();
  const lastShownKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!message) {
      lastShownKeyRef.current = null;
      return;
    }

    const normalizedMessage = message.trim();
    if (!normalizedMessage) {
      return;
    }

    const dedupeKey = `${tone}::${title}::${normalizedMessage}`;
    if (lastShownKeyRef.current === dedupeKey) {
      return;
    }

    lastShownKeyRef.current = dedupeKey;
    trackObservabilityEvent('PAGE_INFO_TOAST_SHOWN', {
      ...analyticsProps,
      analyticsSource: analyticsSource ?? null,
      messageLength: normalizedMessage.length,
      source: 'PageInfoToast',
      title,
      tone,
    });
    showToast(normalizedMessage, {
      source: 'PageInfoToast',
      title,
      tone,
    });
  }, [analyticsProps, analyticsSource, message, showToast, title, tone]);

  return null;
}
