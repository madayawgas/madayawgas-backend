const authService = require('./auth.service');
const profileService = require('./profile.service');
const managementService = require('./management.service');
const permissionService = require('./permission.service');

const COOKIE_NAME = 'mg_sid';

const getCookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  path: '/',
  maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days in ms
});

/**
 * Users Controller
 * Handles HTTP request parameter extraction, cookie management, and status response formatting.
 */
class UsersController {
  /**
   * POST /api/users/login
   */
  async login(req, res) {
    const { username, password } = req.body || {};

    if (!username || !password) {
      return res.status(401).json({
        status: 'fail',
        message: 'Invalid credentials',
      });
    }

    try {
      const { token, user } = await authService.login(username, password);

      res.cookie(COOKIE_NAME, token, getCookieOptions());

      return res.status(200).json({
        status: 'success',
        data: { user },
      });
    } catch (err) {
      if (err.message === 'Invalid credentials') {
        return res.status(401).json({
          status: 'fail',
          message: 'Invalid credentials',
        });
      }
      throw err;
    }
  }

  /**
   * POST /api/users/logout
   */
  async logout(req, res) {
    const rawToken = req.cookies?.[COOKIE_NAME];

    if (rawToken) {
      await authService.logout(rawToken);
    }

    res.clearCookie(COOKIE_NAME, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
    });

    return res.status(200).json({
      status: 'success',
      message: 'Successfully logged out',
    });
  }

  /**
   * GET /api/users/me
   */
  async getMe(req, res) {
    return res.status(200).json({
      status: 'success',
      data: {
        user: req.user,
      },
    });
  }

  /**
   * PATCH /api/users/me
   */
  async updateMe(req, res) {
    const { firstName, lastName, phone, birthdate } = req.body || {};

    try {
      const updatedUser = await profileService.updateProfile(req.user, req.user.id, {
        firstName,
        lastName,
        phone,
        birthdate,
      });

      return res.status(200).json({
        status: 'success',
        data: {
          user: updatedUser,
        },
      });
    } catch (err) {
      return res.status(400).json({
        status: 'fail',
        message: err.message,
      });
    }
  }

  /**
   * POST /api/users/change-password
   */
  async changePassword(req, res) {
    const { currentPassword, newPassword } = req.body || {};

    try {
      await authService.changePassword(req.user, { currentPassword, newPassword });

      res.clearCookie(COOKIE_NAME, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
      });

      return res.status(200).json({
        status: 'success',
        message: 'Password changed successfully. Please log in again.',
      });
    } catch (err) {
      return res.status(400).json({
        status: 'fail',
        message: err.message,
      });
    }
  }

  /**
   * GET /api/users/roles
   */
  async getRoles(req, res) {
    const roles = await managementService.getRoles();
    return res.status(200).json({
      status: 'success',
      data: { roles },
    });
  }

  /**
   * GET /api/users/admin-only-test
   */
  adminOnlyTest(req, res) {
    return res.status(200).json({
      status: 'success',
      message: 'Access granted',
    });
  }

  /**
   * GET /api/users
   */
  async getAllUsers(req, res) {
    const users = await managementService.getAllUsers();
    return res.status(200).json({
      status: 'success',
      data: { users },
    });
  }

  /**
   * POST /api/users
   * Creates a user account with auto-generated username (e.g. jdoe) and temporary password.
   */
  async createUser(req, res) {
    const { firstName, lastName, phone, birthdate, roleId } = req.body || {};

    try {
      const result = await managementService.createUser(req.user, {
        firstName,
        lastName,
        phone,
        birthdate,
        roleId,
      });

      return res.status(201).json({
        status: 'success',
        data: {
          user: result.user,
          temporaryPassword: result.temporaryPassword,
        },
      });
    } catch (err) {
      return res.status(400).json({
        status: 'fail',
        message: err.message,
      });
    }
  }

  /**
   * GET /api/users/:id
   */
  async getUserById(req, res) {
    const isSelf = req.user.id === req.params.id;
    const canView = permissionService.can(req.user, 'users.view');

    if (!isSelf && !canView) {
      return res.status(403).json({
        status: 'fail',
        message: 'Forbidden',
      });
    }

    try {
      const user = await profileService.getProfile(req.params.id);
      return res.status(200).json({
        status: 'success',
        data: { user },
      });
    } catch (err) {
      return res.status(404).json({
        status: 'fail',
        message: err.message,
      });
    }
  }

  /**
   * PATCH /api/users/:id
   */
  async updateUserProfile(req, res) {
    const { firstName, lastName, phone, birthdate, roleId } = req.body || {};

    try {
      let updatedUser;

      // Handle personal info updates
      if (firstName !== undefined || lastName !== undefined || phone !== undefined || birthdate !== undefined) {
        updatedUser = await profileService.updateProfile(req.user, req.params.id, {
          firstName,
          lastName,
          phone,
          birthdate,
        });
      }

      // Handle role updates (requires users.manage)
      if (roleId !== undefined) {
        if (!permissionService.can(req.user, 'users.manage')) {
          return res.status(403).json({
            status: 'fail',
            message: 'Forbidden: You do not have permission to change user roles',
          });
        }
        updatedUser = await managementService.updateUserRole(req.user, req.params.id, roleId);
      }

      if (!updatedUser) {
        updatedUser = await profileService.getProfile(req.params.id);
      }

      return res.status(200).json({
        status: 'success',
        data: {
          user: updatedUser,
        },
      });
    } catch (err) {
      const statusCode = err.message.startsWith('Forbidden') ? 403 : 400;
      return res.status(statusCode).json({
        status: 'fail',
        message: err.message,
      });
    }
  }

  /**
   * PATCH /api/users/:id/credentials
   * Admin updates username or triggers temporary password reset (requires adminPassword).
   */
  async updateUserCredentials(req, res) {
    const { username, resetPassword, password, adminPassword } = req.body || {};

    try {
      const result = await managementService.updateCredentials(req.user, req.params.id, {
        username,
        resetPassword,
        password,
        adminPassword,
      });

      return res.status(200).json({
        status: 'success',
        data: result,
      });
    } catch (err) {
      const statusCode = err.message.toLowerCase().includes('admin password') ? 401 : 400;
      return res.status(statusCode).json({
        status: 'fail',
        message: err.message,
      });
    }
  }

  /**
   * PATCH /api/users/:id/status
   * Deactivates/Activates or Blocks/Unblocks user account (requires adminPassword).
   */
  async setUserStatus(req, res) {
    const { isActive, isBlocked, adminPassword } = req.body || {};

    try {
      const result = await managementService.setUserStatus(req.user, req.params.id, {
        isActive,
        isBlocked,
        adminPassword,
      });

      return res.status(200).json({
        status: 'success',
        data: {
          user: result,
        },
      });
    } catch (err) {
      const statusCode = err.message.toLowerCase().includes('admin password') ? 401 : 400;
      return res.status(statusCode).json({
        status: 'fail',
        message: err.message,
      });
    }
  }
}

module.exports = new UsersController();
