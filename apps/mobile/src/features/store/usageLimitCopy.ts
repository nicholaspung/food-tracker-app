export const FREE_MONTHLY_PHOTO_UPLOAD_LIMIT = 100;

export function formatFreeMonthlyPhotoLimitStatus(remaining: number): string {
  return `Free users can upload up to ${FREE_MONTHLY_PHOTO_UPLOAD_LIMIT} photos per month. Remaining estimate: ${remaining}.`;
}
