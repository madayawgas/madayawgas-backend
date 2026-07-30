const jwt = require('jsonwebtoken');

/**
 * Middleware to authenticate requests using JWT Bearer Tokens
 */
const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      status: 'fail',
      message: 'Access denied. No authentication token provided.',
    });
  }

  const token = authHeader.split(' ')[1];

  try {
    const secret = process.env.JWT_SECRET || 'madayawgas_super_secret_jwt_key_2026_change_in_prod';
    const decoded = jwt.verify(token, secret);
    req.user = decoded;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        status: 'fail',
        message: 'Authentication token has expired. Please log in again.',
      });
    }

    return res.status(401).json({
      status: 'fail',
      message: 'Invalid authentication token.',
    });
  }
};

/**
 * Middleware for Role-Based Access Control (RBAC)
 * @param  {...string} allowedRoles 
 */
const authorize = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        status: 'fail',
        message: 'Forbidden. You do not have permission to perform this action.',
      });
    }
    next();
  };
};

module.exports = {
  authenticate,
  authorize,
};
