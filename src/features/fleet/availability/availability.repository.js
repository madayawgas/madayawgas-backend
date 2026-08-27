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
      FROM trucks
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
    const { driverAssigned } = filters;
    const conditions = [`t.status = 'ACTIVE'`];
    const params = [];

    if (driverAssigned !== undefined) {
      if (driverAssigned === true || driverAssigned === 'true') {
        conditions.push(`t.driver_id IS NOT NULL`);
      } else if (driverAssigned === false || driverAssigned === 'false') {
        conditions.push(`t.driver_id IS NULL`);
      }
    }

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
        u.first_name AS driver_first_name,
        u.last_name AS driver_last_name,
        u.phone AS driver_phone,
        u.username AS driver_username
      FROM trucks t
      LEFT JOIN users u ON t.driver_id = u.id
      WHERE ${conditions.join(' AND ')}
      ORDER BY t.plate_number ASC
    `;

    const result = await query(sql, params);
    return result.rows;
  }

  /**
   * Retrieves vehicle status and operational state by truck ID.
   * @param {string} truckId - Truck UUID
   */
  async getTruckStatusById(truckId) {
    const sql = `
      SELECT 
        t.id,
        t.plate_number,
        t.model,
        t.status,
        t.driver_id,
        u.first_name AS driver_first_name,
        u.last_name AS driver_last_name,
        u.phone AS driver_phone,
        u.username AS driver_username
      FROM trucks t
      LEFT JOIN users u ON t.driver_id = u.id
      WHERE t.id = $1
    `;

    const result = await query(sql, [truckId]);
    return result.rows[0] || null;
  }

  /**
   * Updates the availability status of a vehicle.
   * Preserves driver assignment when moving into UNDER_MAINTENANCE;
   * clears driver assignment only when DEACTIVATED/RETIRED (status = INACTIVE or RETIRED).
   * @param {string} truckId - Truck UUID
   * @param {string} status - New truck_status
   * @param {string|null} driverId - Driver UUID or null
   */
  async updateTruckStatus(truckId, status, driverId) {
    const sql = `
      UPDATE trucks
      SET status = $1, driver_id = $2
      WHERE id = $3
      RETURNING *
    `;

    const result = await query(sql, [status, driverId, truckId]);
    return result.rows[0] || null;
  }
}

module.exports = new AvailabilityRepository();
