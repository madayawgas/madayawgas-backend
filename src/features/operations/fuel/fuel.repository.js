const { query, pool } = require('../../../../database/connection');

/**
 * Vehicle Fuel Logs Repository
 * Pure SQL data access layer for fuel volume intake, direct expenditures, and fleet telemetry.
 */
class FuelRepository {
  /**
   * Inserts a new vehicle fuel intake record.
   * Supports optional external transaction client.
   *
   * @param {Object} data
   * @param {Object|null} client - Optional pg transaction client
   * @returns {Promise<Object>} Created row
   */
  async createFuelLog(
    {
      vehicleId,
      driverId,
      tripId,
      recordedBy,
      litersPumped,
      totalCost,
      pricePerLiter,
      fuelStation,
      fuelType,
      odometerReading,
      receiptMediaKey,
      fueledAt,
      notes,
    },
    client = null
  ) {
    const db = client || { query };
    const sql = `
      INSERT INTO vehicle_fuel_logs (
        vehicle_id,
        driver_id,
        trip_id,
        recorded_by,
        liters_pumped,
        total_cost,
        price_per_liter,
        fuel_station,
        fuel_type,
        odometer_reading,
        receipt_media_key,
        fueled_at,
        notes
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, COALESCE($9, 'DIESEL'), $10, $11, COALESCE($12, NOW()), $13)
      RETURNING *;
    `;

    const result = await db.query(sql, [
      vehicleId,
      driverId || null,
      tripId || null,
      recordedBy,
      litersPumped,
      totalCost,
      pricePerLiter,
      fuelStation || null,
      fuelType || 'DIESEL',
      odometerReading !== undefined && odometerReading !== null ? odometerReading : null,
      receiptMediaKey || null,
      fueledAt || null,
      notes || null,
    ]);

    return result.rows[0];
  }

  /**
   * Retrieves single fuel log by UUID with joins.
   * @param {string} id - Fuel Log UUID
   * @returns {Promise<Object|null>}
   */
  async getFuelLogById(id) {
    const sql = `
      SELECT 
        f.id,
        f.vehicle_id,
        f.driver_id,
        f.trip_id,
        f.recorded_by,
        f.liters_pumped,
        f.total_cost,
        f.price_per_liter,
        f.fuel_station,
        f.fuel_type,
        f.odometer_reading,
        f.receipt_media_key,
        f.fueled_at,
        f.notes,
        f.created_at,
        f.updated_at,
        v.plate_number AS vehicle_plate_number,
        v.model AS vehicle_model,
        v.vehicle_type,
        d.username AS driver_username,
        d.first_name AS driver_first_name,
        d.last_name AS driver_last_name,
        d.phone AS driver_phone,
        rb.username AS recorded_by_username,
        t.trip_number
      FROM vehicle_fuel_logs f
      JOIN vehicles v ON f.vehicle_id = v.id
      LEFT JOIN users d ON f.driver_id = d.id
      LEFT JOIN users rb ON f.recorded_by = rb.id
      LEFT JOIN trips t ON f.trip_id = t.id
      WHERE f.id = $1;
    `;

    const result = await query(sql, [id]);
    return result.rows[0] || null;
  }

