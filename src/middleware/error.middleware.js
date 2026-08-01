/**
 * Centralized Express Error Handling Middleware
 */
const errorHandler = (err, req, res, next) => {
  console.error(`[Error] ${req.method} ${req.url}:`, err);

  // Handle PostgreSQL Database Unique Constraint Violations (Code 23505)
  if (err.code === '23505') {
    return res.status(409).json({
      status: 'fail',
      message: 'Resource conflict: A record with matching unique fields already exists.',
      detail: err.detail,
    });
  }

  // Handle Custom Operational Status Codes
  const statusCode = err.statusCode || err.status || 500;
  const message = err.message || 'Internal Server Error';

  return res.status(statusCode).json({
    status: statusCode >= 500 ? 'error' : 'fail',
    message: message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
};

module.exports = errorHandler;
