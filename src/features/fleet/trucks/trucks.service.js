const trucksRepository = require('./trucks.repository');
const { historyService, EVENTS } = require('../../history');

/**
 * Maps database row to camelCase DTO with soft-bounded driver details and availability.
 */
function formatTruck(row) {
  if (!row) return null;

  const truck = {
    id: row.id,
    plateNumber: row.plate_number,
    model: row.model,
    yearModel: Number(row.year_model),
    currentOdometer: Number(row.current_odometer),
    lastPmOdometer: Number(row.last_pm_odometer),
    status: row.status,
    operationalStatus: row.status,
    isAvailable: row.status === 'ACTIVE',
    driverId: row.driver_id || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };

  if (row.driver_id && row.driver_first_name !== undefined) {
    truck.driver = {
      id: row.driver_id,
      firstName: row.driver_first_name,
      lastName: row.driver_last_name,
      phone: row.driver_phone,
      username: row.driver_username,
    };
  } else if (row.driver_id) {
    truck.driver = { id: row.driver_id };
  } else {
    truck.driver = null;
  }

  return truck;
}

/**
 * Maps database driver row to camelCase DTO with live assignment status.
 */
function formatDriver(row) {
  if (!row) return null;

  const isAssigned = row.assigned_truck_id !== null && row.assigned_truck_id !== undefined;

  return {
    id: row.id,
    username: row.username,
    firstName: row.first_name,
    lastName: row.last_name,
    phone: row.phone,
    role: row.role_name,
    isAssigned,
    status: isAssigned ? 'ASSIGNED' : 'AVAILABLE',
    assignedTruck: isAssigned
      ? {
          id: row.assigned_truck_id,
          plateNumber: row.assigned_truck_plate,
          model: row.assigned_truck_model,
        }
      : null,
  };
}

/**
 * Trucks Service
 * Handles business rules and domain logic for fleet vehicle management.
 */
class TrucksService {
  /**
   * Retrieves all fleet vehicles with optional filtering.
   */
  async getAllTrucks(filters = {}) {
    const rows = await trucksRepository.getAllTrucks(filters);
    return rows.map(formatTruck);
  }

  /**
   * Retrieves all eligible drivers with their live assignment status.
   * @param {Object} filters - { availableOnly, search }
   */
  async getAllDrivers(filters = {}) {
    const rows = await trucksRepository.getAllDrivers(filters);
    return rows.map(formatDriver);
  }

  /**
   * Retrieves only available (unassigned) drivers.
   * @param {Object} filters - { search }
   */
  async getAvailableDrivers(filters = {}) {
    const rows = await trucksRepository.getAllDrivers({ ...filters, availableOnly: true });
    return rows.map(formatDriver);
  }

  /**
   * Retrieves a single fleet vehicle by ID.
   */
  async getTruckById(id) {
    if (!id || typeof id !== 'string') {
      throw new Error('Truck ID is required');
    }

    const row = await trucksRepository.getTruckById(id);
    if (!row) {
      throw new Error('Vehicle not found');
    }

    return formatTruck(row);
  }

