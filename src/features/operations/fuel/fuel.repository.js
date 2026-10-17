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
}

module.exports = new FuelRepository();
