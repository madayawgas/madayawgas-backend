const availabilityRepository = require('./availability.repository');
const trucksRepository = require('../trucks/trucks.repository');
const { historyService, EVENTS } = require('../../history');

/**
 * Availability Service
 * Handles domain logic for fleet overview metrics, availability tracking, and operational status transitions.
 */
class AvailabilityService {
  /**
   * Retrieves summary overview of the fleet status and availability.
   */
  async getOverview() {
    const rawMetrics = await availabilityRepository.getOverviewMetrics();
    const total = rawMetrics.total || 0;
    const available = rawMetrics.available || 0;
    const assigned = rawMetrics.assigned || 0;
    const unassigned = rawMetrics.unassigned || 0;
    const underMaintenance = rawMetrics.under_maintenance || 0;
    const inactive = rawMetrics.inactive || 0;

    const operationalRate = total > 0 ? Number(((available / total) * 100).toFixed(1)) : 0;

    return {
      metrics: {
        totalVehicles: total,
        availableVehicles: available,
        assignedVehicles: assigned,
        unassignedVehicles: unassigned,
        underMaintenanceVehicles: underMaintenance,
        inactiveVehicles: inactive,
      },
      summary: {
        operationalTotal: available,
        operationalRatePercent: operationalRate,
      },
    };
  }

  /**
   * Retrieves all vehicles ready and available for operation (status = 'ACTIVE'),
   * including their dedicated soft-bounded driver details.
   */
  async getAvailability(filters = {}) {
    const rows = await availabilityRepository.getAvailableTrucks(filters);
    const availableVehicles = rows.map((row) => ({
      id: row.id,
      plateNumber: row.plate_number,
      model: row.model,
      yearModel: Number(row.year_model),
      currentOdometer: Number(row.current_odometer),
      lastPmOdometer: Number(row.last_pm_odometer),
      status: row.status,
      operationalStatus: 'ACTIVE',
      isAvailable: true,
      driverId: row.driver_id || null,
      driver: row.driver_id
        ? {
            id: row.driver_id,
            firstName: row.driver_first_name,
            lastName: row.driver_last_name,
            phone: row.driver_phone,
            username: row.driver_username,
          }
        : null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));

    return {
      availableCount: availableVehicles.length,
      vehicles: availableVehicles,
    };
  }

  /**
   * Retrieves the current availability and operational status of a specific vehicle.
   */
  async getTruckStatus(truckId) {
    if (!truckId || typeof truckId !== 'string') {
      throw new Error('Truck ID is required');
    }

    const row = await availabilityRepository.getTruckStatusById(truckId);
    if (!row) {
      throw new Error('Vehicle not found');
    }

    return {
      id: row.id,
      plateNumber: row.plate_number,
      model: row.model,
      status: row.status,
      operationalStatus: row.status,
      isAvailable: row.status === 'ACTIVE',
      driver: row.driver_id
        ? {
            id: row.driver_id,
            firstName: row.driver_first_name,
            lastName: row.driver_last_name,
            phone: row.driver_phone,
            username: row.driver_username,
          }
        : null,
    };
  }

  /**
   * Sets or updates the operational availability status of a vehicle.
   * Preserves soft-bounded driver assignment during maintenance (UNDER_MAINTENANCE);
   * clears driver assignment only on permanent deactivation (INACTIVE / RETIRED).
   */
  async updateTruckStatus(truckId, newStatus) {
    if (!truckId || typeof truckId !== 'string') {
      throw new Error('Truck ID is required');
    }

    if (!newStatus || typeof newStatus !== 'string') {
      throw new Error('Status is required');
    }

    const cleanStatus = newStatus.trim().toUpperCase();
    const allowedStatuses = ['ACTIVE', 'INACTIVE', 'UNDER_MAINTENANCE', 'RETIRED'];
    if (!allowedStatuses.includes(cleanStatus)) {
      throw new Error(`Invalid status '${newStatus}'. Allowed values: ${allowedStatuses.join(', ')}`);
    }

    const existingTruck = await trucksRepository.getTruckById(truckId);
    if (!existingTruck) {
      throw new Error('Vehicle not found');
    }

    // Preserve driver during maintenance / active; release driver if deactivated or retired
    const isDecommissioned = cleanStatus === 'INACTIVE' || cleanStatus === 'RETIRED';
    const finalDriverId = isDecommissioned ? null : existingTruck.driver_id;

    await availabilityRepository.updateTruckStatus(truckId, cleanStatus, finalDriverId);

    const updated = await this.getTruckStatus(truckId);

    await historyService.log(EVENTS.TRUCK_STATUS_UPDATED, {
      targetId: truckId,
      payload: { plateNumber: updated.plateNumber, status: cleanStatus },
      metadata: { status: cleanStatus, driverId: finalDriverId },
    });

    // Return the fresh full status representation
    return updated;
  }
}

module.exports = new AvailabilityService();
