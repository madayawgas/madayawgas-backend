const { z } = require('zod');
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

// Zod Validation Schemas
const UUIDParamSchema = z.string().uuid({ message: 'Schedule ID must be a valid UUID' });

const CreateScheduleSchema = z.object({
  scheduledDate: z
    .string({ required_error: 'Scheduled date is required' })
    .regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'Scheduled date must follow YYYY-MM-DD format' }),
  truckId: z
    .string({ required_error: 'Vehicle ID is required' })
    .trim()
    .uuid({ message: 'Vehicle ID must be a valid UUID' }),
  salesUserId: z
    .string({ required_error: 'Sales user ID is required' })
    .trim()
    .uuid({ message: 'Sales User ID must be a valid UUID' }),
  zoneId: z
    .string({ required_error: 'Zone ID is required' })
    .trim()
    .uuid({ message: 'Zone ID must be a valid UUID' }),
  notes: z.string().trim().optional().nullable(),
});

const UpdateScheduleSchema = z.object({
  scheduledDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'Scheduled date must follow YYYY-MM-DD format' })
    .optional(),
  truckId: z.string().trim().uuid({ message: 'Vehicle ID must be a valid UUID' }).optional(),
  salesUserId: z.string().trim().uuid({ message: 'Sales User ID must be a valid UUID' }).optional(),
  zoneId: z.string().trim().uuid({ message: 'Zone ID must be a valid UUID' }).optional(),
  notes: z.string().trim().optional().nullable(),
});

const GenerateSchedulesSchema = z.object({
  startDate: z
    .string({ required_error: 'Start date is required' })
    .regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'Start date must follow YYYY-MM-DD format' }),
  endDate: z
    .string({ required_error: 'End date is required' })
    .regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'End date must follow YYYY-MM-DD format' }),
  overwriteExisting: z.boolean().optional().default(false),
});

const CancelScheduleSchema = z.object({
  reason: z.string().trim().optional().nullable(),
});

/**
 * Truck Schedules Controller
 * Handles HTTP requests and envelope formatting for operational truck schedules.
 */
class SchedulesController {
  /**
   * GET /api/schedules/sales-persons
   * Retrieve active, unblocked users holding the Sales Person role.
   * Accessible to route managers without requiring administrative users.view.
   */
  async getActiveSalesPersons(req, res) {
    try {
      const salesPersons = await schedulesService.getActiveSalesPersons(req.query || {});
      return res.status(200).json({
        status: 'success',
        data: {
          count: salesPersons.length,
          salesPersons,
        },
      });
    } catch (err) {
      return res.status(err.statusCode || 400).json({
        status: 'fail',
        message: err.message,
      });
    }
  }

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
      const parsedId = UUIDParamSchema.safeParse(req.params.id);
      if (!parsedId.success) {
        return res.status(400).json({
          status: 'fail',
          message: parsedId.error.issues[0]?.message || 'Invalid Schedule ID',
        });
      }

      const schedule = await schedulesService.getScheduleById(parsedId.data, req.user);
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
      const parsed = CreateScheduleSchema.safeParse(req.body || {});
      if (!parsed.success) {
        return res.status(400).json({
          status: 'fail',
          message: parsed.error.issues[0]?.message || 'Invalid schedule data',
        });
      }

      const schedule = await schedulesService.createSchedule(req.user, parsed.data);
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
      const parsed = GenerateSchedulesSchema.safeParse(req.body || {});
      if (!parsed.success) {
        return res.status(400).json({
          status: 'fail',
          message: parsed.error.issues[0]?.message || 'Invalid generate payload',
        });
      }

      const result = await schedulesService.generateWeeklySchedules(req.user, parsed.data);
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
      const parsedId = UUIDParamSchema.safeParse(req.params.id);
      if (!parsedId.success) {
        return res.status(400).json({
          status: 'fail',
          message: parsedId.error.issues[0]?.message || 'Invalid Schedule ID',
        });
      }

      const parsed = UpdateScheduleSchema.safeParse(req.body || {});
      if (!parsed.success) {
        return res.status(400).json({
          status: 'fail',
          message: parsed.error.issues[0]?.message || 'Invalid update data',
        });
      }

      const schedule = await schedulesService.updateSchedule(
        parsedId.data,
        req.user,
        parsed.data
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
      const parsedId = UUIDParamSchema.safeParse(req.params.id);
      if (!parsedId.success) {
        return res.status(400).json({
          status: 'fail',
          message: parsedId.error.issues[0]?.message || 'Invalid Schedule ID',
        });
      }

      const parsed = CancelScheduleSchema.safeParse(req.body || {});
      if (!parsed.success) {
        return res.status(400).json({
          status: 'fail',
          message: parsed.error.issues[0]?.message || 'Invalid cancel data',
        });
      }

      const schedule = await schedulesService.cancelSchedule(
        parsedId.data,
        req.user,
        parsed.data
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
