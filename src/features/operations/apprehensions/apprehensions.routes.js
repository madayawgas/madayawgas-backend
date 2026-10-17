const express = require('express');
const router = express.Router();
const apprehensionsController = require('./apprehensions.controller');
const { authenticate, requirePermission } = require('../../../middleware/auth.middleware');
const asyncHandler = require('../../../utils/asyncHandler');

// ============================================================
// Driver Road Apprehensions Routes
// Base Path (when mounted): /api/operations/apprehensions
// ============================================================

/**
 * POST /api/operations/apprehensions
 * Records roadside traffic citation with mandatory ticket image proof.
 */
router.post(
  '/',
  authenticate,
  requirePermission('apprehensions.create'),
  asyncHandler(apprehensionsController.recordApprehension.bind(apprehensionsController))
);

/**
 * GET /api/operations/apprehensions/:id
 * Retrieves single apprehension detail by UUID.
 */
router.get(
  '/:id',
  authenticate,
  requirePermission(['apprehensions.view', 'apprehensions.view_own']),
  asyncHandler(apprehensionsController.getApprehensionById.bind(apprehensionsController))
);

/**
 * PATCH /api/operations/apprehensions/:id/status
 * Updates status of an apprehension record (SETTLED, DISPUTED, CANCELLED).
 */
router.patch(
  '/:id/status',
  authenticate,
  requirePermission('apprehensions.manage'),
  asyncHandler(apprehensionsController.updateStatus.bind(apprehensionsController))
);

/**
 * GET /api/operations/apprehensions
 * Retrieves paginated roadside apprehension history with server-side filtering.
 */
router.get(
  '/',
  authenticate,
  requirePermission(['apprehensions.view', 'apprehensions.view_own']),
  asyncHandler(apprehensionsController.getApprehensions.bind(apprehensionsController))
);

module.exports = router;