  /**
   * Registers a new vehicle into the fleet.
   */
  async createTruck(actorUser, {
    plateNumber,
    model,
    yearModel,
    currentOdometer = 0,
    lastPmOdometer = 0,
    status = 'ACTIVE',
    driverId = null,
  }) {
    // 1. Validate required fields
    if (!plateNumber || typeof plateNumber !== 'string' || plateNumber.trim().length === 0) {
      throw new Error('Plate number is required');
    }
    const cleanPlate = plateNumber.trim().toUpperCase();

    if (!model || typeof model !== 'string' || model.trim().length === 0) {
      throw new Error('Vehicle model is required');
    }
    const cleanModel = model.trim();

    const numericYear = Number(yearModel);
    const currentYear = new Date().getFullYear();
    if (!yearModel || isNaN(numericYear) || numericYear < 1900 || numericYear > currentYear + 1) {
      throw new Error(`Year model must be a valid year between 1900 and ${currentYear + 1}`);
    }

    const numCurrentOdo = Number(currentOdometer);
    if (isNaN(numCurrentOdo) || numCurrentOdo < 0) {
      throw new Error('Current odometer must be a non-negative number');
    }

    const numLastPmOdo = Number(lastPmOdometer);
    if (isNaN(numLastPmOdo) || numLastPmOdo < 0) {
      throw new Error('Last PM odometer must be a non-negative number');
    }

    // 2. Validate status
    const allowedStatuses = ['ACTIVE', 'INACTIVE', 'UNDER_MAINTENANCE', 'RETIRED'];
    const cleanStatus = status ? status.toUpperCase() : 'ACTIVE';
    if (!allowedStatuses.includes(cleanStatus)) {
      throw new Error(`Invalid status. Allowed values: ${allowedStatuses.join(', ')}`);
    }

    // 3. Check plate number uniqueness
    const existing = await trucksRepository.findTruckByPlateNumber(cleanPlate);
    if (existing) {
      throw new Error(`Vehicle with plate number '${cleanPlate}' already exists`);
    }

    // 4. Validate driver assignment if provided
    let finalDriverId = null;
    if (driverId) {
      if (cleanStatus === 'INACTIVE' || cleanStatus === 'RETIRED') {
        throw new Error('Driver cannot be assigned to an INACTIVE or RETIRED vehicle');
      }

      const driver = await trucksRepository.findDriverUserById(driverId);
      if (!driver) {
        throw new Error('Assigned driver user not found');
      }
      if (!driver.is_active || driver.is_blocked) {
        throw new Error('Assigned driver is not an active eligible user');
      }
      if (driver.role_name !== 'Driver') {
        throw new Error(`Only users with the 'Driver' role can be assigned to vehicles (user '${driver.username}' has role '${driver.role_name}')`);
      }

      const alreadyAssigned = await trucksRepository.findTruckByDriverId(driverId);
      if (alreadyAssigned) {
        const driverName = `${driver.first_name} ${driver.last_name}`;
        throw new Error(`Driver '${driverName}' is already assigned to vehicle '${alreadyAssigned.plate_number}'. The driver must be unassigned first before being assigned to another vehicle.`);
      }

      finalDriverId = driverId;
    }

    // 5. Create truck in database
    const createdRow = await trucksRepository.createTruck({
      plateNumber: cleanPlate,
      model: cleanModel,
      yearModel: numericYear,
      currentOdometer: numCurrentOdo,
      lastPmOdometer: numLastPmOdo,
      status: cleanStatus,
      driverId: finalDriverId,
    });

    const result = await this.getTruckById(createdRow.id);

    await historyService.log(EVENTS.TRUCK_REGISTERED, {
      actorUser,
      targetId: result.id,
      payload: { plateNumber: result.plateNumber, model: result.model },
    });

    // Return with full joined details
    return result;
  }

