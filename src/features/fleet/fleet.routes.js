const express = require('express');
const router = express.Router();

const vehiclesController = require('./vehicles/vehicles.controller');
const availabilityController = require('./availability/availability.controller');
const maintenanceRoutes = require('./maintenance/maintenance.routes');
const { authenticate, requirePermission, requirePasswordConfirmation } = require('../../middleware/auth.middleware');
const asyncHandler = require('../../utils/asyncHandler');

// ============================================================
// 0. Sub-Module Routes (Mounted first for clean namespace isolation)
// ============================================================
router.use('/maintenance', maintenanceRoutes);

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
  asyncHandler(vehiclesController.getRegisterOptions.bind(vehiclesController))
);

/**
 * GET /api/fleet/drivers
 * List all eligible drivers with their current vehicle assignment status.
 */
router.get(
  '/drivers',
  authenticate,
  requirePermission('fleet.view'),
  asyncHandler(vehiclesController.getAllDrivers.bind(vehiclesController))
);

/**
 * GET /api/fleet/drivers/available & GET /api/fleet/available-drivers
 * List only available (unassigned) eligible drivers.
 */
router.get(
  '/drivers/available',
  authenticate,
  requirePermission('fleet.view'),
  asyncHandler(vehiclesController.getAvailableDrivers.bind(vehiclesController))
);

router.get(
  '/available-drivers',
  authenticate,
  requirePermission('fleet.view'),
  asyncHandler(vehiclesController.getAvailableDrivers.bind(vehiclesController))
);

// ============================================================
// 2. Collection Level Endpoints (/vehicles and root /)
// ============================================================

/**
 * GET /api/fleet/vehicles & GET /api/fleet
 * List all fleet vehicles with optional search, status, and driver filters.
 */
router.get(
  '/vehicles',
  authenticate,
  requirePermission('fleet.view'),
  asyncHandler(vehiclesController.getAllVehicles.bind(vehiclesController))
);

router.get(
  '/',
  authenticate,
  requirePermission('fleet.view'),
  asyncHandler(vehiclesController.getAllVehicles.bind(vehiclesController))
);

/**
 * POST /api/fleet/vehicles & POST /api/fleet
 * Register a new vehicle in the fleet.
 */
router.post(
  '/vehicles',
  authenticate,
  requirePermission('fleet.manage'),
  asyncHandler(vehiclesController.createVehicle.bind(vehiclesController))
);

router.post(
  '/',
  authenticate,
  requirePermission('fleet.manage'),
  asyncHandler(vehiclesController.createVehicle.bind(vehiclesController))
);

// ============================================================
// 3. Specific Sub-Resource Endpoints (Before generic :id)
// ============================================================

/**
 * GET /api/fleet/vehicles/:id/status
 * View specific vehicle availability status and operational condition.
 */
router.get(
  '/vehicles/:id/status',
  authenticate,
  requirePermission('fleet.view'),
  asyncHandler(availabilityController.getTruckStatus.bind(availabilityController))
);

/**
 * PATCH /api/fleet/vehicles/:id/status
 * Set vehicle operational availability status (ACTIVE, INACTIVE, UNDER_MAINTENANCE, RETIRED).
 */
router.patch(
  '/vehicles/:id/status',
  authenticate,
  requirePermission('fleet.manage'),
  asyncHandler(availabilityController.updateTruckStatus.bind(availabilityController))
);

/**
 * PATCH /api/fleet/vehicles/:id/deactivate
 * Deactivate vehicle asset and unassign driver.
 */
router.patch(
  '/vehicles/:id/deactivate',
  authenticate,
  requirePermission('fleet.manage'),
  requirePasswordConfirmation,
  asyncHandler(vehiclesController.deactivateVehicle.bind(vehiclesController))
);

/**
 * PATCH /api/fleet/vehicles/:id/assign & POST /api/fleet/vehicles/:id/assign
 * Assign an active driver to vehicle.
 */
router.patch(
  '/vehicles/:id/assign',
  authenticate,
  requirePermission('fleet.manage'),
  asyncHandler(vehiclesController.assignDriver.bind(vehiclesController))
);

router.post(
  '/vehicles/:id/assign',
  authenticate,
  requirePermission('fleet.manage'),
  asyncHandler(vehiclesController.assignDriver.bind(vehiclesController))
);

router.patch(
  '/vehicles/:id/assign-driver',
  authenticate,
  requirePermission('fleet.manage'),
  asyncHandler(vehiclesController.assignDriver.bind(vehiclesController))
);

router.post(
  '/vehicles/:id/assign-driver',
  authenticate,
  requirePermission('fleet.manage'),
  asyncHandler(vehiclesController.assignDriver.bind(vehiclesController))
);

/**
 * PATCH /api/fleet/vehicles/:id/unassign & POST /api/fleet/vehicles/:id/unassign
 * Unassign driver from vehicle, making the driver AVAILABLE again.
 */
router.patch(
  '/vehicles/:id/unassign',
  authenticate,
  requirePermission('fleet.manage'),
  asyncHandler(vehiclesController.unassignDriver.bind(vehiclesController))
);

router.post(
  '/vehicles/:id/unassign',
  authenticate,
  requirePermission('fleet.manage'),
  asyncHandler(vehiclesController.unassignDriver.bind(vehiclesController))
);

router.patch(
  '/vehicles/:id/unassign-driver',
  authenticate,
  requirePermission('fleet.manage'),
  asyncHandler(vehiclesController.unassignDriver.bind(vehiclesController))
);

router.post(
  '/vehicles/:id/unassign-driver',
  authenticate,
  requirePermission('fleet.manage'),
  asyncHandler(vehiclesController.unassignDriver.bind(vehiclesController))
);

/**
 * POST /api/fleet/vehicles/:id/mileage and PATCH /api/fleet/vehicles/:id/mileage
 * Record vehicle mileage reading and calculate usage/maintenance metrics.
 */
router.post(
  '/vehicles/:id/mileage',
  authenticate,
  requirePermission('fleet.manage'),
  asyncHandler(vehiclesController.recordMileage.bind(vehiclesController))
);

router.patch(
  '/vehicles/:id/mileage',
  authenticate,
  requirePermission('fleet.manage'),
  asyncHandler(vehiclesController.recordMileage.bind(vehiclesController))
);

// ============================================================
// 4. Generic Parameterized Endpoints (:id)
// ============================================================

/**
 * GET /api/fleet/vehicles/:id
 * Get single vehicle detail by UUID.
 */
router.get(
  '/vehicles/:id',
  authenticate,
  requirePermission('fleet.view'),
  asyncHandler(vehiclesController.getVehicleById.bind(vehiclesController))
);

/**
 * PATCH /api/fleet/vehicles/:id & PUT /api/fleet/vehicles/:id
 * Update vehicle information (plate, model, year, vehicleType, odometer readings).
 */
router.patch(
  '/vehicles/:id',
  authenticate,
  requirePermission('fleet.manage'),
  asyncHandler(vehiclesController.updateVehicle.bind(vehiclesController))
);

router.put(
  '/vehicles/:id',
  authenticate,
  requirePermission('fleet.manage'),
  asyncHandler(vehiclesController.updateVehicle.bind(vehiclesController))
);

module.exports = router;
