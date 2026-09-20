const historyService = require('./history.service');
const { parsePaginationQuery, formatPaginatedEnvelope } = require('../../utils/pagination');

const ALLOWED_HISTORY_SORT_FIELDS = {
  createdAt: 'created_at',
  created_at: 'created_at',
  userName: 'user_name',
  user_name: 'user_name',
  userRole: 'user_role',
  user_role: 'user_role',
  actionType: 'action_type',
  action_type: 'action_type',
  module: 'module',
  action: 'action',
};

/**
 * History Controller
 * Handles HTTP requests and responses for system event history logs.
 */
class HistoryController {
  /**
   * Retrieves paginated and filtered history logs.
   * GET /api/history
   */
  async getHistoryLogs(req, res, next) {
    try {
      const {
        module,
        actionType,
        search,
        limit,
        offset,
        startDate,
        endDate,
        page,
        pageSize,
        paginate,
      } = req.query;

      const hasStandardPagination =
        page !== undefined || pageSize !== undefined || paginate === 'true';

      if (hasStandardPagination) {
        const pagination = parsePaginationQuery(req.query, {
          defaultLimit: 20,
          maxLimit: 100,
          defaultSort: 'createdAt',
          defaultOrder: 'DESC',
          allowedSortFields: ALLOWED_HISTORY_SORT_FIELDS,
        });

        const { items, meta } = await historyService.getHistoryLogs(
          {
            module: module ? String(module) : undefined,
            actionType: actionType ? String(actionType) : undefined,
            search: search ? String(search) : undefined,
            startDate: startDate ? String(startDate) : undefined,
            endDate: endDate ? String(endDate) : undefined,
          },
          pagination
        );

        return res.status(200).json(formatPaginatedEnvelope(items, meta));
      }

      const result = await historyService.getHistoryLogs({
        module: module ? String(module) : undefined,
        actionType: actionType ? String(actionType) : undefined,
        search: search ? String(search) : undefined,
        limit: limit !== undefined ? Number(limit) : 100,
        offset: offset !== undefined ? Number(offset) : 0,
        startDate: startDate ? String(startDate) : undefined,
        endDate: endDate ? String(endDate) : undefined,
      });

      return res.status(200).json({
        status: 'success',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Retrieves a single history log by UUID.
   * GET /api/history/:id
   */
  async getHistoryLogById(req, res, next) {
    try {
      const { id } = req.params;
      const log = await historyService.getHistoryLogById(id);

      return res.status(200).json({
        status: 'success',
        data: {
          log,
        },
      });
    } catch (error) {
      if (error.message === 'History log not found') {
        return res.status(404).json({
          status: 'fail',
          message: 'History log not found',
        });
      }
      next(error);
    }
  }
}

module.exports = new HistoryController();
