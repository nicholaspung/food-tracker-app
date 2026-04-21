import type { HomeFeedPhotoRecord } from '../../components/shared';
import type { VisitRecord } from '../../features';

export type VisitPhotoRecord = HomeFeedPhotoRecord;

export interface PendingMoveVisitItem {
  item: VisitRecord['items'][number];
  sourceVisitId: string;
  sourceVisitName: string;
}

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
