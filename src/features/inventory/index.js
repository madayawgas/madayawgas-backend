const inventoryRoutes = require('./inventory.routes');
const inventoryRepository = require('./inventory.repository');
const inventoryService = require('./inventory.service');
const inventoryController = require('./inventory.controller');

const productsRepository = require('./products/products.repository');
const productsService = require('./products/products.service');
const productsController = require('./products/products.controller');

module.exports = {
  inventoryRoutes,
  inventoryRepository,
  inventoryService,
  inventoryController,
  productsRepository,
  productsService,
  productsController,
};
