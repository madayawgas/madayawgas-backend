const { query } = require('../../../database/connection');

/**
 * History Repository
 * Pure PostgreSQL data access layer for system event history logs.
 */
class HistoryRepository {
  /**
   * Inserts a new system event history log.
   */
  async createLog({
    userId = null,
    userName,
    userRole,
    actionType,
    module,
    action,
    details,
    targetId = null,
    targetType = null,
    metadata = {},
    createdAt = null,
  }) {
    const params = [
      userId,
      userName,
      userRole,
      actionType,
      module,
      action,
      details,
      targetId,
      targetType,
      typeof metadata === 'object' ? JSON.stringify(metadata) : metadata,
    ];

    let sql;
    if (createdAt) {
      params.push(createdAt);
      sql = `
        INSERT INTO history_logs (
          user_id, user_name, user_role, action_type, module,
          action, details, target_id, target_type, metadata, created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING *;
      `;
    } else {
      sql = `
        INSERT INTO history_logs (
          user_id, user_name, user_role, action_type, module,
          action, details, target_id, target_type, metadata
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *;
      `;
    }

    const res = await query(sql, params);
    return res.rows[0];
  }

  /**
   * Retrieves history logs matching filter and search criteria with pagination.
   */
  async getLogs({
    module = null,
    actionType = null,
    search = null,
    limit = 100,
    offset = 0,
    startDate = null,
    endDate = null,
  } = {}) {
    const conditions = [];
    const params = [];

    if (module && module !== 'All Modules' && module.trim() !== '') {
      params.push(module.trim());
      conditions.push(`module = $${params.length}`);
    }

    if (actionType && actionType !== 'All' && actionType.trim() !== '') {
      params.push(actionType.trim());
      conditions.push(`action_type ILIKE $${params.length}`);
    }

    if (search && search.trim() !== '') {
      params.push(`%${search.trim()}%`);
      const idx = params.length;
      conditions.push(
        `(user_name ILIKE $${idx} OR details ILIKE $${idx} OR action_type ILIKE $${idx} OR module ILIKE $${idx} OR action ILIKE $${idx})`
      );
    }

    if (startDate) {
      params.push(startDate);
      conditions.push(`created_at >= $${params.length}`);
    }

    if (endDate) {
      params.push(endDate);
      conditions.push(`created_at <= $${params.length}`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    let limitClause = '';
    if (limit !== null && limit !== undefined && Number(limit) > 0) {
      params.push(Number(limit));
      limitClause += ` LIMIT $${params.length}`;
    }

    if (offset !== null && offset !== undefined && Number(offset) >= 0) {
      params.push(Number(offset));
      limitClause += ` OFFSET $${params.length}`;
    }

    const sql = `
      SELECT *
      FROM history_logs
      ${whereClause}
      ORDER BY created_at DESC
      ${limitClause};
    `;

    const res = await query(sql, params);
    return res.rows;
  }

  /**
   * Counts the total number of history logs matching the filter criteria.
   */
  async countLogs({
    module = null,
    actionType = null,
    search = null,
    startDate = null,
    endDate = null,
  } = {}) {
    const conditions = [];
    const params = [];

    if (module && module !== 'All Modules' && module.trim() !== '') {
      params.push(module.trim());
      conditions.push(`module = $${params.length}`);
    }

    if (actionType && actionType !== 'All' && actionType.trim() !== '') {
      params.push(actionType.trim());
      conditions.push(`action_type ILIKE $${params.length}`);
    }

    if (search && search.trim() !== '') {
      params.push(`%${search.trim()}%`);
      const idx = params.length;
      conditions.push(
        `(user_name ILIKE $${idx} OR details ILIKE $${idx} OR action_type ILIKE $${idx} OR module ILIKE $${idx} OR action ILIKE $${idx})`
      );
    }

    if (startDate) {
      params.push(startDate);
      conditions.push(`created_at >= $${params.length}`);
    }

    if (endDate) {
      params.push(endDate);
      conditions.push(`created_at <= $${params.length}`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const sql = `
      SELECT COUNT(*)::int AS total
      FROM history_logs
      ${whereClause};
    `;

    const res = await query(sql, params);
    return res.rows[0]?.total || 0;
  }

  /**
   * Retrieves a single history log by its UUID.
   */
  async getLogById(id) {
    const res = await query(
      `SELECT * FROM history_logs WHERE id = $1;`,
      [id]
    );
    return res.rows[0] || null;
  }
}

module.exports = new HistoryRepository();
