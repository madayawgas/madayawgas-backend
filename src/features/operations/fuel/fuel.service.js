const { pool } = require('../../../../database/connection');
const fuelRepository = require('./fuel.repository');
const vehiclesRepository = require('../../fleet/vehicles/vehicles.repository');
const maintenanceRepository = require('../../fleet/maintenance/maintenance.repository');
const tripsRepository = require('../../trips/trips.repository');
const { historyService, EVENTS } = require('../../history');
const { mediaStorage, extractStorageKey } = require('../../media');
const { calculateOffset, buildPaginationMeta } = require('../../../utils/pagination');

/**
 * Formats database row into camelCase API DTO with resolved receipt URL.
 */
function formatFuelRecord(row) {
  if (!row) return null;

  const rawKey = row.receipt_media_key;
  const canonicalKey = rawKey ? (extractStorageKey(rawKey) || rawKey) : null;
  const receiptMediaUrl = canonicalKey ? mediaStorage.resolveMediaUrl(canonicalKey) : null;

  return {
    id: row.id,
    vehicleId: row.vehicle_id,
    driverId: row.driver_id,
    tripId: row.trip_id,
    litersPumped: Number(row.liters_pumped),
    totalCost: Number(row.total_cost),
    pricePerLiter: Number(row.price_per_liter),
    fuelStation: row.fuel_station || null,
    fuelType: row.fuel_type,
    odometerReading: row.odometer_reading !== null ? Number(row.odometer_reading) : null,
    receiptMediaKey: canonicalKey,
    receiptMediaUrl,
    fueledAt: row.fueled_at,
    notes: row.notes || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    vehicle: {
      id: row.vehicle_id,
      plateNumber: row.vehicle_plate_number,
      model: row.vehicle_model,
      vehicleType: row.vehicle_type,
    },
    driver: row.driver_id
      ? {
          id: row.driver_id,
          username: row.driver_username,
          firstName: row.driver_first_name,
          lastName: row.driver_last_name,
          fullName: [row.driver_first_name, row.driver_last_name].filter(Boolean).join(' ') || row.driver_username,
          phone: row.driver_phone,
        }
      : null,
    trip: row.trip_id
      ? {
          id: row.trip_id,
          tripNumber: row.trip_number,
        }
      : null,
  };
}

/**
 * Vehicle Fuel Logging Service
 * Handles fuel entries, strict non-negative input validations, monotonic odometer checks,
 * optional OR slip attachments, and summary aggregations.
 */
