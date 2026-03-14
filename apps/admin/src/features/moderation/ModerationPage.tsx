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
} from '@/features/users/api';
import { formatDateTime, getCreatedUpdatedDisplay } from '@/lib/formatters';
import { pb } from '@/lib/pocketbase';
import type {
  ModerationAction,
  ModerationAppealState,
  ModerationCase,
  ModerationFeedEntry,
  ModerationFeedItem,
  ModerationPhoto,
  ModerationReasonCode,
  ModerationRestaurantList,
  ModerationRestaurantListItem,
} from '@/lib/types';

type ModerationQueueStatusFilter =
  | 'all'
  | 'active'
  | 'open'
  | 'under_review'
  | 'reviewed'
  | 'hidden'
  | 'removed'
  | 'restored'
  | 'escalated';

type ModerationQueueAssignmentFilter = 'all' | 'mine' | 'unassigned';

type ModerationTargetContentType = 'visit' | 'food-item' | 'quick-track' | 'list' | 'list-item' | 'photo';

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

const contentActionOptions: Array<{ label: string; value: ModerationAction }> = [
  { label: 'Hide', value: 'hide' },
  { label: 'Quarantine', value: 'quarantine' },
  { label: 'Mark reviewed', value: 'mark_reviewed' },
  { label: 'Restore', value: 'restore' },
  { label: 'Escalate', value: 'escalate' },
  { label: 'Restrict visibility', value: 'restrict_visibility' },
  { label: 'Soft remove', value: 'remove' },
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

const moderationAppealOptions: Array<{ label: string; value: ModerationAppealState }> = [
  { label: 'No appeal', value: 'none' },
  { label: 'Requested', value: 'requested' },
  { label: 'Approved', value: 'approved' },
  { label: 'Denied', value: 'denied' },
];

const moderationQueueStatusOptions: Array<{ label: string; value: ModerationQueueStatusFilter }> = [
  { label: 'Active queue', value: 'active' },
  { label: 'All statuses', value: 'all' },
  { label: 'Open', value: 'open' },
  { label: 'Under review', value: 'under_review' },
  { label: 'Reviewed', value: 'reviewed' },
  { label: 'Hidden', value: 'hidden' },
  { label: 'Removed', value: 'removed' },
  { label: 'Restored', value: 'restored' },
  { label: 'Escalated', value: 'escalated' },
];

const moderationQueueAssignmentOptions: Array<{ label: string; value: ModerationQueueAssignmentFilter }> = [
  { label: 'Everyone', value: 'all' },
  { label: 'Mine', value: 'mine' },
  { label: 'Unassigned', value: 'unassigned' },
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

function ModerationCaseCard({
  caseRecord,
  claimDisabled,
  onClaim,
  onRelease,
  releaseDisabled,
  showReviewUserAction,
}: {
  caseRecord: ModerationCase;
  claimDisabled: boolean;
  onClaim: () => void;
  onRelease: () => void;
  releaseDisabled: boolean;
  showReviewUserAction?: (user: AdminUser) => void;
}) {
  const assignedAdmin = caseRecord.expand?.assignedAdmin;
  const targetUser = caseRecord.expand?.targetUser;

  return (
    <article className="detail-card moderation-case-card">
      <div className="summary-row">
        <div>
          <p className="eyebrow">Case</p>
          <h3 style={{ marginBottom: 6 }}>{caseRecord.targetLabel?.trim() || caseRecord.targetType}</h3>
          <div className="tag-row tag-row-start">
            <ModerationBadge value={caseRecord.status} />
            {caseRecord.action ? <ModerationBadge value={caseRecord.action} /> : null}
            <span className="tag">{formatModerationLabel(caseRecord.targetType)}</span>
            {caseRecord.reasonCode ? <span className="tag">{formatModerationLabel(caseRecord.reasonCode)}</span> : null}
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

      <div className="summary-list">
        <div className="summary-row">
          <span className="text-muted">Target user</span>
          <strong>{targetUser?.email || 'Unknown user'}</strong>
        </div>
        <div className="summary-row">
          <span className="text-muted">Assigned admin</span>
          <strong>{assignedAdmin?.email || 'Unassigned'}</strong>
        </div>
        <div className="summary-row">
          <span className="text-muted">Updated</span>
          <strong>{formatDateTime(caseRecord.updated)}</strong>
        </div>
      </div>

      {caseRecord.moderatorNote?.trim() ? <p className="text-muted">{caseRecord.moderatorNote.trim()}</p> : null}
      {caseRecord.userNotice?.trim() ? <p className="text-muted">User notice: {caseRecord.userNotice.trim()}</p> : null}

      {targetUser && showReviewUserAction ? (
        <button className="button ghost" onClick={() => showReviewUserAction(targetUser)} type="button">
          Review {targetUser.email}
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
}: {
  deletingKey: string | null;
  item: ModerationFeedItem;
  onDelete: () => void;
  onModerate: () => void;
  onPhotoClick?: (photoId: string) => void;
}) {
  return (
    <div className="list-item moderation-subitem">
      <div className="summary-row">
        <div>
          <strong>{item.name}</strong>
          <div className="tag-row tag-row-start">
            <span className="tag">{formatRating(item.rating)}</span>
            <ModerationBadge value={getContentModerationStatus(item.moderationStatus)} />
          </div>
        </div>
        <div className="moderation-inline-actions">
          <button className="button ghost" onClick={onModerate} type="button">
            Moderate item
          </button>
          <button className="button danger" disabled={deletingKey === `food-item:${item.id}`} onClick={onDelete} type="button">
            {deletingKey === `food-item:${item.id}` ? 'Deleting...' : 'Delete item'}
          </button>
        </div>
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
}: {
  deletingKey: string | null;
  item: ModerationRestaurantListItem;
  onDelete: () => void;
  onModerate: () => void;
}) {
  return (
    <div className="list-item moderation-subitem">
      <div className="summary-row">
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
        <div className="moderation-inline-actions">
          <button className="button ghost" onClick={onModerate} type="button">
            Moderate item
          </button>
          <button className="button danger" disabled={deletingKey === `list-item:${item.id}`} onClick={onDelete} type="button">
            {deletingKey === `list-item:${item.id}` ? 'Deleting...' : 'Delete item'}
          </button>
        </div>
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
}: {
  deletingKey: string | null;
  entry: ModerationFeedEntry;
  onDelete: () => void;
  onDeleteItem: (item: ModerationFeedItem) => void;
  onModerate: () => void;
  onModerateItem: (item: ModerationFeedItem) => void;
  onOpenCarousel: (photos: ModerationPhoto[], initialIndex: number) => void;
}) {
  if (entry.contentType === 'quick-track') {
    return (
      <article className="detail-card moderation-entry">
        <div className="summary-row">
          <div>
            <p className="eyebrow">Quick track</p>
            <h3 style={{ marginBottom: 6 }}>{entry.itemName || 'Unnamed quick track'}</h3>
            <div className="tag-row tag-row-start">
              <span className="tag">{formatVisibility(entry.visibility)}</span>
              {entry.itemCategory?.trim() ? <span className="tag">{entry.itemCategory.trim()}</span> : null}
              <span className="tag">{formatRating(entry.rating)}</span>
              <ModerationBadge value={getContentModerationStatus(entry.moderationStatus)} />
            </div>
          </div>
          <div className="moderation-inline-actions">
            <button className="button ghost" onClick={onModerate} type="button">
              Moderate quick track
            </button>
            <button className="button danger" disabled={deletingKey === `quick-track:${entry.id}`} onClick={onDelete} type="button">
              {deletingKey === `quick-track:${entry.id}` ? 'Deleting...' : 'Delete quick track'}
            </button>
          </div>
        </div>
        <div className="summary-list">
          <div className="summary-row">
            <span className="text-muted">Shown in feed as</span>
            <strong>{entry.restaurantName || 'Quick Track'}</strong>
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
            const quickTrackPhotos = entry.photos ?? [];
            const initialIndex = quickTrackPhotos.findIndex((photo) => photo.id === photoId);
            if (initialIndex >= 0) {
              onOpenCarousel(quickTrackPhotos, initialIndex);
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
      <div className="summary-row">
        <div>
          <p className="eyebrow">Visit</p>
          <h3 style={{ marginBottom: 6 }}>{entry.restaurantName || 'Unknown restaurant'}</h3>
          <div className="tag-row tag-row-start">
            <span className="tag">{formatVisibility(entry.visibility)}</span>
            {entry.restaurantCuisineType?.trim() ? <span className="tag">{entry.restaurantCuisineType.trim()}</span> : null}
            <ModerationBadge value={getContentModerationStatus(entry.moderationStatus)} />
          </div>
        </div>
        <div className="moderation-inline-actions">
          <button className="button ghost" onClick={onModerate} type="button">
            Moderate visit
          </button>
          <button className="button danger" disabled={deletingKey === `visit:${entry.id}`} onClick={onDelete} type="button">
            {deletingKey === `visit:${entry.id}` ? 'Deleting...' : 'Delete visit'}
          </button>
        </div>
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
}: {
  deletingKey: string | null;
  list: ModerationRestaurantList;
  onDeleteItem: (item: ModerationRestaurantListItem) => void;
  onDeleteList: () => void;
  onModerateItem: (item: ModerationRestaurantListItem) => void;
  onModerateList: () => void;
}) {
  const activityDisplay = getCreatedUpdatedDisplay(list.created, list.updated, {
    createdLabel: 'Created',
  });

  return (
    <article className="detail-card moderation-entry">
      <div className="summary-row">
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
        <div className="moderation-inline-actions">
          <button className="button ghost" onClick={onModerateList} type="button">
            Moderate list
          </button>
          <button className="button danger" disabled={deletingKey === `list:${list.id}`} onClick={onDeleteList} type="button">
            {deletingKey === `list:${list.id}` ? 'Deleting...' : 'Delete list'}
          </button>
        </div>
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

        <div className="moderation-form-grid">
          <div className="field">
            <label htmlFor="moderation-action">Action</label>
            <select
              className="input"
              id="moderation-action"
              onChange={(event) => onChange({ ...draft, action: event.target.value as ModerationAction })}
              value={draft.action}
            >
              {contentActionOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="moderation-reason">Reason</label>
            <select
              className="input"
              id="moderation-reason"
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
            <label htmlFor="moderation-appeal">Appeal state</label>
            <select
              className="input"
              id="moderation-appeal"
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
          </div>
        </div>

        <div className="field">
          <label htmlFor="moderation-note">Moderator note</label>
          <textarea
            className="input moderation-textarea"
            id="moderation-note"
            onChange={(event) => onChange({ ...draft, moderatorNote: event.target.value })}
            placeholder="Internal context for other moderators"
            value={draft.moderatorNote}
          />
        </div>

        <div className="field">
          <label htmlFor="moderation-notice">User notice</label>
          <textarea
            className="input moderation-textarea"
            id="moderation-notice"
            onChange={(event) => onChange({ ...draft, userNotice: event.target.value })}
            placeholder="Optional message shown to the user"
            value={draft.userNotice}
          />
        </div>

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
  const [emailInput, setEmailInput] = useState(initialEmail);
  const [selectedEmail, setSelectedEmail] = useState(normalizeEmail(initialEmail));
  const [carouselState, setCarouselState] = useState<{ initialIndex: number; photos: ModerationPhoto[] } | null>(null);
  const [queueAssignment, setQueueAssignment] = useState<ModerationQueueAssignmentFilter>('all');
  const [queueStatus, setQueueStatus] = useState<ModerationQueueStatusFilter>('active');
  const [accountForm, setAccountForm] = useState<AccountModerationFormState | null>(null);
  const [contentModerationDraft, setContentModerationDraft] = useState<ContentModerationDraft>(createDefaultContentModerationDraft);
  const [contentModerationTarget, setContentModerationTarget] = useState<ContentModerationTarget | null>(null);

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

  const moderationCasesQuery = useQuery({
    queryKey: ['admin', 'moderation', 'cases', queueStatus, queueAssignment, lookupQuery.data?.id ?? 'all'],
    queryFn: () =>
      listModerationCases({
        assignment: queueAssignment,
        status: queueStatus,
        userId: lookupQuery.data?.id,
      }),
  });

  const refreshModerationData = async () => {
    await queryClient.invalidateQueries({ queryKey: ['admin', 'moderation', 'cases'] });
    if (lookupQuery.data?.id) {
      await queryClient.invalidateQueries({ queryKey: ['admin', 'user-profile', lookupQuery.data.id] });
    }
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
    },
  });

  const claimCaseMutation = useMutation({
    mutationFn: claimModerationCase,
    onSuccess: refreshModerationData,
  });

  const releaseCaseMutation = useMutation({
    mutationFn: releaseModerationCase,
    onSuccess: refreshModerationData,
  });

  const deletingKey = deleteMutation.variables
    ? `${deleteMutation.variables.contentType}:${deleteMutation.variables.recordId}`
    : null;

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

  const reviewCaseUser = (user: AdminUser) => {
    const normalized = normalizeEmail(user.email);
    setEmailInput(normalized);
    setSelectedEmail(normalized);
    setSearchParams({ email: normalized });
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
        <p className="eyebrow">User moderation</p>
        <h2 style={{ marginBottom: 0 }}>Review one account at a time by exact email</h2>
        <p className="text-muted" style={{ margin: 0 }}>
          Moderators must enter an exact user email before any user content loads. The workspace now includes the
          moderation queue, account controls, reversible content actions, and permanent delete as the last resort.
        </p>
      </section>

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

      <section className="table-panel">
        <div className="summary-row">
          <div>
            <p className="eyebrow">Moderation queue</p>
            <h3 style={{ marginBottom: 4 }}>
              {lookupQuery.data?.email ? `Cases for ${lookupQuery.data.email}` : 'Cases across all users'}
            </h3>
            <p className="text-muted" style={{ margin: 0 }}>
              Claim work, review escalations, and jump directly into a user account.
            </p>
          </div>
        </div>

        <div className="moderation-form-grid">
          <div className="field">
            <label htmlFor="queue-status-filter">Status</label>
            <select
              className="input"
              id="queue-status-filter"
              onChange={(event) => setQueueStatus(event.target.value as ModerationQueueStatusFilter)}
              value={queueStatus}
            >
              {moderationQueueStatusOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="queue-assignment-filter">Assignment</label>
            <select
              className="input"
              id="queue-assignment-filter"
              onChange={(event) => setQueueAssignment(event.target.value as ModerationQueueAssignmentFilter)}
              value={queueAssignment}
            >
              {moderationQueueAssignmentOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {moderationCasesQuery.isLoading ? (
          <div className="state-panel">
            <strong>Loading moderation cases...</strong>
          </div>
        ) : null}

        {moderationCasesQuery.isError ? (
          <div className="state-panel error">
            <strong>Could not load moderation cases</strong>
            <span className="text-muted">
              {moderationCasesQuery.error instanceof Error
                ? moderationCasesQuery.error.message
                : 'The moderation queue request failed.'}
            </span>
          </div>
        ) : null}

        {moderationCasesQuery.data && moderationCasesQuery.data.length === 0 ? (
          <div className="state-panel">
            <strong>No cases found</strong>
            <span className="text-muted">Adjust the filters or select a user with known moderation activity.</span>
          </div>
        ) : null}

        {moderationCasesQuery.data && moderationCasesQuery.data.length > 0 ? (
          <PaginatedCollection
            items={moderationCasesQuery.data}
            itemsPerPage={12}
            resetKey={`${queueStatus}:${queueAssignment}`}
          >
            {(pageCases) => (
              <div className="inline-list">
                {pageCases.map((caseRecord) => (
                  <ModerationCaseCard
                    caseRecord={caseRecord}
                    claimDisabled={claimCaseMutation.isPending && claimCaseMutation.variables === caseRecord.id}
                    key={caseRecord.id}
                    onClaim={() => claimCaseMutation.mutate(caseRecord.id)}
                    onRelease={() => releaseCaseMutation.mutate(caseRecord.id)}
                    releaseDisabled={releaseCaseMutation.isPending && releaseCaseMutation.variables === caseRecord.id}
                    showReviewUserAction={reviewCaseUser}
                  />
                ))}
              </div>
            )}
          </PaginatedCollection>
        ) : null}
      </section>

      {!selectedEmail ? (
        <section className="state-panel">
          <strong>No account selected</strong>
          <span className="text-muted">Enter an exact email address to review a user.</span>
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
          <strong>Loading moderation workspace...</strong>
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

      {errorMessage ? (
        <section className="state-panel error">
          <strong>Moderation action failed</strong>
          <span className="text-muted">{errorMessage}</span>
        </section>
      ) : null}

      {selectedEmail && lookupQuery.data && profileQuery.data && accountForm ? (
        <>
          <section className="panel">
            <div className="summary-row">
              <div>
                <p className="eyebrow">Reviewing</p>
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

          <section className="detail-grid moderation-detail-grid">
            <div className="inline-list">
              <section className="table-panel">
                <div className="summary-row">
                  <div>
                    <p className="eyebrow">Account actions</p>
                    <h3 style={{ marginBottom: 4 }}>Warnings, suspensions, and pre-review</h3>
                    <p className="text-muted" style={{ margin: 0 }}>
                      Save the current account settings or use a quick action to warn, restrict, ban, or restore.
                    </p>
                  </div>
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
                    <span className="text-muted">{userModerationStateOptions.find((option) => option.value === accountForm.moderationState)?.description}</span>
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
                    <span className="text-muted">{userContentModeOptions.find((option) => option.value === accountForm.contentModerationMode)?.description}</span>
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
              </section>
            </div>

            <div className="inline-list">
              <section className="table-panel">
                <div className="summary-row">
                  <div>
                    <p className="eyebrow">Moderation history</p>
                    <h3 style={{ marginBottom: 4 }}>Open and resolved cases for this user</h3>
                  </div>
                </div>

                {profileQuery.data.moderationCases.length === 0 ? (
                  <div className="state-panel">
                    <span className="text-muted">No moderation cases have been recorded for this user yet.</span>
                  </div>
                ) : (
                  <PaginatedCollection items={profileQuery.data.moderationCases} itemsPerPage={10}>
                    {(pageCases) => (
                      <div className="inline-list">
                        {pageCases.map((caseRecord) => (
                          <ModerationCaseCard
                            caseRecord={caseRecord}
                            claimDisabled={claimCaseMutation.isPending && claimCaseMutation.variables === caseRecord.id}
                            key={caseRecord.id}
                            onClaim={() => claimCaseMutation.mutate(caseRecord.id)}
                            onRelease={() => releaseCaseMutation.mutate(caseRecord.id)}
                            releaseDisabled={releaseCaseMutation.isPending && releaseCaseMutation.variables === caseRecord.id}
                          />
                        ))}
                      </div>
                    )}
                  </PaginatedCollection>
                )}
              </section>
            </div>
          </section>

          <section className="detail-grid moderation-detail-grid">
            <div className="inline-list">
              <section className="table-panel">
                <div className="summary-row">
                  <div>
                    <p className="eyebrow">Ratings feed</p>
                    <h3 style={{ marginBottom: 0 }}>What the user sees in the app</h3>
                  </div>
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
                                entry.contentType === 'visit' ? 'visit' : 'quick track',
                              )
                            }
                            onModerate={() =>
                              openContentModeration({
                                contentType: entry.contentType,
                                recordId: entry.id,
                                title: entry.contentType === 'visit' ? entry.restaurantName || 'Visit' : entry.itemName || 'Quick track',
                                subtitle: entry.contentType === 'visit' ? 'Visit entry' : 'Quick track entry',
                              })
                            }
                            onDeleteItem={(item) => requestDelete('food-item', item.id, 'visit item')}
                            onModerateItem={(item) =>
                              openContentModeration({
                                contentType: 'food-item',
                                recordId: item.id,
                                title: item.name,
                                subtitle: 'Visit item',
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
              </section>
            </div>

            <div className="inline-list">
              <section className="table-panel">
                <div className="summary-row">
                  <div>
                    <p className="eyebrow">Restaurant lists</p>
                    <h3 style={{ marginBottom: 0 }}>Saved and shared list content</h3>
                  </div>
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
              </section>
            </div>
          </section>
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
