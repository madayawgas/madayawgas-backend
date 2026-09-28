const vehiclesRepository = require('./vehicles.repository');
const { historyService, EVENTS } = require('../../history');
const { calculateOffset, buildPaginationMeta } = require('../../../utils/pagination');

const VALID_VEHICLE_TYPES = ['DELIVERY_TRUCK', 'SERVICE_PICKUP', 'MOTORCYCLE', 'UTILITY_VAN'];
const VALID_STATUSES = ['ACTIVE', 'INACTIVE', 'UNDER_MAINTENANCE', 'RETIRED'];

/**
 * Maps database row to camelCase DTO with soft-bounded driver details and availability.
 */
function formatVehicle(row) {
  if (!row) return null;

  const vehicle = {
    id: row.id,
    plateNumber: row.plate_number,
    model: row.model,
    yearModel: Number(row.year_model),
    vehicleType: row.vehicle_type || 'DELIVERY_TRUCK',
    currentOdometer: Number(row.current_odometer),
    lastPmOdometer: Number(row.last_pm_odometer),
    isPmDue: row.pm_due_flag !== undefined ? Boolean(row.pm_due_flag) : (Number(row.current_odometer) - Number(row.last_pm_odometer) >= 5000),
    pmDueFlag: row.pm_due_flag !== undefined ? Boolean(row.pm_due_flag) : (Number(row.current_odometer) - Number(row.last_pm_odometer) >= 5000),
    status: row.status,
    operationalStatus: row.status,
    isAvailable: row.status === 'ACTIVE',
    driverId: row.driver_id || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };

  if (row.driver_id && row.driver_first_name !== undefined) {
    vehicle.driver = {
      id: row.driver_id,
      firstName: row.driver_first_name,
      lastName: row.driver_last_name,
      phone: row.driver_phone,
      username: row.driver_username,
    };
  } else if (row.driver_id) {
    vehicle.driver = { id: row.driver_id };
  } else {
    vehicle.driver = null;
  }

  return vehicle;
}

/**
 * Maps database driver row to camelCase DTO with live assignment status.
 */
function formatDriver(row) {
  if (!row) return null;

  const isAssigned = row.assigned_vehicle_id !== null && row.assigned_vehicle_id !== undefined;

  return {
    id: row.id,
    username: row.username,
    firstName: row.first_name,
    lastName: row.last_name,
    phone: row.phone,
    role: row.role_name,
    isAssigned,
    status: isAssigned ? 'ASSIGNED' : 'AVAILABLE',
    assignedVehicle: isAssigned
      ? {
          id: row.assigned_vehicle_id,
          plateNumber: row.assigned_vehicle_plate,
          model: row.assigned_vehicle_model,
          vehicleType: row.assigned_vehicle_type,
        }
      : null,
    assignedTruck: isAssigned
      ? {
          id: row.assigned_vehicle_id,
          plateNumber: row.assigned_vehicle_plate,
          model: row.assigned_vehicle_model,
          vehicleType: row.assigned_vehicle_type,
        }
      : null,
  };
}

/**
 * Vehicles Service
 * Handles business rules and domain logic for fleet vehicle management.
 */
class VehiclesService {
  /**
   * Retrieves all fleet vehicles with optional filtering and pagination.
   *
   * @param {Object} [filters={}] - Optional filters { status, search, driverAssigned, vehicleType }
   * @param {Object} [pagination=null] - Optional pagination { page, limit, sortColumn, sortOrder }
   * @returns {Promise<Array|Object>}
   */
  async getAllVehicles(filters = {}, pagination = null) {
    if (!pagination) {
      const rows = await vehiclesRepository.getAllVehicles(filters);
      return rows.map(formatVehicle);
    }

    const offset = calculateOffset(pagination.page, pagination.limit);
    const { rows, total } = await vehiclesRepository.getAllVehicles(filters, {
      ...pagination,
      offset,
    });

    const items = rows.map(formatVehicle);
    const meta = buildPaginationMeta(total, pagination.page, pagination.limit);

    return {
      items,
      meta,
    };
  }

