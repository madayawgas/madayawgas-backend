const express = require('express');
const router = express.Router();
const fuelController = require('./fuel.controller');
const { authenticate, requirePermission } = require('../../../middleware/auth.middleware');
const asyncHandler = require('../../../utils/asyncHandler');

// ============================================================
// Vehicle Fuel Tracking Routes
// Base Path (when mounted): /api/operations/fuel
// ============================================================

/**
 * POST /api/operations/fuel
 * Records fuel volume intake, cost, and optional monotonic odometer reading.
 */
router.post(
  '/',
  authenticate,
  requirePermission('fuel.create'),
  asyncHandler(fuelController.recordFuelEntry.bind(fuelController))
);

/**
 * GET /api/operations/fuel/summary
 * Retrieves summary consumption statistics (total liters, cost, average price/L).
 * (Declared before parameterized :id to prevent route collision)
 */
router.get(
  '/summary',
  authenticate,
  requirePermission(['fuel.view', 'fuel.view_own']),
  asyncHandler(fuelController.getFuelSummary.bind(fuelController))
);

/**
 * GET /api/operations/fuel/:id
 * Retrieves single fuel entry details.
 */
router.get(
  '/:id',
  authenticate,
  requirePermission(['fuel.view', 'fuel.view_own']),
  asyncHandler(fuelController.getFuelLogById.bind(fuelController))
);

/**
 * GET /api/operations/fuel
 * Retrieves paginated fuel logs with vehicle filtering.
 */
router.get(
  '/',
  authenticate,
  requirePermission(['fuel.view', 'fuel.view_own']),
  asyncHandler(fuelController.getFuelLogs.bind(fuelController))
);

module.exports = router;
