const express = require('express');
const router = express.Router();

const trucksController = require('./trucks/trucks.controller');
const availabilityController = require('./availability/availability.controller');
const { authenticate, requirePermission } = require('../../middleware/auth.middleware');
const asyncHandler = require('../../utils/asyncHandler');

// ============================================================
// 1. Static Routes (Declared first to avoid routing conflicts)
// ============================================================

/**
 * GET /api/fleet/overview
 * Fleet summary overview and operational statistics.
 */
router.get(
  '/overview',
  authenticate,
  requirePermission('fleet.view'),
  asyncHandler(availabilityController.getOverview.bind(availabilityController))
);

/**
 * GET /api/fleet/availability
 * List of available active vehicles ready for dispatch.
 */
router.get(
  '/availability',
  authenticate,
  requirePermission('fleet.view'),
  asyncHandler(availabilityController.getAvailability.bind(availabilityController))
);

/**
 * GET /api/fleet/register-options
 * Form configuration metadata & available unassigned drivers for vehicle registration.
 */
router.get(
  '/register-options',
  authenticate,
  requirePermission('fleet.manage'),
  asyncHandler(trucksController.getRegisterOptions.bind(trucksController))
);

// ============================================================
// 2. Collection Level Endpoints (/trucks and root /)
// ============================================================

/**
 * GET /api/fleet/trucks & GET /api/fleet
 * List all fleet vehicles with optional search, status, and driver filters.
 */
router.get(
  '/trucks',
  authenticate,
  requirePermission('fleet.view'),
  asyncHandler(trucksController.getAllTrucks.bind(trucksController))
);

router.get(
  '/',
  authenticate,
  requirePermission('fleet.view'),
  asyncHandler(trucksController.getAllTrucks.bind(trucksController))
);

/**
 * POST /api/fleet/trucks & POST /api/fleet
 * Register a new vehicle in the fleet.
 */
router.post(
  '/trucks',
  authenticate,
  requirePermission('fleet.manage'),
  asyncHandler(trucksController.createTruck.bind(trucksController))
);

router.post(
  '/',
  authenticate,
  requirePermission('fleet.manage'),
  asyncHandler(trucksController.createTruck.bind(trucksController))
);

// ============================================================
// 3. Specific Sub-Resource Endpoints (Before generic :id)
// ============================================================

/**
 * GET /api/fleet/trucks/:id/status
 * View specific vehicle availability status and operational condition.
 */
router.get(
  '/trucks/:id/status',
  authenticate,
  requirePermission('fleet.view'),
  asyncHandler(availabilityController.getTruckStatus.bind(availabilityController))
);

/**
 * PATCH /api/fleet/trucks/:id/status
 * Set vehicle operational availability status (ACTIVE, INACTIVE, UNDER_MAINTENANCE, RETIRED).
 */
router.patch(
  '/trucks/:id/status',
  authenticate,
  requirePermission('fleet.manage'),
  asyncHandler(availabilityController.updateTruckStatus.bind(availabilityController))
);

/**
 * PATCH /api/fleet/trucks/:id/deactivate
 * Deactivate vehicle asset and unassign driver.
 */
router.patch(
  '/trucks/:id/deactivate',
  authenticate,
  requirePermission('fleet.manage'),
  asyncHandler(trucksController.deactivateTruck.bind(trucksController))
);

/**
 * PATCH /api/fleet/trucks/:id/assign
 * Assign an active driver to vehicle, or unassign driver.
 */
router.patch(
  '/trucks/:id/assign',
  authenticate,
  requirePermission('fleet.manage'),
  asyncHandler(trucksController.assignDriver.bind(trucksController))
);

/**
 * POST /api/fleet/trucks/:id/mileage and PATCH /api/fleet/trucks/:id/mileage
 * Record vehicle mileage reading and calculate usage/maintenance metrics.
 */
router.post(
  '/trucks/:id/mileage',
  authenticate,
  requirePermission('fleet.manage'),
  asyncHandler(trucksController.recordMileage.bind(trucksController))
);

router.patch(
  '/trucks/:id/mileage',
  authenticate,
  requirePermission('fleet.manage'),
  asyncHandler(trucksController.recordMileage.bind(trucksController))
);

// ============================================================
// 4. Generic Parameterized Endpoints (:id)
// ============================================================

/**
 * GET /api/fleet/trucks/:id
 * Get single vehicle detail by UUID.
 */
router.get(
  '/trucks/:id',
  authenticate,
  requirePermission('fleet.view'),
  asyncHandler(trucksController.getTruckById.bind(trucksController))
);

/**
 * PATCH /api/fleet/trucks/:id
 * Update vehicle information (plate, model, year, odometer readings).
 */
router.patch(
  '/trucks/:id',
  authenticate,
  requirePermission('fleet.manage'),
  asyncHandler(trucksController.updateTruck.bind(trucksController))
);

module.exports = router;
