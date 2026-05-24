import { useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import type { PhotoPickerPermissionSource } from '../../hooks/usePhotoPickerPermissions';
import { useImageSourcePicker } from '../../hooks/useImageSourcePicker';
import { cleanupStagedPhotoFiles, stageLocalPhotoFile } from '../../lib/photoStaging';
import { captureObservabilityError, trackObservabilityEvent, type EventProperties } from '../../observability';
import { trackProductEvent } from '../../observability/productAnalytics';
import { parseMenuItemNamesFromCsv } from '../photoProcessing/menuItemCsvParsing';
import type { MenuItemRecord } from './featureStore';
import {
  createMenuItemsFromScan,
  parseMenuImage,
} from './menuParsingGateway';
import { formatLimitExceededMessage, parseLimitExceededError } from './usageLimitsGateway';
import { createAIRequestCorrelation, resolveAIImageErrorProperties } from './aiImageObservability';
import { useMenuItemCatalogWrites } from './useMenuItemCatalogWrites';

export type MenuScanSource = PhotoPickerPermissionSource;

export type MenuScanFlowStatus = 'idle' | 'selecting' | 'processing' | 'success' | 'error';

export interface MenuScanFlowResult {
  createdItems: MenuItemRecord[];
  existingItems: MenuItemRecord[];
  createdItemNames: string[];
  existingItemNames: string[];
  verification: Awaited<ReturnType<typeof parseMenuImage>>['verification'] | null;
  requestCorrelation: string;
}

export interface MenuScanFlowOptions {
  restaurantId: string;
  restaurantName?: string;
  analyticsSource: 'CreateVisitMenuScan' | 'FoodDiscoveryRestaurant';
  fallbackPrefix?: string;
  onSuccess?: (result: MenuScanFlowResult) => void | Promise<void>;
}

export interface MenuScanFlowController {
  status: MenuScanFlowStatus;
  errorMessage: string | null;
  permissionNeedsSettings: boolean;
  createdItemNames: string[];
  existingItemNames: string[];
  verification: MenuScanFlowResult['verification'];
  lastRequestedSource: MenuScanSource;
  selectedImageName: string;
  scanMenu: (source: MenuScanSource) => Promise<MenuScanFlowResult | null>;
  reset: () => void;
}

function buildBaseEventProperties(input: {
  analyticsSource: MenuScanFlowOptions['analyticsSource'];
  source: MenuScanSource;
  requestCorrelation: string;
}): EventProperties {
  return {
    analyticsSource: input.analyticsSource,
    photoSource: input.source,
    requestCorrelation: input.requestCorrelation,
  };
}

function isNotMenuImageError(input: {
  message: string;
  statusCode: unknown;
}): boolean {
  if (input.statusCode !== 400) {
    return false;
  }

  const normalizedMessage = input.message.toLowerCase();
  return (
    normalizedMessage.includes('not a menu') ||
    normalizedMessage.includes('not a menu image') ||
    normalizedMessage.includes('image is not a menu')
  );
}

export function useMenuScanFlow(options: MenuScanFlowOptions): MenuScanFlowController {
  const queryClient = useQueryClient();
  const menuItemCatalogWrites = useMenuItemCatalogWrites();
  const [status, setStatus] = useState<MenuScanFlowStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [createdItemNames, setCreatedItemNames] = useState<string[]>([]);
  const [existingItemNames, setExistingItemNames] = useState<string[]>([]);
  const [verification, setVerification] = useState<MenuScanFlowResult['verification']>(null);
  const [lastRequestedSource, setLastRequestedSource] = useState<MenuScanSource>('gallery');
  const [selectedImageName, setSelectedImageName] = useState('');

  const { permissionNeedsSettings, pickImageAssets } = useImageSourcePicker({
    cameraBlockedMessage: 'Camera permission is blocked. Enable it in device settings.',
    cameraRequiredMessage: 'Camera permission is required to take a photo.',
    galleryBlockedMessage: 'Photo library permission is blocked. Enable it in device settings.',
    galleryRequiredMessage: 'Photo library permission is required to upload an image.',
  });

  const reset = useCallback(() => {
    setStatus('idle');
    setErrorMessage(null);
    setCreatedItemNames([]);
    setExistingItemNames([]);
    setVerification(null);
    setSelectedImageName('');
  }, []);

  const scanMenu = useCallback(
    async (source: MenuScanSource): Promise<MenuScanFlowResult | null> => {
      const requestCorrelation = createAIRequestCorrelation('menu-scan');
      const eventProperties = buildBaseEventProperties({
        analyticsSource: options.analyticsSource,
        requestCorrelation,
        source,
      });

      setStatus('selecting');
      setErrorMessage(null);
      setCreatedItemNames([]);
      setExistingItemNames([]);
      setVerification(null);
      setSelectedImageName('');
      setLastRequestedSource(source);

      trackObservabilityEvent('MENU_SCAN_STARTED', eventProperties);

      let imageInput: Awaited<ReturnType<typeof stageLocalPhotoFile>> | null = null;
      try {
        const pickResult = await pickImageAssets({ source });
        if (pickResult.status === 'permission_denied') {
          trackObservabilityEvent('MENU_SCAN_IMAGE_PERMISSION_DENIED', {
            ...eventProperties,
            canAskAgain: pickResult.canAskAgain,
          });
          setErrorMessage(pickResult.message);
          setStatus('error');
          return null;
        }

        if (pickResult.status === 'canceled') {
          trackObservabilityEvent('MENU_SCAN_IMAGE_PICK_CANCELED', eventProperties);
          setStatus('idle');
          return null;
        }

        imageInput = await stageLocalPhotoFile(pickResult.assets[0], {
          fallbackPrefix:
            options.fallbackPrefix ?? (source === 'camera' ? 'menu-camera' : 'menu-image'),
          maxLongEdge: 2048,
        });
        if (!imageInput) {
          throw new Error('Could not prepare the selected image.');
        }

        setSelectedImageName(imageInput.name);
        setStatus('processing');

        const parseResult = await parseMenuImage({
          ...imageInput,
          restaurantId: options.restaurantId,
          restaurantName: options.restaurantName,
          requestCorrelation,
        });
        const itemNames = parseMenuItemNamesFromCsv(parseResult.csv);
        trackObservabilityEvent('MENU_SCAN_PARSE_SUCCEEDED', {
          ...eventProperties,
          itemCount: itemNames.length,
          verificationConfidence: parseResult.verification?.confidence ?? null,
          verificationMatched: parseResult.verification?.matched ?? null,
        });

        const result = await createMenuItemsFromScan({
          restaurantId: options.restaurantId,
          itemNames,
          fallbackLabel: imageInput.name,
          sourceImageId: parseResult.sourceImageId,
        });
        const returnedRecords = [...result.createdItems, ...result.existingItems];

        await menuItemCatalogWrites.applyScannedMenuItems({
          items: returnedRecords,
          restaurantId: options.restaurantId,
        });

        const flowResult: MenuScanFlowResult = {
          createdItems: result.createdItems,
          existingItems: result.existingItems,
          createdItemNames: result.createdItems.map((item) => item.name),
          existingItemNames: result.existingItems.map((item) => item.name),
          verification: parseResult.verification ?? null,
          requestCorrelation,
        };

        setCreatedItemNames(flowResult.createdItemNames);
        setExistingItemNames(flowResult.existingItemNames);
        setVerification(flowResult.verification);
        setStatus('success');

        trackObservabilityEvent('MENU_SCAN_CREATE_ITEMS_SUCCEEDED', {
          ...eventProperties,
          createdCount: flowResult.createdItems.length,
          existingCount: flowResult.existingItems.length,
        });
        trackObservabilityEvent('MENU_SCAN_SUCCEEDED', {
          ...eventProperties,
          createdCount: flowResult.createdItems.length,
          existingCount: flowResult.existingItems.length,
          verificationConfidence: flowResult.verification?.confidence ?? null,
          verificationMatched: flowResult.verification?.matched ?? null,
        });

        await options.onSuccess?.(flowResult);
        return flowResult;
      } catch (error) {
        const limitPayload = parseLimitExceededError(error);
        if (limitPayload) {
          trackObservabilityEvent('USAGE_LIMIT_REACHED', {
            enforcement: 'server',
            limit: limitPayload.limit,
            metric: limitPayload.metric,
            monthKey: limitPayload.monthKey,
            remaining: limitPayload.remaining,
            source: options.analyticsSource,
            used: limitPayload.used,
            userTier: limitPayload.userTier ?? null,
          });
          trackProductEvent('quality.usage_limit_reached', {
            enforcement: 'server',
            limit: limitPayload.limit,
            metric: limitPayload.metric,
            monthKey: limitPayload.monthKey,
            remaining: limitPayload.remaining,
            source: options.analyticsSource,
            used: limitPayload.used,
            userTier: limitPayload.userTier ?? null,
          });
        }

        const resolvedErrorProperties = resolveAIImageErrorProperties(error);
        const message = limitPayload
          ? formatLimitExceededMessage(limitPayload)
          : typeof resolvedErrorProperties.errorMessage === 'string'
            ? resolvedErrorProperties.errorMessage
            : 'Could not scan this menu.';

        trackObservabilityEvent('MENU_SCAN_FAILED', {
          ...eventProperties,
          ...resolvedErrorProperties,
          errorMessage: message,
        });

        if (!limitPayload) {
          captureObservabilityError(error, {
            ...eventProperties,
            ...resolvedErrorProperties,
            source: options.analyticsSource,
          });
        }

        setErrorMessage(message);
        setStatus(
          isNotMenuImageError({
            message,
            statusCode: resolvedErrorProperties.statusCode,
          })
            ? 'idle'
            : 'error',
        );
        return null;
      } finally {
        if (imageInput) {
          await cleanupStagedPhotoFiles([imageInput]);
        }
        void queryClient.invalidateQueries({ queryKey: ['feature', 'usage', 'monthly'] });
      }
    },
    [menuItemCatalogWrites, options, pickImageAssets, queryClient],
  );

  return {
    status,
    errorMessage,
    permissionNeedsSettings,
    createdItemNames,
    existingItemNames,
    verification,
    lastRequestedSource,
    selectedImageName,
    scanMenu,
    reset,
  };
}
