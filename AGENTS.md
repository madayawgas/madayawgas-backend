# AGENTS.md — MadayawGas Backend System Context & Engineering Handbook

> **Last Updated**: August 27, 2026  
> **Purpose**: Single source of truth for developer context, system architecture, engineering standards, current work status, and future roadmap across AI agent sessions.

---

## 1. Overview & Tech Stack

MadayawGas Backend is a modular RESTful API built for an internal enterprise LPG distribution and operations management system.

- **Runtime & Language**: Node.js `22.19.0` (native `node:test` runner, native `crypto`, `fetch`).
- **Web Framework**: Express `v5.2.1` (`express.json()`, custom cookie middleware, centralized error handling).
- **Database Engine**: PostgreSQL `18.x` (managed with `pg` / `pg.Pool` connection pooling).
- **Security & Cryptography**:
  - `bcrypt` (`v6.0.0`, 10 salt rounds) for password hashing.
  - Native `crypto` for session tokens (32-byte hex) and SHA-256 token hashing.
- **Validation**: `zod` (`v4.4.3`).
- **Primary Entry Points**:
  - `src/server.js`: Server startup, port binding (`PORT || 3000`), graceful shutdown handling.
  - `src/app.js`: Express application setup, global middleware pipeline, and route mount points.
  - `database/connection.js`: PostgreSQL connection pool helper (`query`, `pool`).
- **Database Lifecycle Scripts (`package.json`)**:
  - `npm run db:setup`: Verifies PostgreSQL 18, creates database if not exists, applies migrations.
  - `npm run db:migrate`: Executes versioned SQL migrations in transaction blocks (`database/migrations/`).
  - `npm run db:seed`: Executes SQL seeds (`database/seeds/`).
  - `npm run db:reset`: Drops DB, recreates fresh DB, runs migrations and seeds.
  - `npm run db:export`: Schema dumping utility (`pg_dump`).
  - `npm test`: Runs native Node.js test suite concurrently (`node --test src/test/*.test.js`).

---

## 2. Current Architecture & Key Files

The project follows a **Package by Feature (Vertical Slice)** architecture combined with a strict **3-Layer Architecture** within each feature.

