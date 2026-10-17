const alertsRepository = require('./alerts.repository');
const alertsNotifier = require('./alerts.notifier');
const vehiclesRepository = require('../../fleet/vehicles/vehicles.repository');
const tripsRepository = require('../../trips/trips.repository');
const { historyService, EVENTS } = require('../../history');
const { calculateOffset, buildPaginationMeta } = require('../../../utils/pagination');

/**
 * Formats database row into camelCase API DTO.
 */
function formatAlertRecord(row) {
  if (!row) return null;

  return {
    id: row.id,
    driverId: row.driver_id,
    vehicleId: row.vehicle_id,
    tripId: row.trip_id,
    latitude: row.latitude !== null ? Number(row.latitude) : null,
    longitude: row.longitude !== null ? Number(row.longitude) : null,
    location: row.latitude !== null && row.longitude !== null
      ? { latitude: Number(row.latitude), longitude: Number(row.longitude) }
      : null,
    emergencyType: row.emergency_type,
    description: row.description || null,
    status: row.status,
    acknowledgedBy: row.acknowledged_by || null,
    acknowledgedByName: row.acknowledged_by_username || null,
    acknowledgedAt: row.acknowledged_at || null,
    resolvedBy: row.resolved_by || null,
    resolvedByName: row.resolved_by_username || null,
    resolvedAt: row.resolved_at || null,
    resolutionNotes: row.resolution_notes || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    vehicle: row.vehicle_id
      ? {
          id: row.vehicle_id,
          plateNumber: row.vehicle_plate_number,
          model: row.vehicle_model,
          vehicleType: row.vehicle_type,
        }
      : null,
    driver: {
      id: row.driver_id,
      username: row.driver_username,
      firstName: row.driver_first_name,
      lastName: row.driver_last_name,
      fullName: [row.driver_first_name, row.driver_last_name].filter(Boolean).join(' ') || row.driver_username,
      phone: row.driver_phone,
    },
    trip: row.trip_id
      ? {
          id: row.trip_id,
          tripNumber: row.trip_number,
        }
      : null,
  };
}

/**
 * Driver Emergency Alerts Service
 * Provides rapid, lightweight SOS dispatches for mobile drivers with automatic context resolution,
 * anti-spam idempotency, standing WebSocket adapter notification hooks, and audit trails.
 */
