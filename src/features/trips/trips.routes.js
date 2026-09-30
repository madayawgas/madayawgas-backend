const express = require('express');
const router = express.Router();

const tripsController = require('./trips.controller');
const { authenticate, requirePermission } = require('../../middleware/auth.middleware');
const asyncHandler = require('../../utils/asyncHandler');

// ============================================================
// 1. Static & Dispatch Endpoints
// ============================================================

router.post(
  '/dispatch',
  authenticate,
  requirePermission('route.manage'),
  asyncHandler(tripsController.dispatchTrip.bind(tripsController))
);

router.get(
  '/',
  authenticate,
  requirePermission(['route.view', 'route.view_own']),
  asyncHandler(tripsController.getAllTrips.bind(tripsController))
);


// ============================================================
// 2. Action Endpoints on Specific Trips
// ============================================================

router.patch(
  '/:id/cancel',
  authenticate,
  requirePermission('route.manage'),
  asyncHandler(tripsController.cancelTrip.bind(tripsController))
);

router.post(
  '/:id/loads',
  authenticate,
  requirePermission('route.manage'),
  asyncHandler(tripsController.recordTripLoad.bind(tripsController))
);

router.get(
  '/:id/loads',
  authenticate,
  requirePermission(['route.view', 'route.view_own']),
  asyncHandler(tripsController.getTripLoads.bind(tripsController))
);

router.post(
  '/:id/complete',
  authenticate,
  requirePermission('route.manage'),
  asyncHandler(tripsController.completeTrip.bind(tripsController))
);

router.post(
  '/:id/reconcile',
  authenticate,
  requirePermission('route.manage'),
  asyncHandler(tripsController.reconcileTrip.bind(tripsController))
);

router.get(
  '/:id/reconciliation',
  authenticate,
  requirePermission(['route.view', 'route.view_own']),
  asyncHandler(tripsController.getTripReconciliation.bind(tripsController))
);


// ============================================================
// 3. Generic Parameterized Trip Detail Endpoint (:id)
// ============================================================

router.get(
  '/:id',
  authenticate,
  requirePermission(['route.view', 'route.view_own']),
  asyncHandler(tripsController.getTripById.bind(tripsController))
);

module.exports = router;
