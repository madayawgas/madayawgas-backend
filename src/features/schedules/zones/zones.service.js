const zonesRepository = require('./zones.repository');

/**
 * Service Zones Service
 * Business logic and validation for service zone routing management.
 */
class ZonesService {
  /**
   * Retrieves all service zones.
   * @param {Object} filters
   */
  async getAllZones(filters = {}) {
    return zonesRepository.getAllZones(filters);
  }

  /**
   * Retrieves a single service zone by UUID.
   * @param {string} id
   */
  async getZoneById(id) {
    if (!id || typeof id !== 'string') {
      const err = new Error('Zone ID is required');
      err.statusCode = 400;
      throw err;
    }

    const zone = await zonesRepository.getZoneById(id);
    if (!zone) {
      const err = new Error('Service zone not found');
      err.statusCode = 404;
      throw err;
    }

    return zone;
  }

  /**
   * Registers a new service zone.
   * @param {Object} actorUser
   * @param {Object} data - { code, name, description, isActive }
   */
  async createZone(actorUser, data = {}) {
    const { code, name, description, isActive } = data;

    if (!code || typeof code !== 'string' || code.trim().length === 0) {
      const err = new Error('Zone code is required');
      err.statusCode = 400;
      throw err;
    }

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      const err = new Error('Zone name is required');
      err.statusCode = 400;
      throw err;
    }

    const existingCode = await zonesRepository.getZoneByCode(code.trim());
    if (existingCode) {
      const err = new Error(`Zone code '${code.trim().toUpperCase()}' already exists`);
      err.statusCode = 409;
      throw err;
    }

    const existingName = await zonesRepository.getZoneByName(name.trim());
    if (existingName) {
      const err = new Error(`Zone name '${name.trim()}' already exists`);
      err.statusCode = 409;
      throw err;
    }

    return zonesRepository.createZone({
      code: code.trim().toUpperCase(),
      name: name.trim(),
      description: description ? description.trim() : null,
      isActive: isActive !== undefined ? Boolean(isActive) : true,
    });
  }

  /**
   * Updates an existing service zone.
   * @param {string} id
   * @param {Object} actorUser
   * @param {Object} data
   */
  async updateZone(id, actorUser, data = {}) {
    await this.getZoneById(id);

    const updatePayload = {};

    if (data.code !== undefined) {
      if (typeof data.code !== 'string' || data.code.trim().length === 0) {
        const err = new Error('Zone code cannot be empty');
        err.statusCode = 400;
        throw err;
      }
      const existingCode = await zonesRepository.getZoneByCode(data.code.trim());
      if (existingCode && existingCode.id !== id) {
        const err = new Error(`Zone code '${data.code.trim().toUpperCase()}' already exists`);
        err.statusCode = 409;
        throw err;
      }
      updatePayload.code = data.code.trim().toUpperCase();
    }

    if (data.name !== undefined) {
      if (typeof data.name !== 'string' || data.name.trim().length === 0) {
        const err = new Error('Zone name cannot be empty');
        err.statusCode = 400;
        throw err;
      }
      const existingName = await zonesRepository.getZoneByName(data.name.trim());
      if (existingName && existingName.id !== id) {
        const err = new Error(`Zone name '${data.name.trim()}' already exists`);
        err.statusCode = 409;
        throw err;
      }
      updatePayload.name = data.name.trim();
    }

    if (data.description !== undefined) {
      updatePayload.description = data.description ? data.description.trim() : null;
    }

    if (data.isActive !== undefined) {
      updatePayload.isActive = Boolean(data.isActive);
    }

    return zonesRepository.updateZone(id, updatePayload);
  }
}

module.exports = new ZonesService();
