const { query } = require('../../../../database/connection');

/**
 * Customer Repository
 * Handles parameterized SQL queries for the customers table in the Sales & Delivery subsystem.
 */
class CustomerRepository {
  /**
   * Retrieves all customers with optional filtering.
   * @param {Object} filters - { isActive, status, customerType, search }
   * @returns {Promise<Array>} List of customer database rows
   */
  async getAllCustomers(filters = {}) {
    const { isActive, status, customerType, search } = filters;
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

    // Filter by customerType (RETAIL, COMMERCIAL, WHOLESALE)
    if (customerType) {
      conditions.push(`customer_type = $${paramIndex++}`);
      params.push(customerType.toUpperCase().trim());
    }

    // Search across name, address, or contact_number
    if (search) {
      conditions.push(`(name ILIKE $${paramIndex} OR address ILIKE $${paramIndex} OR contact_number ILIKE $${paramIndex})`);
      params.push(`%${search.trim()}%`);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const sql = `
      SELECT 
        id,
        name,
        address,
        contact_number,
        customer_type,
        is_active,
        created_at,
        updated_at
      FROM customers
      ${whereClause}
      ORDER BY created_at DESC
    `;

    const result = await query(sql, params);
    return result.rows;
  }

  /**
   * Retrieves a single customer by UUID.
   * @param {string} id - Customer UUID
   * @returns {Promise<Object|null>} Customer database row or null
   */
  async getCustomerById(id) {
    const sql = `
      SELECT 
        id,
        name,
        address,
        contact_number,
        customer_type,
        is_active,
        created_at,
        updated_at
      FROM customers
      WHERE id = $1
    `;

    const result = await query(sql, [id]);
    return result.rows[0] || null;
  }

  /**
   * Finds a customer by exact name (case-insensitive).
   * @param {string} name - Customer Name
   * @returns {Promise<Object|null>} Customer database row or null
   */
  async findCustomerByName(name) {
    const sql = `
      SELECT 
        id,
        name,
        address,
        contact_number,
        customer_type,
        is_active,
        created_at,
        updated_at
      FROM customers
      WHERE LOWER(TRIM(name)) = LOWER(TRIM($1))
    `;

    const result = await query(sql, [name]);
    return result.rows[0] || null;
  }

  /**
   * Creates a new customer record.
   * @param {Object} customerData - { name, address, contactNumber, customerType, isActive }
   * @returns {Promise<Object>} Created customer database row
   */
  async createCustomer({
    name,
    address,
    contactNumber,
    customerType,
    isActive = true,
  }) {
    const sql = `
      INSERT INTO customers (
        name,
        address,
        contact_number,
        customer_type,
        is_active
      )
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `;

    const result = await query(sql, [
      name,
      address,
      contactNumber,
      customerType,
      isActive,
    ]);

    return result.rows[0];
  }

  /**
   * Updates an existing customer record.
   * @param {string} id - Customer UUID
   * @param {Object} updateData - Fields to update
   * @returns {Promise<Object|null>} Updated customer database row or null
   */
  async updateCustomer(id, updateData) {
    const fields = [];
    const params = [];
    let paramIndex = 1;

    if (updateData.name !== undefined) {
      fields.push(`name = $${paramIndex++}`);
      params.push(updateData.name);
    }

    if (updateData.address !== undefined) {
      fields.push(`address = $${paramIndex++}`);
      params.push(updateData.address);
    }

    if (updateData.contactNumber !== undefined || updateData.contact_number !== undefined) {
      fields.push(`contact_number = $${paramIndex++}`);
      params.push(updateData.contactNumber !== undefined ? updateData.contactNumber : updateData.contact_number);
    }

    if (updateData.customerType !== undefined || updateData.customer_type !== undefined) {
      fields.push(`customer_type = $${paramIndex++}`);
      params.push(updateData.customerType !== undefined ? updateData.customerType : updateData.customer_type);
    }

    if (updateData.isActive !== undefined || updateData.is_active !== undefined) {
      fields.push(`is_active = $${paramIndex++}`);
      params.push(updateData.isActive !== undefined ? updateData.isActive : updateData.is_active);
    }

    if (fields.length === 0) {
      return this.getCustomerById(id);
    }

    params.push(id);
    const sql = `
      UPDATE customers
      SET ${fields.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    const result = await query(sql, params);
    return result.rows[0] || null;
  }

  /**
   * Soft-deactivates a customer by setting is_active to FALSE.
   * @param {string} id - Customer UUID
   * @returns {Promise<Object|null>} Updated customer database row or null
   */
  async deactivateCustomer(id) {
    const sql = `
      UPDATE customers
      SET is_active = FALSE
      WHERE id = $1
      RETURNING *
    `;

    const result = await query(sql, [id]);
    return result.rows[0] || null;
  }
}

module.exports = new CustomerRepository();
