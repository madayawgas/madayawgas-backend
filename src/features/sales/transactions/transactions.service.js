const transactionsRepository = require('./transactions.repository');
const { historyService } = require('../../history');
const { EVENTS } = require('../../history/history.events');
const { mediaStorage, extractStorageKey } = require('../../media');
const {
  parsePaginationQuery,
  calculateOffset,
  buildPaginationMeta,
} = require('../../../utils/pagination');
const { safeEmitSocketEvent } = require('../../../socket');

const ALLOWED_TRANSACTION_SORT_FIELDS = Object.freeze({
  transactedAt: 'st.transacted_at',
  transacted_at: 'st.transacted_at',
  createdAt: 'st.created_at',
  created_at: 'st.created_at',
  transactionNo: 'st.transaction_no',
  transaction_no: 'st.transaction_no',
  status: 'st.status',
});

/**
 * Enriches a sales transaction entity and any nested invoice with resolved public media URLs.
 *
 * @param {Object|null} tx
 * @returns {Object|null}
 */
function enrichTransactionMedia(tx) {
  if (!tx) return null;

  const enriched = { ...tx };
  const rawKey = tx.payment_proof_key || tx.paymentProofKey;
  const canonicalKey = rawKey ? (extractStorageKey(rawKey) || rawKey) : null;
  const publicUrl = canonicalKey ? mediaStorage.resolveMediaUrl(canonicalKey) : null;

  if (tx.payment_proof_key !== undefined || tx.paymentProofKey !== undefined) {
    enriched.payment_proof_key = canonicalKey;
    enriched.paymentProofKey = canonicalKey;
    enriched.payment_proof_url = publicUrl;
    enriched.paymentProofUrl = publicUrl;
  }

  // If nested invoice object exists (e.g. from getTransactionById / getTransactionDetails)
  if (enriched.invoice) {
    const invRawKey = enriched.invoice.payment_proof_key || enriched.invoice.paymentProofKey;
    const invCanonicalKey = invRawKey ? (extractStorageKey(invRawKey) || invRawKey) : null;
    const invPublicUrl = invCanonicalKey ? mediaStorage.resolveMediaUrl(invCanonicalKey) : null;

    enriched.invoice = {
      ...enriched.invoice,
      payment_proof_key: invCanonicalKey,
      paymentProofKey: invCanonicalKey,
      payment_proof_url: invPublicUrl,
      paymentProofUrl: invPublicUrl,
    };

    if (!enriched.payment_proof_url && invPublicUrl) {
      enriched.payment_proof_url = invPublicUrl;
      enriched.paymentProofUrl = invPublicUrl;
      enriched.payment_proof_key = invCanonicalKey;
      enriched.paymentProofKey = invCanonicalKey;
    }
  }

  return enriched;
}

/**
 * Transactions Service
 * Encapsulates domain logic for sales orders, item snapshots, shift summaries, and audit cancellations.
 */
class TransactionsService {
  /**
   * Retrieves transactions with optional pagination and filtering.
   * Scopes to actorUser's own records if user holds only 'sales.view_own'.
   * @param {Object} actorUser
   * @param {Object} queryFilters
   * @returns {Promise<Object|Array>}
   */
  async getAllTransactions(actorUser, queryFilters = {}) {
    const permissions = actorUser?.permissions || [];
    const hasGlobalView = permissions.includes('sales.view');
    const hasOwnView = permissions.includes('sales.view_own');

    const filters = {
      tripId: queryFilters.tripId || queryFilters.trip_id,
      customerId: queryFilters.customerId || queryFilters.customer_id,
      status: queryFilters.status,
      paymentMethod: queryFilters.paymentMethod || queryFilters.payment_method,
      search: queryFilters.search,
      startDate: queryFilters.startDate || queryFilters.start_date,
      endDate: queryFilters.endDate || queryFilters.end_date,
    };

    if (!hasGlobalView && hasOwnView) {
      filters.recordedBy = actorUser.id;
    }

    const pagination = parsePaginationQuery(queryFilters, {
      defaultLimit: 20,
      maxLimit: 100,
      defaultSort: 'transactedAt',
      defaultOrder: 'DESC',
      allowedSortFields: ALLOWED_TRANSACTION_SORT_FIELDS,
    });

    if (!pagination.isPaginated) {
      const rows = await transactionsRepository.findPaginatedTransactions(null, filters, null);
      return rows.map(enrichTransactionMedia);
    }

    const calcOffset = calculateOffset(pagination.page, pagination.limit);
    const paginationParams = {
      limit: pagination.limit,
      offset: calcOffset,
      sortColumn: pagination.sortColumn,
      sortOrder: pagination.sortOrder,
    };

    const { rows, total } = await transactionsRepository.findPaginatedTransactions(
      null,
      filters,
      paginationParams
    );

    const meta = buildPaginationMeta(total, pagination.page, pagination.limit);
    return {
      items: rows.map(enrichTransactionMedia),
      meta,
    };
  }

