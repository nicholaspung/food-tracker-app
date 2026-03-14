interface PaginationControlsProps {
  currentPage: number;
  endItem: number;
  position?: 'bottom' | 'top';
  setCurrentPage: (page: number | ((page: number) => number)) => void;
  startItem: number;
  totalItems: number;
  totalPages: number;
}

export function PaginationControls({
  currentPage,
  endItem,
  position = 'bottom',
  setCurrentPage,
  startItem,
  totalItems,
  totalPages,
}: PaginationControlsProps) {
  if (totalPages <= 1) {
    return null;
  }

  return (
    <div className={`pagination-bar pagination-bar-${position}`}>
      <span className="pagination-summary">
        Showing {startItem}-{endItem} of {totalItems}
      </span>

      <div className="pagination-actions">
        <button
          className="button ghost"
          disabled={currentPage === 1}
          onClick={() => setCurrentPage(1)}
          type="button"
        >
          First
        </button>
        <button
          className="button ghost"
          disabled={currentPage === 1}
          onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
          type="button"
        >
          Previous
        </button>
        <span className="tag">
          Page {currentPage} of {totalPages}
        </span>
        <button
          className="button ghost"
          disabled={currentPage === totalPages}
          onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
          type="button"
        >
          Next
        </button>
        <button
          className="button ghost"
          disabled={currentPage === totalPages}
          onClick={() => setCurrentPage(totalPages)}
          type="button"
        >
          Last
        </button>
      </div>
    </div>
  );
}
