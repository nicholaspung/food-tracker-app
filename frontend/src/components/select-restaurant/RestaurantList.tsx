import { useState, useEffect, useRef } from "react";
import { Restaurant } from "@/hooks/api/useRestaurants";
import { Button } from "@/components/ui/button";
import RestaurantCard from "./RestaurantCard";
import { calculateDistance } from "@/services/googlePlaces";

interface RestaurantListProps {
  restaurants: Restaurant[];
  referenceCoords?: { lat: number; lng: number } | null;
  highlightedRestaurants?: Set<string>;
  getRestaurantStats?: (restaurantId: string) => {
    userVisitCount: number;
    friendCount: number;
  };
  onSelectRestaurant: (restaurant: Restaurant) => void;
  showPagination?: boolean;
  resultsPerPage?: number;
}

export default function RestaurantList({
  restaurants,
  referenceCoords,
  highlightedRestaurants = new Set(),
  getRestaurantStats,
  onSelectRestaurant,
  showPagination = true,
  resultsPerPage = 20,
}: RestaurantListProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const [currentPage, setCurrentPage] = useState(1);

  // Reset to page 1 when restaurants list changes
  useEffect(() => {
    setCurrentPage(1);
  }, [restaurants.length]);

  // Scroll to top of list when page changes
  useEffect(() => {
    if (listRef.current && currentPage > 1) {
      listRef.current.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }
  }, [currentPage]);

  // Pagination logic
  const totalPages = Math.ceil(restaurants.length / resultsPerPage);
  const startIndex = (currentPage - 1) * resultsPerPage;
  const endIndex = startIndex + resultsPerPage;

  // Calculate distances and sort by distance if reference coords are available
  const restaurantsWithDistance = restaurants
    .map((restaurant) => {
      let distance: number | null = null;
      if (
        referenceCoords &&
        restaurant.latitude != null &&
        restaurant.longitude != null
      ) {
        distance = calculateDistance(
          referenceCoords.lat,
          referenceCoords.lng,
          restaurant.latitude,
          restaurant.longitude
        );
      }
      return { restaurant, distance };
    })
    .sort((a, b) => {
      if (a.distance === null && b.distance === null) return 0;
      if (a.distance === null) return 1;
      if (b.distance === null) return -1;
      return a.distance - b.distance;
    });

  const paginatedRestaurants = restaurantsWithDistance.slice(
    startIndex,
    endIndex
  );

  // Calculate which pages to show in pagination
  const getPageNumbers = (currentPageNum: number, totalPagesNum: number) => {
    const pages: (number | string)[] = [];
    const maxPagesToShow = 5;

    if (totalPagesNum <= maxPagesToShow) {
      for (let i = 1; i <= totalPagesNum; i++) {
        pages.push(i);
      }
    } else {
      pages.push(1);

      if (currentPageNum > 3) {
        pages.push("...");
      }

      const start = Math.max(2, currentPageNum - 1);
      const end = Math.min(totalPagesNum - 1, currentPageNum + 1);

      for (let i = start; i <= end; i++) {
        pages.push(i);
      }

      if (currentPageNum < totalPagesNum - 2) {
        pages.push("...");
      }

      pages.push(totalPagesNum);
    }

    return pages;
  };

  if (restaurants.length === 0) {
    return null;
  }

  return (
    <>
      <div ref={listRef} className="space-y-3">
        {paginatedRestaurants.map(({ restaurant, distance }) => {
          const stats = getRestaurantStats?.(restaurant.id) ?? {
            userVisitCount: 0,
            friendCount: 0,
          };
          const isHighlighted = highlightedRestaurants.has(restaurant.id);

          return (
            <RestaurantCard
              key={restaurant.id}
              restaurant={restaurant}
              distance={distance}
              userVisitCount={stats.userVisitCount}
              friendCount={stats.friendCount}
              isHighlighted={isHighlighted}
              onClick={() => onSelectRestaurant(restaurant)}
            />
          );
        })}
      </div>

      {/* Pagination Controls */}
      {showPagination && restaurants.length > 0 && totalPages > 1 && (
        <>
          <div className="flex items-center justify-center gap-1 py-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(1)}
              disabled={currentPage === 1}
              className="px-2"
            >
              &lt;&lt;
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="px-2"
            >
              &lt;
            </Button>

            {getPageNumbers(currentPage, totalPages).map((page, idx) =>
              page === "..." ? (
                <span key={`ellipsis-${idx}`} className="px-2 text-gray-400">
                  ...
                </span>
              ) : (
                <Button
                  key={page}
                  variant={currentPage === page ? "default" : "outline"}
                  size="sm"
                  onClick={() => setCurrentPage(page as number)}
                  className="min-w-[2.5rem]"
                >
                  {page}
                </Button>
              )
            )}

            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="px-2"
            >
              &gt;
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(totalPages)}
              disabled={currentPage === totalPages}
              className="px-2"
            >
              &gt;&gt;
            </Button>
          </div>

          {/* Page info */}
          <div className="text-center text-sm text-gray-600">
            Showing {startIndex + 1}-{Math.min(endIndex, restaurants.length)} of{" "}
            {restaurants.length} {restaurants.length === 1 ? "place" : "places"}
            {totalPages > 1 && ` (Page ${currentPage} of ${totalPages})`}
          </div>
        </>
      )}
    </>
  );
}
