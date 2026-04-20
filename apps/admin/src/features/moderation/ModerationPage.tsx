import { useEffect, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { PaginatedCollection } from '@/components/shared/PaginatedCollection';
import type { AdminUser } from '@/features/auth/types';
import {
  claimModerationCase,
  deleteModeratedUserContent,
  findUserByEmail,
  getUserModerationProfile,
  listModerationCases,
  moderateUserContent,
  releaseModerationCase,
  updateUserModeration,
  type UserModerationProfile,
} from '@/features/users/api';
import { formatDateTime, getCreatedUpdatedDisplay } from '@/lib/formatters';
import { pb } from '@/lib/pocketbase';
import type {
  ModerationAction,
  ModerationAppealState,
  ModerationCase,
  ModerationCaseReport,
  ModerationFeedEntry,
  ModerationFeedItem,
  ModerationPhoto,
  ModerationReasonCode,
  ModerationRestaurantList,
  ModerationRestaurantListItem,
} from '@/lib/types';

type ModerationMainTab = 'queue' | 'cases' | 'lookup';

type ModerationTargetContentType = 'visit' | 'food-item' | 'food-product' | 'list' | 'list-item' | 'photo';

type ModerationWorkspaceTab = 'account' | 'history' | 'feed' | 'lists';

type ContentModerationDraft = {
  action: ModerationAction;
  appealState: ModerationAppealState;
  moderatorNote: string;
  reasonCode: ModerationReasonCode | '';
  userNotice: string;
};

type ContentModerationTarget = {
  contentType: ModerationTargetContentType;
  recordId: string;
  title: string;
  subtitle?: string;
};

type AccountModerationFormState = {
  contentModerationMode: NonNullable<AdminUser['contentModerationMode']>;
  moderationNotice: string;
  moderationNotes: string;
  moderationState: NonNullable<AdminUser['moderationState']>;
  photoSuspendedUntil: string;
  postingSuspendedUntil: string;
  warningCount: string;
};

const contentActionOptions: Array<{ description: string; label: string; value: ModerationAction }> = [
  {
    label: 'Hide',
    value: 'hide',
    description:
      'Sets the record moderation status to Hidden. The record stops showing in normal app surfaces until a moderator restores it, and the case is resolved as hidden.',
  },
  {
    label: 'Quarantine',
    value: 'quarantine',
    description:
      'Sets the record moderation status to Under Review. The record is pulled out of normal visible content while the case stays open for more moderator review.',
  },
  {
    label: 'Mark reviewed',
    value: 'mark_reviewed',
    description:
      'Sets the record moderation status to Reviewed. This treats the record as reviewed and allowed content, and the case is resolved as reviewed.',
  },
  {
    label: 'Restore',
    value: 'restore',
    description:
      'Sets the record moderation status back to Active. The record returns to normal visibility if no other rules are blocking it, and the case is resolved as restored.',
  },
  {
    label: 'Escalate',
    value: 'escalate',
    description:
      'Sets the record moderation status to Escalated. The case stays open for higher-attention follow-up, and the record remains out of normal visible content until another action is taken.',
  },
  {
    label: 'Restrict visibility',
    value: 'restrict_visibility',
    description:
      'For content that supports visibility, this changes visibility to Private and marks the record as Reviewed. The record stays available only to its owner instead of shared audiences, and the case is resolved as restricted visibility.',
  },
  {
    label: 'Soft remove',
    value: 'remove',
    description:
      'Sets the record moderation status to Removed. The record is treated as removed from the app but stays in storage and audit history unless it is permanently deleted later, and the case is resolved as removed.',
  },
];

const moderationReasonOptions: Array<{ label: string; value: ModerationReasonCode | '' }> = [
  { label: 'No reason selected', value: '' },
  { label: 'Spam', value: 'spam' },
  { label: 'Harassment', value: 'harassment' },
  { label: 'Hate', value: 'hate' },
  { label: 'Sexual content', value: 'sexual' },
  { label: 'Violence', value: 'violence' },
  { label: 'Self-harm', value: 'self_harm' },
  { label: 'Illegal activity', value: 'illegal' },
  { label: 'Privacy', value: 'privacy' },
  { label: 'Copyright', value: 'copyright' },
  { label: 'Misinformation', value: 'misinformation' },
  { label: 'Other', value: 'other' },
];

const moderationAppealOptions: Array<{ description: string; label: string; value: ModerationAppealState }> = [
  {
    label: 'No appeal',
    value: 'none',
    description:
      'No appeal is recorded on the moderation case. This does not change the record by itself; it only leaves appeal tracking empty.',
  },
  {
    label: 'Requested',
    value: 'requested',
    description:
      'Records that the user asked for the moderation decision to be reconsidered. This does not restore or hide the record on its own; it only marks the case as having an open appeal.',
  },
  {
    label: 'Approved',
    value: 'approved',
    description:
      'Records that an appeal was approved. This does not automatically restore the record by itself; use Restore if the content should go back to normal visibility.',
  },
  {
    label: 'Denied',
    value: 'denied',
    description:
      'Records that an appeal was denied. This does not apply any extra record changes by itself; the current moderation action remains in effect until another action changes it.',
  },
];

const moderationMainTabs: Array<{ label: string; value: ModerationMainTab }> = [
  { label: 'Moderation queue', value: 'queue' },
  { label: 'Cases', value: 'cases' },
  { label: 'Individual email lookups', value: 'lookup' },
];

const userModerationStateOptions: Array<{
  description: string;
  label: string;
  value: NonNullable<AdminUser['moderationState']>;
}> = [
  { label: 'Active', value: 'active', description: 'User can post normally.' },
  { label: 'Warned', value: 'warned', description: 'Incident logged, but account stays active.' },
  { label: 'Restricted', value: 'restricted', description: 'Used with temporary posting or photo suspensions.' },
  { label: 'Banned', value: 'banned', description: 'Posting and uploads are fully blocked.' },
];

const userContentModeOptions: Array<{
  description: string;
  label: string;
  value: NonNullable<AdminUser['contentModerationMode']>;
}> = [
  { label: 'Normal', value: 'normal', description: 'New content publishes normally.' },
  { label: 'Pre-review', value: 'pre_review', description: 'New posts create moderation cases and stay under review.' },
];

function createDefaultContentModerationDraft(): ContentModerationDraft {
  return {
    action: 'hide',
    appealState: 'none',
    moderatorNote: '',
    reasonCode: '',
    userNotice: '',
  };
}

function buildAccountModerationFormState(user: AdminUser): AccountModerationFormState {
  return {
    contentModerationMode: user.contentModerationMode ?? 'normal',
    moderationNotice: user.moderationNotice ?? '',
    moderationNotes: user.moderationNotes ?? '',
    moderationState: user.moderationState ?? 'active',
    photoSuspendedUntil: toDateTimeLocalValue(user.photoSuspendedUntil),
    postingSuspendedUntil: toDateTimeLocalValue(user.postingSuspendedUntil),
    warningCount: typeof user.warningCount === 'number' ? String(Math.trunc(user.warningCount)) : '0',
  };
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function formatVisibility(value: string | undefined) {
  if (!value?.trim()) {
    return 'Unknown visibility';
  }

  return value.replace(/-/g, ' ').replace(/\b\w/g, (character) => character.toUpperCase());
}

function formatModerationLabel(value: string | undefined) {
  if (!value?.trim()) {
    return 'Unknown';
  }

  return value.replace(/_/g, ' ').replace(/-/g, ' ').replace(/\b\w/g, (character) => character.toUpperCase());
}

function formatRating(value: number | undefined) {
  if (typeof value !== 'number' || Number.isNaN(value) || value <= 0) {
    return 'No rating';
  }

  return `${value}/5`;
}

function getContentModerationStatus(value?: string) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : 'active';
}

function buildPhotoUrl(photo: ModerationPhoto, thumb?: string) {
  return pb.files.getURL(
    {
      collectionName: photo.collectionName,
      id: photo.id,
    },
    photo.photo,
    thumb ? { thumb } : {},
  );
}

function toDateTimeLocalValue(value?: string) {
  if (!value?.trim()) {
    return '';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return '';
  }

  const offset = parsed.getTimezoneOffset();
  const localDate = new Date(parsed.getTime() - offset * 60_000);
  return localDate.toISOString().slice(0, 16);
}

function toIsoStringOrEmpty(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    return '';
  }

  return parsed.toISOString();
}

function getModerationTone(value?: string) {
  switch (value) {
    case 'hidden':
    case 'removed':
    case 'banned':
      return 'danger';
    case 'restricted':
    case 'restricted_visibility':
    case 'warned':
      return 'warning';
    case 'reviewed':
    case 'restored':
    case 'active':
      return 'success';
    case 'pre_review':
    case 'under_review':
    case 'escalated':
      return 'info';
    default:
      return 'neutral';
  }
}

function getReportCount(caseRecord: Pick<ModerationCase, 'reportCount' | 'reports'>) {
  return typeof caseRecord.reportCount === 'number' ? caseRecord.reportCount : caseRecord.reports?.length ?? 0;
}

function getModerationCasePriority(caseRecord: ModerationCase) {
  const actionableWeight = caseRecord.status === 'under_review' || caseRecord.status === 'open' ? 0 : 1;
  const reportWeight = getReportCount(caseRecord) > 0 ? 0 : 1;
  const updatedWeight = Date.parse(caseRecord.latestReportedAt || caseRecord.updated || caseRecord.created || '') || 0;

  return {
    actionableWeight,
    reportWeight,
    updatedWeight,
  };
}

function sortModerationCasesForReview(cases: ModerationCase[]) {
  return [...cases].sort((left, right) => {
    const leftPriority = getModerationCasePriority(left);
    const rightPriority = getModerationCasePriority(right);

    if (leftPriority.actionableWeight !== rightPriority.actionableWeight) {
      return leftPriority.actionableWeight - rightPriority.actionableWeight;
    }

    if (leftPriority.reportWeight !== rightPriority.reportWeight) {
      return leftPriority.reportWeight - rightPriority.reportWeight;
    }

    return rightPriority.updatedWeight - leftPriority.updatedWeight;
  });
}

