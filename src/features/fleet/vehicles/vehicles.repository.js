const { query } = require('../../../../database/connection');

/**
 * Vehicles Repository
 * Handles all database interactions for fleet vehicles and driver relationships.
 */
class VehiclesRepository {
  /**
   * Retrieves all vehicles with optional filtering and joined driver details.
   * @param {Object} filters - { status, search, driverAssigned, vehicleType }
   * @param {Object|null} pagination - Optional { sortColumn, sortOrder, limit, offset }
   */
  async getAllVehicles(filters = {}, pagination = null) {
    const { status, search, driverAssigned, vehicleType, type } = filters;
    const conditions = [];
    const params = [];
    let paramIndex = 1;

    if (status) {
      conditions.push(`v.status = $${paramIndex++}`);
      params.push(status.toUpperCase());
    }

    const selectedType = vehicleType || type;
    if (selectedType && typeof selectedType === 'string' && selectedType.trim() !== '') {
      conditions.push(`v.vehicle_type = $${paramIndex++}`);
      params.push(selectedType.trim().toUpperCase());
    }

    if (search && typeof search === 'string' && search.trim() !== '') {
      conditions.push(`(v.plate_number ILIKE $${paramIndex} OR v.model ILIKE $${paramIndex})`);
      params.push(`%${search.trim()}%`);
      paramIndex++;
    }

    if (driverAssigned !== undefined) {
      if (driverAssigned === true || driverAssigned === 'true') {
        conditions.push(`v.driver_id IS NOT NULL`);
      } else if (driverAssigned === false || driverAssigned === 'false') {
        conditions.push(`v.driver_id IS NULL`);
      }
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    if (!pagination) {
      const sql = `
        SELECT 
          v.id,
          v.plate_number,
          v.model,
          v.year_model,
          v.vehicle_type,
          v.current_odometer,
          v.last_pm_odometer,
          v.pm_due_flag,
          v.status,
          v.driver_id,
          v.created_at,
          v.updated_at,
          u.first_name AS driver_first_name,
          u.last_name AS driver_last_name,
          u.phone AS driver_phone,
          u.username AS driver_username
        FROM vehicles v
        LEFT JOIN users u ON v.driver_id = u.id
        ${whereClause}
        ORDER BY v.created_at DESC, v.id DESC
      `;

      const result = await query(sql, params);
      return result.rows;
    }

    const sortColumn = pagination.sortColumn || 'v.created_at';
    const sortOrder = pagination.sortOrder === 'ASC' ? 'ASC' : 'DESC';
    const limit = pagination.limit || 20;
    const offset = pagination.offset || 0;

    const dataParams = [...params, limit, offset];
    const limitPlaceholder = `$${params.length + 1}`;
    const offsetPlaceholder = `$${params.length + 2}`;

    const dataSql = `
      SELECT 
        v.id,
        v.plate_number,
        v.model,
        v.year_model,
        v.vehicle_type,
        v.current_odometer,
        v.last_pm_odometer,
        v.pm_due_flag,
        v.status,
        v.driver_id,
        v.created_at,
        v.updated_at,
        u.first_name AS driver_first_name,
        u.last_name AS driver_last_name,
        u.phone AS driver_phone,
        u.username AS driver_username
      FROM vehicles v
      LEFT JOIN users u ON v.driver_id = u.id
      ${whereClause}
      ORDER BY ${sortColumn} ${sortOrder}, v.id DESC
      LIMIT ${limitPlaceholder} OFFSET ${offsetPlaceholder}
    `;

    const countSql = `
      SELECT COUNT(*) AS count
      FROM vehicles v
      ${whereClause}
    `;

    const [dataRes, countRes] = await Promise.all([
      query(dataSql, dataParams),
      query(countSql, params),
    ]);

    return {
      rows: dataRes.rows,
      total: parseInt(countRes.rows[0]?.count || 0, 10),
    };
  }

  /**
   * Retrieves a single vehicle by ID with joined driver details.
   * @param {string} id - Vehicle UUID
   */
  async getVehicleById(id) {
    const sql = `
      SELECT 
        v.id,
        v.plate_number,
        v.model,
        v.year_model,
        v.vehicle_type,
        v.current_odometer,
        v.last_pm_odometer,
        v.pm_due_flag,
        v.status,
        v.driver_id,
        v.created_at,
        v.updated_at,
        u.first_name AS driver_first_name,
        u.last_name AS driver_last_name,
        u.phone AS driver_phone,
        u.username AS driver_username
      FROM vehicles v
      LEFT JOIN users u ON v.driver_id = u.id
      WHERE v.id = $1
    `;

    const result = await query(sql, [id]);
    return result.rows[0] || null;
  }

  /**
   * Finds a vehicle by plate number (case-insensitive).
   * @param {string} plateNumber
   */
  async findVehicleByPlateNumber(plateNumber) {
    const sql = `
      SELECT *
      FROM vehicles
      WHERE UPPER(plate_number) = UPPER($1)
    `;

    const result = await query(sql, [plateNumber]);
    return result.rows[0] || null;
  }

  /**
   * Finds a vehicle by driver ID.
   * @param {string} driverId - User UUID
   */
  async findVehicleByDriverId(driverId) {
    const sql = `
      SELECT *
      FROM vehicles
      WHERE driver_id = $1
    `;

    const result = await query(sql, [driverId]);
    return result.rows[0] || null;
  }

  /**
   * Creates a new vehicle record.
   * @param {Object} vehicleData
   */
  async createVehicle({
    plateNumber,
    model,
    yearModel,
    vehicleType = 'DELIVERY_TRUCK',
    currentOdometer = 0,
    lastPmOdometer = 0,
    status = 'ACTIVE',
    driverId = null,
  }) {
    const sql = `
      INSERT INTO vehicles (
        plate_number,
        model,
        year_model,
        vehicle_type,
        current_odometer,
        last_pm_odometer,
        status,
        driver_id
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `;

    const result = await query(sql, [
      plateNumber,
      model,
      yearModel,
      vehicleType,
      currentOdometer,
      lastPmOdometer,
      status,
      driverId,
    ]);

    return result.rows[0];
  }

  /**
   * Updates an existing vehicle record.
   * @param {string} id - Vehicle UUID
   * @param {Object} updateData
   */
  async updateVehicle(id, updateData) {
    const fields = [];
    const params = [];
    let paramIndex = 1;

    if (updateData.plateNumber !== undefined) {
      fields.push(`plate_number = $${paramIndex++}`);
      params.push(updateData.plateNumber);
    }

    if (updateData.model !== undefined) {
      fields.push(`model = $${paramIndex++}`);
      params.push(updateData.model);
    }

    if (updateData.yearModel !== undefined) {
      fields.push(`year_model = $${paramIndex++}`);
      params.push(updateData.yearModel);
    }

    if (updateData.vehicleType !== undefined) {
      fields.push(`vehicle_type = $${paramIndex++}`);
      params.push(updateData.vehicleType);
    }

    if (updateData.currentOdometer !== undefined) {
      fields.push(`current_odometer = $${paramIndex++}`);
      params.push(updateData.currentOdometer);
    }

    if (updateData.lastPmOdometer !== undefined) {
      fields.push(`last_pm_odometer = $${paramIndex++}`);
      params.push(updateData.lastPmOdometer);
    }

    if (fields.length === 0) {
      return this.getVehicleById(id);
    }

    params.push(id);
    const sql = `
      UPDATE vehicles
      SET ${fields.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    const result = await query(sql, params);
    return result.rows[0] || null;
  }

  /**
   * Deactivates a vehicle and clears its driver assignment.
   * @param {string} id - Vehicle UUID
   */
  async deactivateVehicle(id) {
    const sql = `
      UPDATE vehicles
      SET status = 'INACTIVE', driver_id = NULL
      WHERE id = $1
      RETURNING *
    `;

    const result = await query(sql, [id]);
    return result.rows[0] || null;
  }

  /**
   * Assigns or unassigns a driver to/from a vehicle.
   * @param {string} vehicleId - Vehicle UUID
   * @param {string|null} driverId - Driver UUID or null to unassign
   */
  async assignDriver(vehicleId, driverId) {
    const sql = `
      UPDATE vehicles
      SET driver_id = $1
      WHERE id = $2
      RETURNING *
    `;

    const result = await query(sql, [driverId, vehicleId]);
    return result.rows[0] || null;
  }

  /**
   * Unassigns the driver from a vehicle by setting driver_id to NULL.
   * @param {string} vehicleId - Vehicle UUID
   */
  async unassignDriver(vehicleId) {
    const sql = `
      UPDATE vehicles
      SET driver_id = NULL
      WHERE id = $1
      RETURNING *
    `;

    const result = await query(sql, [vehicleId]);
    return result.rows[0] || null;
  }

  /**
   * Finds an active user by ID and retrieves role information to verify driver eligibility.
   * @param {string} userId - User UUID
   */
  async findDriverUserById(userId) {
    const sql = `
      SELECT 
        u.id, 
        u.username, 
        u.first_name, 
        u.last_name, 
        u.phone, 
        u.is_active, 
        u.is_blocked,
        r.name AS role_name,
        EXISTS (
          SELECT 1 FROM user_roles ur
          JOIN roles r2 ON ur.role_id = r2.id
          WHERE ur.user_id = u.id AND LOWER(r2.name) = 'driver'
        ) OR LOWER(r.name) = 'driver' AS is_driver
      FROM users u
      JOIN roles r ON u.role_id = r.id
      WHERE u.id = $1
    `;

    const result = await query(sql, [userId]);
    return result.rows[0] || null;
  }

  /**
   * Updates only the current odometer of a vehicle.
   * @param {string} id - Vehicle UUID
   * @param {number} odometer - New odometer reading
   */
  async updateVehicleOdometer(id, odometer) {
    const sql = `
      UPDATE vehicles
      SET current_odometer = $1
      WHERE id = $2
      RETURNING *
    `;

    const result = await query(sql, [odometer, id]);
    return result.rows[0] || null;
  }

  /**
   * Retrieves users holding the 'Driver' role with their live vehicle assignment information.
   * @param {Object} filters - { availableOnly, search }
   * @param {Object|null} pagination - Optional { sortColumn, sortOrder, limit, offset }
   */
  async getAllDrivers(filters = {}, pagination = null) {
    const { availableOnly, search } = filters;
    const conditions = [
      'u.is_active = TRUE',
      'u.is_blocked = FALSE',
      "(LOWER(r.name) = 'driver' OR EXISTS (SELECT 1 FROM user_roles ur JOIN roles r2 ON ur.role_id = r2.id WHERE ur.user_id = u.id AND LOWER(r2.name) = 'driver'))",
    ];
    const params = [];
    let paramIndex = 1;

    if (availableOnly) {
      conditions.push('v.id IS NULL');
    }

    if (search && typeof search === 'string' && search.trim() !== '') {
      conditions.push(`(u.first_name ILIKE $${paramIndex} OR u.last_name ILIKE $${paramIndex} OR u.username ILIKE $${paramIndex})`);
      params.push(`%${search.trim()}%`);
      paramIndex++;
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    if (!pagination) {
      const sql = `
        SELECT 
          u.id,
          u.username,
          u.first_name,
          u.last_name,
          u.phone,
          r.name AS role_name,
          v.id AS assigned_vehicle_id,
          v.plate_number AS assigned_vehicle_plate,
          v.model AS assigned_vehicle_model,
          v.vehicle_type AS assigned_vehicle_type
        FROM users u
        JOIN roles r ON u.role_id = r.id
        LEFT JOIN vehicles v ON u.id = v.driver_id
        ${whereClause}
        ORDER BY u.first_name ASC, u.last_name ASC, u.id DESC
      `;

      const result = await query(sql, params);
      return result.rows;
    }

    const sortColumn = pagination.sortColumn || 'u.first_name';
    const sortOrder = pagination.sortOrder === 'DESC' ? 'DESC' : 'ASC';
    const limit = pagination.limit || 20;
    const offset = pagination.offset || 0;

    const dataParams = [...params, limit, offset];
    const limitPlaceholder = `$${params.length + 1}`;
    const offsetPlaceholder = `$${params.length + 2}`;

    const dataSql = `
      SELECT 
        u.id,
        u.username,
        u.first_name,
        u.last_name,
        u.phone,
        r.name AS role_name,
        v.id AS assigned_vehicle_id,
        v.plate_number AS assigned_vehicle_plate,
        v.model AS assigned_vehicle_model,
        v.vehicle_type AS assigned_vehicle_type
      FROM users u
      JOIN roles r ON u.role_id = r.id
      LEFT JOIN vehicles v ON u.id = v.driver_id
      ${whereClause}
      ORDER BY ${sortColumn} ${sortOrder}, u.id DESC
      LIMIT ${limitPlaceholder} OFFSET ${offsetPlaceholder}
    `;

    const countSql = `
      SELECT COUNT(*) AS count
      FROM users u
      JOIN roles r ON u.role_id = r.id
      LEFT JOIN vehicles v ON u.id = v.driver_id
      ${whereClause}
    `;

    const [dataRes, countRes] = await Promise.all([
      query(dataSql, dataParams),
      query(countSql, params),
    ]);

    return {
      rows: dataRes.rows,
      total: parseInt(countRes.rows[0]?.count || 0, 10),
    };
  }

  /**
   * Retrieves active, unblocked users who are NOT currently assigned to any vehicle.
   */
  async getAvailableDrivers() {
    return this.getAllDrivers({ availableOnly: true });
  }
}

module.exports = new VehiclesRepository();
