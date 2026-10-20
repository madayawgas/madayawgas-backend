const { query: defaultQuery } = require('../../../../database/connection');

/**
 * Invoices Repository
 * Handles parameterized SQL operations for sales_invoices.
 */
class InvoicesRepository {
  /**
   * Helper to normalize client runner.
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
   * Retrieves paginated or complete invoices list with optional filters.
   * @param {Object} [client]
   * @param {Object} [filters] - { tripId, paymentMethod, paymentStatus, search, startDate, endDate, recordedBy }
   * @param {Object} [pagination] - { page, limit, offset, sortColumn, sortOrder }
   * @returns {Promise<Array|{rows: Array, total: number}>}
   */
  async findPaginatedInvoices(client, filters = {}, pagination = null) {
    const [dbQuery, actualFilters, actualPagination] = this._resolveRunner(client, filters, pagination);
    const {
      tripId,
      trip_id,
      paymentMethod,
      payment_method,
      paymentStatus,
      payment_status,
      search,
      startDate,
      endDate,
      recordedBy,
      recorded_by,
    } = actualFilters || {};

    const conditions = [];
    const params = [];
    let paramIndex = 1;

    const resolvedTripId = tripId || trip_id;
    if (resolvedTripId) {
      conditions.push(`st.trip_id = $${paramIndex++}`);
      params.push(resolvedTripId);
    }

    const resolvedPaymentMethod = paymentMethod || payment_method;
    if (resolvedPaymentMethod) {
      conditions.push(`si.payment_method = $${paramIndex++}`);
      params.push(resolvedPaymentMethod.toUpperCase().trim());
    }

    const resolvedPaymentStatus = paymentStatus || payment_status;
    if (resolvedPaymentStatus) {
      conditions.push(`si.payment_status = $${paramIndex++}`);
      params.push(resolvedPaymentStatus.toUpperCase().trim());
    }

    const resolvedRecordedBy = recordedBy || recorded_by;
    if (resolvedRecordedBy) {
      conditions.push(`st.recorded_by = $${paramIndex++}`);
      params.push(resolvedRecordedBy);
    }

    if (startDate) {
      conditions.push(`si.transacted_at >= $${paramIndex++}`);
      params.push(startDate);
    }

    if (endDate) {
      conditions.push(`si.transacted_at <= $${paramIndex++}`);
      params.push(endDate);
    }

    if (search && typeof search === 'string' && search.trim() !== '') {
      const searchPlaceholder = `$${paramIndex++}`;
      conditions.push(`(
        si.invoice_number ILIKE ${searchPlaceholder} OR
        si.declaration_number ILIKE ${searchPlaceholder} OR
        si.payment_reference_number ILIKE ${searchPlaceholder} OR
        st.transaction_no ILIKE ${searchPlaceholder} OR
        c.name ILIKE ${searchPlaceholder} OR
        c.business_name ILIKE ${searchPlaceholder} OR
        c.contact_person ILIKE ${searchPlaceholder}
      )`);
      params.push(`%${search.trim()}%`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    if (!actualPagination) {
      const sql = `
        SELECT 
          si.id,
          si.transaction_id,
          si.invoice_number,
          si.declaration_number,
          si.total_amount,
          si.payment_method,
          si.payment_status,
          si.payment_reference_number,
          si.payment_proof_key,
          si.verified_by,
          vu.username AS verified_by_username,
          CONCAT(vu.first_name, ' ', vu.last_name) AS verified_by_name,
          si.verified_at,
          si.transacted_at,
          si.synced_at,
          si.created_at,
          si.updated_at,
          st.transaction_no,
          st.trip_id,
          st.status AS transaction_status,
          st.recorded_by,
          c.id AS customer_id,
          c.name AS customer_name,
          c.business_name AS customer_business_name,
          c.contact_person AS customer_contact_person
        FROM sales_invoices si
        JOIN sales_transactions st ON st.id = si.transaction_id
        JOIN customers c ON c.id = st.customer_id
        LEFT JOIN users vu ON vu.id = si.verified_by
        ${whereClause}
        ORDER BY si.transacted_at DESC, si.created_at DESC
      `;

      const result = await dbQuery(sql, params);
      return result.rows;
    }

    const { limit, offset, sortColumn = 'si.transacted_at', sortOrder = 'DESC' } = actualPagination;
    const limitPlaceholder = `$${params.length + 1}`;
    const offsetPlaceholder = `$${params.length + 2}`;

    const dataSql = `
      SELECT 
        si.id,
        si.transaction_id,
        si.invoice_number,
        si.declaration_number,
        si.total_amount,
        si.payment_method,
        si.payment_status,
        si.payment_reference_number,
        si.payment_proof_key,
        si.verified_by,
        vu.username AS verified_by_username,
        CONCAT(vu.first_name, ' ', vu.last_name) AS verified_by_name,
        si.verified_at,
        si.transacted_at,
        si.synced_at,
        si.created_at,
        si.updated_at,
        st.transaction_no,
        st.trip_id,
        st.status AS transaction_status,
        st.recorded_by,
        c.id AS customer_id,
        c.name AS customer_name,
        c.business_name AS customer_business_name,
        c.contact_person AS customer_contact_person
      FROM sales_invoices si
      JOIN sales_transactions st ON st.id = si.transaction_id
      JOIN customers c ON c.id = st.customer_id
      LEFT JOIN users vu ON vu.id = si.verified_by
      ${whereClause}
      ORDER BY ${sortColumn} ${sortOrder}, si.id DESC
      LIMIT ${limitPlaceholder} OFFSET ${offsetPlaceholder}
    `;

    const countSql = `
      SELECT COUNT(*) AS count
      FROM sales_invoices si
      JOIN sales_transactions st ON st.id = si.transaction_id
      JOIN customers c ON c.id = st.customer_id
      ${whereClause}
    `;

    const [dataResult, countResult] = await Promise.all([
      dbQuery(dataSql, [...params, limit, offset]),
      dbQuery(countSql, params),
    ]);

    return {
      rows: dataResult.rows,
      total: parseInt(countResult.rows[0]?.count || 0, 10),
    };
  }

  /**
   * Retrieves an invoice by UUID with linked transaction and customer.
   * @param {Object} [client]
   * @param {string} id - Invoice UUID
   * @returns {Promise<Object|null>}
   */
  async getInvoiceById(client, id) {
    const [dbQuery, actualId] = this._resolveRunner(client, id);

    const sql = `
      SELECT 
        si.id,
        si.transaction_id,
        si.invoice_number,
        si.declaration_number,
        si.total_amount,
        si.payment_method,
        si.payment_status,
        si.payment_reference_number,
        si.payment_proof_key,
        si.verified_by,
        vu.username AS verified_by_username,
        CONCAT(vu.first_name, ' ', vu.last_name) AS verified_by_name,
        si.verified_at,
        si.transacted_at,
        si.synced_at,
        si.created_at,
        si.updated_at,
        st.transaction_no,
        st.trip_id,
        st.status AS transaction_status,
        st.recorded_by,
        c.id AS customer_id,
        c.name AS customer_name,
        c.business_name AS customer_business_name,
        c.contact_person AS customer_contact_person,
        c.contact_number AS customer_contact_number,
        c.delivery_address AS customer_delivery_address
      FROM sales_invoices si
      JOIN sales_transactions st ON st.id = si.transaction_id
      JOIN customers c ON c.id = st.customer_id
      LEFT JOIN users vu ON vu.id = si.verified_by
      WHERE si.id = $1
    `;

    const res = await dbQuery(sql, [actualId]);
    return res.rows[0] || null;
  }

  /**
   * Retrieves an invoice by transaction ID.
   * @param {Object} [client]
   * @param {string} transactionId - Transaction UUID
   * @returns {Promise<Object|null>}
   */
  async getInvoiceByTransactionId(client, transactionId) {
    const [dbQuery, actualId] = this._resolveRunner(client, transactionId);

    const sql = `
      SELECT 
        si.id,
        si.transaction_id,
        si.invoice_number,
        si.declaration_number,
        si.total_amount,
        si.payment_method,
        si.payment_status,
        si.payment_reference_number,
        si.payment_proof_key,
        si.verified_by,
        si.verified_at,
        si.transacted_at,
        si.synced_at,
        si.created_at,
        si.updated_at
      FROM sales_invoices si
      WHERE si.transaction_id = $1
    `;

    const res = await dbQuery(sql, [actualId]);
    return res.rows[0] || null;
  }

  /**
   * Retrieves an invoice by unique invoice number.
   * @param {Object} [client]
   * @param {string} invoiceNumber - Invoice number
   * @returns {Promise<Object|null>}
   */
  async getInvoiceByNumber(client, invoiceNumber) {
    const [dbQuery, actualNumber] = this._resolveRunner(client, invoiceNumber);

    const sql = `
      SELECT 
        si.id,
        si.transaction_id,
        si.invoice_number,
        si.declaration_number,
        si.total_amount,
        si.payment_method,
        si.payment_status,
        si.payment_reference_number,
        si.payment_proof_key,
        si.verified_by,
        si.verified_at,
        si.transacted_at,
        si.synced_at,
        si.created_at,
        si.updated_at
      FROM sales_invoices si
      WHERE si.invoice_number = $1
    `;

    const res = await dbQuery(sql, [actualNumber]);
    return res.rows[0] || null;
  }

  /**
   * Verifies an invoice payment.
   * @param {Object} [client]
   * @param {string} id - Invoice UUID
   * @param {string} verifiedBy - User UUID
   * @returns {Promise<Object|null>} Updated invoice row
   */
  async verifyInvoicePayment(client, id, verifiedBy) {
    const [dbQuery, actualId] = this._resolveRunner(client, id);

    const sql = `
      UPDATE sales_invoices
      SET 
        payment_status = 'VERIFIED',
        verified_by = $2,
        verified_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *;
    `;

    const res = await dbQuery(sql, [actualId, verifiedBy]);
    return res.rows[0] || null;
  }
}

module.exports = new InvoicesRepository();
