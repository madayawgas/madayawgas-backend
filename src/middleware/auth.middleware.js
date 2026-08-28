const authService = require('../features/users/auth.service');
const permissionService = require('../features/users/permission.service');

/**
 * Authentication Middleware
 * Validates server-side session from HTTP cookie, refreshes idle expiration,
 * and attaches authenticated user & session to request context.
 */
const authenticate = async (req, res, next) => {
  try {
    const rawToken = req.cookies?.mg_sid;

    if (!rawToken) {
      return res.status(401).json({
        status: 'fail',
        message: 'Unauthorized',
      });
    }

    const authResult = await authService.validateSession(rawToken);

    if (!authResult) {
      res.clearCookie('mg_sid', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
      });
      return res.status(401).json({
        status: 'fail',
        message: 'Unauthorized',
      });
    }

    req.user = authResult.user;
    req.session = authResult.session;

    // Enforce mandatory password change if user is on temporary credentials
    if (req.user.mustChangePassword) {
      const fullPath = (req.baseUrl || '') + req.path;
      const allowedFullPaths = ['/api/users/change-password', '/api/users/me', '/api/users/logout'];
      if (!allowedFullPaths.includes(fullPath)) {
        return res.status(403).json({
          status: 'fail',
          code: 'MUST_CHANGE_PASSWORD',
          message: 'You must change your temporary password before accessing other system features',
        });
      }
    }

    next();
  } catch (error) {
    next(error);
  }
};

/**
 * RBAC Permission Authorization Middleware
 * Uses permissionService.can / canAny to enforce route-level permissions.
 * Accepts a single permission string or an array of permissions.
 * Returns 403 Forbidden if user lacks the required permission(s).
 */
const requirePermission = (permission) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        status: 'fail',
        message: 'Unauthorized',
      });
    }

    const hasPermission = Array.isArray(permission)
      ? permissionService.canAny(req.user, permission)
      : permissionService.can(req.user, permission);

    if (!hasPermission) {
      return res.status(403).json({
        status: 'fail',
        message: 'Forbidden',
      });
    }

    next();
  };
};

module.exports = {
  authenticate,
  requirePermission,
};
