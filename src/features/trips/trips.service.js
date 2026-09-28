const crypto = require('crypto');
const { pool } = require('../../../database/connection');
const tripsRepository = require('./trips.repository');
const loadsRepository = require('./loads/loads.repository');
const reconciliationRepository = require('./reconciliation/reconciliation.repository');
const schedulesRepository = require('../schedules/schedules.repository');
const templatesService = require('../schedules/templates/templates.service');
const zonesRepository = require('../schedules/zones/zones.repository');
const vehiclesRepository = require('../fleet/vehicles/vehicles.repository');
const productsRepository = require('../inventory/products/products.repository');
const { maintenanceService } = require('../fleet/maintenance');
const { historyService, EVENTS } = require('../history');
const { buildPaginationMeta } = require('../../utils/pagination');

/**
 * Trips Service
 * Orchestrates real-time dispatch, multi-load inventory transfers, plant check-in,
 * single-point return odometer telemetry, and post-trip stock reconciliation.
 */
class TripsService {
  /**
   * Helper to validate line items against the products catalog.
   * @param {Array} items
   */
  async validateLineItems(items) {
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

      const condition = (item.condition || 'FILLED').toUpperCase().trim();
      if (!validConditions.includes(condition)) {
        const err = new Error(
          `Item at index ${i}: condition must be one of ${validConditions.join(', ')}`
        );
        err.statusCode = 400;
        throw err;
      }

      const qty = parseInt(item.quantityUnits, 10);
      if (isNaN(qty) || qty <= 0) {
        const err = new Error(`Item at index ${i}: quantityUnits must be a positive integer`);
        err.statusCode = 400;
        throw err;
      }

      validatedItems.push({
        productId: product.id,
        condition,
        quantityUnits: qty,
      });
    }

