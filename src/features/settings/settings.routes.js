const express = require('express');
const router = express.Router();

const settingsController = require('./settings.controller');
const { authenticate, requirePermission } = require('../../middleware/auth.middleware');
const asyncHandler = require('../../utils/asyncHandler');

router.use(authenticate);

// Authenticated effective operational config (non-secret thresholds & bounds for all roles)
router.get(
  '/effective',
  asyncHandler(settingsController.getEffectiveConfig.bind(settingsController))
);

// Admin-only Business System Settings endpoints
router.get(
  '/',
  requirePermission('settings.view'),
  asyncHandler(settingsController.listSettings.bind(settingsController))
);

router.get(
  '/:key',
  requirePermission('settings.view'),
  asyncHandler(settingsController.getSettingByKey.bind(settingsController))
);

router.patch(
  '/:key',
  requirePermission('settings.manage'),
  asyncHandler(settingsController.updateSetting.bind(settingsController))
);

module.exports = router;
