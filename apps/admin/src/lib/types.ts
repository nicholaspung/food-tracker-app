import type { AdminUser } from '@/features/auth/types';

export interface RestaurantSummary {
  id: string;
  name?: string;
}

export interface MenuReviewRequest {
  id: string;
  restaurant: string;
  requestedBy: string;
  reason?: string;
  adminNotes?: string;
  status: 'pending' | 'reviewed' | 'dismissed';
  created: string;
  updated: string;
  expand?: {
    restaurant?: RestaurantSummary;
    requestedBy?: AdminUser;
  };
}

export interface MenuItemRecord {
  id: string;
  restaurant: string;
  name: string;
  description?: string;
  visibility?: 'private' | 'friends' | 'public';
  created: string;
  updated: string;
}

export interface FeedbackThread {
  id: string;
  user: string;
  title: string;
  description: string;
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  admin_unread_count?: number;
  user_unread_count?: number;
  last_message_at?: string;
  created: string;
  updated: string;
  expand?: {
    user?: AdminUser;
  };
}

export interface VisitSummary {
  id: string;
  user: string;
  restaurant?: string;
  visitDate?: string;
  created: string;
  expand?: {
    restaurant?: RestaurantSummary;
  };
}

export interface FoodItemSummary {
  id: string;
  name: string;
  rating: number;
  created: string;
}

export interface NoteSummary {
  id: string;
  content: string;
  created: string;
}

export interface PhotoUpload {
  id: string;
  user: string;
  visit?: string;
  foodItem?: string;
  photo: string;
  created: string;
  expand?: {
    user?: AdminUser;
    visit?: VisitSummary;
    foodItem?: FoodItemSummary;
  };
}
