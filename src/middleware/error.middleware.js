const { isProduction } = require('../config/env');

/**
 * Centralized Global Error Handler Middleware
 */
const errorHandler = (err, req, res, next) => {
  const statusCode = err.statusCode || err.status || 500;
  const message = err.message || 'Internal Server Error';

  res.status(statusCode).json({
    status: statusCode >= 500 ? 'error' : 'fail',
    message,
    ...(err.code && { code: err.code }),
    ...(!isProduction && { stack: err.stack }),
  });
};

module.exports = errorHandler;
