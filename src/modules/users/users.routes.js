const express = require('express');
const router = express.Router();
const userService = require('./users.service');
const asyncHandler = require('../../utils/asyncHandler');
const { authenticate, authorize } = require('../../middleware/auth.middleware');

/**
 * @route   GET /api/users
 * @desc    Get all users (Admin only)
 * @access  Protected/Admin
 */
router.get(
  '/',
  authenticate,
  authorize('admin'),
  asyncHandler(async (req, res) => {
    const users = await userService.getAllUsers();
    res.status(200).json({
      status: 'success',
      data: { users },
    });
  })
);

/**
 * @route   GET /api/users/me
 * @desc    Get current logged in user profile
 * @access  Protected
 */
router.get(
  '/me',
  authenticate,
  asyncHandler(async (req, res) => {
    const user = await userService.getUserById(req.user.id);
    res.status(200).json({
      status: 'success',
      data: { user },
    });
  })
);

/**
 * @route   GET /api/users/:id
 * @desc    Get user by ID
 * @access  Protected
 */
router.get(
  '/:id',
  authenticate,
  asyncHandler(async (req, res) => {
    const user = await userService.getUserById(req.params.id);
    res.status(200).json({
      status: 'success',
      data: { user },
    });
  })
);

/**
 * @route   PUT /api/users/:id
 * @desc    Update user details
 * @access  Protected
 */
router.put(
  '/:id',
  authenticate,
  asyncHandler(async (req, res) => {
    const updatedUser = await userService.updateUser(req.params.id, req.body);
    res.status(200).json({
      status: 'success',
      message: 'User updated successfully.',
      data: { user: updatedUser },
    });
  })
);

/**
 * @route   DELETE /api/users/:id
 * @desc    Delete user
 * @access  Protected/Admin
 */
router.delete(
  '/:id',
  authenticate,
  authorize('admin'),
  asyncHandler(async (req, res) => {
    await userService.deleteUser(req.params.id);
    res.status(200).json({
      status: 'success',
      message: `User with ID ${req.params.id} has been deleted.`,
    });
  })
);

module.exports = router;
