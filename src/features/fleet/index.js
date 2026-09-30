const fleetRoutes = require('./fleet.routes');
const vehiclesRepository = require('./vehicles/vehicles.repository');
const vehiclesService = require('./vehicles/vehicles.service');
const vehiclesController = require('./vehicles/vehicles.controller');
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
  vehiclesRepository,
  vehiclesService,
  vehiclesController,
  // Backward compatibility aliases
  trucksRepository: vehiclesRepository,
  trucksService: vehiclesService,
  trucksController: vehiclesController,
  availabilityRepository,
  availabilityService,
  availabilityController,
  maintenanceRepository,
  maintenanceService,
  maintenanceController,
  maintenanceRoutes,
};
