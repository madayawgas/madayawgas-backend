const maintenanceRepository = require('./maintenance.repository');
const maintenanceService = require('./maintenance.service');
const maintenanceController = require('./maintenance.controller');
const maintenanceRoutes = require('./maintenance.routes');

module.exports = {
  maintenanceRepository,
  maintenanceService,
  maintenanceController,
  maintenanceRoutes,
};
