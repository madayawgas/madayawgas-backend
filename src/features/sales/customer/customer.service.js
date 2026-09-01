const customerRepository = require('./customer.repository');
const { historyService, EVENTS } = require('../../history');
const { parsePhoneNumber } = require('../../../utils/phoneParser');

const ALLOWED_CUSTOMER_TYPES = ['RETAIL', 'COMMERCIAL', 'WHOLESALE'];

/**
 * Maps database row to camelCase DTO.
 * @param {Object} row
 * @returns {Object|null}
 */
function formatCustomer(row) {
  if (!row) return null;

  return {
    id: row.id,
    name: row.name,
    address: row.address,
    contactNumber: row.contact_number,
    customerType: row.customer_type,
    isActive: Boolean(row.is_active),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Customer Service
 * Encapsulates domain logic, validation, and DTO transformation for Customer Profile management.
 */
class CustomerService {
  /**
   * Retrieves all customers with optional filters.
   * @param {Object} filters - { isActive, status, customerType, search }
   * @returns {Promise<Array>}
   */
  async getAllCustomers(filters = {}) {
    const rows = await customerRepository.getAllCustomers(filters);
    return rows.map(formatCustomer);
  }

  /**
   * Retrieves a single customer by ID.
   * @param {string} id - Customer UUID
   * @returns {Promise<Object>}
   */
  async getCustomerById(id) {
    if (!id || typeof id !== 'string') {
      throw new Error('Customer ID is required');
    }

    const row = await customerRepository.getCustomerById(id);
    if (!row) {
      throw new Error('Customer not found');
    }

    return formatCustomer(row);
  }

  /**
   * Registers a new customer into the system.
   * @param {Object} actorUser - Authenticated user context
   * @param {Object} data - { name, address, contactNumber, customerType, isActive }
   * @returns {Promise<Object>}
   */
  async createCustomer(actorUser, data = {}) {
    const name = data.name;
    const address = data.address;
    const rawContactNumber = data.contactNumber !== undefined ? data.contactNumber : data.contact_number;
    const rawCustomerType = data.customerType || data.customer_type;

    // 1. Validate name
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      throw new Error('Customer name is required');
    }
    const cleanName = name.trim();
    if (cleanName.length > 255) {
      throw new Error('Customer name cannot exceed 255 characters');
    }

    // 2. Validate address
    if (!address || typeof address !== 'string' || address.trim().length === 0) {
      throw new Error('Address is required');
    }
    const cleanAddress = address.trim();

    // 3. Validate and standardize contact number
    const cleanContactNumber = parsePhoneNumber(rawContactNumber, { required: true });

    // 4. Validate customer type
    if (!rawCustomerType || typeof rawCustomerType !== 'string') {
      throw new Error('Customer type is required (RETAIL, COMMERCIAL, or WHOLESALE)');
    }
    const normalizedCustomerType = rawCustomerType.trim().toUpperCase();
    if (!ALLOWED_CUSTOMER_TYPES.includes(normalizedCustomerType)) {
      throw new Error(
        `Invalid customer type '${rawCustomerType}'. Allowed values: ${ALLOWED_CUSTOMER_TYPES.join(', ')}`
      );
    }

    const createdRow = await customerRepository.createCustomer({
      name: cleanName,
      address: cleanAddress,
      contactNumber: cleanContactNumber,
      customerType: normalizedCustomerType,
      isActive: data.isActive !== undefined ? Boolean(data.isActive) : true,
    });

    const result = formatCustomer(createdRow);

    await historyService.log(EVENTS.CUSTOMER_CREATED, {
      actorUser,
      targetId: result.id,
      payload: { name: result.name, customerType: result.customerType },
      metadata: { customerType: result.customerType, contactNumber: result.contactNumber },
    });

    return result;
  }

  /**
   * Updates an existing customer profile.
   * @param {string} id - Customer UUID
   * @param {Object} data - Update fields
   * @returns {Promise<Object>}
   */
  async updateCustomer(id, data = {}) {
    if (!id || typeof id !== 'string') {
      throw new Error('Customer ID is required');
    }

    const existing = await customerRepository.getCustomerById(id);
    if (!existing) {
      throw new Error('Customer not found');
    }

    const updateFields = {};

    // Validate name if provided
    if (data.name !== undefined) {
      if (typeof data.name !== 'string' || data.name.trim().length === 0) {
        throw new Error('Customer name cannot be empty');
      }
      const cleanName = data.name.trim();
      if (cleanName.length > 255) {
        throw new Error('Customer name cannot exceed 255 characters');
      }
      updateFields.name = cleanName;
    }

    // Validate address if provided
    if (data.address !== undefined) {
      if (typeof data.address !== 'string' || data.address.trim().length === 0) {
        throw new Error('Address cannot be empty');
      }
      updateFields.address = data.address.trim();
    }

    // Validate and standardize contact number if provided
    const rawContactNumber = data.contactNumber !== undefined ? data.contactNumber : data.contact_number;
    if (rawContactNumber !== undefined) {
      const cleanContact = parsePhoneNumber(rawContactNumber, { required: true });
      updateFields.contactNumber = cleanContact;
    }

    // Validate customer type if provided
    const rawCustomerType = data.customerType || data.customer_type;
    if (rawCustomerType !== undefined) {
      if (typeof rawCustomerType !== 'string') {
        throw new Error('Invalid customer type');
      }
      const normalizedCustomerType = rawCustomerType.trim().toUpperCase();
      if (!ALLOWED_CUSTOMER_TYPES.includes(normalizedCustomerType)) {
        throw new Error(
          `Invalid customer type '${rawCustomerType}'. Allowed values: ${ALLOWED_CUSTOMER_TYPES.join(', ')}`
        );
      }
      updateFields.customerType = normalizedCustomerType;
    }

    // Validate isActive if provided
    const rawIsActive = data.isActive !== undefined ? data.isActive : data.is_active;
    if (rawIsActive !== undefined) {
      updateFields.isActive = Boolean(rawIsActive);
    }

    const updatedRow = await customerRepository.updateCustomer(id, updateFields);
    const updated = formatCustomer(updatedRow);

    await historyService.log(EVENTS.CUSTOMER_UPDATED, {
      targetId: id,
      payload: { name: updated.name },
    });

    return updated;
  }

  /**
   * Deactivates a customer by setting is_active to false.
   * @param {string} id - Customer UUID
   * @returns {Promise<Object>}
   */
  async deactivateCustomer(id) {
    if (!id || typeof id !== 'string') {
      throw new Error('Customer ID is required');
    }

    const existing = await customerRepository.getCustomerById(id);
    if (!existing) {
      throw new Error('Customer not found');
    }

    const deactivatedRow = await customerRepository.deactivateCustomer(id);
    const deactivated = formatCustomer(deactivatedRow);

    await historyService.log(EVENTS.CUSTOMER_DEACTIVATED, {
      targetId: id,
      payload: { name: deactivated.name },
    });

    return deactivated;
  }
}

module.exports = new CustomerService();
