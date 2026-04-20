import type { HomeFeedPhotoRecord } from '../../components/shared';

export type VisitPhotoRecord = HomeFeedPhotoRecord;

export type PendingDeleteTarget =
  | {
      id: string;
      kind: 'visit';
      itemName: string;
    }
  | {
      id: string;
      kind: 'food-product';
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
      kind: 'food-product';
      itemName: string;
    };
