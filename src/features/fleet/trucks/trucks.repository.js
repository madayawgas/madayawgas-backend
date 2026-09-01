const { query } = require('../../../../database/connection');

/**
 * Trucks Repository
 * Handles all database interactions for vehicles (trucks) and driver relationships.
 */
class TrucksRepository {
  /**
   * Retrieves all trucks with optional filtering and joined driver details.
   * @param {Object} filters - { status, search, driverAssigned }
   */
  async getAllTrucks(filters = {}) {
    const { status, search, driverAssigned } = filters;
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

    if (driverAssigned !== undefined) {
      if (driverAssigned === true || driverAssigned === 'true') {
        conditions.push(`t.driver_id IS NOT NULL`);
      } else if (driverAssigned === false || driverAssigned === 'false') {
        conditions.push(`t.driver_id IS NULL`);
      }
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

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
        t.created_at,
        t.updated_at,
        u.first_name AS driver_first_name,
        u.last_name AS driver_last_name,
        u.phone AS driver_phone,
        u.username AS driver_username
      FROM trucks t
      LEFT JOIN users u ON t.driver_id = u.id
      ${whereClause}
      ORDER BY t.created_at DESC
    `;

    const result = await query(sql, params);
    return result.rows;
  }

  /**
   * Retrieves a single truck by ID with joined driver details.
   * @param {string} id - Truck UUID
   */
  async getTruckById(id) {
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
        t.created_at,
        t.updated_at,
        u.first_name AS driver_first_name,
        u.last_name AS driver_last_name,
        u.phone AS driver_phone,
        u.username AS driver_username
      FROM trucks t
      LEFT JOIN users u ON t.driver_id = u.id
      WHERE t.id = $1
    `;

    const result = await query(sql, [id]);
    return result.rows[0] || null;
  }

  /**
   * Finds a truck by plate number (case-insensitive).
   * @param {string} plateNumber
   */
  async findTruckByPlateNumber(plateNumber) {
    const sql = `
      SELECT *
      FROM trucks
      WHERE UPPER(plate_number) = UPPER($1)
    `;

    const result = await query(sql, [plateNumber]);
    return result.rows[0] || null;
  }

  /**
   * Finds a truck by driver ID.
   * @param {string} driverId - User UUID
   */
  async findTruckByDriverId(driverId) {
    const sql = `
      SELECT *
      FROM trucks
      WHERE driver_id = $1
    `;

    const result = await query(sql, [driverId]);
    return result.rows[0] || null;
  }

  /**
   * Creates a new truck record.
   * @param {Object} truckData
   */
  async createTruck({
    plateNumber,
    model,
    yearModel,
    currentOdometer = 0,
    lastPmOdometer = 0,
    status = 'ACTIVE',
    driverId = null,
  }) {
    const sql = `
      INSERT INTO trucks (
        plate_number,
        model,
        year_model,
        current_odometer,
        last_pm_odometer,
        status,
        driver_id
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `;

    const result = await query(sql, [
      plateNumber,
      model,
      yearModel,
      currentOdometer,
      lastPmOdometer,
      status,
      driverId,
    ]);

    return result.rows[0];
  }

  /**
   * Updates an existing truck record.
   * @param {string} id - Truck UUID
   * @param {Object} updateData
   */
  async updateTruck(id, updateData) {
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

    if (updateData.currentOdometer !== undefined) {
      fields.push(`current_odometer = $${paramIndex++}`);
      params.push(updateData.currentOdometer);
    }

    if (updateData.lastPmOdometer !== undefined) {
      fields.push(`last_pm_odometer = $${paramIndex++}`);
      params.push(updateData.lastPmOdometer);
    }

    if (fields.length === 0) {
      return this.getTruckById(id);
    }

    params.push(id);
    const sql = `
      UPDATE trucks
      SET ${fields.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    const result = await query(sql, params);
    return result.rows[0] || null;
  }

  /**
   * Deactivates a truck and clears its driver assignment.
   * @param {string} id - Truck UUID
   */
  async deactivateTruck(id) {
    const sql = `
      UPDATE trucks
      SET status = 'INACTIVE', driver_id = NULL
      WHERE id = $1
      RETURNING *
    `;

    const result = await query(sql, [id]);
    return result.rows[0] || null;
  }

  /**
   * Assigns or unassigns a driver to/from a truck.
   * @param {string} truckId - Truck UUID
   * @param {string|null} driverId - Driver UUID or null to unassign
   */
  async assignDriver(truckId, driverId) {
    const sql = `
      UPDATE trucks
      SET driver_id = $1
      WHERE id = $2
      RETURNING *
    `;

    const result = await query(sql, [driverId, truckId]);
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
        r.name AS role_name
      FROM users u
      JOIN roles r ON u.role_id = r.id
      WHERE u.id = $1
    `;

    const result = await query(sql, [userId]);
    return result.rows[0] || null;
  }

  /**
   * Updates only the current odometer of a truck.
   * @param {string} id - Truck UUID
   * @param {number} odometer - New odometer reading
   */
  async updateTruckOdometer(id, odometer) {
    const sql = `
      UPDATE trucks
      SET current_odometer = $1
      WHERE id = $2
      RETURNING *
    `;

    const result = await query(sql, [odometer, id]);
    return result.rows[0] || null;
  }

  /**
   * Unassigns the driver from a truck by setting driver_id to NULL.
   * @param {string} truckId - Truck UUID
   */
  async unassignDriver(truckId) {
    const sql = `
      UPDATE trucks
      SET driver_id = NULL
      WHERE id = $1
      RETURNING *
    `;

    const result = await query(sql, [truckId]);
    return result.rows[0] || null;
  }

  /**
   * Retrieves users holding the 'Driver' role with their live truck assignment information.
   * @param {Object} filters - { availableOnly, search }
   */
  async getAllDrivers(filters = {}) {
    const { availableOnly, search } = filters;
    const conditions = [
      'u.is_active = TRUE',
      'u.is_blocked = FALSE',
      "LOWER(r.name) = 'driver'",
    ];
    const params = [];
    let paramIndex = 1;

    if (availableOnly) {
      conditions.push('t.id IS NULL');
    }

    if (search) {
      conditions.push(`(u.first_name ILIKE $${paramIndex} OR u.last_name ILIKE $${paramIndex} OR u.username ILIKE $${paramIndex})`);
      params.push(`%${search}%`);
      paramIndex++;
    }

    const sql = `
      SELECT 
        u.id,
        u.username,
        u.first_name,
        u.last_name,
        u.phone,
        r.name AS role_name,
        t.id AS assigned_truck_id,
        t.plate_number AS assigned_truck_plate,
        t.model AS assigned_truck_model
      FROM users u
      JOIN roles r ON u.role_id = r.id
      LEFT JOIN trucks t ON u.id = t.driver_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY u.first_name ASC, u.last_name ASC
    `;

    const result = await query(sql, params);
    return result.rows;
  }

  /**
   * Retrieves active, unblocked users who are NOT currently assigned to any truck.
   */
  async getAvailableDrivers() {
    return this.getAllDrivers({ availableOnly: true });
  }
}

module.exports = new TrucksRepository();
