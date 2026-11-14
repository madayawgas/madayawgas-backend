const salesRoutes = require('./sales.routes');

// Customer profile management
const customers = require('./customers');
const {
  customerRepository,
  customerService,
  customerController,
  customerRoutes,
} = customers;

// Frontline sales and delivery sub-modules
const transactions = require('./transactions');
const {
  transactionsRepository,
  transactionsService,
  transactionsController,
} = transactions;

const invoices = require('./invoices');
const {
  invoicesRepository,
  invoicesService,
  invoicesController,
} = invoices;

const sync = require('./sync');
const {
  syncService,
  syncController,
} = sync;

module.exports = {
  salesRoutes,
  customerRepository,
  customerService,
  customerController,
  customerRoutes,
  customers,
  transactions,
  transactionsRepository,
  transactionsService,
  transactionsController,
  invoices,
  invoicesRepository,
  invoicesService,
  invoicesController,
  sync,
  syncService,
  syncController,

  // Cross-Subsystem Inventory Reconciliation Hooks
  getTripNetCustomerDebtCreated: (tripId) => transactionsService.getTripNetCustomerDebtCreated(tripId),
  getTripTotalNetCustomerDebtCreated: (tripId) => transactionsService.getTripTotalNetCustomerDebtCreated(tripId),
  getTripTotalSoldFull: (tripId) => transactionsService.getTripTotalSoldFull(tripId),
};
