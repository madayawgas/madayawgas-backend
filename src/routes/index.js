const express = require('express');
const router = express.Router();

const authRoutes = require('../modules/auth/auth.routes');
const usersRoutes = require('../modules/users/users.routes');
const inventoryRoutes = require('../modules/inventory/inventory.routes');
const deliveriesRoutes = require('../modules/deliveries/deliveries.routes');
const truckRoutes = require('../modules/truck/truck.routes');

// Register API Module Routes
router.use('/auth', authRoutes);
router.use('/users', usersRoutes);
router.use('/inventory', inventoryRoutes);
router.use('/deliveries', deliveriesRoutes);
router.use('/truck', truckRoutes);

module.exports = router;