```text
madayawgas-backend/
├── AGENTS.md                                # This agent context file
├── database/
│   ├── connection.js                        # pg.Pool database connection & query helper
│   ├── migrations/
│   │   ├── 001_initial-setup.sql            # RBAC, users, sessions, audit_logs schema
│   │   ├── 002_fleet_and_maintenance.sql    # Vehicles, maintenance, dispatch schema
│   │   ├── 003_products.sql                 # Inventory products schema
│   │   ├── 004_customers.sql                # Sales customers schema
│   │   ├── 005_history_logs.sql             # System event history logs schema
│   │   ├── 006_roles_and_permissions_expansion.sql # Roles matrix expansion schema
│   │   ├── 007_multi_role_and_org_chart_roles.sql # Multi-role junction & org chart roles schema
│   │   └── 008_maintenance_and_work_orders.sql # Maintenance, odometer logs, inspections, work orders schema
│   ├── scripts/
│   │   ├── setup.js                         # DB initialization script
│   │   ├── migrate.js                       # Migration runner
│   │   ├── seed.js                          # Seed runner
│   │   ├── reset.js                         # Complete database reset script
│   │   └── export-schema.js                 # Schema export script
│   └── seeds/
│       ├── 001_user_management_seed.sql     # Roles, permissions, role_permissions, seed users
│       ├── 002_fleet_and_maintenance_seed.sql # Seed vehicles and maintenance logs
│       ├── 003_inventory_products_seed.sql  # Seed product items
│       ├── 004_sales_customers_seed.sql     # Seed customer profiles
│       └── 005_history_logs_seed.sql        # Seed system event historical logs
├── docs/
│   ├── API Contract/
│   │   ├── fleet-and-maintenance.api.md     # Fleet and maintenance endpoints contract
│   │   ├── history-log.api.md               # System event history log endpoints contract
│   │   ├── inventory-products.api.md        # Inventory products endpoints contract
│   │   ├── sales-customer.api.md            # Sales customer profile endpoints contract
│   │   └── user-management.api.md           # Formal HTTP API contract and schemas
│   ├── ERD_mermaid/
│   │   ├── fleet_and_maintenance_erd.md     # Fleet ERD diagram
│   │   └── sales_and_delivery_erd.md        # Sales and delivery ERD diagram
│   ├── QA/
│   │   ├── (1)_qa-testing-guide.md          # General QA testing guide & principles
│   │   ├── (2)_seed-credentials.md          # Seed accounts, roles, and test credentials
│   │   └── [example] postman_testing_guide.md # Postman test execution steps
│   ├── backend-developer-guide.md           # Architecture standards & layer conventions
│   ├── frontend-integration-guide.md        # Frontend connection, cookies, and CORS guide
│   ├── permissions.md                       # Comprehensive RBAC permissions list
│   └── user-management-guide.md             # Non-technical PM & QA user flow handbook
├── src/
│   ├── app.js                               # Express app configuration & middleware pipeline
│   ├── server.js                            # Server entry point
│   ├── config/                              # Constants & environment configurations
│   ├── features/
│   │   ├── users/                           # User Management Domain
│   │   │   ├── index.js                     # Unified feature export
│   │   │   ├── users.routes.js              # Express route declarations & route guards
│   │   │   ├── users.controller.js          # HTTP parameter parsing & response formatting
│   │   │   ├── users.repository.js          # Parameterized SQL database queries
│   │   │   ├── auth.service.js              # Session lifecycle, login, logout, password change
│   │   │   ├── profile.service.js           # Profile viewing & personal info updates
│   │   │   ├── management.service.js        # User creation, credentials, deactivation, roles
│   │   │   └── permission.service.js        # RBAC helpers (can, canAll, canAny, isScopedToOwn)
│   │   ├── fleet/
│   │   │   ├── availability/                # Availability metrics and status transitions
│   │   │   ├── maintenance/                 # Odometer logging & distance-based PM engine
│   │   │   ├── trucks/                      # Vehicle CRUD and driver assignments
│   │   │   ├── fleet.routes.js              # Express fleet route definitions
│   │   │   └── index.js                     # Fleet barrel export
│   │   ├── history/                         # System Event History Log Feature
│   │   │   ├── history.repository.js        # History logs data access & queries
│   │   │   ├── history.service.js           # History DTO formatting & event logging
│   │   │   ├── history.controller.js        # History logs HTTP controller
│   │   │   ├── history.routes.js            # Express history route definitions
│   │   │   └── index.js                     # History barrel export
│   │   ├── inventory/                       # Inventory Subsystem
│   │   │   ├── products/                    # Item/Product CRUD (Repository, Service, Controller)
│   │   │   ├── inventory.routes.js          # Express inventory route definitions
│   │   │   └── index.js                     # Inventory barrel export
│   │   └── sales/
│   │       ├── customer/                    # Customer CRUD (Repository, Service, Controller)
│   │       ├── sales.routes.js              # Express sales route definitions
│   │       └── index.js                     # Sales barrel export
│   ├── middleware/
│   │   ├── auth.middleware.js               # authenticate, requirePermission, mustChangePassword guard
│   │   ├── cookie.middleware.js             # Zero-dependency HTTP cookie parser
│   │   └── error.middleware.js              # Centralized global error handler
│   ├── test/                                # Modular domain test suites (node:test)
│   │   ├── auth.test.js                     # Authentication & session tests (prefix: test_auth_)
│   │   ├── customer.test.js                 # Sales customer CRUD tests (prefix: test_cust_)
│   │   ├── fleet.maintenance.test.js        # Fleet odometer & PM tests (prefix: test_maint_odo_)
│   │   ├── fleet.test.js                    # Fleet subsystem tests (prefix: test_fleet_)
│   │   ├── history.test.js                  # System event history log tests (prefix: test_hist_)
│   │   ├── inventory.test.js                # Inventory product CRUD tests (prefix: test_inv_)
│   │   ├── management.test.js               # User management tests (prefix: test_mgmt_)
│   │   ├── permission.test.js               # RBAC & permission tests (prefix: test_perm_)
│   │   └── profile.test.js                  # Profile tests (prefix: test_prof_)
│   └── utils/
│       ├── asyncHandler.js                  # Wrapper for async route error catching
│       ├── passwordGenerator.js             # Cryptographic temporary password generator
│       └── usernameGenerator.js             # Automatic username generator with collision handling
```

