const apprehensionsRepository = require('./apprehensions.repository');
const vehiclesRepository = require('../../fleet/vehicles/vehicles.repository');
const usersRepository = require('../../users/users.repository');
const tripsRepository = require('../../trips/trips.repository');
const { historyService, EVENTS } = require('../../history');
const { mediaStorage, extractStorageKey } = require('../../media');
const { calculateOffset, buildPaginationMeta } = require('../../../utils/pagination');

/**
 * Formats database row into camelCase API DTO with resolved media URLs.
 */
function formatApprehensionRecord(row) {
  if (!row) return null;

  const rawKey = row.ticket_media_key;
  const canonicalKey = extractStorageKey(rawKey) || rawKey;
  const ticketMediaUrl = canonicalKey ? mediaStorage.resolveMediaUrl(canonicalKey) : null;

  return {
    id: row.id,
    vehicleId: row.vehicle_id,
    driverId: row.driver_id,
    tripId: row.trip_id,
    citationTicketNo: row.citation_ticket_no || null,
    violationType: row.violation_type,
    apprehendingAgency: row.apprehending_agency,
    incidentTime: row.incident_time,
    location: row.location || null,
    penaltyAmount: Number(row.penalty_amount || 0),
    ticketMediaKey: canonicalKey,
    ticketMediaUrl,
    notes: row.notes || null,
    status: row.status,
    settledAt: row.settled_at || null,
    settledBy: row.settled_by || null,
    settledByName: row.settled_by_username || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    vehicle: {
      id: row.vehicle_id,
      plateNumber: row.vehicle_plate_number,
      model: row.vehicle_model,
      vehicleType: row.vehicle_type,
    },
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
 * Driver Road Apprehensions Service
 * Encapsulates roadside ticket logging, strict mandatory ticket image proof validation,
 * automatic active trip attribution, and status management.
 */
class ApprehensionsService {
  /**
   * Records a road apprehension incident.
   *
   * @param {Object} actorUser - Authenticated user context
   * @param {Object} payload - { vehicleId, driverId, tripId, citationTicketNo, violationType, apprehendingAgency, incidentTime, location, penaltyAmount, ticketMediaKey, notes }
   * @returns {Promise<Object>} Created apprehension DTO
   */
  async recordApprehension(actorUser, payload = {}) {
    const rawMediaKey = payload.ticketMediaKey || payload.mediaKey || payload.ticketImageUrl;

    // Invariant: Mandatory ticket image proof is strictly enforced
    if (!rawMediaKey || typeof rawMediaKey !== 'string' || rawMediaKey.trim().length === 0) {
      const err = new Error('Apprehension ticket image proof is strictly mandatory.');
      err.statusCode = 400;
      err.code = 'MEDIA_KEY_REQUIRED';
      throw err;
    }

    const canonicalMediaKey = extractStorageKey(rawMediaKey) || rawMediaKey.trim();

    const rawViolation = payload.violationType || payload.violation || payload.violationClassification || payload.violationNotes || payload.notes;
    if (!rawViolation || typeof rawViolation !== 'string' || rawViolation.trim().length === 0) {
      const err = new Error('Violation classification is required');
      err.statusCode = 400;
      throw err;
    }

    const rawAgency = payload.apprehendingAgency || payload.agency;
    if (!rawAgency || typeof rawAgency !== 'string' || rawAgency.trim().length === 0) {
      const err = new Error('Apprehending agency is required (e.g. LTO, CTTMO, PNP-HPG)');
      err.statusCode = 400;
      throw err;
    }

    const rawCitation = payload.citationTicketNo || payload.citationNumber || payload.ticketNumber || null;
    const rawPenalty = payload.penaltyAmount !== undefined && payload.penaltyAmount !== null
      ? payload.penaltyAmount
      : (payload.fineAmount !== undefined ? payload.fineAmount : null);

    // Resolve Driver ID
    let resolvedDriverId = payload.driverId && typeof payload.driverId === 'string' && payload.driverId.trim().length > 0
      ? payload.driverId.trim()
      : null;

    if (!resolvedDriverId) {
      // Default to authenticated driver if actor is driver, otherwise verify vehicle driver
      resolvedDriverId = actorUser.id;
    }

    const driverUser = await usersRepository.findUserById(resolvedDriverId);
    if (!driverUser) {
      const err = new Error('Driver user not found');
      err.statusCode = 404;
      throw err;
    }

    // Resolve Vehicle ID
    let resolvedVehicleId = payload.vehicleId && typeof payload.vehicleId === 'string' && payload.vehicleId.trim().length > 0
      ? payload.vehicleId.trim()
      : null;

    // If vehicleId not provided, check driver's assigned vehicle
    if (!resolvedVehicleId) {
      const assignedVehicle = await vehiclesRepository.findVehicleByDriverId(resolvedDriverId);
      if (assignedVehicle) {
        resolvedVehicleId = assignedVehicle.id;
      }
    }

    if (!resolvedVehicleId) {
      const err = new Error('Vehicle ID is required');
      err.statusCode = 400;
      throw err;
    }

    let vehicle = await vehiclesRepository.getVehicleById(resolvedVehicleId);
    if (!vehicle) {
      const assignedVehicle = await vehiclesRepository.findVehicleByDriverId(resolvedDriverId);
      if (assignedVehicle) {
        vehicle = assignedVehicle;
        resolvedVehicleId = assignedVehicle.id;
      } else {
        const err = new Error('Vehicle not found');
        err.statusCode = 404;
        throw err;
      }
    }

    const permissions = actorUser?.permissions || [];
    const hasManage = permissions.includes('apprehensions.manage');
    if (!hasManage && vehicle.driver_id && vehicle.driver_id !== actorUser.id) {
      const err = new Error('Access denied: You are only authorized to log roadside apprehensions for your assigned vehicle');
      err.statusCode = 403;
      throw err;
    }

    // Context Auto-Attribution: Check if driver or truck currently has an active trip in progress
    let resolvedTripId = payload.tripId && typeof payload.tripId === 'string' && payload.tripId.trim().length > 0
      ? payload.tripId.trim()
      : null;

    if (!resolvedTripId) {
      const activeTrip = await tripsRepository.findActiveTripByDriverId(resolvedDriverId);
      if (activeTrip) {
        resolvedTripId = activeTrip.id;
      }
    }

    let parsedIncidentTime = null;
    const incidentTimeInput = payload.incidentTime || payload.incidentDate;
    if (incidentTimeInput) {
      parsedIncidentTime = new Date(incidentTimeInput);
      if (isNaN(parsedIncidentTime.getTime())) {
        const err = new Error('Invalid incident timestamp format');
        err.statusCode = 400;
        throw err;
      }
    }

    const numPenalty = rawPenalty !== undefined && rawPenalty !== null ? Number(rawPenalty) : 0.00;
    if (isNaN(numPenalty) || numPenalty < 0) {
      const err = new Error('Penalty amount must be a non-negative number');
      err.statusCode = 400;
      throw err;
    }

    const created = await apprehensionsRepository.createApprehension({
      vehicleId: resolvedVehicleId,
      driverId: resolvedDriverId,
      tripId: resolvedTripId,
      recordedBy: actorUser.id,
      citationTicketNo: rawCitation ? String(rawCitation).trim() : null,
      violationType: rawViolation.trim().toUpperCase(),
      apprehendingAgency: rawAgency.trim().toUpperCase(),
      incidentTime: parsedIncidentTime ? parsedIncidentTime.toISOString() : null,
      location: payload.location ? String(payload.location).trim() : null,
      penaltyAmount: numPenalty,
      ticketMediaKey: canonicalMediaKey,
      notes: payload.notes ? String(payload.notes).trim() : null,
    });

    const fullRecord = await apprehensionsRepository.getApprehensionById(created.id);
    const dto = formatApprehensionRecord(fullRecord);

    await historyService.log(EVENTS.APPREHENSION_LOGGED, {
      actorUser,
      targetId: created.id,
      payload: {
        plateNumber: dto.vehicle.plateNumber,
        driverName: dto.driver.fullName,
        violationType: dto.violationType,
        apprehendingAgency: dto.apprehendingAgency,
      },
      metadata: {
        apprehensionId: created.id,
        vehicleId: resolvedVehicleId,
        driverId: resolvedDriverId,
        tripId: resolvedTripId,
        citationTicketNo: dto.citationTicketNo,
      },
    });

    return dto;
  }

  /**
   * Retrieves single apprehension by UUID.
   * @param {string} id - Apprehension UUID
   * @param {Object} actorUser
   */
  async getApprehensionById(id, actorUser) {
    if (!id || typeof id !== 'string') {
      const err = new Error('Apprehension ID is required');
      err.statusCode = 400;
      throw err;
    }

    const row = await apprehensionsRepository.getApprehensionById(id.trim());
    if (!row) {
      const err = new Error('Apprehension record not found');
      err.statusCode = 404;
      throw err;
    }

    const permissions = actorUser?.permissions || [];
    const hasGlobalView = permissions.includes('apprehensions.view') || permissions.includes('apprehensions.manage');

    if (!hasGlobalView && row.driver_id !== actorUser.id) {
      const err = new Error('Access denied: You are only authorized to view your own apprehension records');
      err.statusCode = 403;
      throw err;
    }

    return formatApprehensionRecord(row);
  }

  /**
   * Updates apprehension status (e.g. SETTLED, DISPUTED, CANCELLED).
   * @param {string} id - Apprehension UUID
   * @param {Object} actorUser - Acting supervisor/admin
   * @param {Object} payload - { status, notes }
   */
  async updateStatus(id, actorUser, payload = {}) {
    if (!id || typeof id !== 'string') {
      const err = new Error('Apprehension ID is required');
      err.statusCode = 400;
      throw err;
    }

    const existing = await apprehensionsRepository.getApprehensionById(id.trim());
    if (!existing) {
      const err = new Error('Apprehension record not found');
      err.statusCode = 404;
      throw err;
    }

    const validStatuses = ['RECORDED', 'SETTLED', 'DISPUTED', 'CANCELLED'];
    const newStatus = payload.status ? payload.status.trim().toUpperCase() : null;

    if (!newStatus || !validStatuses.includes(newStatus)) {
      const err = new Error(`Status must be one of: ${validStatuses.join(', ')}`);
      err.statusCode = 400;
      throw err;
    }

    const isSettling = newStatus === 'SETTLED';

    const updated = await apprehensionsRepository.updateStatus(id.trim(), {
      status: newStatus,
      settledBy: isSettling ? actorUser.id : null,
      settledAt: isSettling ? new Date().toISOString() : null,
      notes: payload.notes || null,
    });

    const fullRecord = await apprehensionsRepository.getApprehensionById(id.trim());
    const dto = formatApprehensionRecord(fullRecord);

    await historyService.log(EVENTS.APPREHENSION_STATUS_UPDATED, {
      actorUser,
      targetId: id.trim(),
      payload: {
        citationTicketNo: dto.citationTicketNo || id.trim(),
        status: newStatus,
      },
    });

    return dto;
  }

  /**
   * Retrieves paginated apprehensions with filtering.
   * Scopes to actorUser if lacking global view permission.
   *
   * @param {Object} actorUser
   * @param {Object} filters - { vehicleId, driverId, tripId, agency, status, startDate, endDate, search }
   * @param {Object|null} pagination
   */
  async getApprehensions(actorUser, filters = {}, pagination = null) {
    const permissions = actorUser?.permissions || [];
    const hasGlobalView = permissions.includes('apprehensions.view') || permissions.includes('apprehensions.manage');

    const effectiveFilters = { ...filters };

    // Scoped access: Driver only sees own records
    if (!hasGlobalView) {
      effectiveFilters.driverId = actorUser.id;
    }

    if (!pagination || !pagination.isPaginated) {
      const rows = await apprehensionsRepository.getApprehensions(effectiveFilters, null);
      return rows.map(formatApprehensionRecord);
    }

    const offset = calculateOffset(pagination.page, pagination.limit);
    const { rows, total } = await apprehensionsRepository.getApprehensions(effectiveFilters, {
      ...pagination,
      offset,
    });

    const items = rows.map(formatApprehensionRecord);
    const meta = buildPaginationMeta(total, pagination.page, pagination.limit);

    return {
      items,
      meta,
    };
  }
}

module.exports = new ApprehensionsService();
