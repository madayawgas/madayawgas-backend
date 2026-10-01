const { query, pool } = require('../../../database/connection');

/**
 * Inventory Repository
 * PostgreSQL data access for plant bulk inventory, stock adjustments,
 * vehicle route stock transfers, and multi-product reconciliation.
 */
class InventoryRepository {
  /**
   * Retrieves all plant inventory balances joined with product details.
   */
  async getPlantInventory() {
    const sql = `
      SELECT 
        pi.id,
        pi.product_id,
        pi.quantity_filled,
        pi.quantity_empty_good,
        pi.quantity_defective,
        (pi.quantity_filled + pi.quantity_empty_good + pi.quantity_defective) AS total_physical_units,
        pi.last_counted_at,
        pi.created_at,
        pi.updated_at,
        p.name AS product_name,
        p.category,
        p.container_type,
        p.net_weight_kg,
        p.is_active
      FROM plant_inventory pi
      JOIN products p ON pi.product_id = p.id
      ORDER BY p.name ASC
    `;
    const res = await query(sql);
    return res.rows;
  }

  /**
   * Retrieves plant inventory balance for a single product.
   * Supports row locking with FOR UPDATE within transactions.
   */
  async getPlantStockByProductId(productId, client = null, forUpdate = false) {
    const runner = client || { query };
    const sql = `
      SELECT 
        pi.*,
        p.name AS product_name,
        p.category,
        p.container_type,
        p.net_weight_kg,
        p.is_active
      FROM plant_inventory pi
      JOIN products p ON pi.product_id = p.id
      WHERE pi.product_id = $1
      ${forUpdate ? 'FOR UPDATE' : ''}
    `;
    const res = await runner.query(sql, [productId]);
    return res.rows[0] || null;
  }

  /**
   * Adjusts discrete unit balances on plant inventory.
   */
  async adjustPlantStock(
    { productId, deltaFilled = 0, deltaEmptyGood = 0, deltaDefective = 0 },
    client = null
  ) {
    const runner = client || { query };
    const sql = `
      UPDATE plant_inventory
      SET 
        quantity_filled = quantity_filled + $2,
        quantity_empty_good = quantity_empty_good + $3,
        quantity_defective = quantity_defective + $4,
        last_counted_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
      WHERE product_id = $1
      RETURNING *
    `;
    const res = await runner.query(sql, [
      productId,
      deltaFilled,
      deltaEmptyGood,
      deltaDefective,
    ]);
    return res.rows[0];
  }

  /**
   * Records a plant stock adjustment audit entry.
   */
  async recordStockAdjustment(
    {
      productId,
      recordedBy = null,
      adjustmentType,
      targetCondition,
      deltaQuantity,
      sourceCondition = null,
      supplierInvoiceNumber = null,
      reason,
    },
    client = null
  ) {
    const runner = client || { query };
    const sql = `
      INSERT INTO plant_stock_adjustments (
        product_id,
        recorded_by,
        adjustment_type,
        target_condition,
        delta_quantity,
        source_condition,
        supplier_invoice_number,
        reason
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `;
    const res = await runner.query(sql, [
      productId,
      recordedBy,
      adjustmentType,
      targetCondition,
      deltaQuantity,
      sourceCondition,
      supplierInvoiceNumber,
      reason,
    ]);
    return res.rows[0];
  }

