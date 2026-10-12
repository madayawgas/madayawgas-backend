const { z } = require('zod');
const templatesService = require('./templates.service');

// Zod Validation Schemas
const UUIDParamSchema = z.string().uuid({ message: 'Template ID must be a valid UUID' });

const CreateTemplateSchema = z.object({
  truckId: z
    .string({ required_error: 'Vehicle ID is required' })
    .trim()
    .uuid({ message: 'Vehicle ID must be a valid UUID' }),
  zoneId: z
    .string({ required_error: 'Zone ID is required' })
    .trim()
    .uuid({ message: 'Zone ID must be a valid UUID' }),
  dayOfWeek: z.coerce
    .number({ required_error: 'Day of week is required' })
    .int()
    .min(1, { message: 'Day of week must be an integer between 1 (Monday) and 7 (Sunday)' })
    .max(7, { message: 'Day of week must be an integer between 1 (Monday) and 7 (Sunday)' }),
  defaultSalesUserId: z.preprocess(
    (val) => (typeof val === 'string' && val.trim() === '' ? null : val),
    z.string().trim().uuid({ message: 'Sales User ID must be a valid UUID' }).nullable().optional()
  ),
  isActive: z.boolean().optional().default(true),
});

const UpdateTemplateSchema = z.object({
  truckId: z.string().trim().uuid({ message: 'Vehicle ID must be a valid UUID' }).optional(),
  zoneId: z.string().trim().uuid({ message: 'Zone ID must be a valid UUID' }).optional(),
  dayOfWeek: z.coerce
    .number()
    .int()
    .min(1, { message: 'Day of week must be between 1 and 7' })
    .max(7, { message: 'Day of week must be between 1 and 7' })
    .optional(),
  defaultSalesUserId: z.preprocess(
    (val) => (typeof val === 'string' && val.trim() === '' ? null : val),
    z.string().trim().uuid({ message: 'Sales User ID must be a valid UUID' }).nullable().optional()
  ),
  isActive: z.boolean().optional(),
});

/**
 * Schedule Templates Controller
 * Handles HTTP requests and JSON response formatting for schedule templates.
 */
class TemplatesController {
  /**
   * GET /api/schedules/templates
   * List all weekly schedule templates.
   */
  async getAllTemplates(req, res) {
    const { truckId, dayOfWeek, zoneId, isActive } = req.query || {};
    const templates = await templatesService.getAllTemplates({
      truckId,
      dayOfWeek,
      zoneId,
      isActive,
    });

    return res.status(200).json({
      status: 'success',
      data: {
        count: templates.length,
        templates,
      },
    });
  }

  /**
   * GET /api/schedules/templates/:id
   * Retrieve single schedule template by UUID.
   */
  async getTemplateById(req, res) {
    try {
      const parsedId = UUIDParamSchema.safeParse(req.params.id);
      if (!parsedId.success) {
        return res.status(400).json({
          status: 'fail',
          message: parsedId.error.issues[0]?.message || 'Invalid Template ID',
        });
      }

      const template = await templatesService.getTemplateById(parsedId.data);
      return res.status(200).json({
        status: 'success',
        data: { template },
      });
    } catch (err) {
      return res.status(err.statusCode || 400).json({
        status: 'fail',
        message: err.message,
      });
    }
  }

  /**
   * POST /api/schedules/templates
   * Create a new weekly route template.
   */
  async createTemplate(req, res) {
    try {
      const parsed = CreateTemplateSchema.safeParse(req.body || {});
      if (!parsed.success) {
        return res.status(400).json({
          status: 'fail',
          message: parsed.error.issues[0]?.message || 'Invalid template data',
        });
      }

      const template = await templatesService.createTemplate(req.user, parsed.data);
      return res.status(201).json({
        status: 'success',
        data: { template },
      });
    } catch (err) {
      return res.status(err.statusCode || 400).json({
        status: 'fail',
        message: err.message,
      });
    }
  }

  /**
   * PATCH /api/schedules/templates/:id
   * Update a schedule template.
   */
  async updateTemplate(req, res) {
    try {
      const parsedId = UUIDParamSchema.safeParse(req.params.id);
      if (!parsedId.success) {
        return res.status(400).json({
          status: 'fail',
          message: parsedId.error.issues[0]?.message || 'Invalid Template ID',
        });
      }

      const parsed = UpdateTemplateSchema.safeParse(req.body || {});
      if (!parsed.success) {
        return res.status(400).json({
          status: 'fail',
          message: parsed.error.issues[0]?.message || 'Invalid template data',
        });
      }

      const template = await templatesService.updateTemplate(
        parsedId.data,
        req.user,
        parsed.data
      );
      return res.status(200).json({
        status: 'success',
        data: { template },
      });
    } catch (err) {
      return res.status(err.statusCode || 400).json({
        status: 'fail',
        message: err.message,
      });
    }
  }

  /**
   * DELETE /api/schedules/templates/:id
   * Delete a schedule template.
   */
  async deleteTemplate(req, res) {
    try {
      const parsedId = UUIDParamSchema.safeParse(req.params.id);
      if (!parsedId.success) {
        return res.status(400).json({
          status: 'fail',
          message: parsedId.error.issues[0]?.message || 'Invalid Template ID',
        });
      }

      await templatesService.deleteTemplate(parsedId.data);
      return res.status(200).json({
        status: 'success',
        message: 'Schedule template deleted successfully',
      });
    } catch (err) {
      return res.status(err.statusCode || 400).json({
        status: 'fail',
        message: err.message,
      });
    }
  }
}

module.exports = new TemplatesController();
