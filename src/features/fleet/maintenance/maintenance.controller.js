const { z } = require('zod');
const maintenanceService = require('./maintenance.service');

// Zod Validation Schemas for Work Order Receipts & Finalization
const AttachReceiptSchema = z.object({
  fileUrl: z
    .string({ required_error: 'Receipt file URL is required and must be valid' })
    .trim()
    .min(1, 'Receipt file URL cannot be empty')
    .refine(
      (val) => !['receipts/n/a', 'n/a', 'null', 'undefined', '[object object]'].includes(val.toLowerCase()),
      'Receipt file URL cannot be a placeholder'
    ),
});

const FinalizeWorkOrderSchema = z.object({
  severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'], {
    errorMap: () => ({ message: 'Severity must be one of: LOW, MEDIUM, HIGH, CRITICAL' }),
  }),
  dateStarted: z.string().min(1, 'Date started is required'),
  dateResolved: z.string().min(1, 'Date resolved is required'),
  partsCost: z.coerce.number().min(0, 'Parts cost must be a non-negative number').optional().default(0),
  laborCost: z.coerce.number().min(0, 'Labor cost must be a non-negative number').optional().default(0),
  downtimeDays: z.coerce.number().int().min(0, 'Downtime days must be a non-negative integer').optional(),
  odometerAtService: z.coerce.number().int().min(0, 'Odometer at service must be a non-negative integer'),
  receiptUrls: z
    .array(
      z
        .string()
        .trim()
        .min(1)
        .refine(
          (val) => !['receipts/n/a', 'n/a', 'null', 'undefined', '[object object]'].includes(val.toLowerCase()),
          'Receipt file URL cannot be a placeholder'
        )
    )
    .optional()
    .default([]),
});

/**
 * Maintenance Controller
 * HTTP parameter parsing, payload extraction, and status response formatting
 * for vehicle odometer logging and preventive maintenance status.
 */
class MaintenanceController {
  /**
   * POST /api/fleet/maintenance/odometer
   * Records single-point post-dispatch return odometer reading for a vehicle.
   */
  async logOdometer(req, res) {
    const { vehicleId, truckId, odometerReading, odometer, source, notes } = req.body || {};

    try {
      const data = await maintenanceService.logOdometerReading(req.user, {
        vehicleId: vehicleId || truckId,
        truckId: vehicleId || truckId,
        odometerReading: odometerReading !== undefined ? odometerReading : odometer,
        source,
        notes,
      });

      return res.status(201).json({
        status: 'success',
        message: 'Odometer reading recorded successfully.',
        data,
      });
    } catch (err) {
      const statusCode = err.statusCode || (err.message.includes('not found') ? 404 : 400);
      return res.status(statusCode).json({
        status: 'fail',
        message: err.message,
      });
    }
  }

  /**
   * GET /api/fleet/maintenance/odometer/truck/:truckId
   * Retrieves paginated odometer history logs for a specific vehicle.
   */
  async getTruckOdometerHistory(req, res) {
    try {
      const targetVehicleId = req.params.vehicleId || req.params.truckId;
      const data = await maintenanceService.getTruckOdometerHistory(
        targetVehicleId,
        req.query
      );

      return res.status(200).json({
        status: 'success',
        data,
      });
    } catch (err) {
      const statusCode = err.statusCode || (err.message.includes('not found') ? 404 : 400);
      return res.status(statusCode).json({
        status: 'fail',
        message: err.message,
      });
    }
  }

  /**
   * GET /api/fleet/maintenance/pm-overview
   * Retrieves summary of all trucks with PM due indicators and distance deltas.
   */
  async getPmOverview(req, res) {
    try {
      const data = await maintenanceService.getFleetPmOverview(req.query);

      return res.status(200).json({
        status: 'success',
        data,
      });
    } catch (err) {
      const statusCode = err.statusCode || 400;
      return res.status(statusCode).json({
        status: 'fail',
        message: err.message,
      });
    }
  }

  // ============================================================
  // SAFETY INSPECTION HANDLERS
  // ============================================================

  /**
   * POST /api/fleet/maintenance/inspections
   * Records a vehicle safety inspection and automatically grounds the vehicle if failed.
   */
  async recordInspection(req, res) {
    try {
      const data = await maintenanceService.recordInspection(req.user, req.body || {});
      return res.status(201).json({
        status: 'success',
        message: 'Vehicle inspection recorded successfully.',
        data,
      });
    } catch (err) {
      const statusCode = err.statusCode || (err.message.includes('not found') ? 404 : 400);
      return res.status(statusCode).json({
        status: 'fail',
        message: err.message,
      });
    }
  }

