const invoicesService = require('./invoices.service');
const { formatPaginatedEnvelope } = require('../../../utils/pagination');

/**
 * Invoices Controller
 * Handles HTTP requests, parameter extraction, and status response formatting for sales invoices.
 */
class InvoicesController {
  /**
   * GET /api/sales/invoices
   * Retrieves paginated or complete listing of invoices.
   */
  async getAllInvoices(req, res) {
    try {
      const result = await invoicesService.getAllInvoices(req.user, req.query || {});
      if (result.items && result.meta) {
        return res.status(200).json(formatPaginatedEnvelope(result.items, result.meta));
      }
      return res.status(200).json({
        status: 'success',
        data: {
          count: result.length,
          invoices: result,
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
   * GET /api/sales/invoices/:id
   * Retrieves single invoice details by UUID.
   */
  async getInvoiceById(req, res) {
    try {
      const { id } = req.params;
      const invoice = await invoicesService.getInvoiceDetails(req.user, id);
      return res.status(200).json({
        status: 'success',
        data: { invoice },
      });
    } catch (err) {
      const isNotFound = err.message === 'Invoice not found';
      return res.status(err.statusCode || (isNotFound ? 404 : 400)).json({
        status: 'fail',
        message: err.message,
      });
    }
  }

  /**
   * PATCH /api/sales/invoices/:id/verify
   * Verifies payment on an invoice (supervisor action).
   */
  async verifyInvoice(req, res) {
    try {
      const { id } = req.params;
      const updatedInvoice = await invoicesService.verifyInvoice(req.user, id);
      return res.status(200).json({
        status: 'success',
        message: 'Invoice payment successfully verified',
        data: { invoice: updatedInvoice },
      });
    } catch (err) {
      const isNotFound = err.message === 'Invoice not found';
      return res.status(err.statusCode || (isNotFound ? 404 : 400)).json({
        status: 'fail',
        message: err.message,
      });
    }
  }

  // Backward compatibility alias
  async getInvoiceByTransaction(req, res) {
    try {
      const { transactionId } = req.params;
      const inv = await invoicesService.getInvoiceByTransactionId(transactionId);
      return res.status(200).json({
        status: 'success',
        data: { invoice: inv },
      });
    } catch (err) {
      return res.status(err.statusCode || 400).json({
        status: 'fail',
        message: err.message,
      });
    }
  }
}

module.exports = new InvoicesController();