  /**
   * Retrieves a single transaction by UUID.
   * @param {Object} actorUser
   * @param {string} id - Transaction UUID
   * @returns {Promise<Object>}
   */
  async getTransactionDetails(actorUser, id) {
    if (!id || typeof id !== 'string') {
      const err = new Error('Transaction ID is required');
      err.statusCode = 400;
      throw err;
    }

    const tx = await transactionsRepository.getTransactionById(null, id);
    if (!tx) {
      const err = new Error('Transaction not found');
      err.statusCode = 404;
      throw err;
    }

    const permissions = actorUser?.permissions || [];
    const hasGlobalView = permissions.includes('sales.view');
    const hasOwnView = permissions.includes('sales.view_own');

    if (!hasGlobalView && hasOwnView && tx.recorded_by !== actorUser.id) {
      const err = new Error('Forbidden');
      err.statusCode = 403;
      throw err;
    }

    return enrichTransactionMedia(tx);
  }

  /**
   * Cancels/voids a sales transaction and reverses its canister ledger impact.
   * @param {Object} actorUser - Authenticated user context
   * @param {string} id - Transaction UUID
   * @param {Object} payload - { reason }
   * @returns {Promise<Object>} Updated transaction DTO
   */
  async cancelTransaction(actorUser, id, payload = {}) {
    if (!id || typeof id !== 'string') {
      const err = new Error('Transaction ID is required');
      err.statusCode = 400;
      throw err;
    }

    const tx = await transactionsRepository.getTransactionById(null, id);
    if (!tx) {
      const err = new Error('Transaction not found');
      err.statusCode = 404;
      throw err;
    }

    if (tx.status === 'CANCELLED') {
      const err = new Error('Transaction is already cancelled');
      err.statusCode = 400;
      throw err;
    }

    const rawReason = payload.reason || payload.cancellationReason || payload.cancellation_reason;
    if (!rawReason || typeof rawReason !== 'string' || rawReason.trim().length === 0) {
      const err = new Error('Cancellation reason is required');
      err.statusCode = 400;
      throw err;
    }

    const cleanReason = rawReason.trim();

    const cancelledTx = await transactionsRepository.cancelTransaction(null, id, {
      reason: cleanReason,
      cancelledBy: actorUser?.id || null,
    });

    // Centralized Audit Logging
    await historyService.log(EVENTS.SALES_TRANSACTION_CANCELLED, {
      actorUser,
      targetId: id,
      payload: {
        transactionNo: tx.transaction_no,
        reason: cleanReason,
      },
      metadata: {
        tripId: tx.trip_id,
        customerId: tx.customer_id,
        reason: cleanReason,
      },
    });

    safeEmitSocketEvent('SALES_TRANSACTION_CANCELLED', {
      transactionId: id,
      transactionNo: tx.transaction_no,
      tripId: tx.trip_id,
      customerId: tx.customer_id,
      reason: cleanReason,
      cancelledAt: new Date().toISOString(),
    }, ['room:sales', 'room:inventory']);

    return enrichTransactionMedia(cancelledTx);
  }

  /**
   * Retrieves shift summary and financial closeout for a trip.
   * @param {Object} actorUser
   * @param {string} tripId - Trip UUID
   * @returns {Promise<Object>}
   */
  async getShiftSummary(actorUser, tripId) {
    if (!tripId || typeof tripId !== 'string') {
      const err = new Error('Trip ID is required');
      err.statusCode = 400;
      throw err;
    }

    const summary = await transactionsRepository.getTripShiftSummary(null, tripId);
    const payments = summary?.revenue?.gcash?.payments || summary?.gcashPayments;
    if (summary && Array.isArray(payments)) {
      const enrichedPayments = payments.map((p) => {
        const rawKey = p.paymentProofKey || p.payment_proof_key;
        const key = rawKey ? (extractStorageKey(rawKey) || rawKey) : null;
        const url = key ? mediaStorage.resolveMediaUrl(key) : null;
        return {
          ...p,
          paymentProofKey: key,
          payment_proof_key: key,
          paymentProofUrl: url,
          payment_proof_url: url,
        };
      });
      if (summary.revenue?.gcash) {
        summary.revenue.gcash.payments = enrichedPayments;
      }
      summary.gcashPayments = enrichedPayments;
    }
    return summary;
  }

