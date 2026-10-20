const express = require('express');
const router = express.Router();

const syncController = require('./sync.controller');
const {
  authenticate,
  requirePermission,
} = require('../../../middleware/auth.middleware');
const asyncHandler = require('../../../utils/asyncHandler');

/**
 * POST /api/sales/sync-batch
 * Ingests a batch of offline frontline sales transactions, items, invoices, and canister ledger entries.
 */
router.post(
  '/',
  authenticate,
  requirePermission(['sales.create', 'sales.view_own']),
  asyncHandler(syncController.syncBatch.bind(syncController))
);

module.exports = router;
