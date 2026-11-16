const productsRepository = require('./products.repository');
const { historyService, EVENTS } = require('../../history');
const { calculateOffset, buildPaginationMeta } = require('../../../utils/pagination');
const { safeEmitSocketEvent } = require('../../../socket');

const ALLOWED_CONTAINER_TYPES = ['CYLINDER', 'CANISTER'];

/**
 * Maps database row to camelCase DTO.
 * @param {Object} row
 * @returns {Object|null}
 */
function formatProduct(row) {
  if (!row) return null;

  return {
    id: row.id,
    name: row.name,
    category: row.category,
    containerType: row.container_type,
    netWeightKg: Number(row.net_weight_kg),
    unitPrice: Number(row.unit_price ?? 0),
    isActive: Boolean(row.is_active),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Validates and normalizes a product unit price.
 * @param {*} rawPrice
 * @returns {number}
 */
function parseAndValidateUnitPrice(rawPrice) {
  if (rawPrice === undefined || rawPrice === null || rawPrice === '') {
    throw new Error('Unit price is required');
  }
  const numPrice = Number(rawPrice);
  if (!Number.isFinite(numPrice) || numPrice < 0) {
    throw new Error('Unit price must be a non-negative number (>= 0)');
  }
  if (numPrice > 99999999.99) {
    throw new Error('Unit price cannot exceed 99,999,999.99');
  }
  return Number(numPrice.toFixed(2));
}

/**
 * Products Service
 * Encapsulates domain logic, validation, and DTO transformation for Inventory Item/Product management.
 */
class ProductsService {
  /**
   * Retrieves all inventory products with optional filters and pagination.
   *
   * @param {Object} [filters={}] - { isActive, status, category, containerType, search }
   * @param {Object} [pagination=null] - Optional pagination { page, limit, sortColumn, sortOrder }
   * @returns {Promise<Array|Object>}
   */
  async getAllProducts(filters = {}, pagination = null) {
    if (!pagination) {
      const rows = await productsRepository.getAllProducts(filters);
      return rows.map(formatProduct);
    }

    const offset = calculateOffset(pagination.page, pagination.limit);
    const { rows, total } = await productsRepository.getAllProducts(filters, {
      ...pagination,
      offset,
    });

    const items = rows.map(formatProduct);
    const meta = buildPaginationMeta(total, pagination.page, pagination.limit);

    return {
      items,
      meta,
    };
  }

  /**
   * Retrieves a single product by ID.
   * @param {string} id - Product UUID
   * @returns {Promise<Object>}
   */
  async getProductById(id) {
    if (!id || typeof id !== 'string') {
      throw new Error('Product ID is required');
    }

    const row = await productsRepository.getProductById(id);
    if (!row) {
      throw new Error('Product not found');
    }

    return formatProduct(row);
  }

  /**
   * Registers a new product into the inventory system.
   * @param {Object} actorUser - Authenticated user context
   * @param {Object} data - { name, category, containerType, netWeightKg, isActive }
   * @returns {Promise<Object>}
   */
  async createProduct(actorUser, data = {}) {
    const name = data.name;
    const category = data.category;
    const rawContainerType = data.containerType || data.container_type;
    const rawNetWeight = data.netWeightKg !== undefined ? data.netWeightKg : data.net_weight_kg;

    // 1. Validate name
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      throw new Error('Product name is required');
    }
    const cleanName = name.trim();
    if (cleanName.length > 255) {
      throw new Error('Product name cannot exceed 255 characters');
    }

    // Check duplicate name
    const existing = await productsRepository.findProductByName(cleanName);
    if (existing) {
      throw new Error(`Product with name '${cleanName}' already exists`);
    }

    // 2. Validate category
    if (!category || typeof category !== 'string' || category.trim().length === 0) {
      throw new Error('Category is required');
    }
    const cleanCategory = category.trim();
    if (cleanCategory.length > 100) {
      throw new Error('Category cannot exceed 100 characters');
    }

    // 3. Validate container type
    if (!rawContainerType || typeof rawContainerType !== 'string') {
      throw new Error('Container type is required (CYLINDER or CANISTER)');
    }
    const normalizedContainerType = rawContainerType.trim().toUpperCase();
    if (!ALLOWED_CONTAINER_TYPES.includes(normalizedContainerType)) {
      throw new Error(`Invalid container type '${rawContainerType}'. Allowed values: ${ALLOWED_CONTAINER_TYPES.join(', ')}`);
    }

    // 4. Validate net weight
    const numWeight = Number(rawNetWeight);
    if (rawNetWeight === undefined || rawNetWeight === null || isNaN(numWeight) || numWeight <= 0) {
      throw new Error('Net weight (kg) must be a positive number greater than 0');
    }
    if (numWeight > 999.999) {
      throw new Error('Net weight (kg) cannot exceed 999.999 kg');
    }

    // 5. Validate unit price (required, >= 0.00)
    const rawUnitPrice = data.unitPrice !== undefined ? data.unitPrice : (data.unit_price !== undefined ? data.unit_price : data.price);
    const numUnitPrice = parseAndValidateUnitPrice(rawUnitPrice);

    const createdRow = await productsRepository.createProduct({
      name: cleanName,
      category: cleanCategory,
      containerType: normalizedContainerType,
      netWeightKg: numWeight,
      unitPrice: numUnitPrice,
      isActive: data.isActive !== undefined ? Boolean(data.isActive) : true,
    });

    const result = formatProduct(createdRow);

    await historyService.log(EVENTS.PRODUCT_CREATED, {
      actorUser,
      targetId: result.id,
      payload: { name: result.name, category: result.category },
      metadata: {
        containerType: result.containerType,
        netWeightKg: result.netWeightKg,
        unitPrice: result.unitPrice,
      },
    });

    safeEmitSocketEvent('PRODUCT_CATALOG_UPDATED', {
      product: result,
      action: 'CREATED',
      updatedAt: new Date().toISOString(),
    }, ['room:inventory', 'room:sales', 'room:catalog']);

    return result;
  }

  /**
   * Updates an existing product profile.
   * @param {Object} actorUser - Authenticated user context
   * @param {string} id - Product UUID
   * @param {Object} data - Update fields
   * @returns {Promise<Object>}
   */
  async updateProduct(actorUser, id, data = {}) {
    if (!id || typeof id !== 'string') {
      throw new Error('Product ID is required');
    }

    const existing = await productsRepository.getProductById(id);
    if (!existing) {
      throw new Error('Product not found');
    }

    const updateFields = {};

    // Validate name if provided
    if (data.name !== undefined) {
      if (typeof data.name !== 'string' || data.name.trim().length === 0) {
        throw new Error('Product name cannot be empty');
      }
      const cleanName = data.name.trim();
      if (cleanName.length > 255) {
        throw new Error('Product name cannot exceed 255 characters');
      }
      const existingWithName = await productsRepository.findProductByName(cleanName);
      if (existingWithName && existingWithName.id !== id) {
        throw new Error(`Product with name '${cleanName}' already exists`);
      }
      updateFields.name = cleanName;
    }

    // Validate category if provided
    if (data.category !== undefined) {
      if (typeof data.category !== 'string' || data.category.trim().length === 0) {
        throw new Error('Category cannot be empty');
      }
      const cleanCategory = data.category.trim();
      if (cleanCategory.length > 100) {
        throw new Error('Category cannot exceed 100 characters');
      }
      updateFields.category = cleanCategory;
    }

    // Validate container type if provided
    const rawContainerType = data.containerType || data.container_type;
    if (rawContainerType !== undefined) {
      if (typeof rawContainerType !== 'string') {
        throw new Error('Invalid container type');
      }
      const normalizedContainerType = rawContainerType.trim().toUpperCase();
      if (!ALLOWED_CONTAINER_TYPES.includes(normalizedContainerType)) {
        throw new Error(`Invalid container type '${rawContainerType}'. Allowed values: ${ALLOWED_CONTAINER_TYPES.join(', ')}`);
      }
      updateFields.containerType = normalizedContainerType;
    }

    // Validate net weight if provided
    const rawNetWeight = data.netWeightKg !== undefined ? data.netWeightKg : data.net_weight_kg;
    if (rawNetWeight !== undefined) {
      const numWeight = Number(rawNetWeight);
      if (isNaN(numWeight) || numWeight <= 0) {
        throw new Error('Net weight (kg) must be a positive number greater than 0');
      }
      if (numWeight > 999.999) {
        throw new Error('Net weight (kg) cannot exceed 999.999 kg');
      }
      updateFields.netWeightKg = numWeight;
    }

    // Validate unit price if provided
    const rawUnitPrice = data.unitPrice !== undefined ? data.unitPrice : (data.unit_price !== undefined ? data.unit_price : data.price);
    if (rawUnitPrice !== undefined) {
      updateFields.unitPrice = parseAndValidateUnitPrice(rawUnitPrice);
    }

    // Guard deactivation behind dedicated password-confirmed endpoint
    if (data.isActive !== undefined) {
      if (Boolean(data.isActive) === false) {
        throw new Error('Use PATCH /api/inventory/products/:id/deactivate with password confirmation to deactivate a product');
      }
      updateFields.isActive = true;
    }

    const updatedRow = await productsRepository.updateProduct(id, updateFields);
    const updated = formatProduct(updatedRow);

    await historyService.log(EVENTS.PRODUCT_UPDATED, {
      actorUser,
      targetId: id,
      payload: { name: updated.name },
      metadata: {
        updatedFields: Object.keys(updateFields),
        previousUnitPrice: Number(existing.unit_price ?? 0),
        unitPrice: updated.unitPrice,
      },
    });

    safeEmitSocketEvent('PRODUCT_CATALOG_UPDATED', {
      product: updated,
      action: 'UPDATED',
      previousUnitPrice: Number(existing.unit_price ?? 0),
      updatedAt: new Date().toISOString(),
    }, ['room:inventory', 'room:sales', 'room:catalog']);

    return updated;
  }

  /**
   * Deactivates a product by setting is_active to false.
   * @param {Object} actorUser - Authenticated user context
   * @param {string} id - Product UUID
   * @returns {Promise<Object>}
   */
  async deactivateProduct(actorUser, id) {
    if (!id || typeof id !== 'string') {
      throw new Error('Product ID is required');
    }

    const existing = await productsRepository.getProductById(id);
    if (!existing) {
      throw new Error('Product not found');
    }

    const deactivatedRow = await productsRepository.deactivateProduct(id);
    const deactivated = formatProduct(deactivatedRow);

    await historyService.log(EVENTS.PRODUCT_DEACTIVATED, {
      actorUser,
      targetId: id,
      payload: { name: deactivated.name },
    });

    safeEmitSocketEvent('PRODUCT_CATALOG_UPDATED', {
      product: deactivated,
      action: 'DEACTIVATED',
      updatedAt: new Date().toISOString(),
    }, ['room:inventory', 'room:sales', 'room:catalog']);

    return deactivated;
  }

  /**
   * Re-activates a product by setting is_active to true.
   * @param {Object} actorUser - Authenticated user context
   * @param {string} id - Product UUID
   * @returns {Promise<Object>}
   */
  async activateProduct(actorUser, id) {
    if (!id || typeof id !== 'string') {
      throw new Error('Product ID is required');
    }

    const existing = await productsRepository.getProductById(id);
    if (!existing) {
      throw new Error('Product not found');
    }

    const activatedRow = await productsRepository.activateProduct(id);
    const activated = formatProduct(activatedRow);

    await historyService.log(EVENTS.PRODUCT_ACTIVATED, {
      actorUser,
      targetId: id,
      payload: { name: activated.name },
    });

    safeEmitSocketEvent('PRODUCT_CATALOG_UPDATED', {
      product: activated,
      action: 'ACTIVATED',
      updatedAt: new Date().toISOString(),
    }, ['room:inventory', 'room:sales', 'room:catalog']);

    return activated;
  }
}

module.exports = new ProductsService();
