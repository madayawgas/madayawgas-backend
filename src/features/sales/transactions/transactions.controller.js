const transactionsService = require('./transactions.service');
const { formatPaginatedEnvelope } = require('../../../utils/pagination');

/**
 * Transactions Controller
 * Handles HTTP requests, parameter extraction, and status response formatting for sales orders.
 */
class TransactionsController {
  /**
   * Handles known domain/validation errors and delegates unexpected/DB errors
   * to Express's global errorHandler via asyncHandler.
   */
  _handleControllerError(res, err, { allowNotFound = false } = {}) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({
        status: err.statusCode >= 500 ? 'error' : 'fail',
        message: err.message,
      });
    }
    if (allowNotFound && (err.message === 'Transaction not found' || err.message === 'Trip not found')) {
      return res.status(404).json({
        status: 'fail',
        message: err.message,
      });
    }
    throw err;
  }

  /**
   * GET /api/sales/transactions
   * Retrieves paginated or complete listing of transactions.
   */
  async getTransactions(req, res) {
    try {
      const result = await transactionsService.getAllTransactions(req.user, req.query || {});
      if (result.items && result.meta) {
        return res.status(200).json(formatPaginatedEnvelope(result.items, result.meta));
      }
      return res.status(200).json({
        status: 'success',
        data: {
          count: result.length,
          transactions: result,
        },
      });
    } catch (err) {
      return this._handleControllerError(res, err);
    }
  }

  /**
   * GET /api/sales/transactions/:id
   * Retrieves single transaction details with line items and invoice.
   */
  async getTransactionById(req, res) {
    try {
      const { id } = req.params;
      const tx = await transactionsService.getTransactionDetails(req.user, id);
      return res.status(200).json({
        status: 'success',
        data: { transaction: tx },
      });
    } catch (err) {
      return this._handleControllerError(res, err, { allowNotFound: true });
    }
  }

  /**
   * PATCH /api/sales/transactions/:id/cancel
   * Cancels/voids a sales transaction.
   */
  async cancelTransaction(req, res) {
    try {
      const { id } = req.params;
      const cancelledTx = await transactionsService.cancelTransaction(req.user, id, req.body || {});
      return res.status(200).json({
        status: 'success',
        message: 'Transaction successfully cancelled',
        data: { transaction: cancelledTx },
      });
    } catch (err) {
      return this._handleControllerError(res, err, { allowNotFound: true });
    }
  }

  /**
   * GET /api/sales/trips/:tripId/shift-summary
   * Retrieves shift closeout summary for a trip.
   */
  async getShiftSummary(req, res) {
    try {
      const { tripId } = req.params;
      const summary = await transactionsService.getShiftSummary(req.user, tripId);
      return res.status(200).json({
        status: 'success',
        data: summary,
      });
    } catch (err) {
      return this._handleControllerError(res, err, { allowNotFound: true });
    }
  }

  // Backward compatibility alias
  async getTransactionsByTrip(req, res) {
    try {
      const { tripId } = req.params;
      const items = await transactionsService.getTransactionsByTripId(tripId);
      return res.status(200).json({
        status: 'success',
        data: { transactions: items },
      });
    } catch (err) {
      return this._handleControllerError(res, err);
    }
  }

  /**
   * GET /api/sales/overview and GET /api/sales/analytics
   * Retrieves high-level business analytics, trends, and category distribution.
   */
  async getSalesAnalytics(req, res) {
    try {
      const analytics = await transactionsService.getSalesAnalytics(req.user, req.query || {});
      return res.status(200).json({
        status: 'success',
        data: analytics,
      });
    } catch (err) {
      return this._handleControllerError(res, err);
    }
  }

  /**
   * GET /api/sales/trip-performance
   * Retrieves operational delivery trip performance with sales revenue attribution.
   */
  async getTripSalesPerformance(req, res) {
    try {
      const result = await transactionsService.getTripSalesPerformance(req.user, req.query || {});
      if (result.items && result.meta) {
        return res.status(200).json(formatPaginatedEnvelope(result.items, result.meta));
      }
      return res.status(200).json({
        status: 'success',
        data: {
          count: result.length,
          trips: result,
        },
      });
    } catch (err) {
      return this._handleControllerError(res, err);
    }
  }
}

module.exports = new TransactionsController();

