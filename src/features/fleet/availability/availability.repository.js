const { query } = require('../../../../database/connection');

/**
 * Availability Repository
 * Handles database operations related to fleet availability, status transitions, and overview metrics.
 */
class AvailabilityRepository {
  /**
   * Retrieves aggregate metrics for the fleet overview.
   */
  async getOverviewMetrics() {
    const sql = `
      SELECT 
        COUNT(*)::int AS total,
        COUNT(CASE WHEN status = 'ACTIVE' THEN 1 END)::int AS available,
        COUNT(CASE WHEN status = 'ACTIVE' AND driver_id IS NOT NULL THEN 1 END)::int AS assigned,
        COUNT(CASE WHEN status = 'ACTIVE' AND driver_id IS NULL THEN 1 END)::int AS unassigned,
        COUNT(CASE WHEN status = 'UNDER_MAINTENANCE' THEN 1 END)::int AS under_maintenance,
        COUNT(CASE WHEN status = 'INACTIVE' OR status = 'RETIRED' THEN 1 END)::int AS inactive
      FROM vehicles
    `;

    const result = await query(sql);
    return result.rows[0];
  }

  /**
   * Retrieves all vehicles that are currently operational (status = 'ACTIVE')
   * joined with their soft-bounded default driver information.
   * @param {Object} filters - { driverAssigned }
   */
  async getAvailableTrucks(filters = {}) {
    const { driverAssigned, vehicleType, type } = filters;
    const conditions = [`v.status = 'ACTIVE'`];
    const params = [];
    let paramIndex = 1;

    const selectedType = vehicleType || type;
    if (selectedType && typeof selectedType === 'string' && selectedType.trim() !== '') {
      conditions.push(`v.vehicle_type = $${paramIndex++}`);
      params.push(selectedType.trim().toUpperCase());
    }

    if (driverAssigned !== undefined) {
      if (driverAssigned === true || driverAssigned === 'true') {
        conditions.push(`v.driver_id IS NOT NULL`);
      } else if (driverAssigned === false || driverAssigned === 'false') {
        conditions.push(`v.driver_id IS NULL`);
      }
    }

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
      WHERE ${conditions.join(' AND ')}
      ORDER BY v.plate_number ASC
    `;

    const result = await query(sql, params);
    return result.rows;
  }

  /**
   * Retrieves vehicle status and operational state by vehicle ID.
   * @param {string} vehicleId - Vehicle UUID
   */
  async getTruckStatusById(vehicleId) {
    const sql = `
      SELECT 
        v.id,
        v.plate_number,
        v.model,
        v.vehicle_type,
        v.status,
        v.driver_id,
        u.first_name AS driver_first_name,
        u.last_name AS driver_last_name,
        u.phone AS driver_phone,
        u.username AS driver_username
      FROM vehicles v
      LEFT JOIN users u ON v.driver_id = u.id
      WHERE v.id = $1
    `;

    const result = await query(sql, [vehicleId]);
    return result.rows[0] || null;
  }

  /**
   * Updates the availability status of a vehicle.
   * Preserves driver assignment when moving into UNDER_MAINTENANCE;
   * clears driver assignment only when DEACTIVATED/RETIRED (status = INACTIVE or RETIRED).
   * @param {string} vehicleId - Vehicle UUID
   * @param {string} status - New vehicle status
   * @param {string|null} driverId - Driver UUID or null
   */
  async updateTruckStatus(vehicleId, status, driverId) {
    const sql = `
      UPDATE vehicles
      SET status = $1, driver_id = $2
      WHERE id = $3
      RETURNING *
    `;

    const result = await query(sql, [status, driverId, vehicleId]);
    return result.rows[0] || null;
  }
}

module.exports = new AvailabilityRepository();