  /**
   * Retrieves a single vehicle by ID.
   * @param {string} id - Vehicle UUID
   */
  async getVehicleById(id) {
    if (!id || typeof id !== 'string') {
      throw new Error('Vehicle ID is required');
    }

    const row = await vehiclesRepository.getVehicleById(id.trim());
    if (!row) {
      throw new Error('Vehicle not found');
    }

    return formatVehicle(row);
  }

  /**
   * Registers a new fleet vehicle with validations.
   * @param {Object} actorUser - Authenticated user issuing request
   * @param {Object} vehicleData - { plateNumber, model, yearModel, vehicleType, currentOdometer, lastPmOdometer, status, driverId }
   */
  async createVehicle(actorUser, vehicleData) {
    const {
      plateNumber,
      model,
      yearModel,
      vehicleType = 'DELIVERY_TRUCK',
      currentOdometer = 0,
      lastPmOdometer = 0,
      status = 'ACTIVE',
      driverId = null,
    } = vehicleData;

    // 1. Validate Plate Number
    if (!plateNumber || typeof plateNumber !== 'string' || plateNumber.trim() === '') {
      throw new Error('Plate number is required');
    }
    const cleanPlate = plateNumber.trim().toUpperCase();

    const existingByPlate = await vehiclesRepository.findVehicleByPlateNumber(cleanPlate);
    if (existingByPlate) {
      throw new Error(`Vehicle with plate number '${cleanPlate}' already exists`);
    }

    // 2. Validate Model
    if (!model || typeof model !== 'string' || model.trim() === '') {
      throw new Error('Vehicle model is required');
    }
    const cleanModel = model.trim();

    // 3. Validate Year Model
    const numYear = Number(yearModel);
    const currentYear = new Date().getFullYear();
    if (!yearModel || isNaN(numYear) || numYear < 1900 || numYear > currentYear + 1) {
      throw new Error(`Year model must be a valid year between 1900 and ${currentYear + 1}`);
    }

    // 4. Validate Vehicle Type
    const cleanVehicleType = vehicleType ? vehicleType.trim().toUpperCase() : 'DELIVERY_TRUCK';
    if (!VALID_VEHICLE_TYPES.includes(cleanVehicleType)) {
      throw new Error(`Vehicle type must be one of: ${VALID_VEHICLE_TYPES.join(', ')}`);
    }

    // 5. Validate Odometers
    const numCurrentOdo = Number(currentOdometer);
    if (isNaN(numCurrentOdo) || numCurrentOdo < 0) {
      throw new Error('Current odometer must be a non-negative number');
    }

    const numLastPmOdo = Number(lastPmOdometer);
    if (isNaN(numLastPmOdo) || numLastPmOdo < 0) {
      throw new Error('Last PM odometer must be a non-negative number');
    }

    if (numLastPmOdo > numCurrentOdo) {
      throw new Error('Last PM odometer cannot be greater than current odometer');
    }

    // 6. Validate Initial Status
    const cleanStatus = status ? status.trim().toUpperCase() : 'ACTIVE';
    if (!VALID_STATUSES.includes(cleanStatus)) {
      throw new Error(`Status must be one of: ${VALID_STATUSES.join(', ')}`);
    }

    // 7. Validate Driver Assignment (if supplied)
    let cleanDriverId = null;
    if (driverId) {
      cleanDriverId = String(driverId).trim();
      const driver = await vehiclesRepository.findDriverUserById(cleanDriverId);
      if (!driver) {
        throw new Error('Assigned driver user not found');
      }
      if (!driver.is_active || driver.is_blocked) {
        throw new Error('Assigned driver account is inactive or blocked');
      }
      if (!driver.is_driver) {
        throw new Error('Assigned user does not hold the Driver role');
      }

      const assignedVehicle = await vehiclesRepository.findVehicleByDriverId(cleanDriverId);
      if (assignedVehicle) {
        throw new Error(
          `Driver is already assigned to vehicle with plate number '${assignedVehicle.plate_number}'`
        );
      }
    }

    // 8. Insert into Database
    const createdRow = await vehiclesRepository.createVehicle({
      plateNumber: cleanPlate,
      model: cleanModel,
      yearModel: numYear,
      vehicleType: cleanVehicleType,
      currentOdometer: numCurrentOdo,
      lastPmOdometer: numLastPmOdo,
      status: cleanStatus,
      driverId: cleanDriverId,
    });

    // 9. Emit Audit History Event
    try {
      const eventKey = EVENTS.VEHICLE_REGISTERED || EVENTS.TRUCK_REGISTERED;
      await historyService.log(eventKey, {
        actorUser,
        targetId: createdRow.id,
        payload: {
          plateNumber: createdRow.plate_number,
          model: createdRow.model,
          vehicleType: createdRow.vehicle_type,
        },
      });
    } catch (auditErr) {
      console.error('Failed to emit history log for VEHICLE_REGISTERED:', auditErr);
    }

    return this.getVehicleById(createdRow.id);
  }

