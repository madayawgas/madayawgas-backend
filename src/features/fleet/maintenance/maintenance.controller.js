const maintenanceService = require('./maintenance.service');

/**
 * Maintenance Controller
 * HTTP parameter parsing, payload extraction, and status response formatting
 * for vehicle odometer logging and preventive maintenance status.
 */
class MaintenanceController {
  /**
   * POST /api/fleet/maintenance/odometer
   * Records single-point post-dispatch return odometer reading for a vehicle.
   */
  async logOdometer(req, res) {
    const { truckId, odometerReading, source, notes } = req.body || {};

    try {
      const data = await maintenanceService.logOdometerReading(req.user, {
        truckId,
        odometerReading,
        source,
        notes,
      });

      return res.status(201).json({
        status: 'success',
        message: 'Odometer reading recorded successfully.',
        data,
      });
    } catch (err) {
      const statusCode = err.statusCode || (err.message.includes('not found') ? 404 : 400);
      return res.status(statusCode).json({
        status: 'fail',
        message: err.message,
      });
    }
  }

  /**
   * GET /api/fleet/maintenance/odometer/truck/:truckId
   * Retrieves paginated odometer history logs for a specific vehicle.
   */
  async getTruckOdometerHistory(req, res) {
    try {
      const data = await maintenanceService.getTruckOdometerHistory(
        req.params.truckId,
        req.query
      );

      return res.status(200).json({
        status: 'success',
        data,
      });
    } catch (err) {
      const statusCode = err.statusCode || (err.message.includes('not found') ? 404 : 400);
      return res.status(statusCode).json({
        status: 'fail',
        message: err.message,
      });
    }
  }

  /**
   * GET /api/fleet/maintenance/pm-overview
   * Retrieves summary of all trucks with PM due indicators and distance deltas.
   */
  async getPmOverview(req, res) {
    try {
      const data = await maintenanceService.getFleetPmOverview(req.query);

      return res.status(200).json({
        status: 'success',
        data,
      });
    } catch (err) {
      const statusCode = err.statusCode || 400;
      return res.status(statusCode).json({
        status: 'fail',
        message: err.message,
      });
    }
  }
}

module.exports = new MaintenanceController();
