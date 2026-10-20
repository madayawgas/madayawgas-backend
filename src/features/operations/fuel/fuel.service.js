const { pool } = require('../../../../database/connection');
const fuelRepository = require('./fuel.repository');
const vehiclesRepository = require('../../fleet/vehicles/vehicles.repository');
const maintenanceRepository = require('../../fleet/maintenance/maintenance.repository');
const tripsRepository = require('../../trips/trips.repository');
const { historyService, EVENTS } = require('../../history');
const { mediaStorage, extractStorageKey } = require('../../media');
const { calculateOffset, buildPaginationMeta } = require('../../../utils/pagination');
const { safeEmitSocketEvent } = require('../../../socket');

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
      truckId,
      driverId,
      tripId,
      litersPumped,
      liters,
      totalCost,
      pricePerLiter,
      fuelStation,
      fuelType,
      odometerReading,
      odometer,
      receiptMediaKey,
      receiptImageUrl,
      receiptPhotoUri,
      fueledAt,
      timestamp,
      notes,
    } = payload;

    const rawLiters = litersPumped !== undefined && litersPumped !== null && litersPumped !== ''
      ? litersPumped
      : liters;

    // 1. Telemetry input validation
    if (rawLiters === undefined || rawLiters === null || rawLiters === '') {
      const err = new Error('Fuel volume (liters) is required');
      err.statusCode = 400;
      throw err;
    }

    const numLiters = Number(rawLiters);
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
    const targetVehicle = vehicleId || truckId;
    let resolvedVehicleId = targetVehicle && typeof targetVehicle === 'string' && targetVehicle.trim().length > 0
      ? targetVehicle.trim()
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

    let vehicle = await vehiclesRepository.getVehicleById(resolvedVehicleId);
    if (!vehicle) {
      const assigned = await vehiclesRepository.findVehicleByDriverId(resolvedDriverId);
      if (assigned) {
        vehicle = assigned;
        resolvedVehicleId = assigned.id;
      } else {
        const err = new Error('Vehicle not found');
        err.statusCode = 404;
        throw err;
      }
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

    safeEmitSocketEvent('FUEL_LOGGED', {
      id: dto.id,
      vehicleId: dto.vehicleId,
      plateNumber: dto.vehicle.plateNumber,
      driverId: dto.driverId,
      driverName: dto.driver ? dto.driver.fullName : null,
      tripId: dto.tripId,
      litersPumped: dto.litersPumped,
      totalCost: dto.totalCost,
      odometerReading: validOdometer,
      fueledAt: dto.fueledAt,
      recordedAt: new Date().toISOString(),
    }, 'room:fleet');

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

  /**
   * Resolves date boundaries and preset label from input filters.
   *
   * @param {Object} query - { startDate, endDate, period }
   * @returns {{ startDate: string|null, endDate: string|null, preset: string }}
   */
  resolvePeriodDates(query = {}) {
    const { startDate, endDate, period } = query;
    const now = new Date();
    let resolvedStart = null;
    let resolvedEnd = null;
    let resolvedPreset = 'custom';

    const cleanPeriod = period ? String(period).trim().toLowerCase() : null;

    if (cleanPeriod && !startDate && !endDate) {
      resolvedPreset = cleanPeriod;
      switch (cleanPeriod) {
        case 'today': {
          const start = new Date(now);
          start.setHours(0, 0, 0, 0);
          const end = new Date(now);
          end.setHours(23, 59, 59, 999);
          resolvedStart = start.toISOString();
          resolvedEnd = end.toISOString();
          break;
        }
        case 'yesterday': {
          const start = new Date(now);
          start.setDate(start.getDate() - 1);
          start.setHours(0, 0, 0, 0);
          const end = new Date(now);
          end.setDate(end.getDate() - 1);
          end.setHours(23, 59, 59, 999);
          resolvedStart = start.toISOString();
          resolvedEnd = end.toISOString();
          break;
        }
        case 'this_week': {
          const start = new Date(now);
          const day = start.getDay();
          const diff = start.getDate() - day + (day === 0 ? -6 : 1);
          start.setDate(diff);
          start.setHours(0, 0, 0, 0);
          resolvedStart = start.toISOString();
          resolvedEnd = now.toISOString();
          break;
        }
        case 'last_week': {
          const start = new Date(now);
          const day = start.getDay();
          const diff = start.getDate() - day + (day === 0 ? -6 : 1) - 7;
          start.setDate(diff);
          start.setHours(0, 0, 0, 0);
          const end = new Date(start);
          end.setDate(end.getDate() + 6);
          end.setHours(23, 59, 59, 999);
          resolvedStart = start.toISOString();
          resolvedEnd = end.toISOString();
          break;
        }
        case 'this_month': {
          const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
          resolvedStart = start.toISOString();
          resolvedEnd = now.toISOString();
          break;
        }
        case 'last_month': {
          const start = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0);
          const end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
          resolvedStart = start.toISOString();
          resolvedEnd = end.toISOString();
          break;
        }
        case 'last_30_days': {
          const start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          resolvedStart = start.toISOString();
          resolvedEnd = now.toISOString();
          break;
        }
        case 'last_90_days': {
          const start = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
          resolvedStart = start.toISOString();
          resolvedEnd = now.toISOString();
          break;
        }
        case 'this_year': {
          const start = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
          resolvedStart = start.toISOString();
          resolvedEnd = now.toISOString();
          break;
        }
        case 'all_time': {
          resolvedStart = null;
          resolvedEnd = null;
          break;
        }
        default: {
          const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
          resolvedStart = start.toISOString();
          resolvedEnd = now.toISOString();
          resolvedPreset = 'this_month';
        }
      }
    } else if (startDate || endDate) {
      resolvedPreset = 'custom';
      if (startDate) {
        const sDate = new Date(startDate);
        if (isNaN(sDate.getTime())) {
          const err = new Error('Invalid startDate query parameter format');
          err.statusCode = 400;
          throw err;
        }
        resolvedStart = sDate.toISOString();
      }
      if (endDate) {
        const eDate = new Date(endDate);
        if (isNaN(eDate.getTime())) {
          const err = new Error('Invalid endDate query parameter format');
          err.statusCode = 400;
          throw err;
        }
        if (typeof endDate === 'string' && endDate.trim().length <= 10) {
          eDate.setHours(23, 59, 59, 999);
        }
        resolvedEnd = eDate.toISOString();
      }
    } else {
      resolvedPreset = 'this_month';
      const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
      resolvedStart = start.toISOString();
      resolvedEnd = now.toISOString();
    }

    if (resolvedStart && resolvedEnd && new Date(resolvedStart) > new Date(resolvedEnd)) {
      const err = new Error('startDate cannot be later than endDate');
      err.statusCode = 400;
      throw err;
    }

    return {
      startDate: resolvedStart,
      endDate: resolvedEnd,
      preset: resolvedPreset,
    };
  }

  /**
   * Formats raw vehicle DB row into clean API DTO with telemetry math.
   *
   * @param {Object} v - DB Row
   * @param {number|null} fleetAverageKmPerLiter
   * @returns {Object}
   */
  _formatVehicleAnalysis(v, fleetAverageKmPerLiter = null) {
    const fuelUsedLiters = Number(Number(v.total_liters || 0).toFixed(2));
    const fuelCost = Number(Number(v.total_cost || 0).toFixed(2));
    const totalEntries = parseInt(v.total_entries || 0, 10);
    const averagePricePerLiter = fuelUsedLiters > 0 ? Number((fuelCost / fuelUsedLiters).toFixed(2)) : 0.00;

    const startOdo = v.start_odometer !== null && v.start_odometer !== undefined ? Number(v.start_odometer) : null;
    const endOdo = v.end_odometer !== null && v.end_odometer !== undefined ? Number(v.end_odometer) : null;
    const distanceTraveledKm = startOdo !== null && endOdo !== null && endOdo >= startOdo ? endOdo - startOdo : 0;

    const kmPerLiter = fuelUsedLiters > 0 && distanceTraveledKm > 0
      ? Number((distanceTraveledKm / fuelUsedLiters).toFixed(2))
      : null;

    const costPerKm = distanceTraveledKm > 0 && fuelCost > 0
      ? Number((fuelCost / distanceTraveledKm).toFixed(2))
      : null;

    let efficiencyRating = 'AVERAGE';
    let varianceFromFleetAvgPercent = null;

    if (kmPerLiter !== null && fleetAverageKmPerLiter !== null && fleetAverageKmPerLiter > 0) {
      const variance = ((kmPerLiter - fleetAverageKmPerLiter) / fleetAverageKmPerLiter) * 100;
      varianceFromFleetAvgPercent = Number(variance.toFixed(2));
      if (variance >= 5) {
        efficiencyRating = 'ABOVE_AVERAGE';
      } else if (variance <= -5) {
        efficiencyRating = 'BELOW_AVERAGE';
      }
    }

    return {
      vehicleId: v.vehicle_id,
      plateNumber: v.plate_number,
      model: v.model,
      vehicleType: v.vehicle_type,
      status: v.vehicle_status,
      currentOdometer: Number(v.current_odometer || 0),
      driver: v.driver_id
        ? {
            id: v.driver_id,
            username: v.driver_username,
            fullName: [v.driver_first_name, v.driver_last_name].filter(Boolean).join(' ') || v.driver_username,
            phone: v.driver_phone || null,
          }
        : null,
      fuelUsedLiters,
      fuelCost,
      averagePricePerLiter,
      startOdometer: startOdo,
      endOdometer: endOdo,
      distanceTraveledKm,
      kmPerLiter,
      costPerKm,
      fuelEntriesCount: totalEntries,
      lastFueledAt: v.last_fueled_at || null,
      efficiencyRating,
      varianceFromFleetAvgPercent,
    };
  }

  /**
   * Computes comprehensive fleet-wide fuel analysis, vehicle breakdowns, and efficiency benchmarks.
   *
   * @param {Object} actorUser
   * @param {Object} queryParams - { startDate, endDate, period, fuelType, vehicleType, vehicleId, sortBy, order }
   * @returns {Promise<Object>} Fleet analysis DTO
   */
  async getFleetFuelAnalysis(actorUser, queryParams = {}) {
    const permissions = actorUser?.permissions || [];
    const hasGlobalView = permissions.includes('fuel.view') || permissions.includes('fleet.view') || permissions.includes('fuel.manage');

    const periodInfo = this.resolvePeriodDates(queryParams);
    const { fuelType, vehicleType, sortBy = 'fuelUsedLiters', order = 'DESC' } = queryParams;

    let targetVehicleId = queryParams.vehicleId || queryParams.truckId || null;

    // Driver Scoping: Drivers without global view are restricted to their assigned vehicle
    if (!hasGlobalView) {
      const assigned = await vehiclesRepository.findVehicleByDriverId(actorUser.id);
      if (!assigned) {
        return {
          period: periodInfo,
          fleetTotals: {
            totalFuelUsedLiters: 0,
            totalFuelCost: 0,
            averagePricePerLiter: 0,
            totalDistanceTraveledKm: 0,
            averageKmPerLiter: null,
            averageCostPerKm: null,
            totalFuelEntries: 0,
            activeVehiclesCount: 0,
            totalFleetVehiclesCount: 0,
          },
          fuelTypesBreakdown: [],
          topEfficientVehicles: [],
          leastEfficientVehicles: [],
          vehicles: [],
        };
      }
      targetVehicleId = assigned.id;
    }

    const { vehicles, fuelTypesBreakdown } = await fuelRepository.getFleetFuelAnalysis({
      startDate: periodInfo.startDate,
      endDate: periodInfo.endDate,
      fuelType,
      vehicleType,
      vehicleId: targetVehicleId,
    });

    // 1. Calculate overall fleet totals
    let totalFuelUsedLiters = 0;
    let totalFuelCost = 0;
    let totalDistanceTraveledKm = 0;
    let totalFuelEntries = 0;
    let activeVehiclesCount = 0;

    for (const v of vehicles) {
      const liters = Number(v.total_liters || 0);
      const cost = Number(v.total_cost || 0);
      const entries = parseInt(v.total_entries || 0, 10);

      const startOdo = v.start_odometer !== null && v.start_odometer !== undefined ? Number(v.start_odometer) : null;
      const endOdo = v.end_odometer !== null && v.end_odometer !== undefined ? Number(v.end_odometer) : null;
      const dist = startOdo !== null && endOdo !== null && endOdo >= startOdo ? endOdo - startOdo : 0;

      totalFuelUsedLiters += liters;
      totalFuelCost += cost;
      totalDistanceTraveledKm += dist;
      totalFuelEntries += entries;

      if (liters > 0 || dist > 0) {
        activeVehiclesCount++;
      }
    }

    const averageKmPerLiter = totalFuelUsedLiters > 0 && totalDistanceTraveledKm > 0
      ? Number((totalDistanceTraveledKm / totalFuelUsedLiters).toFixed(2))
      : null;

    const averageCostPerKm = totalDistanceTraveledKm > 0 && totalFuelCost > 0
      ? Number((totalFuelCost / totalDistanceTraveledKm).toFixed(2))
      : null;

    const averagePricePerLiter = totalFuelUsedLiters > 0
      ? Number((totalFuelCost / totalFuelUsedLiters).toFixed(2))
      : 0.00;

    // 2. Format individual vehicle metrics
    let formattedVehicles = vehicles.map(v => this._formatVehicleAnalysis(v, averageKmPerLiter));

    // 3. Apply sorting
    const isAsc = String(order).trim().toUpperCase() === 'ASC';
    formattedVehicles.sort((a, b) => {
      let valA;
      let valB;

      switch (sortBy) {
        case 'kmPerLiter':
          valA = a.kmPerLiter !== null ? a.kmPerLiter : (isAsc ? Infinity : -Infinity);
          valB = b.kmPerLiter !== null ? b.kmPerLiter : (isAsc ? Infinity : -Infinity);
          break;
        case 'fuelCost':
          valA = a.fuelCost;
          valB = b.fuelCost;
          break;
        case 'distanceTraveledKm':
          valA = a.distanceTraveledKm;
          valB = b.distanceTraveledKm;
          break;
        case 'plateNumber':
          return isAsc ? a.plateNumber.localeCompare(b.plateNumber) : b.plateNumber.localeCompare(a.plateNumber);
        case 'fuelEntriesCount':
          valA = a.fuelEntriesCount;
          valB = b.fuelEntriesCount;
          break;
        case 'fuelUsedLiters':
        default:
          valA = a.fuelUsedLiters;
          valB = b.fuelUsedLiters;
      }

      if (valA < valB) return isAsc ? -1 : 1;
      if (valA > valB) return isAsc ? 1 : -1;
      return 0;
    });

    // 4. Extract highlights (vehicles with non-null kmPerLiter)
    const ratedVehicles = formattedVehicles
      .filter(v => v.kmPerLiter !== null)
      .sort((a, b) => b.kmPerLiter - a.kmPerLiter);

    const topEfficientVehicles = ratedVehicles.slice(0, 3);
    const leastEfficientVehicles = ratedVehicles.length > 1
      ? [...ratedVehicles].reverse().slice(0, 3)
      : [];

    // 5. Format fuel types breakdown
    const formattedFuelTypes = fuelTypesBreakdown.map(ft => {
      const liters = Number(Number(ft.liters || 0).toFixed(2));
      const cost = Number(Number(ft.total_cost || 0).toFixed(2));
      return {
        fuelType: ft.fuel_type,
        liters,
        totalCost: cost,
        averagePricePerLiter: liters > 0 ? Number((cost / liters).toFixed(2)) : 0.00,
        entriesCount: parseInt(ft.entries_count || 0, 10),
      };
    });

    return {
      period: periodInfo,
      fleetTotals: {
        totalFuelUsedLiters: Number(totalFuelUsedLiters.toFixed(2)),
        totalFuelCost: Number(totalFuelCost.toFixed(2)),
        averagePricePerLiter,
        totalDistanceTraveledKm,
        averageKmPerLiter,
        averageCostPerKm,
        totalFuelEntries,
        activeVehiclesCount,
        totalFleetVehiclesCount: vehicles.length,
      },
      fuelTypesBreakdown: formattedFuelTypes,
      topEfficientVehicles,
      leastEfficientVehicles,
      vehicles: formattedVehicles,
    };
  }

  /**
   * Retrieves single vehicle detailed fuel analysis, fill-up telemetry chronology, and station breakdowns.
   *
   * @param {string} vehicleId
   * @param {Object} actorUser
   * @param {Object} queryParams - { startDate, endDate, period, fuelType }
   * @returns {Promise<Object>} Single vehicle fuel analysis DTO
   */
  async getSingleVehicleFuelAnalysis(vehicleId, actorUser, queryParams = {}) {
    if (!vehicleId || typeof vehicleId !== 'string') {
      const err = new Error('Vehicle ID is required');
      err.statusCode = 400;
      throw err;
    }

    const cleanVehicleId = vehicleId.trim();

    // 1. Verify vehicle exists
    const vehicle = await vehiclesRepository.getVehicleById(cleanVehicleId);
    if (!vehicle) {
      const err = new Error('Vehicle not found');
      err.statusCode = 404;
      throw err;
    }

    // 2. Driver Scoping Guard
    const permissions = actorUser?.permissions || [];
    const hasGlobalView = permissions.includes('fuel.view') || permissions.includes('fleet.view') || permissions.includes('fuel.manage');

    if (!hasGlobalView) {
      const assigned = await vehiclesRepository.findVehicleByDriverId(actorUser.id);
      const isAssigned = assigned && assigned.id === cleanVehicleId;
      const isDirectDriver = vehicle.driver_id === actorUser.id;

      if (!isAssigned && !isDirectDriver) {
        const err = new Error('Access denied: You are only authorized to view fuel analysis for your assigned vehicle');
        err.statusCode = 403;
        err.code = 'FORBIDDEN';
        throw err;
      }
    }

    // 3. Resolve Period Bounds
    const periodInfo = this.resolvePeriodDates(queryParams);
    const { fuelType } = queryParams;

    // 4. Retrieve single vehicle analysis data and fleet efficiency baseline
    const [analysisData, baseline] = await Promise.all([
      fuelRepository.getVehicleFuelAnalysis(cleanVehicleId, {
        startDate: periodInfo.startDate,
        endDate: periodInfo.endDate,
        fuelType,
      }),
      fuelRepository.getFleetEfficiencyBaseline({
        startDate: periodInfo.startDate,
        endDate: periodInfo.endDate,
      }),
    ]);

    if (!analysisData) {
      const err = new Error('Vehicle analysis data could not be computed');
      err.statusCode = 404;
      throw err;
    }

    // 5. Format vehicle telemetry & efficiency benchmarks
    const vehicleMetrics = this._formatVehicleAnalysis(analysisData.vehicle, baseline.averageKmPerLiter);

    // 6. Format chronological fill-up events with delta km/L
    let runningOdometer = vehicleMetrics.startOdometer;
    const chronologicalLogs = [...analysisData.fillUpLogs];

    const formattedFillUpLogs = chronologicalLogs.map(log => {
      const rawKey = log.receipt_media_key;
      const canonicalKey = rawKey ? (extractStorageKey(rawKey) || rawKey) : null;
      const receiptMediaUrl = canonicalKey ? mediaStorage.resolveMediaUrl(canonicalKey) : null;

      const liters = Number(Number(log.liters_pumped).toFixed(2));
      const cost = Number(Number(log.total_cost).toFixed(2));
      const odo = log.odometer_reading !== null ? Number(log.odometer_reading) : null;

      let distanceSinceLast = null;
      let kmPerLiter = null;
      let costPerKm = null;
      let previousOdometer = null;

      if (odo !== null && runningOdometer !== null && odo >= runningOdometer) {
        distanceSinceLast = odo - runningOdometer;
        previousOdometer = runningOdometer;

        if (liters > 0 && distanceSinceLast > 0) {
          kmPerLiter = Number((distanceSinceLast / liters).toFixed(2));
        }
        if (cost > 0 && distanceSinceLast > 0) {
          costPerKm = Number((cost / distanceSinceLast).toFixed(2));
        }
      }

      if (odo !== null) {
        runningOdometer = odo;
      }

      return {
        id: log.id,
        fueledAt: log.fueled_at,
        litersPumped: liters,
        totalCost: cost,
        pricePerLiter: Number(log.price_per_liter),
        fuelStation: log.fuel_station,
        fuelType: log.fuel_type,
        odometerReading: odo,
        previousOdometerReading: previousOdometer,
        distanceSinceLastFuelKm: distanceSinceLast,
        kmPerLiter,
        costPerKm,
        notes: log.notes,
        driver: log.driver_id
          ? {
              id: log.driver_id,
              username: log.driver_username,
              fullName: [log.driver_first_name, log.driver_last_name].filter(Boolean).join(' ') || log.driver_username,
              phone: log.driver_phone,
            }
          : null,
        tripNumber: log.trip_number || null,
        receiptMediaKey: canonicalKey,
        receiptMediaUrl,
      };
    });

    // Reverse fill-up logs to present most recent fueling first
    formattedFillUpLogs.reverse();

    // 7. Format breakdowns
    const fuelTypesBreakdown = analysisData.fuelTypesBreakdown.map(ft => {
      const liters = Number(Number(ft.liters || 0).toFixed(2));
      const cost = Number(Number(ft.total_cost || 0).toFixed(2));
      return {
        fuelType: ft.fuel_type,
        liters,
        totalCost: cost,
        averagePricePerLiter: liters > 0 ? Number((cost / liters).toFixed(2)) : 0.00,
        entriesCount: parseInt(ft.entries_count || 0, 10),
      };
    });

    const fuelStationsBreakdown = analysisData.fuelStationsBreakdown.map(st => {
      const liters = Number(Number(st.liters || 0).toFixed(2));
      const cost = Number(Number(st.total_cost || 0).toFixed(2));
      return {
        station: st.station,
        liters,
        totalCost: cost,
        averagePricePerLiter: liters > 0 ? Number((cost / liters).toFixed(2)) : 0.00,
        entriesCount: parseInt(st.entries_count || 0, 10),
      };
    });

    return {
      vehicle: {
        id: vehicle.id,
        plateNumber: vehicle.plate_number,
        model: vehicle.model,
        yearModel: vehicle.year_model,
        vehicleType: vehicle.vehicle_type,
        status: vehicle.status,
        currentOdometer: Number(vehicle.current_odometer || 0),
        lastPmOdometer: Number(vehicle.last_pm_odometer || 0),
        driver: vehicleMetrics.driver,
      },
      period: periodInfo,
      metrics: {
        fuelUsedLiters: vehicleMetrics.fuelUsedLiters,
        totalFuelCost: vehicleMetrics.fuelCost,
        averagePricePerLiter: vehicleMetrics.averagePricePerLiter,
        startOdometer: vehicleMetrics.startOdometer,
        endOdometer: vehicleMetrics.endOdometer,
        distanceTraveledKm: vehicleMetrics.distanceTraveledKm,
        kmPerLiter: vehicleMetrics.kmPerLiter,
        costPerKm: vehicleMetrics.costPerKm,
        totalFuelEntries: vehicleMetrics.fuelEntriesCount,
        lastFueledAt: vehicleMetrics.lastFueledAt,
        fleetAverageKmPerLiter: baseline.averageKmPerLiter,
        efficiencyRating: vehicleMetrics.efficiencyRating,
        varianceFromFleetAvgPercent: vehicleMetrics.varianceFromFleetAvgPercent,
      },
      fuelTypesBreakdown,
      fuelStationsBreakdown,
      fillUpLogs: formattedFillUpLogs,
    };
  }
}

module.exports = new FuelService();

