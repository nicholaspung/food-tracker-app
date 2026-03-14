import { useEffect, useMemo, useState } from 'react';

export function usePagination<T>(
  items: T[],
  options?: {
    itemsPerPage?: number;
    resetKey?: string | number | boolean | null | undefined;
  },
) {
  const itemsPerPage = options?.itemsPerPage ?? 20;
  const [currentPage, setCurrentPage] = useState(1);
  const totalItems = items.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / itemsPerPage));

  useEffect(() => {
    setCurrentPage(1);
  }, [options?.resetKey]);

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, totalPages));
  }, [totalPages]);

  const pageItems = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return items.slice(startIndex, startIndex + itemsPerPage);
  }, [currentPage, items, itemsPerPage]);

  const startItem = totalItems === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1;
  const endItem = totalItems === 0 ? 0 : Math.min(currentPage * itemsPerPage, totalItems);

  return {
    currentPage,
    endItem,
    hasMultiplePages: totalPages > 1,
    pageItems,
    setCurrentPage,
    startItem,
    totalItems,
    totalPages,
  };
}
