const express = require('express');
const router = express.Router();
const usersController = require('./users.controller');
const { authenticate, requirePermission, requirePasswordConfirmation } = require('../../middleware/auth.middleware');
const asyncHandler = require('../../utils/asyncHandler');

// ==========================================
// Authentication & Session Routes (Public)
// ==========================================

router.post('/login', asyncHandler(usersController.login.bind(usersController)));
router.post('/logout', asyncHandler(usersController.logout.bind(usersController)));

// ==========================================
// User Profile & Account Routes (Protected)
// ==========================================

router.get('/me', authenticate, asyncHandler(usersController.getMe.bind(usersController)));
router.patch('/me', authenticate, asyncHandler(usersController.updateMe.bind(usersController)));
router.post('/change-password', authenticate, asyncHandler(usersController.changePassword.bind(usersController)));

// ==========================================
// User Administration & RBAC Routes (Admin)
// ==========================================

router.get(
  '/roles',
  authenticate,
  requirePermission('users.manage'),
  asyncHandler(usersController.getRoles.bind(usersController))
);

router.post(
  '/roles',
  authenticate,
  requirePermission('users.manage'),
  asyncHandler(usersController.createRole.bind(usersController))
);

router.get(
  '/roles/:id',
  authenticate,
  requirePermission('users.manage'),
  asyncHandler(usersController.getRoleById.bind(usersController))
);

router.patch(
  '/roles/:id',
  authenticate,
  requirePermission('users.manage'),
  asyncHandler(usersController.updateRole.bind(usersController))
);

router.delete(
  '/roles/:id',
  authenticate,
  requirePermission('users.manage'),
  requirePasswordConfirmation,
  asyncHandler(usersController.deleteRole.bind(usersController))
);

router.get(
  '/permissions',
  authenticate,
  requirePermission('users.manage'),
  asyncHandler(usersController.getPermissions.bind(usersController))
);

router.get(
  '/admin-only-test',
  authenticate,
  requirePermission('users.manage'),
  usersController.adminOnlyTest.bind(usersController)
);

router.get(
  '/',
  authenticate,
  requirePermission('users.view'),
  asyncHandler(usersController.getAllUsers.bind(usersController))
);

router.post(
  '/',
  authenticate,
  requirePermission('users.manage'),
  asyncHandler(usersController.createUser.bind(usersController))
);

router.get(
  '/:id',
  authenticate,
  asyncHandler(usersController.getUserById.bind(usersController))
);

router.patch(
  '/:id',
  authenticate,
  asyncHandler(usersController.updateUserProfile.bind(usersController))
);

router.patch(
  '/:id/role',
  authenticate,
  requirePermission('users.manage'),
  requirePasswordConfirmation,
  asyncHandler(usersController.updateUserRole.bind(usersController))
);

router.patch(
  '/:id/credentials',
  authenticate,
  requirePermission('users.manage'),
  requirePasswordConfirmation,
  asyncHandler(usersController.updateUserCredentials.bind(usersController))
);

router.patch(
  '/:id/status',
  authenticate,
  requirePermission('users.manage'),
  requirePasswordConfirmation,
  asyncHandler(usersController.setUserStatus.bind(usersController))
);

module.exports = router;