  /**
   * Updates general vehicle information.
   * @param {Object} actorUser
   * @param {string} id - Vehicle UUID
   * @param {Object} updateData - { plateNumber, model, yearModel, vehicleType, currentOdometer, lastPmOdometer }
   */
  async updateVehicle(actorUser, id, updateData) {
    if (!id || typeof id !== 'string') {
      throw new Error('Vehicle ID is required');
    }

    const existing = await vehiclesRepository.getVehicleById(id.trim());
    if (!existing) {
      throw new Error('Vehicle not found');
    }

    const payload = {};

    if (updateData.plateNumber !== undefined) {
      const cleanPlate = String(updateData.plateNumber).trim().toUpperCase();
      if (cleanPlate === '') {
        throw new Error('Plate number cannot be empty');
      }
      const existingPlate = await vehiclesRepository.findVehicleByPlateNumber(cleanPlate);
      if (existingPlate && existingPlate.id !== existing.id) {
        throw new Error(`Vehicle with plate number '${cleanPlate}' already exists`);
      }
      payload.plateNumber = cleanPlate;
    }

    if (updateData.model !== undefined) {
      const cleanModel = String(updateData.model).trim();
      if (cleanModel === '') {
        throw new Error('Vehicle model cannot be empty');
      }
      payload.model = cleanModel;
    }

    if (updateData.yearModel !== undefined) {
      const numYear = Number(updateData.yearModel);
      const currentYear = new Date().getFullYear();
      if (isNaN(numYear) || numYear < 1900 || numYear > currentYear + 1) {
        throw new Error(`Year model must be a valid year between 1900 and ${currentYear + 1}`);
      }
      payload.yearModel = numYear;
    }

    if (updateData.vehicleType !== undefined) {
      const cleanType = String(updateData.vehicleType).trim().toUpperCase();
      if (!VALID_VEHICLE_TYPES.includes(cleanType)) {
        throw new Error(`Vehicle type must be one of: ${VALID_VEHICLE_TYPES.join(', ')}`);
      }
      payload.vehicleType = cleanType;
    }

    if (updateData.currentOdometer !== undefined) {
      const numCurrent = Number(updateData.currentOdometer);
      if (isNaN(numCurrent) || numCurrent < 0) {
        throw new Error('Current odometer must be a non-negative number');
      }
      payload.currentOdometer = numCurrent;
    }

    if (updateData.lastPmOdometer !== undefined) {
      const numLastPm = Number(updateData.lastPmOdometer);
      if (isNaN(numLastPm) || numLastPm < 0) {
        throw new Error('Last PM odometer must be a non-negative number');
      }
      payload.lastPmOdometer = numLastPm;
    }

    const targetCurrent = payload.currentOdometer !== undefined ? payload.currentOdometer : Number(existing.current_odometer);
    const targetLastPm = payload.lastPmOdometer !== undefined ? payload.lastPmOdometer : Number(existing.last_pm_odometer);

    if (targetLastPm > targetCurrent) {
      throw new Error('Last PM odometer cannot be greater than current odometer');
    }

    const updatedRow = await vehiclesRepository.updateVehicle(existing.id, payload);

    try {
      const eventKey = EVENTS.VEHICLE_UPDATED || EVENTS.TRUCK_UPDATED;
      await historyService.log(eventKey, {
        actorUser,
        targetId: existing.id,
        payload: {
          plateNumber: updatedRow.plate_number,
        },
      });
    } catch (auditErr) {
      console.error('Failed to emit history log for VEHICLE_UPDATED:', auditErr);
    }

    return this.getVehicleById(existing.id);
  }

