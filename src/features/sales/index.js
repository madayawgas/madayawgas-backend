const salesRoutes = require('./sales.routes');
const customerRepository = require('./customer/customer.repository');
const customerService = require('./customer/customer.service');
const customerController = require('./customer/customer.controller');

module.exports = {
  salesRoutes,
  customerRepository,
  customerService,
  customerController,
};
