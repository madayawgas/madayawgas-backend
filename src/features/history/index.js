const historyRepository = require('./history.repository');
const historyService = require('./history.service');
const historyController = require('./history.controller');
const historyRoutes = require('./history.routes');
const {
  EVENTS,
  EVENT_DEFINITIONS,
  MODULES,
  ACTION_TYPES,
  resolveEvent,
} = require('./history.events');

module.exports = {
  historyRepository,
  historyService,
  historyController,
  historyRoutes,
  EVENTS,
  EVENT_DEFINITIONS,
  MODULES,
  ACTION_TYPES,
  resolveEvent,
};