  /**
   * Retrieves plant stock adjustments audit history.
   */
  async getPlantAdjustments(filters = {}, pagination = null) {
    const conditions = [];
    const values = [];

    if (filters.productId) {
      values.push(filters.productId);
      conditions.push(`psa.product_id = $${values.length}`);
    }

    if (filters.adjustmentType) {
      values.push(filters.adjustmentType);
      conditions.push(`psa.adjustment_type = $${values.length}`);
    }

    if (filters.targetCondition) {
      values.push(filters.targetCondition);
      conditions.push(`psa.target_condition = $${values.length}`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    let total = null;
    if (pagination && pagination.isPaginated) {
      const countSql = `SELECT COUNT(*)::int AS count FROM plant_stock_adjustments psa ${whereClause}`;
      const countRes = await query(countSql, values);
      total = countRes.rows[0].count;
    }

    let limitOffsetClause = '';
    if (pagination && pagination.isPaginated) {
      limitOffsetClause = `LIMIT ${pagination.limit} OFFSET ${pagination.offset}`;
    }

    const sql = `
      SELECT 
        psa.*,
        p.name AS product_name,
        p.category AS product_category,
        u.username AS recorded_by_username,
        u.first_name AS recorded_by_first_name,
        u.last_name AS recorded_by_last_name
      FROM plant_stock_adjustments psa
      JOIN products p ON psa.product_id = p.id
      LEFT JOIN users u ON psa.recorded_by = u.id
      ${whereClause}
      ORDER BY psa.recorded_at DESC
      ${limitOffsetClause}
    `;

    const res = await query(sql, values);

    if (pagination && pagination.isPaginated) {
      return { rows: res.rows, total };
    }
    return res.rows;
  }

  /**
   * Looks up trip by UUID.
   */
  async getTripById(tripId) {
    const sql = `
      SELECT 
        t.id,
        t.trip_number,
        t.status,
        t.truck_id,
        t.sales_user_id,
        t.driver_id,
        t.departure_time,
        t.return_time,
        v.plate_number AS truck_plate_number,
        u.username AS sales_username
      FROM trips t
      JOIN vehicles v ON t.truck_id = v.id
      JOIN users u ON t.sales_user_id = u.id
      WHERE t.id = $1
    `;
    const res = await query(sql, [tripId]);
    return res.rows[0] || null;
  }

  /**
   * Creates a trip load/unload transfer slip and items atomically.
   */
  async createTripTransferWithItems(
    { tripId, transferType, slipNumber, recordedBy = null, remarks = null, items = [] },
    client = null
  ) {
    const shouldManageTx = !client;
    const txClient = client || (await pool.connect());

    try {
      if (shouldManageTx) {
        await txClient.query('BEGIN');
      }

      // 1. Insert Load Slip into trip_loads
      const loadSql = `
        INSERT INTO trip_loads (
          trip_id,
          transfer_type,
          slip_number,
          recorded_by,
          remarks
        )
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *
      `;
      const loadRes = await txClient.query(loadSql, [
        tripId,
        transferType,
        slipNumber,
        recordedBy,
        remarks,
      ]);
      const createdLoad = loadRes.rows[0];

      // 2. Insert Line Items into trip_load_items
      const createdItems = [];
      for (const item of items) {
        const itemSql = `
          INSERT INTO trip_load_items (
            load_id,
            product_id,
            condition,
            quantity_units
          )
          VALUES ($1, $2, $3, $4)
          RETURNING *
        `;
        const itemRes = await txClient.query(itemSql, [
          createdLoad.id,
          item.productId,
          item.condition,
          item.quantityUnits,
        ]);
        createdItems.push(itemRes.rows[0]);
      }

      if (shouldManageTx) {
        await txClient.query('COMMIT');
      }

      return {
        ...createdLoad,
        items: createdItems,
      };
    } catch (err) {
      if (shouldManageTx) {
        await txClient.query('ROLLBACK');
      }
      throw err;
    } finally {
      if (shouldManageTx) {
        txClient.release();
      }
    }
  }

  /**
   * Retrieves all transfer slips and items for a trip.
   */
  async getTransfersByTripId(tripId) {
    const sql = `
      SELECT 
        tl.id,
        tl.trip_id,
        tl.transfer_type,
        tl.slip_number,
        tl.recorded_by,
        tl.recorded_at,
        tl.remarks,
        u.username AS recorded_by_username
      FROM trip_loads tl
      LEFT JOIN users u ON tl.recorded_by = u.id
      WHERE tl.trip_id = $1
      ORDER BY tl.recorded_at ASC, tl.id ASC
    `;
    const loadsRes = await query(sql, [tripId]);
    const loads = loadsRes.rows;

    if (loads.length === 0) return [];

    const loadIds = loads.map((l) => l.id);
    const itemsSql = `
      SELECT 
        tli.id,
        tli.load_id,
        tli.product_id,
        tli.condition,
        tli.quantity_units,
        p.name AS product_name,
        p.category AS product_category,
        p.container_type,
        p.net_weight_kg
      FROM trip_load_items tli
      JOIN products p ON tli.product_id = p.id
      WHERE tli.load_id = ANY($1::uuid[])
      ORDER BY p.name ASC, tli.condition ASC
    `;
    const itemsRes = await query(itemsSql, [loadIds]);

    const itemsByLoad = {};
    for (const item of itemsRes.rows) {
      if (!itemsByLoad[item.load_id]) {
        itemsByLoad[item.load_id] = [];
      }
      itemsByLoad[item.load_id].push(item);
    }

    return loads.map((load) => ({
      ...load,
      items: itemsByLoad[load.id] || [],
    }));
  }

  /**
   * Computes vehicle active on-board stock per product for a trip.
   */
  async getVehicleActiveStockPerProduct(tripId) {
    const sql = `
      SELECT 
        p.id AS product_id,
        p.name AS product_name,
        p.category,
        p.container_type,
        p.net_weight_kg,
        COALESCE(SUM(CASE WHEN tl.transfer_type = 'DISPATCH_LOAD' AND tli.condition = 'FILLED' THEN tli.quantity_units ELSE 0 END), 0)::int AS loaded_full,
        COALESCE(SUM(CASE WHEN tl.transfer_type = 'RETURN_UNLOAD' AND tli.condition = 'FILLED' THEN tli.quantity_units ELSE 0 END), 0)::int AS returned_full,
        COALESCE(SUM(CASE WHEN tl.transfer_type = 'RETURN_UNLOAD' AND tli.condition = 'EMPTY_GOOD' THEN tli.quantity_units ELSE 0 END), 0)::int AS returned_empty_good,
        COALESCE(SUM(CASE WHEN tl.transfer_type = 'RETURN_UNLOAD' AND tli.condition = 'DEFECTIVE' THEN tli.quantity_units ELSE 0 END), 0)::int AS returned_defective
      FROM trip_loads tl
      JOIN trip_load_items tli ON tl.id = tli.load_id
      JOIN products p ON tli.product_id = p.id
      WHERE tl.trip_id = $1
      GROUP BY p.id, p.name, p.category, p.container_type, p.net_weight_kg
      ORDER BY p.name ASC
    `;
    const res = await query(sql, [tripId]);
    return res.rows;
  }

  /**
   * Retrieves operational count of trucks/trips for split calculations.
   */
  async getActiveCounts() {
    const truckSql = `SELECT COUNT(*)::int AS count FROM vehicles WHERE status = 'ACTIVE'`;
    const tripSql = `SELECT COUNT(*)::int AS count FROM trips WHERE status = 'IN_PROGRESS'`;

    const [truckRes, tripRes] = await Promise.all([
      query(truckSql),
      query(tripSql),
    ]);

    return {
      activeTruckCount: truckRes.rows[0].count,
      activeTripCount: tripRes.rows[0].count,
    };
  }

  /**
   * Upserts reconciliation record with structured per-product JSONB breakdown.
   */
  async upsertReconciliation(
    {
      tripId,
      verifiedBy = null,
      totalLoadedFull = 0,
      totalSoldFull = 0,
      totalReturnedFull = 0,
      totalReturnedEmptyGood = 0,
      totalReturnedDefective = 0,
      netCustomerDebtCreated = 0,
      fullDiscrepancy = 0,
      emptyDiscrepancy = 0,
      reconciliationData = [],
      status = 'AWAITING_SYNC',
      supervisorNotes = null,
      reconciledAt = null,
    },
    client = null
  ) {
    const runner = client || { query };
    const sql = `
      INSERT INTO trip_stock_reconciliations (
        trip_id,
        verified_by,
        total_loaded_full,
        total_sold_full,
        total_returned_full,
        total_returned_empty_good,
        total_returned_defective,
        net_customer_debt_created,
        full_discrepancy,
        empty_discrepancy,
        reconciliation_data,
        status,
        supervisor_notes,
        reconciled_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      ON CONFLICT (trip_id) DO UPDATE SET
        verified_by = COALESCE(EXCLUDED.verified_by, trip_stock_reconciliations.verified_by),
        total_loaded_full = EXCLUDED.total_loaded_full,
        total_sold_full = EXCLUDED.total_sold_full,
        total_returned_full = EXCLUDED.total_returned_full,
        total_returned_empty_good = EXCLUDED.total_returned_empty_good,
        total_returned_defective = EXCLUDED.total_returned_defective,
        net_customer_debt_created = EXCLUDED.net_customer_debt_created,
        full_discrepancy = EXCLUDED.full_discrepancy,
        empty_discrepancy = EXCLUDED.empty_discrepancy,
        reconciliation_data = EXCLUDED.reconciliation_data,
        status = EXCLUDED.status,
        supervisor_notes = COALESCE(EXCLUDED.supervisor_notes, trip_stock_reconciliations.supervisor_notes),
        reconciled_at = COALESCE(EXCLUDED.reconciled_at, trip_stock_reconciliations.reconciled_at),
        updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `;

    const res = await runner.query(sql, [
      tripId,
      verifiedBy,
      totalLoadedFull,
      totalSoldFull,
      totalReturnedFull,
      totalReturnedEmptyGood,
      totalReturnedDefective,
      netCustomerDebtCreated,
      fullDiscrepancy,
      emptyDiscrepancy,
      JSON.stringify(reconciliationData),
      status,
      supervisorNotes,
      reconciledAt,
    ]);

    return res.rows[0];
  }

  /**
   * Retrieves reconciliation record by trip UUID.
   */
  async getReconciliationByTripId(tripId) {
    const sql = `
      SELECT 
        tsr.*,
        u.username AS verified_by_username,
        u.first_name AS verified_by_first_name,
        u.last_name AS verified_by_last_name
      FROM trip_stock_reconciliations tsr
      LEFT JOIN users u ON tsr.verified_by = u.id
      WHERE tsr.trip_id = $1
    `;
    const res = await query(sql, [tripId]);
    return res.rows[0] || null;
  }
}

module.exports = new InventoryRepository();
