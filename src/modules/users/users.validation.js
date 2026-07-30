const { z } = require('zod');

const updateUserSchema = z.object({
  name: z.string().min(2).optional(),
  email: z.string().email().optional(),
  role: z.enum(['admin', 'staff', 'driver']).optional(),
});

const userIdParamSchema = z.object({
  id: z.string().transform((val) => parseInt(val, 10)).pipe(
    z.number().int().positive('ID must be a positive integer')
  ),
});

module.exports = {
  updateUserSchema,
  userIdParamSchema,
};
