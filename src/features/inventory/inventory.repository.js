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
        COALESCE(pi.id, gen_random_uuid()) AS id,
        p.id AS product_id,
        COALESCE(pi.quantity_filled, 0) AS quantity_filled,
        COALESCE(pi.quantity_empty_good, 0) AS quantity_empty_good,
        COALESCE(pi.quantity_defective, 0) AS quantity_defective,
        (COALESCE(pi.quantity_filled, 0) + COALESCE(pi.quantity_empty_good, 0) + COALESCE(pi.quantity_defective, 0)) AS total_physical_units,
        COALESCE(pi.last_counted_at, p.created_at) AS last_counted_at,
        COALESCE(pi.created_at, p.created_at) AS created_at,
        COALESCE(pi.updated_at, p.updated_at) AS updated_at,
        p.name AS product_name,
        p.category,
        p.container_type,
        p.net_weight_kg,
        p.is_active
      FROM products p
      LEFT JOIN plant_inventory pi ON p.id = pi.product_id
      WHERE p.is_active = TRUE
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
    await runner.query(
      `INSERT INTO plant_inventory (product_id, quantity_filled, quantity_empty_good, quantity_defective)
       VALUES ($1, 0, 0, 0)
       ON CONFLICT (product_id) DO NOTHING`,
      [productId]
    );

    const sql = `
      SELECT 
        pi.*,
        (pi.quantity_filled + pi.quantity_empty_good + pi.quantity_defective) AS total_physical_units,
        p.name AS product_name,
        p.category,
        p.container_type,
        p.net_weight_kg,
        p.is_active
      FROM plant_inventory pi
      JOIN products p ON pi.product_id = p.id
      WHERE pi.product_id = $1
      ${forUpdate ? 'FOR UPDATE OF pi' : ''}
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
    await runner.query(
      `INSERT INTO plant_inventory (product_id, quantity_filled, quantity_empty_good, quantity_defective)
       VALUES ($1, 0, 0, 0)
       ON CONFLICT (product_id) DO NOTHING`,
      [productId]
    );

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

  /**
   * Retrieves a unified cross-fleet ledger of all transfer slips (DISPATCH_LOAD, RETURN_UNLOAD)
   * and plant stock adjustments (SUPPLIER_PURCHASE, DEFECT_ADJUSTMENT, PHYSICAL_COUNT).
   *
   * @param {Object} [filters]
   * @param {string} [filters.transferType] - DISPATCH_LOAD, RETURN_UNLOAD, SUPPLIER_PURCHASE, DEFECT_ADJUSTMENT, PHYSICAL_COUNT
   * @param {string} [filters.sourceType] - TRIP_LOAD, PLANT_ADJUSTMENT
   * @param {string} [filters.productId] - UUID of product
   * @param {string} [filters.tripId] - UUID of trip
   * @param {string} [filters.truckId] - UUID of vehicle
   * @param {string} [filters.startDate] - ISO timestamp or date
   * @param {string} [filters.endDate] - ISO timestamp or date
   * @param {string} [filters.search] - Search string
   * @param {Object} [pagination] - Sanitized pagination options from parsePaginationQuery
   */
  async getGlobalTransfers(filters = {}, pagination = null) {
    let includeTripLoads = true;
    let includePlantAdjustments = true;

    if (filters.sourceType) {
      const st = String(filters.sourceType).toUpperCase().trim();
      if (st === 'TRIP_LOAD') includePlantAdjustments = false;
      if (st === 'PLANT_ADJUSTMENT') includeTripLoads = false;
    }

    if (filters.transferType) {
      const tt = String(filters.transferType).toUpperCase().trim();
      if (['DISPATCH_LOAD', 'RETURN_UNLOAD'].includes(tt)) {
        includePlantAdjustments = false;
      } else if (['SUPPLIER_PURCHASE', 'DEFECT_ADJUSTMENT', 'PHYSICAL_COUNT'].includes(tt)) {
        includeTripLoads = false;
      }
    }

    if (filters.tripId || filters.truckId) {
      includePlantAdjustments = false;
    }

    if (!includeTripLoads && !includePlantAdjustments) {
      if (pagination && pagination.isPaginated) {
        return { rows: [], total: 0 };
      }
      return [];
    }

    const values = [];
    const tlConditions = [];
    const psaConditions = [];

    if (includeTripLoads) {
      if (filters.transferType) {
        values.push(filters.transferType.toUpperCase().trim());
        tlConditions.push(`tl.transfer_type = $${values.length}::transfer_type`);
      }
      if (filters.productId) {
        values.push(filters.productId.trim());
        tlConditions.push(
          `EXISTS (SELECT 1 FROM trip_load_items tli WHERE tli.load_id = tl.id AND tli.product_id = $${values.length})`
        );
      }
      if (filters.tripId) {
        values.push(filters.tripId.trim());
        tlConditions.push(`tl.trip_id = $${values.length}`);
      }
      if (filters.truckId) {
        values.push(filters.truckId.trim());
        tlConditions.push(`t.truck_id = $${values.length}`);
      }
      if (filters.startDate) {
        values.push(filters.startDate);
        tlConditions.push(`tl.recorded_at >= $${values.length}`);
      }
      if (filters.endDate) {
        values.push(filters.endDate);
        tlConditions.push(`tl.recorded_at <= $${values.length}`);
      }
      if (filters.search) {
        values.push(`%${filters.search.trim()}%`);
        tlConditions.push(
          `(tl.slip_number ILIKE $${values.length} OR t.trip_number ILIKE $${values.length} OR v.plate_number ILIKE $${values.length} OR tl.remarks ILIKE $${values.length})`
        );
      }
    }

    if (includePlantAdjustments) {
      if (filters.transferType) {
        values.push(filters.transferType.toUpperCase().trim());
        psaConditions.push(`psa.adjustment_type = $${values.length}::plant_adjustment_type`);
      }
      if (filters.productId) {
        values.push(filters.productId.trim());
        psaConditions.push(`psa.product_id = $${values.length}`);
      }
      if (filters.startDate) {
        values.push(filters.startDate);
        psaConditions.push(`psa.recorded_at >= $${values.length}`);
      }
      if (filters.endDate) {
        values.push(filters.endDate);
        psaConditions.push(`psa.recorded_at <= $${values.length}`);
      }
      if (filters.search) {
        values.push(`%${filters.search.trim()}%`);
        psaConditions.push(
          `(psa.supplier_invoice_number ILIKE $${values.length} OR psa.reason ILIKE $${values.length} OR p.name ILIKE $${values.length})`
        );
      }
    }

    const subqueries = [];

    if (includeTripLoads) {
      const whereTL = tlConditions.length > 0 ? `WHERE ${tlConditions.join(' AND ')}` : '';
      subqueries.push(`
        SELECT
          tl.id,
          'TRIP_LOAD'::text AS source_type,
          tl.transfer_type::text AS transfer_type,
          tl.slip_number,
          tl.recorded_at,
          tl.recorded_by,
          tl.remarks,
          t.id AS trip_id,
          t.trip_number::text AS trip_number,
          v.id AS truck_id,
          v.plate_number::text AS truck_plate_number,
          NULL::text AS supplier_invoice_number,
          NULL::uuid AS product_id,
          NULL::text AS product_name,
          NULL::text AS product_category,
          NULL::text AS container_type,
          NULL::numeric AS net_weight_kg,
          NULL::text AS target_condition,
          NULL::int AS delta_quantity,
          u.username AS recorded_by_username,
          u.first_name AS recorded_by_first_name,
          u.last_name AS recorded_by_last_name
        FROM trip_loads tl
        LEFT JOIN trips t ON tl.trip_id = t.id
        LEFT JOIN vehicles v ON t.truck_id = v.id
        LEFT JOIN users u ON tl.recorded_by = u.id
        ${whereTL}
      `);
    }

    if (includePlantAdjustments) {
      const wherePSA = psaConditions.length > 0 ? `WHERE ${psaConditions.join(' AND ')}` : '';
      subqueries.push(`
        SELECT
          psa.id,
          'PLANT_ADJUSTMENT'::text AS source_type,
          psa.adjustment_type::text AS transfer_type,
          COALESCE(psa.supplier_invoice_number, 'ADJ-' || UPPER(SUBSTRING(psa.id::text, 1, 8))) AS slip_number,
          psa.recorded_at,
          psa.recorded_by,
          psa.reason AS remarks,
          NULL::uuid AS trip_id,
          NULL::text AS trip_number,
          NULL::uuid AS truck_id,
          NULL::text AS truck_plate_number,
          psa.supplier_invoice_number::text AS supplier_invoice_number,
          psa.product_id,
          p.name AS product_name,
          p.category AS product_category,
          p.container_type::text AS container_type,
          p.net_weight_kg,
          psa.target_condition::text AS target_condition,
          psa.delta_quantity::int AS delta_quantity,
          u.username AS recorded_by_username,
          u.first_name AS recorded_by_first_name,
          u.last_name AS recorded_by_last_name
        FROM plant_stock_adjustments psa
        JOIN products p ON psa.product_id = p.id
        LEFT JOIN users u ON psa.recorded_by = u.id
        ${wherePSA}
      `);
    }

    const unionSql = subqueries.join(' UNION ALL ');

    let total = null;
    if (pagination && pagination.isPaginated) {
      const countSql = `SELECT COUNT(*)::int AS count FROM (${unionSql}) AS combined`;
      const countRes = await query(countSql, values);
      total = countRes.rows[0].count;
    }

    let limitOffsetClause = '';
    const queryValues = [...values];
    if (pagination && pagination.isPaginated) {
      const offset = (pagination.page - 1) * pagination.limit;
      queryValues.push(pagination.limit);
      const limitParam = `$${queryValues.length}`;
      queryValues.push(offset);
      const offsetParam = `$${queryValues.length}`;
      limitOffsetClause = `LIMIT ${limitParam} OFFSET ${offsetParam}`;
    }

    const selectSql = `
      SELECT * FROM (${unionSql}) AS combined
      ORDER BY recorded_at DESC, id DESC
      ${limitOffsetClause}
    `;

    const res = await query(selectSql, queryValues);
    const rows = res.rows;

    const tripLoadIds = rows.filter((r) => r.source_type === 'TRIP_LOAD').map((r) => r.id);
    const itemsByLoad = {};
    if (tripLoadIds.length > 0) {
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
      const itemsRes = await query(itemsSql, [tripLoadIds]);
      for (const it of itemsRes.rows) {
        if (!itemsByLoad[it.load_id]) {
          itemsByLoad[it.load_id] = [];
        }
        const isCanister = it.container_type === 'CANISTER';
        itemsByLoad[it.load_id].push({
          id: it.id,
          productId: it.product_id,
          productName: it.product_name,
          productCategory: it.product_category,
          containerType: it.container_type,
          netWeightKg: it.net_weight_kg != null ? parseFloat(it.net_weight_kg) : null,
          condition: it.condition,
          quantityUnits: it.quantity_units,
          crates: isCanister ? Math.floor(it.quantity_units / 24) : null,
        });
      }
    }

    const formattedTransfers = rows.map((r) => {
      let items = [];
      if (r.source_type === 'TRIP_LOAD') {
        items = itemsByLoad[r.id] || [];
      } else if (r.source_type === 'PLANT_ADJUSTMENT') {
        const isCanister = r.container_type === 'CANISTER';
        const qty = Math.abs(r.delta_quantity);
        items = [
          {
            id: r.id,
            productId: r.product_id,
            productName: r.product_name,
            productCategory: r.product_category,
            containerType: r.container_type,
            netWeightKg: r.net_weight_kg != null ? parseFloat(r.net_weight_kg) : null,
            condition: r.target_condition,
            quantityUnits: qty,
            crates: isCanister ? Math.floor(qty / 24) : null,
          },
        ];
      }

      return {
        id: r.id,
        sourceType: r.source_type,
        transferType: r.transfer_type,
        slipNumber: r.slip_number,
        recordedAt: r.recorded_at,
        recordedBy: r.recorded_by
          ? {
              id: r.recorded_by,
              username: r.recorded_by_username,
              firstName: r.recorded_by_first_name,
              lastName: r.recorded_by_last_name,
            }
          : null,
        remarks: r.remarks,
        trip: r.trip_id
          ? {
              id: r.trip_id,
              tripNumber: r.trip_number,
              truckId: r.truck_id,
              plateNumber: r.truck_plate_number,
            }
          : null,
        supplierInvoiceNumber: r.supplier_invoice_number || null,
        items,
      };
    });

    if (pagination && pagination.isPaginated) {
      return { rows: formattedTransfers, total };
    }
    return formattedTransfers;
  }
}

module.exports = new InventoryRepository();
