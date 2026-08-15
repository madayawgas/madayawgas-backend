const express = require('express');
const router = express.Router();

const usersRoutes = require('../features/users/users.routes');


// Register API Module Routes

router.use('/users', usersRoutes);

module.exports = router;