  /**
   * Updates vehicle status.
   * @param {Object} actorUser
   * @param {string} id - Vehicle UUID
   * @param {string} status - 'ACTIVE' | 'INACTIVE' | 'UNDER_MAINTENANCE' | 'RETIRED'
   */
  async updateVehicleStatus(actorUser, id, status) {
    if (!id || typeof id !== 'string') {
      throw new Error('Vehicle ID is required');
    }

    const existing = await vehiclesRepository.getVehicleById(id.trim());
    if (!existing) {
      throw new Error('Vehicle not found');
    }

    if (!status || typeof status !== 'string') {
      throw new Error('Status is required');
    }

    const cleanStatus = status.trim().toUpperCase();
    if (!VALID_STATUSES.includes(cleanStatus)) {
      throw new Error(`Status must be one of: ${VALID_STATUSES.join(', ')}`);
    }

    const shouldUnassignDriver = cleanStatus === 'INACTIVE' || cleanStatus === 'RETIRED';

    let updatedRow;
    if (shouldUnassignDriver) {
      updatedRow = await vehiclesRepository.deactivateVehicle(existing.id);
      if (cleanStatus === 'RETIRED') {
        const { query } = require('../../../../database/connection');
        const res = await query('UPDATE vehicles SET status = $1 WHERE id = $2 RETURNING *', ['RETIRED', existing.id]);
        updatedRow = res.rows[0];
      }
    } else {
      const { query } = require('../../../../database/connection');
      const res = await query('UPDATE vehicles SET status = $1 WHERE id = $2 RETURNING *', [cleanStatus, existing.id]);
      updatedRow = res.rows[0];
    }

    try {
      const eventKey = EVENTS.VEHICLE_STATUS_UPDATED || EVENTS.TRUCK_STATUS_UPDATED;
      await historyService.log(eventKey, {
        actorUser,
        targetId: existing.id,
        payload: {
          plateNumber: updatedRow.plate_number,
          status: cleanStatus,
        },
      });
    } catch (auditErr) {
      console.error('Failed to emit history log for VEHICLE_STATUS_UPDATED:', auditErr);
    }

    return this.getVehicleById(existing.id);
  }

  /**
   * Deactivates a vehicle and unassigns any assigned driver.
   * @param {Object} actorUser
   * @param {string} id - Vehicle UUID
   */
  async deactivateVehicle(actorUser, id) {
    if (!id || typeof id !== 'string') {
      throw new Error('Vehicle ID is required');
    }

    const existing = await vehiclesRepository.getVehicleById(id.trim());
    if (!existing) {
      throw new Error('Vehicle not found');
    }

    const deactivatedRow = await vehiclesRepository.deactivateVehicle(existing.id);

    try {
      const eventKey = EVENTS.VEHICLE_DEACTIVATED || EVENTS.TRUCK_DEACTIVATED;
      await historyService.log(eventKey, {
        actorUser,
        targetId: existing.id,
        payload: {
          plateNumber: deactivatedRow.plate_number,
        },
      });
    } catch (auditErr) {
      console.error('Failed to emit history log for VEHICLE_DEACTIVATED:', auditErr);
    }

    return this.getVehicleById(existing.id);
  }

