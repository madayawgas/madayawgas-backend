const { query } = require('../../../../database/connection');

/**
 * Trip Stock Reconciliation Repository
 * Data access layer for post-trip inventory settlement and variance accounting.
 */
class ReconciliationRepository {
  /**
   * Retrieves reconciliation record for a trip by trip UUID.
   * @param {string} tripId
   */
  async getByTripId(tripId) {
    const sql = `
      SELECT 
        tsr.id,
        tsr.trip_id,
        tsr.verified_by,
        tsr.total_loaded_full,
        tsr.total_sold_full,
        tsr.total_returned_full,
        tsr.total_returned_empty_good,
        tsr.total_returned_defective,
        tsr.net_customer_debt_created,
        tsr.status,
        tsr.supervisor_notes,
        tsr.reconciled_at,
        tsr.created_at,
        tsr.updated_at,
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
   * Upserts reconciliation record for a trip.
   * @param {Object} data
   * @param {Object} [client]
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
      status = 'AWAITING_SYNC',
      supervisorNotes = null,
      reconciledAt = null,
    },
    client = null
  ) {
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
        status,
        supervisor_notes,
        reconciled_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      ON CONFLICT (trip_id) DO UPDATE SET
        verified_by = COALESCE(EXCLUDED.verified_by, trip_stock_reconciliations.verified_by),
        total_loaded_full = EXCLUDED.total_loaded_full,
        total_sold_full = EXCLUDED.total_sold_full,
        total_returned_full = EXCLUDED.total_returned_full,
        total_returned_empty_good = EXCLUDED.total_returned_empty_good,
        total_returned_defective = EXCLUDED.total_returned_defective,
        net_customer_debt_created = EXCLUDED.net_customer_debt_created,
        status = EXCLUDED.status,
        supervisor_notes = COALESCE(EXCLUDED.supervisor_notes, trip_stock_reconciliations.supervisor_notes),
        reconciled_at = COALESCE(EXCLUDED.reconciled_at, trip_stock_reconciliations.reconciled_at)
      RETURNING *
    `;

    const runner = client || { query };
    const res = await runner.query(sql, [
      tripId,
      verifiedBy,
      totalLoadedFull,
      totalSoldFull,
      totalReturnedFull,
      totalReturnedEmptyGood,
      totalReturnedDefective,
      netCustomerDebtCreated,
      status,
      supervisorNotes,
      reconciledAt,
    ]);

    return res.rows[0];
  }
}

module.exports = new ReconciliationRepository();
