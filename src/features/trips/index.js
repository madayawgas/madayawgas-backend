const tripsRoutes = require('./trips.routes');
const tripsService = require('./trips.service');
const tripsRepository = require('./trips.repository');
const tripsController = require('./trips.controller');

const loadsRepository = require('./loads/loads.repository');
const reconciliationRepository = require('./reconciliation/reconciliation.repository');

module.exports = {
  tripsRoutes,
  tripsService,
  tripsRepository,
  tripsController,
  loadsRepository,
  reconciliationRepository,
};
