const express = require('express');
const router = express.Router();

const zonesController = require('./zones/zones.controller');
const templatesController = require('./templates/templates.controller');
const schedulesController = require('./schedules.controller');
const { authenticate, requirePermission } = require('../../middleware/auth.middleware');
const asyncHandler = require('../../utils/asyncHandler');

// ============================================================
// 1. Service Zones Endpoints (/zones)
// ============================================================

router.get(
  '/zones',
  authenticate,
  requirePermission(['route.view', 'route.view_own']),
  asyncHandler(zonesController.getAllZones.bind(zonesController))
);

router.get(
  '/zones/:id',
  authenticate,
  requirePermission(['route.view', 'route.view_own']),
  asyncHandler(zonesController.getZoneById.bind(zonesController))
);

router.post(
  '/zones',
  authenticate,
  requirePermission('route.manage'),
  asyncHandler(zonesController.createZone.bind(zonesController))
);

router.patch(
  '/zones/:id',
  authenticate,
  requirePermission('route.manage'),
  asyncHandler(zonesController.updateZone.bind(zonesController))
);


// ============================================================
// 2. Weekly Master Route Templates Endpoints (/templates)
// ============================================================

router.get(
  '/templates',
  authenticate,
  requirePermission('route.view'),
  asyncHandler(templatesController.getAllTemplates.bind(templatesController))
);

router.get(
  '/templates/:id',
  authenticate,
  requirePermission('route.view'),
  asyncHandler(templatesController.getTemplateById.bind(templatesController))
);

router.post(
  '/templates',
  authenticate,
  requirePermission('route.manage'),
  asyncHandler(templatesController.createTemplate.bind(templatesController))
);

router.patch(
  '/templates/:id',
  authenticate,
  requirePermission('route.manage'),
  asyncHandler(templatesController.updateTemplate.bind(templatesController))
);

router.delete(
  '/templates/:id',
  authenticate,
  requirePermission('route.manage'),
  asyncHandler(templatesController.deleteTemplate.bind(templatesController))
);


// ============================================================
// 3. Batch Schedule Generation Endpoint (/generate)
// ============================================================

router.post(
  '/generate',
  authenticate,
  requirePermission('route.manage'),
  asyncHandler(schedulesController.generateWeeklySchedules.bind(schedulesController))
);


// ============================================================
// 4. Action Endpoints on Specific Schedules (Before generic :id)
// ============================================================

router.patch(
  '/:id/cancel',
  authenticate,
  requirePermission('route.manage'),
  asyncHandler(schedulesController.cancelSchedule.bind(schedulesController))
);


// ============================================================
// 5. Operational Truck Schedules Collection & Parameterized Endpoints
// ============================================================

router.get(
  '/',
  authenticate,
  requirePermission(['route.view', 'route.view_own']),
  asyncHandler(schedulesController.getAllSchedules.bind(schedulesController))
);

router.post(
  '/',
  authenticate,
  requirePermission('route.manage'),
  asyncHandler(schedulesController.createSchedule.bind(schedulesController))
);

router.get(
  '/:id',
  authenticate,
  requirePermission(['route.view', 'route.view_own']),
  asyncHandler(schedulesController.getScheduleById.bind(schedulesController))
);

router.patch(
  '/:id',
  authenticate,
  requirePermission('route.manage'),
  asyncHandler(schedulesController.updateSchedule.bind(schedulesController))
);

module.exports = router;
