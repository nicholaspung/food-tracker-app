import { Link } from 'react-router-dom';

import type {
  LinkedMenuItemInventorySummary,
  MenuImageInventoryRow,
  MenuInventoryUserSummary,
  MenuItemInventoryRow,
} from '@/features/menu-inventory/api';
import { pb } from '@/lib/pocketbase';

export function formatOptional(value?: string | null, fallback = 'Unknown') {
  const trimmed = value?.trim();
  return trimmed ? trimmed : fallback;
}

export function renderInventoryVisibility(value?: string) {
  const normalized = value?.trim() || 'unknown';
  return <span className={`status-pill ${normalized}`}>{normalized}</span>;
}

export function renderMenuItemApprovalStatus(value?: string) {
  const normalized = value?.trim() || 'unreviewed';
  return <span className={`status-pill ${normalized}`}>{normalized}</span>;
}

export function renderMenuItemGroupSuitableStatus(value: boolean) {
  return (
    <span className={`status-pill ${value ? 'group_suitable' : 'not_group_suitable'}`}>
      {value ? 'group-suitable' : 'not group-suitable'}
    </span>
  );
}

export function renderMenuCatalogTrustEvidence(row: {
  catalogContributionCount?: number;
  suggestionProvenanceCount?: number;
}) {
  const catalogContributionCount = Math.max(0, row.catalogContributionCount ?? 0);
  const suggestionProvenanceCount = Math.max(0, row.suggestionProvenanceCount ?? 0);

  if (catalogContributionCount === 0 && suggestionProvenanceCount === 0) {
    return <span className="text-muted">No evidence</span>;
  }

  return (
    <div className="tag-row tag-row-start">
      {catalogContributionCount > 0 ? (
        <span className="tag">{catalogContributionCount} catalog contribution(s)</span>
      ) : null}
      {suggestionProvenanceCount > 0 ? (
        <span className="tag">{suggestionProvenanceCount} suggestion use(s)</span>
      ) : null}
    </div>
  );
}

export function renderInventoryUser(user: MenuInventoryUserSummary | null, fallbackId?: string) {
  if (!user) {
    return (
      <div className="inventory-primary-cell">
        <strong>Unknown user</strong>
        {fallbackId?.trim() ? (
          <span className="inventory-secondary-text">{fallbackId}</span>
        ) : null}
      </div>
    );
  }

  return (
    <div className="inventory-primary-cell">
      <Link className="route-link" to={`/users/${user.id}`}>
        {formatOptional(user.email, user.id)}
      </Link>
      {user.name?.trim() ? <span className="inventory-secondary-text">{user.name}</span> : null}
    </div>
  );
}

export interface LinkedMenuItemDisplaySummary {
  label: string;
  relation: string;
  item: LinkedMenuItemInventorySummary;
}

export function getLinkedMenuItemDisplaySummary(
  row: Pick<MenuItemInventoryRow, 'promotedFrom' | 'promotedFromItem' | 'promotedTo' | 'promotedToItem'>,
): LinkedMenuItemDisplaySummary | null {
  const promotedTo = row.promotedTo?.trim();
  if (promotedTo) {
    return {
      label: 'Promoted catalog item',
      relation: 'Promoted to',
      item: row.promotedToItem ?? { id: promotedTo },
    };
  }

  const promotedFrom = row.promotedFrom?.trim();
  if (promotedFrom) {
    return {
      label: 'Source contribution',
      relation: 'Promoted from',
      item: row.promotedFromItem ?? { id: promotedFrom },
    };
  }

  return null;
}

export function renderLinkedMenuItemSummary(summary: LinkedMenuItemDisplaySummary) {
  return (
    <div className="linked-menu-item-summary">
      <div aria-hidden="true" className="linked-menu-item-marker" />
      <div className="linked-menu-item-main">
        <div className="inventory-primary-cell">
          <strong>{summary.label}</strong>
          {summary.item.name?.trim() ? <span>{summary.item.name}</span> : null}
          <span className="inventory-secondary-text">
            {summary.relation} {summary.item.id}
          </span>
        </div>
        <div className="tag-row tag-row-start">
          {summary.item.visibility?.trim() ? renderInventoryVisibility(summary.item.visibility) : null}
          {summary.item.approvalStatus?.trim()
            ? renderMenuItemApprovalStatus(summary.item.approvalStatus)
            : null}
          {summary.item.creatorEmail?.trim() ? (
            <span className="tag">{summary.item.creatorEmail}</span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function buildMenuImageUrl(row: Pick<MenuImageInventoryRow, 'id' | 'image'>, thumb?: string) {
  if (!row.image?.trim()) {
    return '';
  }

  return pb.files.getURL(
    {
      collectionName: 'menu_images',
      id: row.id,
    },
    row.image,
    thumb ? { thumb } : {},
  );
}
