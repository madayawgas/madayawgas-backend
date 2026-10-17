const express = require('express');
const router = express.Router();

const customerRoutes = require('./customers/customer.routes');
const { syncRoutes } = require('./sync');
const { transactionsRoutes, transactionsController } = require('./transactions');
const { invoicesRoutes } = require('./invoices');
const {
  authenticate,
  requirePermission,
} = require('../../middleware/auth.middleware');
const asyncHandler = require('../../utils/asyncHandler');

// ============================================================
// Sales & Delivery Subsystem Route Mounts
// ============================================================

// 1. Shift Closeout Remittance Summary
router.get(
  '/trips/:tripId/shift-summary',
  authenticate,
  requirePermission(['sales.view', 'sales.view_own']),
  asyncHandler(transactionsController.getShiftSummary.bind(transactionsController))
);

// 2. Submodule Routes
router.use('/customers', customerRoutes);
router.use('/sync-batch', syncRoutes);
router.use('/transactions', transactionsRoutes);
router.use('/invoices', invoicesRoutes);

module.exports = router;
