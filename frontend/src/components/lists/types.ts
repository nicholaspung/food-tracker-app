import { ListItem, Restaurant, User, FoodItem } from "@/lib/pocketbase";

// Interface for fullscreen user review display
export interface UserReviewData {
  foodItem: FoodItem;
  restaurant: Restaurant;
  visitDate?: string;
}

// Interface for grouped restaurant data (now with individual food items)
export interface GroupedRestaurant {
  restaurant: Restaurant;
  // Array of bookmarked items grouped by source user
  itemsBySource: Array<{
    sourceUser: User | null;
    items: Array<{
      listItem: ListItem;
      foodItem: FoodItem;
    }>;
    notes: string[];
  }>;
  // First position for ordering
  firstPosition: number;
}
