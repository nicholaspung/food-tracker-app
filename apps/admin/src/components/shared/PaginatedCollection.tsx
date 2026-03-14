import type { ReactNode } from 'react';

import { PaginationControls } from '@/components/shared/PaginationControls';
import { usePagination } from '@/components/shared/usePagination';

interface PaginatedCollectionProps<T> {
  children: (pageItems: T[]) => ReactNode;
  items: T[];
  itemsPerPage?: number;
  resetKey?: string | number | boolean | null | undefined;
}

export function PaginatedCollection<T>({
  children,
  items,
  itemsPerPage,
  resetKey,
}: PaginatedCollectionProps<T>) {
  const pagination = usePagination(items, {
    itemsPerPage,
    resetKey,
  });

  return (
    <div className="paginated-collection">
      <PaginationControls {...pagination} position="top" />
      {children(pagination.pageItems)}
      <PaginationControls {...pagination} />
    </div>
  );
}
