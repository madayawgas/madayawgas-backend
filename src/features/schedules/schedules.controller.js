const schedulesService = require('./schedules.service');
const { parsePaginationQuery, formatPaginatedEnvelope } = require('../../utils/pagination');

const ALLOWED_SCHEDULE_SORT_FIELDS = {
  scheduledDate: 'ts.scheduled_date',
  scheduled_date: 'ts.scheduled_date',
  date: 'ts.scheduled_date',
  createdAt: 'ts.created_at',
  created_at: 'ts.created_at',
  status: 'ts.status',
};

/**
 * Truck Schedules Controller
 * Handles HTTP requests and envelope formatting for operational truck schedules.
 */
class SchedulesController {
  /**
   * GET /api/schedules
   * List operational schedules with filtering and pagination.
   */
  async getAllSchedules(req, res) {
    const { startDate, endDate, date, truckId, salesUserId, zoneId, status, search } = req.query || {};
    const pagination = parsePaginationQuery(req.query, {
      defaultLimit: 20,
      maxLimit: 100,
      defaultSort: 'scheduledDate',
      defaultOrder: 'DESC',
      allowedSortFields: ALLOWED_SCHEDULE_SORT_FIELDS,
    });

    if (!pagination.isPaginated) {
      const schedules = await schedulesService.getAllSchedules(req.user, {
        startDate,
        endDate,
        date,
        truckId,
        salesUserId,
        zoneId,
        status,
        search,
      });

      return res.status(200).json({
        status: 'success',
        data: {
          count: schedules.length,
          schedules,
        },
      });
    }

    const { items, meta } = await schedulesService.getAllSchedules(
      req.user,
      { startDate, endDate, date, truckId, salesUserId, zoneId, status, search },
      pagination
    );

    return res.status(200).json(formatPaginatedEnvelope(items, meta));
  }

  /**
   * GET /api/schedules/:id
   * Retrieve single operational schedule.
   */
  async getScheduleById(req, res) {
    try {
      const schedule = await schedulesService.getScheduleById(req.params.id, req.user);
      return res.status(200).json({
        status: 'success',
        data: { schedule },
      });
    } catch (err) {
      return res.status(err.statusCode || 400).json({
        status: 'fail',
        message: err.message,
      });
    }
  }

  /**
   * POST /api/schedules
   * Create an ad-hoc operational truck schedule.
   */
  async createSchedule(req, res) {
    try {
      const schedule = await schedulesService.createSchedule(req.user, req.body || {});
      return res.status(201).json({
        status: 'success',
        data: { schedule },
      });
    } catch (err) {
      return res.status(err.statusCode || 400).json({
        status: 'fail',
        message: err.message,
      });
    }
  }

  /**
   * POST /api/schedules/generate
   * Batch generate schedules from recurring templates across a date range.
   */
  async generateWeeklySchedules(req, res) {
    try {
      const result = await schedulesService.generateWeeklySchedules(req.user, req.body || {});
      return res.status(201).json({
        status: 'success',
        data: result,
      });
    } catch (err) {
      return res.status(err.statusCode || 400).json({
        status: 'fail',
        message: err.message,
      });
    }
  }

  /**
   * PATCH /api/schedules/:id
   * Update operational schedule details.
   */
  async updateSchedule(req, res) {
    try {
      const schedule = await schedulesService.updateSchedule(
        req.params.id,
        req.user,
        req.body || {}
      );
      return res.status(200).json({
        status: 'success',
        data: { schedule },
      });
    } catch (err) {
      return res.status(err.statusCode || 400).json({
        status: 'fail',
        message: err.message,
      });
    }
  }

  /**
   * PATCH /api/schedules/:id/cancel
   * Cancel an operational schedule.
   */
  async cancelSchedule(req, res) {
    try {
      const schedule = await schedulesService.cancelSchedule(
        req.params.id,
        req.user,
        req.body || {}
      );
      return res.status(200).json({
        status: 'success',
        data: { schedule },
      });
    } catch (err) {
      return res.status(err.statusCode || 400).json({
        status: 'fail',
        message: err.message,
      });
    }
  }
}

module.exports = new SchedulesController();
