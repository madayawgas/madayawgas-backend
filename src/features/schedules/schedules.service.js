const schedulesRepository = require('./schedules.repository');
const templatesRepository = require('./templates/templates.repository');
const templatesService = require('./templates/templates.service');
const zonesRepository = require('./zones/zones.repository');
const vehiclesRepository = require('../fleet/vehicles/vehicles.repository');
const { historyService, EVENTS } = require('../history');

/**
 * Truck Schedules Service
 * Business logic, batch generation, and constraint validation for operational schedules.
 */
class SchedulesService {
  /**
   * Retrieves operational schedules.
   * If actorUser has only 'route.view_own' permission, automatically constrains to actorUser's assignments.
   * @param {Object} actorUser
   * @param {Object} filters
   * @param {Object|null} pagination
   */
  async getAllSchedules(actorUser, filters = {}, pagination = null) {
    const permissions = actorUser?.permissions || [];
    const hasGlobalView = permissions.includes('route.view') || permissions.includes('route.manage');
    const hasOwnView = permissions.includes('route.view_own');

    const effectiveFilters = { ...filters };

    if (!hasGlobalView && hasOwnView) {
      effectiveFilters.salesUserId = actorUser.id;
    }

    if (!pagination || !pagination.isPaginated) {
      return schedulesRepository.getAllSchedules(effectiveFilters, null);
    }

    const { rows, total } = await schedulesRepository.getAllSchedules(effectiveFilters, pagination);
    const { buildPaginationMeta } = require('../../utils/pagination');
    const meta = buildPaginationMeta(total, pagination.page, pagination.limit);

    return { items: rows, meta };
  }

  /**
   * Retrieves single operational schedule by UUID.
   * @param {string} id
   * @param {Object} actorUser
   */
  async getScheduleById(id, actorUser) {
    if (!id || typeof id !== 'string') {
      const err = new Error('Schedule ID is required');
      err.statusCode = 400;
      throw err;
    }

    const schedule = await schedulesRepository.getScheduleById(id);
    if (!schedule) {
      const err = new Error('Truck schedule not found');
      err.statusCode = 404;
      throw err;
    }

    const permissions = actorUser?.permissions || [];
    const hasGlobalView = permissions.includes('route.view') || permissions.includes('route.manage');
    const hasOwnView = permissions.includes('route.view_own');

    if (!hasGlobalView && hasOwnView && schedule.sales_user_id !== actorUser.id) {
      const err = new Error('Access denied: You can only view schedules assigned to you');
      err.statusCode = 403;
      throw err;
    }

    return schedule;
  }

  /**
   * Creates an operational date-stamped schedule ad-hoc.
   * @param {Object} actorUser
   * @param {Object} data - { scheduledDate, truckId, salesUserId, zoneId, notes }
   */
  async createSchedule(actorUser, data = {}) {
    const { scheduledDate, truckId, salesUserId, zoneId, notes } = data;

    if (!scheduledDate || typeof scheduledDate !== 'string') {
      const err = new Error('Scheduled date is required (YYYY-MM-DD)');
      err.statusCode = 400;
      throw err;
    }

    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(scheduledDate.trim())) {
      const err = new Error('Scheduled date must follow YYYY-MM-DD format');
      err.statusCode = 400;
      throw err;
    }

    if (!truckId || typeof truckId !== 'string') {
      const err = new Error('Vehicle ID is required');
      err.statusCode = 400;
      throw err;
    }

    const vehicle = await vehiclesRepository.getVehicleById(truckId.trim());
    if (!vehicle) {
      const err = new Error('Vehicle not found');
      err.statusCode = 404;
      throw err;
    }

    if (vehicle.status !== 'ACTIVE') {
      const err = new Error(
        `Cannot schedule vehicle '${vehicle.plate_number}' because it is currently ${vehicle.status}`
      );
      err.statusCode = 400;
      throw err;
    }

    if (!salesUserId || typeof salesUserId !== 'string') {
      const err = new Error('Sales user ID is required');
      err.statusCode = 400;
      throw err;
    }

    const salesUser = await templatesService.verifySalesUser(salesUserId.trim());

    if (!zoneId || typeof zoneId !== 'string') {
      const err = new Error('Zone ID is required');
      err.statusCode = 400;
      throw err;
    }

    const zone = await zonesRepository.getZoneById(zoneId.trim());
    if (!zone) {
      const err = new Error('Service zone not found');
      err.statusCode = 404;
      throw err;
    }

