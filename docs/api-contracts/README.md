# MadayawGas API Contracts & Documentation Directory

Welcome to the MadayawGas Backend RESTful API documentation. This directory provides the comprehensive API contracts, payload schemas, query parameters, authentication mechanics, and response envelopes for all subsystems of the MadayawGas operations management platform.

---

## 1. Global API Standards & Architecture

### Base URL Paths
| Subsystem | Base Path | Description |
| :--- | :--- | :--- |
| **Users & Identity** | `/api/users` | Authentication, sessions, user profiles, admin management, and RBAC |
| **Fleet & Logistics** | `/api/fleet` | Fleet overview, truck inventory, driver assignments, and maintenance tracking |
| **Inventory** | `/api/inventory` | LPG cylinder & canister product catalog and profile management |
| **Sales & Delivery** | `/api/sales` | Customer profiles, commercial accounts, and retail distribution |
| **System History** | `/api/history` | Centralized audit trail and system event historical logs |

- **Request / Response Format**: `application/json`
- **Authentication**: Stateful server-side sessions stored in PostgreSQL, conveyed via HTTP-Only cookie `mg_sid`.
- **Session Security**:
  - Cookie: `mg_sid` (`HttpOnly`, `SameSite=Lax`, `Path=/`, `Secure` in production)
  - Idle Expiration: 8 Hours (refreshed automatically on activity)
  - Absolute Expiration: 30 Days (hard ceiling from session creation)
  - First-Login Gatekeeper: Accounts with `mustChangePassword = true` are restricted to password changes and profile viewing until their initial temporary password is reset.

### Standard Response Envelopes

#### Success Envelope (`200 OK`, `201 Created`)
```json
{
  "status": "success",
  "message": "Optional human-readable success message",
  "data": {
    "...": "Payload data object or list"
  }
}
```

#### Error Envelope (`400`, `401`, `403`, `404`, `409`, `500`)
```json
{
  "status": "fail",
  "message": "Descriptive error message explaining the failure",
  "code": "OPTIONAL_MACHINE_READABLE_ERROR_CODE"
}
```

### Dangerous Operations Protection (`requirePasswordConfirmation`)
High-impact actions require administrator password confirmation before execution (accepted via `confirmPassword` or `adminPassword` in JSON body, or `x-confirm-password` header):
- Account status changes (`PATCH /api/users/:id/status`)
- Admin password resets (`PATCH /api/users/:id/credentials`)
- Role assignments (`PATCH /api/users/:id/role`)
- Role deletions (`DELETE /api/users/roles/:id`)
- Truck deactivations (`PATCH /api/fleet/trucks/:id/deactivate`)
- Product deactivations (`PATCH /api/inventory/products/:id/deactivate`)
- Customer deactivations (`PATCH /api/sales/customers/:id/deactivate`)

---

## 2. Directory Structure

The contracts are organized by subsystem, strictly mirroring the backend codebase in `src/features/`:

```text
docs/api-contracts/
├── README.md                                # This master directory & route index
│
├── fleet/                                   # Subsystem: Fleet & Maintenance
│   ├── availability.api.md                  # Overview, availability metrics, vehicle state changes
│   ├── trucks.api.md                        # Vehicle inventory CRUD, registration options, deactivation
│   ├── drivers.api.md                       # Driver assignment, unassignment, driver directory
│   └── maintenance.api.md                   # Odometer return log, 5,000-km PM engine, log history
│
├── history/                                 # Subsystem: Audit & History Logs
│   └── history.api.md                       # System event history logs, module filters, search, detail
│
├── inventory/                               # Subsystem: Inventory
│   └── products.api.md                      # Product CRUD, cylinder/canister specs, deactivation
│
├── sales/                                   # Subsystem: Sales & Delivery
│   └── customer.api.md                      # Customer Profile CRUD, customer segments, deactivation
│
├── users/                                   # Subsystem: User Management & Identity
│   ├── auth.api.md                          # Login, logout, self password change
│   ├── profile.api.md                       # /me profile inspection and personal updates
│   ├── management.api.md                    # User account administration, credentials, roles, status
│   └── roles.api.md                         # Role CRUD, system permissions catalog
│
└── _archive/                                # Preserved original monolithic contract files
    ├── fleet-and-maintenance.api.md
    ├── history-log.api.md
    ├── inventory-products.api.md
    ├── sales-customer.api.md
    └── user-management.api.md
```

