const transactionsRepository = require('./transactions.repository');
const transactionsService = require('./transactions.service');
const transactionsController = require('./transactions.controller');
const transactionsRoutes = require('./transactions.routes');

module.exports = {
  transactionsRepository,
  transactionsService,
  transactionsController,
  transactionsRoutes,
};
