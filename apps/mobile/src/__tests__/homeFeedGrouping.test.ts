import type { VisitRecord } from '../features';
import { filterFriendFeedVisibleVisit } from '../screens/home/homeFeedGrouping';

function buildVisit(overrides: Partial<VisitRecord> = {}): VisitRecord {
  return {
    createdAt: '2026-04-18T08:00:00.000Z',
    id: 'visit-1',
    items: [
      {
        id: 'item-visible',
        menuItemId: 'menu-item-visible',
        menuItemVisibility: 'friends',
        name: 'Shared Toast',
        rating: 4,
      },
    ],
    restaurantName: 'Noodle House',
    source: 'visit',
    updatedAt: '2026-04-18T08:05:00.000Z',
    userId: 'friend-user',
    visitedAt: '2026-04-18T08:00:00.000Z',
    visibility: 'friends',
    ...overrides,
  };
}

describe('filterFriendFeedVisibleVisit', () => {
  it('drops friend visits when every selected menu item is private', () => {
    const visit = buildVisit({
      items: [
        {
          id: 'item-private',
          menuItemId: 'menu-item-private',
          menuItemVisibility: 'private',
          name: 'Secret Toast',
          rating: 5,
        },
      ],
    });

    expect(filterFriendFeedVisibleVisit(visit, 'user-1')).toBeNull();
  });

  it('keeps friend visits but removes private selected menu items', () => {
    const visit = buildVisit({
      items: [
        {
          id: 'item-private',
          menuItemId: 'menu-item-private',
          menuItemVisibility: 'private',
          name: 'Secret Toast',
          rating: 5,
        },
        {
          id: 'item-visible',
          menuItemId: 'menu-item-visible',
          menuItemVisibility: 'friends',
          name: 'Shared Toast',
          rating: 4,
        },
      ],
    });

    expect(filterFriendFeedVisibleVisit(visit, 'user-1')?.items).toEqual([
      {
        id: 'item-visible',
        menuItemId: 'menu-item-visible',
        menuItemVisibility: 'friends',
        name: 'Shared Toast',
        rating: 4,
      },
    ]);
  });

  it('does not filter the viewer owned visit', () => {
    const visit = buildVisit({
      userId: 'user-1',
      items: [
        {
          id: 'item-private',
          menuItemId: 'menu-item-private',
          menuItemVisibility: 'private',
          name: 'Secret Toast',
          rating: 5,
        },
      ],
    });

    expect(filterFriendFeedVisibleVisit(visit, 'user-1')).toBe(visit);
  });
});
