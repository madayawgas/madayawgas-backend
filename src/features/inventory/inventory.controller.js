const { z } = require('zod');
const inventoryService = require('./inventory.service');
const { parsePaginationQuery, formatPaginatedEnvelope } = require('../../utils/pagination');

// Zod Validation Schemas
const RestockSupplierSchema = z.object({
  productId: z.string().uuid({ message: 'productId must be a valid UUID' }),
  condition: z.enum(['FILLED', 'EMPTY_GOOD']).optional().default('FILLED'),
  quantityUnits: z.number().int().positive({ message: 'quantityUnits must be a positive integer' }),
  supplierInvoiceNumber: z.string().trim().optional().nullable(),
  reason: z.string().trim().optional(),
});

const QuarantineDefectsSchema = z.object({
  productId: z.string().uuid({ message: 'productId must be a valid UUID' }),
  sourceCondition: z.enum(['FILLED', 'EMPTY_GOOD']).optional().default('FILLED'),
  quantityUnits: z.number().int().positive({ message: 'quantityUnits must be a positive integer' }),
  reason: z.string().trim().min(3, { message: 'reason must be at least 3 characters' }),
});

const TransferItemSchema = z.object({
  productId: z.string().uuid({ message: 'productId must be a valid UUID' }),
  condition: z.enum(['FILLED', 'EMPTY_GOOD', 'DEFECTIVE']).optional().default('FILLED'),
  quantityUnits: z.number().int().positive({ message: 'quantityUnits must be a positive integer' }),
});

const DispatchLoadSchema = z.object({
  items: z.array(TransferItemSchema).nonempty({ message: 'items must be a non-empty array' }),
  remarks: z.string().trim().optional().nullable(),
});

const ReturnUnloadSchema = z.object({
  items: z.array(TransferItemSchema).nonempty({ message: 'items must be a non-empty array' }),
  remarks: z.string().trim().optional().nullable(),
});

const SalesEntrySchema = z.object({
  productId: z.string().uuid({ message: 'productId must be a valid UUID' }),
  soldFull: z.number().int().min(0).default(0),
  netCustomerDebtCreated: z.number().int().default(0),
});

const ReconcileTripSchema = z.object({
  verifiedByUserId: z.string().uuid().optional().nullable(),
  supervisorNotes: z.string().trim().optional().nullable(),
  syncCompleted: z.boolean().optional().default(true),
  salesData: z.array(SalesEntrySchema).optional().default([]),
});

/**
 * Inventory Controller
 * Handles HTTP requests, parameter extraction, and status response formatting
 * for Bunawan plant bulk stock, supplier restocks, defect quarantine,
 * vehicle dispatch loads, return unloads, cabin active stock, and reconciliation.
 */
class InventoryController {
  /**
   * GET /api/inventory/plant
   * Retrieve Bunawan plant bulk inventory balances across all products.
   */
  async getPlantInventory(req, res) {
    try {
      const inventory = await inventoryService.getPlantInventory();
      return res.status(200).json({
        status: 'success',
        data: {
          count: inventory.length,
          inventory,
        },
      });
    } catch (err) {
      return res.status(err.statusCode || 500).json({
        status: 'fail',
        message: err.message,
      });
    }
  }

  /**
   * POST /api/inventory/plant/restock
   * Supplier procurement stock-in directly into plant inventory.
   */
  async restockFromSupplier(req, res) {
    try {
      const parsedBody = RestockSupplierSchema.safeParse(req.body);
      if (!parsedBody.success) {
        return res.status(400).json({
          status: 'fail',
          message: parsedBody.error.issues[0]?.message || 'Validation error',
          errors: parsedBody.error.issues,
        });
      }

      const result = await inventoryService.restockFromSupplier(req.user, parsedBody.data);
      return res.status(201).json({
        status: 'success',
        message: 'Supplier restock recorded successfully',
        data: result,
      });
    } catch (err) {
      return res.status(err.statusCode || 400).json({
        status: 'fail',
        message: err.message,
      });
    }
  }

  /**
   * POST /api/inventory/plant/quarantine-defects
   * Quarantines yard leakers and damaged cylinders into DEFECTIVE bucket.
   */
  async quarantineDefects(req, res) {
    try {
      const parsedBody = QuarantineDefectsSchema.safeParse(req.body);
      if (!parsedBody.success) {
        return res.status(400).json({
          status: 'fail',
          message: parsedBody.error.issues[0]?.message || 'Validation error',
          errors: parsedBody.error.issues,
        });
      }

      const result = await inventoryService.quarantineDefects(req.user, parsedBody.data);
      return res.status(200).json({
        status: 'success',
        message: 'Defective units quarantined successfully',
        data: result,
      });
    } catch (err) {
      return res.status(err.statusCode || 400).json({
        status: 'fail',
        message: err.message,
      });
    }
  }

  /**
   * GET /api/inventory/plant/adjustments
   * Audit log of plant inventory adjustments.
   */
  async getPlantAdjustments(req, res) {
    try {
      const { productId, adjustmentType, targetCondition } = req.query || {};
      const pagination = parsePaginationQuery(req.query, {
        defaultLimit: 20,
        maxLimit: 100,
        defaultSort: 'recordedAt',
        defaultOrder: 'DESC',
      });

      if (!pagination.isPaginated) {
        const adjustments = await inventoryService.getPlantAdjustments({
          productId,
          adjustmentType,
          targetCondition,
        });
        return res.status(200).json({
          status: 'success',
          data: {
            count: adjustments.length,
            adjustments,
          },
        });
      }

      const { items, meta } = await inventoryService.getPlantAdjustments(
        { productId, adjustmentType, targetCondition },
        pagination
      );
      return res.status(200).json(formatPaginatedEnvelope(items, meta));
    } catch (err) {
      return res.status(err.statusCode || 500).json({
        status: 'fail',
        message: err.message,
      });
    }
  }

