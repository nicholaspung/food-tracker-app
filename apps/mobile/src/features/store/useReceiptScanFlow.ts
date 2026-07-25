import { useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import type { PhotoPickerPermissionSource } from '../../hooks/usePhotoPickerPermissions';
import { useImageSourcePicker } from '../../hooks/useImageSourcePicker';
import { buildLocalPhotoFile } from '../../lib/photoFiles';
import { captureObservabilityError, trackObservabilityEvent, type EventProperties } from '../../observability';
import { trackProductEvent } from '../../observability/productAnalytics';
import { createAIRequestCorrelation, resolveAIImageErrorProperties } from './aiImageObservability';
import { parseReceiptImage, type ReceiptScanDraftResult } from './receiptParsingGateway';
import { formatLimitExceededMessage, parseLimitExceededError } from './usageLimitsGateway';
import { usageQueryKeys } from './usageQuery';

export type ReceiptScanSource = PhotoPickerPermissionSource;
export type ReceiptScanFlowStatus = 'idle' | 'selecting' | 'processing' | 'success' | 'error';

export interface ReceiptScanFlowController {
  status: ReceiptScanFlowStatus;
  errorMessage: string | null;
  permissionNeedsSettings: boolean;
  lastRequestedSource: ReceiptScanSource;
  selectedImageName: string;
  result: ReceiptScanDraftResult | null;
  scanReceipt: (source: ReceiptScanSource) => Promise<ReceiptScanDraftResult | null>;
  reset: () => void;
}

function buildBaseEventProperties(input: {
  source: ReceiptScanSource;
  requestCorrelation: string;
}): EventProperties {
  return {
    analyticsSource: 'ReceiptScan',
    photoSource: input.source,
    requestCorrelation: input.requestCorrelation,
  };
}

function isNotReceiptImageError(input: {
  message: string;
  statusCode: unknown;
}): boolean {
  if (input.statusCode !== 400) {
    return false;
  }

  const normalizedMessage = input.message.toLowerCase();
  return normalizedMessage.includes('not a receipt') || normalizedMessage.includes('image is not a receipt');
}

function isGenericTransportFailure(input: EventProperties): boolean {
  return input.statusCode === null && input.errorMessage === 'Something went wrong.';
}

export function useReceiptScanFlow(): ReceiptScanFlowController {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<ReceiptScanFlowStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastRequestedSource, setLastRequestedSource] = useState<ReceiptScanSource>('gallery');
  const [selectedImageName, setSelectedImageName] = useState('');
  const [result, setResult] = useState<ReceiptScanDraftResult | null>(null);

  const { permissionNeedsSettings, pickImageAssets } = useImageSourcePicker({
    cameraBlockedMessage: 'Camera permission is blocked. Enable it in device settings.',
    cameraRequiredMessage: 'Camera permission is required to take a receipt photo.',
    galleryBlockedMessage: 'Photo library permission is blocked. Enable it in device settings.',
    galleryRequiredMessage: 'Photo library permission is required to upload a receipt image.',
  });

  const reset = useCallback(() => {
    setStatus('idle');
    setErrorMessage(null);
    setSelectedImageName('');
    setResult(null);
  }, []);

  const scanReceipt = useCallback(
    async (source: ReceiptScanSource): Promise<ReceiptScanDraftResult | null> => {
      const requestCorrelation = createAIRequestCorrelation('receipt-scan');
      const eventProperties = buildBaseEventProperties({ requestCorrelation, source });

      setStatus('selecting');
      setErrorMessage(null);
      setSelectedImageName('');
      setResult(null);
      setLastRequestedSource(source);

      trackObservabilityEvent('RECEIPT_SCAN_STARTED', eventProperties);

      let hasPickedImage = false;
      try {
        const pickResult = await pickImageAssets({ source, quality: 1 });
        if (pickResult.status === 'permission_denied') {
          trackObservabilityEvent('RECEIPT_SCAN_IMAGE_PERMISSION_DENIED', {
            ...eventProperties,
            canAskAgain: pickResult.canAskAgain,
          });
          setErrorMessage(pickResult.message);
          setStatus('error');
          return null;
        }

        if (pickResult.status === 'canceled') {
          trackObservabilityEvent('RECEIPT_SCAN_IMAGE_PICK_CANCELED', eventProperties);
          setStatus('idle');
          return null;
        }

        hasPickedImage = true;
        const pickedAsset = pickResult.assets[0];
        const fallbackPrefix = source === 'camera' ? 'receipt-camera' : 'receipt-image';
        const imageInput = buildLocalPhotoFile(pickedAsset, {
          fallbackPrefix,
        });
        if (!imageInput) {
          throw new Error('Could not prepare the selected receipt image.');
        }

        setSelectedImageName(imageInput.name);
        setStatus('processing');

        const scanResult = await parseReceiptImage({
          ...imageInput,
          requestCorrelation,
        });

        setResult(scanResult);
        setStatus('success');
        trackObservabilityEvent('RECEIPT_SCAN_SUCCEEDED', {
          ...eventProperties,
          confidence: scanResult.confidence,
          itemCount: scanResult.items.length,
          warningCount: scanResult.warnings.length,
        });
        return scanResult;
      } catch (error) {
        if (!hasPickedImage) {
          trackObservabilityEvent('RECEIPT_SCAN_IMAGE_PICK_CANCELED', {
            ...eventProperties,
            errorMessage: error instanceof Error ? error.message : String(error),
          });
          setStatus('idle');
          return null;
        }

        const limitPayload = parseLimitExceededError(error);
        if (limitPayload) {
          trackObservabilityEvent('USAGE_LIMIT_REACHED', {
            enforcement: 'server',
            limit: limitPayload.limit,
            metric: limitPayload.metric,
            monthKey: limitPayload.monthKey,
            remaining: limitPayload.remaining,
            source: 'ReceiptScan',
            used: limitPayload.used,
            userTier: limitPayload.userTier ?? null,
          });
          trackProductEvent('quality.usage_limit_reached', {
            enforcement: 'server',
            limit: limitPayload.limit,
            metric: limitPayload.metric,
            monthKey: limitPayload.monthKey,
            remaining: limitPayload.remaining,
            source: 'ReceiptScan',
            used: limitPayload.used,
            userTier: limitPayload.userTier ?? null,
          });
        }

        const resolvedErrorProperties = resolveAIImageErrorProperties(error);
        const message = limitPayload
          ? formatLimitExceededMessage(limitPayload)
          : isGenericTransportFailure(resolvedErrorProperties)
            ? 'Could not upload the receipt image before scanning started. Try again or choose a different image source.'
          : typeof resolvedErrorProperties.errorMessage === 'string'
            ? resolvedErrorProperties.errorMessage
            : 'Could not scan this receipt.';

        trackObservabilityEvent('RECEIPT_SCAN_FAILED', {
          ...eventProperties,
          ...resolvedErrorProperties,
          errorMessage: message,
        });

        if (!limitPayload) {
          captureObservabilityError(error, {
            ...eventProperties,
            ...resolvedErrorProperties,
            source: 'ReceiptScan',
          });
        }

        setErrorMessage(message);
        setStatus(
          isNotReceiptImageError({
            message,
            statusCode: resolvedErrorProperties.statusCode,
          })
            ? 'idle'
            : 'error',
        );
        return null;
      } finally {
        void queryClient.invalidateQueries({ queryKey: usageQueryKeys.monthlyRoot });
      }
    },
    [pickImageAssets, queryClient],
  );

  return {
    status,
    errorMessage,
    permissionNeedsSettings,
    lastRequestedSource,
    selectedImageName,
    result,
    scanReceipt,
    reset,
  };
}
