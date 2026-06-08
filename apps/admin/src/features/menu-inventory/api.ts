import { pb } from '@/lib/pocketbase';

export type MenuInventoryType = 'restaurants' | 'restaurant-groups' | 'menu-items' | 'menu-images';
export type MenuItemInventoryFilter =
  | 'all'
  | 'not-approved'
  | 'approved-not-promoted'
  | 'rejected'
  | 'group-suitable';
export type MenuItemVisibilityFilter = 'all' | 'friends' | 'private' | 'public';

export interface MenuInventoryUserSummary {
  id: string;
  email: string;
  name?: string;
  isAdmin: boolean;
  isSubscriber: boolean;
  isBetaUser: boolean;
  created: string;
  updated: string;
}

export interface RestaurantInventoryRow {
  id: string;
  name: string;
  location?: string;
  cuisineType?: string;
  placeId?: string;
  isGooglePlace: boolean;
  googlePlaceCachedAt?: string;
  latitude?: number;
  longitude?: number;
  visibility?: 'private' | 'friends' | 'public' | '';
  created: string;
  updated: string;
  createdBy?: string;
  creator: MenuInventoryUserSummary | null;
  restaurantGroupId?: string;
  restaurantGroup: RestaurantGroupInventorySummary | null;
  menuItemCount: number;
  menuImageCount: number;
  catalogContributionCount: number;
  suggestionProvenanceCount: number;
}

export interface RestaurantGroupInventorySummary {
  id: string;
  name: string;
  notes?: string;
  createdBy?: string;
  created: string;
  updated: string;
}

export interface RestaurantGroupInventoryRow extends RestaurantGroupInventorySummary {
  creator: MenuInventoryUserSummary | null;
  restaurantCount: number;
  menuItemCount: number;
  groupSuitableMenuItemCount: number;
}

export interface MenuItemInventoryRow {
  id: string;
  name: string;
  restaurant?: string;
  restaurantName?: string;
  restaurantLocation?: string;
  sourceImage?: string;
  sourceImageFile?: string;
  visibility?: 'private' | 'friends' | 'public' | '';
  approvalStatus?: MenuItemApprovalStatus;
  approvalReviewedBy?: string;
  approvalReviewedAt?: string;
  groupSuitable: boolean;
  promotedFrom?: string;
  promotedTo?: string;
  promotedFromItem?: LinkedMenuItemInventorySummary | null;
  promotedToItem?: LinkedMenuItemInventorySummary | null;
  catalogContributionCount: number;
  suggestionProvenanceCount: number;
  isFromOcr: boolean;
  created: string;
  updated: string;
  createdBy?: string;
  creator: MenuInventoryUserSummary | null;
}

export type MenuItemApprovalStatus = 'unreviewed' | 'approved' | 'rejected';

export interface LinkedMenuItemInventorySummary {
  id: string;
  name?: string;
  visibility?: 'private' | 'friends' | 'public' | '';
  approvalStatus?: MenuItemApprovalStatus;
  createdBy?: string;
  creatorEmail?: string;
}

export interface MenuImageInventoryRow {
  id: string;
  image?: string;
  restaurant?: string;
  restaurantName?: string;
  restaurantLocation?: string;
  uploadedBy?: string;
  uploader: MenuInventoryUserSummary | null;
  created: string;
  updated: string;
}

export type MenuInventoryRow =
  | RestaurantInventoryRow
  | RestaurantGroupInventoryRow
  | MenuItemInventoryRow
  | MenuImageInventoryRow;

export interface AdminMenuInventoryResponse<T extends MenuInventoryRow> {
  type: MenuInventoryType;
  page: number;
  perPage: number;
  totalItems: number;
  totalPages: number;
  items: T[];
}

export interface RestaurantInventoryDetailResponse {
  restaurant: RestaurantInventoryRow;
  restaurantGroup: RestaurantGroupInventorySummary | null;
  sameNameCandidates: RestaurantInventoryRow[];
  menuItems: MenuItemInventoryRow[];
  menuImages: MenuImageInventoryRow[];
}

export interface RestaurantGroupInventoryDetailResponse {
  restaurantGroup: RestaurantGroupInventoryRow;
  restaurants: RestaurantInventoryRow[];
  menuItems: MenuItemInventoryRow[];
  allMenuItems: MenuItemInventoryRow[];
}

export interface RestaurantGroupCreateResponse {
  restaurantGroup: RestaurantGroupInventorySummary;
  restaurantDetail?: RestaurantInventoryDetailResponse;
}

