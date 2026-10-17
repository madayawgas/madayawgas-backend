const operationsRoutes = require('./operations.routes');

const attendanceRoutes = require('./attendance/attendance.routes');
const attendanceService = require('./attendance/attendance.service');
const attendanceRepository = require('./attendance/attendance.repository');

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

  // Attendance
  attendanceRoutes,
  attendanceService,
  attendanceRepository,

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
