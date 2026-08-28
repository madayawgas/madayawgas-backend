const { query } = require('../../../../database/connection');

/**
 * Products Repository
 * Handles parameterized SQL queries for the products table in the Inventory subsystem.
 */
class ProductsRepository {
  /**
   * Retrieves all products with optional filtering.
   * @param {Object} filters - { isActive, status, category, containerType, search }
   * @returns {Promise<Array>} List of product database rows
   */
  async getAllProducts(filters = {}) {
    const { isActive, status, category, containerType, search } = filters;
    const conditions = [];
    const params = [];
    let paramIndex = 1;

    // Filter by isActive boolean or status string
    if (isActive !== undefined && isActive !== null && isActive !== '') {
      const boolVal = isActive === true || isActive === 'true' || isActive === 1 || isActive === '1';
      conditions.push(`is_active = $${paramIndex++}`);
      params.push(boolVal);
    } else if (status) {
      if (status.toUpperCase() === 'ACTIVE') {
        conditions.push(`is_active = $${paramIndex++}`);
        params.push(true);
      } else if (status.toUpperCase() === 'INACTIVE') {
        conditions.push(`is_active = $${paramIndex++}`);
        params.push(false);
      }
    }

    // Filter by category
    if (category) {
      conditions.push(`category ILIKE $${paramIndex++}`);
      params.push(category.trim());
    }

    // Filter by containerType (CYLINDER, CANISTER)
    if (containerType) {
      conditions.push(`container_type = $${paramIndex++}`);
      params.push(containerType.toUpperCase().trim());
    }

    // Search by name or category
    if (search) {
      conditions.push(`(name ILIKE $${paramIndex} OR category ILIKE $${paramIndex})`);
      params.push(`%${search.trim()}%`);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const sql = `
      SELECT 
        id,
        name,
        category,
        container_type,
        net_weight_kg,
        is_active,
        created_at,
        updated_at
      FROM products
      ${whereClause}
      ORDER BY created_at DESC
    `;

    const result = await query(sql, params);
    return result.rows;
  }

  /**
   * Retrieves a single product by UUID.
   * @param {string} id - Product UUID
   * @returns {Promise<Object|null>} Product database row or null
   */
  async getProductById(id) {
    const sql = `
      SELECT 
        id,
        name,
        category,
        container_type,
        net_weight_kg,
        is_active,
        created_at,
        updated_at
      FROM products
      WHERE id = $1
    `;

    const result = await query(sql, [id]);
    return result.rows[0] || null;
  }

  /**
   * Finds a product by exact name (case-insensitive).
   * @param {string} name - Product Name
   * @returns {Promise<Object|null>} Product database row or null
   */
  async findProductByName(name) {
    const sql = `
      SELECT 
        id,
        name,
        category,
        container_type,
        net_weight_kg,
        is_active,
        created_at,
        updated_at
      FROM products
      WHERE LOWER(TRIM(name)) = LOWER(TRIM($1))
    `;

    const result = await query(sql, [name]);
    return result.rows[0] || null;
  }

  /**
   * Creates a new product record.
   * @param {Object} productData - { name, category, containerType, netWeightKg, isActive }
   * @returns {Promise<Object>} Created product database row
   */
  async createProduct({
    name,
    category,
    containerType,
    netWeightKg,
    isActive = true,
  }) {
    const sql = `
      INSERT INTO products (
        name,
        category,
        container_type,
        net_weight_kg,
        is_active
      )
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `;

    const result = await query(sql, [
      name,
      category,
      containerType,
      netWeightKg,
      isActive,
    ]);

    return result.rows[0];
  }

  /**
   * Updates an existing product record.
   * @param {string} id - Product UUID
   * @param {Object} updateData - Fields to update
   * @returns {Promise<Object|null>} Updated product database row or null
   */
  async updateProduct(id, updateData) {
    const fields = [];
    const params = [];
    let paramIndex = 1;

    if (updateData.name !== undefined) {
      fields.push(`name = $${paramIndex++}`);
      params.push(updateData.name);
    }

    if (updateData.category !== undefined) {
      fields.push(`category = $${paramIndex++}`);
      params.push(updateData.category);
    }

    if (updateData.containerType !== undefined) {
      fields.push(`container_type = $${paramIndex++}`);
      params.push(updateData.containerType);
    }

    if (updateData.netWeightKg !== undefined) {
      fields.push(`net_weight_kg = $${paramIndex++}`);
      params.push(updateData.netWeightKg);
    }

    if (updateData.isActive !== undefined) {
      fields.push(`is_active = $${paramIndex++}`);
      params.push(updateData.isActive);
    }

    if (fields.length === 0) {
      return this.getProductById(id);
    }

    params.push(id);
    const sql = `
      UPDATE products
      SET ${fields.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    const result = await query(sql, params);
    return result.rows[0] || null;
  }

  /**
   * Soft-deactivates a product by setting is_active to FALSE.
   * @param {string} id - Product UUID
   * @returns {Promise<Object|null>} Updated product database row or null
   */
  async deactivateProduct(id) {
    const sql = `
      UPDATE products
      SET is_active = FALSE
      WHERE id = $1
      RETURNING *
    `;

    const result = await query(sql, [id]);
    return result.rows[0] || null;
  }
}

module.exports = new ProductsRepository();
