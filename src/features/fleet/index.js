const fleetRoutes = require('./fleet.routes');
const trucksRepository = require('./trucks/trucks.repository');
const trucksService = require('./trucks/trucks.service');
const trucksController = require('./trucks/trucks.controller');
const availabilityRepository = require('./availability/availability.repository');
const availabilityService = require('./availability/availability.service');
const availabilityController = require('./availability/availability.controller');
const {
  maintenanceRepository,
  maintenanceService,
  maintenanceController,
  maintenanceRoutes,
} = require('./maintenance');

module.exports = {
  fleetRoutes,
  trucksRepository,
  trucksService,
  trucksController,
  availabilityRepository,
  availabilityService,
  availabilityController,
  maintenanceRepository,
  maintenanceService,
  maintenanceController,
  maintenanceRoutes,
};