---

## 3. Coding Standards & Architectural Patterns

### A. 3-Layer Architecture Rules
1. **Route Layer (`*.routes.js` & `*.controller.js`)**:
   * Extracts HTTP params/body, attaches cookies, sets HTTP status codes (`200`, `201`, `400`, `401`, `403`, `404`).
   * **Rule**: NEVER write SQL queries or complex business logic in routes or controllers.
   * Specific static routes (`/roles`, `/me`, `/admin-only-test`) must be declared BEFORE dynamic parameter routes (`/:id`, `/:id/status`).
2. **Service Layer (`*.service.js`)**:
   * Encapsulates domain logic, validation, security checks, and audit logging.
   * **Rule**: NEVER import Express `req` or `res` objects into services. Services receive plain values/objects and return plain objects or throw descriptive `Error`s.
3. **Repository Layer (`*.repository.js`)**:
   * Pure PostgreSQL data access.
   * **Rule**: ALWAYS use parameterized queries (`$1`, `$2`, `$3`) to prevent SQL injection. Never concatenate raw strings into SQL.

### B. Authentication & Session Management
* **Stateful Sessions**: Stored in PostgreSQL `sessions` table (`user_id`, `token_hash`, `created_at`, `expires_at`, `revoked_at`).
* **Session Cookie**: `mg_sid` (`HttpOnly`, `SameSite=Lax`, `Path=/`, `Secure` in production).
* **Expiration Invariant**: `now < expires_at` (8-hour idle timeout, refreshed on each valid request) AND `now < created_at + 30 days` (absolute maximum session lifetime).
* **Revocation Invariant**: When a user's role is updated, credentials are reset, status is deactivated/blocked, or password is changed, `authService.revokeAllUserSessions(targetUserId)` is invoked immediately (`revoked_at = NOW()`).

### C. System Autonomy in User Credentials
* **Username Creation**: 100% system-automated using formula `first_name[0].toLowerCase() + last_name.toLowerCase()` (e.g. `John Doe` ➔ `jdoe`). Collision resolution is handled automatically (`jdoe1`, `jdoe2`). The frontend never supplies or touches usernames on creation.
* **Temporary Password Creation**: System generates a cryptographically random temporary password (e.g. `Mg#8xK9pL2!`), bcrypt hashes it, sets `must_change_password = TRUE`, and returns it **once** in the creation response (`data.temporaryPassword`). Plain text passwords are never stored in the database.
* **First-Login Gatekeeper**:
  * Users with `mustChangePassword === true` are blocked by `authenticate` middleware on all feature endpoints with `403 Forbidden` (`code: MUST_CHANGE_PASSWORD`).
  * Only `/api/users/change-password`, `/api/users/me`, and `/api/users/logout` are allowed.
  * On first login, submitting `POST /api/users/change-password` requires **only `newPassword`** (no redundant `currentPassword` entry).
  * Voluntary password changes by established users (`mustChangePassword === false`) require valid `currentPassword` verification.

### D. Dangerous Operations Protection (Password Confirmation Middleware)
* High-impact and destructive actions are protected by the unified `requirePasswordConfirmation` Express middleware (`src/middleware/auth.middleware.js`):
  * **Users**: `PATCH /api/users/:id/status`, `PATCH /api/users/:id/credentials`, `PATCH /api/users/:id/role`.
  * **Fleet**: `PATCH /api/fleet/trucks/:id/deactivate`.
  * **Inventory**: `PATCH /api/inventory/products/:id/deactivate`.
  * **Sales**: `PATCH /api/sales/customers/:id/deactivate`.
