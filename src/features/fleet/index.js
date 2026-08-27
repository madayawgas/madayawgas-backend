const fleetRoutes = require('./fleet.routes');
const trucksRepository = require('./trucks/trucks.repository');
const trucksService = require('./trucks/trucks.service');
const trucksController = require('./trucks/trucks.controller');
const availabilityRepository = require('./availability/availability.repository');
const availabilityService = require('./availability/availability.service');
const availabilityController = require('./availability/availability.controller');

module.exports = {
  fleetRoutes,
  trucksRepository,
  trucksService,
  trucksController,
  availabilityRepository,
  availabilityService,
  availabilityController,
};