---

## 3. Master Endpoint Routing Matrix

### Subsystem: Users (`/api/users`)

| Method | Endpoint | Description | Permissions | Contract Document |
| :--- | :--- | :--- | :--- | :--- |
| `POST` | `/api/users/login` | Authenticate credentials & create session | Public | [users/auth.api.md](file:///docs/api-contracts/users/auth.api.md#1-user-login) |
| `POST` | `/api/users/logout` | Invalidate active session & clear cookie | Authenticated | [users/auth.api.md](file:///docs/api-contracts/users/auth.api.md#2-user-logout) |
| `POST` | `/api/users/change-password` | Change user password (first login or self-service) | Authenticated | [users/auth.api.md](file:///docs/api-contracts/users/auth.api.md#3-change-password-self) |
| `GET` | `/api/users/me` | Get current authenticated user profile | Authenticated | [users/profile.api.md](file:///docs/api-contracts/users/profile.api.md#1-get-current-user-profile-me) |
| `PATCH` | `/api/users/me` | Update current user's personal details | Authenticated | [users/profile.api.md](file:///docs/api-contracts/users/profile.api.md#2-update-current-user-profile-me) |
| `GET` | `/api/users` | List all user accounts with filtering | `users.view` | [users/management.api.md](file:///docs/api-contracts/users/management.api.md#1-list-all-users) |
| `POST` | `/api/users` | Register new user account (auto credentials) | `users.manage` | [users/management.api.md](file:///docs/api-contracts/users/management.api.md#2-register--create-user-account) |
| `GET` | `/api/users/:id` | View specific user account details | `users.view` / Self | [users/management.api.md](file:///docs/api-contracts/users/management.api.md#3-view-user-profile-by-id) |
| `PATCH` | `/api/users/:id` | Update target user profile attributes | `users.manage` / Self | [users/management.api.md](file:///docs/api-contracts/users/management.api.md#4-update-user-profile-by-id) |
| `PATCH` | `/api/users/:id/role` | Change user role & revoke active sessions | `users.manage` + Password | [users/management.api.md](file:///docs/api-contracts/users/management.api.md#5-change-user-role-admin) |
| `PATCH` | `/api/users/:id/credentials` | Admin password reset & credentials update | `users.manage` + Password | [users/management.api.md](file:///docs/api-contracts/users/management.api.md#6-update-user-credentials--reset-password-admin-reset) |
| `PATCH` | `/api/users/:id/status` | Activate/deactivate or block/unblock user | `users.manage` + Password | [users/management.api.md](file:///docs/api-contracts/users/management.api.md#7-deactivate--activate-or-block--unblock-user-account) |
| `GET` | `/api/users/roles` | List all system roles and user counts | `users.manage` | [users/roles.api.md](file:///docs/api-contracts/users/roles.api.md#1-get-system-roles-list) |
| `GET` | `/api/users/roles/:id` | View single role details & permissions | `users.manage` | [users/roles.api.md](file:///docs/api-contracts/users/roles.api.md#2-get-single-role-details) |
| `GET` | `/api/users/permissions` | System catalog of all available permissions | `users.manage` | [users/roles.api.md](file:///docs/api-contracts/users/roles.api.md#3-get-system-permissions-catalog) |
| `POST` | `/api/users/roles` | Create new custom system role | `users.manage` | [users/roles.api.md](file:///docs/api-contracts/users/roles.api.md#4-create-system-role) |
| `PATCH` | `/api/users/roles/:id` | Update custom role name or permissions | `users.manage` | [users/roles.api.md](file:///docs/api-contracts/users/roles.api.md#5-update-system-role) |
| `DELETE` | `/api/users/roles/:id` | Delete custom role | `users.manage` + Password | [users/roles.api.md](file:///docs/api-contracts/users/roles.api.md#6-delete-system-role) |

---

### Subsystem: Fleet (`/api/fleet`)

| Method | Endpoint | Description | Permissions | Contract Document |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/fleet/overview` | Aggregated fleet counts and operational metrics | `fleet.view` | [fleet/availability.api.md](file:///docs/api-contracts/fleet/availability.api.md#1-view-fleet-overview) |
| `GET` | `/api/fleet/availability` | List operational active trucks ready for dispatch | `fleet.view` | [fleet/availability.api.md](file:///docs/api-contracts/fleet/availability.api.md#2-view-fleet-availability) |
| `GET` | `/api/fleet/trucks/:id/status` | View operational and availability status of a truck | `fleet.view` | [fleet/availability.api.md](file:///docs/api-contracts/fleet/availability.api.md#3-view-vehicle-status) |
| `PATCH` | `/api/fleet/trucks/:id/status` | Transition operational condition (`ACTIVE`, `MAINTENANCE`, etc.) | `fleet.manage` | [fleet/availability.api.md](file:///docs/api-contracts/fleet/availability.api.md#4-set-vehicle-availability-status) |
| `GET` | `/api/fleet/trucks` | List all fleet vehicles with filters | `fleet.view` | [fleet/trucks.api.md](file:///docs/api-contracts/fleet/trucks.api.md#1-list-all-vehicles) |
| `GET` | `/api/fleet/trucks/:id` | Get vehicle details by UUID | `fleet.view` | [fleet/trucks.api.md](file:///docs/api-contracts/fleet/trucks.api.md#2-get-vehicle-by-id) |
| `POST` | `/api/fleet/trucks` | Register a new vehicle into the fleet | `fleet.manage` | [fleet/trucks.api.md](file:///docs/api-contracts/fleet/trucks.api.md#3-register-vehicle) |
| `PATCH` | `/api/fleet/trucks/:id` | Update vehicle model, plate, or specifications | `fleet.manage` | [fleet/trucks.api.md](file:///docs/api-contracts/fleet/trucks.api.md#4-update-vehicle-information) |
| `PATCH` | `/api/fleet/trucks/:id/deactivate` | Soft-deactivate truck & release driver | `fleet.manage` + Password | [fleet/trucks.api.md](file:///docs/api-contracts/fleet/trucks.api.md#5-deactivate-vehicle) |
| `GET` | `/api/fleet/register-options` | Dropdown metadata and available unassigned drivers | `fleet.manage` | [fleet/trucks.api.md](file:///docs/api-contracts/fleet/trucks.api.md#6-fleet-register-page-options) |
| `PATCH` | `/api/fleet/trucks/:id/assign` | Assign dedicated default driver to vehicle | `fleet.manage` | [fleet/drivers.api.md](file:///docs/api-contracts/fleet/drivers.api.md#1-assign-driver-to-vehicle) |
| `PATCH` | `/api/fleet/trucks/:id/unassign` | Unassign driver from vehicle | `fleet.manage` | [fleet/drivers.api.md](file:///docs/api-contracts/fleet/drivers.api.md#2-unassign-driver-from-vehicle) |
| `GET` | `/api/fleet/drivers` | Directory of all eligible drivers & status | `fleet.view` | [fleet/drivers.api.md](file:///docs/api-contracts/fleet/drivers.api.md#3-driver-directory-list-all-drivers) |
| `GET` | `/api/fleet/drivers/available` | List available unassigned drivers | `fleet.view` | [fleet/drivers.api.md](file:///docs/api-contracts/fleet/drivers.api.md#4-list-available-drivers) |
| `POST` | `/api/fleet/maintenance/odometer` | Record yard return odometer & evaluate 5,000-km PM | `fleet.manage` | [fleet/maintenance.api.md](file:///docs/api-contracts/fleet/maintenance.api.md#1-record-single-point-return-odometer-reading) |
| `GET` | `/api/fleet/maintenance/odometer/truck/:truckId` | Chronological odometer log history for truck | `fleet.view` | [fleet/maintenance.api.md](file:///docs/api-contracts/fleet/maintenance.api.md#2-view-truck-odometer-log-history) |
| `GET` | `/api/fleet/maintenance/pm-overview` | 5,000-km preventive maintenance fleet overview | `fleet.view` | [fleet/maintenance.api.md](file:///docs/api-contracts/fleet/maintenance.api.md#3-view-fleet-pm-status-overview) |
| `POST` | `/api/fleet/trucks/:id/mileage` | Record vehicle mileage reading (legacy) | `fleet.manage` | [fleet/maintenance.api.md](file:///docs/api-contracts/fleet/maintenance.api.md#4-record-vehicle-mileage-legacy) |
| `POST` | `/api/fleet/maintenance/inspections` | Record safety inspection & ground on failure | `fleet.manage` | [fleet/maintenance.api.md](file:///docs/api-contracts/fleet/maintenance.api.md#5-record-safety-inspection) |
| `GET` | `/api/fleet/maintenance/inspections/truck/:truckId` | View paginated inspection history for truck | `fleet.view` | [fleet/maintenance.api.md](file:///docs/api-contracts/fleet/maintenance.api.md#6-view-truck-inspections-history) |
| `GET` | `/api/fleet/maintenance/inspections/:id` | Get single safety inspection record detail | `fleet.view` | [fleet/maintenance.api.md](file:///docs/api-contracts/fleet/maintenance.api.md#7-get-inspection-record-by-id) |
| `GET` | `/api/fleet/maintenance/incidents/types` | Reference catalog of incident classification types | `fleet.view` | [fleet/maintenance.api.md](file:///docs/api-contracts/fleet/maintenance.api.md#8-get-incident-types-catalog) |
| `POST` | `/api/fleet/maintenance/incidents` | Report breakdown/incident & ground on critical | `fleet.manage` | [fleet/maintenance.api.md](file:///docs/api-contracts/fleet/maintenance.api.md#9-report-incident--breakdown) |
| `GET` | `/api/fleet/maintenance/incidents` | Fleet-wide incident reports list with filters | `fleet.view` | [fleet/maintenance.api.md](file:///docs/api-contracts/fleet/maintenance.api.md#10-list-fleet-incidents) |
| `GET` | `/api/fleet/maintenance/incidents/truck/:truckId` | View incident history for specific truck | `fleet.view` | [fleet/maintenance.api.md](file:///docs/api-contracts/fleet/maintenance.api.md#11-view-truck-incident-history) |
| `GET` | `/api/fleet/maintenance/incidents/:id` | Get single incident report detail | `fleet.view` | [fleet/maintenance.api.md](file:///docs/api-contracts/fleet/maintenance.api.md#12-get-incident-report-by-id) |
| `GET` | `/api/fleet/maintenance/work-orders/types` | Reference catalog of maintenance types | `fleet.view` | [fleet/maintenance.api.md](file:///docs/api-contracts/fleet/maintenance.api.md#13-list-maintenance-types) |
| `POST` | `/api/fleet/maintenance/work-orders` | Create work order & ground truck (approval gate >= 5000) | `fleet.manage` | [fleet/maintenance.api.md](file:///docs/api-contracts/fleet/maintenance.api.md#14-create-maintenance-work-order) |
| `GET` | `/api/fleet/maintenance/work-orders` | List fleet work orders with filters & status | `fleet.view` | [fleet/maintenance.api.md](file:///docs/api-contracts/fleet/maintenance.api.md#15-list-fleet-work-orders) |
| `GET` | `/api/fleet/maintenance/work-orders/:id` | Get single work order details & approval info | `fleet.view` | [fleet/maintenance.api.md](file:///docs/api-contracts/fleet/maintenance.api.md#16-get-work-order-details-by-id) |
| `PATCH` | `/api/fleet/maintenance/work-orders/:id/status` | Update work order operational state | `fleet.manage` | [fleet/maintenance.api.md](file:///docs/api-contracts/fleet/maintenance.api.md#17-update-work-order-status) |
| `POST` | `/api/fleet/maintenance/work-orders/:id/approve` | Cost approval decision for high-cost repair | Super Admin / Admin | [fleet/maintenance.api.md](file:///docs/api-contracts/fleet/maintenance.api.md#18-executive-cost-approval-decision) |
| `POST` | `/api/fleet/maintenance/work-orders/:id/finalize` | Finalize maintenance log, reset PM & release truck | `fleet.manage` | [fleet/maintenance.api.md](file:///docs/api-contracts/fleet/maintenance.api.md#19-finalize-maintenance-log--release-vehicle) |
| `GET` | `/api/fleet/maintenance/logs` | Query historical maintenance servicing logs | `fleet.view` | [fleet/maintenance.api.md](file:///docs/api-contracts/fleet/maintenance.api.md#20-query-historical-maintenance-logs) |

---

### Subsystem: Inventory (`/api/inventory`)

| Method | Endpoint | Description | Permissions | Contract Document |
| :--- | :--- | :--- | :--- | :--- |
| `POST` | `/api/inventory/products` | Register a new product item | `inventory.manage` | [inventory/products.api.md](file:///docs/api-contracts/inventory/products.api.md#1-register-item--product) |
| `GET` | `/api/inventory/products` | List and search products with filters | `inventory.view` | [inventory/products.api.md](file:///docs/api-contracts/inventory/products.api.md#2-view-item-profiles-list--search) |
| `GET` | `/api/inventory/products/:id` | View single product profile by UUID | `inventory.view` | [inventory/products.api.md](file:///docs/api-contracts/inventory/products.api.md#3-view-single-item-profile) |
| `PATCH` | `/api/inventory/products/:id` | Update product item attributes | `inventory.manage` | [inventory/products.api.md](file:///docs/api-contracts/inventory/products.api.md#4-update-item-profile) |
| `PATCH` | `/api/inventory/products/:id/deactivate` | Soft-deactivate product item | `inventory.manage` + Password | [inventory/products.api.md](file:///docs/api-contracts/inventory/products.api.md#5-deactivate-item) |

---

### Subsystem: Sales & Delivery (`/api/sales`)

| Method | Endpoint | Description | Permissions | Contract Document |
| :--- | :--- | :--- | :--- | :--- |
| `POST` | `/api/sales/customers` | Register a new customer profile | `sales.create` | [sales/customer.api.md](file:///docs/api-contracts/sales/customer.api.md#1-register-customer) |
| `GET` | `/api/sales/customers` | List and search customers | `sales.view` / `sales.view_own` | [sales/customer.api.md](file:///docs/api-contracts/sales/customer.api.md#2-view-customer-overview-list--search) |
| `GET` | `/api/sales/customers/:id` | View single customer profile by UUID | `sales.view` / `sales.view_own` | [sales/customer.api.md](file:///docs/api-contracts/sales/customer.api.md#3-view-single-customer-profile) |
| `PATCH` | `/api/sales/customers/:id` | Update customer profile attributes | `sales.update` | [sales/customer.api.md](file:///docs/api-contracts/sales/customer.api.md#4-update-customer-profile) |
| `PATCH` | `/api/sales/customers/:id/deactivate` | Soft-deactivate customer profile | `sales.update` + Password | [sales/customer.api.md](file:///docs/api-contracts/sales/customer.api.md#5-deactivate-customer) |

---

### Subsystem: System History (`/api/history`)

| Method | Endpoint | Description | Permissions | Contract Document |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/history` | Query paginated audit logs with filters | `history.view` | [history/history.api.md](file:///docs/api-contracts/history/history.api.md#1-view-history-logs-list-filter-search--pagination) |
| `GET` | `/api/history/:id` | View single history log record detail | `history.view` | [history/history.api.md](file:///docs/api-contracts/history/history.api.md#2-view-single-history-log-detail) |
