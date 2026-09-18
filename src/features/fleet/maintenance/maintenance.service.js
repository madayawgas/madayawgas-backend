const { pool } = require('../../../../database/connection');
const maintenanceRepository = require('./maintenance.repository');
const { historyService, EVENTS } = require('../../../features/history');

/**
 * Maintenance Service
 * Implements business logic for post-dispatch single-point odometer recording,
 * monotonic validation, 5,000-km preventive maintenance threshold evaluations,
 * and centralized audit event emissions.
 */
class MaintenanceService {
  /**
   * Records a single-point post-dispatch return odometer reading for a vehicle asset.
   * Enforces monotonic consistency (reading >= current_odometer) and updates running status.
   * Calculates distance driven this trip and distance accumulated toward 5,000-km PM threshold.
   *
   * @param {Object} actorUser - Authenticated user issuing the request (Logistics Supervisor or Admin)
   * @param {Object} payload - { truckId, odometerReading, source, notes }
   * @returns {Promise<Object>} Processed odometer update and PM status metadata
   */
  async logOdometerReading(actorUser, payload = {}) {
    const { truckId, odometerReading, source, notes } = payload;

    // 1. Validation: Required fields
    if (!truckId || typeof truckId !== 'string' || truckId.trim().length === 0) {
      const err = new Error('Truck ID is required');
      err.statusCode = 400;
      throw err;
    }

    if (odometerReading === undefined || odometerReading === null || odometerReading === '') {
      const err = new Error('Odometer reading is required');
      err.statusCode = 400;
      throw err;
    }

    const numOdometer = Number(odometerReading);
    if (isNaN(numOdometer) || !Number.isInteger(numOdometer) || numOdometer < 0) {
      const err = new Error('Odometer reading must be a non-negative integer');
      err.statusCode = 400;
      throw err;
    }

    // 2. Fetch existing truck state
    const truck = await maintenanceRepository.getTruckOdometerState(truckId.trim());
    if (!truck) {
      const err = new Error('Vehicle not found');
      err.statusCode = 404;
      throw err;
    }

    // 3. Monotonic Integrity Rule: New reading MUST be >= current registered reading
    if (numOdometer < truck.current_odometer) {
      const err = new Error(
        `New odometer reading (${numOdometer} km) cannot be less than the current odometer reading (${truck.current_odometer} km).`
      );
      err.statusCode = 400;
      throw err;
    }

    // 4. Distance-Based 5,000-km PM Math & Threshold Evaluation
    const previousOdometer = truck.current_odometer;
    const distanceDrivenThisTrip = numOdometer - previousOdometer;
    const distanceSinceLastPm = numOdometer - truck.last_pm_odometer;
    const isPmDue = distanceSinceLastPm >= 5000;
    const remainingKmBeforePm = Math.max(0, 5000 - distanceSinceLastPm);

    const logSource = source && typeof source === 'string' && source.trim().length > 0
      ? source.trim().toUpperCase()
      : 'POST_DISPATCH_RETURN';

    const logNotes = notes && typeof notes === 'string' ? notes.trim() : null;

    // 5. Transaction Execution (Insert Log + Update Truck Current Odometer)
    const client = await pool.connect();
    let createdLog;

    try {
      await client.query('BEGIN');

      createdLog = await maintenanceRepository.insertOdometerLog(
        {
          truckId: truck.id,
          odometerReading: numOdometer,
          loggedBy: actorUser?.id || null,
          source: logSource,
          notes: logNotes,
        },
        client
      );

      await maintenanceRepository.updateTruckOdometer(
        {
          truckId: truck.id,
          currentOdometer: numOdometer,
        },
        client
      );

      await client.query('COMMIT');
    } catch (txError) {
      await client.query('ROLLBACK');
      throw txError;
    } finally {
      client.release();
    }

    // 6. Centralized Event History Logging
    await historyService.log(EVENTS.MAINTENANCE_ODOMETER_LOGGED, {
      actorUser,
      targetId: truck.id,
      payload: {
        plateNumber: truck.plate_number,
        odometerKm: numOdometer,
      },
      metadata: {
        previousOdometer,
        distanceDrivenThisTrip,
        distanceSinceLastPm,
        isPmDue,
        remainingKmBeforePm,
        source: logSource,
      },
    });

    // 7. Return Standardized DTO
    return {
      logId: createdLog.id,
      truckId: truck.id,
      plateNumber: truck.plate_number,
      currentOdometer: numOdometer,
      previousOdometer,
      distanceDrivenThisTrip,
      lastPmOdometer: truck.last_pm_odometer,
      distanceSinceLastPm,
      isPmDue,
      remainingKmBeforePm,
      loggedAt: createdLog.logged_at,
    };
  }

