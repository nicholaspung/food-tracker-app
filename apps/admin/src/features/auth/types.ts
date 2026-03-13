export interface AdminUser {
  id: string;
  email: string;
  name?: string;
  isAdmin: boolean;
  isSubscriber?: boolean;
  isBetaUser?: boolean;
  created?: string;
  updated?: string;
}
