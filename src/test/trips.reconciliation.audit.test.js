const { test } = require('node:test');
const assert = require('node:assert/strict');

const tripsService = require('../features/trips/trips.service');
const tripsRepository = require('../features/trips/trips.repository');
const loadsRepository = require('../features/trips/loads/loads.repository');
const reconciliationRepository = require('../features/trips/reconciliation/reconciliation.repository');
const productsRepository = require('../features/inventory/products/products.repository');
const inventoryRepository = require('../features/inventory/inventory.repository');
const { historyService } = require('../features/history');
const { pool } = require('../../database/connection');

test('Trip Reconciliation Audit & Discrepancy Visibility Unit Tests', async (t) => {
  await t.test('1. attachDetailsToTrips & _formatReconciliation expose fullDiscrepancy and emptyDiscrepancy', async () => {
    const origGetLoads = loadsRepository.getLoadsByTripIds;
    const origGetRecons = reconciliationRepository.getByTripIds;

    loadsRepository.getLoadsByTripIds = async () => ({
      'trip-1': [{ id: 'load-1', transferType: 'DISPATCH_LOAD', items: [] }],
    });
    reconciliationRepository.getByTripIds = async () => ({
      'trip-1': {
        id: 'recon-1',
        trip_id: 'trip-1',
        status: 'FLAGGED_VARIANCE',
        total_loaded_full: 25,
        total_sold_full: 15,
        total_returned_full: 0,
        total_returned_empty_good: 15,
        total_returned_defective: 5,
        net_customer_debt_created: 0,
        supervisor_notes: '5 units missing',
      },
    });

    try {
      const result = await tripsService.attachDetailsToTrips([{ id: 'trip-1', status: 'COMPLETED' }]);
      assert.equal(result.length, 1);
      assert.equal(result[0].reconciliation.status, 'FLAGGED_VARIANCE');
      assert.equal(result[0].reconciliation.fullDiscrepancy, 5);
      assert.equal(result[0].reconciliation.emptyDiscrepancy, 0);
      assert.equal(result[0].reconciliation.isSettled, false);
    } finally {
      loadsRepository.getLoadsByTripIds = origGetLoads;
      reconciliationRepository.getByTripIds = origGetRecons;
    }
  });

  await t.test('2. reconcileTrip rejects FLAGGED_VARIANCE without supervisorNotes before mutating plant stock', async () => {
    const origGetTripById = tripsRepository.getTripById;
    const origCalcSummary = loadsRepository.calculateTripStockSummary;
    const origGetProduct = productsRepository.getProductById;
    const origGetRecon = reconciliationRepository.getByTripId;
    const origPoolConnect = pool.connect;

    let poolConnected = false;

    tripsRepository.getTripById = async () => ({
      id: 'trip-qa-1',
      trip_number: 'TRIP-QA-01',
      truck_plate_number: 'ABC-1234',
      status: 'RETURNED',
      notes: null,
    });
    productsRepository.getProductById = async (id) => ({ id, name: '11kg LPG', is_active: true });
    loadsRepository.calculateTripStockSummary = async () => ({
      total_loaded_full: 25,
      total_returned_full: 0,
      total_returned_empty_good: 0,
      total_returned_defective: 0,
    });
    reconciliationRepository.getByTripId = async () => null;
    pool.connect = async () => {
      poolConnected = true;
      return origPoolConnect.call(pool);
    };

    try {
      await assert.rejects(
        () =>
          tripsService.reconcileTrip(
            'trip-qa-1',
            { id: 'user-1', username: 'supervisor' },
            {
              returnLoads: [
                { productId: 'prod-1', condition: 'EMPTY_GOOD', quantityUnits: 15 },
                { productId: 'prod-1', condition: 'DEFECTIVE', quantityUnits: 5 },
              ],
              totalSoldFull: 15,
              netCustomerDebtCreated: 0,
              supervisorNotes: '   ',
            }
          ),
        (err) => {
          assert.equal(err.statusCode, 400);
          assert.match(err.message, /Supervisor notes are required/i);
          return true;
        }
      );
      assert.equal(poolConnected, false, 'Must not open DB transaction or record RETURN_UNLOAD when validation fails');
    } finally {
      tripsRepository.getTripById = origGetTripById;
      loadsRepository.calculateTripStockSummary = origCalcSummary;
      productsRepository.getProductById = origGetProduct;
      reconciliationRepository.getByTripId = origGetRecon;
      pool.connect = origPoolConnect;
    }
  });

  await t.test('3. reconcileTrip settles QA scenario (25 loaded, 15 sold, 15 empty, 5 defect) as FLAGGED_VARIANCE with notes, and re-reconcile preserves notes without duplicating unloads', async () => {
    const origGetTripById = tripsRepository.getTripById;
    const origCalcSummary = loadsRepository.calculateTripStockSummary;
    const origGetRecon = reconciliationRepository.getByTripId;
    const origUpsertRecon = reconciliationRepository.upsertReconciliation;
    const origUpdateTrip = tripsRepository.updateTrip;
    const origHistoryLog = historyService.log;
    const origPoolConnect = pool.connect;

    let unloadCreatedCount = 0;
    let savedReconArgs = null;

    tripsRepository.getTripById = async () => ({
      id: 'trip-qa-2',
      trip_number: 'TRIP-QA-02',
      truck_plate_number: 'XYZ-999',
      status: 'COMPLETED',
      notes: null,
    });
    loadsRepository.calculateTripStockSummary = async () => ({
      total_loaded_full: 25,
      total_returned_full: 0,
      total_returned_empty_good: 15,
      total_returned_defective: 5,
    });
    reconciliationRepository.getByTripId = async () => ({
      id: 'recon-2',
      trip_id: 'trip-qa-2',
      supervisor_notes: '5 full units unreturned; driver following up',
    });
    reconciliationRepository.upsertReconciliation = async (args) => {
      savedReconArgs = args;
      return {
        ...args,
        status: args.status,
        supervisor_notes: args.supervisorNotes || '5 full units unreturned; driver following up',
        reconciled_at: args.reconciledAt,
      };
    };
    tripsRepository.updateTrip = async (id, data) => ({ id, status: data.status });
    historyService.log = async () => {};
    pool.connect = async () => {
      unloadCreatedCount++;
      return origPoolConnect.call(pool);
    };

    try {
      const res = await tripsService.reconcileTrip(
        'trip-qa-2',
        { id: 'user-1', username: 'supervisor' },
        {
          totalSoldFull: 15,
          netCustomerDebtCreated: 0,
          // supervisorNotes omitted (e.g. automated re-reconciliation after late sales sync)
        }
      );

      assert.equal(unloadCreatedCount, 0, 'Re-reconciliation without returnLoads must not create duplicate RETURN_UNLOAD');
      assert.equal(res.status, 'FLAGGED_VARIANCE');
      assert.equal(res.fullDiscrepancy, 5);
      assert.equal(res.emptyDiscrepancy, 0);
      assert.equal(savedReconArgs.status, 'FLAGGED_VARIANCE');
      assert.equal(res.supervisorNotes, '5 full units unreturned; driver following up');
    } finally {
      tripsRepository.getTripById = origGetTripById;
      loadsRepository.calculateTripStockSummary = origCalcSummary;
      reconciliationRepository.getByTripId = origGetRecon;
      reconciliationRepository.upsertReconciliation = origUpsertRecon;
      tripsRepository.updateTrip = origUpdateTrip;
      historyService.log = origHistoryLog;
      pool.connect = origPoolConnect;
    }
  });

  await t.test('4. reconcileTrip with updated returnLoads on COMPLETED trip reverses prior RETURN_UNLOAD deltas and replaces slip without double-counting', async () => {
    const origGetTripById = tripsRepository.getTripById;
    const origCalcSummary = loadsRepository.calculateTripStockSummary;
    const origGetReturnItems = loadsRepository.getReturnUnloadItemsByTripId;
    const origDeleteReturns = loadsRepository.deleteReturnUnloadsByTripId;
    const origCreateLoad = loadsRepository.createLoadWithItems;
    const origGetProduct = productsRepository.getProductById;
    const origAdjustStock = inventoryRepository.adjustPlantStock;
    const origGetRecon = reconciliationRepository.getByTripId;
    const origUpsertRecon = reconciliationRepository.upsertReconciliation;
    const origUpdateTrip = tripsRepository.updateTrip;
    const origHistoryLog = historyService.log;
    const origPoolConnect = pool.connect;

    const stockAdjustments = [];
    let deletedTripId = null;
    let createdLoadItems = null;

    tripsRepository.getTripById = async () => ({
      id: 'trip-qa-3',
      trip_number: 'TRIP-QA-03',
      truck_plate_number: 'ABC-777',
      status: 'COMPLETED',
      notes: null,
    });
    productsRepository.getProductById = async (id) => ({ id, name: '11kg LPG', is_active: true });
    loadsRepository.calculateTripStockSummary = async () => ({
      total_loaded_full: 25,
      total_returned_full: 0,
      total_returned_empty_good: 20,
      total_returned_defective: 5,
    });
    loadsRepository.getReturnUnloadItemsByTripId = async () => [
      { product_id: 'prod-1', condition: 'EMPTY_GOOD', quantity_units: 15 },
      { product_id: 'prod-1', condition: 'DEFECTIVE', quantity_units: 5 },
    ];
    loadsRepository.deleteReturnUnloadsByTripId = async (tripId) => {
      deletedTripId = tripId;
    };
    loadsRepository.createLoadWithItems = async (data) => {
      createdLoadItems = data.items;
      return { id: 'new-load', ...data };
    };
    inventoryRepository.adjustPlantStock = async (adj) => {
      stockAdjustments.push(adj);
    };
    reconciliationRepository.getByTripId = async () => ({
      id: 'recon-3',
      trip_id: 'trip-qa-3',
      supervisor_notes: 'Initial count',
    });
    reconciliationRepository.upsertReconciliation = async (args) => ({
      ...args,
      status: args.status,
      supervisor_notes: args.supervisorNotes,
      reconciled_at: args.reconciledAt,
    });
    tripsRepository.updateTrip = async (id, data) => ({ id, status: data.status });
    historyService.log = async () => {};
    pool.connect = async () => ({
      query: async () => ({ rows: [] }),
      release: () => {},
    });

    try {
      const res = await tripsService.reconcileTrip(
        'trip-qa-3',
        { id: 'user-1', username: 'supervisor' },
        {
          returnLoads: [
            { productId: 'prod-1', condition: 'EMPTY_GOOD', quantityUnits: 20 },
            { productId: 'prod-1', condition: 'DEFECTIVE', quantityUnits: 5 },
          ],
          totalSoldFull: 20,
          netCustomerDebtCreated: 0,
          supervisorNotes: 'Recounted 20 empties',
        }
      );

      assert.equal(deletedTripId, 'trip-qa-3');
      assert.deepEqual(stockAdjustments, [
        { productId: 'prod-1', deltaFilled: 0, deltaEmptyGood: -15, deltaDefective: 0 },
        { productId: 'prod-1', deltaFilled: 0, deltaEmptyGood: 0, deltaDefective: -5 },
        { productId: 'prod-1', deltaFilled: 0, deltaEmptyGood: 20, deltaDefective: 0 },
        { productId: 'prod-1', deltaFilled: 0, deltaEmptyGood: 0, deltaDefective: 5 },
      ]);
      assert.equal(createdLoadItems.length, 2);
      assert.equal(res.status, 'SETTLED');
      assert.equal(res.fullDiscrepancy, 0);
      assert.equal(res.emptyDiscrepancy, 0);
    } finally {
      tripsRepository.getTripById = origGetTripById;
      loadsRepository.calculateTripStockSummary = origCalcSummary;
      loadsRepository.getReturnUnloadItemsByTripId = origGetReturnItems;
      loadsRepository.deleteReturnUnloadsByTripId = origDeleteReturns;
      loadsRepository.createLoadWithItems = origCreateLoad;
      productsRepository.getProductById = origGetProduct;
      inventoryRepository.adjustPlantStock = origAdjustStock;
      reconciliationRepository.getByTripId = origGetRecon;
      reconciliationRepository.upsertReconciliation = origUpsertRecon;
      tripsRepository.updateTrip = origUpdateTrip;
      historyService.log = origHistoryLog;
      pool.connect = origPoolConnect;
    }
  });
});