export interface RestaurantGroupDeleteResponse {
  restaurantGroup: RestaurantGroupInventorySummary;
  unassignedRestaurantIds: string[];
  unassignedRestaurantCount: number;
}

export interface MenuImageInventoryDetailResponse {
  menuImage: MenuImageInventoryRow;
  restaurant: RestaurantInventoryRow | null;
  attachedMenuItems: MenuItemInventoryRow[];
  unattachedRestaurantMenuItems: MenuItemInventoryRow[];
}

export interface MenuItemPromotionResponse {
  menuItem: MenuItemInventoryRow;
  contribution: MenuItemInventoryRow;
  reusedExisting: boolean;
}

export interface MenuItemDepromotionResponse {
  contribution: MenuItemInventoryRow | null;
  deletedMenuItem: MenuItemInventoryRow | null;
  unlinkedOnly: boolean;
}

type MenuInventoryResponseForType<T extends MenuInventoryType> =
  T extends 'restaurants'
    ? AdminMenuInventoryResponse<RestaurantInventoryRow>
    : T extends 'restaurant-groups'
      ? AdminMenuInventoryResponse<RestaurantGroupInventoryRow>
      : T extends 'menu-items'
        ? AdminMenuInventoryResponse<MenuItemInventoryRow>
        : AdminMenuInventoryResponse<MenuImageInventoryRow>;

function toErrorMessage(error: unknown, fallbackMessage: string) {
  if (typeof error === 'object' && error !== null) {
    const responseData = (error as { response?: { message?: string } }).response;
    if (typeof responseData?.message === 'string' && responseData.message.trim()) {
      return responseData.message;
    }

    if (typeof (error as { message?: string }).message === 'string' && (error as { message: string }).message.trim()) {
      return (error as { message: string }).message;
    }
  }

  return fallbackMessage;
}

export async function getAdminMenuInventory<T extends MenuInventoryType>(input: {
  type: T;
  page: number;
  perPage: number;
  search: string;
  menuItemFilter?: MenuItemInventoryFilter;
  menuItemVisibility?: MenuItemVisibilityFilter;
}): Promise<MenuInventoryResponseForType<T>> {
  try {
    return await pb.send<MenuInventoryResponseForType<T>>('/api/admin/menu-inventory', {
      query: {
        type: input.type,
        page: input.page,
        perPage: input.perPage,
        search: input.search.trim(),
        menuItemFilter: input.menuItemFilter ?? 'all',
        menuItemVisibility: input.menuItemVisibility ?? 'all',
      },
    });
  } catch (error) {
    throw new Error(toErrorMessage(error, 'Could not load menu inventory.'));
  }
}

export async function getAdminRestaurantInventoryDetail(
  restaurantId: string,
): Promise<RestaurantInventoryDetailResponse> {
  try {
    return await pb.send<RestaurantInventoryDetailResponse>(
      `/api/admin/menu-inventory/restaurants/${encodeURIComponent(restaurantId)}`,
      {},
    );
  } catch (error) {
    throw new Error(toErrorMessage(error, 'Could not load restaurant inventory detail.'));
  }
}

export async function getAdminRestaurantGroupInventoryDetail(
  groupId: string,
): Promise<RestaurantGroupInventoryDetailResponse> {
  try {
    return await pb.send<RestaurantGroupInventoryDetailResponse>(
      `/api/admin/menu-inventory/restaurant-groups/${encodeURIComponent(groupId)}`,
      {},
    );
  } catch (error) {
    throw new Error(toErrorMessage(error, 'Could not load restaurant group inventory detail.'));
  }
}

export async function createAdminRestaurantGroup(input: {
  name: string;
  notes?: string;
  restaurantId?: string;
}): Promise<RestaurantGroupCreateResponse> {
  try {
    return await pb.send<RestaurantGroupCreateResponse>('/api/admin/menu-inventory/restaurant-groups', {
      method: 'POST',
      body: {
        name: input.name.trim(),
        notes: input.notes?.trim() ?? '',
        restaurantId: input.restaurantId?.trim() ?? '',
      },
    });
  } catch (error) {
    throw new Error(toErrorMessage(error, 'Could not create restaurant group.'));
  }
}

