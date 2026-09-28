/**
 * History Event Definitions & Template Registry
 * Central single source of truth for all system events, modules, action types,
 * target classifications, and detail message templates.
 */

const MODULES = Object.freeze({
  USER_MANAGEMENT: 'User Management',
  FLEET_MANAGEMENT: 'Fleet Management',
  FLEET: 'Fleet Management',
  INVENTORY_MANAGEMENT: 'Inventory Management',
  SALES_DELIVERY: 'Sales & Delivery',
  ROUTE_DISPATCH: 'Route Dispatch',
  SCHEDULE: 'SCHEDULE',
  TRIP: 'TRIP',
});

const ACTION_TYPES = Object.freeze({
  CREATED: 'Created',
  UPDATED: 'Updated',
  DEACTIVATED: 'Deactivated',
  ASSIGNED: 'Assigned',
  STATUS_CHANGED: 'Status Changed',
  DELETED: 'Deleted',
});

const EVENT_DEFINITIONS = {
  // ============================================================
  // 1. USER MANAGEMENT EVENTS
  // ============================================================
  USER_CREATED: {
    module: MODULES.USER_MANAGEMENT,
    actionType: ACTION_TYPES.CREATED,
    targetType: 'user',
    template: (p) =>
      `Created new user account for '${p.name || p.username}'${p.role ? ` (${p.role})` : ''}`,
  },
  USER_ROLE_UPDATED: {
    module: MODULES.USER_MANAGEMENT,
    actionType: ACTION_TYPES.UPDATED,
    targetType: 'user',
    template: (p) =>
      `Updated role for user '${p.username}' to '${p.role}'`,
  },
  USER_CREDENTIALS_RESET: {
    module: MODULES.USER_MANAGEMENT,
    actionType: ACTION_TYPES.UPDATED,
    targetType: 'user',
    template: (p) =>
      `Admin reset temporary password for user '${p.username}'`,
  },
  USER_USERNAME_UPDATED: {
    module: MODULES.USER_MANAGEMENT,
    actionType: ACTION_TYPES.UPDATED,
    targetType: 'user',
    template: (p) =>
      `Admin updated username for user '${p.username}'`,
  },
  USER_DEACTIVATED: {
    module: MODULES.USER_MANAGEMENT,
    actionType: ACTION_TYPES.DEACTIVATED,
    targetType: 'user',
    template: (p) =>
      `Deactivated account access for '${p.username}'`,
  },
  USER_BLOCKED: {
    module: MODULES.USER_MANAGEMENT,
    actionType: ACTION_TYPES.DEACTIVATED,
    targetType: 'user',
    template: (p) =>
      `Blocked account access for '${p.username}'`,
  },
  USER_ACTIVATED: {
    module: MODULES.USER_MANAGEMENT,
    actionType: ACTION_TYPES.UPDATED,
    targetType: 'user',
    template: (p) =>
      `Activated account access for '${p.username}'`,
  },
  USER_UNBLOCKED: {
    module: MODULES.USER_MANAGEMENT,
    actionType: ACTION_TYPES.UPDATED,
    targetType: 'user',
    template: (p) =>
      `Unblocked account access for '${p.username}'`,
  },
  USER_PROFILE_UPDATED: {
    module: MODULES.USER_MANAGEMENT,
    actionType: ACTION_TYPES.UPDATED,
    targetType: 'user',
    template: (p) =>
      p.isSelf
        ? 'Updated personal profile details'
        : `Updated profile details for '${p.username}'`,
  },
  ROLE_CREATED: {
    module: MODULES.USER_MANAGEMENT,
    actionType: ACTION_TYPES.CREATED,
    targetType: 'role',
    template: (p) => `Created new role '${p.name}'`,
  },
  ROLE_UPDATED: {
    module: MODULES.USER_MANAGEMENT,
    actionType: ACTION_TYPES.UPDATED,
    targetType: 'role',
    template: (p) => `Updated role '${p.name}'`,
  },
  ROLE_DELETED: {
    module: MODULES.USER_MANAGEMENT,
    actionType: ACTION_TYPES.DELETED,
    targetType: 'role',
    template: (p) => `Deleted role '${p.name}'`,
  },

  // ============================================================
  // 2. FLEET MANAGEMENT EVENTS
  // ============================================================
  VEHICLE_REGISTERED: {
    module: MODULES.FLEET_MANAGEMENT,
    actionType: ACTION_TYPES.CREATED,
    targetType: 'vehicle',
    template: (p) =>
      `Registered new fleet vehicle '${p.plateNumber}'${p.model ? ` (${p.model})` : ''}`,
  },
  VEHICLE_UPDATED: {
    module: MODULES.FLEET_MANAGEMENT,
    actionType: ACTION_TYPES.UPDATED,
    targetType: 'vehicle',
    template: (p) =>
      `Updated fleet vehicle details for '${p.plateNumber}'`,
  },
  VEHICLE_STATUS_UPDATED: {
    module: MODULES.FLEET_MANAGEMENT,
    actionType: (p) =>
      p.status === 'INACTIVE' || p.status === 'RETIRED'
        ? ACTION_TYPES.DEACTIVATED
        : ACTION_TYPES.UPDATED,
    targetType: 'vehicle',
    template: (p) =>
      `Changed status for vehicle '${p.plateNumber}' to '${p.status}'`,
  },
  VEHICLE_DEACTIVATED: {
    module: MODULES.FLEET_MANAGEMENT,
    actionType: ACTION_TYPES.DEACTIVATED,
    targetType: 'vehicle',
    template: (p) =>
      `Deactivated fleet vehicle '${p.plateNumber}' and unassigned driver`,
  },
  VEHICLE_DRIVER_ASSIGNED: {
    module: MODULES.FLEET_MANAGEMENT,
    actionType: ACTION_TYPES.ASSIGNED,
    targetType: 'vehicle',
    template: (p) =>
      `Assigned driver '${p.driverName}' to vehicle '${p.plateNumber}'`,
  },
  VEHICLE_DRIVER_UNASSIGNED: {
    module: MODULES.FLEET_MANAGEMENT,
    actionType: ACTION_TYPES.UPDATED,
    targetType: 'vehicle',
    template: (p) =>
      `Unassigned driver from vehicle '${p.plateNumber}'`,
  },
  VEHICLE_ODOMETER_RECORDED: {
    module: MODULES.FLEET_MANAGEMENT,
    actionType: ACTION_TYPES.UPDATED,
    targetType: 'vehicle',
    template: (p) =>
      `Recorded odometer update for vehicle '${p.plateNumber}' (${p.odometer} km)`,
  },

  // Legacy TRUCK aliases for backward compatibility
  TRUCK_REGISTERED: {
    module: MODULES.FLEET_MANAGEMENT,
    actionType: ACTION_TYPES.CREATED,
    targetType: 'vehicle',
    template: (p) =>
      `Registered new fleet vehicle '${p.plateNumber}'${p.model ? ` (${p.model})` : ''}`,
  },
  TRUCK_UPDATED: {
    module: MODULES.FLEET_MANAGEMENT,
    actionType: ACTION_TYPES.UPDATED,
    targetType: 'vehicle',
    template: (p) =>
      `Updated fleet vehicle details for '${p.plateNumber}'`,
  },
  TRUCK_STATUS_UPDATED: {
    module: MODULES.FLEET_MANAGEMENT,
    actionType: (p) =>
      p.status === 'INACTIVE' || p.status === 'RETIRED'
        ? ACTION_TYPES.DEACTIVATED
        : ACTION_TYPES.UPDATED,
    targetType: 'vehicle',
    template: (p) =>
      `Changed status for vehicle '${p.plateNumber}' to '${p.status}'`,
  },
  TRUCK_DEACTIVATED: {
    module: MODULES.FLEET_MANAGEMENT,
    actionType: ACTION_TYPES.DEACTIVATED,
    targetType: 'vehicle',
    template: (p) =>
      `Deactivated fleet vehicle '${p.plateNumber}' and unassigned driver`,
  },
  TRUCK_DRIVER_ASSIGNED: {
    module: MODULES.FLEET_MANAGEMENT,
    actionType: ACTION_TYPES.ASSIGNED,
    targetType: 'vehicle',
    template: (p) =>
      `Assigned driver '${p.driverName}' to vehicle '${p.plateNumber}'`,
  },
  TRUCK_DRIVER_UNASSIGNED: {
    module: MODULES.FLEET_MANAGEMENT,
    actionType: ACTION_TYPES.UPDATED,
    targetType: 'vehicle',
    template: (p) =>
      `Unassigned driver from vehicle '${p.plateNumber}'`,
  },
  TRUCK_ODOMETER_RECORDED: {
    module: MODULES.FLEET_MANAGEMENT,
    actionType: ACTION_TYPES.UPDATED,
    targetType: 'vehicle',
    template: (p) =>
      `Recorded odometer update for vehicle '${p.plateNumber}' (${p.odometer} km)`,
  },
  MAINTENANCE_ODOMETER_LOGGED: {
    module: MODULES.FLEET,
    actionType: ACTION_TYPES.UPDATED,
    targetType: 'VEHICLE',
    template: (p) =>
      `Recorded odometer reading for vehicle ${p.plateNumber}: ${p.odometerKm} km`,
  },
  MAINTENANCE_INSPECTION_RECORDED: {
    module: MODULES.FLEET,
    actionType: ACTION_TYPES.CREATED,
    targetType: 'INSPECTION',
    template: (p) =>
      `Recorded vehicle inspection for ${p.plateNumber} with result: ${p.result}`,
  },
  MAINTENANCE_INCIDENT_REPORTED: {
    module: MODULES.FLEET,
    actionType: ACTION_TYPES.CREATED,
    targetType: 'INCIDENT',
    template: (p) =>
      `Reported ${p.severity} incident for vehicle ${p.plateNumber}: ${p.description}`,
  },
  MAINTENANCE_WORK_ORDER_CREATED: {
    module: MODULES.FLEET,
    actionType: ACTION_TYPES.CREATED,
    targetType: 'WORK_ORDER',
    template: (p) =>
      `Created work order #${p.workOrderId} for vehicle ${p.plateNumber}`,
  },
  MAINTENANCE_APPROVAL_REQUESTED: {
    module: MODULES.FLEET,
    actionType: ACTION_TYPES.CREATED,
    targetType: 'APPROVAL_REQUEST',
    template: (p) =>
      `Submitted cost approval request (₱${p.amountRequested}) for work order #${p.workOrderId}`,
  },
  MAINTENANCE_APPROVAL_DECIDED: {
    module: MODULES.FLEET,
    actionType: ACTION_TYPES.UPDATED,
    targetType: 'WORK_ORDER',
    template: (p) =>
      `Work order #${p.workOrderId} approval decision: ${p.decision}`,
  },
  MAINTENANCE_LOG_FINALIZED: {
    module: MODULES.FLEET,
    actionType: ACTION_TYPES.CREATED,
    targetType: 'MAINTENANCE_LOG',
    template: (p) =>
      `Finalized maintenance log for work order #${p.workOrderId}${p.receiptNumber ? ` (OR #${p.receiptNumber})` : ''}`,
  },
  MAINTENANCE_RECEIPT_ADDED: {
    module: MODULES.FLEET,
    actionType: ACTION_TYPES.CREATED,
    targetType: 'RECEIPT',
    template: (p) =>
      `Attached receipt #${p.receiptNumber || 'N/A'} (₱${p.amount}) to work order #${p.workOrderId}`,
  },
  MAINTENANCE_RECEIPT_DELETED: {
    module: MODULES.FLEET,
    actionType: ACTION_TYPES.DELETED,
    targetType: 'RECEIPT',
    template: (p) =>
      `Removed receipt from work order #${p.workOrderId}`,
  },

  // ============================================================
  // 3. INVENTORY MANAGEMENT EVENTS
  // ============================================================
  PRODUCT_CREATED: {
    module: MODULES.INVENTORY_MANAGEMENT,
    actionType: ACTION_TYPES.CREATED,
    targetType: 'product',
    template: (p) =>
      `Created new inventory product '${p.name}'${p.category ? ` (${p.category})` : ''}`,
  },
  PRODUCT_UPDATED: {
    module: MODULES.INVENTORY_MANAGEMENT,
    actionType: ACTION_TYPES.UPDATED,
    targetType: 'product',
    template: (p) =>
      `Updated inventory product '${p.name}'`,
  },
  PRODUCT_DEACTIVATED: {
    module: MODULES.INVENTORY_MANAGEMENT,
    actionType: ACTION_TYPES.DEACTIVATED,
    targetType: 'product',
    template: (p) =>
      `Deactivated inventory product '${p.name}'`,
  },

  // ============================================================
  // 4. SALES & DELIVERY EVENTS
  // ============================================================
  CUSTOMER_CREATED: {
    module: MODULES.SALES_DELIVERY,
    actionType: ACTION_TYPES.CREATED,
    targetType: 'customer',
    template: (p) =>
      `Registered new customer profile '${p.name}'${p.customerType ? ` (${p.customerType})` : ''}`,
  },
  CUSTOMER_UPDATED: {
    module: MODULES.SALES_DELIVERY,
    actionType: ACTION_TYPES.UPDATED,
    targetType: 'customer',
    template: (p) =>
      `Updated customer profile for '${p.name}'`,
  },
  CUSTOMER_DEACTIVATED: {
    module: MODULES.SALES_DELIVERY,
    actionType: ACTION_TYPES.DEACTIVATED,
    targetType: 'customer',
    template: (p) =>
      `Deactivated customer profile for '${p.name}'`,
  },

  // ============================================================
  // 5. SCHEDULE & TRIP SUBSYSTEM EVENTS
  // ============================================================
  SCHEDULE_CREATED: {
    module: MODULES.SCHEDULE,
    actionType: ACTION_TYPES.CREATED,
    targetType: 'schedule',
    template: (p) =>
      `Scheduled route for vehicle '${p.plateNumber || p.truckId}' on ${p.date || p.scheduledDate}`,
  },
  SCHEDULE_CANCELLED: {
    module: MODULES.SCHEDULE,
    actionType: ACTION_TYPES.UPDATED,
    targetType: 'schedule',
    template: (p) =>
      `Cancelled scheduled route for vehicle '${p.plateNumber || p.truckId}' on ${p.date || p.scheduledDate}`,
  },
  TRIP_DISPATCHED: {
    module: MODULES.TRIP,
    actionType: ACTION_TYPES.CREATED,
    targetType: 'trip',
    template: (p) =>
      `Dispatched trip #${p.tripNumber} for vehicle '${p.plateNumber || p.truckId}'`,
  },
  TRIP_STOCK_LOADED: {
    module: MODULES.TRIP,
    actionType: ACTION_TYPES.CREATED,
    targetType: 'trip_load',
    template: (p) =>
      `Recorded stock transfer slip #${p.slipNumber} (${p.transferType}) for trip #${p.tripNumber}`,
  },
  TRIP_COMPLETED: {
    module: MODULES.TRIP,
    actionType: ACTION_TYPES.UPDATED,
    targetType: 'trip',
    template: (p) =>
      `Completed trip #${p.tripNumber} with return odometer reading of ${p.odometerKm || p.returnOdometerKm} km`,
  },
  TRIP_RECONCILED: {
    module: MODULES.TRIP,
    actionType: ACTION_TYPES.UPDATED,
    targetType: 'trip_reconciliation',
    template: (p) =>
      `Settled stock reconciliation for trip #${p.tripNumber} with status '${p.status}'`,
  },
};

// Export enum keys mapping to definition keys
const EVENTS = Object.freeze(
  Object.keys(EVENT_DEFINITIONS).reduce((acc, key) => {
    acc[key] = key;
    return acc;
  }, {})
);

/**
 * Resolves an event definition and renders its template.
 * @param {string} eventKey - Event identifier (e.g. EVENTS.PRODUCT_CREATED or 'PRODUCT_CREATED')
 * @param {Object} payload - Data passed to the template resolver
 * @param {Object} overrides - Optional direct overrides for module, actionType, details, targetType
 * @returns {Object} Resolved event payload { module, actionType, action, details, targetType }
 */
function resolveEvent(eventKey, payload = {}, overrides = {}) {
  const def = EVENT_DEFINITIONS[eventKey];

  if (!def) {
    // Graceful fallback for custom or unlisted events
    return {
      action: eventKey || 'EVENT_LOGGED',
      module: overrides.module || 'System',
      actionType: overrides.actionType || 'Updated',
      details: overrides.details || `Event ${eventKey || 'occurred'}`,
      targetType: overrides.targetType || null,
    };
  }

  const resolvedActionType =
    overrides.actionType ||
    (typeof def.actionType === 'function'
      ? def.actionType(payload)
      : def.actionType);

  const resolvedDetails =
    overrides.details ||
    (typeof def.template === 'function'
      ? def.template(payload)
      : String(def.template || eventKey));

  return {
    action: eventKey,
    module: overrides.module || def.module,
    actionType: resolvedActionType,
    details: resolvedDetails,
    targetType: overrides.targetType || def.targetType || null,
  };
}

module.exports = {
  MODULES,
  ACTION_TYPES,
  EVENTS,
  EVENT_DEFINITIONS,
  resolveEvent,
};
