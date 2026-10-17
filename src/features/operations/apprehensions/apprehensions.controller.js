const apprehensionsService = require('./apprehensions.service');
const { parsePaginationQuery, formatPaginatedEnvelope } = require('../../../utils/pagination');

/**
 * Apprehensions Controller
 * HTTP parameter parsing and response envelope formatting for roadside apprehensions.
 */
class ApprehensionsController {
  /**
   * POST /api/operations/apprehensions
   */
  async recordApprehension(req, res) {
    const data = await apprehensionsService.recordApprehension(req.user, req.body || {});
    return res.status(201).json({
      status: 'success',
      message: 'Road apprehension recorded successfully.',
      data,
    });
  }

  /**
   * GET /api/operations/apprehensions/:id
   */
  async getApprehensionById(req, res) {
    const data = await apprehensionsService.getApprehensionById(req.params.id, req.user);
    return res.status(200).json({
      status: 'success',
      data,
    });
  }

  /**
   * PATCH /api/operations/apprehensions/:id/status
   */
  async updateStatus(req, res) {
    const data = await apprehensionsService.updateStatus(req.params.id, req.user, req.body || {});
    return res.status(200).json({
      status: 'success',
      message: 'Apprehension status updated successfully.',
      data,
    });
  }

  /**
   * GET /api/operations/apprehensions
   */
  async getApprehensions(req, res) {
    const { vehicleId, driverId, tripId, agency, status, startDate, endDate, search } = req.query || {};

    const pagination = parsePaginationQuery(req.query, {
      defaultLimit: 20,
      maxLimit: 100,
      defaultSort: 'incidentTime',
      defaultOrder: 'DESC',
    });

    if (!pagination.isPaginated) {
      const apprehensions = await apprehensionsService.getApprehensions(
        req.user,
        { vehicleId, driverId, tripId, agency, status, startDate, endDate, search },
        null
      );
      return res.status(200).json({
        status: 'success',
        data: {
          count: apprehensions.length,
          apprehensions,
        },
      });
    }

    const { items, meta } = await apprehensionsService.getApprehensions(
      req.user,
      { vehicleId, driverId, tripId, agency, status, startDate, endDate, search },
      pagination
    );

    return res.status(200).json(formatPaginatedEnvelope(items, meta));
  }
}

module.exports = new ApprehensionsController();