  /**
   * Updates vehicle information.
   */
  async updateTruck(id, updateData) {
    if (!id || typeof id !== 'string') {
      throw new Error('Truck ID is required');
    }

    const existingTruck = await trucksRepository.getTruckById(id);
    if (!existingTruck) {
      throw new Error('Vehicle not found');
    }

    const updates = {};

    if (updateData.plateNumber !== undefined) {
      if (typeof updateData.plateNumber !== 'string' || updateData.plateNumber.trim().length === 0) {
        throw new Error('Plate number cannot be empty');
      }
      const cleanPlate = updateData.plateNumber.trim().toUpperCase();
      if (cleanPlate !== existingTruck.plate_number) {
        const duplicate = await trucksRepository.findTruckByPlateNumber(cleanPlate);
        if (duplicate && duplicate.id !== id) {
          throw new Error(`Vehicle with plate number '${cleanPlate}' already exists`);
        }
      }
      updates.plateNumber = cleanPlate;
    }

    if (updateData.model !== undefined) {
      if (typeof updateData.model !== 'string' || updateData.model.trim().length === 0) {
        throw new Error('Vehicle model cannot be empty');
      }
      updates.model = updateData.model.trim();
    }

    if (updateData.yearModel !== undefined) {
      const numericYear = Number(updateData.yearModel);
      const currentYear = new Date().getFullYear();
      if (isNaN(numericYear) || numericYear < 1900 || numericYear > currentYear + 1) {
        throw new Error(`Year model must be a valid year between 1900 and ${currentYear + 1}`);
      }
      updates.yearModel = numericYear;
    }

    if (updateData.currentOdometer !== undefined) {
      const numOdo = Number(updateData.currentOdometer);
      if (isNaN(numOdo) || numOdo < 0) {
        throw new Error('Current odometer must be a non-negative number');
      }
      updates.currentOdometer = numOdo;
    }

    if (updateData.lastPmOdometer !== undefined) {
      const numPmOdo = Number(updateData.lastPmOdometer);
      if (isNaN(numPmOdo) || numPmOdo < 0) {
        throw new Error('Last PM odometer must be a non-negative number');
      }
      updates.lastPmOdometer = numPmOdo;
    }

    await trucksRepository.updateTruck(id, updates);
    const updated = await this.getTruckById(id);

    await historyService.log(EVENTS.TRUCK_UPDATED, {
      targetId: id,
      payload: { plateNumber: updated.plateNumber },
    });

    return updated;
  }

  /**
   * Deactivates a vehicle and releases its assigned driver.
   */
  async deactivateTruck(id) {
    if (!id || typeof id !== 'string') {
      throw new Error('Truck ID is required');
    }

    const existingTruck = await trucksRepository.getTruckById(id);
    if (!existingTruck) {
      throw new Error('Vehicle not found');
    }

    await trucksRepository.deactivateTruck(id);
    const deactivated = await this.getTruckById(id);

    await historyService.log(EVENTS.TRUCK_DEACTIVATED, {
      targetId: id,
      payload: { plateNumber: deactivated.plateNumber },
    });

    return deactivated;
  }

  /**
   * Assigns an eligible driver to a vehicle.
   * Enforces strict unassign-first constraints:
   * - Driver cannot be assigned if already assigned to any vehicle.
   * - Target vehicle cannot have a new driver assigned if it already has an assigned driver without unassigning first.
   */
  async assignDriver(truckId, driverId) {
    if (!truckId || typeof truckId !== 'string') {
      throw new Error('Truck ID is required');
    }

    const truck = await trucksRepository.getTruckById(truckId);
    if (!truck) {
      throw new Error('Vehicle not found');
    }

    // Unassignment case
    if (driverId === null || driverId === undefined || driverId === '') {
      return this.unassignDriver(truckId);
    }

    // Assignment case: verify vehicle is not inactive or retired
    if (truck.status === 'INACTIVE' || truck.status === 'RETIRED') {
      throw new Error(`Cannot assign a driver to a vehicle with status '${truck.status}'`);
    }

    // Check if target truck already has another driver assigned
    if (truck.driver_id) {
      if (truck.driver_id === driverId) {
        return formatTruck(truck);
      }
      const currentDriverName = truck.driver_first_name
        ? `${truck.driver_first_name} ${truck.driver_last_name}`
        : 'another driver';
      throw new Error(`Vehicle '${truck.plate_number}' is already assigned to driver '${currentDriverName}'. Please unassign the current driver first before assigning a new driver.`);
    }

    // Verify driver user exists and is active with 'Driver' role
    const driver = await trucksRepository.findDriverUserById(driverId);
    if (!driver) {
      throw new Error('Driver user not found');
    }
    if (!driver.is_active || driver.is_blocked) {
      throw new Error('Driver user is inactive or blocked');
    }
    if (driver.role_name !== 'Driver') {
      throw new Error(`Only users with the 'Driver' role can be assigned to vehicles (user '${driver.username}' has role '${driver.role_name}')`);
    }

    // Check if driver is already assigned to another vehicle
    const currentAssignment = await trucksRepository.findTruckByDriverId(driverId);
    if (currentAssignment) {
      const driverFullName = `${driver.first_name} ${driver.last_name}`;
      throw new Error(`Driver '${driverFullName}' is already assigned to vehicle '${currentAssignment.plate_number}'. The driver must be unassigned from vehicle '${currentAssignment.plate_number}' first before being assigned to another vehicle.`);
    }

    await trucksRepository.assignDriver(truckId, driverId);
    const assigned = await this.getTruckById(truckId);

    await historyService.log(EVENTS.TRUCK_DRIVER_ASSIGNED, {
      targetId: truckId,
      payload: {
        plateNumber: assigned.plateNumber,
        driverName: `${driver.first_name} ${driver.last_name}`,
      },
    });

    return assigned;
  }

