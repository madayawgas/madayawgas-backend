const express = require('express');
const router = express.Router();
const alertsController = require('./alerts.controller');
const { authenticate, requirePermission } = require('../../../middleware/auth.middleware');
const asyncHandler = require('../../../utils/asyncHandler');

// ============================================================
// Driver Emergency Alerts Routes
// Base Path (when mounted): /api/operations/alerts
// ============================================================

/**
 * POST /api/operations/alerts
 * Single-action mobile emergency alert SOS dispatch.
 */
router.post(
  '/',
  authenticate,
  requirePermission('alerts.trigger'),
  asyncHandler(alertsController.triggerAlert.bind(alertsController))
);

/**
 * GET /api/operations/alerts/active
 * Retrieves all currently active (ACTIVE, ACKNOWLEDGED) emergency alerts for dispatchers.
 * (Declared before parameterized :id to prevent collision)
 */
router.get(
  '/active',
  authenticate,
  requirePermission('alerts.view'),
  asyncHandler(alertsController.getActiveAlerts.bind(alertsController))
);

/**
 * GET /api/operations/alerts/poll
 * Polling endpoint for administrative monitoring dashboards (?since=<ISO_TIMESTAMP>).
 * (Declared before parameterized :id to prevent collision)
 */
router.get(
  '/poll',
  authenticate,
  requirePermission('alerts.view'),
  asyncHandler(alertsController.getPollAlerts.bind(alertsController))
);

/**
 * GET /api/operations/alerts/:id
 * Retrieves single emergency alert details.
 */
router.get(
  '/:id',
  authenticate,
  requirePermission(['alerts.view', 'alerts.view_own']),
  asyncHandler(alertsController.getAlertById.bind(alertsController))
);

/**
 * PATCH /api/operations/alerts/:id/acknowledge
 * Acknowledges an emergency alert by a supervisor or dispatcher.
 */
router.patch(
  '/:id/acknowledge',
  authenticate,
  requirePermission('alerts.manage'),
  asyncHandler(alertsController.acknowledgeAlert.bind(alertsController))
);

/**
 * PATCH /api/operations/alerts/:id/resolve
 * Resolves an emergency alert with notes.
 */
router.patch(
  '/:id/resolve',
  authenticate,
  requirePermission('alerts.manage'),
  asyncHandler(alertsController.resolveAlert.bind(alertsController))
);

/**
 * GET /api/operations/alerts
 * Retrieves paginated emergency alert logs with filtering.
 */
router.get(
  '/',
  authenticate,
  requirePermission(['alerts.view', 'alerts.view_own']),
  asyncHandler(alertsController.getAlerts.bind(alertsController))
);

module.exports = router;
