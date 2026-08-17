import React from "react";
import { act, create } from "react-test-renderer";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";

import { RestaurantDiscoveryRestaurantScreen } from "../screens/RestaurantDiscoveryRestaurantScreen";
import { menuItemsQueryKeys } from "../features/store/menuItemsQuery";
import { useWantToTryMembership } from "../features/store/useWantToTryState";

const mockReact = React;
const mockNavigate = jest.fn();
const mockGoBack = jest.fn();
const mockSaveBookmarkToDefaultList = jest.fn();
const mockRemoveBookmarkFromDefaultList = jest.fn();
let mockIsOnline = true;

jest.mock("react-native", () => ({
  Linking: {
    openSettings: jest.fn(),
  },
  View: ({
    children,
    ...props
  }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement("View", props, children),
}));

jest.mock("@tanstack/react-query", () => ({
  useInfiniteQuery: jest.fn(),
  useQuery: jest.fn(),
  useQueryClient: jest.fn(),
}));

jest.mock("../features/store/useOfflineAwareFeatureWrite", () => ({
  useOfflineAwareFeatureWrite: jest.fn(() => jest.fn()),
}));

jest.mock("../features/store/useQueuedFeatureWrites", () => ({
  useQueuedFeatureWrites: jest.fn(() => ({ queuedWrites: [], refreshQueuedWrites: jest.fn() })),
}));

jest.mock("../features/store/useWantToTryState", () => ({
  ...jest.requireActual("../features/store/useWantToTryState"),
  useWantToTryMembership: jest.fn(),
}));

jest.mock("../providers/AuthProvider", () => ({
  useAuth: jest.fn(() => ({ user: { id: "user-1" } })),
}));

jest.mock("../components/shared", () => ({
  EmptyState: (props: Record<string, unknown>) =>
    mockReact.createElement("EmptyState", props),
  FeatureDetailScreenScaffold: ({
    children,
    ...props
  }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement("FeatureDetailScreenScaffold", props, children),
  LoadingState: (props: Record<string, unknown>) =>
    mockReact.createElement("LoadingState", props),
  PageErrorToast: (props: Record<string, unknown>) =>
    mockReact.createElement("PageErrorToast", props),
  RatingPill: (props: Record<string, unknown>) =>
    mockReact.createElement("RatingPill", props),
  SegmentedControl: (props: Record<string, unknown>) =>
    mockReact.createElement("SegmentedControl", props),
  VisitRestaurantOptionTrailing: (props: Record<string, unknown>) =>
    mockReact.createElement("VisitRestaurantOptionTrailing", props),
  WantToTryBookmarkButton: (props: Record<string, unknown>) =>
    mockReact.createElement("WantToTryBookmarkButton", props),
}));

jest.mock("../features/store/restaurantsStore", () => ({
  getGroupMenuSuggestionsForRestaurant: jest.fn(),
  getAllLocationsHistory: jest.fn(),
  listMenuItemsForRestaurant: jest.fn(),
}));

jest.mock("../features/store/useRestaurantListWrites", () => ({
  useRestaurantListWrites: jest.fn(() => ({
    removeBookmarkFromDefaultList: mockRemoveBookmarkFromDefaultList,
    saveBookmarkToDefaultList: mockSaveBookmarkToDefaultList,
  })),
}));

jest.mock("../hooks/useImageSourcePicker", () => ({
  useImageSourcePicker: jest.fn(() => ({
    permissionNeedsSettings: false,
    pickImageAssets: jest.fn(),
  })),
}));

jest.mock("../lib/photoStaging", () => ({
  cleanupStagedPhotoFiles: jest.fn(),
  stageLocalPhotoFile: jest.fn(),
}));

jest.mock("../lib/visitRestaurantSearch", () => ({
  buildVisitRestaurantDescription: jest.fn((restaurant) =>
    [restaurant.location, restaurant.cuisineType].filter(Boolean).join(" • "),
  ),
}));

jest.mock("../observability", () => ({
  trackObservabilityEvent: jest.fn(),
}));

jest.mock("../providers/ConnectivityProvider", () => ({
  useConnectivity: jest.fn(() => ({
    isOnline: mockIsOnline,
  })),
}));

jest.mock("../theme", () => ({
  createThemedStyles:
    (factory: (...args: unknown[]) => unknown) =>
    (...args: unknown[]) =>
      factory(
        {
          colors: {
            background: {
              surface: "surface",
            },
            border: {
              subtle: "border-subtle",
            },
            status: {
              successBg: "success-bg",
              successBorder: "success-border",
              warningBg: "warning-bg",
              warningBorder: "warning-border",
            },
            text: {
              brand: "brand",
              info: "info",
              success: "success",
            },
          },
          radii: { md: 8, pill: 999 },
          spacing: { md: 16, sm: 8, xs: 4, xxs: 2 },
        },
        ...args,
      ),
  useTheme: jest.fn(() => ({
    colors: {
      text: {
        brand: "brand",
        info: "info",
        success: "success",
      },
    },
  })),
}));

jest.mock("../ui", () => ({
  Button: (props: Record<string, unknown>) =>
    mockReact.createElement("Button", props),
  Card: ({
    children,
    ...props
  }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement("Card", props, children),
  ListItem: ({ description, ...props }: Record<string, unknown>) =>
    mockReact.createElement("ListItem", props, description as React.ReactNode),
  Text: ({
    children,
    ...props
  }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement("Text", props, children),
}));

const mockedUseQuery = useQuery as jest.MockedFunction<typeof useQuery>;
const mockedUseInfiniteQuery = useInfiniteQuery as jest.MockedFunction<
  typeof useInfiniteQuery
>;
const mockedUseQueryClient = useQueryClient as jest.MockedFunction<
  typeof useQueryClient
>;
const mockedUseWantToTryMembership = useWantToTryMembership as jest.MockedFunction<
  typeof useWantToTryMembership
>;

function collectText(node: any): string {
  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }

  if (!node) {
    return "";
  }

  if (Array.isArray(node)) {
    return node.map(collectText).join("");
  }

  return collectText(node.props?.children);
}

function setMockMenuItems(items: Record<string, unknown>[]) {
  mockedUseInfiniteQuery.mockReturnValue({
    data: {
      pages: [{
        items,
        page: 1,
        pageSize: 20,
        totalItems: items.length,
        totalPages: items.length > 0 ? 1 : 0,
        hasNextPage: false,
      }],
      pageParams: [1],
    },
    error: null,
    fetchNextPage: jest.fn(),
    hasNextPage: false,
    isError: false,
    isFetchingNextPage: false,
    isPending: false,
    refetch: jest.fn(),
  } as unknown as ReturnType<typeof useInfiniteQuery>);
}

function renderScreen() {
  let renderer: any;
  act(() => {
    renderer = create(
      <RestaurantDiscoveryRestaurantScreen
        navigation={{ navigate: mockNavigate, goBack: mockGoBack } as never}
        route={{
          key: "restaurant-detail",
          name: "RestaurantDiscoveryRestaurant",
          params: {
            cuisineType: "Cafe",
            friendCount: 2,
            isGooglePlace: true,
            location: "West Hollywood, CA",
            restaurantId: "restaurant-1",
            restaurantName: "Erewhon West Hollywood",
            userVisitCount: 1,
          },
        }}
      />,
    );
  });
  return renderer;
}

describe("RestaurantDiscoveryRestaurantScreen", () => {
  beforeEach(() => {
    mockIsOnline = true;
    mockNavigate.mockReset();
    mockGoBack.mockReset();
    mockRemoveBookmarkFromDefaultList.mockReset();
    mockRemoveBookmarkFromDefaultList.mockResolvedValue({
      status: "completed",
      result: [],
    });
    mockSaveBookmarkToDefaultList.mockReset();
    mockSaveBookmarkToDefaultList.mockResolvedValue({
      status: "completed",
      result: [[]],
    });
    setMockMenuItems([]);
    mockedUseQueryClient.mockReturnValue({
      getQueryData: jest.fn(),
      getQueriesData: jest.fn(() => []),
      invalidateQueries: jest.fn(),
      setQueryData: jest.fn(),
    } as never);
    mockedUseWantToTryMembership.mockReturnValue({
      defaultListId: undefined,
      isSaved: jest.fn(() => false),
      savedTargetsByBookmarkKey: {},
    } as never);
    mockedUseQuery.mockImplementation((options: any) => {
      const queryKey = options.queryKey as readonly unknown[];
      if (queryKey.includes("allLocationsHistory")) {
        return {
          data: {
            anchorRestaurant: {
              id: "restaurant-1",
              name: "Erewhon West Hollywood",
            },
            itemCount: 0,
            items: [],
            locationCount: 1,
            normalizedName: "erewhon west hollywood",
            restaurants: [],
            visitCount: 0,
          },
          isError: false,
          isLoading: false,
          refetch: jest.fn(),
        } as never;
      }

      return {
        data: [],
        isError: false,
        isLoading: false,
        refetch: jest.fn(),
      } as never;
    });
  });

  it("renders restaurant context and queries restaurant-scoped menu items", () => {
    const renderer = renderScreen();

    const scaffold = renderer.root.findByType("FeatureDetailScreenScaffold");
    expect(scaffold.props.title).toBe("Erewhon West Hollywood");
    expect(scaffold.props.subtitle).toContain("West Hollywood, CA • Cafe");
    expect(scaffold.props.subtitle).toContain("You: 1 visit");
    expect(scaffold.props.subtitle).toContain("Friends: 2 friends");
    expect(scaffold.props.subtitle).toContain("Google place");
    expect(scaffold.props.rightAccessory).toBeTruthy();
    expect(renderer.root.findAllByType("Card")).toHaveLength(2);
    expect(renderer.root.findAllByType("SegmentedControl")).toHaveLength(0);
    expect(
      renderer.root
        .findAllByType("Text")
        .some((node: any) => node.props.children === "Actions"),
    ).toBe(true);
    expect(mockedUseInfiniteQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: menuItemsQueryKeys.paginated("restaurant-1"),
      }),
    );
    expect(renderer.root.findByType("EmptyState").props.title).toBe(
      "No menu items yet",
    );
  });

  it("saves a discovered menu item to Want to Try without list selection", async () => {
    setMockMenuItems([
      { id: "menu-item-1", name: "Tonic Bar Smoothie", restaurant: "restaurant-1" },
    ]);
    mockedUseWantToTryMembership.mockReturnValue({
      defaultListId: "default_list",
      isSaved: jest.fn(() => false),
      savedTargetsByBookmarkKey: {},
    } as never);
    mockedUseQuery.mockImplementation((options: any) => {
      const queryKey = options.queryKey as readonly unknown[];
      if (queryKey.includes("default")) {
        return {
          data: { id: "default_list", isDefault: true },
          isLoading: false,
          refetch: jest.fn(),
        } as never;
      }
      if (queryKey.includes("restaurantListDetail")) {
        return {
          data: { items: [] },
          isLoading: false,
          refetch: jest.fn(),
        } as never;
      }
      if (queryKey.includes("allLocationsHistory")) {
        return {
          data: {
            anchorRestaurant: {
              id: "restaurant-1",
              name: "Erewhon West Hollywood",
            },
            itemCount: 0,
            items: [],
            locationCount: 1,
            normalizedName: "erewhon west hollywood",
            restaurants: [],
            visitCount: 0,
          },
          isError: false,
          isLoading: false,
          refetch: jest.fn(),
        } as never;
      }

      return {
        data: [
          {
            id: "menu-item-1",
            name: "Tonic Bar Smoothie",
            restaurant: "restaurant-1",
          },
        ],
        isError: false,
        isLoading: false,
        refetch: jest.fn(),
      } as never;
    });
    const renderer = renderScreen();

    let trailingRenderer: any;
    act(() => {
      trailingRenderer = create(
        renderer.root.findByType("ListItem").props.trailing,
      );
    });

    const bookmarkButton = trailingRenderer.root.findByType(
      "WantToTryBookmarkButton",
    );
    expect(bookmarkButton.props.saved).toBe(false);

    await act(async () => {
      await bookmarkButton.props.onPress();
    });

    expect(mockSaveBookmarkToDefaultList).toHaveBeenCalledWith({
      bookmark: {
        menuItemId: "menu-item-1",
        restaurantId: "restaurant-1",
      },
      defaultListId: "default_list",
      membershipTarget: {
        bookmarkKey: "menu-item:restaurant-1:menu-item-1",
        menuItemId: "menu-item-1",
        restaurantId: "restaurant-1",
      },
      optimisticDefaultListBookmark: {
        menuItem: {
          id: "menu-item-1",
          name: "Tonic Bar Smoothie",
        },
        restaurant: expect.objectContaining({
          cuisineType: "Cafe",
          id: "restaurant-1",
          location: "West Hollywood, CA",
          name: "Erewhon West Hollywood",
        }),
        type: "menuItem",
      },
      sourceListId: "default_list",
    });
  });

  it("removes existing default-list menu item bookmarks", async () => {
    setMockMenuItems([
      { id: "menu-item-1", name: "Tonic Bar Smoothie", restaurant: "restaurant-1" },
    ]);
    mockedUseWantToTryMembership.mockReturnValue({
      defaultListId: "default_list",
      isSaved: jest.fn(() => true),
      savedTargetsByBookmarkKey: {
        "menu-item:restaurant-1:menu-item-1": {
          bookmarkKey: "menu-item:restaurant-1:menu-item-1",
          menuItemId: "menu-item-1",
          restaurantId: "restaurant-1",
        },
      },
    } as never);
    mockedUseQuery.mockImplementation((options: any) => {
      const queryKey = options.queryKey as readonly unknown[];
      if (queryKey.includes("default")) {
        return {
          data: { id: "default_list", isDefault: true },
          isLoading: false,
          refetch: jest.fn(),
        } as never;
      }
      if (queryKey.includes("restaurantListDetail")) {
        return {
          data: {
            items: [
              {
                restaurantId: "restaurant-1",
                bookmarkedItems: [
                  {
                    menuItemId: "menu-item-1",
                  },
                ],
              },
            ],
          },
          isLoading: false,
          refetch: jest.fn(),
        } as never;
      }
      if (queryKey.includes("allLocationsHistory")) {
        return {
          data: {
            anchorRestaurant: {
              id: "restaurant-1",
              name: "Erewhon West Hollywood",
            },
            itemCount: 0,
            items: [],
            locationCount: 1,
            normalizedName: "erewhon west hollywood",
            restaurants: [],
            visitCount: 0,
          },
          isError: false,
          isLoading: false,
          refetch: jest.fn(),
        } as never;
      }

      return {
        data: [
          {
            id: "menu-item-1",
            name: "Tonic Bar Smoothie",
            restaurant: "restaurant-1",
          },
        ],
        isError: false,
        isLoading: false,
        refetch: jest.fn(),
      } as never;
    });
    const renderer = renderScreen();

    let trailingRenderer: any;
    act(() => {
      trailingRenderer = create(
        renderer.root.findByType("ListItem").props.trailing,
      );
    });

    const bookmarkButton = trailingRenderer.root.findByType(
      "WantToTryBookmarkButton",
    );
    expect(bookmarkButton.props.saved).toBe(true);

    await act(async () => {
      await bookmarkButton.props.onPress();
    });

    expect(mockSaveBookmarkToDefaultList).not.toHaveBeenCalled();
    expect(mockRemoveBookmarkFromDefaultList).toHaveBeenCalledWith({
      bookmark: {
        menuItemId: "menu-item-1",
        restaurantId: "restaurant-1",
      },
      defaultListId: "default_list",
      membershipTarget: {
        bookmarkKey: "menu-item:restaurant-1:menu-item-1",
        menuItemId: "menu-item-1",
        restaurantId: "restaurant-1",
      },
      sourceListId: "default_list",
    });
  });

  it("disables scan menu items while offline", () => {
    mockIsOnline = false;
    const renderer = renderScreen();

    const scanButton = renderer.root
      .findAllByType("Button")
      .find((node: any) => node.props.label === "Scan Menu Items");

    expect(scanButton?.props.disabled).toBe(true);
  });

  it("starts a visit with the current restaurant from the actions section", () => {
    const renderer = renderScreen();

    const trackVisitButton = renderer.root
      .findAllByType("Button")
      .find(
        (node: any) => node.props.label === "Track Visit With This Restaurant",
      );

    act(() => {
      trackVisitButton?.props.onPress();
    });

    expect(mockNavigate).toHaveBeenCalledWith("CreateVisit", {
      preselectedRestaurantId: "restaurant-1",
      preselectedRestaurantName: "Erewhon West Hollywood",
    });
  });

  it("renders related-location menu suggestions separately from exact-location menu items", () => {
    setMockMenuItems([
      { id: "menu-item-1", name: "Tonic Bar Smoothie", restaurant: "restaurant-1" },
    ]);
    mockedUseQuery.mockImplementation((options: any) => {
      const queryKey = options.queryKey as readonly unknown[];
      if (queryKey.includes("allLocationsHistory")) {
        return {
          data: {
            anchorRestaurant: {
              id: "restaurant-1",
              name: "Erewhon West Hollywood",
            },
            itemCount: 0,
            items: [],
            locationCount: 1,
            normalizedName: "erewhon west hollywood",
            restaurants: [],
            visitCount: 0,
          },
          isError: false,
          isLoading: false,
          refetch: jest.fn(),
        } as never;
      }
      if (queryKey.includes("menuItems")) {
        return {
          data: [
            {
              id: "menu-item-1",
              name: "Tonic Bar Smoothie",
              restaurant: "restaurant-1",
            },
          ],
          isError: false,
          isLoading: false,
          refetch: jest.fn(),
        } as never;
      }
      if (queryKey.includes("groupMenuSuggestions")) {
        return {
          data: {
            restaurantId: "restaurant-1",
            restaurantGroupId: "group-1",
            suggestions: [
              {
                displayName: "Tonic Bar Smoothie",
                normalizedItemName: "tonic bar smoothie",
                sourceItemCount: 2,
                sourceRestaurantCount: 2,
                sources: [],
              },
              {
                displayName: "Coconut Yogurt",
                normalizedItemName: "coconut yogurt",
                sourceItemCount: 3,
                sourceRestaurantCount: 2,
                sources: [
                  {
                    menuItemCount: 3,
                    menuItemIds: ["menu-item-2"],
                    restaurantId: "restaurant-2",
                    restaurantLocation: "Venice, CA",
                    restaurantName: "Erewhon Venice",
                  },
                ],
              },
            ],
          },
          isError: false,
          isLoading: false,
          refetch: jest.fn(),
        } as never;
      }

      return {
        data: [],
        isError: false,
        isLoading: false,
        refetch: jest.fn(),
      } as never;
    });
    const renderer = renderScreen();

    expect(
      renderer.root
        .findAllByType("Text")
        .some((node: any) => node.props.children === "Saved Menu Items"),
    ).toBe(true);
    expect(
      renderer.root
        .findAllByType("Text")
        .some(
          (node: any) =>
            node.props.children === "Suggested From Related Locations",
        ),
    ).toBe(true);

    const listItemTitles = renderer.root
      .findAllByType("ListItem")
      .map((node: any) => node.props.title);
    expect(
      listItemTitles.filter((title: string) => title === "Tonic Bar Smoothie"),
    ).toHaveLength(1);
    expect(listItemTitles).toContain("Coconut Yogurt");

    const text = renderer.root.findAllByType("Text").map(collectText).join(" ");
    expect(text).toContain("Suggested from 2 related locations");
    expect(text).not.toContain("Starts a visit here with this item preselected.");
    expect(text).not.toContain("Restaurant Group");
  });

  it("renders exact ordered-history badges on menu rows without adding history labels to suggestions", () => {
    setMockMenuItems([
      { id: "menu-item-1", name: "Tonic Bar Smoothie", restaurant: "restaurant-1" },
      {
        id: "menu-item-2",
        name: "Spicy Miso Ramen",
        restaurant: "restaurant-1",
        userEatenCount: 1,
      },
      { id: "menu-item-3", name: "No History Item", restaurant: "restaurant-1" },
    ]);
    mockedUseQuery.mockImplementation((options: any) => {
      const queryKey = options.queryKey as readonly unknown[];
      if (queryKey.includes("allLocationsHistory")) {
        return {
          data: {
            anchorRestaurant: {
              id: "restaurant-1",
              name: "Erewhon West Hollywood",
            },
            itemCount: 2,
            items: [
              {
                averageRating: 5,
                displayName: "Tonic Bar Smoothie",
                latestRating: 5,
                latestRestaurantId: "restaurant-1",
                latestRestaurantName: "Erewhon West Hollywood",
                latestVisitedAt: "2026-04-05T18:30:00.000Z",
                normalizedItemName: "tonic bar smoothie",
                orderCount: 1,
                restaurants: [
                  {
                    orderCount: 1,
                    restaurantId: "restaurant-1",
                    restaurantName: "Erewhon West Hollywood",
                  },
                ],
              },
              {
                averageRating: 4,
                displayName: "Coconut Yogurt",
                latestRating: 4,
                latestRestaurantId: "restaurant-2",
                latestRestaurantLocation: "Venice, CA",
                latestRestaurantName: "Erewhon Venice",
                latestVisitedAt: "2026-04-04T18:30:00.000Z",
                normalizedItemName: "coconut yogurt",
                orderCount: 2,
                restaurants: [
                  {
                    orderCount: 2,
                    restaurantId: "restaurant-2",
                    restaurantLocation: "Venice, CA",
                    restaurantName: "Erewhon Venice",
                  },
                ],
              },
            ],
            latestVisitedAt: "2026-04-05T18:30:00.000Z",
            locationCount: 2,
            normalizedName: "erewhon west hollywood",
            restaurants: [],
            visitCount: 3,
          },
          isError: false,
          isLoading: false,
          refetch: jest.fn(),
        } as never;
      }
      if (queryKey.includes("menuItems")) {
        return {
          data: [
            {
              id: "menu-item-1",
              name: "Tonic Bar Smoothie",
              restaurant: "restaurant-1",
            },
            {
              id: "menu-item-2",
              name: "Spicy Miso Ramen",
              restaurant: "restaurant-1",
              userEatenCount: 1,
            },
            {
              id: "menu-item-3",
              name: "No History Item",
              restaurant: "restaurant-1",
            },
          ],
          isError: false,
          isLoading: false,
          refetch: jest.fn(),
        } as never;
      }
      if (queryKey.includes("groupMenuSuggestions")) {
        return {
          data: {
            restaurantId: "restaurant-1",
            restaurantGroupId: "group-1",
            suggestions: [
              {
                displayName: "Coconut Yogurt",
                normalizedItemName: "coconut yogurt",
                sourceItemCount: 1,
                sourceRestaurantCount: 1,
                sources: [
                  {
                    menuItemCount: 1,
                    menuItemIds: ["related-menu-item-1"],
                    restaurantId: "restaurant-2",
                    restaurantLocation: "Venice, CA",
                    restaurantName: "Erewhon Venice",
                  },
                ],
              },
            ],
          },
          isError: false,
          isLoading: false,
          refetch: jest.fn(),
        } as never;
      }

      return {
        data: [],
        isError: false,
        isLoading: false,
        refetch: jest.fn(),
      } as never;
    });
    const renderer = renderScreen();

    const text = renderer.root.findAllByType("Text").map(collectText).join(" ");
    const listItemTitles = renderer.root
      .findAllByType("ListItem")
      .map((node: any) => node.props.title);
    expect(text).toContain("Had 1 time");
    expect(text).not.toContain("Had here");
    expect(text).not.toContain("Had at related locations");
    expect(listItemTitles).toContain("No History Item");
    expect(text).not.toContain("User typed ramen text");
  });

  it("renders related-location suggestions as informational rows", () => {
    mockedUseQuery.mockImplementation((options: any) => {
      const queryKey = options.queryKey as readonly unknown[];
      if (queryKey.includes("allLocationsHistory")) {
        return {
          data: {
            anchorRestaurant: {
              id: "restaurant-1",
              name: "Erewhon West Hollywood",
            },
            itemCount: 0,
            items: [],
            locationCount: 1,
            normalizedName: "erewhon west hollywood",
            restaurants: [],
            visitCount: 0,
          },
          isError: false,
          isLoading: false,
          refetch: jest.fn(),
        } as never;
      }
      if (queryKey.includes("groupMenuSuggestions")) {
        return {
          data: {
            restaurantId: "restaurant-1",
            suggestions: [
              {
                displayName: "Coconut Yogurt",
                normalizedItemName: "coconut yogurt",
                sourceItemCount: 1,
                sourceRestaurantCount: 1,
                sources: [
                  {
                    menuItemCount: 1,
                    menuItemIds: ["menu-item-2"],
                    restaurantId: "restaurant-2",
                    restaurantName: "Erewhon Venice",
                  },
                ],
              },
            ],
          },
          isError: false,
          isLoading: false,
          refetch: jest.fn(),
        } as never;
      }

      return {
        data: [],
        isError: false,
        isLoading: false,
        refetch: jest.fn(),
      } as never;
    });
    const renderer = renderScreen();

    const suggestionRow = renderer.root.findByProps({
      testID: "restaurant-discovery-related-menu-suggestion-0",
    });

    expect(suggestionRow.props.title).toBe("Coconut Yogurt");
    expect(suggestionRow.props.onPress).toBeUndefined();
    expect(suggestionRow.props.trailing).toBeUndefined();
    expect(mockNavigate).not.toHaveBeenCalled();

    const text = renderer.root.findAllByType("Text").map(collectText).join(" ");
    expect(text).toContain("Suggested from 1 related location");
    expect(text).not.toContain("Starts a visit here with this item preselected.");
  });

  it("hides related-location suggestions when none qualify", () => {
    setMockMenuItems([
      { id: "menu-item-1", name: "Tonic Bar Smoothie", restaurant: "restaurant-1" },
    ]);
    mockedUseQuery.mockImplementation((options: any) => {
      const queryKey = options.queryKey as readonly unknown[];
      if (queryKey.includes("allLocationsHistory")) {
        return {
          data: {
            anchorRestaurant: {
              id: "restaurant-1",
              name: "Erewhon West Hollywood",
            },
            itemCount: 0,
            items: [],
            locationCount: 1,
            normalizedName: "erewhon west hollywood",
            restaurants: [],
            visitCount: 0,
          },
          isError: false,
          isLoading: false,
          refetch: jest.fn(),
        } as never;
      }
      if (queryKey.includes("menuItems")) {
        return {
          data: [
            {
              id: "menu-item-1",
              name: "Tonic Bar Smoothie",
              restaurant: "restaurant-1",
            },
          ],
          isError: false,
          isLoading: false,
          refetch: jest.fn(),
        } as never;
      }
      if (queryKey.includes("groupMenuSuggestions")) {
        return {
          data: {
            restaurantId: "restaurant-1",
            suggestions: [
              {
                displayName: "Tonic Bar Smoothie",
                normalizedItemName: "tonic bar smoothie",
                sourceItemCount: 2,
                sourceRestaurantCount: 2,
                sources: [],
              },
            ],
          },
          isError: false,
          isLoading: false,
          refetch: jest.fn(),
        } as never;
      }

      return {
        data: [],
        isError: false,
        isLoading: false,
        refetch: jest.fn(),
      } as never;
    });
    const renderer = renderScreen();

    expect(
      renderer.root
        .findAllByType("Text")
        .some(
          (node: any) =>
            node.props.children === "Suggested From Related Locations",
        ),
    ).toBe(false);
  });

  it("opens the shared menu scan screen for food discovery restaurants", () => {
    const renderer = renderScreen();

    const scanButton = renderer.root
      .findAllByType("Button")
      .find((node: any) => node.props.label === "Scan Menu Items");

    act(() => {
      scanButton?.props.onPress();
    });

    expect(mockNavigate).toHaveBeenCalledWith("ProcessPhotos", {
      autoStartSourcePicker: false,
      mode: "menu_scan",
      restaurantId: "restaurant-1",
      restaurantName: "Erewhon West Hollywood",
      returnTo: "RestaurantDiscoveryRestaurant",
      returnToRestaurantDiscoveryRestaurantParams: expect.objectContaining({
        restaurantId: "restaurant-1",
        restaurantName: "Erewhon West Hollywood",
      }),
    });
  });

  it("shows all locations scope when history spans multiple locations", () => {
    mockedUseQuery.mockImplementation((options: any) => {
      const queryKey = options.queryKey as readonly unknown[];
      if (queryKey.includes("allLocationsHistory")) {
        return {
          data: {
            anchorRestaurant: {
              id: "restaurant-1",
              name: "Erewhon West Hollywood",
            },
            itemCount: 2,
            items: [
              {
                averageRating: 4.5,
                displayName: "Tonic Bar Smoothie",
                latestRating: 5,
                latestRestaurantId: "restaurant-2",
                latestRestaurantLocation: "Venice, CA",
                latestRestaurantName: "Erewhon West Hollywood",
                latestVisitedAt: "2026-04-05T18:30:00.000Z",
                normalizedItemName: "tonic bar smoothie",
                orderCount: 2,
                restaurants: [],
              },
            ],
            latestVisitedAt: "2026-04-05T18:30:00.000Z",
            locationCount: 2,
            normalizedName: "erewhon west hollywood",
            restaurants: [],
            visitCount: 3,
          },
          isError: false,
          isLoading: false,
          refetch: jest.fn(),
        } as never;
      }

      return {
        data: [],
        isError: false,
        isLoading: false,
        refetch: jest.fn(),
      } as never;
    });
    const renderer = renderScreen();

    const segmentedControl = renderer.root.findByType("SegmentedControl");
    expect(segmentedControl.props.options).toEqual([
      { label: "This Location", value: "location" },
      { label: "All Locations", value: "allLocations" },
    ]);

    act(() => {
      segmentedControl.props.onChange("allLocations");
    });

    const listItem = renderer.root.findByType("ListItem");
    expect(
      renderer.root
        .findAllByType("Text")
        .some(
          (node: any) => node.props.children === "Ordered Across Locations",
        ),
    ).toBe(true);
    expect(listItem.props.title).toBe("Tonic Bar Smoothie");
    expect(renderer.root.findByType("RatingPill").props.rating).toBe(5);
  });

  it("shows all locations scope when the only ordered location is a matching different restaurant", () => {
    mockedUseQuery.mockImplementation((options: any) => {
      const queryKey = options.queryKey as readonly unknown[];
      if (queryKey.includes("allLocationsHistory")) {
        return {
          data: {
            anchorRestaurant: {
              id: "restaurant-1",
              name: "Erewhon West Hollywood",
            },
            itemCount: 1,
            items: [
              {
                averageRating: 5,
                displayName: "Coconut Yogurt",
                latestRating: 5,
                latestRestaurantId: "restaurant-2",
                latestRestaurantLocation: "Venice, CA",
                latestRestaurantName: "Erewhon West Hollywood",
                latestVisitedAt: "2026-04-05T18:30:00.000Z",
                normalizedItemName: "coconut yogurt",
                orderCount: 1,
                restaurants: [
                  {
                    orderCount: 1,
                    restaurantId: "restaurant-2",
                    restaurantLocation: "Venice, CA",
                    restaurantName: "Erewhon West Hollywood",
                  },
                ],
              },
            ],
            latestVisitedAt: "2026-04-05T18:30:00.000Z",
            locationCount: 1,
            normalizedName: "erewhon west hollywood",
            restaurants: [
              {
                latestVisitedAt: "2026-04-05T18:30:00.000Z",
                restaurantId: "restaurant-2",
                restaurantLocation: "Venice, CA",
                restaurantName: "Erewhon West Hollywood",
                visitCount: 1,
              },
            ],
            visitCount: 1,
          },
          isError: false,
          isLoading: false,
          refetch: jest.fn(),
        } as never;
      }

      return {
        data: [],
        isError: false,
        isLoading: false,
        refetch: jest.fn(),
      } as never;
    });
    const renderer = renderScreen();

    const segmentedControl = renderer.root.findByType("SegmentedControl");
    act(() => {
      segmentedControl.props.onChange("allLocations");
    });

    expect(renderer.root.findByType("ListItem").props.title).toBe(
      "Coconut Yogurt",
    );
  });

  it("renders a retryable all locations error without blocking the screen", () => {
    const refetch = jest.fn();
    mockedUseQuery.mockImplementation((options: any) => {
      const queryKey = options.queryKey as readonly unknown[];
      if (queryKey.includes("allLocationsHistory")) {
        return {
          data: {
            anchorRestaurant: {
              id: "restaurant-1",
              name: "Erewhon West Hollywood",
            },
            itemCount: 1,
            items: [],
            locationCount: 2,
            normalizedName: "erewhon west hollywood",
            restaurants: [],
            visitCount: 1,
          },
          error: new Error("Could not refresh orders"),
          isError: true,
          isLoading: false,
          refetch,
        } as never;
      }

      return {
        data: [],
        isError: false,
        isLoading: false,
        refetch: jest.fn(),
      } as never;
    });
    const renderer = renderScreen();

    act(() => {
      renderer.root
        .findByType("SegmentedControl")
        .props.onChange("allLocations");
    });

    expect(
      renderer.root.findByProps({ title: "Orders unavailable" }).props
        .errorMessage,
    ).toBe("Could not load orders across locations.");
    expect(
      renderer.root.findByType("FeatureDetailScreenScaffold").props.title,
    ).toBe("Erewhon West Hollywood");
  });
});
