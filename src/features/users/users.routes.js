const express = require('express');
const router = express.Router();
const usersService = require('./users.service');
const { authenticate, requirePermission } = require('../../middleware/auth.middleware');
const asyncHandler = require('../../utils/asyncHandler');


const COOKIE_NAME = 'mg_sid';

const getCookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  path: '/',
  maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days in ms
});

/**
 * POST /api/users/login
 * User login endpoint
 */
router.post(
  '/login',
  asyncHandler(async (req, res) => {
    const { username, password } = req.body || {};

    if (!username || !password) {
      return res.status(401).json({
        status: 'fail',
        message: 'Invalid credentials',
      });
    }

    try {
      const { token, user } = await usersService.login(username, password);

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
  })
);

/**
 * POST /api/users/logout
 * User logout endpoint
 */
router.post(
  '/logout',
  asyncHandler(async (req, res) => {
    const rawToken = req.cookies?.[COOKIE_NAME];

    if (rawToken) {
      await usersService.logout(rawToken);
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
  })
);

/**
 * GET /api/users/me
 * Profile endpoint for currently authenticated user
 */
router.get(
  '/me',
  authenticate,
  asyncHandler(async (req, res) => {
    return res.status(200).json({
      status: 'success',
      data: {
        user: req.user,
      },
    });
  })
);

/**
 * POST /api/users/change-password
 * Password change endpoint for authenticated users
 */
router.post(
  '/change-password',
  authenticate,
  asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = req.body || {};

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        status: 'fail',
        message: 'Current password and new password are required',
      });
    }

    try {
      await usersService.changePassword(req.user.id, currentPassword, newPassword);

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
      if (
        err.message === 'Current password is incorrect' ||
        err.message === 'New password must be at least 8 characters long' ||
        err.message === 'User not found'
      ) {
        return res.status(400).json({
          status: 'fail',
          message: err.message,
        });
      }
      throw err;
    }
  })
);

/**
 * GET /api/users/admin-only-test
 * Example RBAC protected route requiring 'users.manage' permission
 */
router.get(
  '/admin-only-test',
  authenticate,
  requirePermission('users.manage'),
  (req, res) => {
    return res.status(200).json({
      status: 'success',
      message: 'Access granted',
    });
  }
);

module.exports = router;

