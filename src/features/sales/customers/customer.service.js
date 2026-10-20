const customerRepository = require('./customer.repository');
const { historyService } = require('../../history');
const { EVENTS } = require('../../history/history.events');
const { parsePhoneNumber } = require('../../../utils/phoneParser');
const { parsePaginationQuery, calculateOffset, buildPaginationMeta } = require('../../../utils/pagination');
const { query } = require('../../../../database/connection');

const ALLOWED_CUSTOMER_TYPES = Object.freeze([
  'COMMERCIAL',
  'RETAIL',
  'RETAILER',
  'WHOLESALE',
  'HOUSEHOLD',
]);

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

/**
 * Formats a raw database row into the standardized customer DTO.
 */
function formatCustomer(row) {
  if (!row) return null;

  const contactPerson = row.contact_person || row.name || 'Customer';
  const businessName = row.business_name || null;
  const displayName = businessName || contactPerson || row.name || 'Customer';
  const deliveryAddress = row.delivery_address || row.address || '';

  return {
    id: row.id,
    customerType: row.customer_type,
    customer_type: row.customer_type,
    businessName,
    business_name: businessName,
    contactPerson,
    contact_person: contactPerson,
    name: displayName,
    contactNumber: row.contact_number,
    contact_number: row.contact_number,
    alternateContactNumber: row.alternate_contact_number || null,
    alternate_contact_number: row.alternate_contact_number || null,
    tin: row.tin || null,
    deliveryAddress,
    delivery_address: deliveryAddress,
    address: deliveryAddress,
    zoneId: row.zone_id || null,
    zone_id: row.zone_id || null,
    zone: row.zone_id
      ? {
          id: row.zone_id,
          name: row.zone_name,
          code: row.zone_code,
        }
      : null,
    isActive: Boolean(row.is_active),
    is_active: Boolean(row.is_active),
    totalNetCanisterDebt:
      row.total_net_canister_debt !== undefined
        ? parseInt(row.total_net_canister_debt, 10)
        : 0,
    createdBy: row.created_by
      ? {
          id: row.created_by,
          username: row.created_by_username,
          fullName: row.created_by_name ? row.created_by_name.trim() : null,
        }
      : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Customer Service
 * Handles business rules, validations, canister debt calculation, and history logging.
 */
class CustomerService {
  /**
   * Retrieves customers with optional pagination, search, and zone/type filtering.
   * @param {Object} queryFilters - Raw request query parameters
   * @returns {Promise<{items: Array, meta: Object}|Array>}
   */
  async getCustomers(queryFilters = {}) {
    const pagination = parsePaginationQuery(queryFilters, {
      defaultLimit: 20,
      maxLimit: 100,
      defaultSort: 'createdAt',
      defaultOrder: 'DESC',
      allowedSortFields: ALLOWED_CUSTOMER_SORT_FIELDS,
    });

    const filters = {
      isActive: queryFilters.isActive !== undefined ? queryFilters.isActive : queryFilters.is_active,
      status: queryFilters.status,
      customerType: queryFilters.customerType || queryFilters.customer_type,
      zoneId: queryFilters.zoneId || queryFilters.zone_id,
      search: queryFilters.search,
    };

    if (!pagination.isPaginated) {
      const rows = await customerRepository.findPaginatedCustomers(null, filters, null);
      return rows.map(formatCustomer);
    }

    const calcOffset = calculateOffset(pagination.page, pagination.limit);
    const paginationParams = {
      limit: pagination.limit,
      offset: calcOffset,
      sortColumn: pagination.sortColumn,
      sortOrder: pagination.sortOrder,
    };

    const { rows, total } = await customerRepository.findPaginatedCustomers(
      null,
      filters,
      paginationParams
    );

    const items = rows.map(formatCustomer);
    const meta = buildPaginationMeta(total, pagination.page, pagination.limit);

    return {
      items,
      meta,
    };
  }

  /**
   * Retrieves single customer profile along with product SKU-by-SKU canister balance breakdown.
   * @param {string} customerId - Customer UUID
   * @returns {Promise<Object>} Detailed customer DTO
   */
  async getCustomerDetails(customerId) {
    if (!customerId || typeof customerId !== 'string') {
      throw new Error('Customer ID is required');
    }

    const row = await customerRepository.findCustomerById(null, customerId);
    if (!row) {
      throw new Error('Customer not found');
    }

    const balanceRows = await customerRepository.findCustomerCanisterBalances(null, customerId);

    const canisterBalances = balanceRows.map((b) => ({
      productId: b.product_id,
      productName: b.product_name,
      category: b.category,
      containerType: b.container_type,
      netWeightKg: Number(b.net_weight_kg),
      netBalance: parseInt(b.net_balance, 10) || 0,
      totalLoaned: parseInt(b.total_loaned, 10) || 0,
      totalReturned: parseInt(b.total_returned, 10) || 0,
    }));

    const totalNetCanisterDebt = canisterBalances.reduce(
      (sum, item) => sum + item.netBalance,
      0
    );

    const customerDto = formatCustomer(row);
    customerDto.canisterBalances = canisterBalances;
    customerDto.totalNetCanisterDebt = totalNetCanisterDebt;

    return customerDto;
  }

  /**
   * Registers a new customer into the system with immediate activation.
   * @param {Object} actorUser - Authenticated user context
   * @param {Object} data - Customer payload
   * @returns {Promise<Object>} Created customer DTO
   */
  async registerCustomer(actorUser, data = {}) {
    const rawName = data.contact_person || data.contactPerson || data.name;
    const rawAddress = data.delivery_address || data.deliveryAddress || data.address;
    const rawContactNumber = data.contact_number !== undefined ? data.contact_number : data.contactNumber;
    const rawCustomerType = data.customer_type || data.customerType;
    const rawZoneId = data.zone_id || data.zoneId;

    // 1. Validate contact name
    if (!rawName || typeof rawName !== 'string' || rawName.trim().length === 0) {
      throw new Error('Customer name is required');
    }
    const cleanContactPerson = rawName.trim();
    if (cleanContactPerson.length > 255) {
      throw new Error('Customer name cannot exceed 255 characters');
    }

    // 2. Validate address
    if (!rawAddress || typeof rawAddress !== 'string' || rawAddress.trim().length === 0) {
      throw new Error('Address is required');
    }
    const cleanDeliveryAddress = rawAddress.trim();

    // 3. Validate and standardize contact number
    const cleanContactNumber = parsePhoneNumber(rawContactNumber, { required: true });

    // 4. Validate customer type
    if (!rawCustomerType || typeof rawCustomerType !== 'string') {
      throw new Error('Customer type is required');
    }
    const normalizedCustomerType = rawCustomerType.trim().toUpperCase();
    if (!ALLOWED_CUSTOMER_TYPES.includes(normalizedCustomerType)) {
      throw new Error(
        `Invalid customer type '${rawCustomerType}'. Allowed values: ${ALLOWED_CUSTOMER_TYPES.join(', ')}`
      );
    }

    // 5. If zone_id is provided, verify it exists and is active
    let cleanZoneId = null;
    if (rawZoneId && typeof rawZoneId === 'string' && rawZoneId.trim().length > 0) {
      cleanZoneId = rawZoneId.trim();
      const zoneRes = await query(
        `SELECT id, is_active FROM service_zones WHERE id = $1`,
        [cleanZoneId]
      );
      if (zoneRes.rows.length === 0 || !zoneRes.rows[0].is_active) {
        throw new Error('Service zone not found or inactive');
      }
    }

    // 6. Optional fields
    const businessName =
      data.business_name !== undefined
        ? data.business_name
        : (data.businessName || null);
    const alternateContactNumber = data.alternate_contact_number || data.alternateContactNumber;
    const cleanAltContact = alternateContactNumber
      ? parsePhoneNumber(alternateContactNumber, { required: false })
      : null;
    const tin = data.tin !== undefined ? data.tin : null;

    // 7. Insert customer
    const createdRow = await customerRepository.insertCustomer(null, {
      id: data.id || null,
      customerType: normalizedCustomerType,
      businessName,
      contactPerson: cleanContactPerson,
      contactNumber: cleanContactNumber,
      alternateContactNumber: cleanAltContact,
      tin,
      deliveryAddress: cleanDeliveryAddress,
      zoneId: cleanZoneId,
      createdBy: actorUser?.id || null,
      isActive: data.isActive !== undefined ? Boolean(data.isActive) : (data.is_active !== undefined ? Boolean(data.is_active) : true),
    });

    const fullRow = await customerRepository.findCustomerById(null, createdRow.id);
    const result = formatCustomer(fullRow || createdRow);

    // 8. Centralized audit logging
    await historyService.log(EVENTS.SALES_CUSTOMER_REGISTERED, {
      actorUser,
      targetId: result.id,
      payload: {
        customerName: result.businessName || result.contactPerson || result.name,
        customerType: result.customerType,
      },
      metadata: {
        customerType: result.customerType,
        contactNumber: result.contactNumber,
        zoneId: result.zoneId,
      },
    });

    return result;
  }

  /**
   * Updates an existing customer profile.
   * @param {Object} actorUser - Authenticated user context
   * @param {string} customerId - Customer UUID
   * @param {Object} data - Update fields
   * @returns {Promise<Object>} Updated customer DTO
   */
  async updateCustomer(actorUser, customerId, data = {}) {
    if (!customerId || typeof customerId !== 'string') {
      throw new Error('Customer ID is required');
    }

    const existing = await customerRepository.findCustomerById(null, customerId);
    if (!existing) {
      throw new Error('Customer not found');
    }

    const updateFields = {};

    // Validate name/contact_person if provided
    const rawName = data.contact_person !== undefined ? data.contact_person : (data.contactPerson !== undefined ? data.contactPerson : data.name);
    if (rawName !== undefined) {
      if (typeof rawName !== 'string' || rawName.trim().length === 0) {
        throw new Error('Customer name cannot be empty');
      }
      if (rawName.trim().length > 255) {
        throw new Error('Customer name cannot exceed 255 characters');
      }
      updateFields.contactPerson = rawName.trim();
    }

    if (data.business_name !== undefined || data.businessName !== undefined) {
      updateFields.businessName = data.business_name !== undefined ? data.business_name : data.businessName;
    }

    // Validate address if provided
    const rawAddress = data.delivery_address !== undefined ? data.delivery_address : (data.deliveryAddress !== undefined ? data.deliveryAddress : data.address);
    if (rawAddress !== undefined) {
      if (typeof rawAddress !== 'string' || rawAddress.trim().length === 0) {
        throw new Error('Address cannot be empty');
      }
      updateFields.deliveryAddress = rawAddress.trim();
    }

    // Validate contact number if provided
    const rawContact = data.contact_number !== undefined ? data.contact_number : data.contactNumber;
    if (rawContact !== undefined) {
      updateFields.contactNumber = parsePhoneNumber(rawContact, { required: true });
    }

    const rawAltContact = data.alternate_contact_number !== undefined ? data.alternate_contact_number : data.alternateContactNumber;
    if (rawAltContact !== undefined) {
      updateFields.alternateContactNumber = parsePhoneNumber(rawAltContact, { required: false });
    }

    if (data.tin !== undefined) {
      updateFields.tin = data.tin;
    }

    // Validate customer type if provided
    const rawType = data.customer_type || data.customerType;
    if (rawType !== undefined) {
      if (typeof rawType !== 'string') {
        throw new Error('Customer type must be a string');
      }
      const normalizedType = rawType.trim().toUpperCase();
      if (!ALLOWED_CUSTOMER_TYPES.includes(normalizedType)) {
        throw new Error(
          `Invalid customer type '${rawType}'. Allowed values: ${ALLOWED_CUSTOMER_TYPES.join(', ')}`
        );
      }
      updateFields.customerType = normalizedType;
    }

    // Validate zone if provided
    const rawZone = data.zone_id !== undefined ? data.zone_id : data.zoneId;
    if (rawZone !== undefined) {
      if (rawZone) {
        const zoneRes = await query(
          `SELECT id, is_active FROM service_zones WHERE id = $1`,
          [rawZone.trim()]
        );
        if (zoneRes.rows.length === 0 || !zoneRes.rows[0].is_active) {
          throw new Error('Service zone not found or inactive');
        }
        updateFields.zoneId = rawZone.trim();
      } else {
        updateFields.zoneId = null;
      }
    }

    if (data.is_active !== undefined || data.isActive !== undefined) {
      updateFields.isActive = data.isActive !== undefined ? Boolean(data.isActive) : Boolean(data.is_active);
    }

    const updatedRow = await customerRepository.updateCustomer(null, customerId, updateFields);
    const fullRow = await customerRepository.findCustomerById(null, customerId);
    const result = formatCustomer(fullRow || updatedRow);

    await historyService.log(EVENTS.SALES_CUSTOMER_UPDATED, {
      actorUser,
      targetId: result.id,
      payload: {
        customerName: result.businessName || result.contactPerson || result.name,
      },
      metadata: { updateData: updateFields },
    });

    return result;
  }

  /**
   * Toggles customer active status (activate or deactivate).
   * @param {Object} actorUser - Authenticated user context
   * @param {string} customerId - Customer UUID
   * @param {boolean} isActive - True for active, False for inactive
   * @returns {Promise<Object>} Updated customer DTO
   */
  async toggleCustomerStatus(actorUser, customerId, isActive) {
    if (!customerId || typeof customerId !== 'string') {
      throw new Error('Customer ID is required');
    }

    const existing = await customerRepository.findCustomerById(null, customerId);
    if (!existing) {
      throw new Error('Customer not found');
    }

    const updatedRow = await customerRepository.setCustomerActiveStatus(null, customerId, isActive);
    const fullRow = await customerRepository.findCustomerById(null, customerId);
    const result = formatCustomer(fullRow || updatedRow);

    const eventKey = isActive
      ? EVENTS.SALES_CUSTOMER_ACTIVATED
      : EVENTS.SALES_CUSTOMER_DEACTIVATED;

    await historyService.log(eventKey, {
      actorUser,
      targetId: result.id,
      payload: {
        customerName: result.businessName || result.contactPerson || result.name,
        customerType: result.customerType,
      },
      metadata: {
        customerType: result.customerType,
        isActive,
      },
    });

    return result;
  }

  // ============================================================
  // Backward Compatibility Facade Methods
  // ============================================================

  async getAllCustomers(filters = {}, pagination = null) {
    if (!pagination) {
      return this.getCustomers(filters);
    }
    return this.getCustomers({ ...filters, ...pagination });
  }

  async getCustomerById(id) {
    return this.getCustomerDetails(id);
  }

  async createCustomer(actorUser, data) {
    return this.registerCustomer(actorUser, data);
  }

  async deactivateCustomer(actorUser, customerId) {
    return this.toggleCustomerStatus(actorUser, customerId, false);
  }

  async activateCustomer(actorUser, customerId) {
    return this.toggleCustomerStatus(actorUser, customerId, true);
  }
}

module.exports = new CustomerService();
