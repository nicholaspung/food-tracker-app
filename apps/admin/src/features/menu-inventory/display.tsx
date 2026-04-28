import { Link } from 'react-router-dom';

import type { MenuImageInventoryRow, MenuInventoryUserSummary } from '@/features/menu-inventory/api';
import { pb } from '@/lib/pocketbase';

export function formatOptional(value?: string | null, fallback = 'Unknown') {
  const trimmed = value?.trim();
  return trimmed ? trimmed : fallback;
}

export function renderInventoryVisibility(value?: string) {
  const normalized = value?.trim() || 'unknown';
  return <span className={`status-pill ${normalized}`}>{normalized}</span>;
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
