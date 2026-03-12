export interface AdminUser {
  id: string;
  email: string;
  name?: string;
  isAdmin: boolean;
  isSubscriber?: boolean;
  created?: string;
  updated?: string;
}
