const express = require('express');
const router = express.Router();

const usersRoutes = require('../features/users/users.routes');
const fleetRoutes = require('../features/fleet/fleet.routes');

// Register API Module Routes

router.use('/users', usersRoutes);
router.use('/fleet', fleetRoutes);

module.exports = router;
