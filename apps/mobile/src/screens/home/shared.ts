import type { HomeBetaFeedPhotoRecord } from '../../components/shared';

export type VisitPhotoRecord = HomeBetaFeedPhotoRecord;

export type PendingDeleteTarget =
  | {
      id: string;
      kind: 'visit';
      itemName: string;
    }
  | {
      id: string;
      kind: 'quick-track';
      itemName: string;
    };

export type PendingReportTarget =
  | {
      id: string;
      kind: 'visit';
      itemName: string;
    }
  | {
      id: string;
      kind: 'quick-track';
      itemName: string;
    };