  // ============================================================
  // Cross-Subsystem Inventory Reconciliation Hooks
  // ============================================================

  async getTripNetCustomerDebtCreated(tripId) {
    return transactionsRepository.getTripNetCustomerDebtCreated(null, tripId);
  }

  async getTripTotalNetCustomerDebtCreated(tripId) {
    return transactionsRepository.getTripTotalNetCustomerDebtCreated(null, tripId);
  }

  async getTripTotalSoldFull(tripId) {
    return transactionsRepository.getTripTotalSoldFull(null, tripId);
  }

  // Backward-compatible alias
  async getTransactionById(id) {
    return this.getTransactionDetails(null, id);
  }

  async getTransactionsByTripId(tripId) {
    const rows = await transactionsRepository.getTransactionsByTripId(null, tripId);
    return rows.map(enrichTransactionMedia);
  }

  /**
   * Retrieves authoritative sales analytics with KPI summaries, trends,
   * product SKU performance, and payment breakdown.
   *
   * @param {Object} actorUser
   * @param {Object} queryFilters
   * @returns {Promise<Object>}
   */
  async getSalesAnalytics(actorUser, queryFilters = {}) {
    const permissions = actorUser?.permissions || [];
    const hasGlobalView = permissions.includes('sales.view') || permissions.includes('dashboard.view');
    const hasOwnView = permissions.includes('sales.view_own');

    const filters = {
      startDate: queryFilters.startDate || queryFilters.start_date,
      endDate: queryFilters.endDate || queryFilters.end_date,
      timeframe: (queryFilters.timeframe || 'monthly').toLowerCase(),
      tripId: queryFilters.tripId || queryFilters.trip_id,
      truckId: queryFilters.truckId || queryFilters.truck_id,
    };

    if (!hasGlobalView && hasOwnView) {
      filters.recordedBy = actorUser.id;
    }

    const analytics = await transactionsRepository.getSalesAnalytics(null, filters);

    // Also populate weekly, monthly, annually trend series for dashboard charts
    const [weeklyData, monthlyData, annualData] = await Promise.all([
      transactionsRepository.getSalesAnalytics(null, { ...filters, timeframe: 'weekly' }),
      transactionsRepository.getSalesAnalytics(null, { ...filters, timeframe: 'monthly' }),
      transactionsRepository.getSalesAnalytics(null, { ...filters, timeframe: 'annually' }),
    ]);

    return {
      ...analytics,
      weekly: weeklyData.salesTrends || [],
      monthly: monthlyData.salesTrends || [],
      annually: annualData.salesTrends || [],
    };
  }

  /**
   * Retrieves delivery trip sales performance with revenue and unit attribution.
   *
   * @param {Object} actorUser
   * @param {Object} queryFilters
   * @returns {Promise<Object|Array>}
   */
  async getTripSalesPerformance(actorUser, queryFilters = {}) {
    const filters = {
      startDate: queryFilters.startDate || queryFilters.start_date,
      endDate: queryFilters.endDate || queryFilters.end_date,
      truckId: queryFilters.truckId || queryFilters.truck_id,
      status: queryFilters.status,
      search: queryFilters.search,
    };

    const pagination = parsePaginationQuery(queryFilters, {
      defaultLimit: 20,
      maxLimit: 100,
      defaultSort: 'departureTime',
      defaultOrder: 'DESC',
      allowedSortFields: {
        departureTime: 't.departure_time',
        departure_time: 't.departure_time',
        tripNumber: 't.trip_number',
        trip_number: 't.trip_number',
        totalRevenue: 'rev_agg.total_revenue',
        total_revenue: 'rev_agg.total_revenue',
        status: 't.status',
      },
    });

    if (!pagination.isPaginated) {
      return transactionsRepository.getTripSalesPerformance(null, filters, null);
    }

    const calcOffset = calculateOffset(pagination.page, pagination.limit);
    const paginationParams = {
      limit: pagination.limit,
      offset: calcOffset,
      sortColumn: pagination.sortColumn,
      sortOrder: pagination.sortOrder,
    };

    const { rows, total } = await transactionsRepository.getTripSalesPerformance(
      null,
      filters,
      paginationParams
    );

    const meta = buildPaginationMeta(total, pagination.page, pagination.limit);
    return {
      items: rows,
      meta,
    };
  }
}

module.exports = new TransactionsService();