  /**
   * Builds SQL WHERE condition and params array for fuel filtering.
   */
  _buildWhereClause(filters = {}) {
    const { vehicleId, driverId, tripId, fuelType, startDate, endDate, search } = filters;
    const conditions = [];
    const params = [];
    let paramIndex = 1;

    if (vehicleId) {
      conditions.push(`f.vehicle_id = $${paramIndex++}`);
      params.push(vehicleId);
    }

    if (driverId) {
      conditions.push(`f.driver_id = $${paramIndex++}`);
      params.push(driverId);
    }

    if (tripId) {
      conditions.push(`f.trip_id = $${paramIndex++}`);
      params.push(tripId);
    }

    if (fuelType) {
      conditions.push(`f.fuel_type = $${paramIndex++}`);
      params.push(fuelType.toUpperCase());
    }

    if (startDate) {
      conditions.push(`f.fueled_at >= $${paramIndex++}`);
      params.push(startDate);
    }

    if (endDate) {
      conditions.push(`f.fueled_at <= $${paramIndex++}`);
      params.push(endDate);
    }

    if (search && typeof search === 'string' && search.trim() !== '') {
      conditions.push(
        `(f.fuel_station ILIKE $${paramIndex} OR v.plate_number ILIKE $${paramIndex} OR d.first_name ILIKE $${paramIndex} OR d.last_name ILIKE $${paramIndex})`
      );
      params.push(`%${search.trim()}%`);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    return { whereClause, params };
  }

  /**
   * Computes aggregate summary metrics (total liters, total cost, average price/L) for filtered records.
   * @param {Object} filters
   * @returns {Promise<Object>}
   */
  async getFuelSummary(filters = {}) {
    const { whereClause, params } = this._buildWhereClause(filters);

    const sql = `
      SELECT 
        COALESCE(SUM(f.liters_pumped), 0) AS total_liters,
        COALESCE(SUM(f.total_cost), 0) AS total_cost,
        COUNT(f.id) AS total_entries
      FROM vehicle_fuel_logs f
      JOIN vehicles v ON f.vehicle_id = v.id
      LEFT JOIN users d ON f.driver_id = d.id
      ${whereClause}
    `;

    const result = await query(sql, params);
    const row = result.rows[0];

    const totalLiters = Number(row.total_liters || 0);
    const totalCost = Number(row.total_cost || 0);
    const totalEntries = parseInt(row.total_entries || 0, 10);
    const averagePricePerLiter = totalLiters > 0 ? Number((totalCost / totalLiters).toFixed(2)) : 0.00;

    return {
      totalLiters: Number(totalLiters.toFixed(2)),
      totalCost: Number(totalCost.toFixed(2)),
      averagePricePerLiter,
      totalEntries,
    };
  }

  /**
   * Retrieves paginated fuel logs with filtering.
   * @param {Object} filters
   * @param {Object|null} pagination
   */
  async getFuelLogs(filters = {}, pagination = null) {
    const { whereClause, params } = this._buildWhereClause(filters);

    const baseSql = `
      FROM vehicle_fuel_logs f
      JOIN vehicles v ON f.vehicle_id = v.id
      LEFT JOIN users d ON f.driver_id = d.id
      LEFT JOIN users rb ON f.recorded_by = rb.id
      LEFT JOIN trips t ON f.trip_id = t.id
      ${whereClause}
    `;

    const selectSql = `
      SELECT 
        f.id,
        f.vehicle_id,
        f.driver_id,
        f.trip_id,
        f.recorded_by,
        f.liters_pumped,
        f.total_cost,
        f.price_per_liter,
        f.fuel_station,
        f.fuel_type,
        f.odometer_reading,
        f.receipt_media_key,
        f.fueled_at,
        f.notes,
        f.created_at,
        f.updated_at,
        v.plate_number AS vehicle_plate_number,
        v.model AS vehicle_model,
        v.vehicle_type,
        d.username AS driver_username,
        d.first_name AS driver_first_name,
        d.last_name AS driver_last_name,
        d.phone AS driver_phone,
        rb.username AS recorded_by_username,
        t.trip_number
      ${baseSql}
      ORDER BY f.fueled_at DESC
    `;

    if (!pagination || !pagination.isPaginated) {
      const result = await query(selectSql, params);
      return result.rows;
    }

    const limit = pagination.limit || 20;
    const offset = pagination.offset || 0;

    const dataSql = `${selectSql} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    const countSql = `SELECT COUNT(*) AS total ${baseSql}`;

    const [dataResult, countResult] = await Promise.all([
      query(dataSql, [...params, limit, offset]),
      query(countSql, params),
    ]);

    return {
      rows: dataResult.rows,
      total: parseInt(countResult.rows[0].total, 10),
    };
  }

  /**
   * Retrieves fleet-wide fuel analysis, vehicle metrics, and distance telemetry for a time window.
   *
   * @param {Object} options
   * @param {string|null} options.startDate - ISO string
   * @param {string|null} options.endDate - ISO string
   * @param {string|null} options.fuelType - Optional fuel type filter
   * @param {string|null} options.vehicleType - Optional vehicle classification filter
   * @param {string|null} options.vehicleId - Optional single vehicle scoping filter
   * @returns {Promise<Object>} { vehicles: Array, fuelTypesBreakdown: Array }
   */
  async getFleetFuelAnalysis({ startDate = null, endDate = null, fuelType = null, vehicleType = null, vehicleId = null } = {}) {
    const params = [];
    let paramIndex = 1;

    let startParam = null;
    let endParam = null;
    let fuelTypeParam = null;
    let vehicleTypeParam = null;
    let vehicleIdParam = null;

    if (startDate) {
      params.push(startDate);
      startParam = `$${paramIndex++}`;
    }
    if (endDate) {
      params.push(endDate);
      endParam = `$${paramIndex++}`;
    }
    if (fuelType) {
      params.push(fuelType.toUpperCase());
      fuelTypeParam = `$${paramIndex++}`;
    }
    if (vehicleType) {
      params.push(vehicleType.toUpperCase());
      vehicleTypeParam = `$${paramIndex++}`;
    }
    if (vehicleId) {
      params.push(vehicleId);
      vehicleIdParam = `$${paramIndex++}`;
    }

    const fuelWhereConditions = [];
    if (startParam) fuelWhereConditions.push(`f.fueled_at >= ${startParam}`);
    if (endParam) fuelWhereConditions.push(`f.fueled_at <= ${endParam}`);
    if (fuelTypeParam) fuelWhereConditions.push(`f.fuel_type = ${fuelTypeParam}`);
    if (vehicleIdParam) fuelWhereConditions.push(`f.vehicle_id = ${vehicleIdParam}`);

    const fuelWhereClause = fuelWhereConditions.length > 0 ? `WHERE ${fuelWhereConditions.join(' AND ')}` : '';

    const vehicleWhereConditions = ["v.status != 'RETIRED'"];
    if (vehicleTypeParam) vehicleWhereConditions.push(`v.vehicle_type = ${vehicleTypeParam}`);
    if (vehicleIdParam) vehicleWhereConditions.push(`v.id = ${vehicleIdParam}`);
    const vehicleWhereClause = `WHERE ${vehicleWhereConditions.join(' AND ')}`;

    const sql = `
      WITH odo_union AS (
        SELECT vehicle_id, odometer_reading, logged_at
        FROM vehicle_odometer_logs
        WHERE odometer_reading IS NOT NULL
        UNION ALL
        SELECT vehicle_id, odometer_reading, fueled_at AS logged_at
        FROM vehicle_fuel_logs
        WHERE odometer_reading IS NOT NULL
      ),
      fuel_stats AS (
        SELECT 
          f.vehicle_id,
          COALESCE(SUM(f.liters_pumped), 0) AS total_liters,
          COALESCE(SUM(f.total_cost), 0) AS total_cost,
          COUNT(f.id) AS total_entries,
          MAX(f.fueled_at) AS last_fueled_at
        FROM vehicle_fuel_logs f
        ${fuelWhereClause}
        GROUP BY f.vehicle_id
      )
      SELECT 
        v.id AS vehicle_id,
        v.plate_number,
        v.model,
        v.year_model,
        v.vehicle_type,
        v.status AS vehicle_status,
        v.current_odometer,
        v.last_pm_odometer,
        d.id AS driver_id,
        d.username AS driver_username,
        d.first_name AS driver_first_name,
        d.last_name AS driver_last_name,
        d.phone AS driver_phone,
        COALESCE(fs.total_liters, 0) AS total_liters,
        COALESCE(fs.total_cost, 0) AS total_cost,
        COALESCE(fs.total_entries, 0) AS total_entries,
        fs.last_fueled_at,
        ${
          startParam
            ? `COALESCE(
                 (SELECT u.odometer_reading FROM odo_union u WHERE u.vehicle_id = v.id AND u.logged_at <= ${startParam} ORDER BY u.logged_at DESC, u.odometer_reading DESC LIMIT 1),
                 (SELECT u.odometer_reading FROM odo_union u WHERE u.vehicle_id = v.id AND u.logged_at >= ${startParam} AND (${endParam ? `u.logged_at <= ${endParam}` : 'TRUE'}) ORDER BY u.logged_at ASC, u.odometer_reading ASC LIMIT 1)
               )`
            : `(SELECT u.odometer_reading FROM odo_union u WHERE u.vehicle_id = v.id ORDER BY u.logged_at ASC, u.odometer_reading ASC LIMIT 1)`
        } AS start_odometer,
        ${
          endParam
            ? `COALESCE(
                 (SELECT u.odometer_reading FROM odo_union u WHERE u.vehicle_id = v.id AND u.logged_at <= ${endParam} ORDER BY u.logged_at DESC, u.odometer_reading DESC LIMIT 1),
                 v.current_odometer
               )`
            : `COALESCE(
                 (SELECT u.odometer_reading FROM odo_union u WHERE u.vehicle_id = v.id ORDER BY u.logged_at DESC, u.odometer_reading DESC LIMIT 1),
                 v.current_odometer
               )`
        } AS end_odometer
      FROM vehicles v
      LEFT JOIN users d ON v.driver_id = d.id
      LEFT JOIN fuel_stats fs ON v.id = fs.vehicle_id
      ${vehicleWhereClause}
      ORDER BY total_liters DESC, v.plate_number ASC;
    `;

    // Query fuel types breakdown
    const fuelTypesSql = `
      SELECT 
        f.fuel_type,
        COALESCE(SUM(f.liters_pumped), 0) AS liters,
        COALESCE(SUM(f.total_cost), 0) AS total_cost,
        COUNT(f.id) AS entries_count
      FROM vehicle_fuel_logs f
      JOIN vehicles v ON f.vehicle_id = v.id
      ${fuelWhereClause}
      GROUP BY f.fuel_type
      ORDER BY liters DESC;
    `;

    const [vehiclesResult, fuelTypesResult] = await Promise.all([
      query(sql, params),
      query(fuelTypesSql, params),
    ]);

    return {
      vehicles: vehiclesResult.rows,
      fuelTypesBreakdown: fuelTypesResult.rows,
    };
  }

  /**
   * Retrieves single vehicle fuel telemetry, period metrics, station breakdown, and fill-up logs.
   *
   * @param {string} vehicleId
   * @param {Object} options
   * @param {string|null} options.startDate
   * @param {string|null} options.endDate
   * @param {string|null} options.fuelType
   * @returns {Promise<Object|null>}
   */
  async getVehicleFuelAnalysis(vehicleId, { startDate = null, endDate = null, fuelType = null } = {}) {
    // 1. Get fleet-wide entry for this vehicle
    const { vehicles, fuelTypesBreakdown } = await this.getFleetFuelAnalysis({
      startDate,
      endDate,
      fuelType,
      vehicleId,
    });

    if (!vehicles || vehicles.length === 0) {
      return null;
    }

    const vehicleRow = vehicles[0];

    // 2. Query fuel stations breakdown for this vehicle
    const params = [vehicleId];
    let paramIndex = 2;
    const stationConditions = ['f.vehicle_id = $1'];

    if (startDate) {
      stationConditions.push(`f.fueled_at >= $${paramIndex++}`);
      params.push(startDate);
    }
    if (endDate) {
      stationConditions.push(`f.fueled_at <= $${paramIndex++}`);
      params.push(endDate);
    }
    if (fuelType) {
      stationConditions.push(`f.fuel_type = $${paramIndex++}`);
      params.push(fuelType.toUpperCase());
    }

    const stationWhere = `WHERE ${stationConditions.join(' AND ')}`;

    const stationSql = `
      SELECT 
        COALESCE(f.fuel_station, 'Unspecified Station') AS station,
        COALESCE(SUM(f.liters_pumped), 0) AS liters,
        COALESCE(SUM(f.total_cost), 0) AS total_cost,
        COUNT(f.id) AS entries_count
      FROM vehicle_fuel_logs f
      ${stationWhere}
      GROUP BY COALESCE(f.fuel_station, 'Unspecified Station')
      ORDER BY liters DESC;
    `;

    // 3. Query chronological fill-up entries in the period
    const logsSql = `
      SELECT 
        f.id,
        f.vehicle_id,
        f.driver_id,
        f.trip_id,
        f.liters_pumped,
        f.total_cost,
        f.price_per_liter,
        f.fuel_station,
        f.fuel_type,
        f.odometer_reading,
        f.receipt_media_key,
        f.fueled_at,
        f.notes,
        d.username AS driver_username,
        d.first_name AS driver_first_name,
        d.last_name AS driver_last_name,
        d.phone AS driver_phone,
        t.trip_number
      FROM vehicle_fuel_logs f
      LEFT JOIN users d ON f.driver_id = d.id
      LEFT JOIN trips t ON f.trip_id = t.id
      ${stationWhere}
      ORDER BY f.fueled_at ASC, f.created_at ASC;
    `;

    const [stationsResult, logsResult] = await Promise.all([
      query(stationSql, params),
      query(logsSql, params),
    ]);

    return {
      vehicle: vehicleRow,
      fuelTypesBreakdown,
      fuelStationsBreakdown: stationsResult.rows,
      fillUpLogs: logsResult.rows,
    };
  }

  /**
   * Retrieves overall fleet average km/L across all vehicles for benchmarking.
   *
   * @param {Object} options
   * @param {string|null} options.startDate
   * @param {string|null} options.endDate
   * @returns {Promise<{ averageKmPerLiter: number|null, totalDistanceKm: number, totalLiters: number }>}
   */
  async getFleetEfficiencyBaseline({ startDate = null, endDate = null } = {}) {
    const { vehicles } = await this.getFleetFuelAnalysis({ startDate, endDate });

    let totalLiters = 0;
    let totalDistanceKm = 0;

    for (const v of vehicles) {
      const liters = Number(v.total_liters || 0);
      const startOdo = v.start_odometer !== null ? Number(v.start_odometer) : null;
      const endOdo = v.end_odometer !== null ? Number(v.end_odometer) : null;
      const distance = startOdo !== null && endOdo !== null && endOdo >= startOdo ? endOdo - startOdo : 0;

      totalLiters += liters;
      totalDistanceKm += distance;
    }

    const averageKmPerLiter = totalLiters > 0 && totalDistanceKm > 0
      ? Number((totalDistanceKm / totalLiters).toFixed(2))
      : null;

    return {
      averageKmPerLiter,
      totalDistanceKm,
      totalLiters: Number(totalLiters.toFixed(2)),
    };
  }
}

module.exports = new FuelRepository();