    return validatedItems;
  }

  /**
   * Retrieves trips with optional filtering and pagination.
   * Scopes to actorUser's assignments if user holds only 'route.view_own'.
   * @param {Object} actorUser
   * @param {Object} filters
   * @param {Object|null} pagination
   */
  async getAllTrips(actorUser, filters = {}, pagination = null) {
    const permissions = actorUser?.permissions || [];
    const hasGlobalView = permissions.includes('route.view') || permissions.includes('route.manage');
    const hasOwnView = permissions.includes('route.view_own');

    const effectiveFilters = { ...filters };

    if (!hasGlobalView && hasOwnView) {
      effectiveFilters.salesUserId = actorUser.id;
    }

    if (!pagination || !pagination.isPaginated) {
      return tripsRepository.getAllTrips(effectiveFilters, null);
    }

    const { rows, total } = await tripsRepository.getAllTrips(effectiveFilters, pagination);
    const meta = buildPaginationMeta(total, pagination.page, pagination.limit);

    return { items: rows, meta };
  }

  /**
   * Retrieves single trip by UUID, including loads and stock reconciliation records.
   * @param {string} id - Trip UUID
   * @param {Object} actorUser
   */
  async getTripById(id, actorUser) {
    if (!id || typeof id !== 'string') {
      const err = new Error('Trip ID is required');
      err.statusCode = 400;
      throw err;
    }

    const trip = await tripsRepository.getTripById(id);
    if (!trip) {
      const err = new Error('Trip not found');
      err.statusCode = 404;
      throw err;
    }

    const permissions = actorUser?.permissions || [];
    const hasGlobalView = permissions.includes('route.view') || permissions.includes('route.manage');
    const hasOwnView = permissions.includes('route.view_own');

    if (!hasGlobalView && hasOwnView && trip.sales_user_id !== actorUser.id) {
      const err = new Error('Access denied: You can only view trips assigned to you');
      err.statusCode = 403;
      throw err;
    }

    const loads = await loadsRepository.getLoadsByTripId(trip.id);
    const reconciliation = await reconciliationRepository.getByTripId(trip.id);

    return {
      ...trip,
      loads,
      reconciliation,
    };
  }

  /**
   * Dispatches a trip from a date schedule or as an ad-hoc emergency run.
   * Validates truck availability, snapshots crew attribution, and transitions schedule status.
   *
   * @param {Object} actorUser - Acting logistics supervisor/admin
   * @param {Object} payload - { scheduleId, truckId, salesUserId, driverId, zoneId, notes, initialLoads }
   */
  async dispatchTrip(actorUser, payload = {}) {
    let { scheduleId, truckId, salesUserId, driverId, zoneId, notes, initialLoads } = payload;
    let schedule = null;

    // 1. Resolve from schedule if scheduleId is provided
    if (scheduleId) {
      schedule = await schedulesRepository.getScheduleById(scheduleId.trim());
      if (!schedule) {
        const err = new Error('Specified schedule not found');
        err.statusCode = 404;
        throw err;
      }

      if (schedule.status === 'DISPATCHED') {
        const err = new Error('Schedule has already been dispatched');
        err.statusCode = 400;
        throw err;
      }

      if (schedule.status === 'CANCELLED') {
        const err = new Error('Cannot dispatch a cancelled schedule');
        err.statusCode = 400;
        throw err;
      }

      truckId = schedule.truck_id;
      salesUserId = salesUserId || schedule.sales_user_id;
      zoneId = zoneId || schedule.zone_id;
    }

    // 2. Ad-Hoc Run Validation
    if (!truckId) {
      const err = new Error('Vehicle ID is required for trip dispatch');
      err.statusCode = 400;
      throw err;
    }

    if (!salesUserId) {
      const err = new Error('Sales Person user ID is required for trip dispatch');
      err.statusCode = 400;
      throw err;
    }

    if (!zoneId) {
      const err = new Error('Service zone ID is required for trip dispatch');
      err.statusCode = 400;
      throw err;
    }

    // 3. Vehicle Availability & Condition
    const vehicle = await vehiclesRepository.getVehicleById(truckId.trim());
    if (!vehicle) {
      const err = new Error('Vehicle not found');
      err.statusCode = 404;
      throw err;
    }

    if (vehicle.status !== 'ACTIVE') {
      const err = new Error(
        `Cannot dispatch vehicle '${vehicle.plate_number}' because it is currently ${vehicle.status}`
      );
      err.statusCode = 400;
      throw err;
    }

    const activeTrip = await tripsRepository.findActiveTripByTruckId(vehicle.id);
    if (activeTrip) {
      const err = new Error(
        `Vehicle '${vehicle.plate_number}' already has an ongoing trip (#${activeTrip.trip_number}) currently in progress`
      );
      err.statusCode = 409;
      throw err;
    }

    // 4. Crew Modeling: Driver Snapshot
    let resolvedDriverId = driverId ? driverId.trim() : vehicle.driver_id;
    if (!resolvedDriverId) {
      const err = new Error(
        `Vehicle '${vehicle.plate_number}' has no assigned driver. A driver must be assigned or specified in the dispatch request.`
      );
      err.statusCode = 400;
      throw err;
    }

    const driverUser = await vehiclesRepository.findDriverUserById(resolvedDriverId);
    if (!driverUser) {
      const err = new Error('Driver user not found');
      err.statusCode = 404;
      throw err;
    }

    if (!driverUser.is_active || driverUser.is_blocked) {
      const err = new Error('Driver user account is inactive or blocked');
      err.statusCode = 400;
      throw err;
    }

    if (!driverUser.is_driver) {
      const err = new Error(`User '${driverUser.username}' does not hold the Driver role`);
      err.statusCode = 400;
      throw err;
    }

    // 5. Sales Person Verification
    const salesUser = await templatesService.verifySalesUser(salesUserId.trim());

    // 6. Zone Verification
    const zone = await zonesRepository.getZoneById(zoneId.trim());
    if (!zone) {
      const err = new Error('Service zone not found');
      err.statusCode = 404;
      throw err;
    }

    if (!zone.is_active) {
      const err = new Error(`Service zone '${zone.name}' is inactive`);
      err.statusCode = 400;
      throw err;
    }

    // 7. Validate initial loads if provided
    let validatedLoads = null;
    if (initialLoads) {
      validatedLoads = await this.validateLineItems(initialLoads);
    }

    // 8. Generate Unique Trip Number
    const now = new Date();
    const dateComponent = now.toISOString().slice(0, 10).replace(/-/g, '');
    const randComponent = crypto.randomBytes(3).toString('hex').toUpperCase();
    const tripNumber = `TRIP-${dateComponent}-${randComponent}`;

    // 9. Execute Atomic Transaction
    const client = await pool.connect();
    let createdTrip;
    let initialLoadSlip = null;

    try {
      await client.query('BEGIN');

      // Insert trip
      createdTrip = await tripsRepository.createTrip(
        {
          scheduleId: schedule ? schedule.id : null,
          truckId: vehicle.id,
          driverId: driverUser.id,
          salesUserId: salesUser.id,
          zoneId: zone.id,
          dispatchedBy: actorUser?.id || null,
          tripNumber,
          status: 'IN_PROGRESS',
          departureTime: now,
          notes: notes ? notes.trim() : null,
        },
        client
      );

      // Transition schedule status to DISPATCHED if linked
      if (schedule) {
        await schedulesRepository.updateStatus(schedule.id, 'DISPATCHED', client);
      }

      // Record initial dispatch load manifest if items provided
      if (validatedLoads && validatedLoads.length > 0) {
        const slipNumber = `LOAD-${dateComponent}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
        initialLoadSlip = await loadsRepository.createLoadWithItems(
          {
            tripId: createdTrip.id,
            transferType: 'DISPATCH_LOAD',
            slipNumber,
            recordedBy: actorUser?.id || null,
            remarks: 'Initial morning dispatch load manifest',
            items: validatedLoads,
          },
          client
        );
      }

      await client.query('COMMIT');
    } catch (txErr) {
      await client.query('ROLLBACK');
      throw txErr;
    } finally {
      client.release();
    }

    // 10. Audit History Logging
    await historyService.log(EVENTS.TRIP_DISPATCHED, {
      actorUser,
      targetId: createdTrip.id,
      payload: {
        tripNumber: createdTrip.trip_number,
        plateNumber: vehicle.plate_number,
      },
      metadata: {
        truckModel: vehicle.model,
        driver: `${driverUser.first_name} ${driverUser.last_name}`,
        salesRep: `${salesUser.first_name} ${salesUser.last_name}`,
        zoneName: zone.name,
        isAdHoc: !schedule,
      },
    });

    if (initialLoadSlip) {
      await historyService.log(EVENTS.TRIP_STOCK_LOADED, {
        actorUser,
        targetId: initialLoadSlip.id,
        payload: {
          tripNumber: createdTrip.trip_number,
          slipNumber: initialLoadSlip.slip_number,
          transferType: 'DISPATCH_LOAD',
        },
        metadata: {
          itemCount: validatedLoads.length,
          totalUnits: validatedLoads.reduce((sum, it) => sum + it.quantityUnits, 0),
        },
      });
    }

    return this.getTripById(createdTrip.id, actorUser);
  }

  /**
   * Records a multi-load inventory transfer slip (midday reload or return unload) on an active trip.
   *
   * @param {string} tripId
   * @param {Object} actorUser
   * @param {Object} payload - { transferType, slipNumber, remarks, items }
   */
  async recordTripLoad(tripId, actorUser, payload = {}) {
    const { transferType, slipNumber, remarks, items } = payload;

    const trip = await tripsRepository.getTripById(tripId);
    if (!trip) {
      const err = new Error('Trip not found');
      err.statusCode = 404;
      throw err;
    }

    if (trip.status !== 'IN_PROGRESS') {
      const err = new Error(`Cannot record load for trip in '${trip.status}' status`);
      err.statusCode = 400;
      throw err;
    }

    const typeUpper = (transferType || '').toUpperCase().trim();
    if (!['DISPATCH_LOAD', 'RETURN_UNLOAD'].includes(typeUpper)) {
      const err = new Error("transferType must be either 'DISPATCH_LOAD' or 'RETURN_UNLOAD'");
      err.statusCode = 400;
      throw err;
    }

    const validatedItems = await this.validateLineItems(items);

    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
    const prefix = typeUpper === 'DISPATCH_LOAD' ? 'LOAD' : 'UNLOAD';
    const resolvedSlip =
      slipNumber && typeof slipNumber === 'string' && slipNumber.trim().length > 0
        ? slipNumber.trim().toUpperCase()
        : `${prefix}-${dateStr}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

    const createdLoad = await loadsRepository.createLoadWithItems({
      tripId: trip.id,
      transferType: typeUpper,
      slipNumber: resolvedSlip,
      recordedBy: actorUser?.id || null,
      remarks: remarks ? remarks.trim() : null,
      items: validatedItems,
    });

    await historyService.log(EVENTS.TRIP_STOCK_LOADED, {
      actorUser,
      targetId: createdLoad.id,
      payload: {
        tripNumber: trip.trip_number,
        slipNumber: createdLoad.slip_number,
        transferType: typeUpper,
      },
      metadata: {
        itemCount: validatedItems.length,
        totalUnits: validatedItems.reduce((sum, it) => sum + it.quantityUnits, 0),
      },
    });

    return createdLoad;
  }

  /**
   * Retrieves all load transfer slips for a trip.
   * @param {string} tripId
   * @param {Object} actorUser
   */
  async getTripLoads(tripId, actorUser) {
    await this.getTripById(tripId, actorUser);
    return loadsRepository.getLoadsByTripId(tripId);
  }

  /**
   * Completes a trip at plant check-in:
   * 1. Records return odometer telemetry and invokes 5,000-km PM evaluation.
   * 2. Automatically records RETURN_UNLOAD transfer slip if returnLoads are provided.
   * 3. Initializes trip_stock_reconciliations with status AWAITING_SYNC.
   * 4. Transitions trip status to COMPLETED.
   *
   * @param {string} tripId
   * @param {Object} actorUser
   * @param {Object} payload - { returnOdometerKm, returnLoads, supervisorNotes }
   */
  async completeTrip(tripId, actorUser, payload = {}) {
    const { returnOdometerKm, returnLoads, supervisorNotes } = payload;

    const trip = await tripsRepository.getTripById(tripId);
    if (!trip) {
      const err = new Error('Trip not found');
      err.statusCode = 404;
      throw err;
    }

    if (trip.status !== 'IN_PROGRESS') {
      const err = new Error(`Cannot complete trip in '${trip.status}' status`);
      err.statusCode = 400;
      throw err;
    }

    if (returnOdometerKm === undefined || returnOdometerKm === null || returnOdometerKm === '') {
      const err = new Error('returnOdometerKm is required upon plant check-in');
      err.statusCode = 400;
      throw err;
    }

    const numOdometer = Number(returnOdometerKm);
    if (isNaN(numOdometer) || !Number.isInteger(numOdometer) || numOdometer < 0) {
      const err = new Error('returnOdometerKm must be a non-negative integer');
      err.statusCode = 400;
      throw err;
    }

    // 1. Process single-point return odometer reading through Fleet Maintenance engine
    const odoResult = await maintenanceService.logOdometerReading(actorUser, {
      truckId: trip.truck_id,
      odometerReading: numOdometer,
      source: 'POST_DISPATCH_RETURN',
      notes: supervisorNotes ? `Trip #${trip.trip_number} return: ${supervisorNotes.trim()}` : `Trip #${trip.trip_number} plant return check-in`,
    });

    // 2. If physical return unload items are specified, record a RETURN_UNLOAD transfer slip
    if (returnLoads && Array.isArray(returnLoads) && returnLoads.length > 0) {
      const validatedReturnItems = await this.validateLineItems(returnLoads);
      const now = new Date();
      const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
      const returnSlip = `UNLOAD-${dateStr}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

      await loadsRepository.createLoadWithItems({
        tripId: trip.id,
        transferType: 'RETURN_UNLOAD',
        slipNumber: returnSlip,
        recordedBy: actorUser?.id || null,
        remarks: supervisorNotes ? supervisorNotes.trim() : 'Post-trip physical return unload',
        items: validatedReturnItems,
      });
    }

    // 3. Compute baseline stock counts from loads
    const stockSummary = await loadsRepository.calculateTripStockSummary(trip.id);

    // 4. Initialize reconciliation record in AWAITING_SYNC state
    const reconciliation = await reconciliationRepository.upsertReconciliation({
      tripId: trip.id,
      verifiedBy: actorUser?.id || null,
      totalLoadedFull: stockSummary.total_loaded_full,
      totalSoldFull: 0,
      totalReturnedFull: stockSummary.total_returned_full,
      totalReturnedEmptyGood: stockSummary.total_returned_empty_good,
      totalReturnedDefective: stockSummary.total_returned_defective,
      netCustomerDebtCreated: 0,
      status: 'AWAITING_SYNC',
      supervisorNotes: supervisorNotes ? supervisorNotes.trim() : null,
      reconciledAt: null,
    });

    // 5. Update Trip to COMPLETED
    const updatedTrip = await tripsRepository.updateTrip(trip.id, {
      status: 'COMPLETED',
      returnTime: new Date(),
      returnOdometerLogId: odoResult.logId,
      notes: supervisorNotes ? `${trip.notes ? `${trip.notes} | ` : ''}${supervisorNotes.trim()}` : trip.notes,
    });

    // 6. Centralized Event History Logging
    await historyService.log(EVENTS.TRIP_COMPLETED, {
      actorUser,
      targetId: trip.id,
      payload: {
        tripNumber: trip.trip_number,
        plateNumber: trip.truck_plate_number,
        odometerKm: numOdometer,
      },
      metadata: {
        distanceDrivenKm: odoResult.distanceDrivenThisTrip,
        isPmDue: odoResult.isPmDue,
        remainingKmBeforePm: odoResult.remainingKmBeforePm,
      },
    });

    return {
      trip: updatedTrip,
      odometerTelemetry: odoResult,
      reconciliation,
    };
  }

  /**
   * Reconciles stock against loaded stock, physical return manifests, and synchronized field sales / canister debt.
   *
   * Formulas:
   * Full Discrepancy = Total Loaded Full - Total Sold Full - Total Returned Full
   * Empty Discrepancy = Total Sold Full - (Total Returned Empty Good + Net Customer Canister Debt Created)
   *
   * @param {string} tripId
   * @param {Object} actorUser
   * @param {Object} payload - { totalSoldFull, netCustomerDebtCreated, supervisorNotes }
   */
  async reconcileTrip(tripId, actorUser, payload = {}) {
    const { totalSoldFull, netCustomerDebtCreated, supervisorNotes } = payload;

    const trip = await tripsRepository.getTripById(tripId);
    if (!trip) {
      const err = new Error('Trip not found');
      err.statusCode = 404;
      throw err;
    }

    if (trip.status !== 'COMPLETED') {
      const err = new Error(`Cannot reconcile a trip that has not completed check-in (current status: '${trip.status}')`);
      err.statusCode = 400;
      throw err;
    }

    // Calculate aggregated inventory numbers from actual recorded loads
    const stockSummary = await loadsRepository.calculateTripStockSummary(trip.id);
    const totalLoadedFull = stockSummary.total_loaded_full;
    const totalReturnedFull = stockSummary.total_returned_full;
    const totalReturnedEmptyGood = stockSummary.total_returned_empty_good;
    const totalReturnedDefective = stockSummary.total_returned_defective;

    let status = 'AWAITING_SYNC';
    let soldFull = 0;
    let netDebt = 0;
    let fullDiscrepancy = null;
    let emptyDiscrepancy = null;

    if (totalSoldFull !== undefined && totalSoldFull !== null) {
      soldFull = parseInt(totalSoldFull, 10);
      if (isNaN(soldFull) || soldFull < 0) {
        const err = new Error('totalSoldFull must be a non-negative integer');
        err.statusCode = 400;
        throw err;
      }

      if (netCustomerDebtCreated !== undefined && netCustomerDebtCreated !== null) {
        netDebt = parseInt(netCustomerDebtCreated, 10);
        if (isNaN(netDebt)) {
          const err = new Error('netCustomerDebtCreated must be an integer');
          err.statusCode = 400;
          throw err;
        }
      }

      // Mathematical discrepancy calculations
      fullDiscrepancy = totalLoadedFull - soldFull - totalReturnedFull;
      emptyDiscrepancy = soldFull - (totalReturnedEmptyGood + netDebt);

      if (fullDiscrepancy === 0 && emptyDiscrepancy === 0) {
        status = 'SETTLED';
      } else {
        status = 'FLAGGED_VARIANCE';
      }
    }

    const reconciledRecord = await reconciliationRepository.upsertReconciliation({
      tripId: trip.id,
      verifiedBy: actorUser?.id || null,
      totalLoadedFull,
      totalSoldFull: soldFull,
      totalReturnedFull,
      totalReturnedEmptyGood,
      totalReturnedDefective,
      netCustomerDebtCreated: netDebt,
      status,
      supervisorNotes: supervisorNotes ? supervisorNotes.trim() : null,
      reconciledAt: status !== 'AWAITING_SYNC' ? new Date() : null,
    });

    await historyService.log(EVENTS.TRIP_RECONCILED, {
      actorUser,
      targetId: trip.id,
      payload: {
        tripNumber: trip.trip_number,
        status,
      },
      metadata: {
        totalLoadedFull,
        totalSoldFull: soldFull,
        totalReturnedFull,
        totalReturnedEmptyGood,
        netCustomerDebtCreated: netDebt,
        fullDiscrepancy,
        emptyDiscrepancy,
      },
    });

    return {
      tripId: trip.id,
      tripNumber: trip.trip_number,
      status: reconciledRecord.status,
      totalLoadedFull,
      totalSoldFull: soldFull,
      totalReturnedFull,
      totalReturnedEmptyGood,
      totalReturnedDefective,
      netCustomerDebtCreated: netDebt,
      fullDiscrepancy,
      emptyDiscrepancy,
      isSettled: status === 'SETTLED',
      reconciledAt: reconciledRecord.reconciled_at,
      supervisorNotes: reconciledRecord.supervisor_notes,
    };
  }

  /**
   * Retrieves reconciliation breakdown and mathematical variance for a trip.
   * @param {string} tripId
   * @param {Object} actorUser
   */
  async getTripReconciliation(tripId, actorUser) {
    const trip = await this.getTripById(tripId, actorUser);
    const rec = trip.reconciliation;

    if (!rec) {
      const err = new Error('Reconciliation record not found for this trip');
      err.statusCode = 404;
      throw err;
    }

    const fullDiscrepancy =
      rec.total_loaded_full - rec.total_sold_full - rec.total_returned_full;
    const emptyDiscrepancy =
      rec.total_sold_full - (rec.total_returned_empty_good + rec.net_customer_debt_created);

    return {
      ...rec,
      tripNumber: trip.trip_number,
      fullDiscrepancy,
      emptyDiscrepancy,
      isSettled: rec.status === 'SETTLED',
    };
  }

  /**
   * Cancels a trip in PENDING or IN_PROGRESS state.
   * @param {string} id
   * @param {Object} actorUser
   * @param {Object} data - { cancellationReason }
   */
  async cancelTrip(id, actorUser, data = {}) {
    const trip = await tripsRepository.getTripById(id);
    if (!trip) {
      const err = new Error('Trip not found');
      err.statusCode = 404;
      throw err;
    }

    if (trip.status === 'COMPLETED') {
      const err = new Error('Cannot cancel a trip that has already been completed');
      err.statusCode = 400;
      throw err;
    }

    if (trip.status === 'CANCELLED') {
      return trip;
    }

    const updated = await tripsRepository.updateTrip(trip.id, {
      status: 'CANCELLED',
      notes: data.cancellationReason
        ? `${trip.notes ? `${trip.notes} | ` : ''}Cancelled: ${data.cancellationReason.trim()}`
        : trip.notes,
    });

    // If linked to a schedule, revert schedule status to SCHEDULED
    if (trip.schedule_id) {
      await schedulesRepository.updateStatus(trip.schedule_id, 'SCHEDULED');
    }

    return updated;
  }
}

module.exports = new TripsService();
