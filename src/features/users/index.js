const usersRoutes = require('./users.routes');
const usersController = require('./users.controller');
const authService = require('./auth.service');
const profileService = require('./profile.service');
const managementService = require('./management.service');
const permissionService = require('./permission.service');
const usersRepository = require('./users.repository');

module.exports = {
  routes: usersRoutes,
  controller: usersController,
  authService,
  profileService,
  managementService,
  permissionService,
  usersRepository,
};
