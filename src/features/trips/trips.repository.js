const { query } = require('../../../database/connection');

/**
 * Trips Repository
 * Data access layer for trip lifecycles, crew attribution, and plant check-in records.
 */
class TripsRepository {
  /**
   * Retrieves all trips with filtering and pagination.
   * @param {Object} filters - { status, truckId, salesUserId, driverId, zoneId, startDate, endDate, search }
   * @param {Object|null} pagination
   */
  async getAllTrips(filters = {}, pagination = null) {
    const { status, truckId, salesUserId, driverId, zoneId, startDate, endDate, search } = filters;
    const conditions = [];
    const params = [];
    let paramIndex = 1;

    if (status) {
      conditions.push(`t.status = $${paramIndex++}`);
      params.push(status.toUpperCase());
    }

    if (truckId) {
      conditions.push(`t.truck_id = $${paramIndex++}`);
      params.push(truckId);
    }

    if (salesUserId) {
      conditions.push(`t.sales_user_id = $${paramIndex++}`);
      params.push(salesUserId);
    }

    if (driverId) {
      conditions.push(`t.driver_id = $${paramIndex++}`);
      params.push(driverId);
    }

    if (zoneId) {
      conditions.push(`t.zone_id = $${paramIndex++}`);
      params.push(zoneId);
    }

    if (startDate) {
      conditions.push(`t.departure_time >= $${paramIndex++}`);
      params.push(startDate);
    }

    if (endDate) {
      conditions.push(`t.departure_time <= $${paramIndex++}`);
      params.push(endDate);
    }

    if (search && typeof search === 'string' && search.trim() !== '') {
      conditions.push(
        `(t.trip_number ILIKE $${paramIndex} OR v.plate_number ILIKE $${paramIndex} OR z.name ILIKE $${paramIndex} OR su.first_name ILIKE $${paramIndex} OR su.last_name ILIKE $${paramIndex} OR d.first_name ILIKE $${paramIndex} OR d.last_name ILIKE $${paramIndex})`
      );
      params.push(`%${search.trim()}%`);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const baseSelect = `
      SELECT 
        t.id,
        t.schedule_id,
        t.truck_id,
        t.driver_id,
        t.sales_user_id,
        t.zone_id,
        t.dispatched_by,
        t.return_odometer_log_id,
        t.trip_number,
        t.status,
        t.departure_time,
        t.return_time,
        t.notes,
        t.created_at,
        t.updated_at,
        v.plate_number AS truck_plate_number,
        v.model AS truck_model,
        v.status AS truck_status,
        v.current_odometer AS truck_current_odometer,
        d.username AS driver_username,
        d.first_name AS driver_first_name,
        d.last_name AS driver_last_name,
        d.phone AS driver_phone,
        su.username AS sales_username,
        su.first_name AS sales_first_name,
        su.last_name AS sales_last_name,
        su.phone AS sales_phone,
        z.code AS zone_code,
        z.name AS zone_name,
        dp.username AS dispatched_by_username,
        ts.scheduled_date,
        vol.odometer_reading AS return_odometer_reading,
        tsr.status AS reconciliation_status
      FROM trips t
      JOIN vehicles v ON t.truck_id = v.id
      JOIN users d ON t.driver_id = d.id
      JOIN users su ON t.sales_user_id = su.id
      JOIN service_zones z ON t.zone_id = z.id
      LEFT JOIN users dp ON t.dispatched_by = dp.id
      LEFT JOIN truck_schedules ts ON t.schedule_id = ts.id
      LEFT JOIN vehicle_odometer_logs vol ON t.return_odometer_log_id = vol.id
      LEFT JOIN trip_stock_reconciliations tsr ON t.id = tsr.trip_id
      ${whereClause}
    `;

    if (!pagination || !pagination.isPaginated) {
      const sql = `
        ${baseSelect}
        ORDER BY t.departure_time DESC, t.id DESC
      `;
      const result = await query(sql, params);
      return result.rows;
    }

    const sortColumn = pagination.sortColumn || 't.departure_time';
    const sortOrder = pagination.sortOrder === 'ASC' ? 'ASC' : 'DESC';
    const limit = pagination.limit || 20;
    const offset = pagination.offset || 0;

    const dataParams = [...params, limit, offset];
    const limitPlaceholder = `$${params.length + 1}`;
    const offsetPlaceholder = `$${params.length + 2}`;

    const dataSql = `
      ${baseSelect}
      ORDER BY ${sortColumn} ${sortOrder}, t.id DESC
      LIMIT ${limitPlaceholder} OFFSET ${offsetPlaceholder}
    `;

    const countSql = `
      SELECT COUNT(*) AS total
      FROM trips t
      JOIN vehicles v ON t.truck_id = v.id
      JOIN users d ON t.driver_id = d.id
      JOIN users su ON t.sales_user_id = su.id
      JOIN service_zones z ON t.zone_id = z.id
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
   * Retrieves single trip by UUID with complete details.
   * @param {string} id - Trip UUID
   */
  async getTripById(id) {
    const sql = `
      SELECT 
        t.id,
        t.schedule_id,
        t.truck_id,
        t.driver_id,
        t.sales_user_id,
        t.zone_id,
        t.dispatched_by,
        t.return_odometer_log_id,
        t.trip_number,
        t.status,
        t.departure_time,
        t.return_time,
        t.notes,
        t.created_at,
        t.updated_at,
        v.plate_number AS truck_plate_number,
        v.model AS truck_model,
        v.status AS truck_status,
        v.current_odometer AS truck_current_odometer,
        d.username AS driver_username,
        d.first_name AS driver_first_name,
        d.last_name AS driver_last_name,
        d.phone AS driver_phone,
        su.username AS sales_username,
        su.first_name AS sales_first_name,
        su.last_name AS sales_last_name,
        su.phone AS sales_phone,
        z.code AS zone_code,
        z.name AS zone_name,
        dp.username AS dispatched_by_username,
        ts.scheduled_date,
        vol.odometer_reading AS return_odometer_reading,
        vol.logged_at AS return_odometer_logged_at,
        tsr.status AS reconciliation_status,
        tsr.total_loaded_full,
        tsr.total_sold_full,
        tsr.total_returned_full,
        tsr.total_returned_empty_good,
        tsr.total_returned_defective,
        tsr.net_customer_debt_created
      FROM trips t
      JOIN vehicles v ON t.truck_id = v.id
      JOIN users d ON t.driver_id = d.id
      JOIN users su ON t.sales_user_id = su.id
      JOIN service_zones z ON t.zone_id = z.id
      LEFT JOIN users dp ON t.dispatched_by = dp.id
      LEFT JOIN truck_schedules ts ON t.schedule_id = ts.id
      LEFT JOIN vehicle_odometer_logs vol ON t.return_odometer_log_id = vol.id
      LEFT JOIN trip_stock_reconciliations tsr ON t.id = tsr.trip_id
      WHERE t.id = $1
    `;

    const result = await query(sql, [id]);
    return result.rows[0] || null;
  }

  /**
   * Checks if a vehicle has an ongoing active trip (IN_PROGRESS).
   * @param {string} truckId
   */
  async findActiveTripByTruckId(truckId) {
    const sql = `
      SELECT *
      FROM trips
      WHERE truck_id = $1 AND status IN ('PENDING', 'IN_PROGRESS')
      LIMIT 1
    `;

    const result = await query(sql, [truckId]);
    return result.rows[0] || null;
  }

  /**
   * Inserts a new trip record.
   * @param {Object} tripData
   * @param {Object} [client]
   */
  async createTrip(
    {
      scheduleId = null,
      truckId,
      driverId,
      salesUserId,
      zoneId,
      dispatchedBy = null,
      tripNumber,
      status = 'IN_PROGRESS',
      departureTime = new Date(),
      notes = null,
    },
    client = null
  ) {
    const sql = `
      INSERT INTO trips (
        schedule_id,
        truck_id,
        driver_id,
        sales_user_id,
        zone_id,
        dispatched_by,
        trip_number,
        status,
        departure_time,
        notes
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `;

    const runner = client || { query };
    const res = await runner.query(sql, [
      scheduleId,
      truckId,
      driverId,
      salesUserId,
      zoneId,
      dispatchedBy,
      tripNumber,
      status,
      departureTime,
      notes,
    ]);

    return res.rows[0];
  }

  /**
   * Updates an existing trip record.
   * @param {string} id
   * @param {Object} updateData
   * @param {Object} [client]
   */
  async updateTrip(id, updateData, client = null) {
    const fields = [];
    const params = [];
    let paramIndex = 1;

    if (updateData.status !== undefined) {
      fields.push(`status = $${paramIndex++}`);
      params.push(updateData.status);
    }

    if (updateData.returnTime !== undefined) {
      fields.push(`return_time = $${paramIndex++}`);
      params.push(updateData.returnTime);
    }

    if (updateData.returnOdometerLogId !== undefined) {
      fields.push(`return_odometer_log_id = $${paramIndex++}`);
      params.push(updateData.returnOdometerLogId);
    }

    if (updateData.notes !== undefined) {
      fields.push(`notes = $${paramIndex++}`);
      params.push(updateData.notes);
    }

    if (fields.length === 0) {
      return this.getTripById(id);
    }

    params.push(id);
    const sql = `
      UPDATE trips
      SET ${fields.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    const runner = client || { query };
    await runner.query(sql, params);
    return this.getTripById(id);
  }
}

module.exports = new TripsRepository();
