const settingsRepository = require('./settings.repository');
const { historyService, EVENTS } = require('../history');

const CACHE_TTL_MS = 60 * 1000;

/**
 * Parses a raw stored string value according to its declared value_type.
 * @param {string} rawValue
 * @param {string} valueType
 * @returns {number|boolean|string}
 */
function parseTypedValue(rawValue, valueType) {
  if (valueType === 'INTEGER') {
    return parseInt(rawValue, 10);
  }
  if (valueType === 'NUMBER') {
    return Number(rawValue);
  }
  if (valueType === 'BOOLEAN') {
    return String(rawValue).toLowerCase() === 'true';
  }
  return String(rawValue);
}

/**
 * Formats a database row from system_settings into a clean API DTO.
 * @param {Object} row
 * @returns {Object}
 */
function formatSettingDto(row) {
  const updatedByName = [row.updated_by_first_name, row.updated_by_last_name]
    .filter(Boolean)
    .join(' ')
    .trim();

  return {
    key: row.key,
    value: parseTypedValue(row.value, row.value_type),
    rawValue: row.value,
    valueType: row.value_type,
    category: row.category,
    label: row.label,
    description: row.description || null,
    unit: row.unit || null,
    minValue: row.min_value !== null && row.min_value !== undefined ? Number(row.min_value) : null,
    maxValue: row.max_value !== null && row.max_value !== undefined ? Number(row.max_value) : null,
    updatedBy: row.updated_by
      ? {
          id: row.updated_by,
          username: row.updated_by_username || null,
          fullName: updatedByName || row.updated_by_username || null,
        }
      : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Validates and normalizes an incoming setting value against its schema rules.
 * @param {Object} existingRow
 * @param {*} rawInput
 * @returns {string} Canonical string representation for persistence
 */
function validateAndNormalizeValue(existingRow, rawInput) {
  if (rawInput === undefined || rawInput === null || rawInput === '') {
    const err = new Error('Setting value is required');
    err.statusCode = 400;
    throw err;
  }

  const { value_type: valueType, min_value: minVal, max_value: maxVal, key } = existingRow;

  if (valueType === 'INTEGER' || valueType === 'NUMBER') {
    if (typeof rawInput === 'boolean' || (typeof rawInput === 'string' && rawInput.trim() === '')) {
      const err = new Error(`Setting '${key}' requires a valid ${valueType.toLowerCase()} value`);
      err.statusCode = 400;
      throw err;
    }

    const num = Number(rawInput);
    if (!Number.isFinite(num)) {
      const err = new Error(`Setting '${key}' requires a valid ${valueType.toLowerCase()} value`);
      err.statusCode = 400;
      throw err;
    }

    if (valueType === 'INTEGER' && !Number.isInteger(num)) {
      const err = new Error(`Setting '${key}' must be a whole integer`);
      err.statusCode = 400;
      throw err;
    }

    if (minVal !== null && minVal !== undefined && num < Number(minVal)) {
      const err = new Error(`Setting '${key}' must be at least ${Number(minVal)}`);
      err.statusCode = 400;
      throw err;
    }

    if (maxVal !== null && maxVal !== undefined && num > Number(maxVal)) {
      const err = new Error(`Setting '${key}' cannot exceed ${Number(maxVal)}`);
      err.statusCode = 400;
      throw err;
    }

    return String(num);
  }

  if (valueType === 'BOOLEAN') {
    if (typeof rawInput === 'boolean') {
      return String(rawInput);
    }
    const lower = String(rawInput).trim().toLowerCase();
    if (lower !== 'true' && lower !== 'false') {
      const err = new Error(`Setting '${key}' must be a boolean (true or false)`);
      err.statusCode = 400;
      throw err;
    }
    return lower;
  }

  return String(rawInput).trim();
}

/**
 * Business System Settings Service with write-through in-memory caching.
 */
class SettingsService {
  constructor() {
    this._cache = new Map();
    this._cacheLoadedAt = 0;
  }

  /**
   * Clears the in-memory settings cache (primarily for test isolation).
   */
  clearCache() {
    this._cache.clear();
    this._cacheLoadedAt = 0;
  }

  /**
   * Ensures the in-memory cache is populated and fresh.
   */
  async _ensureCache() {
    const now = Date.now();
    if (this._cache.size > 0 && now - this._cacheLoadedAt < CACHE_TTL_MS) {
      return;
    }

    try {
      const rows = await settingsRepository.findAll();
      this._cache.clear();
      for (const row of rows) {
        this._cache.set(row.key, row);
      }
      this._cacheLoadedAt = Date.now();
    } catch {
      // Allow graceful fallback to caller defaults if DB is temporarily unavailable
    }
  }

  /**
   * Internal typed accessor for integer business settings.
   * @param {string} key
   * @param {number} fallback
   * @returns {Promise<number>}
   */
  async getInteger(key, fallback) {
    await this._ensureCache();
    const row = this._cache.get(key);
    if (!row) return fallback;
    const parsed = parseInt(row.value, 10);
    return Number.isInteger(parsed) ? parsed : fallback;
  }

  /**
   * Internal typed accessor for numeric (integer or decimal) business settings.
   * @param {string} key
   * @param {number} fallback
   * @returns {Promise<number>}
   */
  async getNumber(key, fallback) {
    await this._ensureCache();
    const row = this._cache.get(key);
    if (!row) return fallback;
    const parsed = Number(row.value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  /**
   * Internal typed accessor for boolean business settings.
   * @param {string} key
   * @param {boolean} fallback
   * @returns {Promise<boolean>}
   */
  async getBoolean(key, fallback) {
    await this._ensureCache();
    const row = this._cache.get(key);
    if (!row) return fallback;
    return String(row.value).toLowerCase() === 'true';
  }

  /**
   * Internal typed accessor for string business settings.
   * @param {string} key
   * @param {string} fallback
   * @returns {Promise<string>}
   */
  async getString(key, fallback) {
    await this._ensureCache();
    const row = this._cache.get(key);
    if (!row) return fallback;
    return String(row.value);
  }

  /**
   * Lists all system settings, optionally filtered by category.
   * @param {Object} [filters]
   * @returns {Promise<Array<Object>>}
   */
  async listSettings(filters = {}) {
    const rows = await settingsRepository.findAll(filters);
    return rows.map(formatSettingDto);
  }

  /**
   * Retrieves a single setting by key.
   * @param {string} key
   * @returns {Promise<Object>}
   */
  async getSettingByKey(key) {
    if (!key || typeof key !== 'string' || key.trim().length === 0) {
      const err = new Error('Setting key is required');
      err.statusCode = 400;
      throw err;
    }

    const row = await settingsRepository.findByKey(key.trim());
    if (!row) {
      const err = new Error(`System setting '${key.trim()}' not found`);
      err.statusCode = 404;
      throw err;
    }

    return formatSettingDto(row);
  }

  /**
   * Validates and updates a business system setting, refreshing the cache and logging history.
   * @param {string} key
   * @param {*} rawValue
   * @param {Object} actorUser
   * @returns {Promise<Object>}
   */
  async updateSetting(key, rawValue, actorUser) {
    if (!key || typeof key !== 'string' || key.trim().length === 0) {
      const err = new Error('Setting key is required');
      err.statusCode = 400;
      throw err;
    }

    const cleanKey = key.trim();
    const existing = await settingsRepository.findByKey(cleanKey);
    if (!existing) {
      const err = new Error(`System setting '${cleanKey}' not found`);
      err.statusCode = 404;
      throw err;
    }

    const normalizedValue = validateAndNormalizeValue(existing, rawValue);
    const oldValue = existing.value;

    const updated = await settingsRepository.updateByKey(cleanKey, {
      value: normalizedValue,
      updatedBy: actorUser?.id || null,
    });

    // Write-through cache update
    if (updated) {
      this._cache.set(cleanKey, updated);
      this._cacheLoadedAt = Date.now();
    }

    await historyService.log(EVENTS.SYSTEM_SETTING_UPDATED, {
      actorUser,
      payload: {
        key: cleanKey,
        oldValue,
        newValue: normalizedValue,
      },
      metadata: {
        settingKey: cleanKey,
        category: existing.category,
        oldValue,
        newValue: normalizedValue,
      },
    });

    return formatSettingDto(updated);
  }
}

module.exports = new SettingsService();
