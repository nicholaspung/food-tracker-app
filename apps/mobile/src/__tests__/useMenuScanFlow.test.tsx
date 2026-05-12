import React, { useEffect } from 'react';
import { act, create } from 'react-test-renderer';
import { useQueryClient } from '@tanstack/react-query';

import { useMenuScanFlow, type MenuScanFlowController } from '../features/store/useMenuScanFlow';
import {
  createMenuItemsFromScan,
  parseMenuImage,
} from '../features/store/menuParsingGateway';
import {
  formatLimitExceededMessage,
  parseLimitExceededError,
} from '../features/store/usageLimitsGateway';
import { useImageSourcePicker } from '../hooks/useImageSourcePicker';
import { cleanupStagedPhotoFiles, stageLocalPhotoFile } from '../lib/photoStaging';
import { captureObservabilityError, trackObservabilityEvent } from '../observability';

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: jest.fn(),
}));

jest.mock('../features/store/menuParsingGateway', () => ({
  createMenuItemsFromScan: jest.fn(),
  parseMenuImage: jest.fn(),
}));

jest.mock('../features/store/usageLimitsGateway', () => ({
  formatLimitExceededMessage: jest.fn((payload) => payload.message),
  parseLimitExceededError: jest.fn(() => null),
}));

jest.mock('../hooks/useImageSourcePicker', () => ({
  useImageSourcePicker: jest.fn(),
}));

jest.mock('../lib/photoStaging', () => ({
  cleanupStagedPhotoFiles: jest.fn(),
  stageLocalPhotoFile: jest.fn(),
}));

jest.mock('../observability', () => ({
  captureObservabilityError: jest.fn(),
  trackObservabilityEvent: jest.fn(),
}));

jest.mock('../screens/photoProcessing/shared', () => ({
  parseMenuItemNamesFromCsv: jest.fn(() => ['Ramen']),
}));

const mockedUseQueryClient = useQueryClient as jest.MockedFunction<typeof useQueryClient>;
const mockedUseImageSourcePicker = useImageSourcePicker as jest.MockedFunction<typeof useImageSourcePicker>;
const mockedParseMenuImage = parseMenuImage as jest.MockedFunction<typeof parseMenuImage>;
const mockedCreateMenuItemsFromScan = createMenuItemsFromScan as jest.MockedFunction<
  typeof createMenuItemsFromScan
>;
const mockedStageLocalPhotoFile = stageLocalPhotoFile as jest.MockedFunction<typeof stageLocalPhotoFile>;
const mockedCleanupStagedPhotoFiles = cleanupStagedPhotoFiles as jest.MockedFunction<
  typeof cleanupStagedPhotoFiles
>;
const mockedTrackObservabilityEvent = trackObservabilityEvent as jest.MockedFunction<
  typeof trackObservabilityEvent
>;
const mockedCaptureObservabilityError = captureObservabilityError as jest.MockedFunction<
  typeof captureObservabilityError
>;
const mockedParseLimitExceededError = parseLimitExceededError as jest.MockedFunction<
  typeof parseLimitExceededError
>;
const mockedFormatLimitExceededMessage = formatLimitExceededMessage as jest.MockedFunction<
  typeof formatLimitExceededMessage
>;

function renderHookProbe(onController: (controller: MenuScanFlowController) => void) {
  function Probe() {
    const controller = useMenuScanFlow({
      analyticsSource: 'CreateVisitMenuScan',
      restaurantId: 'restaurant-1',
      restaurantName: 'Ichiran',
    });

    useEffect(() => {
      onController(controller);
    }, [controller]);

    return null;
  }

  let renderer: ReturnType<typeof create>;
  act(() => {
    renderer = create(<Probe />);
  });
  return renderer!;
}

