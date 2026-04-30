import type { NoteRecord } from '../../features';

export function formatTimeAgo(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Unknown';
  }

  const elapsedMs = Date.now() - date.getTime();
  const elapsedMinutes = Math.max(0, Math.floor(elapsedMs / (1000 * 60)));
  if (elapsedMinutes < 1) {
    return 'just now';
  }

  if (elapsedMinutes < 60) {
    return `${elapsedMinutes}m ago`;
  }

  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) {
    return `${elapsedHours}h ago`;
  }

  const elapsedDays = Math.floor(elapsedHours / 24);
  if (elapsedDays < 30) {
    return `${elapsedDays}d ago`;
  }

  const elapsedMonths = Math.floor(elapsedDays / 30);
  if (elapsedMonths < 12) {
    return `${elapsedMonths}mo ago`;
  }

  const elapsedYears = Math.floor(elapsedMonths / 12);
  return `${elapsedYears}y ago`;
}

export function compareNotesByCreatedAtDesc(
  left: Pick<NoteRecord, 'createdAt' | 'updatedAt'>,
  right: Pick<NoteRecord, 'createdAt' | 'updatedAt'>,
): number {
  const createdDiff = new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
  if (!Number.isNaN(createdDiff) && createdDiff !== 0) {
    return createdDiff;
  }

  const updatedDiff = new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
  if (!Number.isNaN(updatedDiff)) {
    return updatedDiff;
  }

  return 0;
}