function buildContentModerationTargetFromCase(
  caseRecord: ModerationCase,
  profile: UserModerationProfile,
): ContentModerationTarget | null {
  switch (caseRecord.targetType) {
    case 'visit': {
      const entry = profile.feedEntries.find((candidate) => candidate.contentType === 'visit' && candidate.id === caseRecord.targetRecordId);

      return {
        contentType: 'visit',
        recordId: caseRecord.targetRecordId,
        title: entry?.restaurantName || caseRecord.targetLabel || 'Visit',
        subtitle: 'Visit entry',
      };
    }
    case 'food-product': {
      const entry = profile.feedEntries.find(
        (candidate) => candidate.contentType === 'food-product' && candidate.id === caseRecord.targetRecordId,
      );

      return {
        contentType: 'food-product',
        recordId: caseRecord.targetRecordId,
        title: entry?.itemName || caseRecord.targetLabel || 'Food Product',
        subtitle: 'Food product entry',
      };
    }
    case 'food-item': {
      const parentEntry = profile.feedEntries.find((entry) => entry.items?.some((item) => item.id === caseRecord.targetRecordId));
      const item = parentEntry?.items?.find((candidate) => candidate.id === caseRecord.targetRecordId);

      return {
        contentType: 'food-item',
        recordId: caseRecord.targetRecordId,
        title: item?.name || caseRecord.targetLabel || 'Visit item',
        subtitle: parentEntry?.restaurantName ? `Visit item from ${parentEntry.restaurantName}` : 'Visit item',
      };
    }
    case 'list': {
      const list = profile.restaurantLists.find((candidate) => candidate.id === caseRecord.targetRecordId);

      return {
        contentType: 'list',
        recordId: caseRecord.targetRecordId,
        title: list?.name || caseRecord.targetLabel || 'Restaurant list',
        subtitle: 'Restaurant list',
      };
    }
    case 'list-item': {
      const parentList = profile.restaurantLists.find((list) => list.items.some((item) => item.id === caseRecord.targetRecordId));
      const item = parentList?.items.find((candidate) => candidate.id === caseRecord.targetRecordId);

      return {
        contentType: 'list-item',
        recordId: caseRecord.targetRecordId,
        title: item?.restaurantName || caseRecord.targetLabel || 'List item',
        subtitle: parentList?.name ? `Saved in ${parentList.name}` : 'List item',
      };
    }
    case 'photo':
      return {
        contentType: 'photo',
        recordId: caseRecord.targetRecordId,
        title: caseRecord.targetLabel || 'Photo',
        subtitle: 'Photo attached to user content',
      };
    default:
      return null;
  }
}

function findPhotoContext(feedEntries: ModerationFeedEntry[], photoId: string) {
  for (const entry of feedEntries) {
    if (entry.photos) {
      const entryPhoto = entry.photos.find((photo) => photo.id === photoId);
      if (entryPhoto) {
        return { entry, item: null, photo: entryPhoto };
      }
    }

    for (const item of entry.items ?? []) {
      const itemPhoto = item.photos.find((photo) => photo.id === photoId);
      if (itemPhoto) {
        return { entry, item, photo: itemPhoto };
      }
    }
  }

  return null;
}

function ModerationBadge({
  value,
  fallback = 'Unknown',
}: {
  value?: string;
  fallback?: string;
}) {
  return (
    <span className={`tag moderation-tag moderation-tag-${getModerationTone(value)}`}>
      {value?.trim() ? formatModerationLabel(value) : fallback}
    </span>
  );
}

function ModerationPhotoStrip({
  photos,
  onPhotoClick,
}: {
  photos: ModerationPhoto[];
  onPhotoClick?: (photoId: string) => void;
}) {
  if (photos.length === 0) {
    return null;
  }

  return (
    <div className="moderation-photo-grid">
      {photos.map((photo) => (
        <button
          className="moderation-photo-button"
          key={photo.id}
          onClick={() => onPhotoClick?.(photo.id)}
          type="button"
        >
          <span className="moderation-photo-status">
            <ModerationBadge fallback="Photo" value={getContentModerationStatus(photo.moderationStatus)} />
          </span>
          <img
            alt={photo.caption?.trim() || 'User upload'}
            className="photo-thumb moderation-photo-thumb"
            src={buildPhotoUrl(photo, '160x160')}
          />
        </button>
      ))}
    </div>
  );
}

