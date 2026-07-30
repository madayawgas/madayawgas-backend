/**
 * Higher-order function to catch errors from async express route handlers
 * and forward them to express error handling middleware.
 *
 * @param {Function} fn - Async controller/middleware function
 * @returns {Function} Express middleware function
 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = asyncHandler;