* **Flexible Multi-Channel Extraction**: Extracts password from `req.body.confirmPassword`, `req.body.adminPassword`, `req.body.password`, or header `x-confirm-password`.
* **Standardized Rejection Codes**:
  - Missing password: `401 Unauthorized` with `code: 'PASSWORD_CONFIRMATION_REQUIRED'`.
  - Wrong password: `401 Unauthorized` with `code: 'INVALID_CONFIRMATION_PASSWORD'`.
* **Super Admin Protection**: The primary Super Admin account cannot be deactivated, blocked, or have its role changed (`400 Bad Request`).

### E. Test Concurrency & Isolation
* Node.js test runner (`node --test src/test/*.test.js`) runs test files in parallel worker processes.
* To prevent database race conditions and duplicate key collisions:
  - `auth.test.js` uses prefix `test_auth_`
  - `customer.test.js` uses prefix `test_cust_`
  - `fleet.test.js` uses prefix `test_fleet_`
  - `history.test.js` uses prefix `test_hist_`
  - `inventory.test.js` uses prefix `test_inv_`
  - `management.test.js` uses prefix `test_mgmt_`
  - `permission.test.js` uses prefix `test_perm_`
  - `profile.test.js` uses prefix `test_prof_`
* Each test file cleans its own prefixed records in `beforeEach()`.

### F. Centralized Event History Logging & Template Resolver
* **Single Source of Truth (`src/features/history/history.events.js`)**: All system events, standard module names, action types (`Created`, `Updated`, `Deactivated`, `Assigned`), target entity classifications, and detail message string templates are registered in a centralized dictionary (`EVENT_DEFINITIONS`, `EVENTS`).
* **Clean Caller Interface**: Domain services never hardcode detail message strings or module names. They invoke:
  ```javascript
  await historyService.log(EVENTS.PRODUCT_CREATED, {
    actorUser,
    targetId: result.id,
    payload: { name: result.name, category: result.category },
    metadata: { ... },
  });
  ```
* **Template Resolver Engine (`resolveEvent`)**: Resolves module, actionType, and renders dynamic detail templates with safe fallbacks.

---

## 4. Recent Work Completed

1. **Modular Service Refactoring**:
   * Split monolithic user service into dedicated domain services: `auth.service.js`, `profile.service.js`, `management.service.js`, and `permission.service.js`.
   * Maintained facade `users.service.js` for backward compatibility.
2. **Modular Test Suite**:
   * Divided tests into dedicated files in `src/test/`.
   * Replaced test credentials with unique isolation prefixes.
3. **Automated Credentials & Contact Fields**:
   * Built `src/utils/usernameGenerator.js` (formula + collision resolution).
   * Built `src/utils/passwordGenerator.js` (secure 8-char random temporary password).
   * Added `phone VARCHAR(20)` and `must_change_password BOOLEAN DEFAULT TRUE` columns to `users` table.
4. **First-Login & Route Guarding**:
   * Streamlined first-login password change (omits redundant `currentPassword`).
   * Enforced `MUST_CHANGE_PASSWORD` route blocking in `auth.middleware.js`.
5. **Security Hardening**:
   * Added `verifyAdminPassword` to `management.service.js` enforcing admin password confirmation on account status updates and admin resets.
6. **Documentation & QA Assets**:
   * Created `docs/user-management-guide.md` (PM/QA visual workflow handbook).
   * Updated `docs/API Contract/user-management.api.md`.
7. **Fleet & Maintenance Subsystem Implementation (`src/features/fleet/`)**:
   * Implemented modular subdomain architecture:
     * `src/features/fleet/trucks/`: Vehicle CRUD, registration options, deactivation, and single-driver assignment.
     * `src/features/fleet/availability/`: Overview aggregate metrics, available vehicle filtering, and operational condition state transitions.
     * `src/features/fleet/fleet.routes.js`: Route registration guarded with `fleet.view` and `fleet.manage`.
   * Created integration test suite in `src/test/fleet.test.js` covering RBAC, overview, registration, updates, status transitions, deactivation, and driver assignment constraints.
   * Created formal API contract `docs/API Contract/fleet-and-maintenance.api.md`.
   * Enhanced `trucks` table with `created_at` and `updated_at` timestamps backed by PostgreSQL `BEFORE UPDATE` trigger function (`trigger_update_trucks_updated_at`), synced ERD and API contract.
