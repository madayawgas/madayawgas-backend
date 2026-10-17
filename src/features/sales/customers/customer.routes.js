const express = require('express');
const router = express.Router();

const customerController = require('./customer.controller');
const {
  authenticate,
  requirePermission,
  requirePasswordConfirmation,
} = require('../../../middleware/auth.middleware');
const asyncHandler = require('../../../utils/asyncHandler');

// ============================================================
// 1. Action Endpoints (Declared BEFORE :id to avoid param collision)
// ============================================================

/**
 * PATCH /api/sales/customers/:id/deactivate
 * Soft-deactivates customer profile (guarded by supervisor password confirmation).
 */
router.patch(
  '/:id/deactivate',
  authenticate,
  requirePermission('sales.update'),
  requirePasswordConfirmation,
  asyncHandler(customerController.deactivateCustomer.bind(customerController))
);

/**
 * PATCH /api/sales/customers/:id/activate
 * Re-activates customer profile.
 */
router.patch(
  '/:id/activate',
  authenticate,
  requirePermission('sales.update'),
  asyncHandler(customerController.activateCustomer.bind(customerController))
);

// ============================================================
// 2. Collection Endpoints
// ============================================================

/**
 * GET /api/sales/customers
 * List all customers with optional filtering, search, and pagination.
 */
router.get(
  '/',
  authenticate,
  requirePermission(['sales.view', 'sales.view_own']),
  asyncHandler(customerController.getAllCustomers.bind(customerController))
);

/**
 * POST /api/sales/customers
 * Registers a new customer profile with immediate activation.
 */
router.post(
  '/',
  authenticate,
  requirePermission('sales.create'),
  asyncHandler(customerController.createCustomer.bind(customerController))
);

// ============================================================
// 3. Generic Parameterized Endpoints (:id)
// ============================================================

/**
 * GET /api/sales/customers/:id
 * Retrieves single customer profile with dynamic canister receivables breakdown.
 */
router.get(
  '/:id',
  authenticate,
  requirePermission(['sales.view', 'sales.view_own']),
  asyncHandler(customerController.getCustomerById.bind(customerController))
);

/**
 * PATCH /api/sales/customers/:id
 * Updates customer profile details.
 */
router.patch(
  '/:id',
  authenticate,
  requirePermission('sales.update'),
  asyncHandler(customerController.updateCustomer.bind(customerController))
);

module.exports = router;
