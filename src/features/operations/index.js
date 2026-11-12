const operationsRoutes = require('./operations.routes');

const apprehensionsRoutes = require('./apprehensions/apprehensions.routes');
const apprehensionsService = require('./apprehensions/apprehensions.service');
const apprehensionsRepository = require('./apprehensions/apprehensions.repository');

const fuelRoutes = require('./fuel/fuel.routes');
const fuelService = require('./fuel/fuel.service');
const fuelRepository = require('./fuel/fuel.repository');

const alertsRoutes = require('./alerts/alerts.routes');
const alertsService = require('./alerts/alerts.service');
const alertsRepository = require('./alerts/alerts.repository');
const alertsNotifier = require('./alerts/alerts.notifier');

module.exports = {
  operationsRoutes,

  // Apprehensions
  apprehensionsRoutes,
  apprehensionsService,
  apprehensionsRepository,

  // Fuel Tracking
  fuelRoutes,
  fuelService,
  fuelRepository,

  // Emergency Alerts
  alertsRoutes,
  alertsService,
  alertsRepository,
  alertsNotifier,
};
