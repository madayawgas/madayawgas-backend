const dashboardRepository = require('./dashboard.repository');

/**
 * Dashboard Service
 * Formats cross-domain KPIs for executive dashboard views.
 */
class DashboardService {
  /**
   * Returns unified operational overview KPIs.
   * @returns {Promise<Object>}
   */
  async getOverview() {
    const raw = await dashboardRepository.getOverviewMetrics();

    return {
      fleet: {
        totalVehicles: Number(raw.fleet?.total_vehicles || 0),
        activeVehicles: Number(raw.fleet?.active_vehicles || 0),
        underMaintenance: Number(raw.fleet?.under_maintenance || 0),
        inactiveOrRetired: Number(raw.fleet?.inactive_or_retired || 0),
        pmDueCount: Number(raw.fleet?.pm_due_count || 0),
      },
      trips: {
        activeTrips: Number(raw.trips?.active_trips || 0),
        returnedAwaitingReconciliation: Number(raw.trips?.returned_awaiting_reconciliation || 0),
        completedToday: Number(raw.trips?.completed_today || 0),
        scheduledToday: Number(raw.schedules?.scheduled_today || 0),
      },
      operations: {
        activeSosAlerts: Number(raw.operations?.active_sos_alerts || 0),
        pendingApprehensions: Number(raw.operations?.pending_apprehensions || 0),
        fuelCostToday: Number(raw.fuel?.fuel_cost_today || 0),
        fuelCost30d: Number(raw.fuel?.fuel_cost_30d || 0),
        fuelLiters30d: Number(raw.fuel?.fuel_liters_30d || 0),
      },
      inventory: {
        totalFilled: Number(raw.inventory?.total_filled || 0),
        totalEmptyGood: Number(raw.inventory?.total_empty_good || 0),
        totalDefective: Number(raw.inventory?.total_defective || 0),
      },
      sales: {
        transactionsToday: Number(raw.sales?.transactions_today || 0),
        transactions30d: Number(raw.sales?.transactions_30d || 0),
        revenueToday: Number(raw.sales?.revenue_today || 0),
        revenue30d: Number(raw.sales?.revenue_30d || 0),
        unverifiedInvoicesCount: Number(raw.invoices?.unverified_invoices_count || 0),
      },
      generatedAt: new Date().toISOString(),
    };
  }
}

module.exports = new DashboardService();
