import { useEffect } from 'react';
import { act, create } from 'react-test-renderer';
import { useQueryClient } from '@tanstack/react-query';

import {
  parseReceiptImage,
  type ReceiptScanDraftResult,
} from '../features/store/receiptParsingGateway';
import {
  useReceiptScanFlow,
  type ReceiptScanFlowController,
} from '../features/store/useReceiptScanFlow';
import {
  formatLimitExceededMessage,
  parseLimitExceededError,
} from '../features/store/usageLimitsGateway';
import { useImageSourcePicker } from '../hooks/useImageSourcePicker';
import { captureObservabilityError } from '../observability';
import { trackProductEvent } from '../observability/productAnalytics';

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: jest.fn(),
}));

jest.mock('../features/store/receiptParsingGateway', () => ({
  parseReceiptImage: jest.fn(),
}));

jest.mock('../features/store/usageLimitsGateway', () => ({
  formatLimitExceededMessage: jest.fn((payload) => payload.message),
  parseLimitExceededError: jest.fn(() => null),
}));

jest.mock('../hooks/useImageSourcePicker', () => ({
  useImageSourcePicker: jest.fn(),
}));

jest.mock('../observability', () => ({
  captureObservabilityError: jest.fn(),
  trackObservabilityEvent: jest.fn(),
}));

jest.mock('../observability/productAnalytics', () => ({
  trackProductEvent: jest.fn(),
}));

const mockedUseQueryClient = useQueryClient as jest.MockedFunction<typeof useQueryClient>;
const mockedUseImageSourcePicker = useImageSourcePicker as jest.MockedFunction<typeof useImageSourcePicker>;
const mockedParseReceiptImage = parseReceiptImage as jest.MockedFunction<typeof parseReceiptImage>;
const mockedCaptureObservabilityError = captureObservabilityError as jest.MockedFunction<
  typeof captureObservabilityError
>;
const mockedParseLimitExceededError = parseLimitExceededError as jest.MockedFunction<
  typeof parseLimitExceededError
>;
const mockedFormatLimitExceededMessage = formatLimitExceededMessage as jest.MockedFunction<
  typeof formatLimitExceededMessage
>;
const mockedTrackProductEvent = trackProductEvent as jest.MockedFunction<typeof trackProductEvent>;

const receiptResult: ReceiptScanDraftResult = {
  confidence: 'high',
  items: [{ confidence: 'high', name: 'Sparkling Water', price: 0.99 }],
  requestCorrelation: 'mobile-receipt-scan-test',
  warnings: [],
};

function renderHookProbe(onController: (controller: ReceiptScanFlowController) => void) {
  function Probe() {
    const controller = useReceiptScanFlow();

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

describe('useReceiptScanFlow', () => {
  let controller: ReceiptScanFlowController;
  let invalidateQueries: jest.Mock;
  let pickImageAssets: jest.Mock;

  beforeEach(() => {
    controller = undefined as unknown as ReceiptScanFlowController;
    invalidateQueries = jest.fn().mockResolvedValue(undefined);
    pickImageAssets = jest.fn();

    mockedUseQueryClient.mockReturnValue({
      invalidateQueries,
    } as never);
    mockedUseImageSourcePicker.mockReturnValue({
      permissionNeedsSettings: false,
      pickImageAssets,
      resetPermissionNeedsSettings: jest.fn(),
    } as never);
    mockedParseReceiptImage.mockResolvedValue(receiptResult);
    mockedParseLimitExceededError.mockReturnValue(null);
    mockedFormatLimitExceededMessage.mockClear();
    mockedTrackProductEvent.mockClear();
    jest.clearAllMocks();
  });

  it('uploads the picked receipt image directly without staging it first', async () => {
    pickImageAssets.mockResolvedValue({
      assets: [
        {
          fileName: 'receipt-original.jpg',
          mimeType: 'image/jpeg',
          uri: 'file:///receipt-original.jpg',
        },
      ],
      status: 'success',
    });

    renderHookProbe((nextController) => {
      controller = nextController;
    });

    await act(async () => {
      await controller.scanReceipt('gallery');
    });

    expect(mockedParseReceiptImage).toHaveBeenCalledWith(
      expect.objectContaining({
        mimeType: 'image/jpeg',
        name: 'receipt-original.jpg',
        requestCorrelation: expect.stringMatching(/^mobile-receipt-scan-/),
        uri: 'file:///receipt-original.jpg',
      }),
    );
    expect(controller.status).toBe('success');
  });

  it('treats picker failures before an image is selected as cancellation', async () => {
    pickImageAssets.mockRejectedValue(new Error('Something went wrong.'));

    renderHookProbe((nextController) => {
      controller = nextController;
    });

    await act(async () => {
      await controller.scanReceipt('gallery');
    });

    expect(mockedParseReceiptImage).not.toHaveBeenCalled();
    expect(mockedCaptureObservabilityError).not.toHaveBeenCalled();
    expect(controller.status).toBe('idle');
    expect(controller.errorMessage).toBeNull();
  });
});
