const historyRepository = require('./history.repository');
const { resolveEvent } = require('./history.events');

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
];

/**
 * Formats a database row into standard history log DTO matching frontend expectations.
 */
function formatLogItem(row) {
  if (!row) return null;

  const dateObj = new Date(row.created_at);
  const month = MONTH_NAMES[dateObj.getMonth()] || 'Jan';
  const day = dateObj.getDate();
  const year = dateObj.getFullYear();
  const dateStr = `${month} ${day}, ${year}`;

  let hours = dateObj.getHours();
  const minutes = String(dateObj.getMinutes()).padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12;
  const formattedHours = String(hours).padStart(2, '0');
  const timeStr = `${formattedHours}:${minutes} ${ampm}`;

  let parsedMetadata = {};
  if (row.metadata) {
    if (typeof row.metadata === 'object') {
      parsedMetadata = row.metadata;
    } else if (typeof row.metadata === 'string') {
      try {
        parsedMetadata = JSON.parse(row.metadata);
      } catch {
        parsedMetadata = {};
      }
    }
  }

  return {
    id: row.id,
    date: dateStr,
    time: timeStr,
    userName: row.user_name,
    userRole: row.user_role,
    actionType: row.action_type,
    module: row.module,
    details: row.details,
    action: row.action,
    targetId: row.target_id || null,
    targetType: row.target_type || null,
    metadata: parsedMetadata,
    createdAt: row.created_at,
  };
}

/**
 * History Service
 * Business logic and operational logging coordinator for system events.
 */
class HistoryService {
  /**
   * Primary logging API using the Centralized Event Registry & Template Resolver.
   * @param {string} eventKey - Identifier from EVENTS (e.g. EVENTS.PRODUCT_CREATED)
   * @param {Object} options - { actorUser, targetId, payload, metadata, userId, userName, userRole, createdAt }
   */
  async log(eventKey, {
    actorUser = null,
    targetId = null,
    payload = {},
    metadata = {},
    userId = null,
    userName = null,
    userRole = null,
    createdAt = null,
    actionType = null,
    module = null,
    details = null,
    targetType = null,
  } = {}) {
    const resolved = resolveEvent(eventKey, payload, {
      actionType,
      module,
      details,
      targetType,
    });

    return this.logEvent({
      actorUser,
      userId,
      userName,
      userRole,
      actionType: resolved.actionType,
      module: resolved.module,
      action: resolved.action,
      details: resolved.details,
      targetId,
      targetType: resolved.targetType,
      metadata,
      createdAt,
    });
  }

  /**
   * Records a system event into the history log table.
   * Can accept either an actorUser session object or explicit user details.
   */
  async logEvent({
    actorUser = null,
    userId = null,
    userName = null,
    userRole = null,
    actionType = 'Updated',
    module = 'System',
    action = 'EVENT_LOGGED',
    details = '',
    targetId = null,
    targetType = null,
    metadata = {},
    createdAt = null,
  } = {}) {
    try {
      const resolvedUserId = actorUser?.id || userId || null;
      let resolvedUserName = 'System';
      if (actorUser) {
        const first = actorUser.firstName || actorUser.first_name || '';
        const last = actorUser.lastName || actorUser.last_name || '';
        const full = `${first} ${last}`.trim();
        resolvedUserName = full || actorUser.username || 'System Admin';
      } else if (userName) {
        resolvedUserName = userName;
      }

      const resolvedUserRole =
        actorUser?.role ||
        actorUser?.role_name ||
        userRole ||
        'System Admin';

      const row = await historyRepository.createLog({
        userId: resolvedUserId,
        userName: resolvedUserName,
        userRole: resolvedUserRole,
        actionType,
        module,
        action,
        details,
        targetId: targetId !== null && targetId !== undefined ? String(targetId) : null,
        targetType,
        metadata,
        createdAt,
      });

      return formatLogItem(row);
    } catch (err) {
      console.error('[HistoryService] Failed to record logEvent:', err.message);
      return null;
    }
  }

  /**
   * Retrieves list of history logs with optional module, action type, search, and pagination.
   */
  async getHistoryLogs({
    module = null,
    actionType = null,
    search = null,
    limit = 100,
    offset = 0,
    startDate = null,
    endDate = null,
  } = {}) {
    const [rows, total] = await Promise.all([
      historyRepository.getLogs({
        module,
        actionType,
        search,
        limit,
        offset,
        startDate,
        endDate,
      }),
      historyRepository.countLogs({
        module,
        actionType,
        search,
        startDate,
        endDate,
      }),
    ]);

    const formattedLogs = rows.map(formatLogItem);

    return {
      logs: formattedLogs,
      count: formattedLogs.length,
      total,
    };
  }

  /**
   * Retrieves a single history log record by ID.
   */
  async getHistoryLogById(id) {
    if (!id || typeof id !== 'string') {
      throw new Error('History log ID is required');
    }

    const row = await historyRepository.getLogById(id);
    if (!row) {
      throw new Error('History log not found');
    }

    return formatLogItem(row);
  }
}

module.exports = new HistoryService();
