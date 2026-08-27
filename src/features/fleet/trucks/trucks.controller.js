const trucksService = require('./trucks.service');

/**
 * Trucks Controller
 * Handles HTTP requests, parameter extraction, and status response formatting for fleet trucks.
 */
class TrucksController {
  /**
   * GET /api/fleet/trucks
   */
  async getAllTrucks(req, res) {
    const { status, search, driverAssigned } = req.query || {};
    const trucks = await trucksService.getAllTrucks({ status, search, driverAssigned });

    return res.status(200).json({
      status: 'success',
      data: {
        count: trucks.length,
        trucks,
      },
    });
  }

  /**
   * GET /api/fleet/trucks/:id
   */
  async getTruckById(req, res) {
    try {
      const truck = await trucksService.getTruckById(req.params.id);
      return res.status(200).json({
        status: 'success',
        data: { truck },
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
   * POST /api/fleet/trucks
   */
  async createTruck(req, res) {
    const {
      plateNumber,
      model,
      yearModel,
      currentOdometer,
      lastPmOdometer,
      status,
      driverId,
    } = req.body || {};

    try {
      const truck = await trucksService.createTruck(req.user, {
        plateNumber,
        model,
        yearModel,
        currentOdometer,
        lastPmOdometer,
        status,
        driverId,
      });

      return res.status(201).json({
        status: 'success',
        data: { truck },
      });
    } catch (err) {
      const isConflict = err.message.includes('already exists') || err.message.includes('already assigned');
      return res.status(isConflict ? 409 : 400).json({
        status: 'fail',
        message: err.message,
      });
    }
  }

  /**
   * PATCH /api/fleet/trucks/:id
   */
  async updateTruck(req, res) {
    const {
      plateNumber,
      model,
      yearModel,
      currentOdometer,
      lastPmOdometer,
    } = req.body || {};

    try {
      const truck = await trucksService.updateTruck(req.params.id, {
        plateNumber,
        model,
        yearModel,
        currentOdometer,
        lastPmOdometer,
      });

      return res.status(200).json({
        status: 'success',
        data: { truck },
      });
    } catch (err) {
      if (err.message === 'Vehicle not found') {
        return res.status(404).json({
          status: 'fail',
          message: err.message,
        });
      }
      const isConflict = err.message.includes('already exists');
      return res.status(isConflict ? 409 : 400).json({
        status: 'fail',
        message: err.message,
      });
    }
  }

  /**
   * PATCH /api/fleet/trucks/:id/deactivate
   */
  async deactivateTruck(req, res) {
    try {
      const truck = await trucksService.deactivateTruck(req.params.id);
      return res.status(200).json({
        status: 'success',
        message: 'Vehicle successfully deactivated',
        data: { truck },
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
   * PATCH /api/fleet/trucks/:id/assign
   */
  async assignDriver(req, res) {
    const { driverId } = req.body || {};

    try {
      const truck = await trucksService.assignDriver(req.params.id, driverId);
      return res.status(200).json({
        status: 'success',
        message: driverId ? 'Driver successfully assigned' : 'Driver successfully unassigned',
        data: { truck },
      });
    } catch (err) {
      if (err.message === 'Vehicle not found' || err.message === 'Driver user not found') {
        return res.status(404).json({
          status: 'fail',
          message: err.message,
        });
      }
      const isConflict = err.message.includes('already assigned');
      return res.status(isConflict ? 409 : 400).json({
        status: 'fail',
        message: err.message,
      });
    }
  }

  /**
   * POST /api/fleet/trucks/:id/mileage and PATCH /api/fleet/trucks/:id/mileage
   */
  async recordMileage(req, res) {
    const { odometer, mileage, currentOdometer } = req.body || {};

    try {
      const result = await trucksService.recordMileage(req.user, req.params.id, {
        odometer,
        mileage,
        currentOdometer,
      });

      return res.status(200).json({
        status: 'success',
        message: 'Vehicle mileage recorded successfully',
        data: result,
      });
    } catch (err) {
      if (err.message === 'Vehicle not found') {
        return res.status(404).json({
          status: 'fail',
          message: err.message,
        });
      }
      return res.status(400).json({
        status: 'fail',
        message: err.message,
      });
    }
  }

  /**
   * GET /api/fleet/register-options
   */
  async getRegisterOptions(req, res) {
    const options = await trucksService.getRegisterOptions();
    return res.status(200).json({
      status: 'success',
      data: options,
    });
  }
}

module.exports = new TrucksController();
