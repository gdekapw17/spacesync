/**
 * Pagination metadata contract for list-based and paginated queries.
 * Standardized across all collection endpoints.
 */
export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

/**
 * Standard data envelope contract for all successful HTTP (2xx) responses.
 * Guarantees a deterministic response schema for client SDKs and frontends.
 */
export interface ApiResponse<T> {
  success: true;
  statusCode: number;
  message: string;
  data: T;
  meta?: PaginationMeta;
}

/**
 * Granular field validation issue contract for form field mapping on clients.
 */
export interface ApiFieldError {
  field: string;
  issue: string;
}

/**
 * Standard error response envelope contract for all failed HTTP (4xx and 5xx) responses.
 */
export interface ApiErrorResponse {
  success: false;
  statusCode: number;
  error: string;
  message: string;
  errors?: ApiFieldError[];
  data?: unknown;
  timestamp: string;
  path: string;
}
