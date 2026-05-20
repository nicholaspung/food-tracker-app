import { useCallback, useState } from 'react';
import type { QueryClient } from '@tanstack/react-query';

import {
  deleteVisit,
  homeFeedQueryKeys,
  invalidateHomeFeedQueries,
  moveVisitItem,
  reportContent,
  syncVisitMutationCaches,
  type ContentReportReasonCode,
  type HomeFeedInfiniteData,
  type VisitRecord,
  visitsQueryKeys,
} from '../../features';
import { moveVisitItemApiMutationInput } from '../../features/store/featureOutboxOperations';
import { useFoodProductWrites } from '../../features/store/useFoodProductWrites';
import type { OfflineAwareFeatureWrite } from '../../features/store/useOfflineAwareFeatureWrite';
import { showQueuedOfflineAlert } from '../../lib/offlineAlerts';
import { buildPhotoViewerState } from '../../lib/photoUrls';
import { trackObservabilityEvent } from '../../observability';
import type {
  PendingDeleteTarget,
  PendingMoveVisitItem,
  PendingReportTarget,
  VisitPhotoRecord,
} from './shared';

interface UseHomeFeedActionControllerParams {
  isOnline: boolean;
  queryClient: QueryClient;
  trackWriteTelemetry: (operationName: string) => Promise<void>;
  writeFeature: OfflineAwareFeatureWrite;
}

type VisitItemRecord = VisitRecord['items'][number];

function removeVisitItem(visit: VisitRecord, itemId: string): VisitRecord {
  return {
    ...visit,
    items: visit.items.filter((item) => item.id !== itemId),
  };
}

function appendVisitItem(visit: VisitRecord, item: VisitItemRecord): VisitRecord {
  if (visit.items.some((existingItem) => existingItem.id === item.id)) {
    return visit;
  }

  return {
    ...visit,
    items: [...visit.items, item],
  };
}

function patchVisitRecordForMovedItem(
  visit: VisitRecord | null | undefined,
  pendingMoveItem: PendingMoveVisitItem,
  destinationVisit: VisitRecord,
): VisitRecord | null | undefined {
  if (!visit) {
    return visit;
  }

  if (visit.id === pendingMoveItem.sourceVisitId) {
    return removeVisitItem(visit, pendingMoveItem.item.id);
  }

  if (visit.id === destinationVisit.id) {
    return appendVisitItem(visit, pendingMoveItem.item);
  }

  return visit;
}

function patchHomeFeedDataForMovedItem(
  currentData: HomeFeedInfiniteData | undefined,
  pendingMoveItem: PendingMoveVisitItem,
  destinationVisit: VisitRecord,
): HomeFeedInfiniteData | undefined {
  if (!currentData) {
    return currentData;
  }

  return {
    ...currentData,
    pages: currentData.pages.map((page) => ({
      ...page,
      items: page.items.map((entry) => {
        if (entry.source !== 'visit') {
          return entry;
        }

        if (entry.visit.id === pendingMoveItem.sourceVisitId) {
          return {
            ...entry,
            visit: removeVisitItem(entry.visit, pendingMoveItem.item.id),
          };
        }

        if (entry.visit.id === destinationVisit.id) {
          return {
            ...entry,
            visit: appendVisitItem(entry.visit, pendingMoveItem.item),
          };
        }

        return entry;
      }),
    })),
  };
}

export interface HomeFeedActionController {
  deleteErrorMessage: string | null;
  isDeletingTarget: boolean;
  isMovingVisitItem: boolean;
  isPhotoViewerVisible: boolean;
  isSubmittingReport: boolean;
  moveErrorMessage: string | null;
  pendingDeleteTarget: PendingDeleteTarget | null;
  pendingMoveItem: PendingMoveVisitItem | null;
  pendingReportMenuTarget: PendingReportTarget | null;
  pendingReportTarget: PendingReportTarget | null;
  photoViewerInitialIndex: number;
  photoViewerPreviewUrls: string[];
  photoViewerUrls: string[];
  reportErrorMessage: string | null;
  reportNotes: string;
  reportReasonCode: ContentReportReasonCode | null;
  changeReportNotes: (value: string) => void;
  changeReportReasonCode: (value: ContentReportReasonCode) => void;
  closeDeleteModal: () => void;
  closeMoveVisitItemModal: () => void;
  closePhotoViewer: () => void;
  closeReportMenu: () => void;
  closeReportModal: () => void;
  confirmDeleteTarget: () => Promise<void>;
  confirmMoveVisitItem: (destinationVisit: VisitRecord) => Promise<void>;
  openPhotoViewer: (photos: VisitPhotoRecord[], initialIndex?: number) => void;
  openReportModalFromMenu: () => void;
  promptDeleteFoodProduct: (foodProductId: string, itemName: string) => void;
  promptDeleteVisit: (visitId: string, itemName: string) => void;
  promptMoveVisitItem: (target: PendingMoveVisitItem) => void;
  promptReportMenuTarget: (target: PendingReportTarget) => void;
  submitReport: () => Promise<void>;
}

