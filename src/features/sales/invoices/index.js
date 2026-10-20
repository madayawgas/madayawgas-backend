const invoicesRepository = require('./invoices.repository');
const invoicesService = require('./invoices.service');
const invoicesController = require('./invoices.controller');
const invoicesRoutes = require('./invoices.routes');

module.exports = {
  invoicesRepository,
  invoicesService,
  invoicesController,
  invoicesRoutes,
};