  /**
   * GET /api/fleet/maintenance/inspections/truck/:truckId
   * Retrieves paginated inspections for a specific truck.
   */
  async getTruckInspections(req, res) {
    try {
      const targetVehicleId = req.params.vehicleId || req.params.truckId;
      const data = await maintenanceService.getTruckInspections(targetVehicleId, req.query);
      return res.status(200).json({
        status: 'success',
        data,
      });
    } catch (err) {
      const statusCode = err.statusCode || (err.message.includes('not found') ? 404 : 400);
      return res.status(statusCode).json({
        status: 'fail',
        message: err.message,
      });
    }
  }

  /**
   * GET /api/fleet/maintenance/inspections/:id
   * Retrieves single inspection record by UUID.
   */
  async getInspectionById(req, res) {
    try {
      const data = await maintenanceService.getInspectionById(req.params.id);
      return res.status(200).json({
        status: 'success',
        data,
      });
    } catch (err) {
      const statusCode = err.statusCode || (err.message.includes('not found') ? 404 : 400);
      return res.status(statusCode).json({
        status: 'fail',
        message: err.message,
      });
    }
  }

  // ============================================================
  // INCIDENT REPORTING HANDLERS
  // ============================================================

  /**
   * GET /api/fleet/maintenance/incidents/types
   * Retrieves list of available incident classification types.
   */
  async getIncidentTypes(req, res) {
    try {
      const data = await maintenanceService.getIncidentTypesList();
      return res.status(200).json({
        status: 'success',
        data,
      });
    } catch (err) {
      const statusCode = err.statusCode || 400;
      return res.status(statusCode).json({
        status: 'fail',
        message: err.message,
      });
    }
  }

  /**
   * POST /api/fleet/maintenance/incidents
   * Records a mid-route incident/breakdown and automatically grounds truck if critical.
   */
  async reportIncident(req, res) {
    try {
      const data = await maintenanceService.reportIncident(req.user, req.body || {});
      return res.status(201).json({
        status: 'success',
        message: 'Incident reported successfully.',
        data,
      });
    } catch (err) {
      const statusCode = err.statusCode || (err.message.includes('not found') ? 404 : 400);
      return res.status(statusCode).json({
        status: 'fail',
        message: err.message,
      });
    }
  }

  /**
   * GET /api/fleet/maintenance/incidents
   * Retrieves fleet-wide incident reports with filter support.
   */
  async getIncidents(req, res) {
    try {
      const data = await maintenanceService.getIncidents(req.query);
      return res.status(200).json({
        status: 'success',
        data,
      });
    } catch (err) {
      const statusCode = err.statusCode || 400;
      return res.status(statusCode).json({
        status: 'fail',
        message: err.message,
      });
    }
  }

  /**
   * GET /api/fleet/maintenance/incidents/truck/:truckId
   * Retrieves paginated incident reports for a specific truck.
   */
  async getTruckIncidents(req, res) {
    try {
      const targetVehicleId = req.params.vehicleId || req.params.truckId;
      const data = await maintenanceService.getTruckIncidents(targetVehicleId, req.query);
      return res.status(200).json({
        status: 'success',
        data,
      });
    } catch (err) {
      const statusCode = err.statusCode || (err.message.includes('not found') ? 404 : 400);
      return res.status(statusCode).json({
        status: 'fail',
        message: err.message,
      });
    }
  }

  /**
   * GET /api/fleet/maintenance/incidents/:id
   * Retrieves single incident report by UUID.
   */
  async getIncidentById(req, res) {
    try {
      const data = await maintenanceService.getIncidentById(req.params.id);
      return res.status(200).json({
        status: 'success',
        data,
      });
    } catch (err) {
      const statusCode = err.statusCode || (err.message.includes('not found') ? 404 : 400);
      return res.status(statusCode).json({
        status: 'fail',
        message: err.message,
      });
    }
  }

  // ============================================================
  // WORK ORDERS & REPAIR LIFECYCLE HANDLERS
  // ============================================================