  /**
   * Unassigns the driver currently attached to a vehicle.
   */
  async unassignDriver(truckId) {
    if (!truckId || typeof truckId !== 'string') {
      throw new Error('Truck ID is required');
    }

    const truck = await trucksRepository.getTruckById(truckId);
    if (!truck) {
      throw new Error('Vehicle not found');
    }

    if (!truck.driver_id) {
      return formatTruck(truck);
    }

    await trucksRepository.unassignDriver(truckId);
    const unassigned = await this.getTruckById(truckId);

    await historyService.log(EVENTS.TRUCK_DRIVER_UNASSIGNED, {
      targetId: truckId,
      payload: { plateNumber: unassigned.plateNumber },
    });

    return unassigned;
  }

  /**
   * Records a new vehicle mileage reading and calculates usage/maintenance metrics.
   * @param {Object} actorUser - Authenticated user performing action
   * @param {string} truckId - Truck UUID
   * @param {Object} data - { odometer, mileage, currentOdometer }
   */
  async recordMileage(actorUser, truckId, data = {}) {
    if (!truckId || typeof truckId !== 'string') {
      throw new Error('Truck ID is required');
    }

    const rawOdo = data.odometer !== undefined ? data.odometer : (data.mileage !== undefined ? data.mileage : data.currentOdometer);
    if (rawOdo === undefined || rawOdo === null || rawOdo === '') {
      throw new Error('Odometer reading is required');
    }

    const newOdometer = Number(rawOdo);
    if (isNaN(newOdometer) || newOdometer < 0) {
      throw new Error('Odometer reading must be a non-negative number');
    }

    const existingTruck = await trucksRepository.getTruckById(truckId);
    if (!existingTruck) {
      throw new Error('Vehicle not found');
    }

    const previousOdometer = Number(existingTruck.current_odometer);
    if (newOdometer < previousOdometer) {
      throw new Error(`New odometer reading (${newOdometer} km) cannot be less than current recorded odometer (${previousOdometer} km)`);
    }

    await trucksRepository.updateTruckOdometer(truckId, newOdometer);
    const updatedTruck = await this.getTruckById(truckId);

    const lastPmOdometer = Number(existingTruck.last_pm_odometer);
    const distanceRecorded = newOdometer - previousOdometer;
    const distanceSinceLastPm = newOdometer - lastPmOdometer;

    await historyService.log(EVENTS.TRUCK_ODOMETER_RECORDED, {
      actorUser,
      targetId: truckId,
      payload: { plateNumber: updatedTruck.plateNumber, odometer: newOdometer },
    });

    return {
      truck: updatedTruck,
      mileageSummary: {
        previousOdometer,
        currentOdometer: newOdometer,
        distanceRecorded,
        lastPmOdometer,
        distanceSinceLastPm,
      },
    };
  }

  /**
   * Retrieves data needed for the Fleet Registration page (available drivers and status options).
   */
  async getRegisterOptions() {
    const drivers = await this.getAvailableDrivers();
    return {
      availableDrivers: drivers,
      statusOptions: ['ACTIVE', 'INACTIVE', 'UNDER_MAINTENANCE', 'RETIRED'],
    };
  }
}

module.exports = new TrucksService();