  /**
   * Assigns a driver to a vehicle.
   * @param {Object} actorUser
   * @param {string} vehicleId - Vehicle UUID
   * @param {string} driverId - User UUID
   */
  async assignDriver(actorUser, vehicleId, driverId) {
    if (!vehicleId || typeof vehicleId !== 'string') {
      throw new Error('Vehicle ID is required');
    }

    // Unassignment case
    if (driverId === null || driverId === undefined || driverId === '') {
      return this.unassignDriver(actorUser, vehicleId);
    }

    if (typeof driverId !== 'string') {
      throw new Error('Driver ID is required');
    }

    const cleanVehicleId = vehicleId.trim();
    const cleanDriverId = driverId.trim();

    const vehicle = await vehiclesRepository.getVehicleById(cleanVehicleId);
    if (!vehicle) {
      throw new Error('Vehicle not found');
    }

    // Assignment case: verify vehicle is not inactive or retired
    if (vehicle.status === 'INACTIVE' || vehicle.status === 'RETIRED') {
      throw new Error(`Cannot assign a driver to a vehicle with status '${vehicle.status}'`);
    }

    // Check if target vehicle already has another driver assigned
    if (vehicle.driver_id) {
      if (vehicle.driver_id === cleanDriverId) {
        return this.getVehicleById(vehicle.id);
      }
      const currentDriverName = vehicle.driver_first_name
        ? `${vehicle.driver_first_name} ${vehicle.driver_last_name}`
        : 'another driver';
      throw new Error(
        `Vehicle '${vehicle.plate_number}' is already assigned to driver '${currentDriverName}'. Please unassign the current driver first before assigning a new driver.`
      );
    }

    const driver = await vehiclesRepository.findDriverUserById(cleanDriverId);
    if (!driver) {
      throw new Error('Driver not found');
    }
    if (!driver.is_active || driver.is_blocked) {
      throw new Error('Driver account is inactive or blocked');
    }
    if (!driver.is_driver) {
      throw new Error('User does not hold the Driver role');
    }

    const alreadyAssignedVehicle = await vehiclesRepository.findVehicleByDriverId(cleanDriverId);
    if (alreadyAssignedVehicle && alreadyAssignedVehicle.id !== vehicle.id) {
      throw new Error(
        `Driver is already assigned to vehicle '${alreadyAssignedVehicle.plate_number}'`
      );
    }

    await vehiclesRepository.assignDriver(vehicle.id, cleanDriverId);

    try {
      const eventKey = EVENTS.VEHICLE_DRIVER_ASSIGNED || EVENTS.TRUCK_DRIVER_ASSIGNED;
      await historyService.log(eventKey, {
        actorUser,
        targetId: vehicle.id,
        payload: {
          plateNumber: vehicle.plate_number,
          driverName: `${driver.first_name} ${driver.last_name}`,
        },
      });
    } catch (auditErr) {
      console.error('Failed to emit history log for VEHICLE_DRIVER_ASSIGNED:', auditErr);
    }

    return this.getVehicleById(vehicle.id);
  }

  /**
   * Unassigns the driver from a vehicle.
   * @param {Object} actorUser
   * @param {string} vehicleId - Vehicle UUID
   */
  async unassignDriver(actorUser, vehicleId) {
    if (!vehicleId || typeof vehicleId !== 'string') {
      throw new Error('Vehicle ID is required');
    }

    const cleanVehicleId = vehicleId.trim();
    const vehicle = await vehiclesRepository.getVehicleById(cleanVehicleId);
    if (!vehicle) {
      throw new Error('Vehicle not found');
    }

    if (!vehicle.driver_id) {
      throw new Error('Vehicle does not have an assigned driver');
    }

    await vehiclesRepository.unassignDriver(vehicle.id);

    try {
      const eventKey = EVENTS.VEHICLE_DRIVER_UNASSIGNED || EVENTS.TRUCK_DRIVER_UNASSIGNED;
      await historyService.log(eventKey, {
        actorUser,
        targetId: vehicle.id,
        payload: {
          plateNumber: vehicle.plate_number,
        },
      });
    } catch (auditErr) {
      console.error('Failed to emit history log for VEHICLE_DRIVER_UNASSIGNED:', auditErr);
    }

    return this.getVehicleById(vehicle.id);
  }

