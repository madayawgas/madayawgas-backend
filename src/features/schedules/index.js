const schedulesRoutes = require('./schedules.routes');
const schedulesService = require('./schedules.service');
const schedulesRepository = require('./schedules.repository');
const schedulesController = require('./schedules.controller');

const zonesService = require('./zones/zones.service');
const zonesRepository = require('./zones/zones.repository');
const zonesController = require('./zones/zones.controller');

const templatesService = require('./templates/templates.service');
const templatesRepository = require('./templates/templates.repository');
const templatesController = require('./templates/templates.controller');

module.exports = {
  schedulesRoutes,
  schedulesService,
  schedulesRepository,
  schedulesController,
  zonesService,
  zonesRepository,
  zonesController,
  templatesService,
  templatesRepository,
  templatesController,
};