describe('useMenuScanFlow', () => {
  let controller: MenuScanFlowController;
  let invalidateQueries: jest.Mock;
  let setQueryData: jest.Mock;
  let pickImageAssets: jest.Mock;

  beforeEach(() => {
    invalidateQueries = jest.fn().mockResolvedValue(undefined);
    setQueryData = jest.fn();
    pickImageAssets = jest.fn();
    controller = undefined as unknown as MenuScanFlowController;

    mockedUseQueryClient.mockReturnValue({
      invalidateQueries,
      setQueryData,
    } as never);
    mockedUseImageSourcePicker.mockReturnValue({
      permissionNeedsSettings: false,
      pickImageAssets,
      resetPermissionNeedsSettings: jest.fn(),
    } as never);
    mockedStageLocalPhotoFile.mockResolvedValue({
      mimeType: 'image/jpeg',
      name: 'menu.jpg',
      uri: 'file:///menu.jpg',
    });
    mockedCleanupStagedPhotoFiles.mockResolvedValue(undefined);
    mockedParseMenuImage.mockResolvedValue({
      csv: 'menu_item,price\nRamen,12',
      sourceImageId: 'menu-image-1',
      verification: {
        checked: true,
        confidence: 'high',
        matched: true,
        observedRestaurantNames: ['Ichiran'],
      },
    });
    mockedCreateMenuItemsFromScan.mockResolvedValue({
      createdItems: [{ id: 'item-1', name: 'Ramen' } as never],
      existingItems: [],
    });
    mockedParseLimitExceededError.mockReturnValue(null);
    jest.clearAllMocks();
  });

  it('scans a picked image and records success observability', async () => {
    pickImageAssets.mockResolvedValue({
      assets: [{ uri: 'file:///picked.jpg' }],
      status: 'picked',
    });

    renderHookProbe((nextController) => {
      controller = nextController;
    });

    await act(async () => {
      await controller.scanMenu('camera');
    });

    expect(mockedParseMenuImage).toHaveBeenCalledWith(
      expect.objectContaining({
        requestCorrelation: expect.stringMatching(/^mobile-menu-scan-/),
        restaurantId: 'restaurant-1',
        restaurantName: 'Ichiran',
      }),
    );
    expect(mockedCreateMenuItemsFromScan).toHaveBeenCalledWith({
      fallbackLabel: 'menu.jpg',
      itemNames: ['Ramen'],
      restaurantId: 'restaurant-1',
      sourceImageId: 'menu-image-1',
    });
    expect(setQueryData).toHaveBeenCalled();
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['feature', 'menuItems', 'restaurant-1'],
    });
    expect(mockedTrackObservabilityEvent).toHaveBeenCalledWith(
      'MENU_SCAN_STARTED',
      expect.objectContaining({ analyticsSource: 'CreateVisitMenuScan', photoSource: 'camera' }),
    );
    expect(mockedTrackObservabilityEvent).toHaveBeenCalledWith(
      'MENU_SCAN_SUCCEEDED',
      expect.objectContaining({ createdCount: 1, existingCount: 0, verificationMatched: true }),
    );
    expect(mockedCleanupStagedPhotoFiles).toHaveBeenCalledWith([
      expect.objectContaining({ name: 'menu.jpg' }),
    ]);
  });

  it('captures caught scan failures with menu-specific observability', async () => {
    const error = new Error('failed to parse menu with Gemini');
    pickImageAssets.mockResolvedValue({
      assets: [{ uri: 'file:///picked.jpg' }],
      status: 'picked',
    });
    mockedParseMenuImage.mockRejectedValue(error);

    renderHookProbe((nextController) => {
      controller = nextController;
    });

    await act(async () => {
      await controller.scanMenu('gallery');
    });

    expect(mockedTrackObservabilityEvent).toHaveBeenCalledWith(
      'MENU_SCAN_FAILED',
      expect.objectContaining({
        errorMessage: 'failed to parse menu with Gemini',
        photoSource: 'gallery',
      }),
    );
    expect(mockedCaptureObservabilityError).toHaveBeenCalledWith(
      error,
      expect.objectContaining({ analyticsSource: 'CreateVisitMenuScan' }),
    );
    expect(controller.errorMessage).toBe('failed to parse menu with Gemini');
    expect(mockedCleanupStagedPhotoFiles).toHaveBeenCalled();
  });

  it('tracks permission denial without parsing or exception capture', async () => {
    pickImageAssets.mockResolvedValue({
      canAskAgain: false,
      message: 'Camera permission is blocked.',
      status: 'permission_denied',
    });

    renderHookProbe((nextController) => {
      controller = nextController;
    });

    await act(async () => {
      await controller.scanMenu('camera');
    });

    expect(mockedTrackObservabilityEvent).toHaveBeenCalledWith(
      'MENU_SCAN_IMAGE_PERMISSION_DENIED',
      expect.objectContaining({ canAskAgain: false }),
    );
    expect(mockedParseMenuImage).not.toHaveBeenCalled();
    expect(mockedCaptureObservabilityError).not.toHaveBeenCalled();
  });

  it('tracks picker cancellation and leaves the flow idle', async () => {
    pickImageAssets.mockResolvedValue({ status: 'canceled' });

    renderHookProbe((nextController) => {
      controller = nextController;
    });

    await act(async () => {
      await controller.scanMenu('gallery');
    });

    expect(mockedTrackObservabilityEvent).toHaveBeenCalledWith(
      'MENU_SCAN_IMAGE_PICK_CANCELED',
      expect.objectContaining({ photoSource: 'gallery' }),
    );
    expect(mockedParseMenuImage).not.toHaveBeenCalled();
    expect(controller.status).toBe('idle');
  });

  it('tracks usage limits without exception capture', async () => {
    const error = new Error('limit');
    const limitPayload = {
      code: 'LIMIT_EXCEEDED',
      limit: 5,
      message: 'Menu scan limit reached for this month (5).',
      metric: 'menu_scans',
      monthKey: '2026-05',
      remaining: 0,
      success: false,
      used: 5,
      userTier: 'free',
    } as const;
    pickImageAssets.mockResolvedValue({
      assets: [{ uri: 'file:///picked.jpg' }],
      status: 'picked',
    });
    mockedParseMenuImage.mockRejectedValue(error);
    mockedParseLimitExceededError.mockReturnValue(limitPayload);

    renderHookProbe((nextController) => {
      controller = nextController;
    });

    await act(async () => {
      await controller.scanMenu('gallery');
    });

    expect(mockedTrackObservabilityEvent).toHaveBeenCalledWith(
      'USAGE_LIMIT_REACHED',
      expect.objectContaining({ metric: 'menu_scans', source: 'CreateVisitMenuScan' }),
    );
    expect(mockedFormatLimitExceededMessage).toHaveBeenCalledWith(limitPayload);
    expect(mockedCaptureObservabilityError).not.toHaveBeenCalled();
  });
});