class FuelService {
  /**
   * Records a fuel intake entry for a vehicle asset.
   *
   * @param {Object} actorUser - Authenticated user context
   * @param {Object} payload - { vehicleId, driverId, tripId, litersPumped, totalCost, pricePerLiter, fuelStation, fuelType, odometerReading, receiptMediaKey, fueledAt, notes }
   * @returns {Promise<Object>} Created fuel log DTO
   */
  async recordFuelEntry(actorUser, payload = {}) {
    const {
      vehicleId,
      driverId,
      tripId,
      litersPumped,
      totalCost,
      pricePerLiter,
      fuelStation,
      fuelType,
      odometerReading,
      receiptMediaKey,
      receiptImageUrl,
      fueledAt,
      notes,
    } = payload;

    // 1. Telemetry input validation
    if (litersPumped === undefined || litersPumped === null || litersPumped === '') {
      const err = new Error('Fuel volume (liters) is required');
      err.statusCode = 400;
      throw err;
    }

    const numLiters = Number(litersPumped);
    if (isNaN(numLiters) || numLiters <= 0) {
      const err = new Error('Liters pumped must be a positive number greater than 0');
      err.statusCode = 400;
      throw err;
    }

    if (totalCost === undefined || totalCost === null || totalCost === '') {
      const err = new Error('Total fuel cost is required');
      err.statusCode = 400;
      throw err;
    }

    const numCost = Number(totalCost);
    if (isNaN(numCost) || numCost < 0) {
      const err = new Error('Total fuel cost must be a non-negative number');
      err.statusCode = 400;
      throw err;
    }

    let calculatedPricePerLiter = pricePerLiter !== undefined && pricePerLiter !== null && pricePerLiter !== ''
      ? Number(pricePerLiter)
      : Number((numCost / numLiters).toFixed(2));

    if (isNaN(calculatedPricePerLiter) || calculatedPricePerLiter < 0) {
      calculatedPricePerLiter = Number((numCost / numLiters).toFixed(2));
    }

    // 2. Resolve Driver ID
    let resolvedDriverId = driverId && typeof driverId === 'string' && driverId.trim().length > 0
      ? driverId.trim()
      : actorUser.id;

    // 3. Resolve Vehicle ID
    let resolvedVehicleId = vehicleId && typeof vehicleId === 'string' && vehicleId.trim().length > 0
      ? vehicleId.trim()
      : null;

    if (!resolvedVehicleId) {
      const assigned = await vehiclesRepository.findVehicleByDriverId(resolvedDriverId);
      if (assigned) {
        resolvedVehicleId = assigned.id;
      }
    }

    if (!resolvedVehicleId) {
      const err = new Error('Vehicle ID is required');
      err.statusCode = 400;
      throw err;
    }

    const vehicle = await vehiclesRepository.getVehicleById(resolvedVehicleId);
    if (!vehicle) {
      const err = new Error('Vehicle not found');
      err.statusCode = 404;
      throw err;
    }

    const permissions = actorUser?.permissions || [];
    const hasManage = permissions.includes('fuel.manage');
    if (!hasManage && vehicle.driver_id && vehicle.driver_id !== actorUser.id) {
      const err = new Error('Access denied: You are only authorized to log fuel for your assigned vehicle');
      err.statusCode = 403;
      throw err;
    }

    // 4. Resolve Trip ID
    let resolvedTripId = tripId && typeof tripId === 'string' && tripId.trim().length > 0
      ? tripId.trim()
      : null;

    if (!resolvedTripId) {
      const activeTrip = await tripsRepository.findActiveTripByDriverId(resolvedDriverId);
      if (activeTrip && activeTrip.truck_id === resolvedVehicleId) {
        resolvedTripId = activeTrip.id;
      }
    }

    // 5. Odometer Sequence Validation
    let validOdometer = null;
    let shouldAdvanceOdometer = false;

    if (odometerReading !== undefined && odometerReading !== null && odometerReading !== '') {
      const numOdo = Number(odometerReading);
      if (isNaN(numOdo) || !Number.isInteger(numOdo) || numOdo < 0) {
        const err = new Error('Odometer reading must be a non-negative integer');
        err.statusCode = 400;
        throw err;
      }

      const currentOdo = Number(vehicle.current_odometer || 0);
      if (numOdo < currentOdo) {
        const err = new Error(
          `New odometer reading (${numOdo} km) cannot be less than current vehicle odometer (${currentOdo} km).`
        );
        err.statusCode = 400;
        err.code = 'INVALID_ODOMETER_SEQUENCE';
        throw err;
      }

      validOdometer = numOdo;
      shouldAdvanceOdometer = numOdo > currentOdo;
    }

    // 6. Optional Receipt Proof Key
    const rawKey = receiptMediaKey || receiptImageUrl || null;
    const canonicalReceiptKey = rawKey ? (extractStorageKey(rawKey) || rawKey.trim()) : null;

    let parsedFueledAt = null;
    if (fueledAt) {
      parsedFueledAt = new Date(fueledAt);
      if (isNaN(parsedFueledAt.getTime())) {
        const err = new Error('Invalid fueling timestamp format');
        err.statusCode = 400;
        throw err;
      }
    }

    // 7. Atomic Transaction Execution
    const client = await pool.connect();
    let created;

    try {
      await client.query('BEGIN');

      created = await fuelRepository.createFuelLog(
        {
          vehicleId: resolvedVehicleId,
          driverId: resolvedDriverId,
          tripId: resolvedTripId,
          recordedBy: actorUser.id,
          litersPumped: numLiters,
          totalCost: numCost,
          pricePerLiter: calculatedPricePerLiter,
          fuelStation: fuelStation ? fuelStation.trim() : null,
          fuelType: fuelType ? fuelType.trim().toUpperCase() : 'DIESEL',
          odometerReading: validOdometer,
          receiptMediaKey: canonicalReceiptKey,
          fueledAt: parsedFueledAt ? parsedFueledAt.toISOString() : null,
          notes: notes ? notes.trim() : null,
        },
        client
      );

      // Advance odometer and write to odometer logs if reading increased
      if (shouldAdvanceOdometer && validOdometer !== null) {
        await maintenanceRepository.updateTruckOdometer(
          { truckId: resolvedVehicleId, currentOdometer: validOdometer },
          client
        );

        await maintenanceRepository.insertOdometerLog(
          {
            vehicleId: resolvedVehicleId,
            odometerReading: validOdometer,
            loggedBy: actorUser.id,
            source: 'FUEL_ENTRY',
            notes: notes ? `Fuel intake: ${notes}` : 'Recorded during fuel entry',
          },
          client
        );
      }

      await client.query('COMMIT');
    } catch (txError) {
      await client.query('ROLLBACK');
      throw txError;
    } finally {
      client.release();
    }

    const fullRecord = await fuelRepository.getFuelLogById(created.id);
    const dto = formatFuelRecord(fullRecord);

    await historyService.log(EVENTS.FUEL_LOGGED, {
      actorUser,
      targetId: created.id,
      payload: {
        plateNumber: dto.vehicle.plateNumber,
        litersPumped: dto.litersPumped,
        totalCost: dto.totalCost,
      },
      metadata: {
        fuelLogId: created.id,
        vehicleId: resolvedVehicleId,
        driverId: resolvedDriverId,
        litersPumped: dto.litersPumped,
        totalCost: dto.totalCost,
        odometerReading: validOdometer,
      },
    });

    return dto;
  }

