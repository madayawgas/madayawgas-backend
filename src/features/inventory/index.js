const inventoryRoutes = require('./inventory.routes');
const productsRepository = require('./products/products.repository');
const productsService = require('./products/products.service');
const productsController = require('./products/products.controller');

module.exports = {
  inventoryRoutes,
  productsRepository,
  productsService,
  productsController,
};
