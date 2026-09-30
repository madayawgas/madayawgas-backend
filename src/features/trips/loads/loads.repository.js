const { query, pool } = require('../../../../database/connection');

/**
 * Trip Loads Repository
 * Data access layer for multi-load inventory transfers and line items.
 */
class LoadsRepository {
  /**
   * Creates a load transfer slip and inserts its items atomically.
   * @param {Object} loadData - { tripId, transferType, slipNumber, recordedBy, remarks, items }
   * @param {Object} [client] - Optional transaction client
   */
  async createLoadWithItems(
    { tripId, transferType, slipNumber, recordedBy = null, remarks = null, items = [] },
    client = null
  ) {
    const shouldManageTx = !client;
    const txClient = client || (await pool.connect());

    try {
      if (shouldManageTx) {
        await txClient.query('BEGIN');
      }

      // 1. Insert Load Slip
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

      // 2. Insert Load Items
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
   * Retrieves all load slips for a trip with line items and product details.
   * @param {string} tripId - Trip UUID
   */
  async getLoadsByTripId(tripId) {
    const loadsSql = `
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

    const loadsRes = await query(loadsSql, [tripId]);
    const loads = loadsRes.rows;

    if (loads.length === 0) {
      return [];
    }

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
   * Computes aggregated stock counts across all loads for a trip.
   * @param {string} tripId - Trip UUID
   */
  async calculateTripStockSummary(tripId) {
    const sql = `
      SELECT 
        COALESCE(SUM(CASE WHEN tl.transfer_type = 'DISPATCH_LOAD' AND tli.condition = 'FILLED' THEN tli.quantity_units ELSE 0 END), 0)::int AS total_loaded_full,
        COALESCE(SUM(CASE WHEN tl.transfer_type = 'RETURN_UNLOAD' AND tli.condition = 'FILLED' THEN tli.quantity_units ELSE 0 END), 0)::int AS total_returned_full,
        COALESCE(SUM(CASE WHEN tl.transfer_type = 'RETURN_UNLOAD' AND tli.condition = 'EMPTY_GOOD' THEN tli.quantity_units ELSE 0 END), 0)::int AS total_returned_empty_good,
        COALESCE(SUM(CASE WHEN tl.transfer_type = 'RETURN_UNLOAD' AND tli.condition = 'DEFECTIVE' THEN tli.quantity_units ELSE 0 END), 0)::int AS total_returned_defective
      FROM trip_loads tl
      JOIN trip_load_items tli ON tl.id = tli.load_id
      WHERE tl.trip_id = $1
    `;

    const res = await query(sql, [tripId]);
    return res.rows[0] || {
      total_loaded_full: 0,
      total_returned_full: 0,
      total_returned_empty_good: 0,
      total_returned_defective: 0,
    };
  }
}

module.exports = new LoadsRepository();