  /**
   * Retrieves paginated odometer history logs for a specific vehicle.
   *
   * @param {string} truckId - Truck UUID
   * @param {Object} [queryParams] - { page, limit }
   * @returns {Promise<Object>} Paginated logs with vehicle metadata
   */
  async getTruckOdometerHistory(truckId, queryParams = {}) {
    if (!truckId || typeof truckId !== 'string' || truckId.trim().length === 0) {
      const err = new Error('Truck ID is required');
      err.statusCode = 400;
      throw err;
    }

    const truck = await maintenanceRepository.getTruckOdometerState(truckId.trim());
    if (!truck) {
      const err = new Error('Vehicle not found');
      err.statusCode = 404;
      throw err;
    }

    const page = Math.max(1, parseInt(queryParams.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(queryParams.limit, 10) || 50));
    const offset = (page - 1) * limit;

    const [logs, total] = await Promise.all([
      maintenanceRepository.getOdometerHistory(truck.id, { limit, offset }),
      maintenanceRepository.countOdometerLogs(truck.id),
    ]);

    return {
      truckId: truck.id,
      plateNumber: truck.plate_number,
      model: truck.model,
      currentOdometer: truck.current_odometer,
      lastPmOdometer: truck.last_pm_odometer,
      count: logs.length,
      total,
      page,
      limit,
      logs: logs.map((row) => ({
        id: row.id,
        truckId: row.truck_id,
        odometerReading: row.odometer_reading,
        loggedBy: row.logged_by,
        loggedByName:
          [row.logged_by_first_name, row.logged_by_last_name].filter(Boolean).join(' ') ||
          row.logged_by_username ||
          'System',
        source: row.source,
        notes: row.notes,
        loggedAt: row.logged_at,
      })),
    };
  }

