const customerService = require('./customer.service');

/**
 * Customer Controller
 * Handles HTTP requests, parameter extraction, and status response formatting for Sales customers.
 */
class CustomerController {
  /**
   * GET /api/sales/customers
   * List all customers with optional filters (overview).
   */
  async getAllCustomers(req, res) {
    const { isActive, status, customerType, search } = req.query || {};
    const customers = await customerService.getAllCustomers({
      isActive,
      status,
      customerType,
      search,
    });

    return res.status(200).json({
      status: 'success',
      data: {
        count: customers.length,
        customers,
      },
    });
  }

  /**
   * GET /api/sales/customers/:id
   * Retrieve single customer profile by UUID.
   */
  async getCustomerById(req, res) {
    try {
      const customer = await customerService.getCustomerById(req.params.id);
      return res.status(200).json({
        status: 'success',
        data: { customer },
      });
    } catch (err) {
      const isNotFound = err.message === 'Customer not found';
      return res.status(isNotFound ? 404 : 400).json({
        status: 'fail',
        message: err.message,
      });
    }
  }

  /**
   * POST /api/sales/customers
   * Register a new customer.
   */
  async createCustomer(req, res) {
    try {
      const customer = await customerService.createCustomer(req.user, req.body || {});
      return res.status(201).json({
        status: 'success',
        data: { customer },
      });
    } catch (err) {
      return res.status(400).json({
        status: 'fail',
        message: err.message,
      });
    }
  }

  /**
   * PATCH /api/sales/customers/:id
   * Update customer profile details.
   */
  async updateCustomer(req, res) {
    try {
      const customer = await customerService.updateCustomer(req.params.id, req.body || {});
      return res.status(200).json({
        status: 'success',
        data: { customer },
      });
    } catch (err) {
      if (err.message === 'Customer not found') {
        return res.status(404).json({
          status: 'fail',
          message: err.message,
        });
      }
      return res.status(400).json({
        status: 'fail',
        message: err.message,
      });
    }
  }

  /**
   * PATCH /api/sales/customers/:id/deactivate
   * Deactivate a customer profile.
   */
  async deactivateCustomer(req, res) {
    try {
      const customer = await customerService.deactivateCustomer(req.params.id);
      return res.status(200).json({
        status: 'success',
        message: 'Customer successfully deactivated',
        data: { customer },
      });
    } catch (err) {
      const isNotFound = err.message === 'Customer not found';
      return res.status(isNotFound ? 404 : 400).json({
        status: 'fail',
        message: err.message,
      });
    }
  }
}

module.exports = new CustomerController();
