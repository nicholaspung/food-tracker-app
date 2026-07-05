export interface PaginatedResult<T> {
  items: T[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  hasNextPage: boolean;
}

export interface PaginationInput {
  page?: number;
  pageSize?: number;
  signal?: AbortSignal;
}
