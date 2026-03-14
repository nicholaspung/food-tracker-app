export interface AdminUser {
  id: string;
  email: string;
  name?: string;
  isAdmin: boolean;
  isSubscriber?: boolean;
  isBetaUser?: boolean;
  moderationState?: 'active' | 'warned' | 'restricted' | 'banned';
  contentModerationMode?: 'normal' | 'pre_review';
  warningCount?: number;
  moderationNotes?: string;
  moderationNotice?: string;
  postingSuspendedUntil?: string;
  photoSuspendedUntil?: string;
  created?: string;
  updated?: string;
}
