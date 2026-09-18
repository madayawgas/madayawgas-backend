const { query, pool } = require('../../../../database/connection');

/**
 * Maintenance Repository
 * Data access layer for vehicle odometer logging, truck mileage tracking,
 * and preventive maintenance status queries.
 */
class MaintenanceRepository {
  /**
   * Inserts an odometer log entry into vehicle_odometer_logs.
   * Supports execution within an optional transaction client.
   * @param {Object} data - { truckId, odometerReading, loggedBy, source, notes }
   * @param {Object} [client] - Optional pg transaction client
   * @returns {Promise<Object>} Created odometer log row
   */
  async insertOdometerLog({ truckId, odometerReading, loggedBy, source, notes }, client = null) {
    const db = client || { query };
    const sql = `
      INSERT INTO vehicle_odometer_logs (
        truck_id,
        odometer_reading,
        logged_by,
        source,
        notes,
        logged_at
      )
      VALUES ($1, $2, $3, $4, $5, NOW())
      RETURNING 
        id,
        truck_id,
        odometer_reading,
        logged_by,
        source,
        notes,
        logged_at
    `;

    const result = await db.query(sql, [
      truckId,
      odometerReading,
      loggedBy || null,
      source || 'POST_DISPATCH_RETURN',
      notes || null,
    ]);

    return result.rows[0];
  }

  /**
   * Updates a truck's current registered odometer.
   * @param {Object} params - { truckId, currentOdometer }
   * @param {Object} [client] - Optional pg transaction client
   * @returns {Promise<Object>} Updated truck row
   */
  async updateTruckOdometer({ truckId, currentOdometer }, client = null) {
    const db = client || { query };
    const sql = `
      UPDATE trucks
      SET 
        current_odometer = $1,
        updated_at = NOW()
      WHERE id = $2
      RETURNING 
        id,
        plate_number,
        model,
        year_model,
        current_odometer,
        last_pm_odometer,
        status,
        updated_at
    `;

    const result = await db.query(sql, [currentOdometer, truckId]);
    return result.rows[0] || null;
  }

  /**
   * Fetches current odometer and PM baseline state for a given truck.
   * @param {string} truckId - Truck UUID
   * @param {Object} [client] - Optional pg transaction client
   * @returns {Promise<Object|null>} Truck state or null if not found
   */
  async getTruckOdometerState(truckId, client = null) {
    const db = client || { query };
    const sql = `
      SELECT 
        t.id,
        t.plate_number,
        t.model,
        t.year_model,
        t.current_odometer,
        t.last_pm_odometer,
        t.status,
        t.driver_id,
        u.first_name AS driver_first_name,
        u.last_name AS driver_last_name
      FROM trucks t
      LEFT JOIN users u ON t.driver_id = u.id
      WHERE t.id = $1
    `;

    const result = await db.query(sql, [truckId]);
    return result.rows[0] || null;
  }

  /**
   * Retrieves paginated odometer history logs for a specific truck.
   * @param {string} truckId - Truck UUID
   * @param {Object} pagination - { limit, offset }
   * @returns {Promise<Array<Object>>} Array of odometer log records
   */
  async getOdometerHistory(truckId, { limit = 50, offset = 0 } = {}) {
    const sql = `
      SELECT 
        vol.id,
        vol.truck_id,
        vol.odometer_reading,
        vol.logged_by,
        vol.source,
        vol.notes,
        vol.logged_at,
        u.username AS logged_by_username,
        u.first_name AS logged_by_first_name,
        u.last_name AS logged_by_last_name
      FROM vehicle_odometer_logs vol
      LEFT JOIN users u ON vol.logged_by = u.id
      WHERE vol.truck_id = $1
      ORDER BY vol.logged_at DESC
      LIMIT $2 OFFSET $3
    `;

    const result = await query(sql, [truckId, limit, offset]);
    return result.rows;
  }

  /**
   * Counts total odometer logs recorded for a specific truck.
   * @param {string} truckId - Truck UUID
   * @returns {Promise<number>} Total count of logs
   */
  async countOdometerLogs(truckId) {
    const sql = `
      SELECT COUNT(*)::int AS count
      FROM vehicle_odometer_logs
      WHERE truck_id = $1
    `;

    const result = await query(sql, [truckId]);
    return result.rows[0]?.count || 0;
  }

  /**
   * Retrieves fleet trucks with calculated preventive maintenance (PM) health status.
   * Calculates distance since last PM service and flags vehicles due for 5,000-km maintenance.
   * @param {Object} [filters] - Optional filters: { status, search, isPmDue }
   * @returns {Promise<Array<Object>>} Array of trucks with PM calculations
   */
  async getFleetPmStatusOverview(filters = {}) {
    const { status, search, isPmDue } = filters;
    const conditions = [];
    const params = [];
    let paramIndex = 1;

    if (status) {
      conditions.push(`t.status = $${paramIndex++}`);
      params.push(status.toUpperCase());
    }

    if (search) {
      conditions.push(`(t.plate_number ILIKE $${paramIndex} OR t.model ILIKE $${paramIndex})`);
      params.push(`%${search}%`);
      paramIndex++;
    }

    if (isPmDue !== undefined && isPmDue !== null && isPmDue !== '') {
      const pmBool = isPmDue === true || isPmDue === 'true';
      if (pmBool) {
        conditions.push(`(t.current_odometer - t.last_pm_odometer) >= 5000`);
      } else {
        conditions.push(`(t.current_odometer - t.last_pm_odometer) < 5000`);
      }
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const sql = `
      SELECT 
        t.id,
        t.plate_number,
        t.model,
        t.year_model,
        t.status,
        t.current_odometer,
        t.last_pm_odometer,
        (t.current_odometer - t.last_pm_odometer) AS distance_since_pm,
        CASE 
          WHEN (t.current_odometer - t.last_pm_odometer) >= 5000 THEN TRUE 
          ELSE FALSE 
        END AS is_pm_due,
        GREATEST(0, 5000 - (t.current_odometer - t.last_pm_odometer)) AS remaining_km_before_pm,
        t.driver_id,
        u.first_name AS driver_first_name,
        u.last_name AS driver_last_name,
        t.created_at,
        t.updated_at
      FROM trucks t
      LEFT JOIN users u ON t.driver_id = u.id
      ${whereClause}
      ORDER BY 
        (t.current_odometer - t.last_pm_odometer) DESC,
        t.plate_number ASC
    `;

    const result = await query(sql, params);
    return result.rows;
  }
}

module.exports = new MaintenanceRepository();
