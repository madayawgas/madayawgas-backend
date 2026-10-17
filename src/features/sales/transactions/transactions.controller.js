const transactionsService = require('./transactions.service');
const { formatPaginatedEnvelope } = require('../../../utils/pagination');

/**
 * Transactions Controller
 * Handles HTTP requests, parameter extraction, and status response formatting for sales orders.
 */
class TransactionsController {
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
      return res.status(err.statusCode || 400).json({
        status: 'fail',
        message: err.message,
      });
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
      const isNotFound = err.message === 'Transaction not found';
      return res.status(err.statusCode || (isNotFound ? 404 : 400)).json({
        status: 'fail',
        message: err.message,
      });
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
      const isNotFound = err.message === 'Transaction not found';
      return res.status(err.statusCode || (isNotFound ? 404 : 400)).json({
        status: 'fail',
        message: err.message,
      });
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
      const isNotFound = err.message === 'Trip not found';
      return res.status(err.statusCode || (isNotFound ? 404 : 400)).json({
        status: 'fail',
        message: err.message,
      });
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
      return res.status(err.statusCode || 400).json({
        status: 'fail',
        message: err.message,
      });
    }
  }
}

module.exports = new TransactionsController();
