const templatesService = require('./templates.service');

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
      const template = await templatesService.getTemplateById(req.params.id);
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
      const template = await templatesService.createTemplate(req.user, req.body || {});
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
      const template = await templatesService.updateTemplate(
        req.params.id,
        req.user,
        req.body || {}
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
      await templatesService.deleteTemplate(req.params.id);
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