  /**
   * Retrieves single fuel log by UUID.
   * @param {string} id - Fuel Log UUID
   * @param {Object} actorUser
   */
  async getFuelLogById(id, actorUser) {
    if (!id || typeof id !== 'string') {
      const err = new Error('Fuel Log ID is required');
      err.statusCode = 400;
      throw err;
    }

    const row = await fuelRepository.getFuelLogById(id.trim());
    if (!row) {
      const err = new Error('Fuel log record not found');
      err.statusCode = 404;
      throw err;
    }

    const permissions = actorUser?.permissions || [];
    const hasGlobalView = permissions.includes('fuel.view') || permissions.includes('fuel.manage');

    // Scoped check for Driver
    if (!hasGlobalView) {
      const assigned = await vehiclesRepository.findVehicleByDriverId(actorUser.id);
      const isAssignedTruck = assigned && assigned.id === row.vehicle_id;
      const isDriverLogged = row.driver_id === actorUser.id;

      if (!isAssignedTruck && !isDriverLogged) {
        const err = new Error('Access denied: You are only authorized to view fuel logs for your assigned vehicle');
        err.statusCode = 403;
        throw err;
      }
    }

    return formatFuelRecord(row);
  }

  /**
   * Computes aggregate summary metrics (total liters, total cost, average price/L) for filtered vehicle logs.
   * @param {Object} actorUser
   * @param {Object} filters
   */
  async getFuelSummary(actorUser, filters = {}) {
    const permissions = actorUser?.permissions || [];
    const hasGlobalView = permissions.includes('fuel.view') || permissions.includes('fuel.manage');

    const effectiveFilters = { ...filters };

    if (!hasGlobalView) {
      const assigned = await vehiclesRepository.findVehicleByDriverId(actorUser.id);
      effectiveFilters.vehicleId = assigned ? assigned.id : '00000000-0000-0000-0000-000000000000';
    }

    return fuelRepository.getFuelSummary(effectiveFilters);
  }

  /**
   * Retrieves paginated fuel logs with summary metrics and server-side filtering.
   *
   * @param {Object} actorUser
   * @param {Object} filters - { vehicleId, driverId, tripId, fuelType, startDate, endDate, search }
   * @param {Object|null} pagination
   */
  async getFuelLogs(actorUser, filters = {}, pagination = null) {
    const permissions = actorUser?.permissions || [];
    const hasGlobalView = permissions.includes('fuel.view') || permissions.includes('fuel.manage');

    const effectiveFilters = { ...filters };

    if (!hasGlobalView) {
      const assigned = await vehiclesRepository.findVehicleByDriverId(actorUser.id);
      effectiveFilters.vehicleId = assigned ? assigned.id : '00000000-0000-0000-0000-000000000000';
    }

    const summary = await fuelRepository.getFuelSummary(effectiveFilters);

    if (!pagination || !pagination.isPaginated) {
      const rows = await fuelRepository.getFuelLogs(effectiveFilters, null);
      return {
        items: rows.map(formatFuelRecord),
        summary,
      };
    }

    const offset = calculateOffset(pagination.page, pagination.limit);
    const { rows, total } = await fuelRepository.getFuelLogs(effectiveFilters, {
      ...pagination,
      offset,
    });

    const items = rows.map(formatFuelRecord);
    const meta = buildPaginationMeta(total, pagination.page, pagination.limit);

    return {
      items,
      meta,
      summary,
    };
  }
}

module.exports = new FuelService();
