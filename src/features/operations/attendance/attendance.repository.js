const { query } = require('../../../../database/connection');

/**
 * Duty Attendance Repository
 * Pure SQL data access layer for employee clock-in and clock-out cycles.
 */
class AttendanceRepository {
  /**
   * Retrieves an open/active duty cycle for a specific user.
   * @param {string} userId - User UUID
   * @returns {Promise<Object|null>}
   */
  async getActiveDutyCycle(userId) {
    const sql = `
      SELECT 
        a.id,
        a.user_id,
        a.clock_in_time,
        a.clock_out_time,
        a.clock_in_recorded_by,
        a.clock_out_recorded_by,
        a.clock_in_notes,
        a.clock_out_notes,
        a.duration_minutes,
        a.status,
        a.created_at,
        a.updated_at,
        u.username,
        u.first_name,
        u.last_name,
        u.phone,
        r.name AS role_name
      FROM duty_attendance a
      JOIN users u ON a.user_id = u.id
      LEFT JOIN roles r ON u.role_id = r.id
      WHERE a.user_id = $1 
        AND a.clock_out_time IS NULL 
        AND a.status = 'ACTIVE'
      LIMIT 1;
    `;

    const result = await query(sql, [userId]);
    return result.rows[0] || null;
  }

  /**
   * Retrieves single duty attendance record by UUID.
   * @param {string} id - Attendance UUID
   * @returns {Promise<Object|null>}
   */
  async getAttendanceById(id) {
    const sql = `
      SELECT 
        a.id,
        a.user_id,
        a.clock_in_time,
        a.clock_out_time,
        a.clock_in_recorded_by,
        a.clock_out_recorded_by,
        a.clock_in_notes,
        a.clock_out_notes,
        a.duration_minutes,
        a.status,
        a.created_at,
        a.updated_at,
        u.username,
        u.first_name,
        u.last_name,
        u.phone,
        r.name AS role_name,
        cib.username AS clock_in_recorded_by_username,
        cob.username AS clock_out_recorded_by_username
      FROM duty_attendance a
      JOIN users u ON a.user_id = u.id
      LEFT JOIN roles r ON u.role_id = r.id
      LEFT JOIN users cib ON a.clock_in_recorded_by = cib.id
      LEFT JOIN users cob ON a.clock_out_recorded_by = cob.id
      WHERE a.id = $1;
    `;

    const result = await query(sql, [id]);
    return result.rows[0] || null;
  }

  /**
   * Inserts a new clock-in duty cycle.
   * @param {Object} data - { userId, clockInTime, clockInRecordedBy, clockInNotes }
   * @returns {Promise<Object>} Created attendance row
   */
  async createClockIn({ userId, clockInTime, clockInRecordedBy, clockInNotes }) {
    const sql = `
      INSERT INTO duty_attendance (
        user_id,
        clock_in_time,
        clock_in_recorded_by,
        clock_in_notes,
        status
      )
      VALUES ($1, COALESCE($2, NOW()), $3, $4, 'ACTIVE')
      RETURNING *;
    `;

    const result = await query(sql, [
      userId,
      clockInTime || null,
      clockInRecordedBy || null,
      clockInNotes || null,
    ]);

    return result.rows[0];
  }

  /**
   * Closes an active duty cycle with clock-out timestamp and duration.
   * @param {Object} data - { id, clockOutTime, clockOutRecordedBy, durationMinutes, clockOutNotes }
   * @returns {Promise<Object>} Updated attendance row
   */
  async completeClockOut({ id, clockOutTime, clockOutRecordedBy, durationMinutes, clockOutNotes }) {
    const sql = `
      UPDATE duty_attendance
      SET 
        clock_out_time = COALESCE($2, NOW()),
        clock_out_recorded_by = $3,
        duration_minutes = $4,
        clock_out_notes = $5,
        status = 'COMPLETED',
        updated_at = NOW()
      WHERE id = $1
      RETURNING *;
    `;

    const result = await query(sql, [
      id,
      clockOutTime || null,
      clockOutRecordedBy || null,
      durationMinutes,
      clockOutNotes || null,
    ]);

    return result.rows[0];
  }

  /**
   * Retrieves attendance logs with filtering and pagination.
   * @param {Object} filters - { userId, role, status, startDate, endDate }
   * @param {Object|null} pagination - { limit, offset }
   * @returns {Promise<{ rows: Array, total: number }|Array>}
   */
  async getAttendanceLogs(filters = {}, pagination = null) {
    const { userId, role, status, startDate, endDate } = filters;
    const conditions = [];
    const params = [];
    let paramIndex = 1;

    if (userId) {
      conditions.push(`a.user_id = $${paramIndex++}`);
      params.push(userId);
    }

    if (role) {
      conditions.push(`(r.name ILIKE $${paramIndex} OR r.id::text = $${paramIndex})`);
      params.push(role);
      paramIndex++;
    }

    if (status) {
      conditions.push(`a.status = $${paramIndex++}`);
      params.push(status.toUpperCase());
    }

    if (startDate) {
      conditions.push(`a.clock_in_time >= $${paramIndex++}`);
      params.push(startDate);
    }

    if (endDate) {
      conditions.push(`a.clock_in_time <= $${paramIndex++}`);
      params.push(endDate);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const baseSql = `
      FROM duty_attendance a
      JOIN users u ON a.user_id = u.id
      LEFT JOIN roles r ON u.role_id = r.id
      LEFT JOIN users cib ON a.clock_in_recorded_by = cib.id
      LEFT JOIN users cob ON a.clock_out_recorded_by = cob.id
      ${whereClause}
    `;

    const selectSql = `
      SELECT 
        a.id,
        a.user_id,
        a.clock_in_time,
        a.clock_out_time,
        a.clock_in_recorded_by,
        a.clock_out_recorded_by,
        a.clock_in_notes,
        a.clock_out_notes,
        a.duration_minutes,
        a.status,
        a.created_at,
        a.updated_at,
        u.username,
        u.first_name,
        u.last_name,
        u.phone,
        r.name AS role_name,
        cib.username AS clock_in_recorded_by_username,
        cob.username AS clock_out_recorded_by_username
      ${baseSql}
      ORDER BY a.clock_in_time DESC
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

module.exports = new AttendanceRepository();
