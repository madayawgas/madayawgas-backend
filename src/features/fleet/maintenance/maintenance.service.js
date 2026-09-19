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
    const { truckId, result, findings, issueDetected, inspectionDate, allowDispatch } = payload;

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

    // Supervisor Dispatch Decision toggle (defaults to true)
    let shouldAllowDispatch = true;
    if (allowDispatch !== undefined && allowDispatch !== null) {
      shouldAllowDispatch = Boolean(allowDispatch);
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

    // Grounding Invariant:
    // - FAILED: ALWAYS grounded, regardless of allowDispatch.
    // - NEEDS_ATTENTION: Grounded ONLY IF allowDispatch === false.
    // - PASSED: Never grounded.
    const shouldGround = cleanResult === 'FAILED' || (cleanResult === 'NEEDS_ATTENTION' && !shouldAllowDispatch);

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

      // Automated or Supervisor-Initiated Grounding
      if (shouldGround) {
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
          allowDispatch: shouldAllowDispatch,
          previousStatus: truck.status,
          currentStatus: truckStatusAfter,
          isGrounded: shouldGround,
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
        allowDispatch: shouldAllowDispatch,
        inspectionDate: createdInspection.inspection_date,
      },
      truck: {
        id: truck.id,
        plateNumber: truck.plate_number,
        previousStatus: truck.status,
        currentStatus: truckStatusAfter,
        isGrounded: shouldGround,
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

  // ============================================================
  // WORK ORDERS & REPAIR LIFECYCLE OPERATIONS
  // ============================================================

  /**
   * Retrieves reference list of available maintenance types.
   */
  async getMaintenanceTypesList() {
    const rows = await maintenanceRepository.getMaintenanceTypes();
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
   * Creates a new vehicle work order.
   * If estimated cost >= ₱5,000.00 or marked for review, status is PENDING and creates an approval request.
   * Otherwise status is APPROVED (or SCHEDULED if scheduledDate is provided).
   * Automatically grounds the truck to UNDER_MAINTENANCE in an atomic transaction.
   */
  async createWorkOrder(actorUser, payload = {}) {
    const {
      truckId,
      maintenanceTypeId,
      inspectionId,
      incidentReportId,
      scheduledDate,
      shopName,
      estimatedCost,
      description,
      requiresApproval,
    } = payload;

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

    // 2. Validation: Maintenance Type ID
    if (maintenanceTypeId === undefined || maintenanceTypeId === null || maintenanceTypeId === '') {
      const err = new Error('Maintenance type ID is required');
      err.statusCode = 400;
      throw err;
    }
    const numMaintenanceTypeId = Number(maintenanceTypeId);
    if (isNaN(numMaintenanceTypeId) || !Number.isInteger(numMaintenanceTypeId) || numMaintenanceTypeId <= 0) {
      const err = new Error('Invalid maintenance type ID');
      err.statusCode = 400;
      throw err;
    }

    const maintenanceType = await maintenanceRepository.getMaintenanceTypeById(numMaintenanceTypeId);
    if (!maintenanceType) {
      const err = new Error('Invalid maintenance type ID');
      err.statusCode = 400;
      throw err;
    }

    // 3. Validation: Description
    if (!description || typeof description !== 'string' || description.trim().length === 0) {
      const err = new Error('Work order description is required');
      err.statusCode = 400;
      throw err;
    }
    const cleanDescription = description.trim();

    // 4. Optional: Inspection ID link
    let cleanInspectionId = null;
    if (inspectionId) {
      if (typeof inspectionId !== 'string' || inspectionId.trim().length === 0) {
        const err = new Error('Invalid inspection ID');
        err.statusCode = 400;
        throw err;
      }
      const inspection = await maintenanceRepository.getInspectionById(inspectionId.trim());
      if (!inspection) {
        const err = new Error('Referenced inspection not found');
        err.statusCode = 404;
        throw err;
      }
      cleanInspectionId = inspection.id;
    }

    // 5. Optional: Incident Report ID link
    let cleanIncidentReportId = null;
    if (incidentReportId) {
      if (typeof incidentReportId !== 'string' || incidentReportId.trim().length === 0) {
        const err = new Error('Invalid incident report ID');
        err.statusCode = 400;
        throw err;
      }
      const incident = await maintenanceRepository.getIncidentById(incidentReportId.trim());
      if (!incident) {
        const err = new Error('Referenced incident report not found');
        err.statusCode = 404;
        throw err;
      }
      cleanIncidentReportId = incident.id;
    }

    // 6. Optional: Scheduled Date
    let parsedScheduledDate = null;
    if (scheduledDate) {
      parsedScheduledDate = new Date(scheduledDate);
      if (isNaN(parsedScheduledDate.getTime())) {
        const err = new Error('Invalid scheduled date format');
        err.statusCode = 400;
        throw err;
      }
    }

    // 7. Optional: Estimated Cost
    let numEstimatedCost = 0.0;
    if (estimatedCost !== undefined && estimatedCost !== null && estimatedCost !== '') {
      numEstimatedCost = Number(estimatedCost);
      if (isNaN(numEstimatedCost) || numEstimatedCost < 0) {
        const err = new Error('Estimated cost must be a non-negative number');
        err.statusCode = 400;
        throw err;
      }
    }

    const cleanShopName = shopName && typeof shopName === 'string' ? shopName.trim() : null;

    // 8. Cost Approval Threshold & Status Determination
    const FINANCIAL_APPROVAL_THRESHOLD = 5000.0;
    const needsApproval =
      Boolean(requiresApproval) || numEstimatedCost >= FINANCIAL_APPROVAL_THRESHOLD;

    const initialStatus = needsApproval
      ? 'PENDING'
      : parsedScheduledDate
      ? 'SCHEDULED'
      : 'APPROVED';

    // 9. Atomic Database Transaction
    const client = await pool.connect();
    let createdOrder;
    let createdApproval = null;

    try {
      await client.query('BEGIN');

      createdOrder = await maintenanceRepository.insertWorkOrder(
        {
          truckId: truck.id,
          creatorId: actorUser?.id || null,
          maintenanceTypeId: maintenanceType.id,
          status: initialStatus,
          inspectionId: cleanInspectionId,
          incidentReportId: cleanIncidentReportId,
          scheduledDate: parsedScheduledDate ? parsedScheduledDate.toISOString() : null,
          shopName: cleanShopName,
          estimatedCost: numEstimatedCost,
          description: cleanDescription,
        },
        client
      );

      if (needsApproval) {
        createdApproval = await maintenanceRepository.insertApprovalRequest(
          {
            workOrderId: createdOrder.id,
            amountRequested: numEstimatedCost,
            remarks: 'Automated cost review trigger (>= ₱5,000.00)',
          },
          client
        );
      }

      // Ground truck to UNDER_MAINTENANCE if not already grounded
      if (truck.status !== 'UNDER_MAINTENANCE') {
        await maintenanceRepository.updateTruckStatus(
          {
            truckId: truck.id,
            status: 'UNDER_MAINTENANCE',
          },
          client
        );
      }

      await client.query('COMMIT');
    } catch (dbErr) {
      await client.query('ROLLBACK');
      throw dbErr;
    } finally {
      client.release();
    }

    // 10. History Audit Logging
    try {
      await historyService.log(EVENTS.MAINTENANCE_WORK_ORDER_CREATED, {
        actorUser,
        targetId: createdOrder.id,
        payload: {
          workOrderId: createdOrder.id,
          plateNumber: truck.plate_number,
        },
        metadata: {
          truckId: truck.id,
          maintenanceTypeId: maintenanceType.id,
          maintenanceTypeName: maintenanceType.type_name,
          estimatedCost: numEstimatedCost,
          status: initialStatus,
          needsApproval,
          shopName: cleanShopName,
        },
      });
    } catch (histErr) {
      console.error('Failed to emit history log for MAINTENANCE_WORK_ORDER_CREATED:', histErr);
    }

    // 11. Format and return DTO
    return {
      workOrder: {
        id: createdOrder.id,
        truckId: truck.id,
        plateNumber: truck.plate_number,
        truckModel: truck.model,
        creatorId: actorUser?.id || null,
        creatorName: actorUser ? `${actorUser.firstName} ${actorUser.lastName}`.trim() : null,
        maintenanceTypeId: maintenanceType.id,
        maintenanceTypeName: maintenanceType.type_name,
        status: createdOrder.status,
        inspectionId: createdOrder.inspection_id,
        incidentReportId: createdOrder.incident_report_id,
        requestDate: createdOrder.request_date,
        scheduledDate: createdOrder.scheduled_date,
        shopName: createdOrder.shop_name,
        estimatedCost: Number(createdOrder.estimated_cost),
        description: createdOrder.description,
        requiresApproval: needsApproval,
        createdAt: createdOrder.created_at,
        updatedAt: createdOrder.updated_at,
      },
      approvalRequest: createdApproval
        ? {
            id: createdApproval.id,
            workOrderId: createdOrder.id,
            amountRequested: Number(createdApproval.amount_requested),
            isApproved: null,
            status: 'PENDING_REVIEW',
            remarks: createdApproval.remarks,
            requestedDate: createdApproval.requested_date,
          }
        : null,
      truck: {
        id: truck.id,
        plateNumber: truck.plate_number,
        previousStatus: truck.status,
        currentStatus: 'UNDER_MAINTENANCE',
        isGrounded: true,
      },
    };
  }

  /**
   * Retrieves paginated work orders with filtering.
   */
  async getWorkOrders(queryParams = {}) {
    const page = Math.max(1, parseInt(queryParams.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(queryParams.limit) || 50));
    const offset = (page - 1) * limit;

    const filters = {
      truckId:
        queryParams.truckId && typeof queryParams.truckId === 'string'
          ? queryParams.truckId.trim()
          : null,
      status:
        queryParams.status && typeof queryParams.status === 'string'
          ? queryParams.status.trim().toUpperCase()
          : null,
      maintenanceTypeId: queryParams.maintenanceTypeId
        ? Number(queryParams.maintenanceTypeId)
        : null,
      search:
        queryParams.search && typeof queryParams.search === 'string'
          ? queryParams.search.trim()
          : null,
    };

    const [rows, total] = await Promise.all([
      maintenanceRepository.getWorkOrders(filters, { limit, offset }),
      maintenanceRepository.countWorkOrders(filters),
    ]);

    const workOrders = rows.map((r) => ({
      id: r.id,
      truckId: r.truck_id,
      plateNumber: r.plate_number,
      truckModel: r.truck_model,
      truckStatus: r.truck_status,
      creatorId: r.creator_id,
      creatorName:
        r.creator_first_name && r.creator_last_name
          ? `${r.creator_first_name} ${r.creator_last_name}`.trim()
          : r.creator_username || null,
      maintenanceTypeId: r.maintenance_type_id,
      maintenanceTypeName: r.maintenance_type_name,
      status: r.status,
      inspectionId: r.inspection_id,
      incidentReportId: r.incident_report_id,
      requestDate: r.request_date,
      scheduledDate: r.scheduled_date,
      shopName: r.shop_name,
      estimatedCost: Number(r.estimated_cost),
      description: r.description,
      requiresApproval: Boolean(r.approval_request_id),
      approvalStatus:
        r.approval_is_approved === true
          ? 'APPROVED'
          : r.approval_is_approved === false
          ? 'REJECTED'
          : r.approval_request_id
          ? 'PENDING'
          : 'NOT_REQUIRED',
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));

    return {
      count: workOrders.length,
      total,
      page,
      limit,
      workOrders,
    };
  }

  /**
   * Retrieves single work order by UUID with full joined context.
   */
  async getWorkOrderById(id) {
    if (!id || typeof id !== 'string') {
      const err = new Error('Work order ID is required');
      err.statusCode = 400;
      throw err;
    }

    const r = await maintenanceRepository.getWorkOrderById(id.trim());
    if (!r) {
      const err = new Error('Work order not found');
      err.statusCode = 404;
      throw err;
    }

    return {
      workOrder: {
        id: r.id,
        truckId: r.truck_id,
        plateNumber: r.plate_number,
        truckModel: r.truck_model,
        truckStatus: r.truck_status,
        currentOdometer: r.current_odometer,
        lastPmOdometer: r.last_pm_odometer,
        creatorId: r.creator_id,
        creatorName:
          r.creator_first_name && r.creator_last_name
            ? `${r.creator_first_name} ${r.creator_last_name}`.trim()
            : r.creator_username || null,
        maintenanceTypeId: r.maintenance_type_id,
        maintenanceTypeName: r.maintenance_type_name,
        status: r.status,
        inspectionId: r.inspection_id,
        incidentReportId: r.incident_report_id,
        requestDate: r.request_date,
        scheduledDate: r.scheduled_date,
        shopName: r.shop_name,
        estimatedCost: Number(r.estimated_cost),
        description: r.description,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
        approvalRequest: r.approval_request_id
          ? {
              id: r.approval_request_id,
              amountRequested: Number(r.approval_amount_requested),
              isApproved: r.approval_is_approved,
              status:
                r.approval_is_approved === true
                  ? 'APPROVED'
                  : r.approval_is_approved === false
                  ? 'REJECTED'
                  : 'PENDING',
              remarks: r.approval_remarks,
              requestedDate: r.approval_requested_date,
              decidedDate: r.approval_decided_date,
              deciderId: r.approval_decider_id,
              deciderName:
                r.decider_first_name && r.decider_last_name
                  ? `${r.decider_first_name} ${r.decider_last_name}`.trim()
                  : r.decider_username || null,
            }
          : null,
        maintenanceLog: r.maintenance_log_id
          ? {
              id: r.maintenance_log_id,
              officialReceiptNumber: r.official_receipt_number,
            }
          : null,
      },
    };
  }

  /**
   * Executive cost approval decision on PENDING work order.
   * Strictly restricted to Super Admin or Admin.
   */
  async decideApprovalRequest(actorUser, workOrderId, payload = {}) {
    // 1. Role Authority Gatekeeper
    const isAdmin =
      actorUser?.roleNames?.some((r) => ['Super Admin', 'Admin'].includes(r)) ||
      ['Super Admin', 'Admin'].includes(actorUser?.role) ||
      actorUser?.permissions?.includes('users.manage') ||
      actorUser?.permissions?.includes('*');

    if (!isAdmin) {
      const err = new Error('Only Super Admin or Admin can decide cost approval requests');
      err.statusCode = 403;
      throw err;
    }

    // 2. Validate Work Order ID
    if (!workOrderId || typeof workOrderId !== 'string') {
      const err = new Error('Work order ID is required');
      err.statusCode = 400;
      throw err;
    }

    const order = await maintenanceRepository.getWorkOrderById(workOrderId.trim());
    if (!order) {
      const err = new Error('Work order not found');
      err.statusCode = 404;
      throw err;
    }

    // 3. Work Order Status Check
    if (order.status !== 'PENDING') {
      const err = new Error(
        `Only work orders in PENDING status can be decided for cost approval (current: ${order.status})`
      );
      err.statusCode = 400;
      throw err;
    }

    // 4. Approval Request Check
    const approval = await maintenanceRepository.getApprovalRequestByWorkOrderId(order.id);
    if (!approval) {
      const err = new Error('No approval request found for this work order');
      err.statusCode = 400;
      throw err;
    }

    if (approval.is_approved !== null) {
      const err = new Error('Approval request has already been decided');
      err.statusCode = 400;
      throw err;
    }

    // 5. Validate Decision Input
    const { isApproved, remarks } = payload;
    if (typeof isApproved !== 'boolean') {
      const err = new Error('Approval decision (isApproved: true | false) is required');
      err.statusCode = 400;
      throw err;
    }

    const cleanRemarks = remarks && typeof remarks === 'string' ? remarks.trim() : null;

    // 6. Transition State
    const newStatus = isApproved
      ? order.scheduled_date
        ? 'SCHEDULED'
        : 'APPROVED'
      : 'CANCELLED';

    // 7. Atomic Transaction
    const client = await pool.connect();
    let updatedApproval;
    let updatedOrder;

    try {
      await client.query('BEGIN');

      updatedApproval = await maintenanceRepository.updateApprovalRequest(
        {
          workOrderId: order.id,
          deciderId: actorUser.id,
          isApproved,
          remarks: cleanRemarks,
        },
        client
      );

      updatedOrder = await maintenanceRepository.updateWorkOrderStatus(
        {
          id: order.id,
          status: newStatus,
        },
        client
      );

      await client.query('COMMIT');
    } catch (dbErr) {
      await client.query('ROLLBACK');
      throw dbErr;
    } finally {
      client.release();
    }

    // 8. History Audit Logging
    try {
      await historyService.log(EVENTS.MAINTENANCE_APPROVAL_DECIDED, {
        actorUser,
        targetId: order.id,
        payload: {
          workOrderId: order.id,
          decision: isApproved ? 'APPROVED' : 'REJECTED',
        },
        metadata: {
          workOrderId: order.id,
          truckId: order.truck_id,
          plateNumber: order.plate_number,
          isApproved,
          previousStatus: order.status,
          newStatus,
          remarks: cleanRemarks,
          amountRequested: Number(approval.amount_requested),
        },
      });
    } catch (histErr) {
      console.error('Failed to emit history log for MAINTENANCE_APPROVAL_DECIDED:', histErr);
    }

    // 9. Return DTO
    return {
      workOrder: {
        id: updatedOrder.id,
        truckId: order.truck_id,
        plateNumber: order.plate_number,
        status: updatedOrder.status,
        previousStatus: order.status,
        updatedAt: updatedOrder.updated_at,
      },
      approvalRequest: {
        id: updatedApproval.id,
        workOrderId: order.id,
        amountRequested: Number(updatedApproval.amount_requested),
        isApproved: updatedApproval.is_approved,
        status: isApproved ? 'APPROVED' : 'REJECTED',
        remarks: updatedApproval.remarks,
        decidedDate: updatedApproval.decided_date,
        deciderId: actorUser.id,
        deciderName: `${actorUser.firstName} ${actorUser.lastName}`.trim(),
      },
    };
  }

  /**
   * Advances repair execution state (e.g. APPROVED -> SCHEDULED -> IN_PROGRESS or CANCELLED).
   * Manual completion is rejected (must use finalizeMaintenanceLog).
   */
  async updateWorkOrderStatus(actorUser, workOrderId, payload = {}) {
    if (!workOrderId || typeof workOrderId !== 'string') {
      const err = new Error('Work order ID is required');
      err.statusCode = 400;
      throw err;
    }

    const order = await maintenanceRepository.getWorkOrderById(workOrderId.trim());
    if (!order) {
      const err = new Error('Work order not found');
      err.statusCode = 404;
      throw err;
    }

    const { status } = payload;
    if (!status || typeof status !== 'string') {
      const err = new Error('Status is required');
      err.statusCode = 400;
      throw err;
    }
    const targetStatus = status.trim().toUpperCase();

    // Guard against manual direct completion
    if (targetStatus === 'COMPLETED') {
      const err = new Error(
        'Work order can only be completed by finalizing the maintenance log via /api/fleet/maintenance/work-orders/:id/finalize'
      );
      err.statusCode = 400;
      throw err;
    }

    // Enforce terminal state invariants
    if (order.status === 'COMPLETED' || order.status === 'CANCELLED') {
      const err = new Error(`Cannot change status of a ${order.status.toLowerCase()} work order`);
      err.statusCode = 400;
      throw err;
    }

    // State machine allowed transitions
    const validTransitions = {
      PENDING: ['CANCELLED'],
      APPROVED: ['SCHEDULED', 'IN_PROGRESS', 'CANCELLED'],
      SCHEDULED: ['IN_PROGRESS', 'CANCELLED'],
      IN_PROGRESS: ['CANCELLED'],
    };

    const allowed = validTransitions[order.status] || [];
    if (!allowed.includes(targetStatus)) {
      const err = new Error(
        `Invalid status transition from ${order.status} to ${targetStatus}. Allowed transitions: ${allowed.join(', ') || 'None'}`
      );
      err.statusCode = 400;
      throw err;
    }

    // Atomic Transaction
    const client = await pool.connect();
    let updatedOrder;

    try {
      await client.query('BEGIN');

      updatedOrder = await maintenanceRepository.updateWorkOrderStatus(
        {
          id: order.id,
          status: targetStatus,
        },
        client
      );

      // Transitioning to IN_PROGRESS ensures truck is UNDER_MAINTENANCE
      if (targetStatus === 'IN_PROGRESS') {
        await maintenanceRepository.updateTruckStatus(
          {
            truckId: order.truck_id,
            status: 'UNDER_MAINTENANCE',
          },
          client
        );
      }

      await client.query('COMMIT');
    } catch (dbErr) {
      await client.query('ROLLBACK');
      throw dbErr;
    } finally {
      client.release();
    }

    return {
      workOrder: {
        id: updatedOrder.id,
        truckId: order.truck_id,
        plateNumber: order.plate_number,
        previousStatus: order.status,
        status: updatedOrder.status,
        updatedAt: updatedOrder.updated_at,
      },
    };
  }

  /**
   * Finalizes maintenance servicing, creates permanent maintenance_logs entry,
   * resets PM odometer delta if PREVENTIVE type, and releases truck back to ACTIVE.
   */
  async finalizeMaintenanceLog(actorUser, workOrderId, payload = {}) {
    if (!workOrderId || typeof workOrderId !== 'string') {
      const err = new Error('Work order ID is required');
      err.statusCode = 400;
      throw err;
    }

    const order = await maintenanceRepository.getWorkOrderById(workOrderId.trim());
    if (!order) {
      const err = new Error('Work order not found');
      err.statusCode = 404;
      throw err;
    }

    // Validate work order status
    if (order.status === 'PENDING') {
      const err = new Error('Cannot finalize work order that is pending cost approval');
      err.statusCode = 400;
      throw err;
    }

    if (order.status === 'COMPLETED') {
      const err = new Error('Work order is already completed and finalized');
      err.statusCode = 400;
      throw err;
    }

    if (order.status === 'CANCELLED') {
      const err = new Error('Cannot finalize a cancelled work order');
      err.statusCode = 400;
      throw err;
    }

    // Check if log already exists
    const existingLog = await maintenanceRepository.getMaintenanceLogByWorkOrderId(order.id);
    if (existingLog) {
      const err = new Error('A maintenance log has already been finalized for this work order');
      err.statusCode = 400;
      throw err;
    }

    const {
      officialReceiptNumber,
      severity,
      dateStarted,
      dateResolved,
      partsCost = 0.0,
      laborCost = 0.0,
      downtimeDays,
      odometerAtService,
    } = payload;

    // 1. Validation: Official Receipt Number
    if (!officialReceiptNumber || typeof officialReceiptNumber !== 'string' || officialReceiptNumber.trim().length === 0) {
      const err = new Error('Official receipt number is required');
      err.statusCode = 400;
      throw err;
    }
    const cleanReceiptNumber = officialReceiptNumber.trim();

    const receiptExists = await maintenanceRepository.checkReceiptNumberExists(cleanReceiptNumber);
    if (receiptExists) {
      const err = new Error(
        `Official receipt number '${cleanReceiptNumber}' has already been registered in maintenance logs`
      );
      err.statusCode = 409;
      throw err;
    }

    // 2. Validation: Severity
    const validSeverities = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
    if (!severity || typeof severity !== 'string' || !validSeverities.includes(severity.trim().toUpperCase())) {
      const err = new Error(`Severity must be one of: ${validSeverities.join(', ')}`);
      err.statusCode = 400;
      throw err;
    }
    const cleanSeverity = severity.trim().toUpperCase();

    // 3. Validation: Dates
    if (!dateStarted) {
      const err = new Error('Date started is required');
      err.statusCode = 400;
      throw err;
    }
    const parsedDateStarted = new Date(dateStarted);
    if (isNaN(parsedDateStarted.getTime())) {
      const err = new Error('Invalid date started format');
      err.statusCode = 400;
      throw err;
    }

    if (!dateResolved) {
      const err = new Error('Date resolved is required');
      err.statusCode = 400;
      throw err;
    }
    const parsedDateResolved = new Date(dateResolved);
    if (isNaN(parsedDateResolved.getTime())) {
      const err = new Error('Invalid date resolved format');
      err.statusCode = 400;
      throw err;
    }

    if (parsedDateResolved < parsedDateStarted) {
      const err = new Error('Date resolved cannot be earlier than date started');
      err.statusCode = 400;
      throw err;
    }

    // 4. Validation: Costs
    const numPartsCost = Number(partsCost) || 0.0;
    if (isNaN(numPartsCost) || numPartsCost < 0) {
      const err = new Error('Parts cost must be a non-negative number');
      err.statusCode = 400;
      throw err;
    }

    const numLaborCost = Number(laborCost) || 0.0;
    if (isNaN(numLaborCost) || numLaborCost < 0) {
      const err = new Error('Labor cost must be a non-negative number');
      err.statusCode = 400;
      throw err;
    }

    // 5. Downtime Days calculation or validation
    let numDowntimeDays = 0;
    if (downtimeDays !== undefined && downtimeDays !== null && downtimeDays !== '') {
      numDowntimeDays = Number(downtimeDays);
      if (isNaN(numDowntimeDays) || !Number.isInteger(numDowntimeDays) || numDowntimeDays < 0) {
        const err = new Error('Downtime days must be a non-negative integer');
        err.statusCode = 400;
        throw err;
      }
    } else {
      const diffMs = parsedDateResolved.getTime() - parsedDateStarted.getTime();
      numDowntimeDays = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
    }

    // 6. Validation: Odometer at Service
    if (odometerAtService === undefined || odometerAtService === null || odometerAtService === '') {
      const err = new Error('Odometer at service is required');
      err.statusCode = 400;
      throw err;
    }
    const numOdometerAtService = Number(odometerAtService);
    if (isNaN(numOdometerAtService) || !Number.isInteger(numOdometerAtService) || numOdometerAtService < 0) {
      const err = new Error('Odometer at service must be a non-negative integer');
      err.statusCode = 400;
      throw err;
    }

    const isPreventive = order.maintenance_type_name === 'PREVENTIVE';

    // 7. Atomic Database Transaction
    const client = await pool.connect();
    let createdLog;

    try {
      await client.query('BEGIN');

      createdLog = await maintenanceRepository.insertMaintenanceLog(
        {
          workOrderId: order.id,
          maintenanceTypeId: order.maintenance_type_id,
          severity: cleanSeverity,
          dateStarted: parsedDateStarted.toISOString(),
          dateResolved: parsedDateResolved.toISOString(),
          partsCost: numPartsCost,
          laborCost: numLaborCost,
          downtimeDays: numDowntimeDays,
          odometerAtService: numOdometerAtService,
          officialReceiptNumber: cleanReceiptNumber,
        },
        client
      );

      // Transition work order status to COMPLETED
      await maintenanceRepository.updateWorkOrderStatus(
        {
          id: order.id,
          status: 'COMPLETED',
        },
        client
      );

      // Reset PM odometer baseline if PREVENTIVE maintenance
      if (isPreventive) {
        await maintenanceRepository.resetTruckPmOdometer(
          {
            truckId: order.truck_id,
            serviceOdometer: numOdometerAtService,
          },
          client
        );
      } else if (numOdometerAtService > order.current_odometer) {
        // Advance current odometer if higher
        await client.query(
          'UPDATE trucks SET current_odometer = $1, updated_at = NOW() WHERE id = $2',
          [numOdometerAtService, order.truck_id]
        );
      }

      // Operational Release: Truck status returns to ACTIVE (driver assignment preserved)
      await maintenanceRepository.updateTruckStatus(
        {
          truckId: order.truck_id,
          status: 'ACTIVE',
        },
        client
      );

      await client.query('COMMIT');
    } catch (dbErr) {
      await client.query('ROLLBACK');
      throw dbErr;
    } finally {
      client.release();
    }

    // 8. History Audit Logging
    try {
      await historyService.log(EVENTS.MAINTENANCE_LOG_FINALIZED, {
        actorUser,
        targetId: createdLog.id,
        payload: {
          workOrderId: order.id,
          receiptNumber: cleanReceiptNumber,
        },
        metadata: {
          workOrderId: order.id,
          truckId: order.truck_id,
          plateNumber: order.plate_number,
          maintenanceType: order.maintenance_type_name,
          partsCost: numPartsCost,
          laborCost: numLaborCost,
          totalCost: numPartsCost + numLaborCost,
          downtimeDays: numDowntimeDays,
          odometerAtService: numOdometerAtService,
          officialReceiptNumber: cleanReceiptNumber,
          isPmReset: isPreventive,
        },
      });
    } catch (histErr) {
      console.error('Failed to emit history log for MAINTENANCE_LOG_FINALIZED:', histErr);
    }

    // 9. Return Formatted DTO
    return {
      maintenanceLog: {
        id: createdLog.id,
        workOrderId: order.id,
        maintenanceTypeId: order.maintenance_type_id,
        maintenanceTypeName: order.maintenance_type_name,
        severity: createdLog.severity,
        dateStarted: createdLog.date_started,
        dateResolved: createdLog.date_resolved,
        partsCost: Number(createdLog.parts_cost),
        laborCost: Number(createdLog.labor_cost),
        totalCost: Number(createdLog.parts_cost) + Number(createdLog.labor_cost),
        downtimeDays: createdLog.downtime_days,
        odometerAtService: createdLog.odometer_at_service,
        officialReceiptNumber: createdLog.official_receipt_number,
        createdAt: createdLog.created_at,
      },
      workOrder: {
        id: order.id,
        status: 'COMPLETED',
        shopName: order.shop_name,
        description: order.description,
      },
      truck: {
        id: order.truck_id,
        plateNumber: order.plate_number,
        status: 'ACTIVE',
        currentOdometer: Math.max(order.current_odometer, numOdometerAtService),
        lastPmOdometer: isPreventive ? numOdometerAtService : order.last_pm_odometer,
        isPmReset: isPreventive,
      },
    };
  }
  /**
   * Retrieves paginated historical maintenance logs with filtering.
   */
  async getMaintenanceLogs(queryParams = {}) {
    const page = Math.max(1, parseInt(queryParams.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(queryParams.limit) || 50));
    const offset = (page - 1) * limit;

    const filters = {
      truckId:
        queryParams.truckId && typeof queryParams.truckId === 'string'
          ? queryParams.truckId.trim()
          : null,
      maintenanceTypeId: queryParams.maintenanceTypeId
        ? Number(queryParams.maintenanceTypeId)
        : null,
      startDate: queryParams.startDate || null,
      endDate: queryParams.endDate || null,
      search:
        queryParams.search && typeof queryParams.search === 'string'
          ? queryParams.search.trim()
          : null,
    };

    const [rows, total] = await Promise.all([
      maintenanceRepository.getMaintenanceLogs(filters, { limit, offset }),
      maintenanceRepository.countMaintenanceLogs(filters),
    ]);

    const logs = rows.map((r) => ({
      id: r.id,
      workOrderId: r.work_order_id,
      truckId: r.truck_id,
      plateNumber: r.plate_number,
      maintenanceTypeId: r.maintenance_type_id,
      maintenanceTypeName: r.maintenance_type_name,
      severity: r.severity,
      dateStarted: r.date_started,
      dateResolved: r.date_resolved,
      partsCost: Number(r.parts_cost),
      laborCost: Number(r.labor_cost),
      totalCost: Number(r.total_cost),
      downtimeDays: r.downtime_days,
      odometerAtService: r.odometer_at_service,
      officialReceiptNumber: r.official_receipt_number,
      createdAt: r.created_at,
      truck: {
        id: r.truck_id,
        plateNumber: r.plate_number,
        model: r.truck_model,
        status: r.truck_status,
      },
      workOrder: {
        shopName: r.shop_name,
        description: r.work_order_description,
      },
    }));

    return {
      count: logs.length,
      total,
      page,
      limit,
      logs,
    };
  }

  // ============================================================
  // FLEET ANALYTICS
  // ============================================================

  /**
   * Retrieves recurring vehicle defects and incident analytics.
   * Groups reported mid-route incidents by truck and defect category within a time window.
   *
   * @param {Object} [queryParams] - { truckId, days, minOccurrences }
   * @returns {Promise<Object>} Aggregated recurring defects
   */
  async getRecurringIssuesAnalytics(queryParams = {}) {
    const days = Math.max(1, Math.min(3650, parseInt(queryParams.days) || 90));
    const minOccurrences = Math.max(1, parseInt(queryParams.minOccurrences) || 2);
    const truckId = queryParams.truckId && typeof queryParams.truckId === 'string' && queryParams.truckId.trim().length > 0
      ? queryParams.truckId.trim()
      : null;

    if (truckId) {
      const truck = await maintenanceRepository.getTruckOdometerState(truckId);
      if (!truck) {
        const err = new Error('Vehicle not found');
        err.statusCode = 404;
        throw err;
      }
    }

    const rows = await maintenanceRepository.getRecurringIssues({
      truckId,
      days,
      minOccurrences,
    });

    const recurringIssues = rows.map((r) => ({
      truckId: r.truck_id,
      plateNumber: r.plate_number,
      truckModel: r.truck_model,
      incidentTypeId: r.incident_type_id,
      incidentTypeName: r.incident_type_name,
      occurrenceCount: Number(r.occurrence_count),
      latestSeverity: r.latest_severity,
      latestIncidentDate: r.latest_incident_date,
      descriptions: Array.isArray(r.descriptions) ? r.descriptions : [],
    }));

    return {
      days,
      minOccurrences,
      count: recurringIssues.length,
      recurringIssues,
    };
  }
}

module.exports = new MaintenanceService();