8. **User Administration: Change User Role (`PATCH /api/users/:id/role`)**:
   * Implemented dedicated route `PATCH /api/users/:id/role` guarded with `users.manage` permission.
   * Service automatically updates user's role, fetches updated permissions array, logs audit trail (`USER_ROLE_UPDATED`), and immediately invalidates active sessions so new permissions take effect immediately.
   * Enforced safety guard preventing role modification on the primary Super Admin account.
   * Added comprehensive integration test suite in `src/test/management.test.js`.
9. **Inventory Subsystem: Item Profile / Product CRUD (`src/features/inventory/`)**:
   * Implemented 3-Layer Architecture for Item Profile management (`products.repository.js`, `products.service.js`, `products.controller.js`, `inventory.routes.js`).
   * Maintained exact schema fields from `003_products.sql` (`id`, `name`, `category`, `container_type`, `net_weight_kg`, `is_active`, timestamps).
   * Enforced RBAC route protections (`inventory.view` for listing/detail viewing, `inventory.manage` for creation, updates, and soft-deactivation).
   * Implemented comprehensive test suite in `src/test/inventory.test.js` covering all 4 user stories, validations, container type enforcement (`CYLINDER`, `CANISTER`), weight validation, and soft-deactivation filtering.
   * Created formal API contract `docs/API Contract/inventory-products.api.md`.
10. **Sales & Delivery Subsystem: Customer Profile CRUD (`src/features/sales/customer/`)**:
    * Implemented 3-Layer Architecture for Customer Profile management (`customer.repository.js`, `customer.service.js`, `customer.controller.js`, `sales.routes.js`).
    * Created migration `004_customers.sql` (`id`, `name`, `address`, `contact_number`, `customer_type_enum`, `is_active`, timestamps) with `BEFORE UPDATE` trigger and performance indexes.
    * Enforced RBAC route protections (`sales.view` / `sales.view_own` for overview/detail viewing, `sales.create` for registration, `sales.update` for profile updates and soft-deactivation).
    * Implemented comprehensive test suite in `src/test/customer.test.js` covering all 5 user stories, enum constraints (`RETAIL`, `COMMERCIAL`, `WHOLESALE`), text search, and soft-deactivation filtering.
    * Created formal API contract `docs/API Contract/sales-customer.api.md` and Mermaid ERD `docs/ERD_mermaid/sales_and_delivery_erd.md`.
11. **System Event History Log Subsystem (`src/features/history/`)**:
    * Implemented 3-Layer Architecture for System Event History Logs (`history.repository.js`, `history.service.js`, `history.controller.js`, `history.routes.js`).
    * Created migration `005_history_logs.sql` (`id`, `user_id`, `user_name`, `user_role`, `action_type`, `module`, `action`, `details`, `target_id`, `target_type`, `metadata`, `created_at`) with performance indexes.
    * Added `history.view` permission assigned to `Super Admin` and `Admin`.
    * Built Centralized Event Definitions Registry & Template Resolver (`src/features/history/history.events.js`, `EVENTS`, `resolveEvent`) removing hardcoded message strings from domain services and standardizing vocabulary across modules.
    * Refactored all domain services (`management.service.js`, `profile.service.js`, `trucks.service.js`, `availability.service.js`, `products.service.js`, `customer.service.js`) to use `historyService.log(EVENTS.KEY, ...)`.
    * Formatted DTOs matching exact frontend expectations (`id`, `date`, `time`, `userName`, `userRole`, `actionType`, `module`, `details`, `action`, `targetId`, `targetType`, `metadata`, `createdAt`).
    * Created seed file `005_history_logs_seed.sql` generating authentic historical logs referencing the seeded accounts, vehicles, products, and customers; standardized all seed filenames with numeric prefixes (`001_...` to `005_...`).
    * Implemented comprehensive test suite in `src/test/history.test.js` covering RBAC, schema matching frontend mock, module filtering, search query filtering, live cross-subsystem event creation, single log retrieval, and template resolver functionality (52 total project tests passing with 100% success).
    * Created formal API contract `docs/API Contract/history-log.api.md`.
