const express = require('express');
const router = express.Router();

const transactionsController = require('./transactions.controller');
const {
  authenticate,
  requirePermission,
} = require('../../../middleware/auth.middleware');
const asyncHandler = require('../../../utils/asyncHandler');

/**
 * PATCH /api/sales/transactions/:id/cancel
 * Voids/cancels a completed sales transaction.
 */
router.patch(
  '/:id/cancel',
  authenticate,
  requirePermission('sales.delete'),
  asyncHandler(transactionsController.cancelTransaction.bind(transactionsController))
);

/**
 * GET /api/sales/transactions
 * List all sales transactions with optional filters and pagination.
 */
router.get(
  '/',
  authenticate,
  requirePermission(['sales.view', 'sales.view_own']),
  asyncHandler(transactionsController.getTransactions.bind(transactionsController))
);

/**
 * GET /api/sales/transactions/:id
 * Retrieve details of a single sales transaction.
 */
router.get(
  '/:id',
  authenticate,
  requirePermission(['sales.view', 'sales.view_own']),
  asyncHandler(transactionsController.getTransactionById.bind(transactionsController))
);

module.exports = router;
