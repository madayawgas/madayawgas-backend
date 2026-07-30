const db = require('../../config/database');

class DeliveryRepository {
  async findAll() {
    const queryText = `
      SELECT d.*, u.name as driver_name 
      FROM deliveries d 
      LEFT JOIN users u ON d.driver_id = u.id 
      ORDER BY d.created_at DESC
    `;
    const result = await db.query(queryText);
    return result.rows;
  }

  async findById(id) {
    const queryText = 'SELECT * FROM deliveries WHERE id = $1';
    const result = await db.query(queryText, [id]);
    return result.rows[0] || null;
  }

  async create({ customer_name, delivery_address, driver_id, status = 'pending' }) {
    const queryText = `
      INSERT INTO deliveries (customer_name, delivery_address, driver_id, status, created_at, updated_at)
      VALUES ($1, $2, $3, $4, NOW(), NOW())
      RETURNING *
    `;
    const values = [customer_name, delivery_address, driver_id || null, status];
    const result = await db.query(queryText, values);
    return result.rows[0];
  }

  async updateStatus(id, { status, driver_id }) {
    let queryText = 'UPDATE deliveries SET status = $1';
    const values = [status];

    if (driver_id) {
      values.push(driver_id);
      queryText += `, driver_id = $${values.length}`;
    }

    values.push(id);
    queryText += `, updated_at = NOW() WHERE id = $${values.length} RETURNING *`;

    const result = await db.query(queryText, values);
    return result.rows[0] || null;
  }
}

module.exports = new DeliveryRepository();
