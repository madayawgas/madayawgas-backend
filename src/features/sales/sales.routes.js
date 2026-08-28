const express = require('express');
const router = express.Router();

const customerController = require('./customer/customer.controller');
const { authenticate, requirePermission } = require('../../middleware/auth.middleware');
const asyncHandler = require('../../utils/asyncHandler');

// ============================================================
// 1. Collection Endpoints (/customers)
// ============================================================

/**
 * GET /api/sales/customers
 * List all customers with optional filtering / overview.
 */
router.get(
  '/customers',
  authenticate,
  requirePermission(['sales.view', 'sales.view_own']),
  asyncHandler(customerController.getAllCustomers.bind(customerController))
);

/**
 * POST /api/sales/customers
 * Register a new customer.
 */
router.post(
  '/customers',
  authenticate,
  requirePermission('sales.create'),
  asyncHandler(customerController.createCustomer.bind(customerController))
);

// ============================================================
// 2. Sub-Resource / Action Endpoints (Before generic :id)
// ============================================================

/**
 * PATCH /api/sales/customers/:id/deactivate
 * Deactivate a customer.
 */
router.patch(
  '/customers/:id/deactivate',
  authenticate,
  requirePermission('sales.update'),
  asyncHandler(customerController.deactivateCustomer.bind(customerController))
);

// ============================================================
// 3. Generic Parameterized Endpoints (:id)
// ============================================================

/**
 * GET /api/sales/customers/:id
 * Retrieve single customer profile by UUID.
 */
router.get(
  '/customers/:id',
  authenticate,
  requirePermission(['sales.view', 'sales.view_own']),
  asyncHandler(customerController.getCustomerById.bind(customerController))
);

/**
 * PATCH /api/sales/customers/:id
 * Update customer profile details.
 */
router.patch(
  '/customers/:id',
  authenticate,
  requirePermission('sales.update'),
  asyncHandler(customerController.updateCustomer.bind(customerController))
);

module.exports = router;
