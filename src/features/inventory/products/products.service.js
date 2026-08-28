const productsRepository = require('./products.repository');

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
    isActive: Boolean(row.is_active),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Products Service
 * Encapsulates domain logic, validation, and DTO transformation for Inventory Item/Product management.
 */
class ProductsService {
  /**
   * Retrieves all inventory products with optional filters.
   * @param {Object} filters - { isActive, status, category, containerType, search }
   * @returns {Promise<Array>}
   */
  async getAllProducts(filters = {}) {
    const rows = await productsRepository.getAllProducts(filters);
    return rows.map(formatProduct);
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

    const createdRow = await productsRepository.createProduct({
      name: cleanName,
      category: cleanCategory,
      containerType: normalizedContainerType,
      netWeightKg: numWeight,
      isActive: data.isActive !== undefined ? Boolean(data.isActive) : true,
    });

    return formatProduct(createdRow);
  }

  /**
   * Updates an existing product profile.
   * @param {string} id - Product UUID
   * @param {Object} data - Update fields
   * @returns {Promise<Object>}
   */
  async updateProduct(id, data = {}) {
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

    // Validate isActive if provided
    if (data.isActive !== undefined) {
      updateFields.isActive = Boolean(data.isActive);
    }

    const updatedRow = await productsRepository.updateProduct(id, updateFields);
    return formatProduct(updatedRow);
  }

  /**
   * Deactivates a product by setting is_active to false.
   * @param {string} id - Product UUID
   * @returns {Promise<Object>}
   */
  async deactivateProduct(id) {
    if (!id || typeof id !== 'string') {
      throw new Error('Product ID is required');
    }

    const existing = await productsRepository.getProductById(id);
    if (!existing) {
      throw new Error('Product not found');
    }

    const deactivatedRow = await productsRepository.deactivateProduct(id);
    return formatProduct(deactivatedRow);
  }
}

module.exports = new ProductsService();