export function useHomeFeedActionController({
  isOnline,
  queryClient,
  trackWriteTelemetry,
  writeFeature,
}: UseHomeFeedActionControllerParams): HomeFeedActionController {
  const [photoViewerUrls, setPhotoViewerUrls] = useState<string[]>([]);
  const [photoViewerPreviewUrls, setPhotoViewerPreviewUrls] = useState<string[]>(
    [],
  );
  const [photoViewerInitialIndex, setPhotoViewerInitialIndex] = useState(0);
  const [isPhotoViewerVisible, setIsPhotoViewerVisible] = useState(false);
  const [pendingDeleteTarget, setPendingDeleteTarget] =
    useState<PendingDeleteTarget | null>(null);
  const [isDeletingTarget, setIsDeletingTarget] = useState(false);
  const [deleteErrorMessage, setDeleteErrorMessage] = useState<string | null>(
    null,
  );
  const [pendingMoveItem, setPendingMoveItem] =
    useState<PendingMoveVisitItem | null>(null);
  const [isMovingVisitItem, setIsMovingVisitItem] = useState(false);
  const [moveErrorMessage, setMoveErrorMessage] = useState<string | null>(null);
  const [pendingReportMenuTarget, setPendingReportMenuTarget] =
    useState<PendingReportTarget | null>(null);
  const [pendingReportTarget, setPendingReportTarget] =
    useState<PendingReportTarget | null>(null);
  const [reportReasonCode, setReportReasonCode] =
    useState<ContentReportReasonCode | null>(null);
  const [reportNotes, setReportNotes] = useState('');
  const [reportErrorMessage, setReportErrorMessage] = useState<string | null>(
    null,
  );
  const [isSubmittingReport, setIsSubmittingReport] = useState(false);
  const foodProductWrites = useFoodProductWrites();

  const invalidateHomeFeed = useCallback(async () => {
    await invalidateHomeFeedQueries(queryClient);
  }, [queryClient]);

  const invalidateMoveVisitItemQueries = useCallback(
    async (sourceVisitId: string, destinationVisitId: string) => {
      await Promise.all([
        invalidateHomeFeedQueries(queryClient),
        queryClient.invalidateQueries({ queryKey: visitsQueryKeys.root }),
        queryClient.invalidateQueries({
          queryKey: ['feature', 'visit', sourceVisitId],
        }),
        queryClient.invalidateQueries({
          queryKey: ['feature', 'visit', destinationVisitId],
        }),
        queryClient.invalidateQueries({ queryKey: ['feature', 'visitPhotos'] }),
      ]);
    },
    [queryClient],
  );

  const handleDeleteFoodProduct = useCallback(
    async (foodProductId: string) => {
      const deleteResult = await foodProductWrites.deleteFoodProduct({ foodProductId });

      if (deleteResult.status === 'queued') {
        trackObservabilityEvent('HOME_FEED_DELETE_SUCCEEDED', {
          source: 'HomeFeedActionController',
          contentType: 'food-product',
          queued: true,
        });
        return;
      }

      trackObservabilityEvent('HOME_FEED_DELETE_SUCCEEDED', {
        source: 'HomeFeedActionController',
        contentType: 'food-product',
        queued: false,
      });
    },
    [foodProductWrites],
  );

  const handleDeleteVisit = useCallback(
    async (visitId: string) => {
      const deleteResult = await writeFeature({
        operationName: 'visit.delete',
        offline: {
          strategy: 'outbox',
          payload: { visitId },
        },
        execute: () => deleteVisit(visitId),
      });

      if (deleteResult.status === 'queued') {
        await syncVisitMutationCaches(queryClient, {
          visitId,
          includeVisitPhotos: true,
        });
        trackObservabilityEvent('HOME_FEED_DELETE_SUCCEEDED', {
          source: 'HomeFeedActionController',
          contentType: 'visit',
          queued: true,
        });
        showQueuedOfflineAlert('Visit delete');
        return;
      }

      await syncVisitMutationCaches(queryClient, {
        visitId,
        includeVisitPhotos: true,
      });
      trackObservabilityEvent('HOME_FEED_DELETE_SUCCEEDED', {
        source: 'HomeFeedActionController',
        contentType: 'visit',
        queued: false,
      });
    },
    [queryClient, writeFeature],
  );

  const promptDeleteFoodProduct = useCallback(
    (foodProductId: string, itemName: string) => {
      trackObservabilityEvent('HOME_FEED_DELETE_TAPPED', {
        source: 'HomeFeedActionController',
        contentType: 'food-product',
        isOnline,
      });
      setDeleteErrorMessage(null);
      setPendingDeleteTarget({
        id: foodProductId,
        itemName,
        kind: 'food-product',
      });
    },
    [isOnline],
  );

  const promptDeleteVisit = useCallback((visitId: string, itemName: string) => {
    trackObservabilityEvent('HOME_FEED_DELETE_TAPPED', {
      source: 'HomeFeedActionController',
      contentType: 'visit',
      isOnline,
    });
    setDeleteErrorMessage(null);
    setPendingDeleteTarget({
      id: visitId,
      itemName,
      kind: 'visit',
    });
  }, [isOnline]);

  const promptMoveVisitItem = useCallback((target: PendingMoveVisitItem) => {
    trackObservabilityEvent('HOME_FEED_MOVE_ITEM_TAPPED', {
      source: 'HomeFeedActionController',
      isOnline,
    });
    setMoveErrorMessage(null);
    setPendingMoveItem(target);
  }, [isOnline]);

  const closeDeleteModal = useCallback(() => {
    if (isDeletingTarget) {
      return;
    }

    setPendingDeleteTarget(null);
  }, [isDeletingTarget]);

  const closeMoveVisitItemModal = useCallback(() => {
    if (isMovingVisitItem) {
      return;
    }

    setPendingMoveItem(null);
    setMoveErrorMessage(null);
  }, [isMovingVisitItem]);

  const confirmDeleteTarget = useCallback(async () => {
    if (!pendingDeleteTarget || isDeletingTarget) {
      return;
    }

    trackObservabilityEvent('HOME_FEED_DELETE_CONFIRMED', {
      source: 'HomeFeedActionController',
      contentType: pendingDeleteTarget.kind,
      isOnline,
    });
    setIsDeletingTarget(true);

    try {
      if (pendingDeleteTarget.kind === 'visit') {
        await handleDeleteVisit(pendingDeleteTarget.id);
      } else {
        await handleDeleteFoodProduct(pendingDeleteTarget.id);
      }

      setPendingDeleteTarget(null);
      setDeleteErrorMessage(null);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : pendingDeleteTarget.kind === 'visit'
            ? 'Could not delete visit.'
            : 'Could not delete food product.';
      trackObservabilityEvent('HOME_FEED_DELETE_FAILED', {
        source: 'HomeFeedActionController',
        contentType: pendingDeleteTarget.kind,
        errorMessage: message,
        errorType: error instanceof Error ? error.name : 'unknown_error',
        isOnline,
      });
      setDeleteErrorMessage(message);
    } finally {
      setIsDeletingTarget(false);
    }
  }, [
    handleDeleteFoodProduct,
    handleDeleteVisit,
    isDeletingTarget,
    isOnline,
    pendingDeleteTarget,
  ]);

  const confirmMoveVisitItem = useCallback(
    async (destinationVisit: VisitRecord) => {
      if (!pendingMoveItem || isMovingVisitItem) {
        return;
      }

      if (pendingMoveItem.sourceVisitId === destinationVisit.id) {
        return;
      }

      const sourceVisitQueryKey = [
        'feature',
        'visit',
        pendingMoveItem.sourceVisitId,
      ] as const;
      const destinationVisitQueryKey = [
        'feature',
        'visit',
        destinationVisit.id,
      ] as const;
      const homeFeedSnapshots = queryClient.getQueriesData<HomeFeedInfiniteData>({
        queryKey: homeFeedQueryKeys.root,
      });
      const sourceVisitSnapshot =
        queryClient.getQueryData<VisitRecord | null>(sourceVisitQueryKey);
      const destinationVisitSnapshot =
        queryClient.getQueryData<VisitRecord | null>(destinationVisitQueryKey);

      setMoveErrorMessage(null);
      trackObservabilityEvent('HOME_FEED_MOVE_ITEM_STARTED', {
        source: 'HomeFeedActionController',
        isOnline,
      });
      setIsMovingVisitItem(true);

      queryClient.setQueriesData<HomeFeedInfiniteData>(
        { queryKey: homeFeedQueryKeys.root },
        (currentData) =>
          patchHomeFeedDataForMovedItem(
            currentData,
            pendingMoveItem,
            destinationVisit,
          ),
      );

      if (sourceVisitSnapshot !== undefined) {
        queryClient.setQueryData<VisitRecord | null>(
          sourceVisitQueryKey,
          patchVisitRecordForMovedItem(
            sourceVisitSnapshot,
            pendingMoveItem,
            destinationVisit,
          ),
        );
      }

      if (destinationVisitSnapshot !== undefined) {
        queryClient.setQueryData<VisitRecord | null>(
          destinationVisitQueryKey,
          patchVisitRecordForMovedItem(
            destinationVisitSnapshot,
            pendingMoveItem,
            destinationVisit,
          ),
        );
      }

      try {
        const moveResult = await writeFeature({
          operationName: 'visit.item.move',
          offline: {
            strategy: 'api',
            input: moveVisitItemApiMutationInput(
              pendingMoveItem.item.id,
              destinationVisit.id,
            ),
          },
          execute: () =>
            moveVisitItem({
              itemId: pendingMoveItem.item.id,
              destinationVisitId: destinationVisit.id,
            }),
        });

        setPendingMoveItem(null);
        setMoveErrorMessage(null);

        await invalidateMoveVisitItemQueries(
          pendingMoveItem.sourceVisitId,
          destinationVisit.id,
        );
        trackObservabilityEvent('HOME_FEED_MOVE_ITEM_SUCCEEDED', {
          source: 'HomeFeedActionController',
          queued: moveResult.status === 'queued',
        });

        if (moveResult.status === 'queued') {
          showQueuedOfflineAlert('Visit item move');
        }
      } catch (error) {
        for (const [queryKey, snapshot] of homeFeedSnapshots) {
          if (snapshot !== undefined) {
            queryClient.setQueryData(queryKey, snapshot);
          }
        }

        if (sourceVisitSnapshot !== undefined) {
          queryClient.setQueryData(sourceVisitQueryKey, sourceVisitSnapshot);
        }

        if (destinationVisitSnapshot !== undefined) {
          queryClient.setQueryData(
            destinationVisitQueryKey,
            destinationVisitSnapshot,
          );
        }

        const message =
          error instanceof Error ? error.message : 'Could not move visit item.';
        trackObservabilityEvent('HOME_FEED_MOVE_ITEM_FAILED', {
          source: 'HomeFeedActionController',
          errorMessage: message,
          errorType: error instanceof Error ? error.name : 'unknown_error',
          isOnline,
        });
        setMoveErrorMessage(message);
      } finally {
        setIsMovingVisitItem(false);
      }
    },
    [
      invalidateMoveVisitItemQueries,
      isOnline,
      isMovingVisitItem,
      pendingMoveItem,
      queryClient,
      writeFeature,
    ],
  );

  const promptReportMenuTarget = useCallback((target: PendingReportTarget) => {
    trackObservabilityEvent('HOME_FEED_REPORT_MENU_OPENED', {
      source: 'HomeFeedActionController',
      contentType: target.kind,
    });
    setPendingReportMenuTarget(target);
  }, []);

  const closeReportMenu = useCallback(() => {
    setPendingReportMenuTarget(null);
  }, []);

  const promptReportTarget = useCallback((target: PendingReportTarget) => {
    setPendingReportTarget(target);
    setReportReasonCode(null);
    setReportNotes('');
    setReportErrorMessage(null);
  }, []);

  const openReportModalFromMenu = useCallback(() => {
    if (!pendingReportMenuTarget) {
      return;
    }

    const target = pendingReportMenuTarget;
    setPendingReportMenuTarget(null);
    promptReportTarget(target);
  }, [pendingReportMenuTarget, promptReportTarget]);

  const closeReportModal = useCallback(() => {
    if (isSubmittingReport) {
      return;
    }

    setPendingReportTarget(null);
    setReportReasonCode(null);
    setReportNotes('');
    setReportErrorMessage(null);
  }, [isSubmittingReport]);

  const submitReport = useCallback(async () => {
    if (!pendingReportTarget || !reportReasonCode || isSubmittingReport) {
      return;
    }

    if (!isOnline) {
      trackObservabilityEvent('HOME_FEED_REPORT_SUBMIT_FAILED', {
        source: 'HomeFeedActionController',
        contentType: pendingReportTarget.kind,
        errorMessage: 'Connect to the internet to submit a report.',
        errorType: 'offline',
      });
      setReportErrorMessage('Connect to the internet to submit a report.');
      return;
    }

    setReportErrorMessage(null);
    trackObservabilityEvent('HOME_FEED_REPORT_SUBMIT_STARTED', {
      source: 'HomeFeedActionController',
      contentType: pendingReportTarget.kind,
      hasNotes: Boolean(reportNotes.trim()),
      reasonCode: reportReasonCode,
      isOnline,
    });
    setIsSubmittingReport(true);

    try {
      await trackWriteTelemetry('content.report');
      await reportContent({
        contentType:
          pendingReportTarget.kind === 'food-product'
            ? 'food-product'
            : 'visit',
        recordId: pendingReportTarget.id,
        reasonCode: reportReasonCode,
        notes: reportNotes.trim() || undefined,
      });

      closeReportModal();
      await invalidateHomeFeed();
      trackObservabilityEvent('HOME_FEED_REPORT_SUBMIT_SUCCEEDED', {
        source: 'HomeFeedActionController',
        contentType: pendingReportTarget.kind,
        hasNotes: Boolean(reportNotes.trim()),
        reasonCode: reportReasonCode,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Could not submit report.';
      trackObservabilityEvent('HOME_FEED_REPORT_SUBMIT_FAILED', {
        source: 'HomeFeedActionController',
        contentType: pendingReportTarget.kind,
        errorMessage: message,
        errorType: error instanceof Error ? error.name : 'unknown_error',
        hasNotes: Boolean(reportNotes.trim()),
        reasonCode: reportReasonCode,
        isOnline,
      });
      setReportErrorMessage(message);
    } finally {
      setIsSubmittingReport(false);
    }
  }, [
    closeReportModal,
    invalidateHomeFeed,
    isOnline,
    isSubmittingReport,
    pendingReportTarget,
    reportNotes,
    reportReasonCode,
    trackWriteTelemetry,
  ]);

  const changeReportNotes = useCallback((value: string) => {
    setReportNotes(value);
    setReportErrorMessage((currentValue) =>
      currentValue ? null : currentValue,
    );
  }, []);

  const changeReportReasonCode = useCallback(
    (value: ContentReportReasonCode) => {
      setReportReasonCode(value);
      setReportErrorMessage((currentValue) =>
        currentValue ? null : currentValue,
      );
    },
    [],
  );

  const openPhotoViewer = useCallback(
    (photos: VisitPhotoRecord[], initialIndex = 0) => {
      if (photos.length === 0) {
        return;
      }

      const viewerState = buildPhotoViewerState(photos, initialIndex, {
        fullSizePreferLocalUri: false,
      });

      setPhotoViewerUrls(viewerState.urls);
      setPhotoViewerPreviewUrls(viewerState.previewUrls);
      setPhotoViewerInitialIndex(viewerState.initialIndex);
      setIsPhotoViewerVisible(true);
    },
    [],
  );

  const closePhotoViewer = useCallback(() => {
    setIsPhotoViewerVisible(false);
  }, []);

  return {
    deleteErrorMessage,
    isDeletingTarget,
    isMovingVisitItem,
    isPhotoViewerVisible,
    isSubmittingReport,
    moveErrorMessage,
    pendingDeleteTarget,
    pendingMoveItem,
    pendingReportMenuTarget,
    pendingReportTarget,
    photoViewerInitialIndex,
    photoViewerPreviewUrls,
    photoViewerUrls,
    reportErrorMessage,
    reportNotes,
    reportReasonCode,
    changeReportNotes,
    changeReportReasonCode,
    closeDeleteModal,
    closeMoveVisitItemModal,
    closePhotoViewer,
    closeReportMenu,
    closeReportModal,
    confirmDeleteTarget,
    confirmMoveVisitItem,
    openPhotoViewer,
    openReportModalFromMenu,
    promptDeleteFoodProduct,
    promptDeleteVisit,
    promptMoveVisitItem,
    promptReportMenuTarget,
    submitReport,
  };
}
