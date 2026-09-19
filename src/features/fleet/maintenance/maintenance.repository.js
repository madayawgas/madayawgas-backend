const { query, pool } = require('../../../../database/connection');

/**
 * Maintenance Repository
 * Data access layer for vehicle odometer logging, truck mileage tracking,
 * and preventive maintenance status queries.
 */
class MaintenanceRepository {
  /**
   * Inserts an odometer log entry into vehicle_odometer_logs.
   * Supports execution within an optional transaction client.
   * @param {Object} data - { truckId, odometerReading, loggedBy, source, notes }
   * @param {Object} [client] - Optional pg transaction client
   * @returns {Promise<Object>} Created odometer log row
   */
  async insertOdometerLog({ truckId, odometerReading, loggedBy, source, notes }, client = null) {
    const db = client || { query };
    const sql = `
      INSERT INTO vehicle_odometer_logs (
        truck_id,
        odometer_reading,
        logged_by,
        source,
        notes,
        logged_at
      )
      VALUES ($1, $2, $3, $4, $5, NOW())
      RETURNING 
        id,
        truck_id,
        odometer_reading,
        logged_by,
        source,
        notes,
        logged_at
    `;

    const result = await db.query(sql, [
      truckId,
      odometerReading,
      loggedBy || null,
      source || 'POST_DISPATCH_RETURN',
      notes || null,
    ]);

    return result.rows[0];
  }

  /**
   * Updates a truck's current registered odometer.
   * @param {Object} params - { truckId, currentOdometer }
   * @param {Object} [client] - Optional pg transaction client
   * @returns {Promise<Object>} Updated truck row
   */
  async updateTruckOdometer({ truckId, currentOdometer }, client = null) {
    const db = client || { query };
    const sql = `
      UPDATE trucks
      SET 
        current_odometer = $1,
        updated_at = NOW()
      WHERE id = $2
      RETURNING 
        id,
        plate_number,
        model,
        year_model,
        current_odometer,
        last_pm_odometer,
        status,
        updated_at
    `;

    const result = await db.query(sql, [currentOdometer, truckId]);
    return result.rows[0] || null;
  }

  /**
   * Fetches current odometer and PM baseline state for a given truck.
   * @param {string} truckId - Truck UUID
   * @param {Object} [client] - Optional pg transaction client
   * @returns {Promise<Object|null>} Truck state or null if not found
   */
  async getTruckOdometerState(truckId, client = null) {
    const db = client || { query };
    const sql = `
      SELECT 
        t.id,
        t.plate_number,
        t.model,
        t.year_model,
        t.current_odometer,
        t.last_pm_odometer,
        t.status,
        t.driver_id,
        u.first_name AS driver_first_name,
        u.last_name AS driver_last_name
      FROM trucks t
      LEFT JOIN users u ON t.driver_id = u.id
      WHERE t.id = $1
    `;

    const result = await db.query(sql, [truckId]);
    return result.rows[0] || null;
  }

  /**
   * Retrieves paginated odometer history logs for a specific truck.
   * @param {string} truckId - Truck UUID
   * @param {Object} pagination - { limit, offset }
   * @returns {Promise<Array<Object>>} Array of odometer log records
   */
  async getOdometerHistory(truckId, { limit = 50, offset = 0 } = {}) {
    const sql = `
      SELECT 
        vol.id,
        vol.truck_id,
        vol.odometer_reading,
        vol.logged_by,
        vol.source,
        vol.notes,
        vol.logged_at,
        u.username AS logged_by_username,
        u.first_name AS logged_by_first_name,
        u.last_name AS logged_by_last_name
      FROM vehicle_odometer_logs vol
      LEFT JOIN users u ON vol.logged_by = u.id
      WHERE vol.truck_id = $1
      ORDER BY vol.logged_at DESC
      LIMIT $2 OFFSET $3
    `;

    const result = await query(sql, [truckId, limit, offset]);
    return result.rows;
  }

  /**
   * Counts total odometer logs recorded for a specific truck.
   * @param {string} truckId - Truck UUID
   * @returns {Promise<number>} Total count of logs
   */
  async countOdometerLogs(truckId) {
    const sql = `
      SELECT COUNT(*)::int AS count
      FROM vehicle_odometer_logs
      WHERE truck_id = $1
    `;

    const result = await query(sql, [truckId]);
    return result.rows[0]?.count || 0;
  }

