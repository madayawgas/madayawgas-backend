const { query } = require('../../../../database/connection');

/**
 * Driver Road Apprehensions Repository
 * Pure SQL data access layer for traffic citations, apprehending agencies, and mandatory ticket image references.
 */
class ApprehensionsRepository {
  /**
   * Inserts a new road apprehension record.
   * @param {Object} data
   * @returns {Promise<Object>} Created row
   */
  async createApprehension({
    vehicleId,
    driverId,
    tripId,
    recordedBy,
    citationTicketNo,
    violationType,
    apprehendingAgency,
    incidentTime,
    location,
    penaltyAmount,
    ticketMediaKey,
    notes,
  }) {
    const sql = `
      INSERT INTO driver_apprehensions (
        vehicle_id,
        driver_id,
        trip_id,
        recorded_by,
        citation_ticket_no,
        violation_type,
        apprehending_agency,
        incident_time,
        location,
        penalty_amount,
        ticket_media_key,
        notes,
        status
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8, NOW()), $9, COALESCE($10, 0.00), $11, $12, 'RECORDED')
      RETURNING *;
    `;

    const result = await query(sql, [
      vehicleId,
      driverId,
      tripId || null,
      recordedBy,
      citationTicketNo || null,
      violationType,
      apprehendingAgency,
      incidentTime || null,
      location || null,
      penaltyAmount !== undefined && penaltyAmount !== null ? penaltyAmount : 0.00,
      ticketMediaKey,
      notes || null,
    ]);

    return result.rows[0];
  }

  /**
   * Retrieves single apprehension by UUID with complete joins.
   * @param {string} id - Apprehension UUID
   * @returns {Promise<Object|null>}
   */
  async getApprehensionById(id) {
    const sql = `
      SELECT 
        a.id,
        a.vehicle_id,
        a.driver_id,
        a.trip_id,
        a.recorded_by,
        a.citation_ticket_no,
        a.violation_type,
        a.apprehending_agency,
        a.incident_time,
        a.location,
        a.penalty_amount,
        a.ticket_media_key,
        a.notes,
        a.status,
        a.settled_at,
        a.settled_by,
        a.created_at,
        a.updated_at,
        v.plate_number AS vehicle_plate_number,
        v.model AS vehicle_model,
        v.vehicle_type,
        d.username AS driver_username,
        d.first_name AS driver_first_name,
        d.last_name AS driver_last_name,
        d.phone AS driver_phone,
        rb.username AS recorded_by_username,
        sb.username AS settled_by_username,
        t.trip_number
      FROM driver_apprehensions a
      JOIN vehicles v ON a.vehicle_id = v.id
      JOIN users d ON a.driver_id = d.id
      LEFT JOIN users rb ON a.recorded_by = rb.id
      LEFT JOIN users sb ON a.settled_by = sb.id
      LEFT JOIN trips t ON a.trip_id = t.id
      WHERE a.id = $1;
    `;

    const result = await query(sql, [id]);
    return result.rows[0] || null;
  }

  /**
   * Updates status of an apprehension (e.g. SETTLED, DISPUTED, CANCELLED).
   * @param {string} id
   * @param {Object} data - { status, settledBy, settledAt, notes }
   * @returns {Promise<Object|null>}
   */
  async updateStatus(id, { status, settledBy, settledAt, notes }) {
    const sql = `
      UPDATE driver_apprehensions
      SET 
        status = $2,
        settled_by = $3,
        settled_at = $4,
        notes = COALESCE($5, notes),
        updated_at = NOW()
      WHERE id = $1
      RETURNING *;
    `;

    const result = await query(sql, [
      id,
      status,
      settledBy || null,
      settledAt || null,
      notes || null,
    ]);

    return result.rows[0] || null;
  }

  /**
   * Retrieves paginated apprehensions with filtering.
   * @param {Object} filters - { vehicleId, driverId, tripId, agency, status, startDate, endDate, search }
   * @param {Object|null} pagination - { limit, offset }
   */
  async getApprehensions(filters = {}, pagination = null) {
    const { vehicleId, driverId, tripId, agency, status, startDate, endDate, search } = filters;
    const conditions = [];
    const params = [];
    let paramIndex = 1;

    if (vehicleId) {
      conditions.push(`a.vehicle_id = $${paramIndex++}`);
      params.push(vehicleId);
    }

    if (driverId) {
      conditions.push(`a.driver_id = $${paramIndex++}`);
      params.push(driverId);
    }

    if (tripId) {
      conditions.push(`a.trip_id = $${paramIndex++}`);
      params.push(tripId);
    }

    if (agency) {
      conditions.push(`a.apprehending_agency ILIKE $${paramIndex++}`);
      params.push(`%${agency}%`);
    }

    if (status) {
      conditions.push(`a.status = $${paramIndex++}`);
      params.push(status.toUpperCase());
    }

    if (startDate) {
      conditions.push(`a.incident_time >= $${paramIndex++}`);
      params.push(startDate);
    }

    if (endDate) {
      conditions.push(`a.incident_time <= $${paramIndex++}`);
      params.push(endDate);
    }

    if (search && typeof search === 'string' && search.trim() !== '') {
      conditions.push(
        `(a.citation_ticket_no ILIKE $${paramIndex} OR a.violation_type ILIKE $${paramIndex} OR a.apprehending_agency ILIKE $${paramIndex} OR v.plate_number ILIKE $${paramIndex} OR d.first_name ILIKE $${paramIndex} OR d.last_name ILIKE $${paramIndex})`
      );
      params.push(`%${search.trim()}%`);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const baseSql = `
      FROM driver_apprehensions a
      JOIN vehicles v ON a.vehicle_id = v.id
      JOIN users d ON a.driver_id = d.id
      LEFT JOIN users rb ON a.recorded_by = rb.id
      LEFT JOIN users sb ON a.settled_by = sb.id
      LEFT JOIN trips t ON a.trip_id = t.id
      ${whereClause}
    `;

    const selectSql = `
      SELECT 
        a.id,
        a.vehicle_id,
        a.driver_id,
        a.trip_id,
        a.recorded_by,
        a.citation_ticket_no,
        a.violation_type,
        a.apprehending_agency,
        a.incident_time,
        a.location,
        a.penalty_amount,
        a.ticket_media_key,
        a.notes,
        a.status,
        a.settled_at,
        a.settled_by,
        a.created_at,
        a.updated_at,
        v.plate_number AS vehicle_plate_number,
        v.model AS vehicle_model,
        v.vehicle_type,
        d.username AS driver_username,
        d.first_name AS driver_first_name,
        d.last_name AS driver_last_name,
        d.phone AS driver_phone,
        rb.username AS recorded_by_username,
        sb.username AS settled_by_username,
        t.trip_number
      ${baseSql}
      ORDER BY a.incident_time DESC
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

module.exports = new ApprehensionsRepository();
