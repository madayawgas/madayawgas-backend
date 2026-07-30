const { z } = require('zod');

// Schema for creating a new inventory item
const createInventoryItemSchema = z.object({
  name: z.string().min(2, 'Item name must be at least 2 characters'),
  sku: z.string().min(3, 'SKU must be at least 3 characters'),
  category: z.string().min(1, 'Category is required'),
  quantity: z.number().int().nonnegative('Quantity cannot be negative').default(0),
  unit_price: z.number().positive('Unit price must be greater than zero'),
  reorder_level: z.number().int().nonnegative('Reorder level must be non-negative').default(10),
});

// Schema for updating an inventory item
const updateInventoryItemSchema = createInventoryItemSchema.partial();

// Schema for route params containing ID
const inventoryIdParamSchema = z.object({
  id: z.string().transform((val) => parseInt(val, 10)).pipe(
    z.number().int().positive('ID must be a positive integer')
  ),
});

// Schema for inventory query filters
const inventoryQuerySchema = z.object({
  category: z.string().optional(),
  search: z.string().optional(),
  page: z.string().optional().transform((val) => (val ? parseInt(val, 10) : 1)),
  limit: z.string().optional().transform((val) => (val ? parseInt(val, 10) : 10)),
});

module.exports = {
  createInventoryItemSchema,
  updateInventoryItemSchema,
  inventoryIdParamSchema,
  inventoryQuerySchema,
};
