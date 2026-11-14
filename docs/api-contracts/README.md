# MadayawGas API Contracts & Documentation Directory

Welcome to the MadayawGas Backend RESTful API documentation. This directory provides the comprehensive API contracts, payload schemas, query parameters, authentication mechanics, and response envelopes for all subsystems of the MadayawGas operations management platform.

---

## 1. Global API Standards & Architecture

### Base URL Paths

MadayawGas is organized into **5 Main Subsystems**, supported by **System Logic** cross-cutting utilities:

| Classification | Base Path(s) | Description |
| :--- | :--- | :--- |
| **1. User Management** | `/api/users` | Authentication, sessions, user profiles, avatars, admin management, and RBAC |
| **2. Fleet & Maintenance** | `/api/fleet`, `/api/operations/fuel` | Fleet overview, vehicle inventory, driver assignments, maintenance tracking, and fuel telemetry |
| **3. Trip & Schedule** | `/api/schedules`, `/api/trips`, `/api/operations/apprehensions`, `/api/operations/alerts` | Service zones, weekly route templates, daily schedules, trip dispatch, loads, reconciliation, road apprehensions, and emergency SOS alerts |
| **4. Inventory** | `/api/inventory` | LPG product catalog, Bunawan plant bulk stock, adjustments, and stock transfers |
| **5. Sales & Delivery** | `/api/sales` | Customer profiles, offline batch sync, transactions, invoices, shift closeout, and sales analytics |
| **System Logic** *(Cross-Cutting Infrastructure)* | `/api/history`, `/api/media` | Centralized system event history logs and media/document storage utilities (non-subsystem) |

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

#### Standard Paginated Envelope (`200 OK`)
When opt-in pagination parameters (`page`, `limit`, or `pageSize`) are provided on high-volume listing endpoints:
```json
{
  "status": "success",
  "data": [
    { "...": "Entity item 1" },
    { "...": "Entity item 2" }
  ],
  "meta": {
    "page": 1,
    "limit": 20,
    "totalItems": 45,
    "totalPages": 3,
    "hasNextPage": true,
    "hasPrevPage": false
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
- Vehicle deactivations (`PATCH /api/fleet/vehicles/:id/deactivate`)
- Product deactivations (`PATCH /api/inventory/products/:id/deactivate`)
- Customer deactivations (`PATCH /api/sales/customers/:id/deactivate`)

---

## 2. Directory Structure

The contracts are organized around the **5 Main Subsystems** plus **System Logic** cross-cutting utilities:

```text
docs/api-contracts/
├── README.md                                # This master directory & route index
├── websockets.md                            # Real-Time WebSocket events, handshake auth & rooms catalog
│
├── users/                                   # Subsystem 1: User Management
│   ├── auth.api.md                          # Login, logout, self password change
│   ├── profile.api.md                       # /me profile inspection, personal updates & avatar upload/delete
│   ├── management.api.md                    # User account administration, credentials, roles, status
│   └── roles.api.md                         # Role CRUD, system permissions catalog
│
├── fleet/                                   # Subsystem 2: Fleet & Maintenance
│   ├── availability.api.md                  # Overview, availability metrics, vehicle state changes
│   ├── vehicles.api.md                      # Vehicle inventory CRUD, my-vehicle, registration options, deactivation
│   ├── drivers.api.md                       # Driver assignment, unassignment, driver directory
│   ├── maintenance.api.md                   # Odometer return log, 5,000-km PM engine, inspections, incidents, work orders
│   └── fuel.api.md                          # Fuel intake logging, consumption summary & km/L efficiency analysis
│
├── schedules/                               # Subsystem 3: Trip & Schedule
│   └── schedules.api.md                     # Service zones, weekly master templates, daily schedules
├── trips/                                   # Subsystem 3: Trip & Schedule
│   ├── trips.api.md                         # Real-time dispatch, active assignment, multi-load transfers, reconciliation
│   ├── apprehensions.api.md                 # Driver roadside traffic apprehensions & resolution statuses
│   └── alerts.api.md                        # Driver emergency SOS alerts, polling & triage
│
├── inventory/                               # Subsystem 4: Inventory
│   ├── products.api.md                      # Product CRUD, cylinder/canister specs, deactivation
│   └── plant-inventory-and-reconciliation.api.md # Plant bulk stock, adjustments, transfers & cabin stock
│
├── sales/                                   # Subsystem 5: Sales & Delivery
│   ├── customer.api.md                      # Customer Profile CRUD, activation/deactivation
│   ├── sync.api.md                          # Offline mobile store-and-forward batch sync
│   ├── transactions.api.md                  # Transactions, voiding, overview analytics, trip performance & shift summary
│   └── invoices.api.md                      # Sales invoices listing & supervisor GCash verification
│
├── history/                                 # System Logic: Audit & History Logs
│   └── history.api.md                       # System event history logs, module filters, search, detail
│
├── media/                                   # System Logic: Media & Documents
│   └── media.api.md                         # Ingest, validate, store, resolve canonical media assets
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

### 1. Subsystem: User Management (`/api/users`)

