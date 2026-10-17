const { query: defaultQuery } = require('../../../../database/connection');

/**
 * Transactions Repository
 * Handles parameterized SQL operations for sales_transactions, sales_transaction_items,
 * shift closeout summaries, and cross-subsystem reconciliation hooks.
 */
class TransactionsRepository {
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
   * Retrieves paginated or complete transactions list with filtering.
   * @param {Object} [client]
   * @param {Object} [filters] - { tripId, customerId, status, paymentMethod, search, startDate, endDate, recordedBy }
   * @param {Object} [pagination] - { page, limit, offset, sortColumn, sortOrder }
   * @returns {Promise<Array|{rows: Array, total: number}>}
   */
  async findPaginatedTransactions(client, filters = {}, pagination = null) {
    const [dbQuery, actualFilters, actualPagination] = this._resolveRunner(client, filters, pagination);
    const {
      tripId,
      trip_id,
      customerId,
      customer_id,
      status,
      paymentMethod,
      payment_method,
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

    const resolvedCustomerId = customerId || customer_id;
    if (resolvedCustomerId) {
      conditions.push(`st.customer_id = $${paramIndex++}`);
      params.push(resolvedCustomerId);
    }

    if (status) {
      conditions.push(`st.status = $${paramIndex++}`);
      params.push(status.toUpperCase().trim());
    }

    const resolvedPaymentMethod = paymentMethod || payment_method;
    if (resolvedPaymentMethod) {
      conditions.push(`si.payment_method = $${paramIndex++}`);
      params.push(resolvedPaymentMethod.toUpperCase().trim());
    }

    const resolvedRecordedBy = recordedBy || recorded_by;
    if (resolvedRecordedBy) {
      conditions.push(`st.recorded_by = $${paramIndex++}`);
      params.push(resolvedRecordedBy);
    }

    if (startDate) {
      conditions.push(`st.transacted_at >= $${paramIndex++}`);
      params.push(startDate);
    }

    if (endDate) {
      conditions.push(`st.transacted_at <= $${paramIndex++}`);
      params.push(endDate);
    }

    if (search && typeof search === 'string' && search.trim() !== '') {
      const searchPlaceholder = `$${paramIndex++}`;
      conditions.push(`(
        st.transaction_no ILIKE ${searchPlaceholder} OR
        si.invoice_number ILIKE ${searchPlaceholder} OR
        si.declaration_number ILIKE ${searchPlaceholder} OR
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
          st.id,
          st.transaction_no,
          st.trip_id,
          st.customer_id,
          c.name AS customer_name,
          c.business_name AS customer_business_name,
          c.contact_person AS customer_contact_person,
          c.contact_number AS customer_contact_number,
          st.recorded_by,
          u.username AS recorded_by_username,
          CONCAT(u.first_name, ' ', u.last_name) AS recorded_by_name,
          st.status,
          st.cancellation_reason,
          st.cancelled_by,
          st.cancelled_at,
          st.transacted_at,
          st.synced_at,
          st.created_at,
          st.updated_at,
          si.id AS invoice_id,
          si.invoice_number,
          si.declaration_number,
          si.total_amount,
          si.payment_method,
          si.payment_status,
          si.payment_reference_number,
          si.payment_proof_key
        FROM sales_transactions st
        JOIN customers c ON c.id = st.customer_id
        LEFT JOIN users u ON u.id = st.recorded_by
        LEFT JOIN sales_invoices si ON si.transaction_id = st.id
        ${whereClause}
        ORDER BY st.transacted_at DESC, st.created_at DESC
      `;

      const result = await dbQuery(sql, params);
      return result.rows;
    }

    const { limit, offset, sortColumn = 'st.transacted_at', sortOrder = 'DESC' } = actualPagination;
    const limitPlaceholder = `$${params.length + 1}`;
    const offsetPlaceholder = `$${params.length + 2}`;

    const dataSql = `
      SELECT 
        st.id,
        st.transaction_no,
        st.trip_id,
        st.customer_id,
        c.name AS customer_name,
        c.business_name AS customer_business_name,
        c.contact_person AS customer_contact_person,
        c.contact_number AS customer_contact_number,
        st.recorded_by,
        u.username AS recorded_by_username,
        CONCAT(u.first_name, ' ', u.last_name) AS recorded_by_name,
        st.status,
        st.cancellation_reason,
        st.cancelled_by,
        st.cancelled_at,
        st.transacted_at,
        st.synced_at,
        st.created_at,
        st.updated_at,
        si.id AS invoice_id,
        si.invoice_number,
        si.declaration_number,
        si.total_amount,
        si.payment_method,
        si.payment_status,
        si.payment_reference_number,
        si.payment_proof_key
      FROM sales_transactions st
      JOIN customers c ON c.id = st.customer_id
      LEFT JOIN users u ON u.id = st.recorded_by
      LEFT JOIN sales_invoices si ON si.transaction_id = st.id
      ${whereClause}
      ORDER BY ${sortColumn} ${sortOrder}, st.id DESC
      LIMIT ${limitPlaceholder} OFFSET ${offsetPlaceholder}
    `;

    const countSql = `
      SELECT COUNT(*) AS count
      FROM sales_transactions st
      JOIN customers c ON c.id = st.customer_id
      LEFT JOIN sales_invoices si ON si.transaction_id = st.id
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
   * Retrieves a single transaction by UUID with line items and invoice.
   * @param {Object} [client]
   * @param {string} id - Transaction UUID
   * @returns {Promise<Object|null>}
   */
  async getTransactionById(client, id) {
    const [dbQuery, actualId] = this._resolveRunner(client, id);

    const txSql = `
      SELECT 
        st.id,
        st.transaction_no,
        st.trip_id,
        st.customer_id,
        c.name AS customer_name,
        c.business_name AS customer_business_name,
        c.contact_person AS customer_contact_person,
        c.contact_number AS customer_contact_number,
        c.delivery_address AS customer_delivery_address,
        st.recorded_by,
        u.username AS recorded_by_username,
        CONCAT(u.first_name, ' ', u.last_name) AS recorded_by_name,
        st.status,
        st.cancellation_reason,
        st.cancelled_by,
        cu.username AS cancelled_by_username,
        CONCAT(cu.first_name, ' ', cu.last_name) AS cancelled_by_name,
        st.cancelled_at,
        st.transacted_at,
        st.synced_at,
        st.created_at,
        st.updated_at
      FROM sales_transactions st
      JOIN customers c ON c.id = st.customer_id
      LEFT JOIN users u ON u.id = st.recorded_by
      LEFT JOIN users cu ON cu.id = st.cancelled_by
      WHERE st.id = $1
    `;

    const txRes = await dbQuery(txSql, [actualId]);
    if (txRes.rows.length === 0) return null;

    const itemsSql = `
      SELECT 
        sti.id,
        sti.transaction_id,
        sti.product_id,
        p.name AS product_name,
        p.category AS product_category,
        p.container_type,
        p.net_weight_kg,
        sti.quantity_sold,
        sti.empties_returned,
        sti.empties_defective,
        sti.unit_price_at_sale,
        sti.subtotal_amount,
        sti.created_at
      FROM sales_transaction_items sti
      JOIN products p ON p.id = sti.product_id
      WHERE sti.transaction_id = $1
      ORDER BY sti.created_at ASC
    `;

    const invoiceSql = `
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
        si.updated_at
      FROM sales_invoices si
      LEFT JOIN users vu ON vu.id = si.verified_by
      WHERE si.transaction_id = $1
    `;

    const [itemsRes, invoiceRes] = await Promise.all([
      dbQuery(itemsSql, [actualId]),
      dbQuery(invoiceSql, [actualId]),
    ]);

    return {
      ...txRes.rows[0],
      items: itemsRes.rows,
      invoice: invoiceRes.rows[0] || null,
    };
  }

  /**
   * Retrieves all transactions associated with a specific trip.
   * @param {Object} [client]
   * @param {string} tripId
   * @returns {Promise<Array>}
   */
  async getTransactionsByTripId(client, tripId) {
    const [dbQuery, actualTripId] = this._resolveRunner(client, tripId);

    const sql = `
      SELECT 
        st.id,
        st.transaction_no,
        st.trip_id,
        st.customer_id,
        c.name AS customer_name,
        c.business_name AS customer_business_name,
        st.status,
        st.transacted_at,
        st.synced_at,
        si.invoice_number,
        si.total_amount,
        si.payment_method,
        si.payment_status
      FROM sales_transactions st
      JOIN customers c ON c.id = st.customer_id
      LEFT JOIN sales_invoices si ON si.transaction_id = st.id
      WHERE st.trip_id = $1
      ORDER BY st.transacted_at ASC
    `;

    const result = await dbQuery(sql, [actualTripId]);
    return result.rows;
  }

  /**
   * Cancels a transaction and cleans associated canister ledger entries.
   * @param {Object} [client]
   * @param {string} id - Transaction UUID
   * @param {Object} param2 - { reason, cancelledBy }
   * @returns {Promise<Object>} Updated transaction row
   */
  async cancelTransaction(client, id, { reason, cancelledBy }) {
    const [dbQuery, actualId] = this._resolveRunner(client, id);

    // 1. Delete canister ledger entries so cancelled orders don't inflate debt
    await dbQuery(`DELETE FROM canister_ledger WHERE transaction_id = $1`, [actualId]);

    // 2. Mark transaction as CANCELLED
    const updateSql = `
      UPDATE sales_transactions
      SET 
        status = 'CANCELLED',
        cancellation_reason = $2,
        cancelled_by = $3,
        cancelled_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *;
    `;

    const result = await dbQuery(updateSql, [actualId, reason, cancelledBy]);
    return result.rows[0] || null;
  }

  /**
   * Cross-Subsystem Hook: Retrieves net customer debt created for a trip grouped per product SKU.
   * Consumed by Inventory Reconciliation: database/migrations/011_plant_inventory_and_reconciliation.sql
   * @param {Object} [client]
   * @param {string} tripId - Trip UUID
   * @returns {Promise<Array>}
   */
  async getTripNetCustomerDebtCreated(client, tripId) {
    const [dbQuery, actualTripId] = this._resolveRunner(client, tripId);

    const sql = `
      SELECT 
        cl.product_id,
        p.name AS product_name,
        p.container_type,
        COALESCE(SUM(cl.quantity_loaned - cl.quantity_returned), 0)::int AS net_customer_debt_created
      FROM canister_ledger cl
      JOIN products p ON p.id = cl.product_id
      WHERE cl.trip_id = $1
      GROUP BY cl.product_id, p.name, p.container_type;
    `;

    const result = await dbQuery(sql, [actualTripId]);
    return result.rows;
  }

  /**
   * Cross-Subsystem Hook: Returns the total aggregate net customer debt created across all items in a trip.
   * @param {Object} [client]
   * @param {string} tripId - Trip UUID
   * @returns {Promise<number>} Total integer count
   */
  async getTripTotalNetCustomerDebtCreated(client, tripId) {
    const [dbQuery, actualTripId] = this._resolveRunner(client, tripId);

    const sql = `
      SELECT COALESCE(SUM(quantity_loaned - quantity_returned), 0)::int AS total_net_customer_debt_created
      FROM canister_ledger
      WHERE trip_id = $1;
    `;

    const result = await dbQuery(sql, [actualTripId]);
    return parseInt(result.rows[0]?.total_net_customer_debt_created || 0, 10);
  }

  /**
   * Cross-Subsystem Hook: Returns the total count of filled units sold for a trip (COMPLETED transactions only).
   * @param {Object} [client]
   * @param {string} tripId - Trip UUID
   * @returns {Promise<number>} Total integer units sold
   */
  async getTripTotalSoldFull(client, tripId) {
    const [dbQuery, actualTripId] = this._resolveRunner(client, tripId);

    const sql = `
      SELECT COALESCE(SUM(sti.quantity_sold), 0)::int AS total_sold_full
      FROM sales_transaction_items sti
      JOIN sales_transactions st ON st.id = sti.transaction_id
      WHERE st.trip_id = $1 AND st.status = 'COMPLETED';
    `;

    const result = await dbQuery(sql, [actualTripId]);
    return parseInt(result.rows[0]?.total_sold_full || 0, 10);
  }

  /**
   * Aggregates shift closeout remittance summary for a trip.
   * @param {Object} [client]
   * @param {string} tripId - Trip UUID
   * @returns {Promise<Object>} Aggregated remittance summary
   */
  async getTripShiftSummary(client, tripId) {
    const [dbQuery, actualTripId] = this._resolveRunner(client, tripId);

    // 1. Transaction counts and revenue by payment method (COMPLETED transactions)
    const financialSql = `
      SELECT 
        st.id,
        st.transaction_no,
        st.status,
        si.id AS invoice_id,
        si.invoice_number,
        si.declaration_number,
        si.total_amount,
        si.payment_method,
        si.payment_status,
        si.payment_reference_number,
        si.payment_proof_key,
        c.name AS customer_name,
        c.business_name AS customer_business_name,
        c.contact_person AS customer_contact_person
      FROM sales_transactions st
      LEFT JOIN sales_invoices si ON si.transaction_id = st.id
      LEFT JOIN customers c ON c.id = st.customer_id
      WHERE st.trip_id = $1
      ORDER BY st.transacted_at ASC;
    `;

    // 2. Aggregate empty cylinders returned grouped by product SKU
    const emptiesSql = `
      SELECT 
        p.id AS product_id,
        p.name AS product_name,
        p.category,
        p.container_type,
        p.net_weight_kg,
        COALESCE(SUM(sti.empties_returned), 0)::int AS total_empties_returned,
        COALESCE(SUM(sti.quantity_sold), 0)::int AS total_quantity_sold
      FROM sales_transaction_items sti
      JOIN sales_transactions st ON st.id = sti.transaction_id
      JOIN products p ON p.id = sti.product_id
      WHERE st.trip_id = $1 AND st.status = 'COMPLETED'
      GROUP BY p.id, p.name, p.category, p.container_type, p.net_weight_kg
      ORDER BY p.name ASC;
    `;

    // 3. Overall net customer debt created on trip
    const netDebtSql = `
      SELECT COALESCE(SUM(quantity_loaned - quantity_returned), 0)::int AS total_debt
      FROM canister_ledger
      WHERE trip_id = $1;
    `;

    const [finRes, emptiesRes, debtRes] = await Promise.all([
      dbQuery(financialSql, [actualTripId]),
      dbQuery(emptiesSql, [actualTripId]),
      dbQuery(netDebtSql, [actualTripId]),
    ]);

    const txRows = finRes.rows;
    let totalCashAmount = 0;
    let cashCount = 0;
    let totalGcashAmount = 0;
    let gcashCount = 0;
    let unverifiedGcashCount = 0;
    let completedCount = 0;
    let cancelledCount = 0;
    const gcashPayments = [];

    for (const row of txRows) {
      if (row.status === 'COMPLETED') {
        completedCount++;
        const amount = Number(row.total_amount) || 0;
        if (row.payment_method === 'CASH') {
          totalCashAmount += amount;
          cashCount++;
        } else if (row.payment_method === 'GCASH') {
          totalGcashAmount += amount;
          gcashCount++;
          if (row.payment_status === 'PAID_UNVERIFIED') {
            unverifiedGcashCount++;
          }
          gcashPayments.push({
            invoiceId: row.invoice_id,
            invoiceNumber: row.invoice_number,
            transactionId: row.id,
            transactionNo: row.transaction_no,
            customerName: row.customer_business_name || row.customer_contact_person || row.customer_name,
            totalAmount: amount,
            paymentStatus: row.payment_status,
            paymentReferenceNumber: row.payment_reference_number,
            paymentProofKey: row.payment_proof_key,
          });
        }
      } else if (row.status === 'CANCELLED') {
        cancelledCount++;
      }
    }

    const emptiesBreakdown = emptiesRes.rows.map((r) => ({
      productId: r.product_id,
      productName: r.product_name,
      category: r.category,
      containerType: r.container_type,
      netWeightKg: Number(r.net_weight_kg),
      quantitySold: r.total_quantity_sold,
      emptiesReturned: r.total_empties_returned,
    }));

    const totalEmptiesCount = emptiesBreakdown.reduce((sum, item) => sum + item.emptiesReturned, 0);
    const totalRevenue = totalCashAmount + totalGcashAmount;
    const netCustomerDebtCreated = parseInt(debtRes.rows[0]?.total_debt || 0, 10);

    return {
      tripId: actualTripId,
      totalTransactions: txRows.length,
      completedTransactions: completedCount,
      cancelledTransactions: cancelledCount,
      revenue: {
        totalRevenue,
        cash: {
          totalAmount: totalCashAmount,
          transactionCount: cashCount,
        },
        gcash: {
          totalAmount: totalGcashAmount,
          transactionCount: gcashCount,
          unverifiedCount: unverifiedGcashCount,
          payments: gcashPayments,
        },
      },
      empties: {
        totalEmptiesCount,
        breakdown: emptiesBreakdown,
      },
      netCustomerDebtCreated,
    };
  }
}

module.exports = new TransactionsRepository();
