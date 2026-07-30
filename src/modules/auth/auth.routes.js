const express = require('express');
const router = express.Router();
const authService = require('./auth.service');
const asyncHandler = require('../../utils/asyncHandler');
const validate = require('../../middleware/validate.middleware');
const { registerSchema, loginSchema } = require('./auth.validation');

/**
 * @route   POST /api/auth/register
 * @desc    Register a new user
 * @access  Public
 */
router.post(
  '/register',
  validate(registerSchema, 'body'),
  asyncHandler(async (req, res) => {
    const result = await authService.register(req.body);
    res.status(201).json({
      status: 'success',
      message: 'User registered successfully.',
      data: result,
    });
  })
);

/**
 * @route   POST /api/auth/login
 * @desc    Authenticate user & get token
 * @access  Public
 */
router.post(
  '/login',
  validate(loginSchema, 'body'),
  asyncHandler(async (req, res) => {
    const result = await authService.login(req.body);
    res.status(200).json({
      status: 'success',
      message: 'Login successful.',
      data: result,
    });
  })
);

module.exports = router;
