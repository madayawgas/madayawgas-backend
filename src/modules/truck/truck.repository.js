const db = require('../../config/database');

/**
 * Repository layer for Truck database operations
 */
class TruckRepository {
  async findAll() {
    const result = await db.query('SELECT * FROM trucks ORDER BY id');
    return result.rows;
  }

  async findById(id) {
    const result = await db.query('SELECT * FROM trucks WHERE id = $1', [id]);
    return result.rows[0] || null;
  }

  async findAvailable() {
    const result = await db.query(
      "SELECT * FROM trucks WHERE status = 'Available' ORDER BY plate_number"
    );
    return result.rows;
  }

  async findByStatus(status) {
    const result = await db.query(
      'SELECT * FROM trucks WHERE status = $1 ORDER BY plate_number',
      [status]
    );
    return result.rows;
  }

  async findMaintenanceLogs(truckId) {
    const result = await db.query(
      `SELECT id, date, type, mechanic, remarks 
       FROM maintenance_logs 
       WHERE truck_id = $1 
       ORDER BY date DESC`,
      [truckId]
    );
    return result.rows;
  }

  async updateFuelLevel(id, fuelLevel) {
    const result = await db.query(
      'UPDATE trucks SET fuel_level = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
      [fuelLevel, id]
    );
    return result.rows[0] || null;
  }

  async create({ plateNumber, model, capacityKg, assignedDriverId, fuelLevel, status }) {
    const result = await db.query(
      `INSERT INTO trucks (plate_number, model, capacity_kg, assigned_driver_id, fuel_level, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
       RETURNING *`,
      [plateNumber, model, capacityKg, assignedDriverId, fuelLevel, status || 'Available']
    );
    return result.rows[0];
  }

  async deleteById(id) {
    const result = await db.query('DELETE FROM trucks WHERE id = $1 RETURNING *', [id]);
    return result.rows[0] || null;
  }
}

module.exports = new TruckRepository();
