const transactionsRepository = require('./transactions.repository');
const { historyService } = require('../../history');
const { EVENTS } = require('../../history/history.events');
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
      return rows;
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
      items: rows,
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

    return tx;
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

    return cancelledTx;
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

    return transactionsRepository.getTripShiftSummary(null, tripId);
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
    return transactionsRepository.getTransactionsByTripId(null, tripId);
  }
}

module.exports = new TransactionsService();
