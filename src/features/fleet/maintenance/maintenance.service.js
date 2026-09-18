const { pool } = require('../../../../database/connection');
const maintenanceRepository = require('./maintenance.repository');
const { historyService, EVENTS } = require('../../../features/history');

/**
 * Maintenance Service
 * Implements business logic for post-dispatch single-point odometer recording,
 * monotonic validation, 5,000-km preventive maintenance threshold evaluations,
 * and centralized audit event emissions.
 */
class MaintenanceService {
  /**
   * Records a single-point post-dispatch return odometer reading for a vehicle asset.
   * Enforces monotonic consistency (reading >= current_odometer) and updates running status.
   * Calculates distance driven this trip and distance accumulated toward 5,000-km PM threshold.
   *
   * @param {Object} actorUser - Authenticated user issuing the request (Logistics Supervisor or Admin)
   * @param {Object} payload - { truckId, odometerReading, source, notes }
   * @returns {Promise<Object>} Processed odometer update and PM status metadata
   */
  async logOdometerReading(actorUser, payload = {}) {
    const { truckId, odometerReading, source, notes } = payload;

    // 1. Validation: Required fields
    if (!truckId || typeof truckId !== 'string' || truckId.trim().length === 0) {
      const err = new Error('Truck ID is required');
      err.statusCode = 400;
      throw err;
    }

    if (odometerReading === undefined || odometerReading === null || odometerReading === '') {
      const err = new Error('Odometer reading is required');
      err.statusCode = 400;
      throw err;
    }

    const numOdometer = Number(odometerReading);
    if (isNaN(numOdometer) || !Number.isInteger(numOdometer) || numOdometer < 0) {
      const err = new Error('Odometer reading must be a non-negative integer');
      err.statusCode = 400;
      throw err;
    }

    // 2. Fetch existing truck state
    const truck = await maintenanceRepository.getTruckOdometerState(truckId.trim());
    if (!truck) {
      const err = new Error('Vehicle not found');
      err.statusCode = 404;
      throw err;
    }

    // 3. Monotonic Integrity Rule: New reading MUST be >= current registered reading
    if (numOdometer < truck.current_odometer) {
      const err = new Error(
        `New odometer reading (${numOdometer} km) cannot be less than the current odometer reading (${truck.current_odometer} km).`
      );
      err.statusCode = 400;
      throw err;
    }

    // 4. Distance-Based 5,000-km PM Math & Threshold Evaluation
    const previousOdometer = truck.current_odometer;
    const distanceDrivenThisTrip = numOdometer - previousOdometer;
    const distanceSinceLastPm = numOdometer - truck.last_pm_odometer;
    const isPmDue = distanceSinceLastPm >= 5000;
    const remainingKmBeforePm = Math.max(0, 5000 - distanceSinceLastPm);

    const logSource = source && typeof source === 'string' && source.trim().length > 0
      ? source.trim().toUpperCase()
      : 'POST_DISPATCH_RETURN';

    const logNotes = notes && typeof notes === 'string' ? notes.trim() : null;

    // 5. Transaction Execution (Insert Log + Update Truck Current Odometer)
    const client = await pool.connect();
    let createdLog;

    try {
      await client.query('BEGIN');

      createdLog = await maintenanceRepository.insertOdometerLog(
        {
          truckId: truck.id,
          odometerReading: numOdometer,
          loggedBy: actorUser?.id || null,
          source: logSource,
          notes: logNotes,
        },
        client
      );

      await maintenanceRepository.updateTruckOdometer(
        {
          truckId: truck.id,
          currentOdometer: numOdometer,
        },
        client
      );

      await client.query('COMMIT');
    } catch (txError) {
      await client.query('ROLLBACK');
      throw txError;
    } finally {
      client.release();
    }

    // 6. Centralized Event History Logging
    await historyService.log(EVENTS.MAINTENANCE_ODOMETER_LOGGED, {
      actorUser,
      targetId: truck.id,
      payload: {
        plateNumber: truck.plate_number,
        odometerKm: numOdometer,
      },
      metadata: {
        previousOdometer,
        distanceDrivenThisTrip,
        distanceSinceLastPm,
        isPmDue,
        remainingKmBeforePm,
        source: logSource,
      },
    });

    // 7. Return Standardized DTO
    return {
      logId: createdLog.id,
      truckId: truck.id,
      plateNumber: truck.plate_number,
      currentOdometer: numOdometer,
      previousOdometer,
      distanceDrivenThisTrip,
      lastPmOdometer: truck.last_pm_odometer,
      distanceSinceLastPm,
      isPmDue,
      remainingKmBeforePm,
      loggedAt: createdLog.logged_at,
    };
  }

