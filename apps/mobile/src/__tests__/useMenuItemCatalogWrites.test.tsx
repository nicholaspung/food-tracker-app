import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { useQueryClient } from '@tanstack/react-query';

import { createCollectionRecord, updateCollectionRecord } from '../features/store/pocketbaseGateway';
import { menuItemsQueryKeys } from '../features/store/menuItemsQuery';
import { suggestTastingMenuItem } from '../features/store/tastingSessionsApiStore';
import { tastingSessionsQueryKeys } from '../features/store/tastingSessionsQuery';
import { useMenuItemCatalogWrites } from '../features/store/useMenuItemCatalogWrites';

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: jest.fn(),
}));

jest.mock('../features/store/pocketbaseGateway', () => ({
  createCollectionRecord: jest.fn(),
  updateCollectionRecord: jest.fn(),
}));

jest.mock('../features/store/tastingSessionsApiStore', () => ({
  suggestTastingMenuItem: jest.fn(),
}));

const mockedUseQueryClient = useQueryClient as jest.MockedFunction<typeof useQueryClient>;
const mockedCreateCollectionRecord = createCollectionRecord as jest.MockedFunction<typeof createCollectionRecord>;
const mockedUpdateCollectionRecord = updateCollectionRecord as jest.MockedFunction<typeof updateCollectionRecord>;
const mockedSuggestTastingMenuItem = suggestTastingMenuItem as jest.MockedFunction<typeof suggestTastingMenuItem>;

describe('useMenuItemCatalogWrites', () => {
  const queryClient = {
    invalidateQueries: jest.fn(),
    setQueryData: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    queryClient.invalidateQueries.mockResolvedValue(undefined);
    mockedUseQueryClient.mockReturnValue(queryClient as never);
    mockedCreateCollectionRecord.mockResolvedValue({
      id: 'item_1',
      name: 'Shoyu Ramen',
      restaurant: 'restaurant_1',
      visibility: 'friends',
    } as never);
    mockedUpdateCollectionRecord.mockResolvedValue({
      id: 'item_1',
      name: 'Miso Ramen',
      restaurant: 'restaurant_1',
      visibility: 'private',
    } as never);
    mockedSuggestTastingMenuItem.mockResolvedValue({ id: 'session_1' } as never);
  });

  async function renderHook(): Promise<{
    hook: ReturnType<typeof useMenuItemCatalogWrites>;
    renderer: ReactTestRenderer;
  }> {
    let hook: ReturnType<typeof useMenuItemCatalogWrites> | null = null;
    let renderer: ReactTestRenderer | null = null;

    function TestComponent() {
      hook = useMenuItemCatalogWrites();
      return null;
    }

    await act(async () => {
      renderer = create(React.createElement(TestComponent));
    });

    if (!hook || !renderer) {
      throw new Error('Expected hook to render.');
    }

    return { hook, renderer };
  }

  it('creates menu items and updates restaurant menu item caches', async () => {
    const { hook, renderer } = await renderHook();

    await hook.createMenuItem({
      createdBy: 'user_1',
      name: 'Shoyu Ramen',
      restaurantId: 'restaurant_1',
      visibility: 'friends',
    });

    expect(mockedCreateCollectionRecord).toHaveBeenCalledWith('menu_items', {
      createdBy: 'user_1',
      isFromOCR: false,
      name: 'Shoyu Ramen',
      restaurant: 'restaurant_1',
      visibility: 'friends',
    });
    expect(queryClient.setQueryData).toHaveBeenCalledWith(
      menuItemsQueryKeys.restaurant('restaurant_1'),
      expect.any(Function),
    );
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: menuItemsQueryKeys.restaurant('restaurant_1'),
    });

    await act(async () => {
      renderer.unmount();
    });
  });

  it('updates menu items and patches cached names and visibility', async () => {
    const { hook, renderer } = await renderHook();

    await hook.updateMenuItem({
      menuItemId: 'item_1',
      name: 'Miso Ramen',
      restaurantId: 'restaurant_1',
      visibility: 'private',
    });

    expect(mockedUpdateCollectionRecord).toHaveBeenCalledWith('menu_items', 'item_1', {
      name: 'Miso Ramen',
      visibility: 'private',
    });
    const patch = queryClient.setQueryData.mock.calls[0]?.[1] as Function;
    expect(patch([{ id: 'item_1', name: 'Shoyu Ramen', restaurant: 'restaurant_1' }])).toEqual([
      {
        id: 'item_1',
        name: 'Miso Ramen',
        restaurant: 'restaurant_1',
        visibility: 'private',
      },
    ]);

    await act(async () => {
      renderer.unmount();
    });
  });

  it('applies scanned menu items without duplicating existing cached records', async () => {
    const { hook, renderer } = await renderHook();

    await hook.applyScannedMenuItems({
      items: [
        { id: 'item_1', name: 'Updated Ramen', restaurant: 'restaurant_1' },
        { id: 'item_2', name: 'Gyoza', restaurant: 'restaurant_1' },
      ],
      restaurantId: 'restaurant_1',
    });

    const upsert = queryClient.setQueryData.mock.calls[0]?.[1] as Function;
    expect(upsert([{ id: 'item_1', name: 'Shoyu Ramen', restaurant: 'restaurant_1' }])).toEqual([
      { id: 'item_2', name: 'Gyoza', restaurant: 'restaurant_1' },
      { id: 'item_1', name: 'Updated Ramen', restaurant: 'restaurant_1' },
    ]);

    await act(async () => {
      renderer.unmount();
    });
  });

  it('creates menu items and adds them to a Tasting Plan behind the catalog Interface', async () => {
    const { hook, renderer } = await renderHook();

    await hook.createMenuItemAndAddToTastingPlan({
      createdBy: 'user_1',
      name: 'Shoyu Ramen',
      restaurantId: 'restaurant_1',
      tastingRestaurantSuggestionId: 'restaurant_suggestion_1',
      tastingSessionId: 'session_1',
      visibility: 'friends',
    });

    expect(mockedCreateCollectionRecord).toHaveBeenCalledWith('menu_items', {
      createdBy: 'user_1',
      isFromOCR: false,
      name: 'Shoyu Ramen',
      restaurant: 'restaurant_1',
      visibility: 'friends',
    });
    expect(mockedSuggestTastingMenuItem).toHaveBeenCalledWith(
      'session_1',
      'restaurant_suggestion_1',
      {
        menuItemId: 'item_1',
        name: 'Shoyu Ramen',
      },
    );
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: tastingSessionsQueryKeys.detail('session_1'),
    });

    await act(async () => {
      renderer.unmount();
    });
  });
});
