const express = require('express');
const router = express.Router();
const historyController = require('./history.controller');
const { authenticate, requirePermission } = require('../../middleware/auth.middleware');

// Route Protection: Requires valid session and history viewing permissions
router.use(authenticate);
router.use(requirePermission(['history.view', 'dashboard.view', 'users.view', 'fleet.view', 'inventory.view', 'sales.view']));

// GET /api/history - Retrieve system event history logs
router.get('/', (req, res, next) => historyController.getHistoryLogs(req, res, next));

// GET /api/history/:id - Retrieve a single history log by ID
router.get('/:id', (req, res, next) => historyController.getHistoryLogById(req, res, next));

module.exports = router;
