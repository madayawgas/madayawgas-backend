const { z } = require('zod');

const createDeliverySchema = z.object({
  customer_name: z.string().min(2, 'Customer name is required'),
  delivery_address: z.string().min(5, 'Delivery address is required'),
  driver_id: z.number().int().optional(),
  status: z.enum(['pending', 'in_transit', 'delivered', 'cancelled']).default('pending'),
  items: z.array(
    z.object({
      inventory_id: z.number().int().positive(),
      quantity: z.number().int().positive(),
    })
  ).min(1, 'At least one delivery item is required'),
});

const updateDeliveryStatusSchema = z.object({
  status: z.enum(['pending', 'in_transit', 'delivered', 'cancelled']),
  driver_id: z.number().int().optional(),
});

const deliveryIdParamSchema = z.object({
  id: z.string().transform((val) => parseInt(val, 10)).pipe(
    z.number().int().positive('ID must be a positive integer')
  ),
});

module.exports = {
  createDeliverySchema,
  updateDeliveryStatusSchema,
  deliveryIdParamSchema,
};
