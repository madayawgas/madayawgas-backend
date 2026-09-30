const { query } = require('../../../../database/connection');

/**
 * Service Zones Repository
 * Data access layer for delivery service zones and regional routing.
 */
class ZonesRepository {
  /**
   * Retrieves all service zones with optional active filter and search.
   * @param {Object} filters - { isActive, search }
   */
  async getAllZones(filters = {}) {
    const { isActive, search } = filters;
    const conditions = [];
    const params = [];
    let paramIndex = 1;

    if (isActive !== undefined && isActive !== null && isActive !== '') {
      conditions.push(`is_active = $${paramIndex++}`);
      params.push(isActive === true || isActive === 'true');
    }

    if (search && typeof search === 'string' && search.trim() !== '') {
      conditions.push(`(code ILIKE $${paramIndex} OR name ILIKE $${paramIndex} OR description ILIKE $${paramIndex})`);
      params.push(`%${search.trim()}%`);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const sql = `
      SELECT 
        id, 
        code, 
        name, 
        description, 
        is_active, 
        created_at, 
        updated_at
      FROM service_zones
      ${whereClause}
      ORDER BY name ASC, id ASC
    `;

    const result = await query(sql, params);
    return result.rows;
  }

  /**
   * Retrieves a single service zone by UUID.
   * @param {string} id - Zone UUID
   */
  async getZoneById(id) {
    const sql = `
      SELECT 
        id, 
        code, 
        name, 
        description, 
        is_active, 
        created_at, 
        updated_at
      FROM service_zones
      WHERE id = $1
    `;

    const result = await query(sql, [id]);
    return result.rows[0] || null;
  }

  /**
   * Finds a zone by unique code (case-insensitive).
   * @param {string} code
   */
  async getZoneByCode(code) {
    const sql = `
      SELECT *
      FROM service_zones
      WHERE UPPER(code) = UPPER($1)
    `;

    const result = await query(sql, [code]);
    return result.rows[0] || null;
  }

  /**
   * Finds a zone by unique name (case-insensitive).
   * @param {string} name
   */
  async getZoneByName(name) {
    const sql = `
      SELECT *
      FROM service_zones
      WHERE UPPER(name) = UPPER($1)
    `;

    const result = await query(sql, [name]);
    return result.rows[0] || null;
  }

  /**
   * Inserts a new service zone.
   * @param {Object} zoneData
   */
  async createZone({ code, name, description = null, isActive = true }) {
    const sql = `
      INSERT INTO service_zones (code, name, description, is_active)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `;

    const result = await query(sql, [code.toUpperCase().trim(), name.trim(), description, isActive]);
    return result.rows[0];
  }

  /**
   * Updates an existing service zone.
   * @param {string} id - Zone UUID
   * @param {Object} updateData
   */
  async updateZone(id, updateData) {
    const fields = [];
    const params = [];
    let paramIndex = 1;

    if (updateData.code !== undefined) {
      fields.push(`code = $${paramIndex++}`);
      params.push(updateData.code.toUpperCase().trim());
    }

    if (updateData.name !== undefined) {
      fields.push(`name = $${paramIndex++}`);
      params.push(updateData.name.trim());
    }

    if (updateData.description !== undefined) {
      fields.push(`description = $${paramIndex++}`);
      params.push(updateData.description);
    }

    if (updateData.isActive !== undefined) {
      fields.push(`is_active = $${paramIndex++}`);
      params.push(updateData.isActive);
    }

    if (fields.length === 0) {
      return this.getZoneById(id);
    }

    params.push(id);
    const sql = `
      UPDATE service_zones
      SET ${fields.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    const result = await query(sql, params);
    return result.rows[0] || null;
  }
}

module.exports = new ZonesRepository();
