const express = require('express');
const router = express.Router();
const maintenanceController = require('./maintenance.controller');
const { authenticate, requirePermission } = require('../../../middleware/auth.middleware');
const asyncHandler = require('../../../utils/asyncHandler');

// ============================================================
// Fleet Maintenance & Odometer Routes
// Base Path (when mounted): /api/fleet/maintenance
// ============================================================

/**
 * POST /api/fleet/maintenance/odometer
 * Records single-point post-dispatch return odometer reading for a vehicle asset.
 * Enforces monotonic check and calculates distance-based 5,000-km PM threshold.
 */
router.post(
  '/odometer',
  authenticate,
  requirePermission('fleet.manage'),
  asyncHandler(maintenanceController.logOdometer.bind(maintenanceController))
);

/**
 * GET /api/fleet/maintenance/pm-overview
 * Retrieves summary of all trucks with PM due indicators and distance deltas.
 * (Declared before parameterized routes to prevent route collisions)
 */
router.get(
  '/pm-overview',
  authenticate,
  requirePermission('fleet.view'),
  asyncHandler(maintenanceController.getPmOverview.bind(maintenanceController))
);

/**
 * GET /api/fleet/maintenance/odometer/truck/:truckId
 * Retrieves paginated history of odometer logs for a specific vehicle.
 */
router.get(
  '/odometer/truck/:truckId',
  authenticate,
  requirePermission('fleet.view'),
  asyncHandler(maintenanceController.getTruckOdometerHistory.bind(maintenanceController))
);

module.exports = router;
