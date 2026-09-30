const vehiclesService = require('./vehicles.service');
const { parsePaginationQuery, formatPaginatedEnvelope } = require('../../../utils/pagination');

const ALLOWED_VEHICLE_SORT_FIELDS = {
  createdAt: 'v.created_at',
  created_at: 'v.created_at',
  plateNumber: 'v.plate_number',
  plate_number: 'v.plate_number',
  model: 'v.model',
  yearModel: 'v.year_model',
  year_model: 'v.year_model',
  vehicleType: 'v.vehicle_type',
  vehicle_type: 'v.vehicle_type',
  currentOdometer: 'v.current_odometer',
  current_odometer: 'v.current_odometer',
  status: 'v.status',
};

const ALLOWED_DRIVER_SORT_FIELDS = {
  createdAt: 'u.created_at',
  created_at: 'u.created_at',
  firstName: 'u.first_name',
  first_name: 'u.first_name',
  lastName: 'u.last_name',
  last_name: 'u.last_name',
  username: 'u.username',
  phone: 'u.phone',
};

/**
 * Vehicles Controller
 * Handles HTTP requests, parameter extraction, and status response formatting for fleet vehicles.
 */
class VehiclesController {
  /**
   * GET /api/fleet/vehicles
   * Retrieves all vehicles (legacy) or paginated slice with metadata.
   */
  async getAllVehicles(req, res) {
    const { status, search, driverAssigned, vehicleType, type } = req.query || {};
    const pagination = parsePaginationQuery(req.query, {
      defaultLimit: 20,
      maxLimit: 100,
      defaultSort: 'createdAt',
      defaultOrder: 'DESC',
      allowedSortFields: ALLOWED_VEHICLE_SORT_FIELDS,
    });

    if (!pagination.isPaginated) {
      const vehicles = await vehiclesService.getAllVehicles({
        status,
        search,
        driverAssigned,
        vehicleType: vehicleType || type,
      });
      return res.status(200).json({
        status: 'success',
        data: {
          count: vehicles.length,
          vehicles,
          trucks: vehicles,
        },
      });
    }

    const { items, meta } = await vehiclesService.getAllVehicles(
      { status, search, driverAssigned, vehicleType: vehicleType || type },
      pagination
    );

    return res.status(200).json(formatPaginatedEnvelope(items, meta));
  }

