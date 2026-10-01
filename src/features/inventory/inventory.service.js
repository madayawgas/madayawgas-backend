const crypto = require('crypto');
const { pool } = require('../../../database/connection');
const inventoryRepository = require('./inventory.repository');
const productsRepository = require('./products/products.repository');
const { historyService, EVENTS } = require('../history');
const { buildPaginationMeta } = require('../../utils/pagination');

/**
 * Inventory Service
 * Domain logic for Bunawan yard plant bulk inventory, supplier restock,
 * yard defect quarantine, vehicle route stock transfers, cabin on-board stock lookups,
 * and post-trip multi-SKU stock reconciliation.
 */
class InventoryService {
  /**
   * Generates unique transfer slip number.
   * @param {string} prefix - 'LOAD' or 'UNLOAD'
   */
  generateSlipNumber(prefix = 'LOAD') {
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
    const rand = crypto.randomBytes(3).toString('hex').toUpperCase();
    return `${prefix}-${dateStr}-${rand}`;
  }

  /**
   * Helper to validate transfer line items.
   * @param {Array} items
   * @param {boolean} requireCondition
   */
  async validateTransferItems(items, requireCondition = false) {
    if (!Array.isArray(items) || items.length === 0) {
      const err = new Error('Items must be a non-empty array');
      err.statusCode = 400;
      throw err;
    }

    const validatedItems = [];
    const validConditions = ['FILLED', 'EMPTY_GOOD', 'DEFECTIVE'];

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (!item.productId || typeof item.productId !== 'string') {
        const err = new Error(`Item at index ${i}: productId is required`);
        err.statusCode = 400;
        throw err;
      }

      const product = await productsRepository.getProductById(item.productId.trim());
      if (!product) {
        const err = new Error(`Item at index ${i}: Product with ID '${item.productId}' not found`);
        err.statusCode = 404;
        throw err;
      }

      let condition = 'FILLED';
      if (requireCondition || item.condition) {
        condition = (item.condition || 'FILLED').toUpperCase().trim();
        if (!validConditions.includes(condition)) {
          const err = new Error(
            `Item at index ${i}: condition must be one of ${validConditions.join(', ')}`
          );
          err.statusCode = 400;
          throw err;
        }
      }

      const qty = parseInt(item.quantityUnits, 10);
      if (isNaN(qty) || qty <= 0) {
        const err = new Error(`Item at index ${i}: quantityUnits must be a positive integer`);
        err.statusCode = 400;
        throw err;
      }

      validatedItems.push({
        productId: product.id,
        productName: product.name,
        condition,
        quantityUnits: qty,
      });
    }