class AlertsService {
  /**
   * Triggers an emergency SOS alert for the authenticated driver.
   *
   * @param {Object} actorUser - Authenticated user context
   * @param {Object} payload - { latitude, longitude, emergencyType, description, vehicleId, tripId }
   * @returns {Promise<Object>} Created or deduplicated alert DTO
   */
  async triggerAlert(actorUser, payload = {}) {
    const driverId = actorUser.id;

    // 1. Anti-Spam Idempotency Guard:
    // Check if the driver already submitted an ACTIVE alert within the last 60 seconds
    const recentAlert = await alertsRepository.findRecentActiveAlertByDriverId(driverId, 60);
    if (recentAlert) {
      const fullRecord = await alertsRepository.getAlertById(recentAlert.id);
      const existingDto = formatAlertRecord(fullRecord);
      return {
        ...existingDto,
        isDuplicate: true,
        message: 'Active emergency alert already registered. Dispatchers are processing your call.',
      };
    }

    // 2. Geolocation validation (Graceful fallback to null)
    let validLat = null;
    let validLng = null;

    if (payload.latitude !== undefined && payload.latitude !== null && payload.latitude !== '') {
      const lat = Number(payload.latitude);
      if (!isNaN(lat) && lat >= -90.0 && lat <= 90.0) {
        validLat = lat;
      }
    }

    if (payload.longitude !== undefined && payload.longitude !== null && payload.longitude !== '') {
      const lng = Number(payload.longitude);
      if (!isNaN(lng) && lng >= -180.0 && lng <= 180.0) {
        validLng = lng;
      }
    }

    // 3. Operational Context Auto-Resolution:
    // Query active trip or assigned vehicle automatically to minimize required driver input
    let resolvedTripId = payload.tripId && typeof payload.tripId === 'string' && payload.tripId.trim().length > 0
      ? payload.tripId.trim()
      : null;

    let resolvedVehicleId = payload.vehicleId && typeof payload.vehicleId === 'string' && payload.vehicleId.trim().length > 0
      ? payload.vehicleId.trim()
      : null;

    if (!resolvedTripId || !resolvedVehicleId) {
      const activeTrip = await tripsRepository.findActiveTripByDriverId(driverId);
      if (activeTrip) {
        if (!resolvedTripId) resolvedTripId = activeTrip.id;
        if (!resolvedVehicleId) resolvedVehicleId = activeTrip.truck_id;
      }
    }

    if (!resolvedVehicleId) {
      const assigned = await vehiclesRepository.findVehicleByDriverId(driverId);
      if (assigned) {
        resolvedVehicleId = assigned.id;
      }
    }

    const validTypes = ['GENERAL', 'ACCIDENT', 'VEHICLE_BREAKDOWN', 'MEDICAL', 'SECURITY', 'OTHER'];
    let cleanType = 'GENERAL';
    if (payload.emergencyType && typeof payload.emergencyType === 'string') {
      const upper = payload.emergencyType.trim().toUpperCase();
      if (validTypes.includes(upper)) {
        cleanType = upper;
      }
    }

    // 4. Persistence
    const created = await alertsRepository.createAlert({
      driverId,
      vehicleId: resolvedVehicleId,
      tripId: resolvedTripId,
      latitude: validLat,
      longitude: validLng,
      emergencyType: cleanType,
      description: payload.description ? String(payload.description).trim() : null,
    });

    const fullRecord = await alertsRepository.getAlertById(created.id);
    const dto = formatAlertRecord(fullRecord);

    // 5. Standing Notifier Hook (for future WebSockets / SSE)
    alertsNotifier.dispatchEmergencyAlert(dto);

    // 6. Centralized Event History Audit Trail
    await historyService.log(EVENTS.EMERGENCY_ALERT_TRIGGERED, {
      actorUser,
      targetId: created.id,
      payload: {
        driverName: dto.driver.fullName,
        plateNumber: dto.vehicle?.plateNumber || 'N/A',
        emergencyType: cleanType,
      },
      metadata: {
        alertId: created.id,
        vehicleId: resolvedVehicleId,
        tripId: resolvedTripId,
        coordinates: validLat && validLng ? { lat: validLat, lng: validLng } : null,
      },
    });

    return {
      ...dto,
      isDuplicate: false,
    };
  }

  /**
   * Retrieves single emergency alert by UUID.
   * @param {string} id - Alert UUID
   * @param {Object} actorUser
   */
  async getAlertById(id, actorUser) {
    if (!id || typeof id !== 'string') {
      const err = new Error('Alert ID is required');
      err.statusCode = 400;
      throw err;
    }

    const row = await alertsRepository.getAlertById(id.trim());
    if (!row) {
      const err = new Error('Emergency alert not found');
      err.statusCode = 404;
      throw err;
    }

    const permissions = actorUser?.permissions || [];
    const hasGlobalView = permissions.includes('alerts.view') || permissions.includes('alerts.manage');

    if (!hasGlobalView && row.driver_id !== actorUser.id) {
      const err = new Error('Access denied: You are only authorized to view your own emergency alerts');
      err.statusCode = 403;
      throw err;
    }

    return formatAlertRecord(row);
  }

  /**
   * Acknowledges an active emergency alert.
   * @param {string} id - Alert UUID
   * @param {Object} actorUser - Supervisor/Admin
   */
  async acknowledgeAlert(id, actorUser) {
    if (!id || typeof id !== 'string') {
      const err = new Error('Alert ID is required');
      err.statusCode = 400;
      throw err;
    }

    const alert = await alertsRepository.getAlertById(id.trim());
    if (!alert) {
      const err = new Error('Emergency alert not found');
      err.statusCode = 404;
      throw err;
    }

    await alertsRepository.acknowledgeAlert(id.trim(), actorUser.id);
    const fullRecord = await alertsRepository.getAlertById(id.trim());
    const dto = formatAlertRecord(fullRecord);

    alertsNotifier.dispatchStatusUpdate(dto);

    await historyService.log(EVENTS.EMERGENCY_ALERT_ACKNOWLEDGED, {
      actorUser,
      targetId: id.trim(),
      payload: {
        alertId: id.trim(),
        supervisorName: [actorUser.firstName, actorUser.lastName].filter(Boolean).join(' ') || actorUser.username,
        driverName: dto.driver.fullName,
      },
    });

    return dto;
  }