  /**
   * GET /api/fleet/vehicles/:id
   */
  async getVehicleById(req, res) {
    try {
      const vehicle = await vehiclesService.getVehicleById(req.params.id);
      return res.status(200).json({
        status: 'success',
        data: {
          vehicle,
          truck: vehicle,
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
   * POST /api/fleet/vehicles
   */
  async createVehicle(req, res) {
    const {
      plateNumber,
      model,
      yearModel,
      vehicleType,
      currentOdometer,
      lastPmOdometer,
      status,
      driverId,
    } = req.body || {};

    try {
      const vehicle = await vehiclesService.createVehicle(req.user, {
        plateNumber,
        model,
        yearModel,
        vehicleType,
        currentOdometer,
        lastPmOdometer,
        status,
        driverId,
      });

      return res.status(201).json({
        status: 'success',
        message: 'Vehicle registered successfully',
        data: {
          vehicle,
          truck: vehicle,
        },
      });
    } catch (err) {
      const isConflict = err.message && err.message.includes('already exists');
      return res.status(isConflict ? 409 : 400).json({
        status: 'fail',
        message: err.message,
      });
    }
  }

  /**
   * PUT /api/fleet/vehicles/:id
   */
  async updateVehicle(req, res) {
    const { id } = req.params;
    const {
      plateNumber,
      model,
      yearModel,
      vehicleType,
      currentOdometer,
      lastPmOdometer,
    } = req.body || {};

    try {
      const vehicle = await vehiclesService.updateVehicle(req.user, id, {
        plateNumber,
        model,
        yearModel,
        vehicleType,
        currentOdometer,
        lastPmOdometer,
      });

      return res.status(200).json({
        status: 'success',
        message: 'Vehicle details updated successfully',
        data: {
          vehicle,
          truck: vehicle,
        },
      });
    } catch (err) {
      const isNotFound = err.message === 'Vehicle not found';
      const isConflict = err.message && err.message.includes('already exists');
      return res.status(isNotFound ? 404 : isConflict ? 409 : 400).json({
        status: 'fail',
        message: err.message,
      });
    }
  }

  /**
   * PATCH /api/fleet/vehicles/:id/status
   */
  async updateVehicleStatus(req, res) {
    const { id } = req.params;
    const { status } = req.body || {};

    try {
      const vehicle = await vehiclesService.updateVehicleStatus(req.user, id, status);
      return res.status(200).json({
        status: 'success',
        message: 'Vehicle status updated successfully',
        data: {
          vehicle,
          truck: vehicle,
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
   * PATCH /api/fleet/vehicles/:id/deactivate
   */
  async deactivateVehicle(req, res) {
    const { id } = req.params;

    try {
      const vehicle = await vehiclesService.deactivateVehicle(req.user, id);
      return res.status(200).json({
        status: 'success',
        message: 'Vehicle deactivated and driver unassigned successfully',
        data: {
          vehicle,
          truck: vehicle,
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
   * PATCH /api/fleet/vehicles/:id/assign
   */
  async assignDriver(req, res) {
    const { id } = req.params;
    const { driverId } = req.body || {};

    try {
      const vehicle = await vehiclesService.assignDriver(req.user, id, driverId);
      return res.status(200).json({
        status: 'success',
        message: 'Driver assigned to vehicle successfully',
        data: {
          vehicle,
          truck: vehicle,
        },
      });
    } catch (err) {
      const isNotFound = err.message === 'Vehicle not found' || err.message === 'Driver not found';
      const isConflict = err.message && err.message.includes('already assigned');
      return res.status(isNotFound ? 404 : isConflict ? 409 : 400).json({
        status: 'fail',
        message: err.message,
      });
    }
  }

  /**
   * PATCH /api/fleet/vehicles/:id/unassign
   */
  async unassignDriver(req, res) {
    const { id } = req.params;

    try {
      const vehicle = await vehiclesService.unassignDriver(req.user, id);
      return res.status(200).json({
        status: 'success',
        message: 'Driver unassigned from vehicle successfully',
        data: {
          vehicle,
          truck: vehicle,
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
   * GET /api/fleet/drivers
   */
  async getAllDrivers(req, res) {
    const { availableOnly, search } = req.query || {};
    const pagination = parsePaginationQuery(req.query, {
      defaultLimit: 20,
      maxLimit: 100,
      defaultSort: 'firstName',
      defaultOrder: 'ASC',
      allowedSortFields: ALLOWED_DRIVER_SORT_FIELDS,
    });

    if (!pagination.isPaginated) {
      const drivers = await vehiclesService.getAllDrivers({ availableOnly, search });
      return res.status(200).json({
        status: 'success',
        data: {
          count: drivers.length,
          drivers,
        },
      });
    }

    const { items, meta } = await vehiclesService.getAllDrivers(
      { availableOnly, search },
      pagination
    );

    return res.status(200).json(formatPaginatedEnvelope(items, meta));
  }

  /**
   * GET /api/fleet/drivers/available & GET /api/fleet/available-drivers
   */
  async getAvailableDrivers(req, res) {
    const availableDrivers = await vehiclesService.getAvailableDrivers();
    return res.status(200).json({
      status: 'success',
      data: {
        count: availableDrivers.length,
        drivers: availableDrivers,
        availableDrivers,
      },
    });
  }

  /**
   * POST /api/fleet/vehicles/:id/mileage and PATCH /api/fleet/vehicles/:id/mileage
   */
  async recordMileage(req, res) {
    const { odometer, mileage, currentOdometer } = req.body || {};

    try {
      const result = await vehiclesService.recordMileage(req.user, req.params.id, {
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
    const options = await vehiclesService.getRegisterOptions();
    return res.status(200).json({
      status: 'success',
      data: options,
    });
  }
}

module.exports = new VehiclesController();
