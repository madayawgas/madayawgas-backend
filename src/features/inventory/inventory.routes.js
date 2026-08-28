const express = require('express');
const router = express.Router();

const productsController = require('./products/products.controller');
const { authenticate, requirePermission } = require('../../middleware/auth.middleware');
const asyncHandler = require('../../utils/asyncHandler');

// ============================================================
// 1. Collection Endpoints (/products)
// ============================================================

/**
 * GET /api/inventory/products
 * List all inventory products with optional filtering.
 */
router.get(
  '/products',
  authenticate,
  requirePermission('inventory.view'),
  asyncHandler(productsController.getAllProducts.bind(productsController))
);

/**
 * POST /api/inventory/products
 * Register a new product item.
 */
router.post(
  '/products',
  authenticate,
  requirePermission('inventory.manage'),
  asyncHandler(productsController.createProduct.bind(productsController))
);

// ============================================================
// 2. Sub-Resource / Action Endpoints (Before generic :id)
// ============================================================

/**
 * PATCH /api/inventory/products/:id/deactivate
 * Deactivate a product item.
 */
router.patch(
  '/products/:id/deactivate',
  authenticate,
  requirePermission('inventory.manage'),
  asyncHandler(productsController.deactivateProduct.bind(productsController))
);

// ============================================================
// 3. Generic Parameterized Endpoints (:id)
// ============================================================

/**
 * GET /api/inventory/products/:id
 * Retrieve single product profile by UUID.
 */
router.get(
  '/products/:id',
  authenticate,
  requirePermission('inventory.view'),
  asyncHandler(productsController.getProductById.bind(productsController))
);

/**
 * PATCH /api/inventory/products/:id
 * Update product item details.
 */
router.patch(
  '/products/:id',
  authenticate,
  requirePermission('inventory.manage'),
  asyncHandler(productsController.updateProduct.bind(productsController))
);

module.exports = router;
