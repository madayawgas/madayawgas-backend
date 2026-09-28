const zonesService = require('./zones.service');

/**
 * Service Zones Controller
 * Handles HTTP requests and JSON response formatting for service zones.
 */
class ZonesController {
  /**
   * GET /api/schedules/zones
   * List all service zones.
   */
  async getAllZones(req, res) {
    const { isActive, search } = req.query || {};
    const zones = await zonesService.getAllZones({ isActive, search });

    return res.status(200).json({
      status: 'success',
      data: {
        count: zones.length,
        zones,
      },
    });
  }

  /**
   * GET /api/schedules/zones/:id
   * Retrieve single service zone by UUID.
   */
  async getZoneById(req, res) {
    try {
      const zone = await zonesService.getZoneById(req.params.id);
      return res.status(200).json({
        status: 'success',
        data: { zone },
      });
    } catch (err) {
      return res.status(err.statusCode || 400).json({
        status: 'fail',
        message: err.message,
      });
    }
  }

  /**
   * POST /api/schedules/zones
   * Register a new service zone.
   */
  async createZone(req, res) {
    try {
      const zone = await zonesService.createZone(req.user, req.body || {});
      return res.status(201).json({
        status: 'success',
        data: { zone },
      });
    } catch (err) {
      return res.status(err.statusCode || 400).json({
        status: 'fail',
        message: err.message,
      });
    }
  }

  /**
   * PATCH /api/schedules/zones/:id
   * Update service zone properties.
   */
  async updateZone(req, res) {
    try {
      const zone = await zonesService.updateZone(req.params.id, req.user, req.body || {});
      return res.status(200).json({
        status: 'success',
        data: { zone },
      });
    } catch (err) {
      return res.status(err.statusCode || 400).json({
        status: 'fail',
        message: err.message,
      });
    }
  }
}

module.exports = new ZonesController();
