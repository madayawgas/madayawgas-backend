const express = require('express');
const router = express.Router();

const usersRoutes = require('../features/users/users.routes');
const fleetRoutes = require('../features/fleet/fleet.routes');
const inventoryRoutes = require('../features/inventory/inventory.routes');
const { salesRoutes } = require('../features/sales');

// Register API Module Routes

router.use('/users', usersRoutes);
router.use('/fleet', fleetRoutes);
router.use('/inventory', inventoryRoutes);
router.use('/sales', salesRoutes);

module.exports = router;