    if (!zone.is_active) {
      const err = new Error(`Service zone '${zone.name}' is inactive and cannot be scheduled`);
      err.statusCode = 400;
      throw err;
    }

    const cleanDate = scheduledDate.trim();

    // Check unique constraint for truck and date
    const existing = await schedulesRepository.findByTruckAndDate(vehicle.id, cleanDate);
    if (existing) {
      const err = new Error(
        `Vehicle '${vehicle.plate_number}' already has a schedule for ${cleanDate}`
      );
      err.statusCode = 409;
      throw err;
    }

    const created = await schedulesRepository.createSchedule({
      scheduledDate: cleanDate,
      truckId: vehicle.id,
      salesUserId: salesUser.id,
      zoneId: zone.id,
      createdBy: actorUser?.id || null,
      status: 'SCHEDULED',
      notes: notes ? notes.trim() : null,
    });

    // Centralized Event History Logging
    await historyService.log(EVENTS.SCHEDULE_CREATED, {
      actorUser,
      targetId: created.id,
      payload: {
        plateNumber: created.truck_plate_number,
        date: created.scheduled_date,
      },
      metadata: {
        zoneName: created.zone_name,
        salesRep: created.sales_username,
        notes: created.notes,
      },
    });

    return created;
  }

  /**
   * Generates operational date-stamped schedules from weekly master templates across a date range.
   * Skips grounded trucks (UNDER_MAINTENANCE) and trucks with existing deployments.
   *
   * @param {Object} actorUser
   * @param {Object} options - { startDate, endDate }
   */
  async generateWeeklySchedules(actorUser, options = {}) {
    const { startDate, endDate } = options;

    if (!startDate || !endDate) {
      const err = new Error('Both startDate and endDate are required (YYYY-MM-DD)');
      err.statusCode = 400;
      throw err;
    }

    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(startDate.trim()) || !dateRegex.test(endDate.trim())) {
      const err = new Error('Dates must follow YYYY-MM-DD format');
      err.statusCode = 400;
      throw err;
    }

    const start = new Date(`${startDate.trim()}T00:00:00Z`);
    const end = new Date(`${endDate.trim()}T00:00:00Z`);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      const err = new Error('Invalid date provided');
      err.statusCode = 400;
      throw err;
    }

    if (start > end) {
      const err = new Error('startDate cannot be after endDate');
      err.statusCode = 400;
      throw err;
    }

    const diffDays = Math.round((end - start) / (1000 * 60 * 60 * 24)) + 1;
    if (diffDays > 31) {
      const err = new Error('Schedule generation date range cannot exceed 31 days');
      err.statusCode = 400;
      throw err;
    }

    const generatedSchedules = [];
    const skippedDetails = [];

    // Iterate through each date in the range
    const current = new Date(start);
    while (current <= end) {
      const dateStr = current.toISOString().split('T')[0];
      // ISO day of week: 1 (Mon) to 7 (Sun)
      const jsDay = current.getUTCDay();
      const dayOfWeek = jsDay === 0 ? 7 : jsDay;

      // Fetch active templates for this day of week
      const templates = await templatesRepository.getAllTemplates({
        dayOfWeek,
        isActive: true,
      });

      for (const tpl of templates) {
        // 1. Check truck condition - skip grounded/inactive trucks
        if (tpl.truck_status !== 'ACTIVE') {
          skippedDetails.push({
            date: dateStr,
            truckId: tpl.truck_id,
            plateNumber: tpl.truck_plate_number,
            reason: `Vehicle is ${tpl.truck_status} (under maintenance or inactive)`,
          });
          continue;
        }

        // 2. Check double booking
        const existing = await schedulesRepository.findByTruckAndDate(tpl.truck_id, dateStr);
        if (existing) {
          skippedDetails.push({
            date: dateStr,
            truckId: tpl.truck_id,
            plateNumber: tpl.truck_plate_number,
            reason: `Schedule already exists with status '${existing.status}'`,
          });
          continue;
        }

        // 3. Sales rep validation
        let assignedSalesUserId = tpl.default_sales_user_id;
        if (!assignedSalesUserId) {
          skippedDetails.push({
            date: dateStr,
            truckId: tpl.truck_id,
            plateNumber: tpl.truck_plate_number,
            reason: 'Template has no default Sales Person assigned',
          });
          continue;
        }

        try {
          await templatesService.verifySalesUser(assignedSalesUserId);
        } catch (repErr) {
          skippedDetails.push({
            date: dateStr,
            truckId: tpl.truck_id,
            plateNumber: tpl.truck_plate_number,
            reason: `Default sales user is invalid: ${repErr.message}`,
          });
          continue;
        }

        // 4. Create schedule
        const created = await schedulesRepository.createSchedule({
          scheduledDate: dateStr,
          truckId: tpl.truck_id,
          salesUserId: assignedSalesUserId,
          zoneId: tpl.zone_id,
          createdBy: actorUser?.id || null,
          status: 'SCHEDULED',
          notes: `Auto-generated from weekly template (Day ${dayOfWeek})`,
        });

        // Emit history log
        await historyService.log(EVENTS.SCHEDULE_CREATED, {
          actorUser,
          targetId: created.id,
          payload: {
            plateNumber: created.truck_plate_number,
            date: created.scheduled_date,
          },
          metadata: {
            source: 'TEMPLATE_GENERATION',
            templateId: tpl.id,
            zoneName: created.zone_name,
          },
        });

        generatedSchedules.push(created);
      }

      current.setUTCDate(current.getUTCDate() + 1);
    }

    return {
      dateRange: { startDate: startDate.trim(), endDate: endDate.trim() },
      generatedCount: generatedSchedules.length,
      skippedCount: skippedDetails.length,
      skippedDetails,
      generatedSchedules,
    };
  }

  /**
   * Updates operational schedule attributes.
   * @param {string} id
   * @param {Object} actorUser
   * @param {Object} data
   */
  async updateSchedule(id, actorUser, data = {}) {
    const current = await this.getScheduleById(id, actorUser);

    if (current.status === 'DISPATCHED') {
      const err = new Error('Cannot modify a schedule that has already been dispatched');
      err.statusCode = 400;
      throw err;
    }

    if (current.status === 'CANCELLED') {
      const err = new Error('Cannot modify a cancelled schedule');
      err.statusCode = 400;
      throw err;
    }

    const updatePayload = {};

    if (data.salesUserId !== undefined) {
      const user = await templatesService.verifySalesUser(data.salesUserId.trim());
      updatePayload.salesUserId = user.id;
    }

    if (data.zoneId !== undefined) {
      const zone = await zonesRepository.getZoneById(data.zoneId.trim());
      if (!zone) {
        const err = new Error('Service zone not found');
        err.statusCode = 404;
        throw err;
      }
      if (!zone.is_active) {
        const err = new Error(`Service zone '${zone.name}' is inactive`);
        err.statusCode = 400;
        throw err;
      }
      updatePayload.zoneId = zone.id;
    }

    if (data.notes !== undefined) {
      updatePayload.notes = data.notes ? data.notes.trim() : null;
    }

    if (data.scheduledDate !== undefined) {
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(data.scheduledDate.trim())) {
        const err = new Error('Scheduled date must follow YYYY-MM-DD format');
        err.statusCode = 400;
        throw err;
      }
      const existing = await schedulesRepository.findByTruckAndDate(
        current.truck_id,
        data.scheduledDate.trim()
      );
      if (existing && existing.id !== id) {
        const err = new Error(
          `Vehicle '${current.truck_plate_number}' already has a schedule for ${data.scheduledDate.trim()}`
        );
        err.statusCode = 409;
        throw err;
      }
      updatePayload.scheduledDate = data.scheduledDate.trim();
    }

    return schedulesRepository.updateSchedule(id, updatePayload);
  }

  /**
   * Cancels a scheduled truck deployment.
   * @param {string} id
   * @param {Object} actorUser
   * @param {Object} data - { reason }
   */
  async cancelSchedule(id, actorUser, data = {}) {
    const current = await this.getScheduleById(id, actorUser);

    if (current.status === 'DISPATCHED') {
      const err = new Error('Cannot cancel a schedule that has already been dispatched');
      err.statusCode = 400;
      throw err;
    }

    if (current.status === 'CANCELLED') {
      return current;
    }

    const updated = await schedulesRepository.updateSchedule(id, {
      status: 'CANCELLED',
      notes: data.reason
        ? `${current.notes ? `${current.notes} | ` : ''}Cancelled: ${data.reason.trim()}`
        : current.notes,
    });

    await historyService.log(EVENTS.SCHEDULE_CANCELLED, {
      actorUser,
      targetId: id,
      payload: {
        plateNumber: current.truck_plate_number,
        date: current.scheduled_date,
      },
      metadata: {
        reason: data.reason || null,
        zoneName: current.zone_name,
      },
    });

    return updated;
  }
}

module.exports = new SchedulesService();
