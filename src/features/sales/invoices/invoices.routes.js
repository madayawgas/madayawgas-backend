const express = require('express');
const router = express.Router();

const invoicesController = require('./invoices.controller');
const {
  authenticate,
  requirePermission,
} = require('../../../middleware/auth.middleware');
const asyncHandler = require('../../../utils/asyncHandler');

/**
 * PATCH /api/sales/invoices/:id/verify
 * Verifies payment for a sales invoice (supervisor action).
 */
router.patch(
  '/:id/verify',
  authenticate,
  requirePermission('sales.view'),
  asyncHandler(invoicesController.verifyInvoice.bind(invoicesController))
);

/**
 * GET /api/sales/invoices
 * List all sales invoices with optional filters and pagination.
 */
router.get(
  '/',
  authenticate,
  requirePermission(['sales.view', 'sales.view_own']),
  asyncHandler(invoicesController.getAllInvoices.bind(invoicesController))
);

/**
 * GET /api/sales/invoices/:id
 * Retrieve single invoice details.
 */
router.get(
  '/:id',
  authenticate,
  requirePermission(['sales.view', 'sales.view_own']),
  asyncHandler(invoicesController.getInvoiceById.bind(invoicesController))
);

module.exports = router;