    return validatedItems;
  }

  /**
   * Retrieves plant bulk inventory balances across all catalog products.
   */
  async getPlantInventory() {
    const items = await inventoryRepository.getPlantInventory();

    return items.map((item) => {
      const isCanister = item.container_type === 'CANISTER';
      return {
        ...item,
        cratesFilled: isCanister ? Math.floor(item.quantity_filled / 24) : null,
        cratesEmptyGood: isCanister ? Math.floor(item.quantity_empty_good / 24) : null,
        cratesDefective: isCanister ? Math.floor(item.quantity_defective / 24) : null,
      };
    });
  }

  /**
   * Restocks plant inventory directly from supplier delivery.
   * Increments plant quantity_filled or quantity_empty_good and logs audit trail.
   *
   * @param {Object} actorUser
   * @param {Object} payload - { productId, condition, quantityUnits, supplierInvoiceNumber, reason }
   */
  async restockFromSupplier(actorUser, payload = {}) {
    const { productId, condition = 'FILLED', quantityUnits, supplierInvoiceNumber, reason } = payload;

    if (!productId || typeof productId !== 'string') {
      const err = new Error('productId is required');
      err.statusCode = 400;
      throw err;
    }

    const product = await productsRepository.getProductById(productId.trim());
    if (!product) {
      const err = new Error(`Product with ID '${productId}' not found`);
      err.statusCode = 404;
      throw err;
    }

    const targetCond = (condition || 'FILLED').toUpperCase().trim();
    if (!['FILLED', 'EMPTY_GOOD'].includes(targetCond)) {
      const err = new Error("Restock condition must be either 'FILLED' or 'EMPTY_GOOD'");
      err.statusCode = 400;
      throw err;
    }

    const qty = parseInt(quantityUnits, 10);
    if (isNaN(qty) || qty <= 0) {
      const err = new Error('quantityUnits must be a positive integer');
      err.statusCode = 400;
      throw err;
    }

    const resolvedReason = reason && typeof reason === 'string' && reason.trim().length > 0
      ? reason.trim()
      : 'Supplier procurement restock delivery';

    const client = await pool.connect();
    let updatedStock;
    let adjustmentRecord;

    try {
      await client.query('BEGIN');

      const deltaFilled = targetCond === 'FILLED' ? qty : 0;
      const deltaEmptyGood = targetCond === 'EMPTY_GOOD' ? qty : 0;

      updatedStock = await inventoryRepository.adjustPlantStock(
        {
          productId: product.id,
          deltaFilled,
          deltaEmptyGood,
          deltaDefective: 0,
        },
        client
      );

      adjustmentRecord = await inventoryRepository.recordStockAdjustment(
        {
          productId: product.id,
          recordedBy: actorUser?.id || null,
          adjustmentType: 'SUPPLIER_PURCHASE',
          targetCondition: targetCond,
          deltaQuantity: qty,
          sourceCondition: null,
          supplierInvoiceNumber: supplierInvoiceNumber ? supplierInvoiceNumber.trim() : null,
          reason: resolvedReason,
        },
        client
      );

      await client.query('COMMIT');
    } catch (txErr) {
      await client.query('ROLLBACK');
      throw txErr;
    } finally {
      client.release();
    }

    await historyService.log(EVENTS.INVENTORY_SUPPLIER_RESTOCKED, {
      actorUser,
      targetId: updatedStock.id,
      payload: {
        productName: product.name,
        quantityUnits: qty,
        condition: targetCond,
        supplierInvoiceNumber: supplierInvoiceNumber || null,
      },
      metadata: {
        productId: product.id,
        adjustmentId: adjustmentRecord.id,
        reason: resolvedReason,
      },
    });

    return {
      stock: updatedStock,
      adjustment: adjustmentRecord,
    };
  }

  /**
   * Quarantines yard leakers or damaged stock into defective inventory bucket.
   * Deducts from filled or empty good and increments defective bucket.
   *
   * @param {Object} actorUser
   * @param {Object} payload - { productId, sourceCondition, quantityUnits, reason }
   */
  async quarantineDefects(actorUser, payload = {}) {
    const { productId, sourceCondition = 'FILLED', quantityUnits, reason } = payload;

    if (!productId || typeof productId !== 'string') {
      const err = new Error('productId is required');
      err.statusCode = 400;
      throw err;
    }

    const product = await productsRepository.getProductById(productId.trim());
    if (!product) {
      const err = new Error(`Product with ID '${productId}' not found`);
      err.statusCode = 404;
      throw err;
    }

    const sourceCond = (sourceCondition || 'FILLED').toUpperCase().trim();
    if (!['FILLED', 'EMPTY_GOOD'].includes(sourceCond)) {
      const err = new Error("sourceCondition must be either 'FILLED' or 'EMPTY_GOOD'");
      err.statusCode = 400;
      throw err;
    }

    const qty = parseInt(quantityUnits, 10);
    if (isNaN(qty) || qty <= 0) {
      const err = new Error('quantityUnits must be a positive integer');
      err.statusCode = 400;
      throw err;
    }

    if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
      const err = new Error('reason is required when quarantining defective stock');
      err.statusCode = 400;
      throw err;
    }

    const client = await pool.connect();
    let updatedStock;
    let adjustmentRecord;

    try {
      await client.query('BEGIN');

      const currentStock = await inventoryRepository.getPlantStockByProductId(
        product.id,
        client,
        true
      );

      if (!currentStock) {
        const err = new Error(`Plant inventory record for '${product.name}' not found`);
        err.statusCode = 404;
        throw err;
      }

      const available = sourceCond === 'FILLED'
        ? currentStock.quantity_filled
        : currentStock.quantity_empty_good;

      if (available < qty) {
        const err = new Error(
          `Insufficient plant ${sourceCond.toLowerCase()} stock to quarantine. Available: ${available}, Requested: ${qty}`
        );
        err.statusCode = 400;
        throw err;
      }

      const deltaFilled = sourceCond === 'FILLED' ? -qty : 0;
      const deltaEmptyGood = sourceCond === 'EMPTY_GOOD' ? -qty : 0;
      const deltaDefective = qty;

      updatedStock = await inventoryRepository.adjustPlantStock(
        {
          productId: product.id,
          deltaFilled,
          deltaEmptyGood,
          deltaDefective,
        },
        client
      );

      adjustmentRecord = await inventoryRepository.recordStockAdjustment(
        {
          productId: product.id,
          recordedBy: actorUser?.id || null,
          adjustmentType: 'DEFECT_ADJUSTMENT',
          targetCondition: 'DEFECTIVE',
          deltaQuantity: qty,
          sourceCondition: sourceCond,
          supplierInvoiceNumber: null,
          reason: reason.trim(),
        },
        client
      );

      await client.query('COMMIT');
    } catch (txErr) {
      await client.query('ROLLBACK');
      throw txErr;
    } finally {
      client.release();
    }

    await historyService.log(EVENTS.INVENTORY_DEFECT_QUARANTINED, {
      actorUser,
      targetId: updatedStock.id,
      payload: {
        productName: product.name,
        quantityUnits: qty,
        sourceCondition: sourceCond,
        reason: reason.trim(),
      },
      metadata: {
        productId: product.id,
        adjustmentId: adjustmentRecord.id,
      },
    });

    return {
      stock: updatedStock,
      adjustment: adjustmentRecord,
    };
  }

  /**
   * Retrieves plant stock adjustments audit history.
   */
  async getPlantAdjustments(filters = {}, pagination = null) {
    if (!pagination || !pagination.isPaginated) {
      return inventoryRepository.getPlantAdjustments(filters, null);
    }

    const { rows, total } = await inventoryRepository.getPlantAdjustments(filters, pagination);
    const meta = buildPaginationMeta(total, pagination.page, pagination.limit);

    return { items: rows, meta };
  }

  /**
   * Computes suggested equal loading split per active truck with supervisor override baseline.
   * Formula: floor(plant_inventory.quantity_filled / activeTruckCount)
   *
   * @param {string} productId
   * @param {number} [activeTripCount]
   */
  async getSuggestedEqualSplit(productId, activeTripCount = null) {
    if (!productId || typeof productId !== 'string') {
      const err = new Error('productId is required');
      err.statusCode = 400;
      throw err;
    }

    const product = await productsRepository.getProductById(productId.trim());
    if (!product) {
      const err = new Error('Product not found');
      err.statusCode = 404;
      throw err;
    }

    const stock = await inventoryRepository.getPlantStockByProductId(product.id);
    const filledAvailable = stock ? stock.quantity_filled : 0;

    let targetCount = activeTripCount ? parseInt(activeTripCount, 10) : null;
    if (!targetCount || isNaN(targetCount) || targetCount <= 0) {
      const counts = await inventoryRepository.getActiveCounts();
      targetCount = counts.activeTripCount > 0 ? counts.activeTripCount : counts.activeTruckCount;
    }

    if (!targetCount || targetCount <= 0) {
      targetCount = 1;
    }

    const suggestedUnitsPerTruck = Math.floor(filledAvailable / targetCount);
    const isCanister = product.container_type === 'CANISTER';
    const suggestedCratesPerTruck = isCanister ? Math.floor(suggestedUnitsPerTruck / 24) : null;
    const remainingUnits = filledAvailable - suggestedUnitsPerTruck * targetCount;

    return {
      product: {
        id: product.id,
        name: product.name,
        category: product.category,
        containerType: product.container_type,
      },
      plantStockFilled: filledAvailable,
      activeTruckCount: targetCount,
      suggestedUnitsPerTruck,
      suggestedCratesPerTruck,
      remainingUnits,
    };
  }

  /**
   * Creates a DISPATCH_LOAD transfer slip (initial morning load or midday reload).
   * Validates plant has sufficient quantity_filled, decrements plant stock atomically,
   * and records transfer slip + line items.
   *
   * @param {Object} actorUser
   * @param {Object} payload - { tripId, items, remarks }
   */
  async createDispatchLoad(actorUser, payload = {}) {
    const { tripId, items, remarks } = payload;

    if (!tripId || typeof tripId !== 'string') {
      const err = new Error('tripId is required');
      err.statusCode = 400;
      throw err;
    }

    const trip = await inventoryRepository.getTripById(tripId.trim());
    if (!trip) {
      const err = new Error('Trip not found');
      err.statusCode = 404;
      throw err;
    }

    if (trip.status !== 'IN_PROGRESS') {
      const err = new Error(`Cannot dispatch load for trip in '${trip.status}' status`);
      err.statusCode = 400;
      throw err;
    }

    const validatedItems = await this.validateTransferItems(items, false);
    const slipNumber = this.generateSlipNumber('LOAD');

    const client = await pool.connect();
    let createdLoad;

    try {
      await client.query('BEGIN');

      // 1. Verify plant stock and decrement quantity_filled
      for (const item of validatedItems) {
        const stock = await inventoryRepository.getPlantStockByProductId(
          item.productId,
          client,
          true
        );

        const available = stock ? stock.quantity_filled : 0;
        if (available < item.quantityUnits) {
          const err = new Error(
            `Insufficient plant filled stock for '${item.productName}'. Available: ${available}, Requested: ${item.quantityUnits}`
          );
          err.statusCode = 400;
          throw err;
        }

        await inventoryRepository.adjustPlantStock(
          {
            productId: item.productId,
            deltaFilled: -item.quantityUnits,
            deltaEmptyGood: 0,
            deltaDefective: 0,
          },
          client
        );
      }

      // 2. Insert load and load items
      createdLoad = await inventoryRepository.createTripTransferWithItems(
        {
          tripId: trip.id,
          transferType: 'DISPATCH_LOAD',
          slipNumber,
          recordedBy: actorUser?.id || null,
          remarks: remarks ? remarks.trim() : 'Outbound dispatch load manifest',
          items: validatedItems.map((it) => ({
            productId: it.productId,
            condition: 'FILLED',
            quantityUnits: it.quantityUnits,
          })),
        },
        client
      );

      await client.query('COMMIT');
    } catch (txErr) {
      await client.query('ROLLBACK');
      throw txErr;
    } finally {
      client.release();
    }

    const totalUnits = validatedItems.reduce((sum, it) => sum + it.quantityUnits, 0);

    await historyService.log(EVENTS.INVENTORY_TRIP_LOADED, {
      actorUser,
      targetId: createdLoad.id,
      payload: {
        tripNumber: trip.trip_number,
        slipNumber: createdLoad.slip_number,
        totalUnits,
      },
      metadata: {
        tripId: trip.id,
        plateNumber: trip.truck_plate_number,
        itemCount: validatedItems.length,
      },
    });

    return createdLoad;
  }

  /**
   * Records a RETURN_UNLOAD transfer slip upon plant check-in.
   * Increments plant inventory corresponding buckets (FILLED, EMPTY_GOOD, DEFECTIVE)
   * and records transfer slip + line items.
   *
   * @param {Object} actorUser
   * @param {Object} payload - { tripId, items, remarks }
   */
  async recordReturnUnload(actorUser, payload = {}) {
    const { tripId, items, remarks } = payload;

    if (!tripId || typeof tripId !== 'string') {
      const err = new Error('tripId is required');
      err.statusCode = 400;
      throw err;
    }

    const trip = await inventoryRepository.getTripById(tripId.trim());
    if (!trip) {
      const err = new Error('Trip not found');
      err.statusCode = 404;
      throw err;
    }

    if (!['IN_PROGRESS', 'COMPLETED'].includes(trip.status)) {
      const err = new Error(`Cannot record return unload for trip in '${trip.status}' status`);
      err.statusCode = 400;
      throw err;
    }

    const validatedItems = await this.validateTransferItems(items, true);
    const slipNumber = this.generateSlipNumber('UNLOAD');

    const client = await pool.connect();
    let createdUnload;

    try {
      await client.query('BEGIN');

      // 1. Increment plant inventory buckets based on condition
      for (const item of validatedItems) {
        const deltaFilled = item.condition === 'FILLED' ? item.quantityUnits : 0;
        const deltaEmptyGood = item.condition === 'EMPTY_GOOD' ? item.quantityUnits : 0;
        const deltaDefective = item.condition === 'DEFECTIVE' ? item.quantityUnits : 0;

        await inventoryRepository.adjustPlantStock(
          {
            productId: item.productId,
            deltaFilled,
            deltaEmptyGood,
            deltaDefective,
          },
          client
        );
      }

      // 2. Insert load and load items
      createdUnload = await inventoryRepository.createTripTransferWithItems(
        {
          tripId: trip.id,
          transferType: 'RETURN_UNLOAD',
          slipNumber,
          recordedBy: actorUser?.id || null,
          remarks: remarks ? remarks.trim() : 'Post-trip return unload manifest',
          items: validatedItems,
        },
        client
      );

      await client.query('COMMIT');
    } catch (txErr) {
      await client.query('ROLLBACK');
      throw txErr;
    } finally {
      client.release();
    }

    const totalUnits = validatedItems.reduce((sum, it) => sum + it.quantityUnits, 0);

    await historyService.log(EVENTS.INVENTORY_TRIP_UNLOADED, {
      actorUser,
      targetId: createdUnload.id,
      payload: {
        tripNumber: trip.trip_number,
        slipNumber: createdUnload.slip_number,
        totalUnits,
      },
      metadata: {
        tripId: trip.id,
        plateNumber: trip.truck_plate_number,
        itemCount: validatedItems.length,
      },
    });

    return createdUnload;
  }

  /**
   * Retrieves all transfer slips and line items for a trip.
   * @param {string} tripId
   * @param {Object} actorUser
   */
  async getTripTransfers(tripId, actorUser) {
    if (!tripId || typeof tripId !== 'string') {
      const err = new Error('tripId is required');
      err.statusCode = 400;
      throw err;
    }

    const trip = await inventoryRepository.getTripById(tripId.trim());
    if (!trip) {
      const err = new Error('Trip not found');
      err.statusCode = 404;
      throw err;
    }

    return inventoryRepository.getTransfersByTripId(trip.id);
  }

  /**
   * Cabin app visibility: Computes cumulative loaded, returned, and current
   * on-board stock balances per product for the active vehicle trip.
   *
   * @param {string} tripId
   * @param {Object} actorUser
   */
  async getVehicleActiveStock(tripId, actorUser) {
    if (!tripId || typeof tripId !== 'string') {
      const err = new Error('tripId is required');
      err.statusCode = 400;
      throw err;
    }

    const trip = await inventoryRepository.getTripById(tripId.trim());
    if (!trip) {
      const err = new Error('Trip not found');
      err.statusCode = 404;
      throw err;
    }

    const permissions = actorUser?.permissions || [];
    const hasGlobalView = permissions.includes('inventory.view') || permissions.includes('inventory.manage');
    const hasOwnView = permissions.includes('inventory.view_own') || permissions.includes('route.view_own');

    if (!hasGlobalView && hasOwnView && trip.sales_user_id !== actorUser.id) {
      const err = new Error('Access denied: You can only view active stock for trips assigned to you');
      err.statusCode = 403;
      throw err;
    }

    const stockItems = await inventoryRepository.getVehicleActiveStockPerProduct(trip.id);

    const items = stockItems.map((it) => {
      const onBoardFull = it.loaded_full - it.returned_full;
      const isCanister = it.container_type === 'CANISTER';

      return {
        productId: it.product_id,
        productName: it.product_name,
        category: it.category,
        containerType: it.container_type,
        netWeightKg: it.net_weight_kg,
        loadedFull: it.loaded_full,
        returnedFull: it.returned_full,
        returnedEmptyGood: it.returned_empty_good,
        returnedDefective: it.returned_defective,
        currentOnBoardFull: onBoardFull,
        currentOnBoardEmpty: it.returned_empty_good,
        currentOnBoardDefective: it.returned_defective,
        cratesOnBoardFull: isCanister ? Math.floor(onBoardFull / 24) : null,
      };
    });

    return {
      tripId: trip.id,
      tripNumber: trip.trip_number,
      truckPlateNumber: trip.truck_plate_number,
      tripStatus: trip.status,
      items,
    };
  }

  /**
   * Reconciles trip stock against physical returns, synchronized sales batches,
   * and customer cylinder debt movement.
   *
   * Formulas (evaluated per product and overall aggregate):
   * fullDiscrepancy = totalLoadedFull - totalSoldFull - totalReturnedFull - totalReturnedDefective
   * emptyDiscrepancy = totalSoldFull - (totalReturnedEmptyGood + netCustomerDebtCreated)
   *
   * @param {Object} actorUser
   * @param {Object} payload - { tripId, verifiedByUserId, supervisorNotes, syncCompleted = true, salesData = [] }
   */
  async reconcileTrip(actorUser, payload = {}) {
    const {
      tripId,
      verifiedByUserId,
      supervisorNotes,
      syncCompleted = true,
      salesData = [],
    } = payload;

    if (!tripId || typeof tripId !== 'string') {
      const err = new Error('tripId is required');
      err.statusCode = 400;
      throw err;
    }

    const trip = await inventoryRepository.getTripById(tripId.trim());
    if (!trip) {
      const err = new Error('Trip not found');
      err.statusCode = 404;
      throw err;
    }

    // 1. Fetch physical transfer summary per product
    const stockItems = await inventoryRepository.getVehicleActiveStockPerProduct(trip.id);

    // 2. Map sales and debt data by productId
    const salesMap = {};
    if (Array.isArray(salesData)) {
      for (const entry of salesData) {
        if (entry.productId) {
          salesMap[entry.productId] = {
            soldFull: parseInt(entry.soldFull || 0, 10) || 0,
            netCustomerDebtCreated: parseInt(entry.netCustomerDebtCreated || 0, 10) || 0,
          };
        }
      }
    }

    // 3. Compute per-product breakdown and check for zero variance
    let allProductsSettled = true;
    let totalLoadedFull = 0;
    let totalSoldFull = 0;
    let totalReturnedFull = 0;
    let totalReturnedEmptyGood = 0;
    let totalReturnedDefective = 0;
    let totalNetCustomerDebtCreated = 0;
    let totalFullDiscrepancy = 0;
    let totalEmptyDiscrepancy = 0;

    const reconciliationData = stockItems.map((item) => {
      const sales = salesMap[item.product_id] || { soldFull: 0, netCustomerDebtCreated: 0 };
      const soldFull = sales.soldFull;
      const netDebt = sales.netCustomerDebtCreated;

      const loadedFull = item.loaded_full;
      const returnedFull = item.returned_full;
      const returnedEmptyGood = item.returned_empty_good;
      const returnedDefective = item.returned_defective;

      // Invariant formulas
      const fullDiscrepancy = loadedFull - soldFull - returnedFull - returnedDefective;
      const emptyDiscrepancy = soldFull - (returnedEmptyGood + netDebt);

      if (fullDiscrepancy !== 0 || emptyDiscrepancy !== 0) {
        allProductsSettled = false;
      }

      totalLoadedFull += loadedFull;
      totalSoldFull += soldFull;
      totalReturnedFull += returnedFull;
      totalReturnedEmptyGood += returnedEmptyGood;
      totalReturnedDefective += returnedDefective;
      totalNetCustomerDebtCreated += netDebt;
      totalFullDiscrepancy += fullDiscrepancy;
      totalEmptyDiscrepancy += emptyDiscrepancy;

      return {
        productId: item.product_id,
        productName: item.product_name,
        category: item.category,
        containerType: item.container_type,
        loadedFull,
        soldFull,
        returnedFull,
        returnedEmptyGood,
        returnedDefective,
        netCustomerDebtCreated: netDebt,
        fullDiscrepancy,
        emptyDiscrepancy,
        isSettled: fullDiscrepancy === 0 && emptyDiscrepancy === 0,
      };
    });

    // 4. Determine status
    let status = 'AWAITING_SYNC';
    if (syncCompleted) {
      status = allProductsSettled ? 'SETTLED' : 'FLAGGED_VARIANCE';
    }

    const verifiedBy = verifiedByUserId ? verifiedByUserId.trim() : actorUser?.id || null;
    const reconciledAt = status !== 'AWAITING_SYNC' ? new Date() : null;

    const reconciledRecord = await inventoryRepository.upsertReconciliation({
      tripId: trip.id,
      verifiedBy,
      totalLoadedFull,
      totalSoldFull,
      totalReturnedFull,
      totalReturnedEmptyGood,
      totalReturnedDefective,
      netCustomerDebtCreated: totalNetCustomerDebtCreated,
      fullDiscrepancy: totalFullDiscrepancy,
      emptyDiscrepancy: totalEmptyDiscrepancy,
      reconciliationData,
      status,
      supervisorNotes: supervisorNotes ? supervisorNotes.trim() : null,
      reconciledAt,
    });

    // 5. Centralized Event History Logging
    const eventType =
      status === 'SETTLED'
        ? EVENTS.INVENTORY_RECONCILIATION_SETTLED
        : status === 'FLAGGED_VARIANCE'
          ? EVENTS.INVENTORY_RECONCILIATION_FLAGGED
          : null;

    if (eventType) {
      await historyService.log(eventType, {
        actorUser,
        targetId: trip.id,
        payload: {
          tripNumber: trip.trip_number,
          fullDiscrepancy: totalFullDiscrepancy,
          emptyDiscrepancy: totalEmptyDiscrepancy,
        },
        metadata: {
          status,
          itemCount: reconciliationData.length,
          totalLoadedFull,
          totalSoldFull,
          totalReturnedFull,
          totalReturnedEmptyGood,
          totalReturnedDefective,
          netCustomerDebtCreated: totalNetCustomerDebtCreated,
        },
      });
    }

    return {
      tripId: trip.id,
      tripNumber: trip.trip_number,
      truckPlateNumber: trip.truck_plate_number,
      status: reconciledRecord.status,
      isSettled: reconciledRecord.status === 'SETTLED',
      totalLoadedFull,
      totalSoldFull,
      totalReturnedFull,
      totalReturnedEmptyGood,
      totalReturnedDefective,
      netCustomerDebtCreated: totalNetCustomerDebtCreated,
      fullDiscrepancy: totalFullDiscrepancy,
      emptyDiscrepancy: totalEmptyDiscrepancy,
      reconciliationData,
      supervisorNotes: reconciledRecord.supervisor_notes,
      reconciledAt: reconciledRecord.reconciled_at,
    };
  }

  /**
   * Retrieves reconciliation breakdown and mathematical variance for a trip.
   * @param {string} tripId
   * @param {Object} actorUser
   */
  async getTripReconciliation(tripId, actorUser) {
    if (!tripId || typeof tripId !== 'string') {
      const err = new Error('tripId is required');
      err.statusCode = 400;
      throw err;
    }

    const trip = await inventoryRepository.getTripById(tripId.trim());
    if (!trip) {
      const err = new Error('Trip not found');
      err.statusCode = 404;
      throw err;
    }

    const rec = await inventoryRepository.getReconciliationByTripId(trip.id);
    if (!rec) {
      const err = new Error('Reconciliation record not found for this trip');
      err.statusCode = 404;
      throw err;
    }

    return {
      ...rec,
      tripNumber: trip.trip_number,
      truckPlateNumber: trip.truck_plate_number,
      isSettled: rec.status === 'SETTLED',
    };
  }
}

module.exports = new InventoryService();
