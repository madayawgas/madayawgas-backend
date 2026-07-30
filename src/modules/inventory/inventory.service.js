const inventoryRepository = require('./inventory.repository');

/**
 * Service layer containing business logic for Inventory management
 */
class InventoryService {
  /**
   * Fetch all inventory items
   */
  async getAllItems(queryFilters) {
    return await inventoryRepository.findAll(queryFilters);
  }

  /**
   * Fetch a single inventory item by ID
   */
  async getItemById(id) {
    const item = await inventoryRepository.findById(id);
    if (!item) {
      const error = new Error(`Inventory item with ID ${id} not found.`);
      error.statusCode = 404;
      throw error;
    }
    return item;
  }

  /**
   * Create a new inventory item
   */
  async createItem(itemData) {
    // Check if SKU already exists
    const existingItem = await inventoryRepository.findBySku(itemData.sku);
    if (existingItem) {
      const error = new Error(`Inventory item with SKU '${itemData.sku}' already exists.`);
      error.statusCode = 409;
      throw error;
    }

    return await inventoryRepository.create(itemData);
  }

  /**
   * Update an existing inventory item
   */
  async updateItem(id, updateData) {
    // Ensure item exists
    await this.getItemById(id);

    // If updating SKU, check for uniqueness
    if (updateData.sku) {
      const existingItem = await inventoryRepository.findBySku(updateData.sku);
      if (existingItem && existingItem.id !== id) {
        const error = new Error(`SKU '${updateData.sku}' is already in use by another item.`);
        error.statusCode = 409;
        throw error;
      }
    }

    return await inventoryRepository.update(id, updateData);
  }

  /**
   * Delete an inventory item
   */
  async deleteItem(id) {
    // Ensure item exists
    await this.getItemById(id);

    return await inventoryRepository.delete(id);
  }
}

module.exports = new InventoryService();
