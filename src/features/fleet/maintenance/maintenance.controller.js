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

  // ============================================================
  // SAFETY INSPECTION HANDLERS
  // ============================================================

  /**
   * POST /api/fleet/maintenance/inspections
   * Records a vehicle safety inspection and automatically grounds the vehicle if failed.
   */
  async recordInspection(req, res) {
    try {
      const data = await maintenanceService.recordInspection(req.user, req.body || {});
      return res.status(201).json({
        status: 'success',
        message: 'Vehicle inspection recorded successfully.',
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
   * GET /api/fleet/maintenance/inspections/truck/:truckId
   * Retrieves paginated inspections for a specific truck.
   */
  async getTruckInspections(req, res) {
    try {
      const data = await maintenanceService.getTruckInspections(req.params.truckId, req.query);
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
   * GET /api/fleet/maintenance/inspections/:id
   * Retrieves single inspection record by UUID.
   */
  async getInspectionById(req, res) {
    try {
      const data = await maintenanceService.getInspectionById(req.params.id);
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

  // ============================================================
  // INCIDENT REPORTING HANDLERS
  // ============================================================

  /**
   * GET /api/fleet/maintenance/incidents/types
   * Retrieves list of available incident classification types.
   */
  async getIncidentTypes(req, res) {
    try {
      const data = await maintenanceService.getIncidentTypesList();
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

  /**
   * POST /api/fleet/maintenance/incidents
   * Records a mid-route incident/breakdown and automatically grounds truck if critical.
   */
  async reportIncident(req, res) {
    try {
      const data = await maintenanceService.reportIncident(req.user, req.body || {});
      return res.status(201).json({
        status: 'success',
        message: 'Incident reported successfully.',
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
   * GET /api/fleet/maintenance/incidents
   * Retrieves fleet-wide incident reports with filter support.
   */
  async getIncidents(req, res) {
    try {
      const data = await maintenanceService.getIncidents(req.query);
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

  /**
   * GET /api/fleet/maintenance/incidents/truck/:truckId
   * Retrieves paginated incident reports for a specific truck.
   */
  async getTruckIncidents(req, res) {
    try {
      const data = await maintenanceService.getTruckIncidents(req.params.truckId, req.query);
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
   * GET /api/fleet/maintenance/incidents/:id
   * Retrieves single incident report by UUID.
   */
  async getIncidentById(req, res) {
    try {
      const data = await maintenanceService.getIncidentById(req.params.id);
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
}

module.exports = new MaintenanceController();
