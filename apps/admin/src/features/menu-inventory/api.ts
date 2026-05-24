import { pb } from '@/lib/pocketbase';

export type MenuInventoryType = 'restaurants' | 'menu-items' | 'menu-images';

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
  menuItemCount: number;
  menuImageCount: number;
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
  isFromOcr: boolean;
  created: string;
  updated: string;
  createdBy?: string;
  creator: MenuInventoryUserSummary | null;
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
  menuItems: MenuItemInventoryRow[];
  menuImages: MenuImageInventoryRow[];
}

export interface MenuImageInventoryDetailResponse {
  menuImage: MenuImageInventoryRow;
  restaurant: RestaurantInventoryRow | null;
  attachedMenuItems: MenuItemInventoryRow[];
  unattachedRestaurantMenuItems: MenuItemInventoryRow[];
}

type MenuInventoryResponseForType<T extends MenuInventoryType> =
  T extends 'restaurants'
    ? AdminMenuInventoryResponse<RestaurantInventoryRow>
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
}): Promise<MenuInventoryResponseForType<T>> {
  try {
    return await pb.send<MenuInventoryResponseForType<T>>('/api/admin/menu-inventory', {
      query: {
        type: input.type,
        page: input.page,
        perPage: input.perPage,
        search: input.search.trim(),
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
    return await pb.collection('menu_items').update<MenuItemInventoryRow>(itemId, payload);
  } catch (error) {
    throw new Error(toErrorMessage(error, 'Could not update menu item.'));
  }
}