  /**
   * Retrieves paginated odometer history logs for a specific vehicle.
   *
   * @param {string} truckId - Truck UUID
   * @param {Object} [queryParams] - { page, limit }
   * @returns {Promise<Object>} Paginated logs with vehicle metadata
   */
  async getTruckOdometerHistory(truckId, queryParams = {}) {
    if (!truckId || typeof truckId !== 'string' || truckId.trim().length === 0) {
      const err = new Error('Truck ID is required');
      err.statusCode = 400;
      throw err;
    }

    const truck = await maintenanceRepository.getTruckOdometerState(truckId.trim());
    if (!truck) {
      const err = new Error('Vehicle not found');
      err.statusCode = 404;
      throw err;
    }

    const page = Math.max(1, parseInt(queryParams.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(queryParams.limit, 10) || 50));
    const offset = (page - 1) * limit;

    const [logs, total] = await Promise.all([
      maintenanceRepository.getOdometerHistory(truck.id, { limit, offset }),
      maintenanceRepository.countOdometerLogs(truck.id),
    ]);

    return {
      truckId: truck.id,
      plateNumber: truck.plate_number,
      model: truck.model,
      currentOdometer: truck.current_odometer,
      lastPmOdometer: truck.last_pm_odometer,
      count: logs.length,
      total,
      page,
      limit,
      logs: logs.map((row) => ({
        id: row.id,
        truckId: row.truck_id,
        odometerReading: row.odometer_reading,
        loggedBy: row.logged_by,
        loggedByName:
          [row.logged_by_first_name, row.logged_by_last_name].filter(Boolean).join(' ') ||
          row.logged_by_username ||
          'System',
        source: row.source,
        notes: row.notes,
        loggedAt: row.logged_at,
      })),
    };
  }

  /**
   * Aggregates fleet-wide preventive maintenance overview and threshold metrics.
   *
   * @param {Object} [queryParams] - { status, search, isPmDue }
   * @returns {Promise<Object>} Aggregated overview and truck array
   */
  async getFleetPmOverview(queryParams = {}) {
    const rows = await maintenanceRepository.getFleetPmStatusOverview(queryParams);

    const trucks = rows.map((r) => ({
      id: r.id,
      plateNumber: r.plate_number,
      model: r.model,
      yearModel: r.year_model,
      status: r.status,
      driverId: r.driver_id,
      driverName: [r.driver_first_name, r.driver_last_name].filter(Boolean).join(' ') || null,
      currentOdometer: r.current_odometer,
      lastPmOdometer: r.last_pm_odometer,
      distanceSinceLastPm: Number(r.distance_since_pm),
      isPmDue: Boolean(r.is_pm_due),
      remainingKmBeforePm: Number(r.remaining_km_before_pm),
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));

    const totalCount = trucks.length;
    const pmDueCount = trucks.filter((t) => t.isPmDue).length;
    const operationalCount = trucks.filter((t) => t.status === 'ACTIVE').length;
    const operationalPmDueCount = trucks.filter((t) => t.status === 'ACTIVE' && t.isPmDue).length;

    return {
      count: totalCount,
      summary: {
        totalVehicles: totalCount,
        operationalVehicles: operationalCount,
        pmDueTotal: pmDueCount,
        operationalPmDue: operationalPmDueCount,
      },
      trucks,
    };
  }
}

module.exports = new MaintenanceService();
