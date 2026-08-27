const availabilityService = require('./availability.service');

/**
 * Availability Controller
 * Handles HTTP requests and formatting for fleet overview, availability metrics, and status endpoints.
 */
class AvailabilityController {
  /**
   * GET /api/fleet/overview
   */
  async getOverview(req, res) {
    const overview = await availabilityService.getOverview();
    return res.status(200).json({
      status: 'success',
      data: overview,
    });
  }

  /**
   * GET /api/fleet/availability
   */
  async getAvailability(req, res) {
    const availability = await availabilityService.getAvailability();
    return res.status(200).json({
      status: 'success',
      data: availability,
    });
  }

  /**
   * GET /api/fleet/trucks/:id/status
   */
  async getTruckStatus(req, res) {
    try {
      const vehicleStatus = await availabilityService.getTruckStatus(req.params.id);
      return res.status(200).json({
        status: 'success',
        data: {
          truck: vehicleStatus,
        },
      });
    } catch (err) {
      const isNotFound = err.message === 'Vehicle not found';
      return res.status(isNotFound ? 404 : 400).json({
        status: 'fail',
        message: err.message,
      });
    }
  }

  /**
   * PATCH /api/fleet/trucks/:id/status
   */
  async updateTruckStatus(req, res) {
    const { status } = req.body || {};

    try {
      const vehicleStatus = await availabilityService.updateTruckStatus(req.params.id, status);
      return res.status(200).json({
        status: 'success',
        message: 'Vehicle availability status updated',
        data: {
          truck: vehicleStatus,
        },
      });
    } catch (err) {
      const isNotFound = err.message === 'Vehicle not found';
      return res.status(isNotFound ? 404 : 400).json({
        status: 'fail',
        message: err.message,
      });
    }
  }
}

module.exports = new AvailabilityController();