  /**
   * GET /api/inventory/plant/suggested-split
   * Auto-calculates equal vehicle loading split with supervisor override baseline.
   */
  async getSuggestedEqualSplit(req, res) {
    try {
      const { productId, activeTripCount } = req.query || {};
      if (!productId) {
        return res.status(400).json({
          status: 'fail',
          message: 'productId query parameter is required',
        });
      }

      const result = await inventoryService.getSuggestedEqualSplit(productId, activeTripCount);
      return res.status(200).json({
        status: 'success',
        data: result,
      });
    } catch (err) {
      return res.status(err.statusCode || 400).json({
        status: 'fail',
        message: err.message,
      });
    }
  }

  /**
   * POST /api/inventory/trips/:tripId/dispatch-load
   * Initial dispatch load or midday reload transfer slip.
   * Decrements plant filled stock and attaches manifest to vehicle.
   */
  async createDispatchLoad(req, res) {
    try {
      const parsedBody = DispatchLoadSchema.safeParse(req.body);
      if (!parsedBody.success) {
        return res.status(400).json({
          status: 'fail',
          message: parsedBody.error.issues[0]?.message || 'Validation error',
          errors: parsedBody.error.issues,
        });
      }

      const load = await inventoryService.createDispatchLoad(req.user, {
        tripId: req.params.tripId,
        items: parsedBody.data.items,
        remarks: parsedBody.data.remarks,
      });

      return res.status(201).json({
        status: 'success',
        message: 'Dispatch load manifest recorded and plant stock allocated',
        data: { load },
      });
    } catch (err) {
      return res.status(err.statusCode || 400).json({
        status: 'fail',
        message: err.message,
      });
    }
  }

  /**
   * POST /api/inventory/trips/:tripId/return-unload
   * Post-dispatch physical return unload transfer slip.
   * Increments plant stock buckets (filled, empty good, defective).
   */
  async recordReturnUnload(req, res) {
    try {
      const parsedBody = ReturnUnloadSchema.safeParse(req.body);
      if (!parsedBody.success) {
        return res.status(400).json({
          status: 'fail',
          message: parsedBody.error.issues[0]?.message || 'Validation error',
          errors: parsedBody.error.issues,
        });
      }

      const unload = await inventoryService.recordReturnUnload(req.user, {
        tripId: req.params.tripId,
        items: parsedBody.data.items,
        remarks: parsedBody.data.remarks,
      });

      return res.status(201).json({
        status: 'success',
        message: 'Return unload manifest recorded and plant stock updated',
        data: { unload },
      });
    } catch (err) {
      return res.status(err.statusCode || 400).json({
        status: 'fail',
        message: err.message,
      });
    }
  }

  /**
   * GET /api/inventory/trips/:tripId/transfers
   * Retrieves all multi-load transfer slips for a trip.
   */
  async getTripTransfers(req, res) {
    try {
      const transfers = await inventoryService.getTripTransfers(req.params.tripId, req.user);
      return res.status(200).json({
        status: 'success',
        data: {
          count: transfers.length,
          transfers,
        },
      });
    } catch (err) {
      return res.status(err.statusCode || 400).json({
        status: 'fail',
        message: err.message,
      });
    }
  }

  /**
   * GET /api/inventory/trips/:tripId/stock
   * Cabin mobile app visibility: Returns active vehicle loaded stock,
   * returned stock, and current on-board unit balance per product.
   */
  async getVehicleActiveStock(req, res) {
    try {
      const stock = await inventoryService.getVehicleActiveStock(req.params.tripId, req.user);
      return res.status(200).json({
        status: 'success',
        data: stock,
      });
    } catch (err) {
      return res.status(err.statusCode || 400).json({
        status: 'fail',
        message: err.message,
      });
    }
  }

  /**
   * POST /api/inventory/trips/:tripId/reconcile
   * Triggers post-trip reconciliation math per product and overall settlement.
   */
  async reconcileTrip(req, res) {
    try {
      const parsedBody = ReconcileTripSchema.safeParse(req.body);
      if (!parsedBody.success) {
        return res.status(400).json({
          status: 'fail',
          message: parsedBody.error.issues[0]?.message || 'Validation error',
          errors: parsedBody.error.issues,
        });
      }

      const result = await inventoryService.reconcileTrip(req.user, {
        tripId: req.params.tripId,
        ...parsedBody.data,
      });

      return res.status(200).json({
        status: 'success',
        message: `Trip stock reconciliation completed with status '${result.status}'`,
        data: { reconciliation: result },
      });
    } catch (err) {
      return res.status(err.statusCode || 400).json({
        status: 'fail',
        message: err.message,
      });
    }
  }

  /**
   * GET /api/inventory/trips/:tripId/reconciliation
   * Retrieve trip stock reconciliation record with per-product variance.
   */
  async getTripReconciliation(req, res) {
    try {
      const reconciliation = await inventoryService.getTripReconciliation(
        req.params.tripId,
        req.user
      );
      return res.status(200).json({
        status: 'success',
        data: { reconciliation },
      });
    } catch (err) {
      return res.status(err.statusCode || 400).json({
        status: 'fail',
        message: err.message,
      });
    }
  }
}

module.exports = new InventoryController();
