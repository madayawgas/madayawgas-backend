const customerRepository = require('./customer.repository');
const customerService = require('./customer.service');
const customerController = require('./customer.controller');
const customerRoutes = require('./customer.routes');

module.exports = {
  customerRepository,
  customerService,
  customerController,
  customerRoutes,
};
