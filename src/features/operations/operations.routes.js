const express = require('express');
const router = express.Router();

const apprehensionsRoutes = require('./apprehensions/apprehensions.routes');
const fuelRoutes = require('./fuel/fuel.routes');
const alertsRoutes = require('./alerts/alerts.routes');

// ============================================================
// Operations Subsystem Master Router
// Base Path: /api/operations
// ============================================================

router.use('/apprehensions', apprehensionsRoutes);
router.use('/fuel', fuelRoutes);
router.use('/alerts', alertsRoutes);

module.exports = router;
