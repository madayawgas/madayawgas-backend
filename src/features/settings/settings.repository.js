const { query } = require('../../../database/connection');

/**
 * Data access layer for organization-wide business system settings.
 */
class SettingsRepository {
  /**
   * Lists all system settings, optionally filtered by category.
   * @param {Object} [filters]
   * @param {string} [filters.category]
   * @returns {Promise<Array<Object>>}
   */
  async findAll({ category } = {}) {
    const conditions = [];
    const params = [];

    if (category && typeof category === 'string' && category.trim().length > 0) {
      params.push(category.trim().toUpperCase());
      conditions.push(`s.category = $${params.length}`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const sql = `
      SELECT
        s.key,
        s.value,
        s.value_type,
        s.category,
        s.label,
        s.description,
        s.unit,
        s.min_value,
        s.max_value,
        s.updated_by,
        u.username AS updated_by_username,
        u.first_name AS updated_by_first_name,
        u.last_name AS updated_by_last_name,
        s.created_at,
        s.updated_at
      FROM system_settings s
      LEFT JOIN users u ON s.updated_by = u.id
      ${whereClause}
      ORDER BY s.category ASC, s.key ASC
    `;

    const result = await query(sql, params);
    return result.rows;
  }

  /**
   * Fetches a single system setting by key.
   * @param {string} key
   * @returns {Promise<Object|null>}
   */
  async findByKey(key) {
    const sql = `
      SELECT
        s.key,
        s.value,
        s.value_type,
        s.category,
        s.label,
        s.description,
        s.unit,
        s.min_value,
        s.max_value,
        s.updated_by,
        u.username AS updated_by_username,
        u.first_name AS updated_by_first_name,
        u.last_name AS updated_by_last_name,
        s.created_at,
        s.updated_at
      FROM system_settings s
      LEFT JOIN users u ON s.updated_by = u.id
      WHERE s.key = $1
      LIMIT 1
    `;

    const result = await query(sql, [key]);
    return result.rows[0] || null;
  }

  /**
   * Updates a system setting's value and audit fields.
   * @param {string} key
   * @param {Object} data - { value, updatedBy }
   * @returns {Promise<Object|null>}
   */
  async updateByKey(key, { value, updatedBy }) {
    const sql = `
      UPDATE system_settings
      SET
        value = $1,
        updated_by = $2,
        updated_at = NOW()
      WHERE key = $3
      RETURNING key
    `;

    const result = await query(sql, [String(value), updatedBy || null, key]);
    if (result.rows.length === 0) return null;
    return this.findByKey(key);
  }
}

module.exports = new SettingsRepository();
