const alertsService = require('./alerts.service');
const { parsePaginationQuery, formatPaginatedEnvelope } = require('../../../utils/pagination');

/**
 * Driver Emergency Alerts Controller
 * Handles HTTP requests, parameter extraction, and JSON response envelopes.
 */
class AlertsController {
  /**
   * POST /api/operations/alerts
   * Triggers emergency SOS alert.
   */
  async triggerAlert(req, res) {
    const data = await alertsService.triggerAlert(req.user, req.body || {});
    const statusCode = data.isDuplicate ? 200 : 201;
    return res.status(statusCode).json({
      status: 'success',
      message: data.isDuplicate
        ? data.message
        : 'Emergency alert dispatched successfully. Operations team has been notified.',
      data,
    });
  }

  /**
   * GET /api/operations/alerts/active
   * Retrieves all currently active and ongoing alerts.
   */
  async getActiveAlerts(req, res) {
    const alerts = await alertsService.getActiveAlerts();
    return res.status(200).json({
      status: 'success',
      data: {
        count: alerts.length,
        alerts,
      },
    });
  }

  /**
   * GET /api/operations/alerts/poll
   * Delta polling endpoint for dashboard subscribers (?since=<ISO_TIMESTAMP>).
   */
  async getPollAlerts(req, res) {
    const alerts = await alertsService.getPollAlerts(req.query?.since);
    return res.status(200).json({
      status: 'success',
      data: {
        count: alerts.length,
        alerts,
        polledAt: new Date().toISOString(),
      },
    });
  }

  /**
   * GET /api/operations/alerts/:id
   * Retrieves single emergency alert detail.
   */
  async getAlertById(req, res) {
    const data = await alertsService.getAlertById(req.params.id, req.user);
    return res.status(200).json({
      status: 'success',
      data,
    });
  }

  /**
   * PATCH /api/operations/alerts/:id/acknowledge
   * Marks an emergency alert as acknowledged by a supervisor/admin.
   */
  async acknowledgeAlert(req, res) {
    const data = await alertsService.acknowledgeAlert(req.params.id, req.user);
    return res.status(200).json({
      status: 'success',
      message: 'Emergency alert acknowledged.',
      data,
    });
  }

  /**
   * PATCH /api/operations/alerts/:id/resolve
   * Resolves an emergency alert with resolution notes and status.
   */
  async resolveAlert(req, res) {
    const data = await alertsService.resolveAlert(req.params.id, req.user, req.body || {});
    return res.status(200).json({
      status: 'success',
      message: 'Emergency alert resolved successfully.',
      data,
    });
  }

  /**
   * GET /api/operations/alerts
   * Retrieves paginated emergency alert logs with filtering.
   */
  async getAlerts(req, res) {
    const { status, driverId, vehicleId, emergencyType, startDate, endDate } = req.query || {};

    const pagination = parsePaginationQuery(req.query, {
      defaultLimit: 20,
      maxLimit: 100,
      defaultSort: 'createdAt',
      defaultOrder: 'DESC',
    });

    if (!pagination.isPaginated) {
      const alerts = await alertsService.getAlerts(
        req.user,
        { status, driverId, vehicleId, emergencyType, startDate, endDate },
        null
      );
      return res.status(200).json({
        status: 'success',
        data: {
          count: alerts.length,
          alerts,
        },
      });
    }

    const { items, meta } = await alertsService.getAlerts(
      req.user,
      { status, driverId, vehicleId, emergencyType, startDate, endDate },
      pagination
    );

    return res.status(200).json(formatPaginatedEnvelope(items, meta));
  }
}

module.exports = new AlertsController();
