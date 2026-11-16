const { query } = require('../../../database/connection');

/**
 * Dashboard Repository
 * Aggregates cross-domain operational KPIs for executive dashboard views.
 */
class DashboardRepository {
  /**
   * Retrieves fleet, trips, operations, plant inventory, and sales KPIs in parallel.
   * @returns {Promise<Object>}
   */
  async getOverviewMetrics() {
    const [
      fleetRes,
      tripsRes,
      schedulesRes,
      operationsRes,
      fuelRes,
      inventoryRes,
      salesRes,
      invoicesRes,
    ] = await Promise.all([
      query(`
        SELECT
          COUNT(*)::int AS total_vehicles,
          COUNT(*) FILTER (WHERE v.status = 'ACTIVE')::int AS active_vehicles,
          COUNT(*) FILTER (WHERE v.status = 'UNDER_MAINTENANCE')::int AS under_maintenance,
          COUNT(*) FILTER (WHERE v.status IN ('INACTIVE', 'RETIRED'))::int AS inactive_or_retired,
          COUNT(*) FILTER (
            WHERE v.status NOT IN ('INACTIVE', 'RETIRED')
              AND (v.current_odometer - v.last_pm_odometer) >= COALESCE(
                (SELECT NULLIF(value, '')::numeric FROM system_settings WHERE key = 'fleet.pm_odometer_threshold_km'),
                5000
              )
          )::int AS pm_due_count
        FROM vehicles v
      `),
      query(`
        SELECT
          COUNT(*) FILTER (WHERE status = 'IN_PROGRESS')::int AS active_trips,
          COUNT(*) FILTER (WHERE status = 'RETURNED')::int AS returned_awaiting_reconciliation,
          COUNT(*) FILTER (WHERE status = 'COMPLETED' AND departure_time >= CURRENT_DATE)::int AS completed_today
        FROM trips
      `),
      query(`
        SELECT
          COUNT(*) FILTER (WHERE scheduled_date = CURRENT_DATE AND status != 'CANCELLED')::int AS scheduled_today
        FROM truck_schedules
      `),
      query(`
        SELECT
          (SELECT COUNT(*)::int FROM emergency_alerts WHERE status IN ('ACTIVE', 'ACKNOWLEDGED')) AS active_sos_alerts,
          (SELECT COUNT(*)::int FROM driver_apprehensions WHERE status = 'PENDING') AS pending_apprehensions
      `),
      query(`
        SELECT
          COALESCE(SUM(total_cost) FILTER (WHERE fueled_at >= CURRENT_DATE), 0)::numeric(12,2) AS fuel_cost_today,
          COALESCE(SUM(total_cost) FILTER (WHERE fueled_at >= NOW() - INTERVAL '30 days'), 0)::numeric(12,2) AS fuel_cost_30d,
          COALESCE(SUM(liters_pumped) FILTER (WHERE fueled_at >= NOW() - INTERVAL '30 days'), 0)::numeric(12,2) AS fuel_liters_30d
        FROM vehicle_fuel_logs
      `),
      query(`
        SELECT
          COALESCE(SUM(pi.quantity_filled), 0)::int AS total_filled,
          COALESCE(SUM(pi.quantity_empty_good), 0)::int AS total_empty_good,
          COALESCE(SUM(pi.quantity_defective), 0)::int AS total_defective
        FROM plant_inventory pi
        JOIN products p ON p.id = pi.product_id
        WHERE p.is_active = TRUE
      `),
      query(`
        SELECT
          COUNT(*) FILTER (WHERE st.status = 'COMPLETED' AND st.transacted_at >= CURRENT_DATE)::int AS transactions_today,
          COUNT(*) FILTER (WHERE st.status = 'COMPLETED' AND st.transacted_at >= NOW() - INTERVAL '30 days')::int AS transactions_30d,
          COALESCE(SUM(si.total_amount) FILTER (WHERE st.status = 'COMPLETED' AND st.transacted_at >= CURRENT_DATE), 0)::numeric(12,2) AS revenue_today,
          COALESCE(SUM(si.total_amount) FILTER (WHERE st.status = 'COMPLETED' AND st.transacted_at >= NOW() - INTERVAL '30 days'), 0)::numeric(12,2) AS revenue_30d
        FROM sales_transactions st
        LEFT JOIN sales_invoices si ON si.transaction_id = st.id
      `),
      query(`
        SELECT
          COUNT(*) FILTER (WHERE si.payment_status = 'PAID_UNVERIFIED' AND st.status = 'COMPLETED')::int AS unverified_invoices_count
        FROM sales_invoices si
        JOIN sales_transactions st ON st.id = si.transaction_id
      `),
    ]);

    return {
      fleet: fleetRes.rows[0],
      trips: tripsRes.rows[0],
      schedules: schedulesRes.rows[0],
      operations: operationsRes.rows[0],
      fuel: fuelRes.rows[0],
      inventory: inventoryRes.rows[0],
      sales: salesRes.rows[0],
      invoices: invoicesRes.rows[0],
    };
  }
}

module.exports = new DashboardRepository();