  /**
   * Aggregates fleet-wide preventive maintenance overview and threshold metrics.
   *
   * @param {Object} [queryParams] - { status, search, isPmDue }
   * @returns {Promise<Object>} Aggregated overview and truck array
   */
  async getFleetPmOverview(queryParams = {}) {
    const rows = await maintenanceRepository.getFleetPmStatusOverview(queryParams);

    const trucks = rows.map((r) => ({
      id: r.id,
      plateNumber: r.plate_number,
      model: r.model,
      yearModel: r.year_model,
      status: r.status,
      driverId: r.driver_id,
      driverName: [r.driver_first_name, r.driver_last_name].filter(Boolean).join(' ') || null,
      currentOdometer: r.current_odometer,
      lastPmOdometer: r.last_pm_odometer,
      distanceSinceLastPm: Number(r.distance_since_pm),
      isPmDue: Boolean(r.is_pm_due),
      remainingKmBeforePm: Number(r.remaining_km_before_pm),
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));

    const totalCount = trucks.length;
    const pmDueCount = trucks.filter((t) => t.isPmDue).length;
    const operationalCount = trucks.filter((t) => t.status === 'ACTIVE').length;
    const operationalPmDueCount = trucks.filter((t) => t.status === 'ACTIVE' && t.isPmDue).length;

    return {
      count: totalCount,
      summary: {
        totalVehicles: totalCount,
        operationalVehicles: operationalCount,
        pmDueTotal: pmDueCount,
        operationalPmDue: operationalPmDueCount,
      },
      trucks,
    };
  }

  // ============================================================
  // SAFETY INSPECTION OPERATIONS (No Checklists - Issue Reporting Only)
  // ============================================================

  /**
   * Records a safety inspection for a fleet vehicle asset.
   * If result is 'FAILED', automatically grounds the vehicle (status -> 'UNDER_MAINTENANCE')
   * within an atomic database transaction.
   *
   * @param {Object} actorUser - Authenticated supervisor/admin recording the inspection
   * @param {Object} payload - { truckId, result, findings, issueDetected, inspectionDate }
   * @returns {Promise<Object>} Inspection record and truck operational status update
   */
  async recordInspection(actorUser, payload = {}) {
    const { truckId, result, findings, issueDetected, inspectionDate } = payload;

    // 1. Validation: Truck ID
    if (!truckId || typeof truckId !== 'string' || truckId.trim().length === 0) {
      const err = new Error('Truck ID is required');
      err.statusCode = 400;
      throw err;
    }

    // 2. Fetch existing truck state
    const truck = await maintenanceRepository.getTruckOdometerState(truckId.trim());
    if (!truck) {
      const err = new Error('Vehicle not found');
      err.statusCode = 404;
      throw err;
    }

    // 3. Validation: Result enum
    const validResults = ['PASSED', 'NEEDS_ATTENTION', 'FAILED'];
    if (!result || typeof result !== 'string' || !validResults.includes(result.trim().toUpperCase())) {
      const err = new Error(`Inspection result must be one of: ${validResults.join(', ')}`);
      err.statusCode = 400;
      throw err;
    }
    const cleanResult = result.trim().toUpperCase();

    // 4. Validation: Findings (Mandatory descriptive findings)
    if (!findings || typeof findings !== 'string' || findings.trim().length === 0) {
      const err = new Error('Inspection findings are required');
      err.statusCode = 400;
      throw err;
    }
    const cleanFindings = findings.trim();

    // 5. Default issue_detected based on result if not explicitly provided
    let cleanIssueDetected;
    if (issueDetected !== undefined && issueDetected !== null) {
      cleanIssueDetected = Boolean(issueDetected);
    } else {
      cleanIssueDetected = cleanResult === 'FAILED' || cleanResult === 'NEEDS_ATTENTION';
    }

    let parsedDate = null;
    if (inspectionDate) {
      parsedDate = new Date(inspectionDate);
      if (isNaN(parsedDate.getTime())) {
        const err = new Error('Invalid inspection date format');
        err.statusCode = 400;
        throw err;
      }
    }

    // 6. Atomic Database Transaction
    const client = await pool.connect();
    let createdInspection;
    let truckStatusAfter = truck.status;

    try {
      await client.query('BEGIN');

      createdInspection = await maintenanceRepository.insertInspection(
        {
          truckId: truck.id,
          inspectorId: actorUser?.id || null,
          result: cleanResult,
          findings: cleanFindings,
          issueDetected: cleanIssueDetected,
          inspectionDate: parsedDate ? parsedDate.toISOString() : null,
        },
        client
      );

      // Automated Grounding on Inspection Failure
      if (cleanResult === 'FAILED') {
        await maintenanceRepository.updateTruckStatus(
          {
            truckId: truck.id,
            status: 'UNDER_MAINTENANCE',
          },
          client
        );
        truckStatusAfter = 'UNDER_MAINTENANCE';
      }

      await client.query('COMMIT');
    } catch (dbErr) {
      await client.query('ROLLBACK');
      throw dbErr;
    } finally {
      client.release();
    }

    // 7. Centralized History Audit Logging
    try {
      await historyService.log(EVENTS.MAINTENANCE_INSPECTION_RECORDED, {
        actorUser,
        targetId: createdInspection.id,
        payload: {
          plateNumber: truck.plate_number,
          result: createdInspection.result,
        },
        metadata: {
          truckId: truck.id,
          findings: createdInspection.findings,
          issueDetected: createdInspection.issue_detected,
          previousStatus: truck.status,
          currentStatus: truckStatusAfter,
          isGrounded: cleanResult === 'FAILED',
        },
      });
    } catch (histErr) {
      console.error('Failed to emit history log for MAINTENANCE_INSPECTION_RECORDED:', histErr);
    }

    // 8. Return Formatted DTO
    return {
      inspection: {
        id: createdInspection.id,
        truckId: truck.id,
        plateNumber: truck.plate_number,
        inspectorId: actorUser?.id || null,
        inspectorName: actorUser ? `${actorUser.firstName} ${actorUser.lastName}`.trim() : null,
        result: createdInspection.result,
        findings: createdInspection.findings,
        issueDetected: createdInspection.issue_detected,
        inspectionDate: createdInspection.inspection_date,
      },
      truck: {
        id: truck.id,
        plateNumber: truck.plate_number,
        previousStatus: truck.status,
        currentStatus: truckStatusAfter,
        isGrounded: cleanResult === 'FAILED',
      },
    };
  }

  /**
   * Retrieves paginated safety inspections for a specific vehicle asset.
   * @param {string} truckId - Truck UUID
   * @param {Object} [queryParams] - Query parameters { page, limit, result }
   * @returns {Promise<Object>} Paginated inspections list
   */
  async getTruckInspections(truckId, queryParams = {}) {
    if (!truckId || typeof truckId !== 'string' || truckId.trim().length === 0) {
      const err = new Error('Truck ID is required');
      err.statusCode = 400;
      throw err;
    }

    const truck = await maintenanceRepository.getTruckOdometerState(truckId.trim());
    if (!truck) {
      const err = new Error('Vehicle not found');
      err.statusCode = 404;
      throw err;
    }

    const page = Math.max(1, parseInt(queryParams.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(queryParams.limit) || 50));
    const offset = (page - 1) * limit;

    let filterResult = null;
    if (queryParams.result && typeof queryParams.result === 'string') {
      const upper = queryParams.result.trim().toUpperCase();
      if (['PASSED', 'NEEDS_ATTENTION', 'FAILED'].includes(upper)) {
        filterResult = upper;
      }
    }

    const [rows, total] = await Promise.all([
      maintenanceRepository.getInspectionsByTruck(truck.id, { limit, offset, result: filterResult }),
      maintenanceRepository.countInspectionsByTruck(truck.id, { result: filterResult }),
    ]);

    const inspections = rows.map((r) => ({
      id: r.id,
      truckId: r.truck_id,
      plateNumber: r.plate_number,
      truckModel: r.truck_model,
      inspectorId: r.inspector_id,
      inspectorName: r.inspector_first_name && r.inspector_last_name
        ? `${r.inspector_first_name} ${r.inspector_last_name}`.trim()
        : r.inspector_username || null,
      inspectorUsername: r.inspector_username || null,
      result: r.result,
      findings: r.findings,
      issueDetected: r.issue_detected,
      inspectionDate: r.inspection_date,
    }));

    return {
      truckId: truck.id,
      plateNumber: truck.plate_number,
      count: inspections.length,
      total,
      page,
      limit,
      inspections,
    };
  }

  /**
   * Retrieves single inspection record by UUID.
   * @param {string} id - Inspection UUID
   * @returns {Promise<Object>} Detailed inspection record
   */
  async getInspectionById(id) {
    if (!id || typeof id !== 'string') {
      const err = new Error('Inspection ID is required');
      err.statusCode = 400;
      throw err;
    }

    const r = await maintenanceRepository.getInspectionById(id.trim());
    if (!r) {
      const err = new Error('Inspection not found');
      err.statusCode = 404;
      throw err;
    }

    return {
      inspection: {
        id: r.id,
        truckId: r.truck_id,
        plateNumber: r.plate_number,
        truckModel: r.truck_model,
        truckStatus: r.truck_status,
        inspectorId: r.inspector_id,
        inspectorName: r.inspector_first_name && r.inspector_last_name
          ? `${r.inspector_first_name} ${r.inspector_last_name}`.trim()
          : r.inspector_username || null,
        inspectorUsername: r.inspector_username || null,
        result: r.result,
        findings: r.findings,
        issueDetected: r.issue_detected,
        inspectionDate: r.inspection_date,
      },
    };
  }

  // ============================================================
  // INCIDENT REPORTING OPERATIONS
  // ============================================================

  /**
   * Retrieves all available incident classification categories.
   * @returns {Promise<Object>} Available incident types
   */
  async getIncidentTypesList() {
    const rows = await maintenanceRepository.getIncidentTypes();
    return {
      count: rows.length,
      types: rows.map((t) => ({
        id: t.id,
        typeName: t.type_name,
        createdAt: t.created_at,
      })),
    };
  }

  /**
   * Records a mid-route breakdown or roadside incident report.
   * If severity is 'CRITICAL', automatically grounds the vehicle (status -> 'UNDER_MAINTENANCE')
   * within an atomic database transaction.
   *
   * @param {Object} actorUser - Authenticated user submitting the incident report
   * @param {Object} payload - { truckId, incidentTypeId, severity, incidentLocation, description, reportDate }
   * @returns {Promise<Object>} Created incident report and truck status update
   */
  async reportIncident(actorUser, payload = {}) {
    const { truckId, incidentTypeId, severity, incidentLocation, description, reportDate } = payload;

    // 1. Validation: Truck ID
    if (!truckId || typeof truckId !== 'string' || truckId.trim().length === 0) {
      const err = new Error('Truck ID is required');
      err.statusCode = 400;
      throw err;
    }

    const truck = await maintenanceRepository.getTruckOdometerState(truckId.trim());
    if (!truck) {
      const err = new Error('Vehicle not found');
      err.statusCode = 404;
      throw err;
    }

    // 2. Validation: Incident Type ID
    if (incidentTypeId === undefined || incidentTypeId === null || incidentTypeId === '') {
      const err = new Error('Incident type ID is required');
      err.statusCode = 400;
      throw err;
    }
    const numIncidentTypeId = Number(incidentTypeId);
    if (isNaN(numIncidentTypeId) || !Number.isInteger(numIncidentTypeId) || numIncidentTypeId <= 0) {
      const err = new Error('Invalid incident type ID');
      err.statusCode = 400;
      throw err;
    }

    const incidentType = await maintenanceRepository.getIncidentTypeById(numIncidentTypeId);
    if (!incidentType) {
      const err = new Error('Invalid incident type ID');
      err.statusCode = 400;
      throw err;
    }

    // 3. Validation: Severity
    const validSeverities = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
    if (!severity || typeof severity !== 'string' || !validSeverities.includes(severity.trim().toUpperCase())) {
      const err = new Error(`Severity must be one of: ${validSeverities.join(', ')}`);
      err.statusCode = 400;
      throw err;
    }
    const cleanSeverity = severity.trim().toUpperCase();

    // 4. Validation: Description
    if (!description || typeof description !== 'string' || description.trim().length === 0) {
      const err = new Error('Incident description is required');
      err.statusCode = 400;
      throw err;
    }
    const cleanDescription = description.trim();

    let parsedDate = null;
    if (reportDate) {
      parsedDate = new Date(reportDate);
      if (isNaN(parsedDate.getTime())) {
        const err = new Error('Invalid report date format');
        err.statusCode = 400;
        throw err;
      }
    }

    const cleanLocation = incidentLocation && typeof incidentLocation === 'string'
      ? incidentLocation.trim()
      : null;

    // 5. Atomic Database Transaction
    const client = await pool.connect();
    let createdIncident;
    let truckStatusAfter = truck.status;

    try {
      await client.query('BEGIN');

      createdIncident = await maintenanceRepository.insertIncidentReport(
        {
          truckId: truck.id,
          reporterId: actorUser?.id || null,
          incidentTypeId: incidentType.id,
          severity: cleanSeverity,
          incidentLocation: cleanLocation,
          description: cleanDescription,
          reportDate: parsedDate ? parsedDate.toISOString() : null,
        },
        client
      );

      // Automated Grounding on Critical Incidents
      if (cleanSeverity === 'CRITICAL') {
        await maintenanceRepository.updateTruckStatus(
          {
            truckId: truck.id,
            status: 'UNDER_MAINTENANCE',
          },
          client
        );
        truckStatusAfter = 'UNDER_MAINTENANCE';
      }

      await client.query('COMMIT');
    } catch (dbErr) {
      await client.query('ROLLBACK');
      throw dbErr;
    } finally {
      client.release();
    }

    // 6. Centralized History Audit Logging
    try {
      await historyService.log(EVENTS.MAINTENANCE_INCIDENT_REPORTED, {
        actorUser,
        targetId: createdIncident.id,
        payload: {
          plateNumber: truck.plate_number,
          severity: createdIncident.severity,
          description: createdIncident.description,
        },
        metadata: {
          truckId: truck.id,
          incidentTypeId: incidentType.id,
          incidentTypeName: incidentType.type_name,
          location: createdIncident.incident_location,
          previousStatus: truck.status,
          currentStatus: truckStatusAfter,
          isGrounded: cleanSeverity === 'CRITICAL',
        },
      });
    } catch (histErr) {
      console.error('Failed to emit history log for MAINTENANCE_INCIDENT_REPORTED:', histErr);
    }

    // 7. Return Formatted DTO
    return {
      incident: {
        id: createdIncident.id,
        truckId: truck.id,
        plateNumber: truck.plate_number,
        reporterId: actorUser?.id || null,
        reporterName: actorUser ? `${actorUser.firstName} ${actorUser.lastName}`.trim() : null,
        incidentTypeId: createdIncident.incident_type_id,
        incidentTypeName: incidentType.type_name,
        severity: createdIncident.severity,
        incidentLocation: createdIncident.incident_location,
        description: createdIncident.description,
        reportDate: createdIncident.report_date,
      },
      truck: {
        id: truck.id,
        plateNumber: truck.plate_number,
        previousStatus: truck.status,
        currentStatus: truckStatusAfter,
        isGrounded: cleanSeverity === 'CRITICAL',
      },
    };
  }

  /**
   * Retrieves fleet-wide incident reports with filter and pagination support.
   * @param {Object} queryParams - Query parameters { page, limit, truckId, severity, incidentTypeId, startDate, endDate, search }
   * @returns {Promise<Object>} Paginated fleet incident reports
   */
  async getIncidents(queryParams = {}) {
    const page = Math.max(1, parseInt(queryParams.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(queryParams.limit) || 50));
    const offset = (page - 1) * limit;

    const filters = {
      truckId: queryParams.truckId && typeof queryParams.truckId === 'string' ? queryParams.truckId.trim() : null,
      severity: queryParams.severity && typeof queryParams.severity === 'string' ? queryParams.severity.trim().toUpperCase() : null,
      incidentTypeId: queryParams.incidentTypeId ? Number(queryParams.incidentTypeId) : null,
      startDate: queryParams.startDate || null,
      endDate: queryParams.endDate || null,
      search: queryParams.search && typeof queryParams.search === 'string' ? queryParams.search.trim() : null,
    };

    const [rows, total] = await Promise.all([
      maintenanceRepository.getAllIncidents(filters, { limit, offset }),
      maintenanceRepository.countAllIncidents(filters),
    ]);

    const incidents = rows.map((r) => ({
      id: r.id,
      truckId: r.truck_id,
      plateNumber: r.plate_number,
      truckModel: r.truck_model,
      truckStatus: r.truck_status,
      reporterId: r.reporter_id,
      reporterName: r.reporter_first_name && r.reporter_last_name
        ? `${r.reporter_first_name} ${r.reporter_last_name}`.trim()
        : r.reporter_username || null,
      reporterUsername: r.reporter_username || null,
      incidentTypeId: r.incident_type_id,
      incidentTypeName: r.incident_type_name,
      severity: r.severity,
      incidentLocation: r.incident_location,
      description: r.description,
      reportDate: r.report_date,
    }));

    return {
      count: incidents.length,
      total,
      page,
      limit,
      incidents,
    };
  }

  /**
   * Retrieves paginated incidents for a specific vehicle asset.
   * @param {string} truckId - Truck UUID
   * @param {Object} queryParams - Query parameters { page, limit }
   * @returns {Promise<Object>} Paginated incidents for truck
   */
  async getTruckIncidents(truckId, queryParams = {}) {
    if (!truckId || typeof truckId !== 'string' || truckId.trim().length === 0) {
      const err = new Error('Truck ID is required');
      err.statusCode = 400;
      throw err;
    }

    const truck = await maintenanceRepository.getTruckOdometerState(truckId.trim());
    if (!truck) {
      const err = new Error('Vehicle not found');
      err.statusCode = 404;
      throw err;
    }

    const page = Math.max(1, parseInt(queryParams.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(queryParams.limit) || 50));
    const offset = (page - 1) * limit;

    const [rows, total] = await Promise.all([
      maintenanceRepository.getIncidentsByTruck(truck.id, { limit, offset }),
      maintenanceRepository.countIncidentsByTruck(truck.id),
    ]);

    const incidents = rows.map((r) => ({
      id: r.id,
      truckId: r.truck_id,
      plateNumber: r.plate_number,
      truckModel: r.truck_model,
      truckStatus: r.truck_status,
      reporterId: r.reporter_id,
      reporterName: r.reporter_first_name && r.reporter_last_name
        ? `${r.reporter_first_name} ${r.reporter_last_name}`.trim()
        : r.reporter_username || null,
      reporterUsername: r.reporter_username || null,
      incidentTypeId: r.incident_type_id,
      incidentTypeName: r.incident_type_name,
      severity: r.severity,
      incidentLocation: r.incident_location,
      description: r.description,
      reportDate: r.report_date,
    }));

    return {
      truckId: truck.id,
      plateNumber: truck.plate_number,
      count: incidents.length,
      total,
      page,
      limit,
      incidents,
    };
  }

  /**
   * Retrieves single incident report by UUID.
   * @param {string} id - Incident UUID
   * @returns {Promise<Object>} Detailed incident report
   */
  async getIncidentById(id) {
    if (!id || typeof id !== 'string') {
      const err = new Error('Incident ID is required');
      err.statusCode = 400;
      throw err;
    }

    const r = await maintenanceRepository.getIncidentById(id.trim());
    if (!r) {
      const err = new Error('Incident report not found');
      err.statusCode = 404;
      throw err;
    }

    return {
      incident: {
        id: r.id,
        truckId: r.truck_id,
        plateNumber: r.plate_number,
        truckModel: r.truck_model,
        truckStatus: r.truck_status,
        reporterId: r.reporter_id,
        reporterName: r.reporter_first_name && r.reporter_last_name
          ? `${r.reporter_first_name} ${r.reporter_last_name}`.trim()
          : r.reporter_username || null,
        reporterUsername: r.reporter_username || null,
        incidentTypeId: r.incident_type_id,
        incidentTypeName: r.incident_type_name,
        severity: r.severity,
        incidentLocation: r.incident_location,
        description: r.description,
        reportDate: r.report_date,
      },
    };
  }
}

module.exports = new MaintenanceService();
