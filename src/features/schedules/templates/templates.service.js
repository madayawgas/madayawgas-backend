const templatesRepository = require('./templates.repository');
const zonesRepository = require('../zones/zones.repository');
const vehiclesRepository = require('../../fleet/vehicles/vehicles.repository');
const { query } = require('../../../../database/connection');

/**
 * Schedule Templates Service
 * Business logic and constraints for recurring weekly master route templates.
 */
class TemplatesService {
  /**
   * Helper to verify a user is an active Sales Person.
   * @param {string} userId
   */
  async verifySalesUser(userId) {
    if (!userId) return null;

    const sql = `
      SELECT 
        u.id, 
        u.username, 
        u.first_name, 
        u.last_name, 
        u.is_active, 
        u.is_blocked,
        r.name AS role_name,
        EXISTS (
          SELECT 1 FROM user_roles ur
          JOIN roles r2 ON ur.role_id = r2.id
          WHERE ur.user_id = u.id AND LOWER(r2.name) = 'sales person'
        ) OR LOWER(r.name) = 'sales person' AS is_sales_person
      FROM users u
      JOIN roles r ON u.role_id = r.id
      WHERE u.id = $1
    `;

    const res = await query(sql, [userId]);
    const user = res.rows[0];

    if (!user) {
      const err = new Error('Sales user not found');
      err.statusCode = 404;
      throw err;
    }

    if (!user.is_active || user.is_blocked) {
      const err = new Error('Sales user account is deactivated or blocked');
      err.statusCode = 400;
      throw err;
    }

    if (!user.is_sales_person) {
      const err = new Error(`User '${user.username}' does not hold the Sales Person role`);
      err.statusCode = 400;
      throw err;
    }

    return user;
  }

  /**
   * Retrieves all weekly templates with optional filtering.
   * @param {Object} filters
   */
  async getAllTemplates(filters = {}) {
    return templatesRepository.getAllTemplates(filters);
  }

  /**
   * Retrieves a single template by UUID.
   * @param {string} id
   */
  async getTemplateById(id) {
    if (!id || typeof id !== 'string') {
      const err = new Error('Template ID is required');
      err.statusCode = 400;
      throw err;
    }

    const template = await templatesRepository.getTemplateById(id);
    if (!template) {
      const err = new Error('Schedule template not found');
      err.statusCode = 404;
      throw err;
    }

    return template;
  }

  /**
   * Creates a new schedule template.
   * @param {Object} actorUser
   * @param {Object} data - { truckId, zoneId, dayOfWeek, defaultSalesUserId, isActive }
   */
  async createTemplate(actorUser, data = {}) {
    const { truckId, zoneId, dayOfWeek, defaultSalesUserId, isActive } = data;

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

    const parsedDay = parseInt(dayOfWeek, 10);
    if (isNaN(parsedDay) || parsedDay < 1 || parsedDay > 7) {
      const err = new Error('Day of week must be an integer between 1 (Monday) and 7 (Sunday)');
      err.statusCode = 400;
      throw err;
    }

    if (defaultSalesUserId) {
      await this.verifySalesUser(defaultSalesUserId.trim());
    }

    // Check unique constraint for truck and day of week
    const existing = await templatesRepository.findByTruckAndDay(vehicle.id, parsedDay);
    if (existing) {
      const err = new Error(
        `A schedule template for vehicle '${vehicle.plate_number}' on day ${parsedDay} already exists`
      );
      err.statusCode = 409;
      throw err;
    }

    return templatesRepository.createTemplate({
      truckId: vehicle.id,
      zoneId: zone.id,
      dayOfWeek: parsedDay,
      defaultSalesUserId: defaultSalesUserId ? defaultSalesUserId.trim() : null,
      isActive: isActive !== undefined ? Boolean(isActive) : true,
    });
  }

  /**
   * Updates an existing schedule template.
   * @param {string} id
   * @param {Object} actorUser
   * @param {Object} data
   */
  async updateTemplate(id, actorUser, data = {}) {
    const current = await this.getTemplateById(id);
    const updatePayload = {};

    let targetTruckId = current.truck_id;
    let targetDay = current.day_of_week;

    if (data.truckId !== undefined) {
      const vehicle = await vehiclesRepository.getVehicleById(data.truckId.trim());
      if (!vehicle) {
        const err = new Error('Vehicle not found');
        err.statusCode = 404;
        throw err;
      }
      targetTruckId = vehicle.id;
      updatePayload.truckId = vehicle.id;
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

    if (data.dayOfWeek !== undefined) {
      const parsedDay = parseInt(data.dayOfWeek, 10);
      if (isNaN(parsedDay) || parsedDay < 1 || parsedDay > 7) {
        const err = new Error('Day of week must be between 1 and 7');
        err.statusCode = 400;
        throw err;
      }
      targetDay = parsedDay;
      updatePayload.dayOfWeek = parsedDay;
    }

    if (data.defaultSalesUserId !== undefined) {
      if (data.defaultSalesUserId === null || data.defaultSalesUserId === '') {
        updatePayload.defaultSalesUserId = null;
      } else {
        await this.verifySalesUser(data.defaultSalesUserId.trim());
        updatePayload.defaultSalesUserId = data.defaultSalesUserId.trim();
      }
    }

    if (data.isActive !== undefined) {
      updatePayload.isActive = Boolean(data.isActive);
    }

    if (data.truckId !== undefined || data.dayOfWeek !== undefined) {
      const existing = await templatesRepository.findByTruckAndDay(targetTruckId, targetDay);
      if (existing && existing.id !== id) {
        const err = new Error(
          `A schedule template for this vehicle on day ${targetDay} already exists`
        );
        err.statusCode = 409;
        throw err;
      }
    }

    return templatesRepository.updateTemplate(id, updatePayload);
  }

  /**
   * Deletes a schedule template.
   * @param {string} id
   */
  async deleteTemplate(id) {
    await this.getTemplateById(id);
    return templatesRepository.deleteTemplate(id);
  }
}

module.exports = new TemplatesService();
