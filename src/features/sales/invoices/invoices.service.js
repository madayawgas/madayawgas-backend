const invoicesRepository = require('./invoices.repository');
const { historyService } = require('../../history');
const { EVENTS } = require('../../history/history.events');
const { mediaStorage, extractStorageKey } = require('../../media');
const {
  parsePaginationQuery,
  calculateOffset,
  buildPaginationMeta,
} = require('../../../utils/pagination');
const { safeEmitSocketEvent } = require('../../../socket');

const ALLOWED_INVOICE_SORT_FIELDS = Object.freeze({
  transactedAt: 'si.transacted_at',
  transacted_at: 'si.transacted_at',
  createdAt: 'si.created_at',
  created_at: 'si.created_at',
  invoiceNumber: 'si.invoice_number',
  invoice_number: 'si.invoice_number',
  totalAmount: 'si.total_amount',
  total_amount: 'si.total_amount',
  paymentStatus: 'si.payment_status',
  payment_status: 'si.payment_status',
});

/**
 * Enriches an invoice entity with resolved public payment proof URL and normalized keys.
 *
 * @param {Object|null} inv
 * @returns {Object|null}
 */
function enrichInvoiceMedia(inv) {
  if (!inv) return null;
  const rawKey = inv.payment_proof_key || inv.paymentProofKey;
  const canonicalKey = rawKey ? (extractStorageKey(rawKey) || rawKey) : null;
  const publicUrl = canonicalKey ? mediaStorage.resolveMediaUrl(canonicalKey) : null;

  return {
    ...inv,
    payment_proof_key: canonicalKey,
    paymentProofKey: canonicalKey,
    payment_proof_url: publicUrl,
    paymentProofUrl: publicUrl,
  };
}

/**
 * Invoices Service
 * Encapsulates domain logic for invoice tracking, search, and supervisor verification.
 */
class InvoicesService {
  /**
   * Retrieves invoices with optional pagination and filtering.
   * Scopes to actorUser's own recorded transactions if user holds only 'sales.view_own'.
   * @param {Object} actorUser
   * @param {Object} queryFilters
   * @returns {Promise<Object|Array>}
   */
  async getAllInvoices(actorUser, queryFilters = {}) {
    const permissions = actorUser?.permissions || [];
    const hasGlobalView = permissions.includes('sales.view');
    const hasOwnView = permissions.includes('sales.view_own');

    const filters = {
      tripId: queryFilters.tripId || queryFilters.trip_id,
      paymentMethod: queryFilters.paymentMethod || queryFilters.payment_method,
      paymentStatus: queryFilters.paymentStatus || queryFilters.payment_status,
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
      allowedSortFields: ALLOWED_INVOICE_SORT_FIELDS,
    });

    if (!pagination.isPaginated) {
      const rows = await invoicesRepository.findPaginatedInvoices(null, filters, null);
      return rows.map(enrichInvoiceMedia);
    }

    const calcOffset = calculateOffset(pagination.page, pagination.limit);
    const paginationParams = {
      limit: pagination.limit,
      offset: calcOffset,
      sortColumn: pagination.sortColumn,
      sortOrder: pagination.sortOrder,
    };

    const { rows, total } = await invoicesRepository.findPaginatedInvoices(
      null,
      filters,
      paginationParams
    );

    const meta = buildPaginationMeta(total, pagination.page, pagination.limit);
    return {
      items: rows.map(enrichInvoiceMedia),
      meta,
    };
  }

  /**
   * Retrieves single invoice details by UUID.
   * @param {Object} actorUser
   * @param {string} id - Invoice UUID
   * @returns {Promise<Object>}
   */
  async getInvoiceDetails(actorUser, id) {
    if (!id || typeof id !== 'string') {
      const err = new Error('Invoice ID is required');
      err.statusCode = 400;
      throw err;
    }

    const invoice = await invoicesRepository.getInvoiceById(null, id);
    if (!invoice) {
      const err = new Error('Invoice not found');
      err.statusCode = 404;
      throw err;
    }

    const permissions = actorUser?.permissions || [];
    const hasGlobalView = permissions.includes('sales.view');
    const hasOwnView = permissions.includes('sales.view_own');

    if (!hasGlobalView && hasOwnView && invoice.recorded_by !== actorUser.id) {
      const err = new Error('Forbidden');
      err.statusCode = 403;
      throw err;
    }

    return enrichInvoiceMedia(invoice);
  }

  /**
   * Verifies an invoice's payment status (supervisor confirmation).
   * @param {Object} actorUser - Authenticated user context
   * @param {string} id - Invoice UUID
   * @returns {Promise<Object>} Updated invoice DTO
   */
  async verifyInvoice(actorUser, id) {
    if (!id || typeof id !== 'string') {
      const err = new Error('Invoice ID is required');
      err.statusCode = 400;
      throw err;
    }

    const invoice = await invoicesRepository.getInvoiceById(null, id);
    if (!invoice) {
      const err = new Error('Invoice not found');
      err.statusCode = 404;
      throw err;
    }

    if (invoice.payment_status === 'VERIFIED') {
      const err = new Error('Invoice payment is already verified');
      err.statusCode = 400;
      throw err;
    }

    const updatedInvoice = await invoicesRepository.verifyInvoicePayment(null, id, actorUser?.id || null);

    // Centralized Audit Logging
    await historyService.log(EVENTS.SALES_INVOICE_VERIFIED, {
      actorUser,
      targetId: id,
      payload: {
        invoiceNumber: invoice.invoice_number,
        paymentMethod: invoice.payment_method,
      },
      metadata: {
        totalAmount: invoice.total_amount,
        paymentMethod: invoice.payment_method,
        paymentReferenceNumber: invoice.payment_reference_number,
        verifiedBy: actorUser?.id,
      },
    });

    safeEmitSocketEvent('SALES_INVOICE_VERIFIED', {
      invoiceId: id,
      invoiceNumber: invoice.invoice_number,
      paymentMethod: invoice.payment_method,
      totalAmount: invoice.total_amount,
      paymentStatus: 'VERIFIED',
      verifiedBy: actorUser?.id || null,
      verifiedAt: new Date().toISOString(),
    }, 'room:sales');

    return enrichInvoiceMedia(updatedInvoice);
  }

  // Backward-compatible aliases
  async getInvoiceByTransactionId(transactionId) {
    if (!transactionId) {
      throw new Error('Transaction ID is required');
    }

    const inv = await invoicesRepository.getInvoiceByTransactionId(null, transactionId);
    if (!inv) {
      throw new Error('Invoice not found');
    }

    return enrichInvoiceMedia(inv);
  }

  async getInvoiceByNumber(invoiceNumber) {
    if (!invoiceNumber) {
      throw new Error('Invoice number is required');
    }

    const inv = await invoicesRepository.getInvoiceByNumber(null, invoiceNumber);
    if (!inv) {
      throw new Error('Invoice not found');
    }

    return enrichInvoiceMedia(inv);
  }
}

module.exports = new InvoicesService();
