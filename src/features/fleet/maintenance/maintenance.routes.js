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

// ============================================================
// Safety Inspection Routes (No Checklists - Issue Reporting Only)
// ============================================================

/**
 * POST /api/fleet/maintenance/inspections
 * Records safety inspection; automatically grounds truck to UNDER_MAINTENANCE on failure.
 */
router.post(
  '/inspections',
  authenticate,
  requirePermission('fleet.manage'),
  asyncHandler(maintenanceController.recordInspection.bind(maintenanceController))
);

/**
 * GET /api/fleet/maintenance/inspections/truck/:truckId
 * Retrieves paginated safety inspections for a specific vehicle.
 */
router.get(
  '/inspections/truck/:truckId',
  authenticate,
  requirePermission('fleet.view'),
  asyncHandler(maintenanceController.getTruckInspections.bind(maintenanceController))
);

/**
 * GET /api/fleet/maintenance/inspections/:id
 * Retrieves single safety inspection record by UUID.
 */
router.get(
  '/inspections/:id',
  authenticate,
  requirePermission('fleet.view'),
  asyncHandler(maintenanceController.getInspectionById.bind(maintenanceController))
);

// ============================================================
// Incident & Breakdown Reporting Routes
// ============================================================

/**
 * GET /api/fleet/maintenance/incidents/types
 * Retrieves catalog of available incident classifications (e.g. MECHANICAL_DEFECT, TIRE_FAILURE).
 * (Declared before parameterized :id to prevent route collisions)
 */
router.get(
  '/incidents/types',
  authenticate,
  requirePermission('fleet.view'),
  asyncHandler(maintenanceController.getIncidentTypes.bind(maintenanceController))
);

/**
 * POST /api/fleet/maintenance/incidents
 * Records mid-route incident/breakdown; automatically grounds truck on CRITICAL severity.
 */
router.post(
  '/incidents',
  authenticate,
  requirePermission('fleet.manage'),
  asyncHandler(maintenanceController.reportIncident.bind(maintenanceController))
);

/**
 * GET /api/fleet/maintenance/incidents
 * Retrieves fleet-wide incident reports with filter support.
 */
router.get(
  '/incidents',
  authenticate,
  requirePermission('fleet.view'),
  asyncHandler(maintenanceController.getIncidents.bind(maintenanceController))
);

/**
 * GET /api/fleet/maintenance/incidents/truck/:truckId
 * Retrieves paginated incident reports for a specific vehicle.
 */
router.get(
  '/incidents/truck/:truckId',
  authenticate,
  requirePermission('fleet.view'),
  asyncHandler(maintenanceController.getTruckIncidents.bind(maintenanceController))
);

/**
 * GET /api/fleet/maintenance/incidents/:id
 * Retrieves single incident report by UUID.
 */
router.get(
  '/incidents/:id',
  authenticate,
  requirePermission('fleet.view'),
  asyncHandler(maintenanceController.getIncidentById.bind(maintenanceController))
);

module.exports = router;