export async function deleteAdminRestaurantGroup(groupId: string): Promise<RestaurantGroupDeleteResponse> {
  try {
    return await pb.send<RestaurantGroupDeleteResponse>(
      `/api/admin/menu-inventory/restaurant-groups/${encodeURIComponent(groupId)}`,
      {
        method: 'DELETE',
      },
    );
  } catch (error) {
    throw new Error(toErrorMessage(error, 'Could not delete restaurant group.'));
  }
}

export async function updateAdminRestaurantGroupMetadata(input: {
  groupId: string;
  name: string;
  notes?: string;
}): Promise<RestaurantGroupInventorySummary> {
  try {
    return await pb.send<RestaurantGroupInventorySummary>(
      `/api/admin/menu-inventory/restaurant-groups/${encodeURIComponent(input.groupId)}`,
      {
        method: 'PATCH',
        body: {
          name: input.name.trim(),
          notes: input.notes?.trim() ?? '',
        },
      },
    );
  } catch (error) {
    throw new Error(toErrorMessage(error, 'Could not update restaurant group.'));
  }
}

export async function updateAdminRestaurantGroupMembership(input: {
  restaurantId: string;
  groupId: string;
}): Promise<RestaurantInventoryDetailResponse> {
  try {
    return await pb.send<RestaurantInventoryDetailResponse>(
      `/api/admin/menu-inventory/restaurants/${encodeURIComponent(input.restaurantId)}/restaurant-group`,
      {
        method: 'POST',
        body: {
          groupId: input.groupId.trim(),
        },
      },
    );
  } catch (error) {
    throw new Error(toErrorMessage(error, 'Could not update restaurant group membership.'));
  }
}

export async function getAdminMenuImageInventoryDetail(
  imageId: string,
): Promise<MenuImageInventoryDetailResponse> {
  try {
    return await pb.send<MenuImageInventoryDetailResponse>(
      `/api/admin/menu-inventory/menu-images/${encodeURIComponent(imageId)}`,
      {},
    );
  } catch (error) {
    throw new Error(toErrorMessage(error, 'Could not load menu photo inventory detail.'));
  }
}

export async function updateAdminMenuItem(
  itemId: string,
  payload: {
    name: string;
    visibility: 'private' | 'friends' | 'public';
    sourceImage?: string | null;
  },
): Promise<MenuItemInventoryRow> {
  try {
    return await pb.send<MenuItemInventoryRow>(`/api/admin/menu-items/${encodeURIComponent(itemId)}`, {
      method: 'PATCH',
      body: payload,
    });
  } catch (error) {
    throw new Error(toErrorMessage(error, 'Could not update menu item.'));
  }
}

export async function updateAdminMenuItemApproval(input: {
  itemId: string;
  status: MenuItemApprovalStatus;
}): Promise<MenuItemInventoryRow> {
  try {
    return await pb.send<MenuItemInventoryRow>(
      `/api/admin/menu-items/${encodeURIComponent(input.itemId)}/approval`,
      {
        method: 'PATCH',
        body: {
          status: input.status,
        },
      },
    );
  } catch (error) {
    throw new Error(toErrorMessage(error, 'Could not update menu item approval.'));
  }
}

export async function updateAdminMenuItemGroupSuitable(input: {
  itemId: string;
  groupSuitable: boolean;
}): Promise<MenuItemInventoryRow> {
  try {
    return await pb.send<MenuItemInventoryRow>(
      `/api/admin/menu-items/${encodeURIComponent(input.itemId)}/group-suitable`,
      {
        method: 'PATCH',
        body: {
          groupSuitable: input.groupSuitable,
        },
      },
    );
  } catch (error) {
    throw new Error(toErrorMessage(error, 'Could not update menu item group-suitable status.'));
  }
}

export async function promoteAdminMenuItemContribution(
  itemId: string,
): Promise<MenuItemPromotionResponse> {
  try {
    return await pb.send<MenuItemPromotionResponse>(
      `/api/admin/menu-items/${encodeURIComponent(itemId)}/promote`,
      {
        method: 'POST',
      },
    );
  } catch (error) {
    throw new Error(toErrorMessage(error, 'Could not promote menu item.'));
  }
}

export async function depromoteAdminMenuItem(itemId: string): Promise<MenuItemDepromotionResponse> {
  try {
    return await pb.send<MenuItemDepromotionResponse>(
      `/api/admin/menu-items/${encodeURIComponent(itemId)}/promotion`,
      {
        method: 'DELETE',
      },
    );
  } catch (error) {
    throw new Error(toErrorMessage(error, 'Could not de-promote menu item.'));
  }
}
