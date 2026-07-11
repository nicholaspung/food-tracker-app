import { useCallback, useEffect, useRef, useState } from 'react';

import {
  extractFriendCodeFromQrPayload,
  resolveOwnFriendCode,
  useFriendWrites,
  validateFriendRequestCode,
} from '../../features';
import { trackObservabilityEvent } from '../../observability';
import { trackProductEvent } from '../../observability/productAnalytics';
import { useAuth } from '../../providers/AuthProvider';
import { useConnectivity } from '../../providers/ConnectivityProvider';

const INVALID_SCAN_RETRY_DELAY_MS = 1200;

export function useFriendInviteQrFlow({
  onComplete,
  source,
}: {
  onComplete: () => void;
  source: 'AddFriendScreen' | 'QRScannerScreen';
}) {
  const friendWrites = useFriendWrites();
  const { user } = useAuth();
  const { isOnline } = useConnectivity();
  const scanLockRef = useRef(false);
  const invalidScanRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [hasScanned, setHasScanned] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [scannedCode, setScannedCode] = useState('');
  const ownFriendCode = resolveOwnFriendCode(user?.id, user?.friendCode);

  const clearInvalidScanRetry = useCallback(() => {
    if (invalidScanRetryTimerRef.current) {
      clearTimeout(invalidScanRetryTimerRef.current);
      invalidScanRetryTimerRef.current = null;
    }
  }, []);

  useEffect(() => clearInvalidScanRetry, [clearInvalidScanRetry]);

  const resetScanner = useCallback(() => {
    clearInvalidScanRetry();
    scanLockRef.current = false;
    setErrorMessage(null);
    setHasScanned(false);
    setIsSubmitting(false);
    setScannedCode('');
  }, [clearInvalidScanRetry]);

  const queueInvalidScanRetry = useCallback(() => {
    clearInvalidScanRetry();
    invalidScanRetryTimerRef.current = setTimeout(() => {
      scanLockRef.current = false;
      invalidScanRetryTimerRef.current = null;
    }, INVALID_SCAN_RETRY_DELAY_MS);
  }, [clearInvalidScanRetry]);

  const submitScannedCode = useCallback(async (inviteCode: string) => {
    const validationResult = validateFriendRequestCode({
      code: inviteCode,
      entryMethod: 'qr_scan',
      ownFriendCode,
    });
    trackObservabilityEvent('QR_SCAN_SUBMIT_STARTED', { source });

    if (!validationResult.ok) {
      trackObservabilityEvent('FRIEND_REQUEST_SEND_VALIDATION_FAILED', {
        source,
        entryMethod: 'qr_scan',
        reason: validationResult.reason,
        codeLength: validationResult.codeLength,
        isOnline,
      });
      setErrorMessage(validationResult.message);
      setHasScanned(true);
      return;
    }

    setErrorMessage(null);
    setScannedCode(validationResult.code);
    trackObservabilityEvent('FRIEND_REQUEST_SEND_STARTED', {
      source,
      entryMethod: 'qr_scan',
      codeLength: validationResult.code.length,
      isOnline,
    });
    setIsSubmitting(true);

    try {
      const requestResult = await friendWrites.sendFriendRequest({
        code: validationResult.code,
        entryMethod: 'qr_scan',
      });
      const queued = requestResult.status === 'queued';

      trackObservabilityEvent('FRIEND_REQUEST_SEND_SUCCEEDED', {
        source,
        entryMethod: 'qr_scan',
        queued,
      });
      trackObservabilityEvent('QR_SCAN_SUBMIT_COMPLETED', { source, queued });
      trackProductEvent('social.friend_request_sent', {
        source,
        entryMethod: 'qr_scan',
        queued,
      });
      onComplete();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not process QR invite.';
      const errorType = error instanceof Error ? error.name : 'unknown_error';
      trackObservabilityEvent('FRIEND_REQUEST_SEND_FAILED', {
        source,
        entryMethod: 'qr_scan',
        errorMessage: message,
        errorType,
        isOnline,
      });
      trackObservabilityEvent('QR_SCAN_SUBMIT_FAILED', {
        source,
        errorMessage: message,
        errorType,
      });
      setErrorMessage(message);
      setHasScanned(true);
    } finally {
      setIsSubmitting(false);
    }
  }, [friendWrites, isOnline, onComplete, ownFriendCode, source]);

  const handleBarcodeScanned = useCallback(async ({ data }: { data: string }) => {
    if (scanLockRef.current) {
      return;
    }

    scanLockRef.current = true;
    const normalizedCode = extractFriendCodeFromQrPayload(data);
    if (!normalizedCode) {
      trackObservabilityEvent('QR_SCAN_INVALID_CODE', { source });
      setErrorMessage('That QR code is not a Yummy Recs friend invite.');
      queueInvalidScanRetry();
      return;
    }

    trackObservabilityEvent('QR_SCAN_CODE_DETECTED', { source });
    setErrorMessage(null);
    setHasScanned(true);
    setScannedCode(normalizedCode);
    await submitScannedCode(normalizedCode);
  }, [queueInvalidScanRetry, source, submitScannedCode]);

  return {
    errorMessage,
    handleBarcodeScanned,
    hasScanned,
    isSubmitting,
    resetScanner,
    scannedCode,
  };
}
