const { z } = require('zod');
const customerService = require('./customer.service');
const { parsePaginationQuery, formatPaginatedEnvelope } = require('../../../utils/pagination');

const ALLOWED_CUSTOMER_SORT_FIELDS = Object.freeze({
  createdAt: 'c.created_at',
  created_at: 'c.created_at',
  name: 'c.name',
  businessName: 'c.business_name',
  business_name: 'c.business_name',
  contactPerson: 'c.contact_person',
  contact_person: 'c.contact_person',
  customerType: 'c.customer_type',
  customer_type: 'c.customer_type',
  isActive: 'c.is_active',
  is_active: 'c.is_active',
});

const createCustomerZodSchema = z.object({
  customer_type: z.enum(['COMMERCIAL', 'RETAILER', 'WHOLESALE', 'HOUSEHOLD', 'RETAIL']).optional(),
  customerType: z.enum(['COMMERCIAL', 'RETAILER', 'WHOLESALE', 'HOUSEHOLD', 'RETAIL']).optional(),
  contact_person: z.string().optional(),
  contactPerson: z.string().optional(),
  name: z.string().optional(),
  contact_number: z.string().optional(),
  contactNumber: z.string().optional(),
  alternate_contact_number: z.string().optional().nullable(),
  alternateContactNumber: z.string().optional().nullable(),
  tin: z.string().optional().nullable(),
  delivery_address: z.string().optional(),
  deliveryAddress: z.string().optional(),
  address: z.string().optional(),
  business_name: z.string().optional().nullable(),
  businessName: z.string().optional().nullable(),
  zone_id: z.string().uuid('Invalid zone ID format').optional().nullable(),
  zoneId: z.string().uuid('Invalid zone ID format').optional().nullable(),
  is_active: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

/**
 * Customer Controller
 * Handles HTTP requests, parameter extraction, and status response formatting for Sales customers.
 */
class CustomerController {
  /**
   * GET /api/sales/customers
   * Retrieves paginated slice or complete listing with filters.
   */
  async getAllCustomers(req, res) {
    try {
      const pagination = parsePaginationQuery(req.query, {
        defaultLimit: 20,
        maxLimit: 100,
        defaultSort: 'createdAt',
        defaultOrder: 'DESC',
        allowedSortFields: ALLOWED_CUSTOMER_SORT_FIELDS,
      });

      if (!pagination.isPaginated) {
        const customers = await customerService.getCustomers(req.query || {});
        return res.status(200).json({
          status: 'success',
          data: {
            count: customers.length,
            customers,
          },
        });
      }

      const { items, meta } = await customerService.getCustomers(req.query || {});
      return res.status(200).json(formatPaginatedEnvelope(items, meta));
    } catch (err) {
      return res.status(400).json({
        status: 'fail',
        message: err.message,
      });
    }
  }

  /**
   * GET /api/sales/customers/:id
   * Retrieves single customer profile by UUID along with canister debt breakdown.
   */
  async getCustomerById(req, res) {
    try {
      const { id } = req.params;
      const customer = await customerService.getCustomerDetails(id);
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
   * Registers a new customer profile.
   */
  async createCustomer(req, res) {
    try {
      const customer = await customerService.registerCustomer(req.user, req.body || {});
      return res.status(201).json({
        status: 'success',
        data: { customer },
      });
    } catch (err) {
      const isConflict = err.message && err.message.includes('already exists');
      return res.status(isConflict ? 409 : 400).json({
        status: 'fail',
        message: err.message,
      });
    }
  }

  /**
   * PATCH /api/sales/customers/:id
   * Updates an existing customer profile.
   */
  async updateCustomer(req, res) {
    try {
      const { id } = req.params;
      const customer = await customerService.updateCustomer(req.user, id, req.body || {});
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
   * PATCH /api/sales/customers/:id/deactivate
   * Soft-deactivates customer account (requires supervisor password confirmation).
   */
  async deactivateCustomer(req, res) {
    try {
      const { id } = req.params;
      const customer = await customerService.toggleCustomerStatus(req.user, id, false);
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

  /**
   * PATCH /api/sales/customers/:id/activate
   * Re-activates customer account.
   */
  async activateCustomer(req, res) {
    try {
      const { id } = req.params;
      const customer = await customerService.toggleCustomerStatus(req.user, id, true);
      return res.status(200).json({
        status: 'success',
        message: 'Customer successfully activated',
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
