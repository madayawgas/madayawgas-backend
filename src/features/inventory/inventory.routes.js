const express = require('express');
const router = express.Router();

const productsController = require('./products/products.controller');
const inventoryController = require('./inventory.controller');
const {
  authenticate,
  requirePermission,
  requirePasswordConfirmation,
} = require('../../middleware/auth.middleware');
const asyncHandler = require('../../utils/asyncHandler');

// ============================================================
// 1. Plant Bulk Inventory Endpoints (/plant)
// ============================================================

/**
 * GET /api/inventory/plant
 * Overview of physical bulk stock at Bunawan yard across all products.
 */
router.get(
  '/plant',
  authenticate,
  requirePermission('inventory.view'),
  asyncHandler(inventoryController.getPlantInventory.bind(inventoryController))
);

/**
 * GET /api/inventory/plant/adjustments
 * Audit trail of plant stock adjustments.
 */
router.get(
  '/plant/adjustments',
  authenticate,
  requirePermission('inventory.view'),
  asyncHandler(inventoryController.getPlantAdjustments.bind(inventoryController))
);

/**
 * GET /api/inventory/plant/suggested-split
 * Suggested equal vehicle loading split with supervisor override baseline.
 */
router.get(
  '/plant/suggested-split',
  authenticate,
  requirePermission(['inventory.view', 'route.view', 'route.manage', 'inventory.vehicle.manage']),
  asyncHandler(inventoryController.getSuggestedEqualSplit.bind(inventoryController))
);

/**
 * POST /api/inventory/plant/restock
 * Supplier procurement restock directly into plant stock.
 * Restricted to plant supervisors and administrators.
 */
router.post(
  '/plant/restock',
  authenticate,
  requirePermission('inventory.plant.manage'),
  asyncHandler(inventoryController.restockFromSupplier.bind(inventoryController))
);

/**
 * POST /api/inventory/plant/quarantine-defects
 * Quarantine damaged stock or yard leakers into DEFECTIVE bucket.
 * Restricted to plant supervisors and administrators.
 */
router.post(
  '/plant/quarantine-defects',
  authenticate,
  requirePermission('inventory.plant.manage'),
  asyncHandler(inventoryController.quarantineDefects.bind(inventoryController))
);


// ============================================================
// 2. Global Cross-Fleet Inventory Transfers Ledger (/transfers)
// ============================================================

/**
 * GET /api/inventory/transfers
 * Global cross-fleet paginated ledger of all inventory transfers
 * (Dispatch loads, midday reloads, return unloads, plant restocks, defect quarantines).
 */
router.get(
  '/transfers',
  authenticate,
  requirePermission('inventory.view'),
  asyncHandler(inventoryController.getGlobalTransfers.bind(inventoryController))
);


// ============================================================
// 3. Trip Transfers, Route Stock & Reconciliation (/trips/:tripId)
// ============================================================

/**
 * POST /api/inventory/trips/:tripId/dispatch-load
 * Dispatch load manifest (initial morning load or midday reload).
 * Decrements plant filled stock and attaches manifest to vehicle.
 * Authorized for vehicle stock managers (Sales/Logistics).
 */
router.post(
  '/trips/:tripId/dispatch-load',
  authenticate,
  requirePermission(['inventory.vehicle.manage', 'route.manage']),
  asyncHandler(inventoryController.createDispatchLoad.bind(inventoryController))
);

/**
 * POST /api/inventory/trips/:tripId/return-unload
 * Physical return unload manifest upon plant check-in.
 * Increments plant stock buckets (filled, empty good, defective).
 * Authorized for vehicle stock managers and plant receiving supervisors.
 */
router.post(
  '/trips/:tripId/return-unload',
  authenticate,
  requirePermission(['inventory.vehicle.manage', 'inventory.plant.manage', 'route.manage']),
  asyncHandler(inventoryController.recordReturnUnload.bind(inventoryController))
);

/**
 * GET /api/inventory/trips/:tripId/transfers
 * List all transfer slips and line items for a trip.
 */
router.get(
  '/trips/:tripId/transfers',
  authenticate,
  requirePermission(['inventory.view', 'route.view', 'route.manage', 'inventory.vehicle.manage']),
  asyncHandler(inventoryController.getTripTransfers.bind(inventoryController))
);

/**
 * GET /api/inventory/trips/:tripId/stock
 * Cabin mobile app view: Real-time on-board vehicle stock balance.
 * Accessible by logistics/sales supervisors or assigned frontline sales reps.
 */
router.get(
  '/trips/:tripId/stock',
  authenticate,
  requirePermission(['inventory.view', 'inventory.view_own', 'route.view', 'route.view_own', 'inventory.vehicle.manage']),
  asyncHandler(inventoryController.getVehicleActiveStock.bind(inventoryController))
);

/**
 * POST /api/inventory/trips/:tripId/reconcile
 * Evaluate post-trip stock variance math per product and settle or flag variance.
 * Authorized for vehicle stock managers (Sales/Logistics).
 */
router.post(
  '/trips/:tripId/reconcile',
  authenticate,
  requirePermission(['inventory.vehicle.manage', 'route.manage']),
  asyncHandler(inventoryController.reconcileTrip.bind(inventoryController))
);

/**
 * GET /api/inventory/trips/:tripId/reconciliation
 * Retrieve post-trip stock reconciliation record and per-product variance.
 */
router.get(
  '/trips/:tripId/reconciliation',
  authenticate,
  requirePermission(['inventory.view', 'route.view', 'route.manage', 'inventory.vehicle.manage']),
  asyncHandler(inventoryController.getTripReconciliation.bind(inventoryController))
);


// ============================================================
// 4. Products Catalog CRUD Endpoints (/products)
// ============================================================

/**
 * GET /api/inventory/products
 * List all inventory products with optional filtering.
 */
router.get(
  '/products',
  authenticate,
  requirePermission(['inventory.view', 'sales.view', 'sales.view_own', 'sales.create']),
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

/**
 * PATCH /api/inventory/products/:id/deactivate
 * Deactivate a product item.
 */
router.patch(
  '/products/:id/deactivate',
  authenticate,
  requirePermission('inventory.manage'),
  requirePasswordConfirmation,
  asyncHandler(productsController.deactivateProduct.bind(productsController))
);

/**
 * GET /api/inventory/products/:id
 * Retrieve single product profile by UUID.
 */
router.get(
  '/products/:id',
  authenticate,
  requirePermission(['inventory.view', 'sales.view', 'sales.view_own', 'sales.create']),
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
