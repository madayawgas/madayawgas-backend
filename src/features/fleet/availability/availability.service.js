const availabilityRepository = require('./availability.repository');
const vehiclesRepository = require('../vehicles/vehicles.repository');
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
      vehicleType: row.vehicle_type || 'DELIVERY_TRUCK',
      currentOdometer: Number(row.current_odometer),
      lastPmOdometer: Number(row.last_pm_odometer),
      isPmDue: row.pm_due_flag !== undefined ? Boolean(row.pm_due_flag) : (Number(row.current_odometer) - Number(row.last_pm_odometer) >= 5000),
      pmDueFlag: row.pm_due_flag !== undefined ? Boolean(row.pm_due_flag) : (Number(row.current_odometer) - Number(row.last_pm_odometer) >= 5000),
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
      trucks: availableVehicles,
    };
  }

  /**
   * Retrieves the current availability and operational status of a specific vehicle.
   */
  async getTruckStatus(vehicleId) {
    if (!vehicleId || typeof vehicleId !== 'string') {
      throw new Error('Vehicle ID is required');
    }

    const row = await availabilityRepository.getTruckStatusById(vehicleId);
    if (!row) {
      throw new Error('Vehicle not found');
    }

    return {
      id: row.id,
      plateNumber: row.plate_number,
      model: row.model,
      vehicleType: row.vehicle_type || 'DELIVERY_TRUCK',
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
   * Sets vehicle operational availability status and handles driver assignment state transitions.
   *
   * Business Rules:
   * - ACTIVE -> UNDER_MAINTENANCE: Preserves assigned driver.
   * - ACTIVE -> INACTIVE / RETIRED: Clears driver assignment, returning driver to AVAILABLE pool.
   * - Re-activating a deactivated vehicle does NOT automatically re-assign past drivers.
   */
  async updateTruckStatus(vehicleId, status) {
    if (!vehicleId || typeof vehicleId !== 'string') {
      throw new Error('Vehicle ID is required');
    }

    if (!status || typeof status !== 'string') {
      throw new Error('Status is required');
    }

    const cleanStatus = status.trim().toUpperCase();
    const validStatuses = ['ACTIVE', 'INACTIVE', 'UNDER_MAINTENANCE', 'RETIRED'];

    if (!validStatuses.includes(cleanStatus)) {
      throw new Error(`Invalid status: ${cleanStatus}. Valid options are: ${validStatuses.join(', ')}`);
    }

    const existing = await availabilityRepository.getTruckStatusById(vehicleId);
    if (!existing) {
      throw new Error('Vehicle not found');
    }

    const shouldClearDriver = cleanStatus === 'INACTIVE' || cleanStatus === 'RETIRED';
    const targetDriverId = shouldClearDriver ? null : existing.driver_id;

    await availabilityRepository.updateTruckStatus(vehicleId, cleanStatus, targetDriverId);

    try {
      const eventKey = EVENTS.VEHICLE_STATUS_UPDATED || EVENTS.TRUCK_STATUS_UPDATED;
      await historyService.log(eventKey, {
        actorUser: null,
        targetId: vehicleId,
        payload: {
          plateNumber: existing.plate_number,
          status: cleanStatus,
        },
      });
    } catch (auditErr) {
      console.error('Failed to emit history log for VEHICLE_STATUS_UPDATED:', auditErr);
    }

    return this.getTruckStatus(vehicleId);
  }
}

module.exports = new AvailabilityService();