  /**
   * GET /api/fleet/maintenance/work-orders/types
   * Retrieves list of available maintenance categories.
   */
  async getMaintenanceTypes(req, res) {
    try {
      const data = await maintenanceService.getMaintenanceTypesList();
      return res.status(200).json({
        status: 'success',
        data,
      });
    } catch (err) {
      const statusCode = err.statusCode || 400;
      return res.status(statusCode).json({
        status: 'fail',
        message: err.message,
      });
    }
  }

  /**
   * POST /api/fleet/maintenance/work-orders
   * Creates a new vehicle work order with optional cost review gatekeeping.
   */
  async createWorkOrder(req, res) {
    try {
      const data = await maintenanceService.createWorkOrder(req.user, req.body || {});
      return res.status(201).json({
        status: 'success',
        message: 'Work order created successfully.',
        data,
      });
    } catch (err) {
      const statusCode = err.statusCode || (err.message.includes('not found') ? 404 : 400);
      return res.status(statusCode).json({
        status: 'fail',
        message: err.message,
      });
    }
  }

  /**
   * GET /api/fleet/maintenance/work-orders
   * Retrieves paginated work orders with filtering.
   */
  async getWorkOrders(req, res) {
    try {
      const data = await maintenanceService.getWorkOrders(req.query);
      return res.status(200).json({
        status: 'success',
        data,
      });
    } catch (err) {
      const statusCode = err.statusCode || 400;
      return res.status(statusCode).json({
        status: 'fail',
        message: err.message,
      });
    }
  }

  /**
   * GET /api/fleet/maintenance/work-orders/:id
   * Retrieves single work order with joined truck and approval context.
   */
  async getWorkOrderById(req, res) {
    try {
      const data = await maintenanceService.getWorkOrderById(req.params.id);
      return res.status(200).json({
        status: 'success',
        data,
      });
    } catch (err) {
      const statusCode = err.statusCode || (err.message.includes('not found') ? 404 : 400);
      return res.status(statusCode).json({
        status: 'fail',
        message: err.message,
      });
    }
  }

  /**
   * PATCH /api/fleet/maintenance/work-orders/:id/status
   * Advances repair status progression (e.g. APPROVED -> SCHEDULED -> IN_PROGRESS or CANCELLED).
   */
  async updateWorkOrderStatus(req, res) {
    try {
      const data = await maintenanceService.updateWorkOrderStatus(
        req.user,
        req.params.id,
        req.body || {}
      );
      return res.status(200).json({
        status: 'success',
        message: 'Work order status updated successfully.',
        data,
      });
    } catch (err) {
      const statusCode = err.statusCode || (err.message.includes('not found') ? 404 : 400);
      return res.status(statusCode).json({
        status: 'fail',
        message: err.message,
      });
    }
  }

  /**
   * POST /api/fleet/maintenance/work-orders/:id/approve
   * Executive cost approval decision on PENDING work orders (Admin/Super Admin only).
   */
  async decideApproval(req, res) {
    try {
      const data = await maintenanceService.decideApprovalRequest(
        req.user,
        req.params.id,
        req.body || {}
      );
      return res.status(200).json({
        status: 'success',
        message: 'Work order approval decision recorded.',
        data,
      });
    } catch (err) {
      const statusCode = err.statusCode || (err.message.includes('not found') ? 404 : 400);
      return res.status(statusCode).json({
        status: 'fail',
        message: err.message,
      });
    }
  }

  /**
   * POST /api/fleet/maintenance/work-orders/:id/approval-requests
   * Submits a cost approval request for a work order (supports revised sequential requests).
   */
  async requestApproval(req, res) {
    try {
      const data = await maintenanceService.requestApproval(
        req.user,
        req.params.id,
        req.body || {}
      );
      return res.status(201).json({
        status: 'success',
        message: 'Approval request submitted successfully.',
        data,
      });
    } catch (err) {
      const statusCode = err.statusCode || (err.message.includes('not found') ? 404 : 400);
      return res.status(statusCode).json({
        status: 'fail',
        message: err.message,
      });
    }
  }

  /**
   * GET /api/fleet/maintenance/work-orders/:id/approval-requests
   * Retrieves all historical approval requests for a work order.
   */
  async getWorkOrderApprovalRequests(req, res) {
    try {
      const data = await maintenanceService.getWorkOrderApprovalRequests(req.params.id);
      return res.status(200).json({
        status: 'success',
        data: {
          count: data.length,
          approvalRequests: data,
        },
      });
    } catch (err) {
      const statusCode = err.statusCode || (err.message.includes('not found') ? 404 : 400);
      return res.status(statusCode).json({
        status: 'fail',
        message: err.message,
      });
    }
  }

