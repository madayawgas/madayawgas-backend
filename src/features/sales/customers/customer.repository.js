const { query: defaultQuery } = require('../../../../database/connection');

/**
 * Customer Repository
 * Handles parameterized SQL operations for the customers table and canister_ledger aggregation.
 */
class CustomerRepository {
  /**
   * Helper to normalize client runner.
   * If first argument is a pg client with .query, returns [client.query.bind(client), secondArg, thirdArg].
   */
  _resolveRunner(clientOrParam, ...rest) {
    if (clientOrParam && typeof clientOrParam.query === 'function') {
      return [clientOrParam.query.bind(clientOrParam), ...rest];
    }
    if (clientOrParam === null || clientOrParam === undefined) {
      return [defaultQuery, ...rest];
    }
    return [defaultQuery, clientOrParam, ...rest];
  }

  /**
   * Retrieves paginated or complete customer list with optional filtering and net canister debt aggregation.
   * @param {Object} [client] - Optional database client
   * @param {Object} [filters] - { search, zoneId, customerType, isActive, status }
   * @param {Object} [pagination] - { page, limit, offset, sortColumn, sortOrder }
   * @returns {Promise<Array|{rows: Array, total: number}>}
   */
  async findPaginatedCustomers(client, filters = {}, pagination = null) {
    const [dbQuery, actualFilters, actualPagination] = this._resolveRunner(client, filters, pagination);
    const { isActive, status, customerType, zoneId, search } = actualFilters || {};

    const conditions = [];
    const params = [];
    let paramIndex = 1;

    // Filter by isActive boolean or status string
    if (isActive !== undefined && isActive !== null && isActive !== '') {
      const boolVal = isActive === true || isActive === 'true' || isActive === 1 || isActive === '1';
      conditions.push(`c.is_active = $${paramIndex++}`);
      params.push(boolVal);
    } else if (status) {
      if (status.toUpperCase() === 'ACTIVE') {
        conditions.push(`c.is_active = $${paramIndex++}`);
        params.push(true);
      } else if (status.toUpperCase() === 'INACTIVE') {
        conditions.push(`c.is_active = $${paramIndex++}`);
        params.push(false);
      }
    }

    // Filter by customerType
    if (customerType && typeof customerType === 'string' && customerType.trim() !== '') {
      conditions.push(`c.customer_type = $${paramIndex++}`);
      params.push(customerType.toUpperCase().trim());
    }

    // Filter by zoneId
    if (zoneId && typeof zoneId === 'string' && zoneId.trim() !== '') {
      conditions.push(`c.zone_id = $${paramIndex++}`);
      params.push(zoneId.trim());
    }

    // Search across business_name, contact_person, name, or contact_number
    if (search && typeof search === 'string' && search.trim() !== '') {
      const rawSearch = search.trim();
      const searchPlaceholder = `$${paramIndex++}`;
      params.push(`%${rawSearch}%`);

      // If digits present, also match against sanitized phone numbers (e.g. 0917 -> 917)
      const digitsOnly = rawSearch.replace(/\D/g, '');
      let phoneClause = '';
      if (digitsOnly.length >= 7) {
        const strippedPhone = digitsOnly.startsWith('0')
          ? digitsOnly.slice(1)
          : (digitsOnly.startsWith('63') ? digitsOnly.slice(2) : digitsOnly);
        const phonePlaceholder = `$${paramIndex++}`;
        phoneClause = ` OR c.contact_number ILIKE ${phonePlaceholder}`;
        params.push(`%${strippedPhone}%`);
      }

      conditions.push(`(
        c.business_name ILIKE ${searchPlaceholder} OR 
        c.contact_person ILIKE ${searchPlaceholder} OR 
        c.name ILIKE ${searchPlaceholder} OR 
        c.contact_number ILIKE ${searchPlaceholder} OR
        c.delivery_address ILIKE ${searchPlaceholder} OR
        c.address ILIKE ${searchPlaceholder}${phoneClause}
      )`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    if (!actualPagination) {
      const sql = `
        SELECT 
          c.id,
          c.customer_type,
          c.business_name,
          c.contact_person,
          c.contact_number,
          c.alternate_contact_number,
          c.tin,
          c.delivery_address,
          c.zone_id,
          z.name AS zone_name,
          z.code AS zone_code,
          c.is_active,
          c.name,
          c.address,
          c.created_by,
          u.username AS created_by_username,
          CONCAT(u.first_name, ' ', u.last_name) AS created_by_name,
          COALESCE(cl_agg.total_debt, 0)::int AS total_net_canister_debt,
          c.created_at,
          c.updated_at
        FROM customers c
        LEFT JOIN service_zones z ON z.id = c.zone_id
        LEFT JOIN users u ON u.id = c.created_by
        LEFT JOIN (
          SELECT customer_id, SUM(quantity_loaned - quantity_returned) AS total_debt
          FROM canister_ledger
          GROUP BY customer_id
        ) cl_agg ON cl_agg.customer_id = c.id
        ${whereClause}
        ORDER BY c.created_at DESC, c.id DESC
      `;

      const result = await dbQuery(sql, params);
      return result.rows;
    }

    const sortColumn = actualPagination.sortColumn || 'c.created_at';
    const sortOrder = actualPagination.sortOrder === 'ASC' ? 'ASC' : 'DESC';
    const limit = actualPagination.limit || 20;
    const offset = actualPagination.offset || 0;

    const dataParams = [...params, limit, offset];
    const limitPlaceholder = `$${params.length + 1}`;
    const offsetPlaceholder = `$${params.length + 2}`;

    const dataSql = `
      SELECT 
        c.id,
        c.customer_type,
        c.business_name,
        c.contact_person,
        c.contact_number,
        c.alternate_contact_number,
        c.tin,
        c.delivery_address,
        c.zone_id,
        z.name AS zone_name,
        z.code AS zone_code,
        c.is_active,
        c.name,
        c.address,
        c.created_by,
        u.username AS created_by_username,
        CONCAT(u.first_name, ' ', u.last_name) AS created_by_name,
        COALESCE(cl_agg.total_debt, 0)::int AS total_net_canister_debt,
        c.created_at,
        c.updated_at
      FROM customers c
      LEFT JOIN service_zones z ON z.id = c.zone_id
      LEFT JOIN users u ON u.id = c.created_by
      LEFT JOIN (
        SELECT customer_id, SUM(quantity_loaned - quantity_returned) AS total_debt
        FROM canister_ledger
        GROUP BY customer_id
      ) cl_agg ON cl_agg.customer_id = c.id
      ${whereClause}
      ORDER BY ${sortColumn} ${sortOrder}, c.id DESC
      LIMIT ${limitPlaceholder} OFFSET ${offsetPlaceholder}
    `;

    const countSql = `
      SELECT COUNT(*) AS count
      FROM customers c
      LEFT JOIN service_zones z ON z.id = c.zone_id
      ${whereClause}
    `;

    const [dataRes, countRes] = await Promise.all([
      dbQuery(dataSql, dataParams),
      dbQuery(countSql, params),
    ]);

    return {
      rows: dataRes.rows,
      total: parseInt(countRes.rows[0]?.count || 0, 10),
    };
  }

  /**
   * Retrieves a single customer profile by UUID along with zone and creator user details.
   * @param {Object} [client] - Optional db client
   * @param {string} customerId - Customer UUID
   * @returns {Promise<Object|null>}
   */
  async findCustomerById(client, customerId) {
    const [dbQuery, actualId] = this._resolveRunner(client, customerId);

    const sql = `
      SELECT 
        c.id,
        c.customer_type,
        c.business_name,
        c.contact_person,
        c.contact_number,
        c.alternate_contact_number,
        c.tin,
        c.delivery_address,
        c.zone_id,
        z.name AS zone_name,
        z.code AS zone_code,
        c.is_active,
        c.name,
        c.address,
        c.created_by,
        u.username AS created_by_username,
        CONCAT(u.first_name, ' ', u.last_name) AS created_by_name,
        c.created_at,
        c.updated_at
      FROM customers c
      LEFT JOIN service_zones z ON z.id = c.zone_id
      LEFT JOIN users u ON u.id = c.created_by
      WHERE c.id = $1
    `;

    const result = await dbQuery(sql, [actualId]);
    return result.rows[0] || null;
  }

  /**
   * Aggregates active canister receivables per product SKU from canister_ledger.
   * @param {Object} [client] - Optional db client
   * @param {string} customerId - Customer UUID
   * @returns {Promise<Array>} Array of SKU balances
   */
  async findCustomerCanisterBalances(client, customerId) {
    const [dbQuery, actualId] = this._resolveRunner(client, customerId);

    const sql = `
      SELECT 
        cl.product_id,
        p.name AS product_name,
        p.category,
        p.container_type,
        p.net_weight_kg,
        COALESCE(SUM(cl.quantity_loaned - cl.quantity_returned), 0)::int AS net_balance,
        COALESCE(SUM(cl.quantity_loaned), 0)::int AS total_loaned,
        COALESCE(SUM(cl.quantity_returned), 0)::int AS total_returned
      FROM canister_ledger cl
      JOIN products p ON p.id = cl.product_id
      WHERE cl.customer_id = $1
      GROUP BY cl.product_id, p.name, p.category, p.container_type, p.net_weight_kg
      ORDER BY p.name ASC
    `;

    const result = await dbQuery(sql, [actualId]);
    return result.rows;
  }

  /**
   * Finds customer by exact name (case-insensitive) for duplication checking.
   * @param {Object} [client] - Optional db client
   * @param {string} name - Name to look up
   * @returns {Promise<Object|null>}
   */
  async findCustomerByName(client, name) {
    const [dbQuery, actualName] = this._resolveRunner(client, name);

    const sql = `
      SELECT *
      FROM customers
      WHERE LOWER(TRIM(name)) = LOWER(TRIM($1))
         OR LOWER(TRIM(COALESCE(business_name, ''))) = LOWER(TRIM($1))
      LIMIT 1
    `;

    const result = await dbQuery(sql, [actualName]);
    return result.rows[0] || null;
  }

  /**
   * Inserts a new customer record with optional client-generated UUID and upsert handling.
   * @param {Object} [client] - Optional db client
   * @param {Object} customerData
   * @returns {Promise<Object>}
   */
  async insertCustomer(client, customerData) {
    const [dbQuery, data] = this._resolveRunner(client, customerData);

    const {
      id = null,
      customerType,
      customer_type,
      businessName,
      business_name,
      contactPerson,
      contact_person,
      name,
      contactNumber,
      contact_number,
      alternateContactNumber,
      alternate_contact_number,
      tin,
      deliveryAddress,
      delivery_address,
      address,
      zoneId,
      zone_id,
      createdBy,
      created_by,
      isActive = true,
      is_active,
    } = data;

    const resolvedCustomerType = customerType || customer_type || 'COMMERCIAL';
    const resolvedBusinessName = businessName !== undefined ? businessName : (business_name || null);
    const resolvedContactPerson = contactPerson || contact_person || name || 'Customer';
    const resolvedContactNumber = contactNumber || contact_number;
    const resolvedAltContact = alternateContactNumber !== undefined ? alternateContactNumber : (alternate_contact_number || null);
    const resolvedTin = tin !== undefined ? tin : null;
    const resolvedAddress = deliveryAddress || delivery_address || address || '';
    const resolvedZoneId = zoneId || zone_id || null;
    const resolvedCreatedBy = createdBy || created_by || null;
    const resolvedIsActive = isActive !== undefined ? Boolean(isActive) : (is_active !== undefined ? Boolean(is_active) : true);

    const sql = `
      INSERT INTO customers (
        id,
        customer_type,
        business_name,
        contact_person,
        contact_number,
        alternate_contact_number,
        tin,
        delivery_address,
        zone_id,
        created_by,
        is_active
      )
      VALUES (
        COALESCE($1, gen_random_uuid()),
        $2, $3, $4, $5, $6, $7, $8, $9, $10, $11
      )
      ON CONFLICT (id) DO UPDATE SET
        customer_type = EXCLUDED.customer_type,
        business_name = EXCLUDED.business_name,
        contact_person = EXCLUDED.contact_person,
        contact_number = EXCLUDED.contact_number,
        alternate_contact_number = EXCLUDED.alternate_contact_number,
        tin = EXCLUDED.tin,
        delivery_address = EXCLUDED.delivery_address,
        zone_id = EXCLUDED.zone_id,
        is_active = EXCLUDED.is_active,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `;

    const result = await dbQuery(sql, [
      id,
      resolvedCustomerType,
      resolvedBusinessName,
      resolvedContactPerson,
      resolvedContactNumber,
      resolvedAltContact,
      resolvedTin,
      resolvedAddress,
      resolvedZoneId,
      resolvedCreatedBy,
      resolvedIsActive,
    ]);

    return result.rows[0];
  }

  /**
   * Updates an existing customer profile.
   * @param {Object} [client] - Optional db client
   * @param {string} customerId - Customer UUID
   * @param {Object} updateData - Fields to update
   * @returns {Promise<Object|null>}
   */
  async updateCustomer(client, customerId, updateData) {
    const [dbQuery, actualId, actualData] = this._resolveRunner(client, customerId, updateData);

    const fields = [];
    const params = [];
    let paramIndex = 1;

    if (actualData.businessName !== undefined || actualData.business_name !== undefined) {
      fields.push(`business_name = $${paramIndex++}`);
      params.push(actualData.businessName !== undefined ? actualData.businessName : actualData.business_name);
    }

    if (actualData.contactPerson !== undefined || actualData.contact_person !== undefined) {
      const val = actualData.contactPerson !== undefined ? actualData.contactPerson : actualData.contact_person;
      fields.push(`contact_person = $${paramIndex++}`);
      params.push(val);
    } else if (actualData.name !== undefined) {
      fields.push(`name = $${paramIndex++}`);
      params.push(actualData.name);
    }

    if (actualData.contactNumber !== undefined || actualData.contact_number !== undefined) {
      fields.push(`contact_number = $${paramIndex++}`);
      params.push(actualData.contactNumber !== undefined ? actualData.contactNumber : actualData.contact_number);
    }

    if (actualData.alternateContactNumber !== undefined || actualData.alternate_contact_number !== undefined) {
      fields.push(`alternate_contact_number = $${paramIndex++}`);
      params.push(actualData.alternateContactNumber !== undefined ? actualData.alternateContactNumber : actualData.alternate_contact_number);
    }

    if (actualData.tin !== undefined) {
      fields.push(`tin = $${paramIndex++}`);
      params.push(actualData.tin);
    }

    if (actualData.deliveryAddress !== undefined || actualData.delivery_address !== undefined) {
      const addr = actualData.deliveryAddress !== undefined ? actualData.deliveryAddress : actualData.delivery_address;
      fields.push(`delivery_address = $${paramIndex++}`);
      params.push(addr);
    } else if (actualData.address !== undefined) {
      fields.push(`address = $${paramIndex++}`);
      params.push(actualData.address);
    }

    if (actualData.zoneId !== undefined || actualData.zone_id !== undefined) {
      fields.push(`zone_id = $${paramIndex++}`);
      params.push(actualData.zoneId !== undefined ? actualData.zoneId : actualData.zone_id);
    }

    if (actualData.customerType !== undefined || actualData.customer_type !== undefined) {
      const type = actualData.customerType !== undefined ? actualData.customerType : actualData.customer_type;
      fields.push(`customer_type = $${paramIndex++}`);
      params.push(type);
    }

    if (actualData.isActive !== undefined || actualData.is_active !== undefined) {
      const active = actualData.isActive !== undefined ? actualData.isActive : actualData.is_active;
      fields.push(`is_active = $${paramIndex++}`);
      params.push(active);
    }

    if (fields.length === 0) {
      return this.findCustomerById(dbQuery, actualId);
    }

    params.push(actualId);
    const sql = `
      UPDATE customers
      SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    const result = await dbQuery(sql, params);
    return result.rows[0] || null;
  }

  /**
   * Sets customer activation status (active or inactive).
   * @param {Object} [client] - Optional db client
   * @param {string} customerId - Customer UUID
   * @param {boolean} isActive - New status
   * @returns {Promise<Object|null>}
   */
  async setCustomerActiveStatus(client, customerId, isActive) {
    const [dbQuery, actualId, actualActive] = this._resolveRunner(client, customerId, isActive);

    const sql = `
      UPDATE customers
      SET is_active = $2, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
    `;

    const result = await dbQuery(sql, [actualId, Boolean(actualActive)]);
    return result.rows[0] || null;
  }

  // ============================================================
  // Backward Compatibility Aliases for Legacy Tests & Calls
  // ============================================================

  async getAllCustomers(filters = {}, pagination = null) {
    return this.findPaginatedCustomers(null, filters, pagination);
  }

  async getCustomerById(id) {
    return this.findCustomerById(null, id);
  }

  async createCustomer(customerData) {
    return this.insertCustomer(null, customerData);
  }

  async deactivateCustomer(id) {
    return this.setCustomerActiveStatus(null, id, false);
  }
}

module.exports = new CustomerRepository();