| Method | Endpoint | Description | Permissions | Contract Document |
| :--- | :--- | :--- | :--- | :--- |
| `POST` | `/api/users/login` | Authenticate credentials & create session | Public | [users/auth.api.md](file:///docs/api-contracts/users/auth.api.md#1-user-login) |
| `POST` | `/api/users/logout` | Invalidate active session & clear cookie | Authenticated | [users/auth.api.md](file:///docs/api-contracts/users/auth.api.md#2-user-logout) |
| `POST` | `/api/users/change-password` | Change user password (first login or self-service) | Authenticated | [users/auth.api.md](file:///docs/api-contracts/users/auth.api.md#3-change-password-self) |
| `GET` | `/api/users/me` | Get current authenticated user profile | Authenticated | [users/profile.api.md](file:///docs/api-contracts/users/profile.api.md#1-get-current-user-profile-me) |
| `PATCH` | `/api/users/me` | Update current user's personal details | Authenticated | [users/profile.api.md](file:///docs/api-contracts/users/profile.api.md#2-update-current-user-profile-me) |
| `POST` | `/api/users/me/avatar` | Upload/replace own profile avatar | Authenticated | [users/profile.api.md](file:///docs/api-contracts/users/profile.api.md#3-upload--replace-own-profile-picture-post-meavatar) |
| `DELETE` | `/api/users/me/avatar` | Remove own profile avatar | Authenticated | [users/profile.api.md](file:///docs/api-contracts/users/profile.api.md#4-remove-own-profile-picture-delete-meavatar) |
| `GET` | `/api/users` | List all user accounts with filtering | `users.view` | [users/management.api.md](file:///docs/api-contracts/users/management.api.md#1-list-all-users) |
| `POST` | `/api/users` | Register new user account (auto credentials) | `users.manage` | [users/management.api.md](file:///docs/api-contracts/users/management.api.md#2-register--create-user-account) |
| `GET` | `/api/users/:id` | View specific user account details | `users.view` / Self | [users/management.api.md](file:///docs/api-contracts/users/management.api.md#3-view-user-profile-by-id) |
| `PATCH` | `/api/users/:id` | Update target user profile attributes | `users.manage` / Self | [users/management.api.md](file:///docs/api-contracts/users/management.api.md#4-update-user-profile-by-id) |
| `POST` | `/api/users/:id/avatar` | Upload/replace target user avatar | `users.manage` / Self | [users/profile.api.md](file:///docs/api-contracts/users/profile.api.md#5-admin-upload--replace-avatar-post-idavatar) |
| `DELETE` | `/api/users/:id/avatar` | Remove target user avatar | `users.manage` / Self | [users/profile.api.md](file:///docs/api-contracts/users/profile.api.md#6-admin-remove-avatar-delete-idavatar) |
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

### 2. Subsystem: Fleet & Maintenance (`/api/fleet`, `/api/operations/fuel`)

| Method | Endpoint | Description | Permissions | Contract Document |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/fleet/overview` | Aggregated fleet counts and operational metrics | `fleet.view` | [fleet/availability.api.md](file:///docs/api-contracts/fleet/availability.api.md#1-view-fleet-overview) |
| `GET` | `/api/fleet/availability` | List operational active vehicles ready for dispatch | `fleet.view` | [fleet/availability.api.md](file:///docs/api-contracts/fleet/availability.api.md#2-view-fleet-availability) |
| `GET` | `/api/fleet/vehicles/:id/status` | View operational and availability status of a vehicle | `fleet.view` | [fleet/availability.api.md](file:///docs/api-contracts/fleet/availability.api.md#3-view-vehicle-status) |
| `PATCH` | `/api/fleet/vehicles/:id/status` | Transition operational condition (`ACTIVE`, `MAINTENANCE`, etc.) | `fleet.manage` | [fleet/availability.api.md](file:///docs/api-contracts/fleet/availability.api.md#4-set-vehicle-availability-status) |
| `GET` | `/api/fleet/vehicles` | List all fleet vehicles with filters & pagination | `fleet.view` | [fleet/vehicles.api.md](file:///docs/api-contracts/fleet/vehicles.api.md#1-list-all-vehicles) |
| `GET` | `/api/fleet/vehicles/:id` | Get vehicle details by UUID | `fleet.view` | [fleet/vehicles.api.md](file:///docs/api-contracts/fleet/vehicles.api.md#2-get-vehicle-by-id) |
| `POST` | `/api/fleet/vehicles` | Register a new vehicle into the fleet | `fleet.manage` | [fleet/vehicles.api.md](file:///docs/api-contracts/fleet/vehicles.api.md#3-register-vehicle) |
| `PATCH` | `/api/fleet/vehicles/:id` | Update vehicle model, plate, or specifications | `fleet.manage` | [fleet/vehicles.api.md](file:///docs/api-contracts/fleet/vehicles.api.md#4-update-vehicle-information) |
| `PATCH` | `/api/fleet/vehicles/:id/deactivate` | Soft-deactivate vehicle & release driver | `fleet.manage` + Password | [fleet/vehicles.api.md](file:///docs/api-contracts/fleet/vehicles.api.md#5-deactivate-vehicle) |
| `GET` | `/api/fleet/register-options` | Dropdown metadata and available unassigned drivers | `fleet.manage` | [fleet/vehicles.api.md](file:///docs/api-contracts/fleet/vehicles.api.md#6-fleet-register-page-options) |
| `PATCH` | `/api/fleet/vehicles/:id/assign` | Assign dedicated default driver to vehicle | `fleet.manage` | [fleet/drivers.api.md](file:///docs/api-contracts/fleet/drivers.api.md#1-assign-driver-to-vehicle) |
| `PATCH` | `/api/fleet/vehicles/:id/unassign` | Unassign driver from vehicle | `fleet.manage` | [fleet/drivers.api.md](file:///docs/api-contracts/fleet/drivers.api.md#2-unassign-driver-from-vehicle) |
| `GET` | `/api/fleet/drivers` | Directory of all eligible drivers & status | `fleet.view` / `fleet.manage` / `route.view` / `route.manage` | [fleet/drivers.api.md](file:///docs/api-contracts/fleet/drivers.api.md#3-driver-directory-list-all-drivers) |
| `GET` | `/api/fleet/drivers/available` | List available unassigned drivers | `fleet.view` / `fleet.manage` / `route.view` / `route.manage` | [fleet/drivers.api.md](file:///docs/api-contracts/fleet/drivers.api.md#4-list-available-drivers) |
| `POST` | `/api/fleet/maintenance/odometer` | Record yard return odometer & evaluate 5,000-km PM | `fleet.manage` | [fleet/maintenance.api.md](file:///docs/api-contracts/fleet/maintenance.api.md#1-record-single-point-return-odometer-reading) |
| `GET` | `/api/fleet/maintenance/odometer/vehicle/:vehicleId` | Chronological odometer log history for vehicle | `fleet.view` | [fleet/maintenance.api.md](file:///docs/api-contracts/fleet/maintenance.api.md#2-view-truck-odometer-log-history) |
| `GET` | `/api/fleet/maintenance/pm-overview` | 5,000-km preventive maintenance fleet overview | `fleet.view` | [fleet/maintenance.api.md](file:///docs/api-contracts/fleet/maintenance.api.md#3-view-fleet-pm-status-overview) |
| `POST` | `/api/fleet/vehicles/:id/mileage` | Record vehicle mileage reading (legacy) | `fleet.manage` | [fleet/maintenance.api.md](file:///docs/api-contracts/fleet/maintenance.api.md#4-record-vehicle-mileage-legacy) |
| `POST` | `/api/fleet/maintenance/inspections` | Record safety inspection & ground on failure/discretion | `fleet.manage` | [fleet/maintenance.api.md](file:///docs/api-contracts/fleet/maintenance.api.md#5-record-safety-inspection) |
| `GET` | `/api/fleet/maintenance/inspections/vehicle/:vehicleId` | View paginated inspection history for vehicle | `fleet.view` | [fleet/maintenance.api.md](file:///docs/api-contracts/fleet/maintenance.api.md#6-view-truck-inspections-history) |
| `GET` | `/api/fleet/maintenance/inspections/:id` | Get single safety inspection record detail | `fleet.view` | [fleet/maintenance.api.md](file:///docs/api-contracts/fleet/maintenance.api.md#7-get-inspection-record-by-id) |
| `GET` | `/api/fleet/maintenance/incidents/types` | Reference catalog of incident classification types | `fleet.view` | [fleet/maintenance.api.md](file:///docs/api-contracts/fleet/maintenance.api.md#8-get-incident-types-catalog) |
| `POST` | `/api/fleet/maintenance/incidents` | Report breakdown/incident & ground on critical | `fleet.manage` | [fleet/maintenance.api.md](file:///docs/api-contracts/fleet/maintenance.api.md#9-report-incident--breakdown) |
| `GET` | `/api/fleet/maintenance/incidents` | Fleet-wide incident reports list with filters | `fleet.view` | [fleet/maintenance.api.md](file:///docs/api-contracts/fleet/maintenance.api.md#10-list-fleet-incidents) |
| `GET` | `/api/fleet/maintenance/incidents/vehicle/:vehicleId` | View incident history for specific vehicle | `fleet.view` | [fleet/maintenance.api.md](file:///docs/api-contracts/fleet/maintenance.api.md#11-view-truck-incident-history) |
| `GET` | `/api/fleet/maintenance/incidents/:id` | Get single incident report detail | `fleet.view` | [fleet/maintenance.api.md](file:///docs/api-contracts/fleet/maintenance.api.md#12-get-incident-report-by-id) |
| `GET` | `/api/fleet/maintenance/work-orders/types` | Reference catalog of maintenance types | `fleet.view` | [fleet/maintenance.api.md](file:///docs/api-contracts/fleet/maintenance.api.md#13-list-maintenance-types) |
| `POST` | `/api/fleet/maintenance/work-orders` | Create work order & ground vehicle (approval gate >= 5000) | `fleet.manage` | [fleet/maintenance.api.md](file:///docs/api-contracts/fleet/maintenance.api.md#14-create-maintenance-work-order) |
| `GET` | `/api/fleet/maintenance/work-orders` | List fleet work orders with filters & status | `fleet.view` | [fleet/maintenance.api.md](file:///docs/api-contracts/fleet/maintenance.api.md#15-list-fleet-work-orders) |
| `GET` | `/api/fleet/maintenance/work-orders/:id` | Get single work order details, receipts & approval history | `fleet.view` | [fleet/maintenance.api.md](file:///docs/api-contracts/fleet/maintenance.api.md#16-get-work-order-details-by-id) |
| `PATCH` | `/api/fleet/maintenance/work-orders/:id/status` | Update work order operational state | `fleet.manage` | [fleet/maintenance.api.md](file:///docs/api-contracts/fleet/maintenance.api.md#17-update-work-order-status) |
| `POST` | `/api/fleet/maintenance/work-orders/:id/approve` | Cost approval decision for high-cost repair | Super Admin / Admin | [fleet/maintenance.api.md](file:///docs/api-contracts/fleet/maintenance.api.md#18-executive-cost-approval-decision) |
| `POST` | `/api/fleet/maintenance/work-orders/:id/approval-requests` | Submit sequential cost approval request | `fleet.manage` | [fleet/maintenance.api.md](file:///docs/api-contracts/fleet/maintenance.api.md#181-request-work-order-cost-approval) |
| `GET` | `/api/fleet/maintenance/work-orders/:id/approval-requests` | Retrieve approval request history | `fleet.view` | [fleet/maintenance.api.md](file:///docs/api-contracts/fleet/maintenance.api.md#182-get-work-order-approval-requests) |
| `POST` | `/api/fleet/maintenance/work-orders/:id/finalize` | Finalize maintenance log, reset PM & release vehicle | `fleet.manage` | [fleet/maintenance.api.md](file:///docs/api-contracts/fleet/maintenance.api.md#19-finalize-maintenance-log--release-vehicle) |
| `GET` | `/api/fleet/maintenance/logs` | Query historical maintenance servicing logs | `fleet.view` | [fleet/maintenance.api.md](file:///docs/api-contracts/fleet/maintenance.api.md#20-query-historical-maintenance-logs) |
| `GET` | `/api/fleet/maintenance/analytics/recurring-issues` | Fleet recurring issues aggregation & analytics | `fleet.view` | [fleet/maintenance.api.md](file:///docs/api-contracts/fleet/maintenance.api.md#21-get-recurring-issues-fleet-analytics) |
| `POST` | `/api/fleet/maintenance/work-orders/:id/receipts` | Attach proof receipt document to work order | `fleet.manage` | [fleet/maintenance.api.md](file:///docs/api-contracts/fleet/maintenance.api.md#22-attach-receipt-to-work-order) |
| `GET` | `/api/fleet/maintenance/work-orders/:id/receipts` | List all receipts attached to work order | `fleet.view` | [fleet/maintenance.api.md](file:///docs/api-contracts/fleet/maintenance.api.md#23-list-work-order-receipts) |
| `DELETE` | `/api/fleet/maintenance/receipts/:receiptId` | Delete a receipt attachment | `fleet.manage` | [fleet/maintenance.api.md](file:///docs/api-contracts/fleet/maintenance.api.md#24-delete-work-order-receipt) |
| `GET` | `/api/fleet/my-vehicle` | Get authenticated driver's assigned vehicle | `fleet.view` / `fleet.view_own` | [fleet/vehicles.api.md](file:///docs/api-contracts/fleet/vehicles.api.md#8-get-authenticated-drivers-assigned-vehicle) |
| `GET` | `/api/fleet/fuel-analysis` | Fleet-wide fuel efficiency & `km/L` analytics (alias) | `fleet.view` / `fuel.view` | [fleet/fuel.api.md](file:///docs/api-contracts/fleet/fuel.api.md#24-fleet-fuel-efficiency-analysis) |
| `GET` | `/api/fleet/vehicles/:id/fuel-analysis` | Single-vehicle fuel efficiency analysis (alias) | `fleet.view` / `fuel.view` | [fleet/fuel.api.md](file:///docs/api-contracts/fleet/fuel.api.md#25-single-vehicle-fuel-analysis) |
| `POST` | `/api/operations/fuel` | Record vehicle fuel intake & optional odometer reading | `fuel.create` | [fleet/fuel.api.md](file:///docs/api-contracts/fleet/fuel.api.md#21-record-fuel-entry) |
| `GET` | `/api/operations/fuel` | List fuel logs with filtering & pagination | `fuel.view` / `fuel.view_own` | [fleet/fuel.api.md](file:///docs/api-contracts/fleet/fuel.api.md#22-list-fuel-logs) |
| `GET` | `/api/operations/fuel/summary` | Fuel consumption summary statistics | `fuel.view` / `fuel.view_own` | [fleet/fuel.api.md](file:///docs/api-contracts/fleet/fuel.api.md#23-fuel-summary) |
| `GET` | `/api/operations/fuel/analysis` | Fleet-wide fuel efficiency & `km/L` analytics | `fuel.view` / `fleet.view` | [fleet/fuel.api.md](file:///docs/api-contracts/fleet/fuel.api.md#24-fleet-fuel-efficiency-analysis) |
| `GET` | `/api/operations/fuel/analysis/:vehicleId` | Single-vehicle fuel efficiency & fill-up breakdown | `fuel.view` / `fleet.view` | [fleet/fuel.api.md](file:///docs/api-contracts/fleet/fuel.api.md#25-single-vehicle-fuel-analysis) |
| `GET` | `/api/operations/fuel/:id` | Get single fuel log entry details | `fuel.view` / `fuel.view_own` | [fleet/fuel.api.md](file:///docs/api-contracts/fleet/fuel.api.md#26-get-single-fuel-log) |

---

### 3. Subsystem: Trip & Schedule (`/api/schedules`, `/api/trips`, `/api/operations/apprehensions`, `/api/operations/alerts`)

| Method | Endpoint | Description | Permissions | Contract Document |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/schedules/zones` | List delivery service zones | `route.view` / `route.view_own` | [schedules/schedules.api.md](file:///docs/api-contracts/schedules/schedules.api.md#1-service-zones) |
| `GET` | `/api/schedules/zones/:id` | Get single delivery service zone | `route.view` / `route.view_own` | [schedules/schedules.api.md](file:///docs/api-contracts/schedules/schedules.api.md#1-service-zones) |
| `POST` | `/api/schedules/zones` | Register new delivery service zone | `route.manage` | [schedules/schedules.api.md](file:///docs/api-contracts/schedules/schedules.api.md#1-service-zones) |
| `PATCH` | `/api/schedules/zones/:id` | Update delivery service zone | `route.manage` | [schedules/schedules.api.md](file:///docs/api-contracts/schedules/schedules.api.md#1-service-zones) |
| `GET` | `/api/schedules/templates` | List recurring weekly route templates | `route.view` | [schedules/schedules.api.md](file:///docs/api-contracts/schedules/schedules.api.md#2-weekly-master-route-templates) |
| `GET` | `/api/schedules/templates/:id` | Get single weekly route template | `route.view` | [schedules/schedules.api.md](file:///docs/api-contracts/schedules/schedules.api.md#2-weekly-master-route-templates) |
| `POST` | `/api/schedules/templates` | Create recurring weekly master template | `route.manage` | [schedules/schedules.api.md](file:///docs/api-contracts/schedules/schedules.api.md#2-weekly-master-route-templates) |
| `PATCH` | `/api/schedules/templates/:id` | Update weekly master template | `route.manage` | [schedules/schedules.api.md](file:///docs/api-contracts/schedules/schedules.api.md#2-weekly-master-route-templates) |
| `DELETE` | `/api/schedules/templates/:id` | Delete weekly master template | `route.manage` | [schedules/schedules.api.md](file:///docs/api-contracts/schedules/schedules.api.md#2-weekly-master-route-templates) |
| `GET` | `/api/schedules` | List operational daily truck schedules | `route.view` / `route.view_own` | [schedules/schedules.api.md](file:///docs/api-contracts/schedules/schedules.api.md#3-operational-daily-truck-schedules) |
| `POST` | `/api/schedules` | Create ad-hoc single-day truck schedule | `route.manage` | [schedules/schedules.api.md](file:///docs/api-contracts/schedules/schedules.api.md#3-operational-daily-truck-schedules) |
| `POST` | `/api/schedules/generate` | Batch generate daily schedules from templates | `route.manage` | [schedules/schedules.api.md](file:///docs/api-contracts/schedules/schedules.api.md#3-operational-daily-truck-schedules) |
| `GET` | `/api/schedules/:id` | View single operational schedule detail | `route.view` / `route.view_own` | [schedules/schedules.api.md](file:///docs/api-contracts/schedules/schedules.api.md#3-operational-daily-truck-schedules) |
| `PATCH` | `/api/schedules/:id` | Modify operational schedule parameters | `route.manage` | [schedules/schedules.api.md](file:///docs/api-contracts/schedules/schedules.api.md#3-operational-daily-truck-schedules) |
| `PATCH` | `/api/schedules/:id/cancel` | Cancel scheduled operational run | `route.manage` | [schedules/schedules.api.md](file:///docs/api-contracts/schedules/schedules.api.md#3-operational-daily-truck-schedules) |
| `GET` | `/api/schedules/sales-persons` | Active sales representatives directory | `route.view` / `route.manage` / `sales.view` / `users.view` | [schedules/schedules.api.md](file:///docs/api-contracts/schedules/schedules.api.md#4-sales-representatives-directory) |
| `POST` | `/api/trips/dispatch` | Dispatch truck for scheduled or ad-hoc run | `route.manage` | [trips/trips.api.md](file:///docs/api-contracts/trips/trips.api.md#1-dispatch-trip-post-apitripsdispatch) |
| `GET` | `/api/trips` | List delivery trips with filters & pagination | `route.view` / `route.view_own` | [trips/trips.api.md](file:///docs/api-contracts/trips/trips.api.md) |
| `GET` | `/api/trips/active-assignment` | Get current user's active trip assignment | `route.view` / `route.view_own` / `route.end_own` | [trips/trips.api.md](file:///docs/api-contracts/trips/trips.api.md#5-driver-active-assignment-get-apitripsactive-assignment) |
| `GET` | `/api/trips/:id` | View trip detail, crew snapshot & loads | `route.view` / `route.view_own` | [trips/trips.api.md](file:///docs/api-contracts/trips/trips.api.md) |
| `PATCH` | `/api/trips/:id/cancel` | Cancel active or pending trip | `route.manage` | [trips/trips.api.md](file:///docs/api-contracts/trips/trips.api.md) |
| `POST` | `/api/trips/:id/loads` | Record multi-load transfer slip (reload/unload) | `route.manage` | [trips/trips.api.md](file:///docs/api-contracts/trips/trips.api.md#2-multi-load-inventory-transfer-post-apitripsidloads) |
| `GET` | `/api/trips/:id/loads` | List all transfer slips and line items for trip | `route.view` / `route.view_own` | [trips/trips.api.md](file:///docs/api-contracts/trips/trips.api.md) |
| `POST` | `/api/trips/:id/end` | Driver end trip with mandatory odometer reading | `route.end_own` / `route.manage` | [trips/trips.api.md](file:///docs/api-contracts/trips/trips.api.md#3-driver-end-trip-post-apitripsidend) |
| `POST` | `/api/trips/:id/reconcile` | Settle post-trip stock variance, return unloads & discrepancies | `route.manage` / `inventory.vehicle.manage` / `inventory.plant.manage` | [trips/trips.api.md](file:///docs/api-contracts/trips/trips.api.md#4-post-trip-stock-reconciliation-post-apitripsidreconcile) |
| `GET` | `/api/trips/:id/reconciliation` | View reconciliation discrepancy breakdown | `route.view` / `route.view_own` | [trips/trips.api.md](file:///docs/api-contracts/trips/trips.api.md) |
| `POST` | `/api/operations/apprehensions` | Record roadside traffic apprehension with ticket photo | `apprehensions.create` | [trips/apprehensions.api.md](file:///docs/api-contracts/trips/apprehensions.api.md#21-record-road-apprehension) |
| `GET` | `/api/operations/apprehensions` | List road apprehensions with filters & pagination | `apprehensions.view` / `apprehensions.view_own` | [trips/apprehensions.api.md](file:///docs/api-contracts/trips/apprehensions.api.md#22-list-road-apprehensions) |
| `GET` | `/api/operations/apprehensions/:id` | Get single apprehension detail | `apprehensions.view` / `apprehensions.view_own` | [trips/apprehensions.api.md](file:///docs/api-contracts/trips/apprehensions.api.md#23-get-single-apprehension-detail) |
| `PATCH` | `/api/operations/apprehensions/:id/status` | Update apprehension resolution status | `apprehensions.manage` | [trips/apprehensions.api.md](file:///docs/api-contracts/trips/apprehensions.api.md#24-update-apprehension-status) |
| `POST` | `/api/operations/alerts` | Trigger mobile emergency SOS alert | `alerts.trigger` | [trips/alerts.api.md](file:///docs/api-contracts/trips/alerts.api.md#21-trigger-emergency-sos-alert) |
| `GET` | `/api/operations/alerts/active` | List active (`ACTIVE`, `ACKNOWLEDGED`) SOS alerts | `alerts.view` | [trips/alerts.api.md](file:///docs/api-contracts/trips/alerts.api.md#22-list-active-emergency-alerts) |
| `GET` | `/api/operations/alerts/poll` | Delta polling for emergency alerts (`?since=`) | `alerts.view` | [trips/alerts.api.md](file:///docs/api-contracts/trips/alerts.api.md#23-poll-delta-alerts) |
| `GET` | `/api/operations/alerts` | List all emergency alert logs | `alerts.view` / `alerts.view_own` | [trips/alerts.api.md](file:///docs/api-contracts/trips/alerts.api.md#24-list-all-alert-logs) |
| `GET` | `/api/operations/alerts/:id` | Get single emergency alert detail | `alerts.view` / `alerts.view_own` | [trips/alerts.api.md](file:///docs/api-contracts/trips/alerts.api.md#25-get-single-alert-detail) |
| `PATCH` | `/api/operations/alerts/:id/acknowledge` | Acknowledge emergency alert | `alerts.manage` | [trips/alerts.api.md](file:///docs/api-contracts/trips/alerts.api.md#26-acknowledge-emergency-alert) |
| `PATCH` | `/api/operations/alerts/:id/resolve` | Resolve emergency alert with notes | `alerts.manage` | [trips/alerts.api.md](file:///docs/api-contracts/trips/alerts.api.md#27-resolve-emergency-alert) |

---

### 4. Subsystem: Inventory (`/api/inventory`)

| Method | Endpoint | Description | Permissions | Contract Document |
| :--- | :--- | :--- | :--- | :--- |
| `POST` | `/api/inventory/products` | Register a new product item | `inventory.manage` | [inventory/products.api.md](file:///docs/api-contracts/inventory/products.api.md#1-register-item--product) |
| `GET` | `/api/inventory/products` | List and search products with filters | `inventory.view` | [inventory/products.api.md](file:///docs/api-contracts/inventory/products.api.md#2-view-item-profiles-list--search) |
| `GET` | `/api/inventory/products/:id` | View single product profile by UUID | `inventory.view` | [inventory/products.api.md](file:///docs/api-contracts/inventory/products.api.md#3-view-single-item-profile) |
| `PATCH` | `/api/inventory/products/:id` | Update product item attributes | `inventory.manage` | [inventory/products.api.md](file:///docs/api-contracts/inventory/products.api.md#4-update-item-profile) |
| `PATCH` | `/api/inventory/products/:id/deactivate` | Soft-deactivate product item | `inventory.manage` + Password | [inventory/products.api.md](file:///docs/api-contracts/inventory/products.api.md#5-deactivate-item) |
| `GET` | `/api/inventory/plant` | Master Bunawan yard stock overview across all active products | `inventory.view` | [inventory/plant-inventory-and-reconciliation.api.md](file:///docs/api-contracts/inventory/plant-inventory-and-reconciliation.api.md#31-master-plant-bulk-inventory-overview) |
| `POST` | `/api/inventory/plant/restock` | Supplier bulk shipment stock-in (increments plant stock) | `inventory.plant.manage` | [inventory/plant-inventory-and-reconciliation.api.md](file:///docs/api-contracts/inventory/plant-inventory-and-reconciliation.api.md#32-supplier-bulk-restock) |
| `POST` | `/api/inventory/plant/quarantine-defects` | Quarantines yard leakers/defective stock into defective bucket | `inventory.plant.manage` | [inventory/plant-inventory-and-reconciliation.api.md](file:///docs/api-contracts/inventory/plant-inventory-and-reconciliation.api.md#33-quarantine-yard-defects) |
| `POST` | `/api/inventory/plant/adjust` | Manual plant stock / physical count adjustment | `inventory.plant.manage` | [inventory/plant-inventory-and-reconciliation.api.md](file:///docs/api-contracts/inventory/plant-inventory-and-reconciliation.api.md#310-manual-plant-stock-adjustment) |
| `GET` | `/api/inventory/plant/adjustments` | Historical plant stock adjustments audit log | `inventory.view` | [inventory/plant-inventory-and-reconciliation.api.md](file:///docs/api-contracts/inventory/plant-inventory-and-reconciliation.api.md#2-endpoints-matrix) |
| `GET` | `/api/inventory/plant/suggested-split` | Equal truck loading split suggestion helper | `inventory.view` / `inventory.vehicle.manage` / `route.manage` | [inventory/plant-inventory-and-reconciliation.api.md](file:///docs/api-contracts/inventory/plant-inventory-and-reconciliation.api.md#34-suggested-equal-loading-split-helper) |
| `GET` | `/api/inventory/transfers` | Global cross-fleet paginated ledger of all transfer slips & plant restocks | `inventory.view` | [inventory/plant-inventory-and-reconciliation.api.md](file:///docs/api-contracts/inventory/plant-inventory-and-reconciliation.api.md#39-global-cross-fleet-inventory-transfers-ledger) |
| `POST` | `/api/inventory/trips/:tripId/dispatch-load` | Staging/dispatch load or midday reload (deducts plant stock) | `inventory.vehicle.manage` / `route.manage` | [inventory/plant-inventory-and-reconciliation.api.md](file:///docs/api-contracts/inventory/plant-inventory-and-reconciliation.api.md#35-dispatch-load--midday-reload) |
| `POST` | `/api/inventory/trips/:tripId/return-unload` | Post-dispatch physical return unload manifest | `inventory.vehicle.manage` / `inventory.plant.manage` / `route.manage` | [inventory/plant-inventory-and-reconciliation.api.md](file:///docs/api-contracts/inventory/plant-inventory-and-reconciliation.api.md#36-post-dispatch-physical-return-unload) |
| `GET` | `/api/inventory/trips/:tripId/transfers` | Retrieves all multi-load and return transfer slips for a trip | `inventory.view` / `inventory.vehicle.manage` / `route.manage` | [inventory/plant-inventory-and-reconciliation.api.md](file:///docs/api-contracts/inventory/plant-inventory-and-reconciliation.api.md#2-endpoints-matrix) |
| `GET` | `/api/inventory/trips/:tripId/stock` | Cabin visibility: Current on-board unit balance per product | `inventory.view` / `inventory.view_own` / `inventory.vehicle.manage` | [inventory/plant-inventory-and-reconciliation.api.md](file:///docs/api-contracts/inventory/plant-inventory-and-reconciliation.api.md#37-cabin-vehicle-active-stock-visibility) |
| `POST` | `/api/inventory/trips/:tripId/reconcile` | Evaluates post-trip reconciliation math per SKU & settles trip | `inventory.vehicle.manage` / `route.manage` | [inventory/plant-inventory-and-reconciliation.api.md](file:///docs/api-contracts/inventory/plant-inventory-and-reconciliation.api.md#38-post-trip-multi-sku-reconciliation-engine) |
| `GET` | `/api/inventory/trips/:tripId/reconciliation` | Retrieves trip reconciliation report and per-SKU variance breakdown | `inventory.view` / `inventory.vehicle.manage` / `route.manage` | [inventory/plant-inventory-and-reconciliation.api.md](file:///docs/api-contracts/inventory/plant-inventory-and-reconciliation.api.md#2-endpoints-matrix) |


---

### 5. Subsystem: Sales & Delivery (`/api/sales`)

| Method | Endpoint | Description | Permissions | Contract Document |
| :--- | :--- | :--- | :--- | :--- |
| `POST` | `/api/sales/customers` | Register a new customer profile | `sales.create` | [sales/customer.api.md](file:///docs/api-contracts/sales/customer.api.md#1-register-customer) |
| `GET` | `/api/sales/customers` | List and search customers | `sales.view` / `sales.view_own` | [sales/customer.api.md](file:///docs/api-contracts/sales/customer.api.md#2-view-customer-overview-list--search) |
| `GET` | `/api/sales/customers/:id` | View single customer profile by UUID | `sales.view` / `sales.view_own` | [sales/customer.api.md](file:///docs/api-contracts/sales/customer.api.md#3-view-single-customer-profile) |
| `PATCH` | `/api/sales/customers/:id` | Update customer profile attributes | `sales.update` | [sales/customer.api.md](file:///docs/api-contracts/sales/customer.api.md#4-update-customer-profile) |
| `PATCH` | `/api/sales/customers/:id/deactivate` | Soft-deactivate customer profile | `sales.update` + Password | [sales/customer.api.md](file:///docs/api-contracts/sales/customer.api.md#5-deactivate-customer) |
| `PATCH` | `/api/sales/customers/:id/activate` | Reactivate deactivated customer profile | `sales.update` | [sales/customer.api.md](file:///docs/api-contracts/sales/customer.api.md#6-activate-customer) |
| `POST` | `/api/sales/sync-batch` | Itemized batch ingestion of offline mobile sales transactions with partial-success resilience | `sales.create` / `sales.view_own` | [sales/sync.api.md](file:///docs/api-contracts/sales/sync.api.md) |
| `GET` | `/api/sales/overview` | High-level sales KPIs, SKU/payment breakdowns & trends | `sales.view` / `sales.view_own` / `dashboard.view` | [sales/transactions.api.md](file:///docs/api-contracts/sales/transactions.api.md#24-sales-overview--analytics) |
| `GET` | `/api/sales/analytics` | Sales analytics alias (`/overview`) | `sales.view` / `sales.view_own` / `dashboard.view` | [sales/transactions.api.md](file:///docs/api-contracts/sales/transactions.api.md#24-sales-overview--analytics) |
| `GET` | `/api/sales/trip-performance` | Operational delivery trip sales revenue attribution | `sales.view` / `sales.view_own` | [sales/transactions.api.md](file:///docs/api-contracts/sales/transactions.api.md#25-operational-delivery-trip-performance) |
| `GET` | `/api/sales/transactions` | List and search sales transactions with filters & pagination | `sales.view` / `sales.view_own` | [sales/transactions.api.md](file:///docs/api-contracts/sales/transactions.api.md#21-list-sales-transactions) |
| `GET` | `/api/sales/transactions/:id` | View single transaction details with line items and invoice | `sales.view` / `sales.view_own` | [sales/transactions.api.md](file:///docs/api-contracts/sales/transactions.api.md#22-get-single-transaction-details) |
| `PATCH` | `/api/sales/transactions/:id/cancel` | Supervisor cancellation of a transaction with canister ledger reversal | `sales.delete` | [sales/transactions.api.md](file:///docs/api-contracts/sales/transactions.api.md#23-cancel--void-sales-transaction) |
| `GET` | `/api/sales/trips/:tripId/shift-summary` | End-of-shift remittance summary — revenue, GCash refs, empties aggregation | `sales.view` / `sales.view_own` | [sales/transactions.api.md](file:///docs/api-contracts/sales/transactions.api.md#26-shift-closeout-remittance-summary) |
| `GET` | `/api/sales/invoices` | List sales invoices with payment status filters | `sales.view` / `sales.view_own` | [sales/invoices.api.md](file:///docs/api-contracts/sales/invoices.api.md#21-list-sales-invoices) |
| `GET` | `/api/sales/invoices/:id` | View single invoice detail | `sales.view` / `sales.view_own` | [sales/invoices.api.md](file:///docs/api-contracts/sales/invoices.api.md#22-get-single-invoice-details) |
| `PATCH` | `/api/sales/invoices/:id/verify` | Supervisor GCash payment verification | `sales.view` (global) | [sales/invoices.api.md](file:///docs/api-contracts/sales/invoices.api.md#23-verify-invoice-payment-supervisor) |

---

### System Logic (Cross-Cutting Infrastructure — Non-Subsystem)

#### System History (`/api/history`)

| Method | Endpoint | Description | Permissions | Contract Document |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/history` | Query paginated audit logs with filters | `history.view` | [history/history.api.md](file:///docs/api-contracts/history/history.api.md#1-view-history-logs-list-filter-search--pagination) |
| `GET` | `/api/history/:id` | View single history log record detail | `history.view` | [history/history.api.md](file:///docs/api-contracts/history/history.api.md#2-view-single-history-log-detail) |

#### Media & Documents (`/api/media`)

| Method | Endpoint | Description | Permissions | Contract Document |
| :--- | :--- | :--- | :--- | :--- |
| `POST` | `/api/media/upload` | Upload binary media asset & generate canonical storage key | Authenticated | [media/media.api.md](file:///docs/api-contracts/media/media.api.md#41-upload-media-post-apimediaupload) |
| `POST` | `/api/media/resolve` | Resolve canonical relative storage key into public URL | Authenticated | [media/media.api.md](file:///docs/api-contracts/media/media.api.md#42-resolve-media-key-post-apimediaresolve) |
| `DELETE` | `/api/media` | Delete media asset from active storage by key or URL | Authenticated | [media/media.api.md](file:///docs/api-contracts/media/media.api.md#43-delete-media-delete-apimedia) |

---

## 4. Real-Time WebSocket Events & Subscriptions

Comprehensive WebSocket event schemas, handshake authentication requirements, mobile client hooks, and room scoping rules are documented in [**websockets.md**](file:///docs/api-contracts/websockets.md).

| Event Name | Domain Channel | Target Room(s) | Trigger Origin | Invalidation / Client Action |
| :--- | :--- | :--- | :--- | :--- |
| **`EMERGENCY_ALERT_TRIGGERED`** | Driver SOS | `room:alerts` | `POST /api/operations/alerts` | Alarm audio + Modal takeover |
| **`EMERGENCY_ALERT_STATUS_UPDATED`** | Driver SOS | `room:alerts` | `PATCH /api/operations/alerts/:id/acknowledge` or `.../resolve` | Update triage badge |
| **`TRIP_DISPATCHED`** | Trips & Route | `room:trips`, `user:{driverUserId}` | `POST /api/trips/:id/dispatch` | Driver mobile auto-hydrates active trip; invalidate `['active-trips']` |
| **`TRIP_LOAD_RECORDED`** | Trips & Route | `room:trips`, `room:inventory`, `user:{driverUserId}` | `POST /api/trips/:id/loads` | Update cabin stock; invalidate transfers |
| **`VEHICLE_STOCK_UPDATED`** | Cabin Inventory | `room:inventory`, `room:trips`, `user:{driverUserId}` | Load additions or trip return settlement | Invalidate `['vehicle-stock']`, `['trip-stock']` |
| **`TRIP_ENDED`** | Trips & Route | `room:trips`, `user:{driverUserId}` | `POST /api/trips/:id/end` | Driver transitions to return state; trigger plant physical count; invalidate `['active-trips']` |
| **`TRIP_COMPLETED`** | Trips & Route | `room:trips`, `user:{driverUserId}` | `POST /api/trips/:id/reconcile` | Final settlement completed; vehicle released; invalidate `['active-trips']` |
| **`TRIP_RECONCILED`** | Trips & Inventory | `room:trips`, `room:inventory`, `user:{driverUserId}` | `POST /api/trips/:id/reconcile` | Invalidate `['trip-reconciliation']`, `['active-trips']` |
| **`TRIP_CANCELLED`** | Trips & Route | `room:trips`, `user:{driverUserId}` | `POST /api/trips/:id/cancel` | Reset driver active trip screen to standby |
| **`SCHEDULE_CREATED`** | Daily Schedules | `room:schedules` | `POST /api/schedules` | Invalidate `['daily-schedules']` |
| **`SCHEDULES_BATCH_GENERATED`** | Daily Schedules | `room:schedules` | `POST /api/schedules/generate-batch` | Invalidate `['daily-schedules']` |
| **`SCHEDULE_UPDATED`** | Daily Schedules | `room:schedules` | `PUT/PATCH /api/schedules/:id` | Invalidate `['daily-schedules']` |
| **`SCHEDULE_CANCELLED`** | Daily Schedules | `room:schedules` | `POST /api/schedules/:id/cancel` | Invalidate `['daily-schedules']` |
| **`FLEET_VEHICLE_GROUNDED`** | Fleet Readiness | `room:fleet` | Failed inspection, critical incident, or status change | Invalidate `['fleet-availability']`, `['fleet-vehicles']` |
| **`FLEET_VEHICLE_RELEASED`** | Fleet Readiness | `room:fleet` | Work order finalized or status returned to `ACTIVE` | Invalidate `['fleet-availability']`, `['fleet-vehicles']` |
| **`VEHICLE_DRIVER_ASSIGNED`** | Fleet Assets | `room:fleet`, `user:{driverUserId}` | `POST /api/fleet/trucks/:id/assign-driver` | Driver mobile updates assigned truck profile |
| **`VEHICLE_DRIVER_UNASSIGNED`** | Fleet Assets | `room:fleet`, `user:{unassignedDriverUserId}` | `POST /api/fleet/trucks/:id/unassign-driver` | Driver mobile clears assigned truck profile |
| **`VEHICLE_STATUS_UPDATED`** | Fleet Assets | `room:fleet` | `PATCH /api/fleet/trucks/:id/status` | Invalidate `['fleet-vehicles']`, `['fleet-availability']` |
| **`PLANT_STOCK_UPDATED`** | Yard Inventory | `room:inventory` | Dispatch load, return unload, restock, or quarantine | Invalidate `['inventory-plant']`, `['transfers']` |
| **`PRODUCT_CATALOG_UPDATED`** | Product Catalog | `room:inventory` | Product created, updated, or deactivated | Invalidate `['inventory-products']` |
| **`SALES_BATCH_SYNCED`** | Commercial Sales | `room:sales` | `POST /api/sales/sync-batch` (`processedCount > 0`) | Invalidate `['sales-shift-summary']`, `['sales-transactions']` |
| **`SALES_TRANSACTION_CANCELLED`** | Commercial Sales | `room:sales` | `PATCH /api/sales/transactions/:id/cancel` | Invalidate `['sales-transactions']`, reverse customer debt |
| **`SALES_INVOICE_VERIFIED`** | Commercial Sales | `room:sales` | `PATCH /api/sales/invoices/:id/verify` | Invalidate `['sales-invoices']`, badge `VERIFIED` |
| **`APPREHENSION_LOGGED`** | Operational Telemetry | `room:operations`, `user:{driverUserId}` | `POST /api/operations/apprehensions` | Invalidate `['operations-apprehensions']` |
| **`APPREHENSION_STATUS_UPDATED`** | Operational Telemetry | `room:operations`, `user:{driverUserId}` | `PATCH /api/operations/apprehensions/:id/status` | Update citation resolution status |
| **`FUEL_LOGGED`** | Operational Telemetry | `room:operations` | `POST /api/operations/fuel` | Invalidate `['operations-fuel']`, update truck odometer |
| **`AUTH_SESSION_REVOKED`** | User Security | `user:{userId}` | Password change, role update, deactivation | Immediate disconnect, clear token & redirect to login |