  /**
   * Retrieves fleet trucks with calculated preventive maintenance (PM) health status.
   * Calculates distance since last PM service and flags vehicles due for 5,000-km maintenance.
   * @param {Object} [filters] - Optional filters: { status, search, isPmDue }
   * @returns {Promise<Array<Object>>} Array of trucks with PM calculations
   */
  async getFleetPmStatusOverview(filters = {}) {
    const { status, search, isPmDue } = filters;
    const conditions = [];
    const params = [];
    let paramIndex = 1;

    if (status) {
      conditions.push(`t.status = $${paramIndex++}`);
      params.push(status.toUpperCase());
    }

    if (search) {
      conditions.push(`(t.plate_number ILIKE $${paramIndex} OR t.model ILIKE $${paramIndex})`);
      params.push(`%${search}%`);
      paramIndex++;
    }

    if (isPmDue !== undefined && isPmDue !== null && isPmDue !== '') {
      const pmBool = isPmDue === true || isPmDue === 'true';
      if (pmBool) {
        conditions.push(`(t.current_odometer - t.last_pm_odometer) >= 5000`);
      } else {
        conditions.push(`(t.current_odometer - t.last_pm_odometer) < 5000`);
      }
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const sql = `
      SELECT 
        t.id,
        t.plate_number,
        t.model,
        t.year_model,
        t.status,
        t.current_odometer,
        t.last_pm_odometer,
        (t.current_odometer - t.last_pm_odometer) AS distance_since_pm,
        CASE 
          WHEN (t.current_odometer - t.last_pm_odometer) >= 5000 THEN TRUE 
          ELSE FALSE 
        END AS is_pm_due,
        GREATEST(0, 5000 - (t.current_odometer - t.last_pm_odometer)) AS remaining_km_before_pm,
        t.driver_id,
        u.first_name AS driver_first_name,
        u.last_name AS driver_last_name,
        t.created_at,
        t.updated_at
      FROM trucks t
      LEFT JOIN users u ON t.driver_id = u.id
      ${whereClause}
      ORDER BY 
        (t.current_odometer - t.last_pm_odometer) DESC,
        t.plate_number ASC
    `;

    const result = await query(sql, params);
    return result.rows;
  }

  /**
   * Updates a truck's operational status.
   * Supports execution within an optional transaction client.
   * @param {Object} params - { truckId, status }
   * @param {Object} [client] - Optional pg transaction client
   * @returns {Promise<Object>} Updated truck record
   */
  async updateTruckStatus({ truckId, status }, client = null) {
    const db = client || { query };
    const sql = `
      UPDATE trucks
      SET 
        status = $1,
        updated_at = NOW()
      WHERE id = $2
      RETURNING 
        id,
        plate_number,
        model,
        year_model,
        current_odometer,
        last_pm_odometer,
        status,
        updated_at
    `;

    const result = await db.query(sql, [status, truckId]);
    return result.rows[0] || null;
  }

  // ============================================================
  // SAFETY INSPECTION QUERIES (Issue-Reporting Only - No Checklist)
  // ============================================================

  /**
   * Inserts an inspection record into vehicle_inspections.
   * Supports execution within an optional transaction client.
   * @param {Object} data - { truckId, inspectorId, result, findings, issueDetected, inspectionDate }
   * @param {Object} [client] - Optional pg transaction client
   * @returns {Promise<Object>} Created inspection record
   */
  async insertInspection({ truckId, inspectorId, result, findings, issueDetected, inspectionDate }, client = null) {
    const db = client || { query };
    const sql = `
      INSERT INTO vehicle_inspections (
        truck_id,
        inspector_id,
        result,
        findings,
        issue_detected,
        inspection_date
      )
      VALUES ($1, $2, $3, $4, $5, COALESCE($6, NOW()))
      RETURNING 
        id,
        truck_id,
        inspector_id,
        result,
        findings,
        issue_detected,
        inspection_date
    `;

    const res = await db.query(sql, [
      truckId,
      inspectorId || null,
      result,
      findings,
      issueDetected !== undefined ? issueDetected : true,
      inspectionDate || null,
    ]);

    return res.rows[0];
  }

  /**
   * Retrieves paginated inspections for a specific truck with inspector details.
   * @param {string} truckId - Truck UUID
   * @param {Object} options - { limit, offset, result }
   * @returns {Promise<Array<Object>>} Array of inspection records
   */
  async getInspectionsByTruck(truckId, { limit = 50, offset = 0, result = null } = {}) {
    const conditions = ['vi.truck_id = $1'];
    const params = [truckId];
    let paramIndex = 2;

    if (result) {
      conditions.push(`vi.result = $${paramIndex++}`);
      params.push(result.toUpperCase());
    }

    params.push(limit, offset);

    const sql = `
      SELECT 
        vi.id,
        vi.truck_id,
        vi.inspector_id,
        vi.result,
        vi.findings,
        vi.issue_detected,
        vi.inspection_date,
        u.username AS inspector_username,
        u.first_name AS inspector_first_name,
        u.last_name AS inspector_last_name,
        t.plate_number,
        t.model AS truck_model,
        t.status AS truck_status
      FROM vehicle_inspections vi
      LEFT JOIN users u ON vi.inspector_id = u.id
      JOIN trucks t ON vi.truck_id = t.id
      WHERE ${conditions.join(' AND ')}
      ORDER BY vi.inspection_date DESC
      LIMIT $${paramIndex++} OFFSET $${paramIndex}
    `;

    const res = await query(sql, params);
    return res.rows;
  }

  /**
   * Counts total inspections for a specific truck.
   * @param {string} truckId - Truck UUID
   * @param {Object} [filters] - { result }
   * @returns {Promise<number>} Total inspection count
   */
  async countInspectionsByTruck(truckId, { result = null } = {}) {
    const conditions = ['truck_id = $1'];
    const params = [truckId];

    if (result) {
      conditions.push('result = $2');
      params.push(result.toUpperCase());
    }

    const sql = `
      SELECT COUNT(*)::int AS count
      FROM vehicle_inspections
      WHERE ${conditions.join(' AND ')}
    `;

    const res = await query(sql, params);
    return res.rows[0]?.count || 0;
  }

  /**
   * Retrieves single inspection record by UUID with truck and inspector details.
   * @param {string} id - Inspection UUID
   * @returns {Promise<Object|null>} Inspection record or null
   */
  async getInspectionById(id) {
    const sql = `
      SELECT 
        vi.id,
        vi.truck_id,
        vi.inspector_id,
        vi.result,
        vi.findings,
        vi.issue_detected,
        vi.inspection_date,
        u.username AS inspector_username,
        u.first_name AS inspector_first_name,
        u.last_name AS inspector_last_name,
        t.plate_number,
        t.model AS truck_model,
        t.status AS truck_status
      FROM vehicle_inspections vi
      LEFT JOIN users u ON vi.inspector_id = u.id
      JOIN trucks t ON vi.truck_id = t.id
      WHERE vi.id = $1
    `;

    const res = await query(sql, [id]);
    return res.rows[0] || null;
  }

  // ============================================================
  // INCIDENT REPORTING QUERIES
  // ============================================================

  /**
   * Retrieves all available incident classification types.
   * @returns {Promise<Array<Object>>} Array of incident types { id, type_name }
   */
  async getIncidentTypes() {
    const sql = `
      SELECT id, type_name, created_at
      FROM incident_types
      ORDER BY id ASC
    `;
    const res = await query(sql);
    return res.rows;
  }

  /**
   * Retrieves a single incident type by ID.
   * @param {number} id - Incident Type ID
   * @returns {Promise<Object|null>} Incident type row or null
   */
  async getIncidentTypeById(id) {
    const sql = `
      SELECT id, type_name, created_at
      FROM incident_types
      WHERE id = $1
    `;
    const res = await query(sql, [id]);
    return res.rows[0] || null;
  }

  /**
   * Inserts an incident report into incident_reports.
   * Supports execution within an optional transaction client.
   * @param {Object} data - { truckId, reporterId, incidentTypeId, severity, incidentLocation, description, reportDate }
   * @param {Object} [client] - Optional pg transaction client
   * @returns {Promise<Object>} Created incident report row
   */
  async insertIncidentReport({ truckId, reporterId, incidentTypeId, severity, incidentLocation, description, reportDate }, client = null) {
    const db = client || { query };
    const sql = `
      INSERT INTO incident_reports (
        truck_id,
        reporter_id,
        incident_type_id,
        severity,
        incident_location,
        description,
        report_date
      )
      VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, NOW()))
      RETURNING 
        id,
        truck_id,
        reporter_id,
        incident_type_id,
        severity,
        incident_location,
        description,
        report_date
    `;

    const res = await db.query(sql, [
      truckId,
      reporterId || null,
      incidentTypeId,
      severity,
      incidentLocation || null,
      description,
      reportDate || null,
    ]);

    return res.rows[0];
  }

  /**
   * Retrieves paginated incidents for a specific truck.
   * @param {string} truckId - Truck UUID
   * @param {Object} pagination - { limit, offset }
   * @returns {Promise<Array<Object>>} Array of incident report records
   */
  async getIncidentsByTruck(truckId, { limit = 50, offset = 0 } = {}) {
    const sql = `
      SELECT 
        ir.id,
        ir.truck_id,
        ir.reporter_id,
        ir.incident_type_id,
        it.type_name AS incident_type_name,
        ir.severity,
        ir.incident_location,
        ir.description,
        ir.report_date,
        u.username AS reporter_username,
        u.first_name AS reporter_first_name,
        u.last_name AS reporter_last_name,
        t.plate_number,
        t.model AS truck_model,
        t.status AS truck_status
      FROM incident_reports ir
      JOIN incident_types it ON ir.incident_type_id = it.id
      LEFT JOIN users u ON ir.reporter_id = u.id
      JOIN trucks t ON ir.truck_id = t.id
      WHERE ir.truck_id = $1
      ORDER BY ir.report_date DESC
      LIMIT $2 OFFSET $3
    `;

    const res = await query(sql, [truckId, limit, offset]);
    return res.rows;
  }

  /**
   * Counts total incident reports for a specific truck.
   * @param {string} truckId - Truck UUID
   * @returns {Promise<number>} Total incident count
   */
  async countIncidentsByTruck(truckId) {
    const sql = `
      SELECT COUNT(*)::int AS count
      FROM incident_reports
      WHERE truck_id = $1
    `;

    const res = await query(sql, [truckId]);
    return res.rows[0]?.count || 0;
  }

  /**
   * Retrieves fleet-wide incident reports with optional filtering.
   * @param {Object} filters - { truckId, severity, incidentTypeId, startDate, endDate, search }
   * @param {Object} pagination - { limit, offset }
   * @returns {Promise<Array<Object>>} Filtered incident records
   */
  async getAllIncidents(filters = {}, { limit = 50, offset = 0 } = {}) {
    const { truckId, severity, incidentTypeId, startDate, endDate, search } = filters;
    const conditions = [];
    const params = [];
    let paramIndex = 1;

    if (truckId) {
      conditions.push(`ir.truck_id = $${paramIndex++}`);
      params.push(truckId);
    }

    if (severity) {
      conditions.push(`ir.severity = $${paramIndex++}`);
      params.push(severity.toUpperCase());
    }

    if (incidentTypeId) {
      conditions.push(`ir.incident_type_id = $${paramIndex++}`);
      params.push(Number(incidentTypeId));
    }

    if (startDate) {
      conditions.push(`ir.report_date >= $${paramIndex++}`);
      params.push(startDate);
    }

    if (endDate) {
      conditions.push(`ir.report_date <= $${paramIndex++}`);
      params.push(endDate);
    }

    if (search) {
      conditions.push(`(
        t.plate_number ILIKE $${paramIndex} 
        OR t.model ILIKE $${paramIndex}
        OR ir.description ILIKE $${paramIndex}
        OR ir.incident_location ILIKE $${paramIndex}
      )`);
      params.push(`%${search}%`);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    params.push(limit, offset);

    const sql = `
      SELECT 
        ir.id,
        ir.truck_id,
        ir.reporter_id,
        ir.incident_type_id,
        it.type_name AS incident_type_name,
        ir.severity,
        ir.incident_location,
        ir.description,
        ir.report_date,
        u.username AS reporter_username,
        u.first_name AS reporter_first_name,
        u.last_name AS reporter_last_name,
        t.plate_number,
        t.model AS truck_model,
        t.status AS truck_status
      FROM incident_reports ir
      JOIN incident_types it ON ir.incident_type_id = it.id
      LEFT JOIN users u ON ir.reporter_id = u.id
      JOIN trucks t ON ir.truck_id = t.id
      ${whereClause}
      ORDER BY ir.report_date DESC
      LIMIT $${paramIndex++} OFFSET $${paramIndex}
    `;

    const res = await query(sql, params);
    return res.rows;
  }

  /**
   * Counts total fleet-wide incident reports matching filters.
   * @param {Object} filters - { truckId, severity, incidentTypeId, startDate, endDate, search }
   * @returns {Promise<number>} Total count of matching incidents
   */
  async countAllIncidents(filters = {}) {
    const { truckId, severity, incidentTypeId, startDate, endDate, search } = filters;
    const conditions = [];
    const params = [];
    let paramIndex = 1;

    if (truckId) {
      conditions.push(`ir.truck_id = $${paramIndex++}`);
      params.push(truckId);
    }

    if (severity) {
      conditions.push(`ir.severity = $${paramIndex++}`);
      params.push(severity.toUpperCase());
    }

    if (incidentTypeId) {
      conditions.push(`ir.incident_type_id = $${paramIndex++}`);
      params.push(Number(incidentTypeId));
    }

    if (startDate) {
      conditions.push(`ir.report_date >= $${paramIndex++}`);
      params.push(startDate);
    }

    if (endDate) {
      conditions.push(`ir.report_date <= $${paramIndex++}`);
      params.push(endDate);
    }

    if (search) {
      conditions.push(`(
        t.plate_number ILIKE $${paramIndex} 
        OR t.model ILIKE $${paramIndex}
        OR ir.description ILIKE $${paramIndex}
        OR ir.incident_location ILIKE $${paramIndex}
      )`);
      params.push(`%${search}%`);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const sql = `
      SELECT COUNT(*)::int AS count
      FROM incident_reports ir
      JOIN incident_types it ON ir.incident_type_id = it.id
      JOIN trucks t ON ir.truck_id = t.id
      ${whereClause}
    `;

    const res = await query(sql, params);
    return res.rows[0]?.count || 0;
  }

  /**
   * Retrieves single incident report by UUID with joined details.
   * @param {string} id - Incident Report UUID
   * @returns {Promise<Object|null>} Incident report row or null
   */
  async getIncidentById(id) {
    const sql = `
      SELECT 
        ir.id,
        ir.truck_id,
        ir.reporter_id,
        ir.incident_type_id,
        it.type_name AS incident_type_name,
        ir.severity,
        ir.incident_location,
        ir.description,
        ir.report_date,
        u.username AS reporter_username,
        u.first_name AS reporter_first_name,
        u.last_name AS reporter_last_name,
        t.plate_number,
        t.model AS truck_model,
        t.status AS truck_status
      FROM incident_reports ir
      JOIN incident_types it ON ir.incident_type_id = it.id
      LEFT JOIN users u ON ir.reporter_id = u.id
      JOIN trucks t ON ir.truck_id = t.id
      WHERE ir.id = $1
    `;

    const res = await query(sql, [id]);
    return res.rows[0] || null;
  }

  // ============================================================
  // WORK ORDERS & REPAIR LIFECYCLE QUERIES
  // ============================================================

  /**
   * Retrieves all available maintenance types (e.g. PREVENTIVE, CORRECTIVE).
   * @returns {Promise<Array<Object>>}
   */
  async getMaintenanceTypes() {
    const sql = `
      SELECT id, type_name, created_at
      FROM maintenance_types
      ORDER BY id ASC
    `;
    const res = await query(sql);
    return res.rows;
  }

  /**
   * Retrieves single maintenance type by ID.
   * @param {number} id
   * @returns {Promise<Object|null>}
   */
  async getMaintenanceTypeById(id) {
    const sql = `
      SELECT id, type_name, created_at
      FROM maintenance_types
      WHERE id = $1
    `;
    const res = await query(sql, [id]);
    return res.rows[0] || null;
  }

  /**
   * Inserts a new work order record.
   * Supports transactional execution.
   */
  async insertWorkOrder(
    {
      truckId,
      creatorId,
      maintenanceTypeId,
      status = 'PENDING',
      inspectionId = null,
      incidentReportId = null,
      scheduledDate = null,
      shopName = null,
      estimatedCost = 0.0,
      description,
    },
    client = null
  ) {
    const db = client || { query };
    const sql = `
      INSERT INTO work_orders (
        truck_id,
        creator_id,
        maintenance_type_id,
        status,
        inspection_id,
        incident_report_id,
        scheduled_date,
        shop_name,
        estimated_cost,
        description
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING 
        id,
        truck_id,
        creator_id,
        maintenance_type_id,
        status,
        inspection_id,
        incident_report_id,
        request_date,
        scheduled_date,
        shop_name,
        estimated_cost,
        description,
        created_at,
        updated_at
    `;
    const res = await db.query(sql, [
      truckId,
      creatorId || null,
      maintenanceTypeId,
      status,
      inspectionId || null,
      incidentReportId || null,
      scheduledDate || null,
      shopName || null,
      estimatedCost,
      description,
    ]);
    return res.rows[0];
  }

  /**
   * Retrieves single work order by UUID with joined truck, type, and approval details.
   */
  async getWorkOrderById(id, client = null) {
    const db = client || { query };
    const sql = `
      SELECT 
        wo.id,
        wo.truck_id,
        wo.creator_id,
        wo.maintenance_type_id,
        mt.type_name AS maintenance_type_name,
        wo.status,
        wo.inspection_id,
        wo.incident_report_id,
        wo.request_date,
        wo.scheduled_date,
        wo.shop_name,
        wo.estimated_cost,
        wo.description,
        wo.created_at,
        wo.updated_at,
        t.plate_number,
        t.model AS truck_model,
        t.status AS truck_status,
        t.current_odometer,
        t.last_pm_odometer,
        u.username AS creator_username,
        u.first_name AS creator_first_name,
        u.last_name AS creator_last_name,
        ar.id AS approval_request_id,
        ar.amount_requested AS approval_amount_requested,
        ar.is_approved AS approval_is_approved,
        ar.remarks AS approval_remarks,
        ar.requested_date AS approval_requested_date,
        ar.decided_date AS approval_decided_date,
        ar.decider_id AS approval_decider_id,
        du.username AS decider_username,
        du.first_name AS decider_first_name,
        du.last_name AS decider_last_name,
        ml.id AS maintenance_log_id,
        ml.official_receipt_number
      FROM work_orders wo
      JOIN trucks t ON wo.truck_id = t.id
      JOIN maintenance_types mt ON wo.maintenance_type_id = mt.id
      LEFT JOIN users u ON wo.creator_id = u.id
      LEFT JOIN approval_requests ar ON wo.id = ar.work_order_id
      LEFT JOIN users du ON ar.decider_id = du.id
      LEFT JOIN maintenance_logs ml ON wo.id = ml.work_order_id
      WHERE wo.id = $1
    `;
    const res = await db.query(sql, [id]);
    return res.rows[0] || null;
  }

  /**
   * Retrieves paginated work orders with filtering.
   */
  async getWorkOrders(filters = {}, { limit = 50, offset = 0 } = {}) {
    const conditions = [];
    const params = [];
    let paramIndex = 1;

    if (filters.truckId) {
      conditions.push(`wo.truck_id = $${paramIndex++}`);
      params.push(filters.truckId);
    }

    if (filters.status) {
      conditions.push(`wo.status = $${paramIndex++}`);
      params.push(filters.status.toUpperCase());
    }

    if (filters.maintenanceTypeId) {
      conditions.push(`wo.maintenance_type_id = $${paramIndex++}`);
      params.push(filters.maintenanceTypeId);
    }

    if (filters.search) {
      conditions.push(
        `(t.plate_number ILIKE $${paramIndex} OR wo.description ILIKE $${paramIndex} OR wo.shop_name ILIKE $${paramIndex})`
      );
      params.push(`%${filters.search}%`);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    params.push(limit, offset);

    const sql = `
      SELECT 
        wo.id,
        wo.truck_id,
        wo.creator_id,
        wo.maintenance_type_id,
        mt.type_name AS maintenance_type_name,
        wo.status,
        wo.inspection_id,
        wo.incident_report_id,
        wo.request_date,
        wo.scheduled_date,
        wo.shop_name,
        wo.estimated_cost,
        wo.description,
        wo.created_at,
        wo.updated_at,
        t.plate_number,
        t.model AS truck_model,
        t.status AS truck_status,
        u.username AS creator_username,
        u.first_name AS creator_first_name,
        u.last_name AS creator_last_name,
        ar.id AS approval_request_id,
        ar.is_approved AS approval_is_approved
      FROM work_orders wo
      JOIN trucks t ON wo.truck_id = t.id
      JOIN maintenance_types mt ON wo.maintenance_type_id = mt.id
      LEFT JOIN users u ON wo.creator_id = u.id
      LEFT JOIN approval_requests ar ON wo.id = ar.work_order_id
      ${whereClause}
      ORDER BY wo.created_at DESC
      LIMIT $${paramIndex++} OFFSET $${paramIndex}
    `;

    const res = await query(sql, params);
    return res.rows;
  }

  /**
   * Counts total work orders matching filters.
   */
  async countWorkOrders(filters = {}) {
    const conditions = [];
    const params = [];
    let paramIndex = 1;

    if (filters.truckId) {
      conditions.push(`wo.truck_id = $${paramIndex++}`);
      params.push(filters.truckId);
    }

    if (filters.status) {
      conditions.push(`wo.status = $${paramIndex++}`);
      params.push(filters.status.toUpperCase());
    }

    if (filters.maintenanceTypeId) {
      conditions.push(`wo.maintenance_type_id = $${paramIndex++}`);
      params.push(filters.maintenanceTypeId);
    }

    if (filters.search) {
      conditions.push(
        `(t.plate_number ILIKE $${paramIndex} OR wo.description ILIKE $${paramIndex} OR wo.shop_name ILIKE $${paramIndex})`
      );
      params.push(`%${filters.search}%`);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const sql = `
      SELECT COUNT(*)::int AS count
      FROM work_orders wo
      JOIN trucks t ON wo.truck_id = t.id
      ${whereClause}
    `;

    const res = await query(sql, params);
    return res.rows[0]?.count || 0;
  }

  /**
   * Updates work order status.
   */
  async updateWorkOrderStatus({ id, status }, client = null) {
    const db = client || { query };
    const sql = `
      UPDATE work_orders
      SET 
        status = $1,
        updated_at = NOW()
      WHERE id = $2
      RETURNING *
    `;
    const res = await db.query(sql, [status, id]);
    return res.rows[0] || null;
  }

  // ============================================================
  // COST APPROVAL REQUEST QUERIES
  // ============================================================

  /**
   * Inserts an approval request row for a work order.
   */
  async insertApprovalRequest({ workOrderId, amountRequested, remarks = null }, client = null) {
    const db = client || { query };
    const sql = `
      INSERT INTO approval_requests (
        work_order_id,
        amount_requested,
        remarks
      )
      VALUES ($1, $2, $3)
      RETURNING *
    `;
    const res = await db.query(sql, [workOrderId, amountRequested, remarks]);
    return res.rows[0];
  }

  /**
   * Updates approval request decision.
   */
  async updateApprovalRequest({ workOrderId, deciderId, isApproved, remarks = null }, client = null) {
    const db = client || { query };
    const sql = `
      UPDATE approval_requests
      SET 
        decider_id = $1,
        is_approved = $2,
        remarks = $3,
        decided_date = NOW()
      WHERE work_order_id = $4
      RETURNING *
    `;
    const res = await db.query(sql, [deciderId, isApproved, remarks, workOrderId]);
    return res.rows[0] || null;
  }

  /**
   * Retrieves approval request by work order ID.
   */
  async getApprovalRequestByWorkOrderId(workOrderId, client = null) {
    const db = client || { query };
    const sql = `
      SELECT 
        ar.*,
        u.username AS decider_username,
        u.first_name AS decider_first_name,
        u.last_name AS decider_last_name
      FROM approval_requests ar
      LEFT JOIN users u ON ar.decider_id = u.id
      WHERE ar.work_order_id = $1
    `;
    const res = await db.query(sql, [workOrderId]);
    return res.rows[0] || null;
  }

  // ============================================================
  // MAINTENANCE LOGS & FINALIZATION QUERIES
  // ============================================================

  /**
   * Retrieves maintenance log associated with a work order ID if any.
   */
  async getMaintenanceLogByWorkOrderId(workOrderId, client = null) {
    const db = client || { query };
    const sql = `
      SELECT * FROM maintenance_logs
      WHERE work_order_id = $1
    `;
    const res = await db.query(sql, [workOrderId]);
    return res.rows[0] || null;
  }

  /**
   * Checks if an official receipt number already exists in maintenance_logs.
   */
  async checkReceiptNumberExists(receiptNumber, client = null) {
    const db = client || { query };
    const sql = `
      SELECT id FROM maintenance_logs
      WHERE LOWER(official_receipt_number) = LOWER($1)
    `;
    const res = await db.query(sql, [receiptNumber.trim()]);
    return Boolean(res.rows[0]);
  }

  /**
   * Inserts permanent maintenance log record.
   */
  async insertMaintenanceLog(
    {
      workOrderId,
      maintenanceTypeId,
      severity,
      dateStarted,
      dateResolved,
      partsCost = 0.0,
      laborCost = 0.0,
      downtimeDays = 0,
      odometerAtService,
      officialReceiptNumber,
    },
    client = null
  ) {
    const db = client || { query };
    const sql = `
      INSERT INTO maintenance_logs (
        work_order_id,
        maintenance_type_id,
        severity,
        date_started,
        date_resolved,
        parts_cost,
        labor_cost,
        downtime_days,
        odometer_at_service,
        official_receipt_number
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `;
    const res = await db.query(sql, [
      workOrderId,
      maintenanceTypeId,
      severity,
      dateStarted,
      dateResolved,
      partsCost,
      laborCost,
      downtimeDays,
      odometerAtService,
      officialReceiptNumber.trim(),
    ]);
    return res.rows[0];
  }

  /**
   * Resets truck PM baseline odometer upon PREVENTIVE maintenance completion.
   */
  async resetTruckPmOdometer({ truckId, serviceOdometer }, client = null) {
    const db = client || { query };
    const sql = `
      UPDATE trucks
      SET 
        last_pm_odometer = $1,
        current_odometer = GREATEST(current_odometer, $1),
        updated_at = NOW()
      WHERE id = $2
      RETURNING *
    `;
    const res = await db.query(sql, [serviceOdometer, truckId]);
    return res.rows[0] || null;
  }

  /**
   * Retrieves paginated maintenance logs with joined work order and truck details.
   */
  async getMaintenanceLogs(filters = {}, { limit = 50, offset = 0 } = {}) {
    const conditions = [];
    const params = [];
    let paramIndex = 1;

    if (filters.truckId) {
      conditions.push(`wo.truck_id = $${paramIndex++}`);
      params.push(filters.truckId);
    }

    if (filters.maintenanceTypeId) {
      conditions.push(`ml.maintenance_type_id = $${paramIndex++}`);
      params.push(filters.maintenanceTypeId);
    }

    if (filters.startDate) {
      conditions.push(`ml.date_resolved >= $${paramIndex++}`);
      params.push(filters.startDate);
    }

    if (filters.endDate) {
      conditions.push(`ml.date_resolved <= $${paramIndex++}`);
      params.push(filters.endDate);
    }

    if (filters.search) {
      conditions.push(
        `(ml.official_receipt_number ILIKE $${paramIndex} OR t.plate_number ILIKE $${paramIndex} OR wo.shop_name ILIKE $${paramIndex})`
      );
      params.push(`%${filters.search}%`);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    params.push(limit, offset);

    const sql = `
      SELECT 
        ml.id,
        ml.work_order_id,
        ml.maintenance_type_id,
        mt.type_name AS maintenance_type_name,
        ml.severity,
        ml.date_started,
        ml.date_resolved,
        ml.parts_cost,
        ml.labor_cost,
        (ml.parts_cost + ml.labor_cost) AS total_cost,
        ml.downtime_days,
        ml.odometer_at_service,
        ml.official_receipt_number,
        ml.created_at,
        wo.truck_id,
        wo.shop_name,
        wo.description AS work_order_description,
        t.plate_number,
        t.model AS truck_model,
        t.status AS truck_status
      FROM maintenance_logs ml
      JOIN maintenance_types mt ON ml.maintenance_type_id = mt.id
      JOIN work_orders wo ON ml.work_order_id = wo.id
      JOIN trucks t ON wo.truck_id = t.id
      ${whereClause}
      ORDER BY ml.date_resolved DESC
      LIMIT $${paramIndex++} OFFSET $${paramIndex}
    `;

    const res = await query(sql, params);
    return res.rows;
  }

  /**
   * Counts total maintenance logs matching filters.
   */
  async countMaintenanceLogs(filters = {}) {
    const conditions = [];
    const params = [];
    let paramIndex = 1;

    if (filters.truckId) {
      conditions.push(`wo.truck_id = $${paramIndex++}`);
      params.push(filters.truckId);
    }

    if (filters.maintenanceTypeId) {
      conditions.push(`ml.maintenance_type_id = $${paramIndex++}`);
      params.push(filters.maintenanceTypeId);
    }

    if (filters.startDate) {
      conditions.push(`ml.date_resolved >= $${paramIndex++}`);
      params.push(filters.startDate);
    }

    if (filters.endDate) {
      conditions.push(`ml.date_resolved <= $${paramIndex++}`);
      params.push(filters.endDate);
    }

    if (filters.search) {
      conditions.push(
        `(ml.official_receipt_number ILIKE $${paramIndex} OR t.plate_number ILIKE $${paramIndex} OR wo.shop_name ILIKE $${paramIndex})`
      );
      params.push(`%${filters.search}%`);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const sql = `
      SELECT COUNT(*)::int AS count
      FROM maintenance_logs ml
      JOIN work_orders wo ON ml.work_order_id = wo.id
      JOIN trucks t ON wo.truck_id = t.id
      ${whereClause}
    `;

    const res = await query(sql, params);
    return res.rows[0]?.count || 0;
  }

  // ============================================================
  // FLEET ANALYTICS
  // ============================================================

  /**
   * Aggregates recurring vehicle incidents grouped by vehicle and incident type.
   * Filters by time interval (days) and recurrence threshold (minOccurrences).
   * 
   * @param {Object} options - { truckId, days, minOccurrences }
   * @param {Object} [client] - Optional transactional client
   * @returns {Promise<Array<Object>>} Grouped recurring incident defects
   */
  async getRecurringIssues({ truckId = null, days = 90, minOccurrences = 2 } = {}, client = null) {
    const db = client || { query };
    const numDays = Math.max(1, parseInt(days) || 90);
    const numMin = Math.max(1, parseInt(minOccurrences) || 2);

    const conditions = [
      `ir.report_date >= NOW() - ($1 || ' days')::interval`
    ];
    const params = [String(numDays)];
    let paramIndex = 2;

    if (truckId && typeof truckId === 'string' && truckId.trim().length > 0) {
      conditions.push(`ir.truck_id = $${paramIndex++}`);
      params.push(truckId.trim());
    }

    params.push(numMin);

    const sql = `
      SELECT 
        ir.truck_id,
        t.plate_number,
        t.model AS truck_model,
        ir.incident_type_id,
        it.type_name AS incident_type_name,
        COUNT(*)::int AS occurrence_count,
        (ARRAY_AGG(ir.severity ORDER BY ir.report_date DESC))[1] AS latest_severity,
        MAX(ir.report_date) AS latest_incident_date,
        ARRAY_AGG(ir.description ORDER BY ir.report_date DESC) AS descriptions
      FROM incident_reports ir
      JOIN incident_types it ON ir.incident_type_id = it.id
      JOIN trucks t ON ir.truck_id = t.id
      WHERE ${conditions.join(' AND ')}
      GROUP BY ir.truck_id, t.plate_number, t.model, ir.incident_type_id, it.type_name
      HAVING COUNT(*) >= $${paramIndex}
      ORDER BY occurrence_count DESC, latest_incident_date DESC
    `;

    const res = await db.query(sql, params);
    return res.rows;
  }
}

module.exports = new MaintenanceRepository();
