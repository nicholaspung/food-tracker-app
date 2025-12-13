import { Restaurant } from "@/hooks/api/useRestaurants";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MapPin, Calendar, Users, Lock, Globe } from "lucide-react";
import { formatDistance } from "@/services/googlePlaces";

interface RestaurantCardProps {
  restaurant: Restaurant;
  distance?: number | null;
  userVisitCount?: number;
  friendCount?: number;
  isHighlighted?: boolean;
  onClick: () => void;
}

export default function RestaurantCard({
  restaurant,
  distance,
  userVisitCount = 0,
  friendCount = 0,
  isHighlighted = false,
  onClick,
}: RestaurantCardProps) {
  const getVisibilityIcon = (visibility?: "private" | "friends" | "public") => {
    switch (visibility) {
      case "private":
        return <Lock className="w-3 h-3 text-gray-600" />;
      case "friends":
        return <Users className="w-3 h-3 text-blue-600" />;
      case "public":
        return <Globe className="w-3 h-3 text-green-600" />;
      default:
        return <Globe className="w-3 h-3 text-green-600" />; // Default to public for existing data
    }
  };

  return (
    <Card
      className={`cursor-pointer hover:shadow-md transition-all py-3 ${
        isHighlighted
          ? "border-2 border-yellow-400 bg-yellow-50 animate-pulse shadow-lg"
          : ""
      }`}
      onClick={onClick}
    >
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <CardTitle className="text-lg">{restaurant.name}</CardTitle>
              {getVisibilityIcon(restaurant.visibility)}
            </div>
            <CardDescription className="mt-1">
              {restaurant.location}
              {restaurant.cuisineType && ` • ${restaurant.cuisineType}`}
            </CardDescription>
          </div>
          {distance !== undefined && distance !== null && (
            <Badge variant="secondary" className="ml-2">
              <MapPin className="w-3 h-3 mr-1" />
              {formatDistance(distance)}
            </Badge>
          )}
        </div>
        {(userVisitCount > 0 || friendCount > 0) && (
          <div className="flex items-center gap-3 mt-2 text-xs text-gray-600">
            {userVisitCount > 0 && (
              <div className="flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                <span>
                  You: {userVisitCount} {userVisitCount === 1 ? "visit" : "visits"}
                </span>
              </div>
            )}
            {friendCount > 0 && (
              <div className="flex items-center gap-1">
                <Users className="w-3 h-3" />
                <span>
                  {friendCount} {friendCount === 1 ? "friend" : "friends"}
                </span>
              </div>
            )}
          </div>
        )}
      </CardHeader>
    </Card>
  );
}
