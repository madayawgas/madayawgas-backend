/**
 * Centralized Pagination Utilities
 * Provides request query parsing, boundary sanitization, offset calculation,
 * and standardized metadata formatting for server-side pagination.
 */

/**
 * Parses and sanitizes pagination query parameters from Express `req.query`.
 * Enforces safe defaults and strict field whitelisting to prevent SQL injection.
 *
 * @param {Object} query - Express request query object (req.query)
 * @param {Object} [options]
 * @param {number} [options.defaultLimit=20] - Fallback items per page
 * @param {number} [options.maxLimit=100] - Ceiling for items per page
 * @param {string} [options.defaultSort='created_at'] - Default sort field
 * @param {string} [options.defaultOrder='DESC'] - Default sort direction (ASC or DESC)
 * @param {Object} [options.allowedSortFields={}] - Mapping of exposed field names to safe SQL column identifiers
 * @returns {Object} Sanitized pagination options
 */
function parsePaginationQuery(query = {}, options = {}) {
  const {
    defaultLimit = 20,
    maxLimit = 100,
    defaultSort = 'created_at',
    defaultOrder = 'DESC',
    allowedSortFields = {},
  } = options;

  const hasPagination =
    query.page !== undefined ||
    query.limit !== undefined ||
    query.pageSize !== undefined ||
    query.paginate === 'true';

  // Parse page (minimum 1)
  const parsedPage = parseInt(query.page, 10);
  const page = !isNaN(parsedPage) && parsedPage >= 1 ? parsedPage : 1;

  // Parse limit / pageSize (between 1 and maxLimit, fallback to defaultLimit)
  const rawLimit = query.limit !== undefined ? query.limit : query.pageSize;
  const parsedLimit = parseInt(rawLimit, 10);
  let limit = defaultLimit;
  if (!isNaN(parsedLimit) && parsedLimit >= 1) {
    limit = Math.min(maxLimit, parsedLimit);
  }

  // Parse sort direction
  const rawOrder = String(query.sortOrder || defaultOrder).toUpperCase();
  const sortOrder = rawOrder === 'ASC' ? 'ASC' : 'DESC';

  // Parse sort field against strict whitelist
  const rawSortBy = query.sortBy;
  let sortColumn = allowedSortFields[defaultSort] || defaultSort;
  let sortBy = defaultSort;
  if (rawSortBy && allowedSortFields[rawSortBy]) {
    sortColumn = allowedSortFields[rawSortBy];
    sortBy = rawSortBy;
  }

  return {
    isPaginated: hasPagination,
    page,
    limit,
    sortBy,
    sortColumn,
    sortOrder,
  };
}

/**
 * Calculates SQL OFFSET from 1-indexed page and limit.
 *
 * @param {number} page
 * @param {number} limit
 * @returns {number}
 */
function calculateOffset(page, limit) {
  const safePage = Math.max(1, parseInt(page, 10) || 1);
  const safeLimit = Math.max(1, parseInt(limit, 10) || 20);
  return (safePage - 1) * safeLimit;
}

/**
 * Assembles the standardized pagination metadata object.
 *
 * @param {number|string} totalItems - Total matching records from COUNT(*)
 * @param {number} page - Current 1-indexed page number
 * @param {number} limit - Requested items per page
 * @returns {Object} meta
 */
function buildPaginationMeta(totalItems, page, limit) {
  const total = Math.max(0, parseInt(totalItems, 10) || 0);
  const safePage = Math.max(1, parseInt(page, 10) || 1);
  const safeLimit = Math.max(1, parseInt(limit, 10) || 20);
  const totalPages = total === 0 ? 0 : Math.ceil(total / safeLimit);
  const hasNextPage = safePage < totalPages;
  const hasPrevPage = safePage > 1;

  return {
    page: safePage,
    limit: safeLimit,
    totalItems: total,
    totalPages,
    hasNextPage,
    hasPrevPage,
  };
}

/**
 * Assembles the standardized paginated API response envelope.
 *
 * @param {Array} data - Array of page slice items
 * @param {Object} meta - Standard pagination metadata
 * @returns {Object} Standardized envelope
 */
function formatPaginatedEnvelope(data, meta) {
  return {
    status: 'success',
    data,
    meta,
  };
}

module.exports = {
  parsePaginationQuery,
  calculateOffset,
  buildPaginationMeta,
  formatPaginatedEnvelope,
};