function PhotoCarouselModal({
  deleteDisabled,
  initialIndex,
  onClose,
  onDeletePhoto,
  onModeratePhoto,
  photos,
}: {
  deleteDisabled: boolean;
  initialIndex: number;
  onClose: () => void;
  onDeletePhoto?: (photo: ModerationPhoto) => void;
  onModeratePhoto?: (photo: ModerationPhoto) => void;
  photos: ModerationPhoto[];
}) {
  const [activeIndex, setActiveIndex] = useState(initialIndex);

  useEffect(() => {
    setActiveIndex(initialIndex);
  }, [initialIndex, photos]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
        return;
      }

      if (event.key === 'ArrowLeft') {
        setActiveIndex((current) => (current === 0 ? photos.length - 1 : current - 1));
        return;
      }

      if (event.key === 'ArrowRight') {
        setActiveIndex((current) => (current === photos.length - 1 ? 0 : current + 1));
      }
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose, photos.length]);

  const activePhoto = photos[activeIndex];
  if (!activePhoto) {
    return null;
  }

  return (
    <div className="modal-backdrop moderation-carousel-backdrop" onClick={onClose} role="presentation">
      <div
        aria-label="Visit photo carousel"
        aria-modal="true"
        className="moderation-carousel-modal"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div className="summary-row">
          <div>
            <p className="eyebrow">Visit photos</p>
            <h3 style={{ marginBottom: 0 }}>
              {activeIndex + 1} of {photos.length}
            </h3>
          </div>
          <div className="moderation-inline-actions">
            <ModerationBadge fallback="Photo" value={getContentModerationStatus(activePhoto.moderationStatus)} />
            {onModeratePhoto ? (
              <button className="button ghost" onClick={() => onModeratePhoto(activePhoto)} type="button">
                Moderate photo
              </button>
            ) : null}
            {onDeletePhoto ? (
              <button className="button danger" disabled={deleteDisabled} onClick={() => onDeletePhoto(activePhoto)} type="button">
                {deleteDisabled ? 'Deleting...' : 'Delete photo'}
              </button>
            ) : null}
            <button className="button ghost" onClick={onClose} type="button">
              Close
            </button>
          </div>
        </div>

        <div className="moderation-carousel-stage">
          {photos.length > 1 ? (
            <button
              aria-label="Previous photo"
              className="button ghost moderation-carousel-nav"
              onClick={() => {
                setActiveIndex((current) => (current === 0 ? photos.length - 1 : current - 1));
              }}
              type="button"
            >
              ‹
            </button>
          ) : null}

          <img
            alt={activePhoto.caption?.trim() || `Visit photo ${activeIndex + 1}`}
            className="moderation-carousel-image"
            src={buildPhotoUrl(activePhoto)}
          />

          {photos.length > 1 ? (
            <button
              aria-label="Next photo"
              className="button ghost moderation-carousel-nav"
              onClick={() => {
                setActiveIndex((current) => (current === photos.length - 1 ? 0 : current + 1));
              }}
              type="button"
            >
              ›
            </button>
          ) : null}
        </div>

        {activePhoto.caption?.trim() ? <p className="text-muted">{activePhoto.caption.trim()}</p> : null}

        {photos.length > 1 ? (
          <div className="moderation-carousel-thumbs">
            {photos.map((photo, index) => (
              <button
                className={`moderation-carousel-thumb${index === activeIndex ? ' active' : ''}`}
                key={photo.id}
                onClick={() => setActiveIndex(index)}
                type="button"
              >
                <img alt="" className="moderation-carousel-thumb-image" src={buildPhotoUrl(photo, '120x120')} />
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ModerationMetaBlock({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="moderation-meta-block">
      <span className="text-muted">{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function ModerationReportHistory({
  reports,
}: {
  reports: ModerationCaseReport[];
}) {
  if (reports.length === 0) {
    return (
      <div className="state-panel">
        <span className="text-muted">No user reports are attached to this case yet.</span>
      </div>
    );
  }

  return (
    <div className="inline-list">
      {reports.map((report) => {
        const reporter = report.expand?.reporter;
        const reporterLabel = reporter?.email || reporter?.name || 'Unknown reporter';

        return (
          <div className="list-item moderation-subitem moderation-report-row" key={report.id}>
            <div className="summary-row moderation-summary-row-top">
              <div>
                <strong>{reporterLabel}</strong>
                {report.notes?.trim() ? <p className="text-muted">{report.notes.trim()}</p> : null}
              </div>
              <div className="tag-row tag-row-start">
                {report.reasonCode ? <span className="tag">{formatModerationLabel(report.reasonCode)}</span> : null}
                <span className="tag">{formatDateTime(report.updated || report.created)}</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ReportedContentPreview({
  caseRecord,
  deletingKey,
  onDelete,
  onModerate,
  onModerateListItem,
  onModerateVisitItem,
  onOpenCarousel,
  profile,
  showActions = true,
}: {
  caseRecord: ModerationCase;
  deletingKey: string | null;
  onDelete: (contentType: ModerationTargetContentType, recordId: string, label: string) => void;
  onModerate: (target: ContentModerationTarget) => void;
  onModerateListItem: (list: ModerationRestaurantList, item: ModerationRestaurantListItem) => void;
  onModerateVisitItem: (entry: ModerationFeedEntry, item: ModerationFeedItem) => void;
  onOpenCarousel: (photos: ModerationPhoto[], initialIndex: number) => void;
  profile: UserModerationProfile;
  showActions?: boolean;
}) {
  if (caseRecord.targetType === 'visit' || caseRecord.targetType === 'food-product') {
    const entry = profile.feedEntries.find(
      (candidate) => candidate.contentType === caseRecord.targetType && candidate.id === caseRecord.targetRecordId,
    );

    if (!entry) {
      return (
        <div className="state-panel">
          <strong>Reported record is not available in this profile snapshot.</strong>
          <span className="text-muted">It may already be removed or no longer match the moderation filters.</span>
        </div>
      );
    }

    return (
      <FeedEntryCard
        deletingKey={deletingKey}
        entry={entry}
        onDelete={() =>
          onDelete(entry.contentType, entry.id, entry.contentType === 'visit' ? 'visit' : 'food product')
        }
        onDeleteItem={(item) => onDelete('food-item', item.id, 'visit item')}
        onModerate={() =>
          onModerate({
            contentType: entry.contentType,
            recordId: entry.id,
            title: entry.contentType === 'visit' ? entry.restaurantName || 'Visit' : entry.itemName || 'Food Product',
            subtitle: entry.contentType === 'visit' ? 'Visit entry' : 'Food product entry',
          })
        }
        onModerateItem={(item) => onModerateVisitItem(entry, item)}
        onOpenCarousel={onOpenCarousel}
        showActions={showActions}
      />
    );
  }

  if (caseRecord.targetType === 'list') {
    const list = profile.restaurantLists.find((candidate) => candidate.id === caseRecord.targetRecordId);

    if (!list) {
      return (
        <div className="state-panel">
          <strong>Reported list is not available in this profile snapshot.</strong>
          <span className="text-muted">It may already be removed or archived.</span>
        </div>
      );
    }

    return (
      <RestaurantListCard
        deletingKey={deletingKey}
        list={list}
        onDeleteItem={(item) => onDelete('list-item', item.id, 'list item')}
        onDeleteList={() => onDelete('list', list.id, 'list')}
        onModerateItem={(item) => onModerateListItem(list, item)}
        onModerateList={() =>
          onModerate({
            contentType: 'list',
            recordId: list.id,
            title: list.name,
            subtitle: 'Restaurant list',
          })
        }
        showActions={showActions}
      />
    );
  }

  if (caseRecord.targetType === 'food-item') {
    const parentEntry = profile.feedEntries.find((entry) => entry.items?.some((item) => item.id === caseRecord.targetRecordId));
    const item = parentEntry?.items?.find((candidate) => candidate.id === caseRecord.targetRecordId);

    if (!parentEntry || !item) {
      return (
        <div className="state-panel">
          <strong>Reported visit item could not be found.</strong>
          <span className="text-muted">The parent visit may already be gone from the loaded moderation profile.</span>
        </div>
      );
    }

    return (
      <article className="detail-card moderation-entry moderation-review-card">
        <div className="summary-row moderation-summary-row-top">
          <div>
            <p className="eyebrow">Reported visit item</p>
            <h3 style={{ marginBottom: 6 }}>{item.name}</h3>
            <div className="tag-row tag-row-start">
              <span className="tag">{formatRating(item.rating)}</span>
              <ModerationBadge value={getContentModerationStatus(item.moderationStatus)} />
              {parentEntry?.restaurantName ? <span className="tag">Visit: {parentEntry.restaurantName}</span> : null}
            </div>
          </div>
          {showActions ? (
            <div className="moderation-inline-actions">
              <button className="button ghost" onClick={() => onModerateVisitItem(parentEntry, item)} type="button">
                Moderate visit item
              </button>
              <button className="button danger" disabled={deletingKey === `food-item:${item.id}`} onClick={() => onDelete('food-item', item.id, 'visit item')} type="button">
                {deletingKey === `food-item:${item.id}` ? 'Deleting...' : 'Delete visit item'}
              </button>
            </div>
          ) : null}
        </div>

        <div className="moderation-meta-grid">
          {parentEntry?.restaurantName ? <ModerationMetaBlock label="Parent visit" value={parentEntry.restaurantName} /> : null}
          <ModerationMetaBlock label="Created" value={formatDateTime(item.created)} />
        </div>

        {item.notes?.trim() ? <p className="text-muted">"{item.notes.trim()}"</p> : null}
        {item.description?.trim() ? <p className="text-muted">{item.description.trim()}</p> : null}
        <ModerationPhotoStrip
          onPhotoClick={(photoId) => {
            const initialIndex = item.photos.findIndex((photo) => photo.id === photoId);
            if (initialIndex >= 0) {
              onOpenCarousel(item.photos, initialIndex);
            }
          }}
          photos={item.photos}
        />
      </article>
    );
  }

  if (caseRecord.targetType === 'list-item') {
    const parentList = profile.restaurantLists.find((list) => list.items.some((item) => item.id === caseRecord.targetRecordId));
    const item = parentList?.items.find((candidate) => candidate.id === caseRecord.targetRecordId);

    if (!item) {
      return (
        <div className="state-panel">
          <strong>Reported list item could not be found.</strong>
          <span className="text-muted">The list may already be removed or no longer included in this profile snapshot.</span>
        </div>
      );
    }

    return (
      <article className="detail-card moderation-entry moderation-review-card">
        <div className="summary-row moderation-summary-row-top">
          <div>
            <p className="eyebrow">Reported list item</p>
            <h3 style={{ marginBottom: 6 }}>{item.restaurantName || 'Saved restaurant'}</h3>
            <div className="tag-row tag-row-start">
              <ModerationBadge value={getContentModerationStatus(item.moderationStatus)} />
              {parentList?.name ? <span className="tag">List: {parentList.name}</span> : null}
              {item.foodItemName ? <span className="tag">Saved: {item.foodItemName}</span> : null}
              {item.userFoodItemName ? <span className="tag">Rated: {item.userFoodItemName}</span> : null}
            </div>
          </div>
          {showActions ? (
            <div className="moderation-inline-actions">
              <button className="button ghost" onClick={() => parentList && onModerateListItem(parentList, item)} type="button">
                Moderate list item
              </button>
              <button className="button danger" disabled={deletingKey === `list-item:${item.id}`} onClick={() => onDelete('list-item', item.id, 'list item')} type="button">
                {deletingKey === `list-item:${item.id}` ? 'Deleting...' : 'Delete list item'}
              </button>
            </div>
          ) : null}
        </div>

        <div className="moderation-meta-grid">
          {parentList?.name ? <ModerationMetaBlock label="Parent list" value={parentList.name} /> : null}
          <ModerationMetaBlock label="Created" value={formatDateTime(item.created)} />
          {item.restaurantLocation?.trim() ? <ModerationMetaBlock label="Location" value={item.restaurantLocation.trim()} /> : null}
        </div>

        {item.note?.trim() ? <p className="text-muted">{item.note.trim()}</p> : null}
      </article>
    );
  }

  if (caseRecord.targetType === 'photo') {
    const photoContext = findPhotoContext(profile.feedEntries, caseRecord.targetRecordId);
    const photo = photoContext?.photo;

    if (!photo) {
      return (
        <div className="state-panel">
          <strong>Reported photo could not be found.</strong>
          <span className="text-muted">The photo may already be removed from the user profile.</span>
        </div>
      );
    }

    return (
      <article className="detail-card moderation-entry moderation-review-card">
        <div className="summary-row moderation-summary-row-top">
          <div>
            <p className="eyebrow">Reported photo</p>
            <h3 style={{ marginBottom: 6 }}>{photo.caption?.trim() || 'User photo upload'}</h3>
            <div className="tag-row tag-row-start">
              <ModerationBadge value={getContentModerationStatus(photo.moderationStatus)} />
              {photoContext.entry?.restaurantName ? <span className="tag">{photoContext.entry.restaurantName}</span> : null}
              {photoContext.item?.name ? <span className="tag">{photoContext.item.name}</span> : null}
            </div>
          </div>
          {showActions ? (
            <div className="moderation-inline-actions">
              <button
                className="button ghost"
                onClick={() =>
                  onModerate({
                    contentType: 'photo',
                    recordId: photo.id,
                    title: photo.caption?.trim() || 'Visit photo',
                    subtitle: 'Photo attached to a visit item',
                  })
                }
                type="button"
              >
                Moderate photo
              </button>
              <button className="button danger" disabled={deletingKey === `photo:${photo.id}`} onClick={() => onDelete('photo', photo.id, 'photo')} type="button">
                {deletingKey === `photo:${photo.id}` ? 'Deleting...' : 'Delete photo'}
              </button>
            </div>
          ) : null}
        </div>

        <div className="moderation-photo-review-stage">
          <img
            alt={photo.caption?.trim() || 'Reported user photo'}
            className="moderation-review-image"
            src={buildPhotoUrl(photo)}
          />
        </div>
      </article>
    );
  }

  return (
    <div className="state-panel">
      <strong>No dedicated content preview is available for this case.</strong>
      <span className="text-muted">This record can still be moderated from the case actions and account context below.</span>
    </div>
  );
}

function ModerationCaseCard({
  caseRecord,
  claimDisabled,
  onClaim,
  onRelease,
  onReviewCase,
  releaseDisabled,
}: {
  caseRecord: ModerationCase;
  claimDisabled: boolean;
  onClaim: () => void;
  onRelease: () => void;
  onReviewCase?: () => void;
  releaseDisabled: boolean;
}) {
  const assignedAdmin = caseRecord.expand?.assignedAdmin;
  const targetUser = caseRecord.expand?.targetUser;
  const reports = caseRecord.reports ?? [];
  const reportCount = getReportCount(caseRecord);

  return (
    <article className="detail-card moderation-case-card">
      <div className="summary-row moderation-summary-row-top">
        <div>
          <p className="eyebrow">Case</p>
          <h3 style={{ marginBottom: 6 }}>{caseRecord.targetLabel?.trim() || caseRecord.targetType}</h3>
          <div className="tag-row tag-row-start">
            <ModerationBadge value={caseRecord.status} />
            {caseRecord.action ? <ModerationBadge value={caseRecord.action} /> : null}
            <span className="tag">{formatModerationLabel(caseRecord.targetType)}</span>
            {caseRecord.reasonCode ? <span className="tag">{formatModerationLabel(caseRecord.reasonCode)}</span> : null}
            {reportCount > 0 ? <span className="tag">{reportCount} report{reportCount === 1 ? '' : 's'}</span> : null}
          </div>
        </div>
        <div className="moderation-inline-actions">
          {assignedAdmin ? (
            <button className="button ghost" disabled={releaseDisabled} onClick={onRelease} type="button">
              {releaseDisabled ? 'Releasing...' : 'Release'}
            </button>
          ) : (
            <button className="button ghost" disabled={claimDisabled} onClick={onClaim} type="button">
              {claimDisabled ? 'Claiming...' : 'Claim'}
            </button>
          )}
        </div>
      </div>

      <div className="moderation-meta-grid">
        <ModerationMetaBlock label="Target user" value={targetUser?.email || 'Unknown user'} />
        <ModerationMetaBlock label="Assigned admin" value={assignedAdmin?.email || 'Unassigned'} />
        <ModerationMetaBlock label="Updated" value={formatDateTime(caseRecord.updated)} />
        {caseRecord.latestReportedAt ? (
          <ModerationMetaBlock label="Latest report" value={formatDateTime(caseRecord.latestReportedAt)} />
        ) : null}
      </div>

      {caseRecord.moderatorNote?.trim() ? <p className="text-muted">{caseRecord.moderatorNote.trim()}</p> : null}
      {caseRecord.userNotice?.trim() ? <p className="text-muted">User notice: {caseRecord.userNotice.trim()}</p> : null}

      {reports.length > 0 ? (
        <div>
          <p className="eyebrow">Reports</p>
          <ModerationReportHistory reports={reports} />
        </div>
      ) : null}

      {targetUser && onReviewCase ? (
        <button className="button ghost" onClick={onReviewCase} type="button">
          Review case
        </button>
      ) : null}
    </article>
  );
}

function VisitItemRow({
  deletingKey,
  item,
  onDelete,
  onModerate,
  onPhotoClick,
  showActions = true,
}: {
  deletingKey: string | null;
  item: ModerationFeedItem;
  onDelete: () => void;
  onModerate: () => void;
  onPhotoClick?: (photoId: string) => void;
  showActions?: boolean;
}) {
  return (
    <div className="list-item moderation-subitem">
      <div className="summary-row moderation-summary-row-top">
        <div>
          <strong>{item.name}</strong>
          <div className="tag-row tag-row-start">
            <span className="tag">{formatRating(item.rating)}</span>
            <ModerationBadge value={getContentModerationStatus(item.moderationStatus)} />
          </div>
        </div>
        {showActions ? (
          <div className="moderation-inline-actions">
            <button className="button ghost" onClick={onModerate} type="button">
              Moderate item
            </button>
            <button className="button danger" disabled={deletingKey === `food-item:${item.id}`} onClick={onDelete} type="button">
              {deletingKey === `food-item:${item.id}` ? 'Deleting...' : 'Delete item'}
            </button>
          </div>
        ) : null}
      </div>
      {item.notes?.trim() ? <span className="text-muted">"{item.notes.trim()}"</span> : null}
      {item.description?.trim() ? <span className="text-muted">{item.description.trim()}</span> : null}
      <ModerationPhotoStrip onPhotoClick={onPhotoClick} photos={item.photos} />
    </div>
  );
}

function RestaurantListItemRow({
  deletingKey,
  item,
  onDelete,
  onModerate,
  showActions = true,
}: {
  deletingKey: string | null;
  item: ModerationRestaurantListItem;
  onDelete: () => void;
  onModerate: () => void;
  showActions?: boolean;
}) {
  return (
    <div className="list-item moderation-subitem">
      <div className="summary-row moderation-summary-row-top">
        <div>
          <strong>{item.restaurantName || 'Unknown restaurant'}</strong>
          <div className="tag-row tag-row-start">
            <ModerationBadge value={getContentModerationStatus(item.moderationStatus)} />
            {item.foodItemName ? <span className="tag">Saved: {item.foodItemName}</span> : null}
            {item.userFoodItemName ? <span className="tag">Rated: {item.userFoodItemName}</span> : null}
            {typeof item.foodItemRating === 'number' && item.foodItemRating > 0 ? (
              <span className="tag">Saved rating {formatRating(item.foodItemRating)}</span>
            ) : null}
            {typeof item.userFoodItemRating === 'number' && item.userFoodItemRating > 0 ? (
              <span className="tag">Own rating {formatRating(item.userFoodItemRating)}</span>
            ) : null}
          </div>
        </div>
        {showActions ? (
          <div className="moderation-inline-actions">
            <button className="button ghost" onClick={onModerate} type="button">
              Moderate item
            </button>
            <button className="button danger" disabled={deletingKey === `list-item:${item.id}`} onClick={onDelete} type="button">
              {deletingKey === `list-item:${item.id}` ? 'Deleting...' : 'Delete item'}
            </button>
          </div>
        ) : null}
      </div>
      {item.restaurantLocation?.trim() ? (
        <span className="text-muted">{item.restaurantLocation.trim()}</span>
      ) : null}
      {item.note?.trim() ? <span className="text-muted">{item.note.trim()}</span> : null}
    </div>
  );
}

function FeedEntryCard({
  deletingKey,
  entry,
  onDelete,
  onDeleteItem,
  onModerate,
  onModerateItem,
  onOpenCarousel,
  showActions = true,
}: {
  deletingKey: string | null;
  entry: ModerationFeedEntry;
  onDelete: () => void;
  onDeleteItem: (item: ModerationFeedItem) => void;
  onModerate: () => void;
  onModerateItem: (item: ModerationFeedItem) => void;
  onOpenCarousel: (photos: ModerationPhoto[], initialIndex: number) => void;
  showActions?: boolean;
}) {
  if (entry.contentType === 'food-product') {
    return (
      <article className="detail-card moderation-entry">
        <div className="summary-row moderation-summary-row-top">
          <div>
            <p className="eyebrow">Food Product</p>
            <h3 style={{ marginBottom: 6 }}>{entry.itemName || 'Unnamed food product'}</h3>
            <div className="tag-row tag-row-start">
              <span className="tag">{formatVisibility(entry.visibility)}</span>
              {entry.itemCategory?.trim() ? <span className="tag">{entry.itemCategory.trim()}</span> : null}
              <span className="tag">{formatRating(entry.rating)}</span>
              <ModerationBadge value={getContentModerationStatus(entry.moderationStatus)} />
            </div>
          </div>
          {showActions ? (
            <div className="moderation-inline-actions">
              <button className="button ghost" onClick={onModerate} type="button">
                Moderate food product
              </button>
              <button className="button danger" disabled={deletingKey === `food-product:${entry.id}`} onClick={onDelete} type="button">
                {deletingKey === `food-product:${entry.id}` ? 'Deleting...' : 'Delete food product'}
              </button>
            </div>
          ) : null}
        </div>
        <div className="summary-list">
          <div className="summary-row">
            <span className="text-muted">Shown in feed as</span>
            <strong>{entry.restaurantName || 'Food Product'}</strong>
          </div>
          <div className="summary-row">
            <span className="text-muted">Created</span>
            <strong>{formatDateTime(entry.eventAt)}</strong>
          </div>
        </div>
        {entry.locationText?.trim() ? <p className="text-muted">{entry.locationText.trim()}</p> : null}
        {entry.notes?.trim() ? <p className="text-muted">"{entry.notes.trim()}"</p> : null}
        <ModerationPhotoStrip
          onPhotoClick={(photoId) => {
            const foodProductPhotos = entry.photos ?? [];
            const initialIndex = foodProductPhotos.findIndex((photo) => photo.id === photoId);
            if (initialIndex >= 0) {
              onOpenCarousel(foodProductPhotos, initialIndex);
            }
          }}
          photos={entry.photos ?? []}
        />
      </article>
    );
  }

  const visitPhotos = (entry.items ?? []).flatMap((item) => item.photos);

  return (
    <article className="detail-card moderation-entry">
      <div className="summary-row moderation-summary-row-top">
        <div>
          <p className="eyebrow">Visit</p>
          <h3 style={{ marginBottom: 6 }}>{entry.restaurantName || 'Unknown restaurant'}</h3>
          <div className="tag-row tag-row-start">
            <span className="tag">{formatVisibility(entry.visibility)}</span>
            {entry.restaurantCuisineType?.trim() ? <span className="tag">{entry.restaurantCuisineType.trim()}</span> : null}
            <ModerationBadge value={getContentModerationStatus(entry.moderationStatus)} />
          </div>
        </div>
        {showActions ? (
          <div className="moderation-inline-actions">
            <button className="button ghost" onClick={onModerate} type="button">
              Moderate visit
            </button>
            <button className="button danger" disabled={deletingKey === `visit:${entry.id}`} onClick={onDelete} type="button">
              {deletingKey === `visit:${entry.id}` ? 'Deleting...' : 'Delete visit'}
            </button>
          </div>
        ) : null}
      </div>
      <div className="summary-list">
        {entry.restaurantLocation?.trim() ? (
          <div className="summary-row">
            <span className="text-muted">Location</span>
            <strong>{entry.restaurantLocation.trim()}</strong>
          </div>
        ) : null}
        <div className="summary-row">
          <span className="text-muted">Created</span>
          <strong>{formatDateTime(entry.eventAt)}</strong>
        </div>
      </div>

      {entry.items && entry.items.length > 0 ? (
        <div className="inline-list">
          {entry.items.map((item) => (
            <VisitItemRow
              deletingKey={deletingKey}
              item={item}
              key={item.id}
              onDelete={() => onDeleteItem(item)}
              onModerate={() => onModerateItem(item)}
              onPhotoClick={(photoId) => {
                const initialIndex = visitPhotos.findIndex((photo) => photo.id === photoId);
                if (initialIndex >= 0) {
                  onOpenCarousel(visitPhotos, initialIndex);
                }
              }}
              showActions={showActions}
            />
          ))}
        </div>
      ) : (
        <div className="state-panel">
          <span className="text-muted">No visit items were found for this record.</span>
        </div>
      )}
    </article>
  );
}

function RestaurantListCard({
  deletingKey,
  list,
  onDeleteItem,
  onDeleteList,
  onModerateItem,
  onModerateList,
  showActions = true,
}: {
  deletingKey: string | null;
  list: ModerationRestaurantList;
  onDeleteItem: (item: ModerationRestaurantListItem) => void;
  onDeleteList: () => void;
  onModerateItem: (item: ModerationRestaurantListItem) => void;
  onModerateList: () => void;
  showActions?: boolean;
}) {
  const activityDisplay = getCreatedUpdatedDisplay(list.created, list.updated, {
    createdLabel: 'Created',
  });

  return (
    <article className="detail-card moderation-entry">
      <div className="summary-row moderation-summary-row-top">
        <div>
          <p className="eyebrow">List</p>
          <h3 style={{ marginBottom: 6 }}>{list.name}</h3>
          <div className="tag-row tag-row-start">
            <span className="tag">{formatVisibility(list.visibility)}</span>
            <ModerationBadge value={getContentModerationStatus(list.moderationStatus)} />
            {list.isDefault ? <span className="tag">Default</span> : null}
            {list.isCollaborative ? <span className="tag">Collaborative</span> : null}
          </div>
        </div>
        {showActions ? (
          <div className="moderation-inline-actions">
            <button className="button ghost" onClick={onModerateList} type="button">
              Moderate list
            </button>
            <button className="button danger" disabled={deletingKey === `list:${list.id}`} onClick={onDeleteList} type="button">
              {deletingKey === `list:${list.id}` ? 'Deleting...' : 'Delete list'}
            </button>
          </div>
        ) : null}
      </div>

      {list.description?.trim() ? <p className="text-muted">{list.description.trim()}</p> : null}

      <div className="summary-row">
        <span className="text-muted">{activityDisplay.label}</span>
        <strong>{activityDisplay.value}</strong>
      </div>

      {list.items.length > 0 ? (
        <div className="inline-list">
          {list.items.map((item) => (
            <RestaurantListItemRow
              deletingKey={deletingKey}
              item={item}
              key={item.id}
              onDelete={() => onDeleteItem(item)}
              onModerate={() => onModerateItem(item)}
              showActions={showActions}
            />
          ))}
        </div>
      ) : (
        <div className="state-panel">
          <span className="text-muted">This list has no saved items.</span>
        </div>
      )}
    </article>
  );
}

function ContentModerationFields({
  draft,
  idPrefix,
  onChange,
}: {
  draft: ContentModerationDraft;
  idPrefix: string;
  onChange: (nextValue: ContentModerationDraft) => void;
}) {
  const selectedAction = contentActionOptions.find((option) => option.value === draft.action) ?? contentActionOptions[0];
  const selectedAppealState =
    moderationAppealOptions.find((option) => option.value === draft.appealState) ?? moderationAppealOptions[0];

  return (
    <>
      <div className="moderation-form-grid">
        <div className="field">
          <label htmlFor={`${idPrefix}-action`}>Action</label>
          <select
            className="input"
            id={`${idPrefix}-action`}
            onChange={(event) => onChange({ ...draft, action: event.target.value as ModerationAction })}
            value={draft.action}
          >
            {contentActionOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
              ))}
            </select>
          <div className="moderation-field-help">
            <strong>{selectedAction.label}</strong>
            <span className="text-muted">{selectedAction.description}</span>
          </div>
        </div>

        <div className="field">
          <label htmlFor={`${idPrefix}-reason`}>Reason</label>
          <select
            className="input"
            id={`${idPrefix}-reason`}
            onChange={(event) =>
              onChange({
                ...draft,
                reasonCode: event.target.value as ModerationReasonCode | '',
              })
            }
            value={draft.reasonCode}
          >
            {moderationReasonOptions.map((option) => (
              <option key={option.value || 'none'} value={option.value}>
                {option.label}
              </option>
              ))}
            </select>
        </div>

        <div className="field">
          <label htmlFor={`${idPrefix}-appeal`}>Appeal state</label>
          <select
            className="input"
            id={`${idPrefix}-appeal`}
            onChange={(event) =>
              onChange({
                ...draft,
                appealState: event.target.value as ModerationAppealState,
              })
            }
            value={draft.appealState}
          >
            {moderationAppealOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
              ))}
            </select>
          <div className="moderation-field-help">
            <strong>{selectedAppealState.label}</strong>
            <span className="text-muted">{selectedAppealState.description}</span>
            <span className="text-muted">
              Appeal state only updates the moderation case record. It does not change the content visibility or status by
              itself.
            </span>
          </div>
        </div>
      </div>

      <div className="field">
        <label htmlFor={`${idPrefix}-note`}>Moderator note</label>
        <textarea
          className="input moderation-textarea"
          id={`${idPrefix}-note`}
          onChange={(event) => onChange({ ...draft, moderatorNote: event.target.value })}
          placeholder="Internal context for other moderators"
          value={draft.moderatorNote}
        />
      </div>

      <div className="field">
        <label htmlFor={`${idPrefix}-notice`}>User notice</label>
        <textarea
          className="input moderation-textarea"
          id={`${idPrefix}-notice`}
          onChange={(event) => onChange({ ...draft, userNotice: event.target.value })}
          placeholder="Optional message shown to the user"
          value={draft.userNotice}
        />
      </div>
    </>
  );
}

function InlineCaseModerationPanel({
  draft,
  onChange,
  onSubmit,
  submitting,
  target,
}: {
  draft: ContentModerationDraft;
  onChange: (nextValue: ContentModerationDraft) => void;
  onSubmit: () => void;
  submitting: boolean;
  target: ContentModerationTarget;
}) {
  return (
    <section className="detail-card moderation-inline-panel">
      <div>
        <p className="eyebrow">Moderation controls</p>
        <h3 style={{ marginBottom: 4 }}>Take action on this record</h3>
        <p className="text-muted" style={{ margin: 0 }}>
          These controls apply to {target.title}.
        </p>
      </div>

      <ContentModerationFields
        draft={draft}
        idPrefix={`inline-moderation-${target.recordId}`}
        onChange={onChange}
      />

      <div className="moderation-inline-actions moderation-inline-actions-end">
        <button className="button" disabled={submitting} onClick={onSubmit} type="button">
          {submitting ? 'Saving...' : 'Save moderation action'}
        </button>
      </div>
    </section>
  );
}

function ModerationCaseListItem({
  caseRecord,
  actionDisabled,
  actionLabel,
  active = false,
  onAction,
  onSelect,
}: {
  caseRecord: ModerationCase;
  actionDisabled?: boolean;
  actionLabel?: string;
  active?: boolean;
  onAction?: () => void;
  onSelect?: () => void;
}) {
  const targetUser = caseRecord.expand?.targetUser;
  const reportCount = getReportCount(caseRecord);

  return (
    <article className={`record-overview-card moderation-case-list-item${active ? ' active' : ''}`}>
      <div className="summary-row moderation-summary-row-top">
        <div>
          <p className="eyebrow">Case</p>
          <strong>{caseRecord.targetLabel?.trim() || formatModerationLabel(caseRecord.targetType)}</strong>
        </div>
        <div className="tag-row tag-row-start">
          <ModerationBadge value={caseRecord.status} />
          <span className="tag">{formatModerationLabel(caseRecord.targetType)}</span>
          {caseRecord.reasonCode ? <span className="tag">{formatModerationLabel(caseRecord.reasonCode)}</span> : null}
          {reportCount > 0 ? <span className="tag">{reportCount} report{reportCount === 1 ? '' : 's'}</span> : null}
        </div>
      </div>

      <div className="moderation-case-list-meta">
        <div>
          <span className="text-muted">Target user</span>
          <strong>{targetUser?.email || 'Unknown user'}</strong>
        </div>
        <div>
          <span className="text-muted">Latest report</span>
          <strong>{formatDateTime(caseRecord.latestReportedAt || caseRecord.updated)}</strong>
        </div>
      </div>

      <div className="moderation-inline-actions">
        {onSelect ? (
          <button className="button ghost" disabled={active} onClick={onSelect} type="button">
            {active ? 'Selected' : 'Open case'}
          </button>
        ) : null}
        {onAction && actionLabel ? (
          <button className="button" disabled={actionDisabled} onClick={onAction} type="button">
            {actionLabel}
          </button>
        ) : null}
      </div>
    </article>
  );
}

function ContentModerationModal({
  draft,
  onChange,
  onClose,
  onSubmit,
  submitting,
  target,
}: {
  draft: ContentModerationDraft;
  onChange: (nextValue: ContentModerationDraft) => void;
  onClose: () => void;
  onSubmit: () => void;
  submitting: boolean;
  target: ContentModerationTarget;
}) {
  return (
    <div className="modal-backdrop moderation-modal-backdrop" onClick={onClose} role="presentation">
      <div
        aria-label="Moderate content"
        aria-modal="true"
        className="moderation-action-modal"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div className="summary-row">
          <div>
            <p className="eyebrow">Content moderation</p>
            <h3 style={{ marginBottom: 4 }}>{target.title}</h3>
            {target.subtitle?.trim() ? <p className="text-muted">{target.subtitle.trim()}</p> : null}
          </div>
          <button className="button ghost" onClick={onClose} type="button">
            Close
          </button>
        </div>

        <ContentModerationFields draft={draft} idPrefix="modal-moderation" onChange={onChange} />

        <div className="moderation-inline-actions moderation-inline-actions-end">
          <button className="button ghost" onClick={onClose} type="button">
            Cancel
          </button>
          <button className="button" disabled={submitting} onClick={onSubmit} type="button">
            {submitting ? 'Saving...' : 'Save moderation action'}
          </button>
        </div>
      </div>
    </div>
  );
}

export function ModerationPage() {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialEmail = searchParams.get('email') ?? '';
  const [activeTab, setActiveTab] = useState<ModerationMainTab>(initialEmail ? 'lookup' : 'queue');
  const [emailInput, setEmailInput] = useState(initialEmail);
  const [selectedEmail, setSelectedEmail] = useState(normalizeEmail(initialEmail));
  const [carouselState, setCarouselState] = useState<{ initialIndex: number; photos: ModerationPhoto[] } | null>(null);
  const [focusedCaseId, setFocusedCaseId] = useState<string | null>(null);
  const [lookupWorkspaceTab, setLookupWorkspaceTab] = useState<ModerationWorkspaceTab>('history');
  const [accountForm, setAccountForm] = useState<AccountModerationFormState | null>(null);
  const [contentModerationDraft, setContentModerationDraft] = useState<ContentModerationDraft>(createDefaultContentModerationDraft);
  const [contentModerationTarget, setContentModerationTarget] = useState<ContentModerationTarget | null>(null);
  const [caseModerationDraft, setCaseModerationDraft] = useState<ContentModerationDraft>(createDefaultContentModerationDraft);

  const lookupQuery = useQuery({
    enabled: Boolean(selectedEmail),
    queryKey: ['admin', 'moderation', 'lookup', selectedEmail],
    queryFn: () => findUserByEmail(selectedEmail),
  });

  const profileQuery = useQuery({
    enabled: Boolean(lookupQuery.data?.id),
    queryKey: ['admin', 'user-profile', lookupQuery.data?.id],
    queryFn: () => getUserModerationProfile(lookupQuery.data!.id),
  });

  useEffect(() => {
    if (profileQuery.data?.user) {
      setAccountForm(buildAccountModerationFormState(profileQuery.data.user));
    }
  }, [profileQuery.data?.user]);

  useEffect(() => {
    setCaseModerationDraft(createDefaultContentModerationDraft());
  }, [focusedCaseId]);

  const queueCasesQuery = useQuery({
    queryKey: ['admin', 'moderation', 'cases', 'active', 'unassigned'],
    queryFn: () =>
      listModerationCases({
        assignment: 'unassigned',
        status: 'active',
      }),
  });

  const claimedCasesQuery = useQuery({
    queryKey: ['admin', 'moderation', 'cases', 'active', 'mine'],
    queryFn: () =>
      listModerationCases({
        assignment: 'mine',
        status: 'active',
      }),
  });

  useEffect(() => {
    if (!focusedCaseId) {
      return;
    }

    if (activeTab === 'cases' && claimedCasesQuery.data && !claimedCasesQuery.data.some((caseRecord) => caseRecord.id === focusedCaseId)) {
      setFocusedCaseId(null);
    }
  }, [activeTab, claimedCasesQuery.data, focusedCaseId]);

  const refreshModerationData = async () => {
    await queryClient.invalidateQueries({ queryKey: ['admin', 'moderation', 'cases'] });
    await queryClient.invalidateQueries({ queryKey: ['admin', 'user-profile'] });
    if (selectedEmail) {
      await queryClient.invalidateQueries({ queryKey: ['admin', 'moderation', 'lookup', selectedEmail] });
    }
  };

  const deleteMutation = useMutation({
    mutationFn: deleteModeratedUserContent,
    onSuccess: refreshModerationData,
  });

  const userModerationMutation = useMutation({
    mutationFn: updateUserModeration,
    onSuccess: refreshModerationData,
  });

  const contentModerationMutation = useMutation({
    mutationFn: moderateUserContent,
    onSuccess: async () => {
      await refreshModerationData();
      setContentModerationTarget(null);
      setContentModerationDraft(createDefaultContentModerationDraft());
      setCaseModerationDraft(createDefaultContentModerationDraft());
    },
  });

  const claimCaseMutation = useMutation({
    mutationFn: (caseRecord: ModerationCase) => claimModerationCase(caseRecord.id),
    onSuccess: async (_data, caseRecord) => {
      await refreshModerationData();
      const normalizedEmail = normalizeEmail(caseRecord.expand?.targetUser?.email ?? '');
      if (normalizedEmail) {
        setEmailInput(normalizedEmail);
        setSelectedEmail(normalizedEmail);
        setFocusedCaseId(caseRecord.id);
        setActiveTab('cases');
      }
    },
  });

  const releaseCaseMutation = useMutation({
    mutationFn: (caseRecord: ModerationCase) => releaseModerationCase(caseRecord.id),
    onSuccess: async (_data, caseRecord) => {
      await refreshModerationData();
      if (focusedCaseId === caseRecord.id) {
        setFocusedCaseId(null);
      }
    },
  });

  const deletingKey = deleteMutation.variables
    ? `${deleteMutation.variables.contentType}:${deleteMutation.variables.recordId}`
    : null;
  const orderedLookupCases = profileQuery.data ? sortModerationCasesForReview(profileQuery.data.moderationCases) : [];
  const selectedClaimedCase = claimedCasesQuery.data?.find((caseRecord) => caseRecord.id === focusedCaseId) ?? null;
  const selectedCaseModerationTarget =
    selectedClaimedCase && profileQuery.data ? buildContentModerationTargetFromCase(selectedClaimedCase, profileQuery.data) : null;
  const orderedQueueCases = sortModerationCasesForReview(queueCasesQuery.data ?? []);
  const orderedClaimedCases = sortModerationCasesForReview(claimedCasesQuery.data ?? []);

  const handleLookupSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const normalized = normalizeEmail(emailInput);
    deleteMutation.reset();
    userModerationMutation.reset();
    contentModerationMutation.reset();
    setSelectedEmail(normalized);
    setSearchParams(normalized ? { email: normalized } : {});
  };

  const clearLookup = () => {
    deleteMutation.reset();
    userModerationMutation.reset();
    contentModerationMutation.reset();
    setEmailInput('');
    setSelectedEmail('');
    setFocusedCaseId(null);
    setLookupWorkspaceTab('history');
    setSearchParams({});
    setCarouselState(null);
    setContentModerationTarget(null);
  };

  const requestDelete = (contentType: ModerationTargetContentType, recordId: string, label: string) => {
    if (!profileQuery.data?.user.id) {
      return;
    }

    if (!window.confirm(`Delete this ${label}? This cannot be undone.`)) {
      return;
    }

    deleteMutation.mutate({
      userId: profileQuery.data.user.id,
      contentType,
      recordId,
    });
  };

  const openContentModeration = (target: ContentModerationTarget) => {
    contentModerationMutation.reset();
    setContentModerationDraft(createDefaultContentModerationDraft());
    setContentModerationTarget(target);
  };

  const submitContentModeration = () => {
    if (!profileQuery.data?.user.id || !contentModerationTarget) {
      return;
    }

    contentModerationMutation.mutate({
      userId: profileQuery.data.user.id,
      contentType: contentModerationTarget.contentType,
      recordId: contentModerationTarget.recordId,
      action: contentModerationDraft.action,
      appealState: contentModerationDraft.appealState,
      moderatorNote: contentModerationDraft.moderatorNote.trim() || undefined,
      reasonCode: contentModerationDraft.reasonCode || undefined,
      userNotice: contentModerationDraft.userNotice.trim() || undefined,
    });
  };

  const submitSelectedCaseModeration = () => {
    if (!profileQuery.data?.user.id || !selectedCaseModerationTarget) {
      return;
    }

    contentModerationMutation.mutate({
      userId: profileQuery.data.user.id,
      contentType: selectedCaseModerationTarget.contentType,
      recordId: selectedCaseModerationTarget.recordId,
      action: caseModerationDraft.action,
      appealState: caseModerationDraft.appealState,
      moderatorNote: caseModerationDraft.moderatorNote.trim() || undefined,
      reasonCode: caseModerationDraft.reasonCode || undefined,
      userNotice: caseModerationDraft.userNotice.trim() || undefined,
    });
  };

  const submitAccountModeration = (action?: ModerationAction) => {
    if (!profileQuery.data?.user.id || !accountForm) {
      return;
    }

    const parsedWarningCount = Number.parseInt(accountForm.warningCount || '0', 10);
    const normalizedWarningCount = Number.isNaN(parsedWarningCount) ? 0 : parsedWarningCount;
    userModerationMutation.mutate({
      userId: profileQuery.data.user.id,
      action,
      contentModerationMode: accountForm.contentModerationMode,
      moderationNotice: accountForm.moderationNotice,
      moderationNotes: accountForm.moderationNotes,
      moderationState: action ? undefined : accountForm.moderationState,
      photoSuspendedUntil: action === 'restore' ? '' : toIsoStringOrEmpty(accountForm.photoSuspendedUntil),
      postingSuspendedUntil: action === 'restore' ? '' : toIsoStringOrEmpty(accountForm.postingSuspendedUntil),
      warningCount: action === 'warn' ? normalizedWarningCount + 1 : normalizedWarningCount,
    });
  };

  const reviewModerationCase = (caseRecord: ModerationCase) => {
    const normalized = normalizeEmail(caseRecord.expand?.targetUser?.email ?? '');
    if (!normalized) {
      return;
    }

    setEmailInput(normalized);
    setSelectedEmail(normalized);
    setFocusedCaseId(caseRecord.id);
    setActiveTab('cases');
  };

  const openLookupWorkspaceForCurrentEmail = () => {
    if (!selectedEmail) {
      return;
    }

    setEmailInput(selectedEmail);
    setLookupWorkspaceTab('history');
    setActiveTab('lookup');
    setSearchParams({ email: selectedEmail });
  };

  const errorMessage =
    (deleteMutation.error instanceof Error && deleteMutation.error.message) ||
    (userModerationMutation.error instanceof Error && userModerationMutation.error.message) ||
    (contentModerationMutation.error instanceof Error && contentModerationMutation.error.message) ||
    (claimCaseMutation.error instanceof Error && claimCaseMutation.error.message) ||
    (releaseCaseMutation.error instanceof Error && releaseCaseMutation.error.message) ||
    '';

  return (
    <>
      <section className="panel">
        <p className="eyebrow">Moderation workspace</p>
        <h2 style={{ marginBottom: 4 }}>Queue, cases, and account lookups in one place</h2>
        <p className="text-muted" style={{ margin: 0 }}>
          Claim new work from the queue, review your claimed cases record-by-record, or inspect a user directly by
          exact email.
        </p>
        <div aria-label="Moderation workspace tabs" className="tab-bar" role="tablist">
          {moderationMainTabs.map((tab) => (
            <button
              aria-selected={activeTab === tab.value}
              className={`tab-button ${activeTab === tab.value ? 'active' : ''}`}
              key={tab.value}
              onClick={() => setActiveTab(tab.value)}
              role="tab"
              type="button"
            >
              {tab.label}
            </button>
          ))}
        </div>
      </section>

      {errorMessage ? (
        <section className="state-panel error">
          <strong>Moderation action failed</strong>
          <span className="text-muted">{errorMessage}</span>
        </section>
      ) : null}

      {activeTab === 'queue' ? (
        <section className="table-panel">
          <div className="summary-row moderation-summary-row-top">
            <div>
              <p className="eyebrow">Moderation queue</p>
              <h3 style={{ marginBottom: 4 }}>Unassigned cases ready to be claimed</h3>
              <p className="text-muted" style={{ margin: 0 }}>
                Claimed cases with no movement for three days return to this queue automatically.
              </p>
            </div>
          </div>

          {queueCasesQuery.isLoading ? (
            <div className="state-panel">
              <strong>Loading unassigned cases...</strong>
            </div>
          ) : null}

          {queueCasesQuery.isError ? (
            <div className="state-panel error">
              <strong>Could not load the moderation queue</strong>
              <span className="text-muted">
                {queueCasesQuery.error instanceof Error
                  ? queueCasesQuery.error.message
                  : 'The moderation queue request failed.'}
              </span>
            </div>
          ) : null}

          {queueCasesQuery.data && queueCasesQuery.data.length === 0 ? (
            <div className="state-panel">
              <strong>No unassigned cases</strong>
              <span className="text-muted">New reports will appear here when they need moderator attention.</span>
            </div>
          ) : null}

          {queueCasesQuery.data && queueCasesQuery.data.length > 0 ? (
            <PaginatedCollection items={orderedQueueCases} itemsPerPage={12} resetKey="queue">
              {(pageCases) => (
                <div className="inline-list">
                  {pageCases.map((caseRecord) => (
                    <ModerationCaseListItem
                      actionDisabled={claimCaseMutation.isPending && claimCaseMutation.variables?.id === caseRecord.id}
                      actionLabel={
                        claimCaseMutation.isPending && claimCaseMutation.variables?.id === caseRecord.id
                          ? 'Claiming...'
                          : 'Claim case'
                      }
                      caseRecord={caseRecord}
                      key={caseRecord.id}
                      onAction={() => claimCaseMutation.mutate(caseRecord)}
                    />
                  ))}
                </div>
              )}
            </PaginatedCollection>
          ) : null}
        </section>
      ) : null}

      {activeTab === 'cases' ? (
        <section className="table-panel">
          <div className="summary-row moderation-summary-row-top">
            <div>
              <p className="eyebrow">Cases</p>
              <h3 style={{ marginBottom: 4 }}>Your claimed moderation work</h3>
              <p className="text-muted" style={{ margin: 0 }}>
                Select a claimed case on the left to review the exact reported record and moderate it.
              </p>
            </div>
          </div>

          <div className="moderation-case-workspace">
            <aside className="detail-card moderation-case-sidebar">
              <div>
                <p className="eyebrow">Claimed cases</p>
                <h3 style={{ marginBottom: 4 }}>Assigned to you</h3>
              </div>

              {claimedCasesQuery.isLoading ? (
                <div className="state-panel">
                  <strong>Loading claimed cases...</strong>
                </div>
              ) : null}

              {claimedCasesQuery.isError ? (
                <div className="state-panel error">
                  <strong>Could not load claimed cases</strong>
                  <span className="text-muted">
                    {claimedCasesQuery.error instanceof Error
                      ? claimedCasesQuery.error.message
                      : 'The claimed cases request failed.'}
                  </span>
                </div>
              ) : null}

              {claimedCasesQuery.data && claimedCasesQuery.data.length === 0 ? (
                <div className="state-panel">
                  <strong>No claimed cases</strong>
                  <span className="text-muted">Claim a case from the moderation queue to start reviewing it here.</span>
                </div>
              ) : null}

              {claimedCasesQuery.data && claimedCasesQuery.data.length > 0 ? (
                <PaginatedCollection items={orderedClaimedCases} itemsPerPage={10} resetKey="claimed-cases">
                  {(pageCases) => (
                    <div className="inline-list">
                      {pageCases.map((caseRecord) => (
                        <ModerationCaseListItem
                          active={focusedCaseId === caseRecord.id}
                          caseRecord={caseRecord}
                          key={caseRecord.id}
                          onSelect={() => reviewModerationCase(caseRecord)}
                        />
                      ))}
                    </div>
                  )}
                </PaginatedCollection>
              ) : null}
            </aside>

            <div className="table-panel moderation-case-review-pane">
              {!selectedClaimedCase ? (
                <div className="state-panel moderation-case-empty">
                  <strong>No case selected</strong>
                  <span className="text-muted">Choose a claimed case from the list to review the reported record.</span>
                </div>
              ) : null}

              {selectedClaimedCase && selectedEmail && lookupQuery.isLoading ? (
                <div className="state-panel">
                  <strong>Loading case owner...</strong>
                </div>
              ) : null}

              {selectedClaimedCase && selectedEmail && lookupQuery.isError ? (
                <div className="state-panel error">
                  <strong>Could not load the case owner</strong>
                  <span className="text-muted">
                    {lookupQuery.error instanceof Error
                      ? lookupQuery.error.message
                      : 'The user lookup request failed.'}
                  </span>
                </div>
              ) : null}

              {selectedClaimedCase && lookupQuery.data && profileQuery.isLoading ? (
                <div className="state-panel">
                  <strong>Loading reported record...</strong>
                </div>
              ) : null}

              {selectedClaimedCase && lookupQuery.data && profileQuery.isError ? (
                <div className="state-panel error">
                  <strong>Could not load the reported record</strong>
                  <span className="text-muted">
                    {profileQuery.error instanceof Error
                      ? profileQuery.error.message
                      : 'The moderation profile request failed.'}
                  </span>
                </div>
              ) : null}

              {selectedClaimedCase && lookupQuery.data && profileQuery.data ? (
                <div className="moderation-case-review-stack">
                  <div className="summary-row moderation-summary-row-top">
                    <div>
                      <p className="eyebrow">Selected case</p>
                      <h3 style={{ marginBottom: 4 }}>
                        {selectedClaimedCase.targetLabel?.trim() || formatModerationLabel(selectedClaimedCase.targetType)}
                      </h3>
                      <p className="text-muted" style={{ margin: 0 }}>
                        Viewing the specific {formatModerationLabel(selectedClaimedCase.targetType).toLowerCase()} record
                        {selectedClaimedCase.reasonCode
                          ? ` reported for ${formatModerationLabel(selectedClaimedCase.reasonCode).toLowerCase()}`
                          : ''}
                        .
                      </p>
                    </div>
                    <div className="moderation-inline-actions">
                      <button className="button ghost" onClick={openLookupWorkspaceForCurrentEmail} type="button">
                        Open email lookup
                      </button>
                      <button
                        className="button ghost"
                        disabled={releaseCaseMutation.isPending && releaseCaseMutation.variables?.id === selectedClaimedCase.id}
                        onClick={() => releaseCaseMutation.mutate(selectedClaimedCase)}
                        type="button"
                      >
                        {releaseCaseMutation.isPending && releaseCaseMutation.variables?.id === selectedClaimedCase.id
                          ? 'Releasing...'
                          : 'Release case'}
                      </button>
                    </div>
                  </div>

                  <div className="moderation-meta-grid">
                    <ModerationMetaBlock
                      label="Target user"
                      value={selectedClaimedCase.expand?.targetUser?.email || profileQuery.data.user.email}
                    />
                    <ModerationMetaBlock label="Status" value={formatModerationLabel(selectedClaimedCase.status)} />
                    <ModerationMetaBlock
                      label="Reason"
                      value={selectedClaimedCase.reasonCode ? formatModerationLabel(selectedClaimedCase.reasonCode) : 'No reason selected'}
                    />
                    <ModerationMetaBlock
                      label="Latest report"
                      value={formatDateTime(selectedClaimedCase.latestReportedAt || selectedClaimedCase.updated)}
                    />
                  </div>

                  <div className="tag-row tag-row-start">
                    <ModerationBadge value={selectedClaimedCase.status} />
                    {selectedClaimedCase.action ? <ModerationBadge value={selectedClaimedCase.action} /> : null}
                    <span className="tag">{formatModerationLabel(selectedClaimedCase.targetType)}</span>
                    {selectedClaimedCase.reasonCode ? (
                      <span className="tag">{formatModerationLabel(selectedClaimedCase.reasonCode)}</span>
                    ) : null}
                    {getReportCount(selectedClaimedCase) > 0 ? (
                      <span className="tag">
                        {getReportCount(selectedClaimedCase)} report{getReportCount(selectedClaimedCase) === 1 ? '' : 's'}
                      </span>
                    ) : null}
                  </div>

                  <ReportedContentPreview
                    caseRecord={selectedClaimedCase}
                    deletingKey={deletingKey}
                    onDelete={requestDelete}
                    onModerate={openContentModeration}
                    onModerateListItem={(list, item) =>
                      openContentModeration({
                        contentType: 'list-item',
                        recordId: item.id,
                        title: item.restaurantName || 'List item',
                        subtitle: `Saved in ${list.name}`,
                      })
                    }
                    onModerateVisitItem={(entry, item) =>
                      openContentModeration({
                        contentType: 'food-item',
                        recordId: item.id,
                        title: item.name,
                        subtitle: entry.restaurantName ? `Visit item from ${entry.restaurantName}` : 'Visit item',
                      })
                    }
                    onOpenCarousel={(photos, initialIndex) => {
                      setCarouselState({ photos, initialIndex });
                    }}
                    profile={profileQuery.data}
                    showActions={false}
                  />

                  <div>
                    <p className="eyebrow">Report history</p>
                    <ModerationReportHistory reports={selectedClaimedCase.reports ?? []} />
                  </div>

                  {selectedCaseModerationTarget ? (
                    <InlineCaseModerationPanel
                      draft={caseModerationDraft}
                      onChange={setCaseModerationDraft}
                      onSubmit={submitSelectedCaseModeration}
                      submitting={contentModerationMutation.isPending}
                      target={selectedCaseModerationTarget}
                    />
                  ) : (
                    <div className="state-panel">
                      <strong>No inline moderation controls available</strong>
                      <span className="text-muted">
                        This case type does not have a direct record-moderation target in the current admin UI.
                      </span>
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          </div>
        </section>
      ) : null}

      {activeTab === 'lookup' ? (
        <>
          <section className="panel">
            <form className="moderation-lookup-form" onSubmit={handleLookupSubmit}>
              <div className="field">
                <label htmlFor="moderation-email">User email</label>
                <input
                  autoComplete="off"
                  className="input"
                  id="moderation-email"
                  onChange={(event) => setEmailInput(event.target.value)}
                  placeholder="person@example.com"
                  type="email"
                  value={emailInput}
                />
              </div>
              <div className="moderation-lookup-actions">
                <button className="button" type="submit">
                  Load content
                </button>
                <button className="button ghost" onClick={clearLookup} type="button">
                  Clear
                </button>
              </div>
            </form>
          </section>

          {!selectedEmail ? (
            <section className="state-panel">
              <strong>No account selected</strong>
              <span className="text-muted">Enter an exact email address to inspect a user account.</span>
            </section>
          ) : null}

          {selectedEmail && lookupQuery.isLoading ? (
            <section className="state-panel">
              <strong>Looking up user...</strong>
            </section>
          ) : null}

          {selectedEmail && lookupQuery.isError ? (
            <section className="state-panel error">
              <strong>Could not find that user</strong>
              <span className="text-muted">
                {lookupQuery.error instanceof Error
                  ? lookupQuery.error.message
                  : 'No user was found for that email address.'}
              </span>
            </section>
          ) : null}

          {selectedEmail && lookupQuery.data && profileQuery.isLoading ? (
            <section className="state-panel">
              <strong>Loading user moderation workspace...</strong>
            </section>
          ) : null}

          {selectedEmail && lookupQuery.data && profileQuery.isError ? (
            <section className="state-panel error">
              <strong>Could not load moderation content</strong>
              <span className="text-muted">
                {profileQuery.error instanceof Error
                  ? profileQuery.error.message
                  : 'The moderation workspace request failed.'}
              </span>
            </section>
          ) : null}

          {selectedEmail && lookupQuery.data && profileQuery.data && accountForm ? (
            <>
              <section className="panel">
                <div className="summary-row moderation-summary-row-top">
                  <div>
                    <p className="eyebrow">Individual lookup</p>
                    <h2 style={{ marginBottom: 6 }}>{profileQuery.data.user.email}</h2>
                    <div className="tag-row tag-row-start">
                      <span className="tag">{profileQuery.data.user.name?.trim() || 'No display name'}</span>
                      <ModerationBadge value={profileQuery.data.user.moderationState} />
                      <ModerationBadge value={profileQuery.data.user.contentModerationMode} />
                      <span className="tag">Warnings: {Math.trunc(profileQuery.data.user.warningCount ?? 0)}</span>
                      {profileQuery.data.user.isAdmin ? <span className="tag">admin</span> : null}
                      {profileQuery.data.user.isSubscriber ? <span className="tag">subscriber</span> : null}
                      {profileQuery.data.user.isBetaUser ? <span className="tag">beta</span> : null}
                    </div>
                  </div>
                  <Link className="button ghost" to={`/users/${profileQuery.data.user.id}`}>
                    Open full user detail
                  </Link>
                </div>
              </section>

              <section className="metric-grid">
                <div className="metric-card">
                  <span className="text-muted">Feed entries</span>
                  <div className="metric-value">{profileQuery.data.feedEntries.length}</div>
                </div>
                <div className="metric-card">
                  <span className="text-muted">Lists</span>
                  <div className="metric-value">{profileQuery.data.restaurantLists.length}</div>
                </div>
                <div className="metric-card">
                  <span className="text-muted">Cases</span>
                  <div className="metric-value">{profileQuery.data.moderationCases.length}</div>
                </div>
                <div className="metric-card">
                  <span className="text-muted">Photos</span>
                  <div className="metric-value">{profileQuery.data.recentPhotos.length}</div>
                </div>
              </section>

              <section className="table-panel moderation-context-panel">
                <div className="summary-row moderation-summary-row-top">
                  <div>
                    <p className="eyebrow">User workspace</p>
                    <h3 style={{ marginBottom: 4 }}>Moderation tools and account context</h3>
                    <p className="text-muted" style={{ margin: 0 }}>
                      Switch between account controls, case history, the user feed, and restaurant lists.
                    </p>
                  </div>
                </div>

                <div aria-label="Lookup workspace tabs" className="tab-bar" role="tablist">
                  {[
                    { id: 'history', label: 'Case history', count: orderedLookupCases.length },
                    { id: 'account', label: 'Account actions', count: 1 },
                    { id: 'feed', label: 'Feed entries', count: profileQuery.data.feedEntries.length },
                    { id: 'lists', label: 'Lists', count: profileQuery.data.restaurantLists.length },
                  ].map((tab) => (
                    <button
                      aria-selected={lookupWorkspaceTab === tab.id}
                      className={`tab-button ${lookupWorkspaceTab === tab.id ? 'active' : ''}`}
                      key={tab.id}
                      onClick={() => setLookupWorkspaceTab(tab.id as ModerationWorkspaceTab)}
                      role="tab"
                      type="button"
                    >
                      {tab.label} ({tab.count})
                    </button>
                  ))}
                </div>

                <div className="divider" />

                {lookupWorkspaceTab === 'account' ? (
                  <div className="tab-panel">
                    <div className="tab-panel-heading">
                      <h3>Warnings, suspensions, and pre-review</h3>
                      <p className="text-muted" style={{ margin: 0 }}>
                        Save the current account settings or use a quick action to warn, restrict, ban, or restore.
                      </p>
                    </div>

                    <div className="moderation-form-grid">
                      <div className="field">
                        <label htmlFor="account-state">Moderation state</label>
                        <select
                          className="input"
                          id="account-state"
                          onChange={(event) =>
                            setAccountForm((current) =>
                              current
                                ? {
                                    ...current,
                                    moderationState: event.target.value as NonNullable<AdminUser['moderationState']>,
                                  }
                                : current,
                            )
                          }
                          value={accountForm.moderationState}
                        >
                          {userModerationStateOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                        <span className="text-muted">
                          {userModerationStateOptions.find((option) => option.value === accountForm.moderationState)?.description}
                        </span>
                      </div>

                      <div className="field">
                        <label htmlFor="account-mode">Content mode</label>
                        <select
                          className="input"
                          id="account-mode"
                          onChange={(event) =>
                            setAccountForm((current) =>
                              current
                                ? {
                                    ...current,
                                    contentModerationMode: event.target.value as NonNullable<AdminUser['contentModerationMode']>,
                                  }
                                : current,
                            )
                          }
                          value={accountForm.contentModerationMode}
                        >
                          {userContentModeOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                        <span className="text-muted">
                          {userContentModeOptions.find((option) => option.value === accountForm.contentModerationMode)?.description}
                        </span>
                      </div>

                      <div className="field">
                        <label htmlFor="warning-count">Warning count</label>
                        <input
                          className="input"
                          id="warning-count"
                          min={0}
                          onChange={(event) =>
                            setAccountForm((current) => (current ? { ...current, warningCount: event.target.value } : current))
                          }
                          type="number"
                          value={accountForm.warningCount}
                        />
                      </div>

                      <div className="field">
                        <label htmlFor="posting-suspended-until">Posting suspended until</label>
                        <input
                          className="input"
                          id="posting-suspended-until"
                          onChange={(event) =>
                            setAccountForm((current) =>
                              current ? { ...current, postingSuspendedUntil: event.target.value } : current
                            )
                          }
                          type="datetime-local"
                          value={accountForm.postingSuspendedUntil}
                        />
                      </div>

                      <div className="field">
                        <label htmlFor="photo-suspended-until">Photo uploads suspended until</label>
                        <input
                          className="input"
                          id="photo-suspended-until"
                          onChange={(event) =>
                            setAccountForm((current) =>
                              current ? { ...current, photoSuspendedUntil: event.target.value } : current
                            )
                          }
                          type="datetime-local"
                          value={accountForm.photoSuspendedUntil}
                        />
                      </div>
                    </div>

                    <div className="field">
                      <label htmlFor="moderation-notice-text">User notice</label>
                      <textarea
                        className="input moderation-textarea"
                        id="moderation-notice-text"
                        onChange={(event) =>
                          setAccountForm((current) => (current ? { ...current, moderationNotice: event.target.value } : current))
                        }
                        placeholder="Optional notice shown to the user"
                        value={accountForm.moderationNotice}
                      />
                    </div>

                    <div className="field">
                      <label htmlFor="moderation-notes-text">Moderator notes</label>
                      <textarea
                        className="input moderation-textarea"
                        id="moderation-notes-text"
                        onChange={(event) =>
                          setAccountForm((current) => (current ? { ...current, moderationNotes: event.target.value } : current))
                        }
                        placeholder="Internal notes about this account"
                        value={accountForm.moderationNotes}
                      />
                    </div>

                    <div className="moderation-inline-actions moderation-wrap-actions">
                      <button className="button" disabled={userModerationMutation.isPending} onClick={() => submitAccountModeration()} type="button">
                        {userModerationMutation.isPending ? 'Saving...' : 'Save account moderation'}
                      </button>
                      <button className="button ghost" disabled={userModerationMutation.isPending} onClick={() => submitAccountModeration('warn')} type="button">
                        Warn
                      </button>
                      <button className="button ghost" disabled={userModerationMutation.isPending} onClick={() => submitAccountModeration('restrict')} type="button">
                        Restrict
                      </button>
                      <button className="button ghost" disabled={userModerationMutation.isPending} onClick={() => submitAccountModeration('ban')} type="button">
                        Ban
                      </button>
                      <button className="button ghost" disabled={userModerationMutation.isPending} onClick={() => submitAccountModeration('restore')} type="button">
                        Restore
                      </button>
                    </div>
                  </div>
                ) : null}

                {lookupWorkspaceTab === 'history' ? (
                  <div className="tab-panel">
                    <div className="tab-panel-heading">
                      <h3>Open and resolved cases for this user</h3>
                    </div>

                    {orderedLookupCases.length === 0 ? (
                      <div className="state-panel">
                        <span className="text-muted">No moderation cases have been recorded for this user yet.</span>
                      </div>
                    ) : (
                      <PaginatedCollection items={orderedLookupCases} itemsPerPage={10}>
                        {(pageCases) => (
                          <div className="inline-list">
                            {pageCases.map((caseRecord) => (
                              <ModerationCaseCard
                                caseRecord={caseRecord}
                                claimDisabled={claimCaseMutation.isPending && claimCaseMutation.variables?.id === caseRecord.id}
                                key={caseRecord.id}
                                onClaim={() => claimCaseMutation.mutate(caseRecord)}
                                onRelease={() => releaseCaseMutation.mutate(caseRecord)}
                                onReviewCase={() => reviewModerationCase(caseRecord)}
                                releaseDisabled={releaseCaseMutation.isPending && releaseCaseMutation.variables?.id === caseRecord.id}
                              />
                            ))}
                          </div>
                        )}
                      </PaginatedCollection>
                    )}
                  </div>
                ) : null}

                {lookupWorkspaceTab === 'feed' ? (
                  <div className="tab-panel">
                    <div className="tab-panel-heading">
                      <h3>What the user sees in the app</h3>
                    </div>

                    {profileQuery.data.feedEntries.length === 0 ? (
                      <div className="state-panel">
                        <span className="text-muted">No feed entries found for this user.</span>
                      </div>
                    ) : (
                      <PaginatedCollection items={profileQuery.data.feedEntries} itemsPerPage={8}>
                        {(pageEntries) => (
                          <div className="inline-list">
                            {pageEntries.map((entry) => (
                              <FeedEntryCard
                                deletingKey={deletingKey}
                                entry={entry}
                                key={`${entry.contentType}:${entry.id}`}
                                onDelete={() =>
                                  requestDelete(
                                    entry.contentType,
                                    entry.id,
                                    entry.contentType === 'visit' ? 'visit' : 'food product',
                                  )
                                }
                                onDeleteItem={(item) => requestDelete('food-item', item.id, 'visit item')}
                                onModerate={() =>
                                  openContentModeration({
                                    contentType: entry.contentType,
                                    recordId: entry.id,
                                    title:
                                      entry.contentType === 'visit'
                                        ? entry.restaurantName || 'Visit'
                                        : entry.itemName || 'Food Product',
                                    subtitle: entry.contentType === 'visit' ? 'Visit entry' : 'Food product entry',
                                  })
                                }
                                onModerateItem={(item) =>
                                  openContentModeration({
                                    contentType: 'food-item',
                                    recordId: item.id,
                                    title: item.name,
                                    subtitle: entry.restaurantName ? `Visit item from ${entry.restaurantName}` : 'Visit item',
                                  })
                                }
                                onOpenCarousel={(photos, initialIndex) => {
                                  setCarouselState({ photos, initialIndex });
                                }}
                              />
                            ))}
                          </div>
                        )}
                      </PaginatedCollection>
                    )}
                  </div>
                ) : null}

                {lookupWorkspaceTab === 'lists' ? (
                  <div className="tab-panel">
                    <div className="tab-panel-heading">
                      <h3>Saved and shared list content</h3>
                    </div>

                    {profileQuery.data.restaurantLists.length === 0 ? (
                      <div className="state-panel">
                        <span className="text-muted">No restaurant lists found for this user.</span>
                      </div>
                    ) : (
                      <PaginatedCollection items={profileQuery.data.restaurantLists} itemsPerPage={8}>
                        {(pageLists) => (
                          <div className="inline-list">
                            {pageLists.map((list) => (
                              <RestaurantListCard
                                deletingKey={deletingKey}
                                key={list.id}
                                list={list}
                                onDeleteItem={(item) => requestDelete('list-item', item.id, 'list item')}
                                onDeleteList={() => requestDelete('list', list.id, 'list')}
                                onModerateItem={(item) =>
                                  openContentModeration({
                                    contentType: 'list-item',
                                    recordId: item.id,
                                    title: item.restaurantName || 'List item',
                                    subtitle: `Saved in ${list.name}`,
                                  })
                                }
                                onModerateList={() =>
                                  openContentModeration({
                                    contentType: 'list',
                                    recordId: list.id,
                                    title: list.name,
                                    subtitle: 'Restaurant list',
                                  })
                                }
                              />
                            ))}
                          </div>
                        )}
                      </PaginatedCollection>
                    )}
                  </div>
                ) : null}
              </section>
            </>
          ) : null}
        </>
      ) : null}

      {contentModerationTarget ? (
        <ContentModerationModal
          draft={contentModerationDraft}
          onChange={setContentModerationDraft}
          onClose={() => setContentModerationTarget(null)}
          onSubmit={submitContentModeration}
          submitting={contentModerationMutation.isPending}
          target={contentModerationTarget}
        />
      ) : null}

      {carouselState && profileQuery.data?.user.id ? (
        <PhotoCarouselModal
          deleteDisabled={deletingKey?.startsWith('photo:') ?? false}
          initialIndex={carouselState.initialIndex}
          onClose={() => setCarouselState(null)}
          onDeletePhoto={(photo) => {
            setCarouselState(null);
            requestDelete('photo', photo.id, 'photo');
          }}
          onModeratePhoto={(photo) => {
            setCarouselState(null);
            openContentModeration({
              contentType: 'photo',
              recordId: photo.id,
              title: photo.caption?.trim() || 'Visit photo',
              subtitle: 'Photo attached to a visit item',
            });
          }}
          photos={carouselState.photos}
        />
      ) : null}
    </>
  );
}
