/**
 * Middleware factory for validating incoming request data against a Zod schema
 * 
 * @param {import('zod').ZodSchema} schema - Zod schema to validate against
 * @param {'body' | 'query' | 'params'} target - Request object property to validate
 */
const validate = (schema, target = 'body') => {
  return (req, res, next) => {
    try {
      const parsedData = schema.parse(req[target]);
      req[target] = parsedData;
      next();
    } catch (error) {
      next(error);
    }
  };
};

module.exports = validate;
