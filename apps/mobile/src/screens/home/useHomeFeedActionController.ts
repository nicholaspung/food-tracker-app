import { useCallback, useState } from 'react';
import type { QueryClient } from '@tanstack/react-query';

import {
  buildPocketBaseFileUrl,
  deleteQuickTrack,
  deleteVisit,
  invalidateHomeFeedQueries,
  reportContent,
  type ContentReportReasonCode,
} from '../../features';
import type { OfflineAwareFeatureWrite } from '../../features/store/useOfflineAwareFeatureWrite';
import { showQueuedOfflineAlert } from '../../lib/offlineAlerts';
import type {
  PendingDeleteTarget,
  PendingReportTarget,
  VisitPhotoRecord,
} from './shared';

interface UseHomeFeedActionControllerParams {
  isOnline: boolean;
  queryClient: QueryClient;
  trackWriteTelemetry: (operationName: string) => Promise<void>;
  writeFeature: OfflineAwareFeatureWrite;
}

export interface HomeFeedActionController {
  deleteErrorMessage: string | null;
  isDeletingTarget: boolean;
  isPhotoViewerVisible: boolean;
  isSubmittingReport: boolean;
  pendingDeleteTarget: PendingDeleteTarget | null;
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
  closePhotoViewer: () => void;
  closeReportMenu: () => void;
  closeReportModal: () => void;
  confirmDeleteTarget: () => Promise<void>;
  openPhotoViewer: (photos: VisitPhotoRecord[], initialIndex?: number) => void;
  openReportModalFromMenu: () => void;
  promptDeleteQuickTrack: (quickTrackId: string, itemName: string) => void;
  promptDeleteVisit: (visitId: string, itemName: string) => void;
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

  const invalidateHomeFeed = useCallback(async () => {
    await invalidateHomeFeedQueries(queryClient);
  }, [queryClient]);

  const handleDeleteQuickTrack = useCallback(
    async (quickTrackId: string) => {
      const deleteResult = await writeFeature({
        operationName: 'quick-track.delete',
        offline: {
          strategy: 'outbox',
          payload: { quickTrackId },
        },
        execute: () => deleteQuickTrack(quickTrackId),
      });

      if (deleteResult.status === 'queued') {
        await invalidateHomeFeed();
        showQueuedOfflineAlert('Food product delete');
        return;
      }

      await invalidateHomeFeed();
    },
    [invalidateHomeFeed, writeFeature],
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
        await invalidateHomeFeed();
        showQueuedOfflineAlert('Visit delete');
        return;
      }

      await invalidateHomeFeed();
    },
    [invalidateHomeFeed, writeFeature],
  );

  const promptDeleteQuickTrack = useCallback(
    (quickTrackId: string, itemName: string) => {
      setDeleteErrorMessage(null);
      setPendingDeleteTarget({
        id: quickTrackId,
        itemName,
        kind: 'quick-track',
      });
    },
    [],
  );

  const promptDeleteVisit = useCallback((visitId: string, itemName: string) => {
    setDeleteErrorMessage(null);
    setPendingDeleteTarget({
      id: visitId,
      itemName,
      kind: 'visit',
    });
  }, []);

  const closeDeleteModal = useCallback(() => {
    if (isDeletingTarget) {
      return;
    }

    setPendingDeleteTarget(null);
  }, [isDeletingTarget]);

  const confirmDeleteTarget = useCallback(async () => {
    if (!pendingDeleteTarget || isDeletingTarget) {
      return;
    }

    setIsDeletingTarget(true);

    try {
      if (pendingDeleteTarget.kind === 'visit') {
        await handleDeleteVisit(pendingDeleteTarget.id);
      } else {
        await handleDeleteQuickTrack(pendingDeleteTarget.id);
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
      setDeleteErrorMessage(message);
    } finally {
      setIsDeletingTarget(false);
    }
  }, [
    handleDeleteQuickTrack,
    handleDeleteVisit,
    isDeletingTarget,
    pendingDeleteTarget,
  ]);

  const promptReportMenuTarget = useCallback((target: PendingReportTarget) => {
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
      setReportErrorMessage('Connect to the internet to submit a report.');
      return;
    }

    setReportErrorMessage(null);
    setIsSubmittingReport(true);

    try {
      await trackWriteTelemetry('content.report');
      await reportContent({
        contentType: pendingReportTarget.kind,
        recordId: pendingReportTarget.id,
        reasonCode: reportReasonCode,
        notes: reportNotes.trim() || undefined,
      });

      closeReportModal();
      await invalidateHomeFeed();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Could not submit report.';
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

      const urls = photos.map((photo) =>
        buildPocketBaseFileUrl({
          collectionId: photo.collectionId,
          collectionName: photo.collectionName ?? 'visit_photos',
          recordId: photo.id,
          filename: photo.photo,
        }),
      );
      const previewUrls = photos.map((photo) => {
        const localUri = photo.uri?.trim();
        if (localUri) {
          return localUri;
        }

        return buildPocketBaseFileUrl({
          collectionId: photo.collectionId,
          collectionName: photo.collectionName ?? 'visit_photos',
          recordId: photo.id,
          filename: photo.photo,
          thumb: '100x100',
        });
      });
      const boundedIndex = Math.max(
        0,
        Math.min(initialIndex, urls.length - 1),
      );

      setPhotoViewerUrls(urls);
      setPhotoViewerPreviewUrls(previewUrls);
      setPhotoViewerInitialIndex(boundedIndex);
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
    isPhotoViewerVisible,
    isSubmittingReport,
    pendingDeleteTarget,
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
    closePhotoViewer,
    closeReportMenu,
    closeReportModal,
    confirmDeleteTarget,
    openPhotoViewer,
    openReportModalFromMenu,
    promptDeleteQuickTrack,
    promptDeleteVisit,
    promptReportMenuTarget,
    submitReport,
  };
}