12. **Dangerous Operations Password Confirmation Guard (`requirePasswordConfirmation`)**:
    * Created composable Express route middleware `requirePasswordConfirmation` in `src/middleware/auth.middleware.js` powered by `authService.verifyPassword`.
    * Applied guard across all high-impact destructive routes:
      - Users: `PATCH /api/users/:id/status`, `PATCH /api/users/:id/credentials`, `PATCH /api/users/:id/role`.
      - Fleet: `PATCH /api/fleet/trucks/:id/deactivate`.
      - Inventory: `PATCH /api/inventory/products/:id/deactivate`.
      - Sales: `PATCH /api/sales/customers/:id/deactivate`.
    * Supports multi-channel password extraction (`req.body.confirmPassword`, `req.body.adminPassword`, `req.body.password`, `req.headers['x-confirm-password']`).
    * Rejects with standard `401 Unauthorized` (`PASSWORD_CONFIRMATION_REQUIRED` or `INVALID_CONFIRMATION_PASSWORD`) before executing any domain service or database logic.
    * Updated all 8 test suites and confirmed 100% test pass rate across all 52 project tests.
13. **Role Management CRUD & System Roles Matrix Expansion**:
    * Created migration `006_roles_and_permissions_expansion.sql` and updated `001_user_management_seed.sql` to expand system roles to the final defined set: `Super Admin`, `Admin`, `Fleet Manager`, `Sales Manager`, `Sales Person`, and `Driver`.
    * Implemented full Role Management CRUD & Permission Catalog (`GET /api/users/roles`, `GET /api/users/roles/:id`, `GET /api/users/permissions`, `POST /api/users/roles`, `PATCH /api/users/roles/:id`, `DELETE /api/users/roles/:id`).
    * Deleting a role is protected by `requirePasswordConfirmation` and enforces system safeguards (cannot delete core system default roles or roles with assigned users).
    * Updating a role's permissions automatically invalidates active sessions for all users holding that role.
    * Added comprehensive Subtest 6 in `src/test/management.test.js` with 100% test pass rate (53 tests passing across 8 files).
    * Updated `docs/permissions.md` and `docs/API Contract/user-management.api.md`.
14. **Philippine Phone Number Parsing & Standardization (`src/utils/phoneParser.js`)**:
    * Built centralized phone number parsing utility supporting all Philippine mobile formats (`+63917...`, `0917...`, `(+63) 917...`, `0917-123-4567`) and landline formats (`+6382...`, `(082) 224-5678`, `(02) 8123-4567`).
    * Automatically validates and normalizes all incoming contact numbers to the standard canonical international format (`+63...`) in PostgreSQL and API responses.
    * Integrated into Customer Profile CRUD (`customer.service.js`) and User Account Management (`management.service.js`, `profile.service.js`).
    * Added dedicated unit test suite in `src/test/phone.test.js` and updated integration tests (60 total tests passing with 100% success across 9 test files).
