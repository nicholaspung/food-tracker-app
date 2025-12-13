import { Restaurant } from "@/hooks/api/useRestaurants";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar } from "lucide-react";

interface RecentRestaurantsBannerProps {
  recentRestaurants: Restaurant[];
  onSelectRestaurant: (restaurant: Restaurant) => void;
}

export default function RecentRestaurantsBanner({
  recentRestaurants,
  onSelectRestaurant,
}: RecentRestaurantsBannerProps) {
  if (recentRestaurants.length === 0) {
    return null;
  }

  return (
    <Card className="bg-blue-50/50 border-blue-200">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Calendar className="w-4 h-4 text-blue-600" />
          Recently Visited
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {recentRestaurants.slice(0, 3).map((restaurant) => (
            <button
              key={restaurant.id}
              onClick={() => onSelectRestaurant(restaurant)}
              className="w-full text-left p-3 rounded-lg bg-white hover:bg-gray-50 border border-gray-200 transition-colors"
            >
              <div className="font-medium text-gray-900">{restaurant.name}</div>
              <div className="text-sm text-gray-600 mt-0.5">
                {restaurant.location}
                {restaurant.cuisineType && ` • ${restaurant.cuisineType}`}
              </div>
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
