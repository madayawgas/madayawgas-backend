const express = require('express');
const router = express.Router();

const usersRoutes = require('../modules/users/users.routes');


// Register API Module Routes

router.use('/users', usersRoutes);

module.exports = router;
