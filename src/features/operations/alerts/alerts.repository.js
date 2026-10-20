const { query } = require('../../../../database/connection');

/**
 * Driver Emergency Alerts Repository
 * Pure SQL data access layer for one-action SOS distress dispatches and operational resolution.
 */
class AlertsRepository {
  /**
   * Inserts an emergency alert record.
   * @param {Object} data
   * @returns {Promise<Object>} Created row
   */
  async createAlert({
    driverId,
    vehicleId,
    tripId,
    latitude,
    longitude,
    emergencyType,
    description,
  }) {
    const sql = `
      INSERT INTO emergency_alerts (
        driver_id,
        vehicle_id,
        trip_id,
        latitude,
        longitude,
        emergency_type,
        description,
        status
      )
      VALUES ($1, $2, $3, $4, $5, COALESCE($6, 'GENERAL'), $7, 'ACTIVE')
      RETURNING *;
    `;

    const result = await query(sql, [
      driverId,
      vehicleId || null,
      tripId || null,
      latitude !== undefined && latitude !== null ? latitude : null,
      longitude !== undefined && longitude !== null ? longitude : null,
      emergencyType || 'GENERAL',
      description || null,
    ]);

    return result.rows[0];
  }

  /**
   * Finds a recent active alert by driver within a specified time window (anti-spam idempotency).
   * @param {string} driverId
   * @param {number} [windowSeconds=60]
   * @returns {Promise<Object|null>}
   */
  async findRecentActiveAlertByDriverId(driverId, windowSeconds = 60) {
    const sql = `
      SELECT *
      FROM emergency_alerts
      WHERE driver_id = $1 
        AND status = 'ACTIVE' 
        AND created_at >= NOW() - ($2 || ' seconds')::interval
      ORDER BY created_at DESC
      LIMIT 1;
    `;

    const result = await query(sql, [driverId, windowSeconds]);
    return result.rows[0] || null;
  }

  /**
   * Retrieves single alert with complete driver and vehicle context.
   * @param {string} id - Alert UUID
   * @returns {Promise<Object|null>}
   */
  async getAlertById(id) {
    const sql = `
      SELECT 
        a.id,
        a.driver_id,
        a.vehicle_id,
        a.trip_id,
        a.latitude,
        a.longitude,
        a.emergency_type,
        a.description,
        a.status,
        a.acknowledged_by,
        a.acknowledged_at,
        a.resolved_by,
        a.resolved_at,
        a.resolution_notes,
        a.created_at,
        a.updated_at,
        v.plate_number AS vehicle_plate_number,
        v.model AS vehicle_model,
        v.vehicle_type,
        d.username AS driver_username,
        d.first_name AS driver_first_name,
        d.last_name AS driver_last_name,
        d.phone AS driver_phone,
        ab.username AS acknowledged_by_username,
        rb.username AS resolved_by_username,
        t.trip_number
      FROM emergency_alerts a
      JOIN users d ON a.driver_id = d.id
      LEFT JOIN vehicles v ON a.vehicle_id = v.id
      LEFT JOIN trips t ON a.trip_id = t.id
      LEFT JOIN users ab ON a.acknowledged_by = ab.id
      LEFT JOIN users rb ON a.resolved_by = rb.id
      WHERE a.id = $1;
    `;

    const result = await query(sql, [id]);
    return result.rows[0] || null;
  }

  /**
   * Acknowledges an active emergency alert.
   * @param {string} id
   * @param {string} acknowledgedBy - User UUID
   * @returns {Promise<Object|null>}
   */
  async acknowledgeAlert(id, acknowledgedBy) {
    const sql = `
      UPDATE emergency_alerts
      SET 
        status = 'ACKNOWLEDGED',
        acknowledged_by = $2,
        acknowledged_at = NOW(),
        updated_at = NOW()
      WHERE id = $1
      RETURNING *;
    `;

    const result = await query(sql, [id, acknowledgedBy]);
    return result.rows[0] || null;
  }

  /**
   * Resolves an emergency alert with notes.
   * @param {string} id
   * @param {Object} data - { resolvedBy, resolutionNotes, status }
   * @returns {Promise<Object|null>}
   */
  async resolveAlert(id, { resolvedBy, resolutionNotes, status = 'RESOLVED' }) {
    const sql = `
      UPDATE emergency_alerts
      SET 
        status = COALESCE($3, 'RESOLVED'),
        resolved_by = $2,
        resolved_at = NOW(),
        resolution_notes = $4,
        updated_at = NOW()
      WHERE id = $1
      RETURNING *;
    `;

    const result = await query(sql, [
      id,
      resolvedBy,
      status || 'RESOLVED',
      resolutionNotes || null,
    ]);

    return result.rows[0] || null;
  }

