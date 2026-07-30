const db = require('../../config/database');

/**
 * Repository layer handling database operations for Inventory
 */
class InventoryRepository {
  /**
   * Get list of inventory items with search, filter, and pagination
   */
  async findAll({ category, search, page = 1, limit = 10 }) {
    const offset = (page - 1) * limit;
    const values = [];
    let queryText = 'SELECT * FROM inventory WHERE 1=1';

    if (category) {
      values.push(category);
      queryText += ` AND category = $${values.length}`;
    }

    if (search) {
      values.push(`%${search}%`);
      queryText += ` AND (name ILIKE $${values.length} OR sku ILIKE $${values.length})`;
    }

    // Count total matching rows
    const countResult = await db.query(
      `SELECT COUNT(*) FROM (${queryText}) AS count_tbl`,
      values
    );
    const totalItems = parseInt(countResult.rows[0].count, 10);

    // Fetch paginated results
    values.push(limit, offset);
    queryText += ` ORDER BY created_at DESC LIMIT $${values.length - 1} OFFSET $${values.length}`;

    const result = await db.query(queryText, values);

    return {
      items: result.rows,
      pagination: {
        totalItems,
        currentPage: page,
        totalPages: Math.ceil(totalItems / limit) || 1,
        limit,
      },
    };
  }

  /**
   * Find a single inventory item by ID
   */
  async findById(id) {
    const queryText = 'SELECT * FROM inventory WHERE id = $1';
    const result = await db.query(queryText, [id]);
    return result.rows[0] || null;
  }

  /**
   * Find item by SKU
   */
  async findBySku(sku) {
    const queryText = 'SELECT * FROM inventory WHERE sku = $1';
    const result = await db.query(queryText, [sku]);
    return result.rows[0] || null;
  }

  /**
   * Insert new inventory item
   */
  async create({ name, sku, category, quantity, unit_price, reorder_level }) {
    const queryText = `
      INSERT INTO inventory (name, sku, category, quantity, unit_price, reorder_level, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
      RETURNING *
    `;
    const values = [name, sku, category, quantity, unit_price, reorder_level];
    const result = await db.query(queryText, values);
    return result.rows[0];
  }

  /**
   * Update an existing inventory item
   */
  async update(id, updateFields) {
    const keys = Object.keys(updateFields);
    if (keys.length === 0) return this.findById(id);

    const setClause = keys
      .map((key, index) => `${key} = $${index + 2}`)
      .join(', ');

    const queryText = `
      UPDATE inventory
      SET ${setClause}, updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `;

    const values = [id, ...Object.values(updateFields)];
    const result = await db.query(queryText, values);
    return result.rows[0] || null;
  }

  /**
   * Delete an inventory item
   */
  async delete(id) {
    const queryText = 'DELETE FROM inventory WHERE id = $1 RETURNING *';
    const result = await db.query(queryText, [id]);
    return result.rows[0] || null;
  }
}

module.exports = new InventoryRepository();
