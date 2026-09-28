const { query } = require('../../../database/connection');

/**
 * Truck Schedules Repository
 * Data access layer for operational date-stamped route schedules.
 */
class SchedulesRepository {
  /**
   * Retrieves operational schedules with joined vehicle, sales rep, zone, and trip details.
   * @param {Object} filters - { startDate, endDate, date, truckId, salesUserId, zoneId, status, search }
   * @param {Object|null} pagination - Optional pagination options
   */
  async getAllSchedules(filters = {}, pagination = null) {
    const { startDate, endDate, date, truckId, salesUserId, zoneId, status, search } = filters;
    const conditions = [];
    const params = [];
    let paramIndex = 1;

    if (date) {
      conditions.push(`ts.scheduled_date = $${paramIndex++}`);
      params.push(date);
    } else {
      if (startDate) {
        conditions.push(`ts.scheduled_date >= $${paramIndex++}`);
        params.push(startDate);
      }
      if (endDate) {
        conditions.push(`ts.scheduled_date <= $${paramIndex++}`);
        params.push(endDate);
      }
    }

    if (truckId) {
      conditions.push(`ts.truck_id = $${paramIndex++}`);
      params.push(truckId);
    }

    if (salesUserId) {
      conditions.push(`ts.sales_user_id = $${paramIndex++}`);
      params.push(salesUserId);
    }

    if (zoneId) {
      conditions.push(`ts.zone_id = $${paramIndex++}`);
      params.push(zoneId);
    }

    if (status) {
      conditions.push(`ts.status = $${paramIndex++}`);
      params.push(status.toUpperCase());
    }

    if (search && typeof search === 'string' && search.trim() !== '') {
      conditions.push(
        `(v.plate_number ILIKE $${paramIndex} OR z.name ILIKE $${paramIndex} OR su.first_name ILIKE $${paramIndex} OR su.last_name ILIKE $${paramIndex} OR su.username ILIKE $${paramIndex})`
      );
      params.push(`%${search.trim()}%`);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const baseSelect = `
      SELECT 
        ts.id,
        ts.scheduled_date,
        ts.truck_id,
        ts.sales_user_id,
        ts.zone_id,
        ts.created_by,
        ts.status,
        ts.notes,
        ts.created_at,
        ts.updated_at,
        v.plate_number AS truck_plate_number,
        v.model AS truck_model,
        v.status AS truck_status,
        v.vehicle_type AS truck_vehicle_type,
        v.driver_id AS truck_driver_id,
        d.first_name AS driver_first_name,
        d.last_name AS driver_last_name,
        d.username AS driver_username,
        su.username AS sales_username,
        su.first_name AS sales_first_name,
        su.last_name AS sales_last_name,
        su.phone AS sales_phone,
        z.code AS zone_code,
        z.name AS zone_name,
        cb.username AS created_by_username,
        t.id AS trip_id,
        t.trip_number,
        t.status AS trip_status
      FROM truck_schedules ts
      JOIN vehicles v ON ts.truck_id = v.id
      LEFT JOIN users d ON v.driver_id = d.id
      JOIN users su ON ts.sales_user_id = su.id
      JOIN service_zones z ON ts.zone_id = z.id
      LEFT JOIN users cb ON ts.created_by = cb.id
      LEFT JOIN trips t ON ts.id = t.schedule_id
      ${whereClause}
    `;

    if (!pagination || !pagination.isPaginated) {
      const sql = `
        ${baseSelect}
        ORDER BY ts.scheduled_date DESC, v.plate_number ASC, ts.id DESC
      `;
      const result = await query(sql, params);
      return result.rows;
    }

    const sortColumn = pagination.sortColumn || 'ts.scheduled_date';
    const sortOrder = pagination.sortOrder === 'ASC' ? 'ASC' : 'DESC';
    const limit = pagination.limit || 20;
    const offset = pagination.offset || 0;

    const dataParams = [...params, limit, offset];
    const limitPlaceholder = `$${params.length + 1}`;
    const offsetPlaceholder = `$${params.length + 2}`;

    const dataSql = `
      ${baseSelect}
      ORDER BY ${sortColumn} ${sortOrder}, ts.id DESC
      LIMIT ${limitPlaceholder} OFFSET ${offsetPlaceholder}
    `;

    const countSql = `
      SELECT COUNT(*) AS total
      FROM truck_schedules ts
      JOIN vehicles v ON ts.truck_id = v.id
      JOIN users su ON ts.sales_user_id = su.id
      JOIN service_zones z ON ts.zone_id = z.id
      ${whereClause}
    `;

    const [dataRes, countRes] = await Promise.all([
      query(dataSql, dataParams),
      query(countSql, params),
    ]);

    return {
      rows: dataRes.rows,
      total: parseInt(countRes.rows[0]?.total || 0, 10),
    };
  }

  /**
   * Retrieves single operational schedule by UUID with complete details.
   * @param {string} id - Schedule UUID
   */
  async getScheduleById(id) {
    const sql = `
      SELECT 
        ts.id,
        ts.scheduled_date,
        ts.truck_id,
        ts.sales_user_id,
        ts.zone_id,
        ts.created_by,
        ts.status,
        ts.notes,
        ts.created_at,
        ts.updated_at,
        v.plate_number AS truck_plate_number,
        v.model AS truck_model,
        v.status AS truck_status,
        v.vehicle_type AS truck_vehicle_type,
        v.driver_id AS truck_driver_id,
        d.first_name AS driver_first_name,
        d.last_name AS driver_last_name,
        d.username AS driver_username,
        su.username AS sales_username,
        su.first_name AS sales_first_name,
        su.last_name AS sales_last_name,
        su.phone AS sales_phone,
        z.code AS zone_code,
        z.name AS zone_name,
        cb.username AS created_by_username,
        t.id AS trip_id,
        t.trip_number,
        t.status AS trip_status
      FROM truck_schedules ts
      JOIN vehicles v ON ts.truck_id = v.id
      LEFT JOIN users d ON v.driver_id = d.id
      JOIN users su ON ts.sales_user_id = su.id
      JOIN service_zones z ON ts.zone_id = z.id
      LEFT JOIN users cb ON ts.created_by = cb.id
      LEFT JOIN trips t ON ts.id = t.schedule_id
      WHERE ts.id = $1
    `;

    const result = await query(sql, [id]);
    return result.rows[0] || null;
  }

  /**
   * Finds an existing schedule for a truck on a given date.
   * @param {string} truckId
   * @param {string} scheduledDate - YYYY-MM-DD
   */
  async findByTruckAndDate(truckId, scheduledDate) {
    const sql = `
      SELECT *
      FROM truck_schedules
      WHERE truck_id = $1 AND scheduled_date = $2
    `;

    const result = await query(sql, [truckId, scheduledDate]);
    return result.rows[0] || null;
  }

  /**
   * Creates a new operational truck schedule.
   * @param {Object} data
   */
  async createSchedule({
    scheduledDate,
    truckId,
    salesUserId,
    zoneId,
    createdBy = null,
    status = 'SCHEDULED',
    notes = null,
  }) {
    const sql = `
      INSERT INTO truck_schedules (
        scheduled_date,
        truck_id,
        sales_user_id,
        zone_id,
        created_by,
        status,
        notes
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `;

    const result = await query(sql, [
      scheduledDate,
      truckId,
      salesUserId,
      zoneId,
      createdBy,
      status,
      notes,
    ]);

    return this.getScheduleById(result.rows[0].id);
  }

  /**
   * Updates an existing operational schedule.
   * @param {string} id
   * @param {Object} updateData
   */
  async updateSchedule(id, updateData) {
    const fields = [];
    const params = [];
    let paramIndex = 1;

    if (updateData.scheduledDate !== undefined) {
      fields.push(`scheduled_date = $${paramIndex++}`);
      params.push(updateData.scheduledDate);
    }

    if (updateData.truckId !== undefined) {
      fields.push(`truck_id = $${paramIndex++}`);
      params.push(updateData.truckId);
    }

    if (updateData.salesUserId !== undefined) {
      fields.push(`sales_user_id = $${paramIndex++}`);
      params.push(updateData.salesUserId);
    }

    if (updateData.zoneId !== undefined) {
      fields.push(`zone_id = $${paramIndex++}`);
      params.push(updateData.zoneId);
    }

    if (updateData.status !== undefined) {
      fields.push(`status = $${paramIndex++}`);
      params.push(updateData.status);
    }

    if (updateData.notes !== undefined) {
      fields.push(`notes = $${paramIndex++}`);
      params.push(updateData.notes);
    }

    if (fields.length === 0) {
      return this.getScheduleById(id);
    }

    params.push(id);
    const sql = `
      UPDATE truck_schedules
      SET ${fields.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    await query(sql, params);
    return this.getScheduleById(id);
  }

  /**
   * Updates schedule status (e.g. to DISPATCHED or CANCELLED).
   * @param {string} id
   * @param {string} status
   * @param {Object} [client] - Optional transaction client
   */
  async updateStatus(id, status, client = null) {
    const sql = `
      UPDATE truck_schedules
      SET status = $1
      WHERE id = $2
      RETURNING *
    `;

    const runner = client || { query };
    const result = await runner.query(sql, [status, id]);
    return result.rows[0] || null;
  }
}

module.exports = new SchedulesRepository();