  /**
   * Retrieves all driver users with assignment state.
   */
  async getAllDrivers(filters = {}, pagination = null) {
    if (!pagination) {
      const rows = await vehiclesRepository.getAllDrivers(filters);
      return rows.map(formatDriver);
    }

    const offset = calculateOffset(pagination.page, pagination.limit);
    const { rows, total } = await vehiclesRepository.getAllDrivers(filters, {
      ...pagination,
      offset,
    });

    const items = rows.map(formatDriver);
    const meta = buildPaginationMeta(total, pagination.page, pagination.limit);

    return {
      items,
      meta,
    };
  }

  /**
   * Retrieves active, unblocked users with Driver role who are not assigned to any vehicle.
   */
  async getAvailableDrivers() {
    const rows = await vehiclesRepository.getAvailableDrivers();
    return rows.map(formatDriver);
  }

  /**
   * Form configuration metadata and unassigned drivers for vehicle registration.
   */
  async getRegisterOptions() {
    const availableDrivers = await this.getAvailableDrivers();

    return {
      statuses: VALID_STATUSES,
      statusOptions: VALID_STATUSES,
      vehicleTypes: VALID_VEHICLE_TYPES,
      availableDrivers,
      drivers: availableDrivers,
    };
  }

  /**
   * Records a new mileage reading for a vehicle and calculates usage metrics.
   *
   * @param {Object} actorUser - Authenticated user context
   * @param {string} vehicleId - Vehicle UUID
   * @param {Object} data - { odometer, mileage, currentOdometer }
   * @returns {Promise<Object>} Updated vehicle details and mileage summary
   */
  async recordMileage(actorUser, vehicleId, data = {}) {
    if (!vehicleId || typeof vehicleId !== 'string') {
      throw new Error('Vehicle ID is required');
    }

    const rawOdo = data.odometer !== undefined ? data.odometer : (data.mileage !== undefined ? data.mileage : data.currentOdometer);
    if (rawOdo === undefined || rawOdo === null || rawOdo === '') {
      throw new Error('Odometer reading is required');
    }

    const newOdometer = Number(rawOdo);
    if (isNaN(newOdometer) || newOdometer < 0) {
      throw new Error('Odometer reading must be a non-negative number');
    }

    const existingVehicle = await vehiclesRepository.getVehicleById(vehicleId.trim());
    if (!existingVehicle) {
      throw new Error('Vehicle not found');
    }

    const previousOdometer = Number(existingVehicle.current_odometer);
    if (newOdometer < previousOdometer) {
      throw new Error(`New odometer reading (${newOdometer} km) cannot be less than current recorded odometer (${previousOdometer} km)`);
    }

    await vehiclesRepository.updateVehicleOdometer(vehicleId.trim(), newOdometer);
    const updatedVehicle = await this.getVehicleById(vehicleId.trim());

    const lastPmOdometer = Number(existingVehicle.last_pm_odometer);
    const distanceRecorded = newOdometer - previousOdometer;
    const distanceSinceLastPm = newOdometer - lastPmOdometer;

    try {
      const eventKey = EVENTS.VEHICLE_ODOMETER_RECORDED || EVENTS.TRUCK_ODOMETER_RECORDED;
      await historyService.log(eventKey, {
        actorUser,
        targetId: vehicleId.trim(),
        payload: { plateNumber: updatedVehicle.plateNumber, odometer: newOdometer },
      });
    } catch (auditErr) {
      console.error('Failed to emit history log for VEHICLE_ODOMETER_RECORDED:', auditErr);
    }

    return {
      vehicle: updatedVehicle,
      truck: updatedVehicle,
      mileageSummary: {
        previousOdometer,
        currentOdometer: newOdometer,
        distanceRecorded,
        lastPmOdometer,
        distanceSinceLastPm,
      },
    };
  }
}

module.exports = new VehiclesService();