  /**
   * Resolves an emergency alert with notes.
   * @param {string} id - Alert UUID
   * @param {Object} actorUser - Supervisor/Admin
   * @param {Object} payload - { resolutionNotes, status }
   */
  async resolveAlert(id, actorUser, payload = {}) {
    if (!id || typeof id !== 'string') {
      const err = new Error('Alert ID is required');
      err.statusCode = 400;
      throw err;
    }

    const alert = await alertsRepository.getAlertById(id.trim());
    if (!alert) {
      const err = new Error('Emergency alert not found');
      err.statusCode = 404;
      throw err;
    }

    const validResolutionStatuses = ['RESOLVED', 'FALSE_ALARM'];
    let targetStatus = 'RESOLVED';
    if (payload.status && typeof payload.status === 'string') {
      const upper = payload.status.trim().toUpperCase();
      if (validResolutionStatuses.includes(upper)) {
        targetStatus = upper;
      }
    }

    await alertsRepository.resolveAlert(id.trim(), {
      resolvedBy: actorUser.id,
      resolutionNotes: payload.resolutionNotes || payload.notes || null,
      status: targetStatus,
    });

    const fullRecord = await alertsRepository.getAlertById(id.trim());
    const dto = formatAlertRecord(fullRecord);

    alertsNotifier.dispatchStatusUpdate(dto);

    await historyService.log(EVENTS.EMERGENCY_ALERT_RESOLVED, {
      actorUser,
      targetId: id.trim(),
      payload: {
        alertId: id.trim(),
        supervisorName: [actorUser.firstName, actorUser.lastName].filter(Boolean).join(' ') || actorUser.username,
        driverName: dto.driver.fullName,
      },
    });

    return dto;
  }

  /**
   * Retrieves all currently active and ongoing alerts (for dispatcher real-time screens).
   */
  async getActiveAlerts() {
    const rows = await alertsRepository.getActiveAlerts();
    return rows.map(formatAlertRecord);
  }

  /**
   * Retrieves delta alerts modified or created since a given timestamp (for admin polling).
   * @param {string} sinceTimestamp - ISO date string
   */
  async getPollAlerts(sinceTimestamp) {
    if (!sinceTimestamp) {
      const err = new Error('The since query parameter is required (e.g. ?since=2026-10-17T12:00:00Z)');
      err.statusCode = 400;
      throw err;
    }

    const parsed = new Date(sinceTimestamp);
    if (isNaN(parsed.getTime())) {
      const err = new Error('Invalid ISO date format for since parameter');
      err.statusCode = 400;
      throw err;
    }

    const rows = await alertsRepository.getPollAlerts(parsed.toISOString());
    return rows.map(formatAlertRecord);
  }

  /**
   * Retrieves paginated emergency alert logs with filtering.
   *
   * @param {Object} actorUser
   * @param {Object} filters - { status, driverId, vehicleId, emergencyType, startDate, endDate }
   * @param {Object|null} pagination
   */
  async getAlerts(actorUser, filters = {}, pagination = null) {
    const permissions = actorUser?.permissions || [];
    const hasGlobalView = permissions.includes('alerts.view') || permissions.includes('alerts.manage');

    const effectiveFilters = { ...filters };

    if (!hasGlobalView) {
      effectiveFilters.driverId = actorUser.id;
    }

    if (!pagination || !pagination.isPaginated) {
      const rows = await alertsRepository.getAlerts(effectiveFilters, null);
      return rows.map(formatAlertRecord);
    }

    const offset = calculateOffset(pagination.page, pagination.limit);
    const { rows, total } = await alertsRepository.getAlerts(effectiveFilters, {
      ...pagination,
      offset,
    });

    const items = rows.map(formatAlertRecord);
    const meta = buildPaginationMeta(total, pagination.page, pagination.limit);

    return {
      items,
      meta,
    };
  }
}

module.exports = new AlertsService();
