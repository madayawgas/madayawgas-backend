const express = require('express');
const router = express.Router();

const usersRoutes = require('../features/users/users.routes');
const fleetRoutes = require('../features/fleet/fleet.routes');
const inventoryRoutes = require('../features/inventory/inventory.routes');

// Register API Module Routes

router.use('/users', usersRoutes);
router.use('/fleet', fleetRoutes);
router.use('/inventory', inventoryRoutes);

module.exports = router;