15. **Multi-Role Architecture & Organizational Chart Roles Alignment**:
    * Created migration `007_multi_role_and_org_chart_roles.sql` introducing normalized `user_roles` junction table (`user_id`, `role_id`, `is_primary`, `assigned_at`, `PRIMARY KEY (user_id, role_id)`).
    * Seeded and aligned organizational chart roles: `Plant Supervisor` (seeded with empty permissions `[]`, plant inventory deferred, filling & shifts deferred), `Logistics Supervisor`, and `Sales Supervisor` while retaining `Fleet Manager` and `Sales Manager` aliases for complete backward compatibility.
    * Zero breaking changes: Models and endpoints preserve `user.role` (primary role name) and `user.roleId` (primary role ID) while attaching `user.roles: [{ id, name, isPrimary }]` and `user.roleNames: [...]`.
    * Permission unification engine (`permissionService.getPermissionsForUser`) dynamically unions permissions across all assigned roles without duplicate entries.
    * Enhanced user creation (`POST /api/users`), profile updates (`PATCH /api/users/:id`), and admin role modification (`PATCH /api/users/:id/role`) to accept both single `roleId` and multi-role `roleIds` + `primaryRoleId`.
    * Fleet driver checks (`findDriverUserById`, `getAllDrivers`) check `user_roles` so multi-role users holding the `Driver` role are recognized as eligible drivers.
    * Expanded role deletion safeguards in `management.service.js` to protect all core system default roles (`Super Admin`, `Admin`, `Plant Supervisor`, `Logistics Supervisor`, `Sales Supervisor`, `Fleet Manager`, `Sales Manager`, `Sales Person`, `Driver`).
    * Added comprehensive Subtest 7 in `src/test/management.test.js` verifying multi-role creation, credential initialization, endpoint authorization unions, 403 route blocking, and role modifications. All 62 project tests passing with 100% success across 9 test files.