  /**
   * POST /api/fleet/maintenance/work-orders/:id/finalize
   * Finalizes maintenance servicing, creates permanent maintenance_logs entry,
   * resets PM baseline if PREVENTIVE type, and releases truck back to ACTIVE.
   */
  async finalizeMaintenanceLog(req, res) {
    try {
      const parsed = FinalizeWorkOrderSchema.safeParse(req.body || {});
      if (!parsed.success) {
        return res.status(400).json({
          status: 'fail',
          message: parsed.error.issues[0]?.message || 'Invalid finalize data',
        });
      }
      const data = await maintenanceService.finalizeMaintenanceLog(
        req.user,
        req.params.id,
        parsed.data
      );
      return res.status(201).json({
        status: 'success',
        message: 'Maintenance log finalized and vehicle operational status restored.',
        data,
      });
    } catch (err) {
      const statusCode = err.statusCode || (err.message.includes('not found') ? 404 : 400);
      return res.status(statusCode).json({
        status: 'fail',
        message: err.message,
      });
    }
  }

  /**
   * GET /api/fleet/maintenance/logs
   * Retrieves paginated historical maintenance logs with filtering.
   */
  async getMaintenanceLogs(req, res) {
    try {
      const data = await maintenanceService.getMaintenanceLogs(req.query);
      return res.status(200).json({
        status: 'success',
        data,
      });
    } catch (err) {
      const statusCode = err.statusCode || 400;
      return res.status(statusCode).json({
        status: 'fail',
        message: err.message,
      });
    }
  }

  /**
   * GET /api/fleet/maintenance/analytics/recurring-issues
   * Aggregates recurring vehicle defects and incident analytics.
   */
  async getRecurringIssues(req, res) {
    try {
      const data = await maintenanceService.getRecurringIssuesAnalytics(req.query);
      return res.status(200).json({
        status: 'success',
        data,
      });
    } catch (err) {
      const statusCode = err.statusCode || (err.message.includes('not found') ? 404 : 400);
      return res.status(statusCode).json({
        status: 'fail',
        message: err.message,
      });
    }
  }

  /**
   * POST /api/fleet/maintenance/work-orders/:id/receipts
   * Attaches a receipt document to a work order.
   */
  async addWorkOrderReceipt(req, res) {
    try {
      const parsed = AttachReceiptSchema.safeParse(req.body || {});
      if (!parsed.success) {
        return res.status(400).json({
          status: 'fail',
          message: parsed.error.issues[0]?.message || 'Receipt file URL is required and must be valid',
        });
      }
      const data = await maintenanceService.addWorkOrderReceipt(req.user, req.params.id, parsed.data);
      return res.status(201).json({
        status: 'success',
        message: 'Receipt attached successfully',
        data: { receipt: data },
      });
    } catch (err) {
      const statusCode = err.statusCode || (err.message.includes('not found') ? 404 : 400);
      return res.status(statusCode).json({
        status: 'fail',
        message: err.message,
      });
    }
  }

  /**
   * GET /api/fleet/maintenance/work-orders/:id/receipts
   * Retrieves all receipts attached to a work order.
   */
  async getWorkOrderReceipts(req, res) {
    try {
      const data = await maintenanceService.getWorkOrderReceipts(req.params.id);
      return res.status(200).json({
        status: 'success',
        data,
      });
    } catch (err) {
      const statusCode = err.statusCode || (err.message.includes('not found') ? 404 : 400);
      return res.status(statusCode).json({
        status: 'fail',
        message: err.message,
      });
    }
  }

  /**
   * DELETE /api/fleet/maintenance/receipts/:receiptId
   * Deletes a receipt attachment.
   */
  async deleteWorkOrderReceipt(req, res) {
    try {
      const data = await maintenanceService.deleteWorkOrderReceipt(req.user, req.params.receiptId);
      return res.status(200).json({
        status: 'success',
        message: data.message,
      });
    } catch (err) {
      const statusCode = err.statusCode || (err.message.includes('not found') ? 404 : 400);
      return res.status(statusCode).json({
        status: 'fail',
        message: err.message,
      });
    }
  }
}

module.exports = new MaintenanceController();
