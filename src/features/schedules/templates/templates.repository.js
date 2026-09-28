const { query } = require('../../../../database/connection');

/**
 * Schedule Templates Repository
 * Data access layer for recurring weekly route master templates.
 */
class TemplatesRepository {
  /**
   * Retrieves all schedule templates with joined truck, zone, and sales user details.
   * @param {Object} filters - { truckId, dayOfWeek, zoneId, isActive }
   */
  async getAllTemplates(filters = {}) {
    const { truckId, dayOfWeek, zoneId, isActive } = filters;
    const conditions = [];
    const params = [];
    let paramIndex = 1;

    if (truckId) {
      conditions.push(`st.truck_id = $${paramIndex++}`);
      params.push(truckId);
    }

    if (dayOfWeek !== undefined && dayOfWeek !== null && dayOfWeek !== '') {
      conditions.push(`st.day_of_week = $${paramIndex++}`);
      params.push(parseInt(dayOfWeek, 10));
    }

    if (zoneId) {
      conditions.push(`st.zone_id = $${paramIndex++}`);
      params.push(zoneId);
    }

    if (isActive !== undefined && isActive !== null && isActive !== '') {
      conditions.push(`st.is_active = $${paramIndex++}`);
      params.push(isActive === true || isActive === 'true');
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const sql = `
      SELECT 
        st.id,
        st.truck_id,
        st.zone_id,
        st.day_of_week,
        st.default_sales_user_id,
        st.is_active,
        st.created_at,
        st.updated_at,
        v.plate_number AS truck_plate_number,
        v.model AS truck_model,
        v.status AS truck_status,
        v.vehicle_type AS truck_vehicle_type,
        v.driver_id AS truck_driver_id,
        z.code AS zone_code,
        z.name AS zone_name,
        u.username AS default_sales_username,
        u.first_name AS default_sales_first_name,
        u.last_name AS default_sales_last_name
      FROM schedule_templates st
      JOIN vehicles v ON st.truck_id = v.id
      JOIN service_zones z ON st.zone_id = z.id
      LEFT JOIN users u ON st.default_sales_user_id = u.id
      ${whereClause}
      ORDER BY st.day_of_week ASC, v.plate_number ASC, st.id ASC
    `;

    const result = await query(sql, params);
    return result.rows;
  }

  /**
   * Retrieves a single schedule template by UUID.
   * @param {string} id - Template UUID
   */
  async getTemplateById(id) {
    const sql = `
      SELECT 
        st.id,
        st.truck_id,
        st.zone_id,
        st.day_of_week,
        st.default_sales_user_id,
        st.is_active,
        st.created_at,
        st.updated_at,
        v.plate_number AS truck_plate_number,
        v.model AS truck_model,
        v.status AS truck_status,
        v.vehicle_type AS truck_vehicle_type,
        v.driver_id AS truck_driver_id,
        z.code AS zone_code,
        z.name AS zone_name,
        u.username AS default_sales_username,
        u.first_name AS default_sales_first_name,
        u.last_name AS default_sales_last_name
      FROM schedule_templates st
      JOIN vehicles v ON st.truck_id = v.id
      JOIN service_zones z ON st.zone_id = z.id
      LEFT JOIN users u ON st.default_sales_user_id = u.id
      WHERE st.id = $1
    `;

    const result = await query(sql, [id]);
    return result.rows[0] || null;
  }

  /**
   * Finds an existing template for a specific truck and day of week.
   * @param {string} truckId
   * @param {number} dayOfWeek
   */
  async findByTruckAndDay(truckId, dayOfWeek) {
    const sql = `
      SELECT *
      FROM schedule_templates
      WHERE truck_id = $1 AND day_of_week = $2
    `;

    const result = await query(sql, [truckId, dayOfWeek]);
    return result.rows[0] || null;
  }

  /**
   * Inserts a new schedule template.
   * @param {Object} data
   */
  async createTemplate({ truckId, zoneId, dayOfWeek, defaultSalesUserId = null, isActive = true }) {
    const sql = `
      INSERT INTO schedule_templates (
        truck_id,
        zone_id,
        day_of_week,
        default_sales_user_id,
        is_active
      )
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `;

    const result = await query(sql, [
      truckId,
      zoneId,
      dayOfWeek,
      defaultSalesUserId,
      isActive,
    ]);

    return this.getTemplateById(result.rows[0].id);
  }

  /**
   * Updates an existing schedule template.
   * @param {string} id - Template UUID
   * @param {Object} updateData
   */
  async updateTemplate(id, updateData) {
    const fields = [];
    const params = [];
    let paramIndex = 1;

    if (updateData.truckId !== undefined) {
      fields.push(`truck_id = $${paramIndex++}`);
      params.push(updateData.truckId);
    }

    if (updateData.zoneId !== undefined) {
      fields.push(`zone_id = $${paramIndex++}`);
      params.push(updateData.zoneId);
    }

    if (updateData.dayOfWeek !== undefined) {
      fields.push(`day_of_week = $${paramIndex++}`);
      params.push(updateData.dayOfWeek);
    }

    if (updateData.defaultSalesUserId !== undefined) {
      fields.push(`default_sales_user_id = $${paramIndex++}`);
      params.push(updateData.defaultSalesUserId);
    }

    if (updateData.isActive !== undefined) {
      fields.push(`is_active = $${paramIndex++}`);
      params.push(updateData.isActive);
    }

    if (fields.length === 0) {
      return this.getTemplateById(id);
    }

    params.push(id);
    const sql = `
      UPDATE schedule_templates
      SET ${fields.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    await query(sql, params);
    return this.getTemplateById(id);
  }

  /**
   * Deactivates or deletes a template.
   * @param {string} id
   */
  async deleteTemplate(id) {
    const sql = `
      DELETE FROM schedule_templates
      WHERE id = $1
      RETURNING *
    `;

    const result = await query(sql, [id]);
    return result.rows[0] || null;
  }
}

module.exports = new TemplatesRepository();