  /**
   * Retrieves all currently active and unacknowledged/ongoing emergency alerts.
   * @returns {Promise<Array<Object>>}
   */
  async getActiveAlerts() {
    const sql = `
      SELECT 
        a.id,
        a.driver_id,
        a.vehicle_id,
        a.trip_id,
        a.latitude,
        a.longitude,
        a.emergency_type,
        a.description,
        a.status,
        a.acknowledged_by,
        a.acknowledged_at,
        a.resolved_by,
        a.resolved_at,
        a.resolution_notes,
        a.created_at,
        a.updated_at,
        v.plate_number AS vehicle_plate_number,
        v.model AS vehicle_model,
        v.vehicle_type,
        d.username AS driver_username,
        d.first_name AS driver_first_name,
        d.last_name AS driver_last_name,
        d.phone AS driver_phone,
        ab.username AS acknowledged_by_username,
        t.trip_number
      FROM emergency_alerts a
      JOIN users d ON a.driver_id = d.id
      LEFT JOIN vehicles v ON a.vehicle_id = v.id
      LEFT JOIN trips t ON a.trip_id = t.id
      LEFT JOIN users ab ON a.acknowledged_by = ab.id
      WHERE a.status IN ('ACTIVE', 'ACKNOWLEDGED')
      ORDER BY a.created_at DESC;
    `;

    const result = await query(sql);
    return result.rows;
  }

  /**
   * Retrieves alerts created or modified since a given timestamp (for delta dashboard polling).
   * @param {string} sinceTimestamp - ISO date string
   * @returns {Promise<Array<Object>>}
   */
  async getPollAlerts(sinceTimestamp) {
    const sql = `
      SELECT 
        a.id,
        a.driver_id,
        a.vehicle_id,
        a.trip_id,
        a.latitude,
        a.longitude,
        a.emergency_type,
        a.description,
        a.status,
        a.acknowledged_by,
        a.acknowledged_at,
        a.resolved_by,
        a.resolved_at,
        a.resolution_notes,
        a.created_at,
        a.updated_at,
        v.plate_number AS vehicle_plate_number,
        v.model AS vehicle_model,
        v.vehicle_type,
        d.username AS driver_username,
        d.first_name AS driver_first_name,
        d.last_name AS driver_last_name,
        d.phone AS driver_phone,
        ab.username AS acknowledged_by_username,
        rb.username AS resolved_by_username,
        t.trip_number
      FROM emergency_alerts a
      JOIN users d ON a.driver_id = d.id
      LEFT JOIN vehicles v ON a.vehicle_id = v.id
      LEFT JOIN trips t ON a.trip_id = t.id
      LEFT JOIN users ab ON a.acknowledged_by = ab.id
      LEFT JOIN users rb ON a.resolved_by = rb.id
      WHERE a.updated_at >= $1 OR a.created_at >= $1
      ORDER BY a.updated_at DESC;
    `;

    const result = await query(sql, [sinceTimestamp]);
    return result.rows;
  }

  /**
   * Retrieves paginated alerts with filtering.
   * @param {Object} filters - { status, driverId, vehicleId, emergencyType, startDate, endDate }
   * @param {Object|null} pagination
   */
  async getAlerts(filters = {}, pagination = null) {
    const { status, driverId, vehicleId, emergencyType, startDate, endDate } = filters;
    const conditions = [];
    const params = [];
    let paramIndex = 1;

    if (status) {
      conditions.push(`a.status = $${paramIndex++}`);
      params.push(status.toUpperCase());
    }

    if (driverId) {
      conditions.push(`a.driver_id = $${paramIndex++}`);
      params.push(driverId);
    }

    if (vehicleId) {
      conditions.push(`a.vehicle_id = $${paramIndex++}`);
      params.push(vehicleId);
    }

    if (emergencyType) {
      conditions.push(`a.emergency_type = $${paramIndex++}`);
      params.push(emergencyType.toUpperCase());
    }

    if (startDate) {
      conditions.push(`a.created_at >= $${paramIndex++}`);
      params.push(startDate);
    }

    if (endDate) {
      conditions.push(`a.created_at <= $${paramIndex++}`);
      params.push(endDate);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const baseSql = `
      FROM emergency_alerts a
      JOIN users d ON a.driver_id = d.id
      LEFT JOIN vehicles v ON a.vehicle_id = v.id
      LEFT JOIN trips t ON a.trip_id = t.id
      LEFT JOIN users ab ON a.acknowledged_by = ab.id
      LEFT JOIN users rb ON a.resolved_by = rb.id
      ${whereClause}
    `;

    const selectSql = `
      SELECT 
        a.id,
        a.driver_id,
        a.vehicle_id,
        a.trip_id,
        a.latitude,
        a.longitude,
        a.emergency_type,
        a.description,
        a.status,
        a.acknowledged_by,
        a.acknowledged_at,
        a.resolved_by,
        a.resolved_at,
        a.resolution_notes,
        a.created_at,
        a.updated_at,
        v.plate_number AS vehicle_plate_number,
        v.model AS vehicle_model,
        v.vehicle_type,
        d.username AS driver_username,
        d.first_name AS driver_first_name,
        d.last_name AS driver_last_name,
        d.phone AS driver_phone,
        ab.username AS acknowledged_by_username,
        rb.username AS resolved_by_username,
        t.trip_number
      ${baseSql}
      ORDER BY a.created_at DESC
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

module.exports = new AlertsRepository();