16. **Fleet & Maintenance Subsystem - Part 1: Schema Migration & History Events Foundation**:
    * Created migration `008_maintenance_and_work_orders.sql` establishing the relational schema, constraints, foreign keys, cascade deletes, and performance indexes for:
      - `maintenance_types` (`id SERIAL PRIMARY KEY`, `type_name VARCHAR(50) UNIQUE NOT NULL`).
      - `incident_types` (`id SERIAL PRIMARY KEY`, `type_name VARCHAR(50) UNIQUE NOT NULL`).
      - `vehicle_odometer_logs` for single-point post-dispatch return logging driving 5,000-km PM threshold alerts (`(current_odometer - last_pm_odometer) >= 5000`).
      - `vehicle_inspections` implementing the **No Checklist** rule (strictly issue-reporting records with `findings TEXT NOT NULL` and `issue_detected BOOLEAN DEFAULT TRUE NOT NULL`).
      - `incident_reports` for mid-route breakdowns/accidents (`LOW`, `MEDIUM`, `HIGH`, `CRITICAL`).
      - `work_orders` with status transitions (`PENDING`, `APPROVED`, `SCHEDULED`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED`) and `BEFORE UPDATE` timestamp trigger.
      - `approval_requests` supporting executive cost approvals.
      - `maintenance_logs` tracking financial closure, parts/labor breakdown, and downtime.
    * Streamlined `002_fleet_and_maintenance.sql` to isolate fleet vehicle management (`truck_status`, `trucks` table, trigger, and index).
    * Registered all 6 maintenance events in `src/features/history/history.events.js` (`MAINTENANCE_ODOMETER_LOGGED`, `MAINTENANCE_INSPECTION_RECORDED`, `MAINTENANCE_INCIDENT_REPORTED`, `MAINTENANCE_WORK_ORDER_CREATED`, `MAINTENANCE_APPROVAL_DECIDED`, `MAINTENANCE_LOG_FINALIZED`) and added alias `MODULES.FLEET`.
    * Updated `002_fleet_and_maintenance_seed.sql` with standardized lookup types, delivery trucks with odometer threshold deltas, and sample operational records across all entities.
    * Synchronized `docs/ERD_mermaid/fleet_and_maintenance_erd.md` with `vehicle_odometer_logs` and operational workflow annotations.
    * Added comprehensive unit test assertions under Subtest 7 of `src/test/history.test.js`. Full test suite passing with 100% success across all 62 tests in 9 files.
17. **Fleet & Maintenance Subsystem - Part 2: Odometer Engine & Distance-Based PM Tracking**:
    * Implemented complete 3-layer slice under `src/features/fleet/maintenance/`:
      - `maintenance.repository.js`: Parameterized queries with transaction support (`insertOdometerLog`, `updateTruckOdometer`, `getTruckOdometerState`, `getOdometerHistory`, `countOdometerLogs`, `getFleetPmStatusOverview`).
      - `maintenance.service.js`: Enforces monotonic integrity check (`odometerReading >= currentOdometer`, rejects decreasing values with `400 Bad Request`), computes 5,000-km PM threshold indicators (`distanceSinceLastPm >= 5000`), wraps database operations in atomic transactions, and emits centralized history events (`MAINTENANCE_ODOMETER_LOGGED`).
      - `maintenance.controller.js`: Handles HTTP extraction, response code formatting (`201 Created`, `200 OK`, `400 Bad Request`, `404 Not Found`).
      - `maintenance.routes.js`: Exposes REST endpoints mounted under `/api/fleet/maintenance` (`POST /odometer`, `GET /pm-overview`, `GET /odometer/truck/:truckId`).
    * Mounted sub-router in `src/features/fleet/fleet.routes.js` and barrel-exported in `src/features/fleet/index.js`.
    * Updated formal API contract in `docs/API Contract/fleet-and-maintenance.api.md`.
    * Built comprehensive integration test suite `src/test/fleet.maintenance.test.js` covering RBAC route protection, monotonic integrity, distance calculations, threshold alert flags, audit trail validation, and overview retrieval (10 test suites, 68 tests passing with 100% success across the repository).

---

## 5. Seed Users & Permanent Test Accounts

The database seed provides permanent accounts for system testing (`must_change_password = FALSE`):

| Username | Password | Role(s) | Phone | Permissions Summary |
| :--- | :--- | :--- | :--- | :--- |
| **`superadmin`** | `Superadmin123!` | **Super Admin** | `+639170000001` | Full unrestricted access (`*`). Cannot be deactivated, blocked, or demoted. |
| **`admin_user`** | `AdminPass123!` | **Admin** | `+639170000002` | Administrator access (`*`): user management, role CRUD, fleet, inventory, sales, history. |
| **`logistics_supervisor`** | `LogisticsPass123!` | **Logistics Supervisor** | `+639170000003` | Fleet & logistics oversight (`dashboard.view`, `fleet.view`, `fleet.manage`, `route.view`, `route.manage`, `delivery.view`, `delivery.update`). |
| **`driver_user`** | `DriverPass123!` | **Driver** | `+639170000005` | Vehicle driver record for fleet truck assignments. **No login permissions**. |
| **`sales_supervisor`** | `SalesSupPass123!` | **Sales Supervisor** | `+639170000006` | Sales oversight & inventory (`inventory.view`, `inventory.manage`, `sales.view`, `sales.update`, `sales.delete`, `delivery.view`, `delivery.update`, `history.view`). |
| **`sales_user`** | `SalesPass123!` | **Sales Person** | `+639170000004` | Frontline sales rep (`sales.view_own`, `sales.create`, `sales.update`, `delivery.view_own`, `delivery.update_own`, `route.view_own`). |
| **`plant_user`** | `PlantPass123!` | **Plant Supervisor** | `+639170000007` | Plant Operations: Catalog role defined; permissions deferred (`[]`) until plant inventory implementation. |
| **`samantha_supervisor`** | `SamanthaPass123!` | **Sales Supervisor** *(Primary)* + **Logistics Supervisor** *(Multi-role)* | `+639170000008` | Multi-role Employee: Unions permissions across Sales Supervisor and Logistics Supervisor (`fleet.*`, `route.*`, `inventory.*`, `sales.view/update/delete`, `delivery.*`, `history.view`). |

---

## 6. Next Steps & Roadmap

1. **Maintenance Logs & Work Orders Module (`src/features/fleet/maintenance/`)**:
   - Vehicle inspections, incident reporting, work orders, repair approvals, and maintenance logs when requested.
2. **Sales & Orders Feature Implementation (`src/features/sales/orders/`)**:
   - Build 3-layer architecture for Orders and Sales Transactions with ownership scoping (`sales.view_own` vs `sales.view`).
3. **Inventory & Cylinder Tracking Module**:
   - Track LPG tank types (11kg, 22kg, 50kg), filled vs empty inventory, and refill logs.
4. **Optional In-App Password Reset Queue**:
   - If requested, implement `password_reset_requests` table and `POST /api/users/forgot-password` endpoint.
