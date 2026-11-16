const express = require('express');
const router = express.Router();

const dashboardController = require('./dashboard.controller');
const { authenticate, requirePermission } = require('../../middleware/auth.middleware');
const asyncHandler = require('../../utils/asyncHandler');

router.get(
  '/overview',
  authenticate,
  requirePermission('dashboard.view'),
  asyncHandler(dashboardController.getOverview.bind(dashboardController))
);

module.exports = router;
