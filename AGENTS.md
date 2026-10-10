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
│   │   ├── 008_maintenance_and_work_orders.sql # Maintenance, odometer logs, inspections, work orders schema
│   │   ├── 009_vehicles_and_receipts_refactor.sql # Vehicles generalization, receipts & work orders refactor
│   │   ├── 010_schedules_and_trips.sql     # Schedules, templates, zones, trips, loads, reconciliations schema
│   │   ├── 011_plant_inventory_and_reconciliation.sql # Plant inventory, adjustments, reconciliation fields, views
│   │   └── 012_normalize_work_order_receipts.sql # Normalized work order receipts media attachment ledger
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
│       ├── 005_history_logs_seed.sql        # Seed system event historical logs
│       ├── 006_schedules_and_trips_seed.sql # Seed service zones and weekly schedule templates
│       └── 007_plant_inventory_seed.sql     # Seed product catalog standardization, plant bulk stock & adjustments
├── docs/
│   ├── api-contracts/
│   │   ├── README.md                        # Master directory & route matrix
│   │   ├── fleet/                           # Fleet availability, trucks, drivers, maintenance
│   │   ├── history/                         # System event history logs
│   │   ├── inventory/                       # Inventory product CRUD
│   │   ├── sales/                           # Sales customer profile CRUD
│   │   ├── users/                           # Auth, profile, management, roles & permissions
│   │   └── _archive/                        # Preserved original monolithic contract files
│   ├── ERD_mermaid/
│   │   ├── README.md                        # ERD navigation index, ENUM catalog & DB conventions
│   │   ├── master_database_erd.md           # Master 27-table unified system architecture ERD
│   │   ├── fleet_and_maintenance_erd.md     # Fleet & Maintenance ERD diagram
│   │   ├── inventory_erd.md                 # Inventory products ERD diagram
│   │   ├── sales_and_delivery_erd.md        # Sales customer ERD diagram
│   │   ├── schedule_and_trip_erd.md         # Schedules & Trips ERD diagram
│   │   ├── system_history_logs_erd.md       # System event history logs ERD diagram
│   │   └── users_and_rbac_erd.md            # User Management, RBAC & sessions ERD diagram
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
│   │   ├── schedules/                       # Schedule Subsystem
│   │   │   ├── zones/                       # Service Zones CRUD
│   │   │   ├── templates/                   # Weekly Master Route Templates CRUD
│   │   │   ├── schedules.repository.js      # Daily truck schedules data access
│   │   │   ├── schedules.service.js         # Generation & validation logic
│   │   │   ├── schedules.controller.js      # Schedules HTTP controller
│   │   │   ├── schedules.routes.js          # Express route declarations
│   │   │   └── index.js                     # Barrel export
│   │   ├── trips/                           # Trip & Reconciliation Subsystem
│   │   │   ├── loads/                       # Multi-load transfer slips & items
│   │   │   ├── reconciliation/              # Post-trip stock reconciliation & variance
│   │   │   ├── trips.repository.js          # Trip lifecycles & crew snapshots data access
│   │   │   ├── trips.service.js             # Dispatch, check-in & reconciliation math
│   │   │   ├── trips.controller.js          # Trips HTTP controller
│   │   │   ├── trips.routes.js              # Express route declarations
│   │   │   └── index.js                     # Barrel export
│   │   ├── media/                           # Media & Document Storage Subsystem
│   │   │   ├── media.storage.js             # Dual-mode storage driver (Local vs Supabase Storage)
│   │   │   ├── media.service.js             # Domain validation, collision-resistant keys, upload/resolve
│   │   │   ├── media.middleware.js          # Multer memory storage (5MB limit & MIME whitelist)
│   │   │   ├── media.controller.js          # HTTP parameter parsing & JSON response formatting
│   │   │   ├── media.routes.js              # Express media routes (/upload, /resolve)
│   │   │   └── index.js                     # Media barrel export
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
│   │   ├── media.test.js                    # Media subsystem tests (prefix: test_media_)
│   │   ├── pagination.test.js               # Pagination tests (prefix: test_pagi_)
│   │   ├── permission.test.js               # RBAC & permission tests (prefix: test_perm_)
│   │   ├── phone.test.js                    # Phone normalizer unit tests
│   │   ├── profile.test.js                  # Profile tests (prefix: test_prof_)
│   │   └── schedules.trips.test.js          # Schedule & Trip Subsystem tests (prefix: test_sched_)
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
* **Session Cookie**: `mg_sid` (`HttpOnly`, `SameSite=None`, `Path=/`, `Secure=true`). Conveys session token cross-origin between frontends (localhost and Vercel) and backend (Render).
* **Dual Authentication Fallback**: Authenticate middleware accepts token from `req.cookies.mg_sid` or `Authorization: Bearer <token>` fallback.
* **Express Reverse Proxy**: `app.set('trust proxy', 1)` enables TLS protocol detection behind Render's load balancer.
* **CORS Dynamic Whitelist**: Dynamic origin validation in `src/config/cors.js` allows `localhost:*`, `127.0.0.1:*`, `https://madayawgas.vercel.app`, Vercel deploy previews, and `CORS_ORIGIN` with `credentials: true`.
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
18. **Fleet & Maintenance Subsystem - Part 3: Safety Inspections & Incident Reporting**:
    * Implemented complete 3-layer architecture for vehicle safety inspections and roadside incidents under `src/features/fleet/maintenance/`:
      - `maintenance.repository.js`: Parameterized queries with transaction client support (`insertInspection`, `getInspectionsByTruck`, `countInspectionsByTruck`, `getInspectionById`, `getIncidentTypes`, `getIncidentTypeById`, `insertIncidentReport`, `getIncidentsByTruck`, `countIncidentsByTruck`, `getAllIncidents`, `countAllIncidents`, `getIncidentById`, `updateTruckStatus`).
      - `maintenance.service.js`:
        - Safety Inspections: Enforces the **No Checklists Rule** (strictly issue-reporting records with mandatory text `findings` and `issueDetected` boolean). If `result === 'FAILED'`, atomically transitions the vehicle operational status to `'UNDER_MAINTENANCE'` while preserving the assigned driver (`driver_id`). Emits centralized history event `MAINTENANCE_INSPECTION_RECORDED`.
        - Incident & Breakdown Reporting: Retrieves reference types (`GET /incidents/types`). Supports severity classification (`LOW`, `MEDIUM`, `HIGH`, `CRITICAL`). If `severity === 'CRITICAL'`, atomically grounds the vehicle to `'UNDER_MAINTENANCE'` while preserving driver assignment. Emits centralized history event `MAINTENANCE_INCIDENT_REPORTED`.
      - `maintenance.controller.js`: Parameter validation, error handling with standard HTTP status codes (`201`, `200`, `400`, `404`), and formatted camelCase DTOs.
      - `maintenance.routes.js`: Mounted 8 new endpoints under `/api/fleet/maintenance` guarded with `fleet.manage` (recording inspections & incidents) and `fleet.view` (viewing lists, catalogs, and single records). Declared static routes before parameterized routes to eliminate routing collisions.
    * Expanded integration test suite `src/test/fleet.maintenance.test.js` with Subtests 6 and 7 covering RBAC, input validation, automated grounding on failure, automated grounding on critical incident, driver retention invariants, search & severity filtering, single detail lookups, and audit log verification. Full test suite passing with 100% success (70 tests across 10 test files).
    * Updated formal API contracts in `docs/api-contracts/fleet/maintenance.api.md`, `docs/api-contracts/README.md`, and archive.
19. **Fleet & Maintenance Subsystem - Part 4: Work Orders, Cost Approvals & Repair Lifecycles**:
    * Implemented complete operational lifecycle for vehicle repair management across the 3-layer architecture:
      - `maintenance.repository.js`: Added methods for maintenance types lookup (`getMaintenanceTypes`, `getMaintenanceTypeById`), work order management (`insertWorkOrder`, `getWorkOrderById`, `getWorkOrders`, `countWorkOrders`, `updateWorkOrderStatus`), approval requests (`insertApprovalRequest`, `updateApprovalRequest`, `getApprovalRequestByWorkOrderId`), receipt validation & completion (`checkReceiptNumberExists`, `insertMaintenanceLog`, `getMaintenanceLogByWorkOrderId`, `resetTruckPmOdometer`, `getMaintenanceLogs`, `countMaintenanceLogs`).
      - `maintenance.service.js`:
        - **Work Order Creation & Grounding**: Accepts `truckId`, `maintenanceTypeId`, optional `inspectionId`, `incidentReportId`, `shopName`, `estimatedCost`, `description`, `scheduledDate`. Work orders automatically ground the vehicle (`status -> UNDER_MAINTENANCE`) while preserving assigned drivers. If `estimatedCost >= 5000.00` or `requiresApproval: true`, work order initiates in `'PENDING'` status and creates an automatic entry in `approval_requests`. Otherwise initiates in `'APPROVED'`. Emits centralized history log `MAINTENANCE_WORK_ORDER_CREATED`.
        - **Executive Cost Approval Gate**: Endpoint `POST /api/fleet/maintenance/work-orders/:id/approve` restricted to executive administrators (`Super Admin` or `Admin`). Supervisors receive `403 Forbidden`. If approved, transitions to `'APPROVED'`; if rejected, transitions to `'CANCELLED'`. Emits `MAINTENANCE_APPROVAL_DECIDED`.
        - **Work Order State Machine**: Permitted state transitions (`APPROVED -> SCHEDULED/IN_PROGRESS`, `SCHEDULED -> IN_PROGRESS`, any -> `CANCELLED`). Direct manual transition to `COMPLETED` is strictly prohibited (`400 Bad Request`) to enforce finalization through maintenance logs.
        - **Maintenance Finalization & PM Reset**: Endpoint `POST /api/fleet/maintenance/work-orders/:id/finalize` requires unique `officialReceiptNumber` (duplicate receipt returns `409 Conflict`), `severity`, start/end dates, costs, downtime, and `odometerAtService`. Transitions work order to `'COMPLETED'`. If maintenance type is `'PREVENTIVE'`, updates `trucks.last_pm_odometer = odometerAtService`, resetting the 5,000-km PM delta. Restores vehicle operational status to `'ACTIVE'` while preserving driver assignment. Emits `MAINTENANCE_LOG_FINALIZED`.
        - **Maintenance Logs Querying**: Endpoint `GET /api/fleet/maintenance/logs` supports filtering by truck, type, date ranges, and full-text search across receipt numbers, plate numbers, and shops.
      - `maintenance.controller.js`: Request extraction, validation, error mapping, and camelCase response formatting.
      - `maintenance.routes.js`: Mounted 8 new routes under `/api/fleet/maintenance` guarded with `fleet.manage`, `fleet.view`, and executive approval decider checks.
    * Added Subtests 8, 9, and 10 to `src/test/fleet.maintenance.test.js` covering creation, financial approval threshold, executive decider authorization, state machine progressions, manual completion rejection, PM reset, operational release, driver preservation, receipt uniqueness, audit trail verification, and historical logs querying.
    * Verified 100% test pass rate across all 73 tests in 10 test files (`npm test`).
    * Updated formal API contracts in `docs/api-contracts/fleet/maintenance.api.md`, `docs/api-contracts/README.md`, and archive.
20. **Fleet & Maintenance Subsystem - Part 5: Operational Gap Refinements**:
    * Implemented supervisor dispatch decision toggle (`allowDispatch`) on vehicle safety inspections (`POST /api/fleet/maintenance/inspections`):
      - Allows logistics supervisors to evaluate minor/advisory findings (`result === 'NEEDS_ATTENTION'`) and decide whether the truck should be grounded (`allowDispatch: false` -> `status = 'UNDER_MAINTENANCE'`) or permitted to proceed with deliveries (`allowDispatch: true` -> truck remains operational, e.g. `'ACTIVE'`).
      - Preserves failure grounding invariant: if `result === 'FAILED'`, the truck is ALWAYS grounded regardless of `allowDispatch`.
      - Preserves assigned driver (`trucks.driver_id`) in all grounding cases.
      - Includes `allowDispatch` and `isGrounded` in response DTO and centralized audit log metadata.
    * Implemented Fleet Recurring Issues Analytics endpoint (`GET /api/fleet/maintenance/analytics/recurring-issues`):
      - Guarded with `authenticate` and `requirePermission('fleet.view')`.
      - Aggregates `incident_reports` grouped by `truck_id`, `plate_number`, `truck_model`, `incident_type_id`, and `incident_types.type_name`.
      - Computes `occurrenceCount`, `latestSeverity`, `latestIncidentDate`, and aggregates descriptive notes array.
      - Supports lookback window filtering (`days`, default 90), occurrence thresholding (`minOccurrences`, default 2), and vehicle asset filtering (`truckId`).
    * Added Subtest 11 to `src/test/fleet.maintenance.test.js` covering supervisor dispatch decisions on advisory inspections, failure grounding invariant enforcement, driver preservation, and recurring issues aggregation. Full test suite passing with 100% success across all 74 tests in 10 test files (`npm test`).
    * Updated formal API contracts in `docs/api-contracts/fleet/maintenance.api.md`, `docs/api-contracts/README.md`, and archive.
20. **Standardized Server-Side Pagination Across Large-Dataset Endpoints (`src/utils/pagination.js`)**:
    * Created centralized pagination utility `src/utils/pagination.js` providing `parsePaginationQuery`, `calculateOffset`, `buildPaginationMeta`, and `formatPaginatedEnvelope`.
    * Implemented opt-in, non-breaking server-side slicing across all high-volume entities:
      - **User Management**: `GET /api/users`
      - **Fleet Vehicles**: `GET /api/fleet/trucks` and alias `GET /api/fleet`
      - **Fleet Drivers**: `GET /api/fleet/drivers`
      - **Inventory Products**: `GET /api/inventory/products`
      - **Sales Customers**: `GET /api/sales/customers`
      - **History Logs**: `GET /api/history` and alias `GET /api/history-logs`
    * Enforced full-stack 3-layer architecture compliance:
      - **Controller Layer**: Parses and clamps pagination parameters (`page >= 1`, `1 <= limit <= 100`, default limit `20`), validates `sortBy` against strict internal column whitelists to prevent SQL injection, and selectively formats the standardized pagination envelope (`{ status: 'success', data, meta }`) or preserves legacy envelopes when pagination parameters are omitted.
      - **Service Layer**: Coordinates offset calculations (`offset = (page - 1) * limit`), passes sanitized criteria to repositories, formats DTOs, and constructs metadata (`totalItems`, `totalPages`, `hasNextPage`, `hasPrevPage`).
      - **Repository Layer**: Applies dynamic `whereClause` identically to data and count queries, enforces deterministic tie-breaking sorting (`ORDER BY ${sortColumn} ${sortOrder}, id DESC`), and runs data slice and count queries concurrently via `Promise.all`.
    * Created dedicated integration test suite `src/test/pagination.test.js` covering opt-in envelopes, page boundaries, out-of-bounds queries, limit clamping, sorting, SQL injection resistance, filter/search synchronization, and legacy fallbacks. Full test suite passing with 100% success across all 81 tests in 11 test files (`npm test`).
    * Updated `docs/guides/backend-developer-guide.md` with Section 10 documenting the standardized pagination pattern and developer checklist.
21. **Fleet & Maintenance Subsystem Refactor (Phase 1: Database Migration, Schema Generalization & Route Replacement)**:
    * Created and applied migration `009_vehicles_and_receipts_refactor.sql`:
      - Generalized `trucks` table into `vehicles` with `vehicle_type` enum (`DELIVERY_TRUCK`, `SERVICE_PICKUP`, `MOTORCYCLE`, `UTILITY_VAN`).
      - Added PostgreSQL stored generated column `pm_due_flag` (`BOOLEAN GENERATED ALWAYS AS (("current_odometer" - "last_pm_odometer") >= 5000) STORED`).
      - Added `allow_dispatch BOOLEAN DEFAULT TRUE` to `vehicle_inspections` empowering supervisor dispatch discretion.
      - Decoupled `official_receipt_number` from `maintenance_logs` into dedicated `work_order_receipts` table (`id`, `work_order_id`, `uploaded_by`, `file_url`, `receipt_number`, `vendor_name`, `amount`, `receipt_type`, `receipt_date`, `created_at`) supporting 0..N audit receipt attachments per job.
      - Converted `approval_requests.work_order_id` from unique to non-unique supporting sequential approval requests per work order.
    * Completely replaced old `/api/fleet/trucks` routes with `/api/fleet/vehicles` (`src/features/fleet/vehicles/` replacing `src/features/fleet/trucks/`).
    * Added dual-keyed response body aliasing (`data: { vehicle, truck: vehicle }` and `data: { vehicles, trucks: vehicles }`) to guarantee seamless client compatibility.
    * Added receipt attachment management endpoints:
      - `POST /api/fleet/maintenance/work-orders/:id/receipts`
      - `GET /api/fleet/maintenance/work-orders/:id/receipts`
      - `DELETE /api/fleet/maintenance/receipts/:id`
    * Synchronized seeds (`002_fleet_and_maintenance_seed.sql`, `005_history_logs_seed.sql`), Mermaid ERD (`docs/ERD_mermaid/fleet_and_maintenance_erd.md`), and API contracts (`docs/api-contracts/fleet/vehicles.api.md`).
    * Updated all affected test suites (`fleet.test.js`, `fleet.maintenance.test.js`, `history.test.js`, `pagination.test.js`); verified 100% test pass rate across all 81 project tests in 11 suites (`npm test`) and successful clean database rebuild (`npm run db:reset`).
22. **Fleet & Maintenance Subsystem Refactor (Phase 2: Business Logic, Multi-Approval Workflow, Receipts Integration, PM Due Generated Column & Parameter Aliases)**:
    * **1:N Multi-Approval Workflow**:
      - Implemented sequential cost approval requests (`POST /api/fleet/maintenance/work-orders/:id/approval-requests` and `GET /api/fleet/maintenance/work-orders/:id/approval-requests`).
      - Enforced pending guard preventing duplicate pending approval requests while allowing revised submissions following cost re-negotiation or initial rejection.
      - Integrated `LEFT JOIN LATERAL` in work order queries to isolate the latest approval request and prevent row duplication.
      - Registered `MAINTENANCE_APPROVAL_REQUESTED` in centralized history event dictionary.
    * **Work Order Receipts Integration & Aggregation**:
      - Updated `GET /api/fleet/maintenance/work-orders/:id` to join attached receipts array (`receipts: [...]`), `receiptsCount`, and computed `totalReceiptsAmount`.
      - Enhanced `finalizeMaintenanceLog` to accept batch `receipts: [...]` array payloads while preserving scalar `officialReceiptNumber` backward compatibility, decoupling financial math from receipt audit attachments.
    * **Supervisor Discretion on Inspections (`allow_dispatch`)**:
      - Updated `recordInspection`, `getInspectionsByTruck`, and `getInspectionById` to incorporate `allow_dispatch`.
      - Enforced supervisor discretion on advisory findings (`NEEDS_ATTENTION` with `allow_dispatch: false` grounds vehicle to `UNDER_MAINTENANCE`, while `allow_dispatch: true` keeps vehicle `ACTIVE`).
      - Preserved critical failure invariant (`FAILED` always unconditionally grounds vehicle).
    * **Stored Generated Column `pm_due_flag` & Vehicle Type Optimization**:
      - Refactored `getPmOverview` repository query to directly query stored generated column `pm_due_flag`.
      - Added support for `vehicleType` query filtering on PM overview.
      - Exposed dual keys `vehicles` and `trucks`, and dual boolean flags `pmDueFlag` and `isPmDue` across maintenance, vehicles, and availability endpoints.
    * **Route Parameter Unification & Dual Key Mapping**:
      - Mounted modern parameter aliases: `/odometer/vehicle/:vehicleId`, `/inspections/vehicle/:vehicleId`, and `/incidents/vehicle/:vehicleId`.
      - Updated controller parameter extractors to support `vehicleId || truckId` and property aliases (`odometerReading || odometer`).
    * **Comprehensive Integration Testing**:
      - Added Subtest 12 to `src/test/fleet.maintenance.test.js` validating the full Phase 2 feature set.
      - Verified 100% test pass rate across all 82 project tests in 11 test suites (`npm test`).
    * **Documentation & Contracts**:
      - Synchronized `docs/api-contracts/fleet/maintenance.api.md` and `docs/api-contracts/fleet/availability.api.md`.
23. **Fleet & Maintenance Subsystem Refactor (Phase 3: Verification, Test Alignment, Contract Modernization & Clean DB Rebuild)**:
    * **Fleet Vehicles Test Suite Alignment (`src/test/fleet.test.js`)**:
      - Added Subtest 12 to `src/test/fleet.test.js` covering all 4 operational `vehicleType` categories (`DELIVERY_TRUCK`, `SERVICE_PICKUP`, `MOTORCYCLE`, `UTILITY_VAN`).
      - Verified validation rejection on invalid `vehicleType` on creation and updates (`400 Bad Request`).
      - Verified query filtering by `vehicleType` (`GET /api/fleet/vehicles?vehicleType=MOTORCYCLE` and alias `?type=SERVICE_PICKUP`).
      - Verified database-native reactivity of the PostgreSQL stored generated column `pm_due_flag` across initial registration, post-dispatch mileage updates (automatically flipping to `true`), and last PM baseline resets (automatically flipping to `false`).
    * **Availability Subsystem Enhancement (`src/features/fleet/availability/`)**:
      - Enhanced `availabilityRepository.getAvailableTrucks` and `availabilityController.getAvailability` to support `vehicleType` and `type` filtering (`GET /api/fleet/availability?vehicleType=SERVICE_PICKUP`).
      - Exposed dual keys (`vehicles` and `trucks`, `pmDueFlag` and `isPmDue`) on availability responses.
    * **Master API Contracts Modernization**:
      - Updated `docs/api-contracts/README.md` to replace all legacy `/trucks` paths with `/vehicles`, updated links to `vehicles.api.md`, and indexed all Phase 2 endpoints (`/approval-requests`, `/receipts`, parameter aliases).
      - Updated `docs/api-contracts/fleet/drivers.api.md` modernizing driver assignment endpoints to `/api/fleet/vehicles/:id/assign` and `/unassign`.
      - Updated `docs/api-contracts/fleet/availability.api.md` documenting `vehicleType` filter.
      - Updated `docs/api-contracts/fleet/maintenance.api.md` Section 19 documenting decoupled receipts on finalization.
    * **Clean Database Rebuild & 100% Test Regression**:
      - Executed `npm run db:reset` cleanly applying migrations 001–009 and seeds 001–005 from scratch on PostgreSQL 18.
      - Verified 100% pass rate across all 83 tests in all 11 test suites (`npm test`).
      - Synchronized AST knowledge graph with `graphify update .`.
24. **Schedule & Trip Subsystem Implementation (`src/features/schedules/` & `src/features/trips/`)**:
    * **Database Migration & Seeds**:
      - Created migration `010_schedules_and_trips.sql` establishing strict 3NF tables: `service_zones`, `schedule_templates`, `truck_schedules`, `trips`, `trip_loads`, `trip_load_items`, and `trip_stock_reconciliations` with custom ENUMs (`schedule_status`, `trip_status`, `transfer_type`, `stock_condition`, `reconciliation_status`).
      - Created seed `006_schedules_and_trips_seed.sql` populating primary service zones (`Toril`, `Bankerohan`, `Calinan`, `Buhangin`, `Panacan`, `Matina`) and sample weekly master templates.
    * **Centralized Event History Registry**:
      - Registered 6 domain events in `src/features/history/history.events.js`: `SCHEDULE_CREATED`, `SCHEDULE_CANCELLED`, `TRIP_DISPATCHED`, `TRIP_STOCK_LOADED`, `TRIP_COMPLETED`, and `TRIP_RECONCILED`.
    * **Schedule Domain (`src/features/schedules/`)**:
      - Service Zones CRUD (`/api/schedules/zones`).
      - Recurring Weekly Master Templates CRUD (`/api/schedules/templates`) with `day_of_week` (1-7) and `UNIQUE(truck_id, day_of_week)`.
      - Operational Daily Truck Schedules (`/api/schedules`) with batch generator engine (`POST /api/schedules/generate`) skipping grounded trucks (`UNDER_MAINTENANCE`), honoring overrides, and enforcing `UNIQUE(truck_id, scheduled_date)`.
    * **Trip & Reconciliation Domain (`src/features/trips/`)**:
      - Scheduled and ad-hoc trip dispatch (`POST /api/trips/dispatch`) snapshotting crew (`driver_id`, `sales_user_id`) and transitioning schedule to `DISPATCHED`.
      - Multi-load transfers (`POST /api/trips/:id/loads`) for midday reloads and unloads with canonical integer unit counts.
      - Plant return check-in (`POST /api/trips/:id/complete`) directly integrated with fleet maintenance single-point return odometer engine (`maintenanceService.logOdometerReading`) enforcing monotonic readings and 5,000-km PM evaluation.
      - Post-trip stock reconciliation engine (`POST /api/trips/:id/reconcile`) evaluating Full Discrepancy and Empty Discrepancy formulas against synchronized cabin app sales and customer canister debt (`SETTLED` vs `FLAGGED_VARIANCE`).
    * **Integration Test Suite**:
      - Implemented `src/test/schedules.trips.test.js` covering RBAC, generator engine, double-booking guard, trip lifecycles, odometer check-in, reconciliation math, and audit trails.
      - 100% test pass rate across all 92 project tests in 12 test suites (`npm test`).
    * **Documentation & Contracts**:
      - Created formal contracts `docs/api-contracts/schedules/schedules.api.md` and `docs/api-contracts/trips/trips.api.md`.
      - Synchronized `docs/api-contracts/README.md`.
25. **Database ERD Documentation Synchronization & Master Architecture Alignment**:
    * **Direct PostgreSQL 18 Live Introspection**:
      - Exported and cross-verified complete PostgreSQL schema snapshot (`npm run db:export` -> `database/snapshots/schema.sql`).
    * **Schedule & Trip ERD Alignment (`docs/ERD_mermaid/schedule_and_trip_erd.md`)**:
      - Updated legacy `TRUCKS` stub to actual `VEHICLES` table (`truck_id REFERENCES vehicles(id)`).
      - Added exhaustive markdown table specifications, custom ENUMs (`schedule_status`, `trip_status`, `transfer_type`, `stock_condition`, `reconciliation_status`), partial unique index (`UQ_trips_schedule_id`), and trigger documentation.
    * **Fleet & Maintenance ERD Alignment (`docs/ERD_mermaid/fleet_and_maintenance_erd.md`)**:
      - Updated temporal data types from `datetime` to `TIMESTAMPTZ`.
      - Aligned `VEHICLES.status` with custom ENUM `truck_status`.
      - Documented multi-approval cardinality (`approval_requests` partial unique index `UQ_approval_requests_pending`), generated columns (`pm_due_flag`, `total_cost`), decoupled `work_order_receipts`, and `allow_dispatch`.
    * **New Domain ERD Documentation**:
      - Created `docs/ERD_mermaid/users_and_rbac_erd.md` covering all 7 RBAC tables, sessions, and audit logs.
      - Created `docs/ERD_mermaid/inventory_erd.md` covering `products` and `container_type_enum`.
      - Created `docs/ERD_mermaid/system_history_logs_erd.md` covering `history_logs`, actor snapshots, and JSONB `metadata`.
    * **Master Database Architecture & Navigation Index**:
       - Created unified 27-table master system ERD in `docs/ERD_mermaid/master_database_erd.md` displaying all cross-subsystem foreign keys.
       - Created `docs/ERD_mermaid/README.md` cataloging all subsystem diagrams, PostgreSQL ENUM types, and database conventions.
17. **Inventory Subsystem & Route Reconciliation Engine — Phase 1: Database Migration & Seeds**:
    * Created migration `011_plant_inventory_and_reconciliation.sql`:
      - Created `plant_inventory` table (`product_id` UK, non-negative CHECK constraints on `quantity_filled`, `quantity_empty_good`, `quantity_defective`, `last_counted_at`, `BEFORE UPDATE` trigger).
      - Created `plant_stock_adjustments` table (`product_id`, `recorded_by`, `adjustment_type`, `target_condition`, `delta_quantity`, `source_condition`, `supplier_invoice_number`, `reason`, `recorded_at`).
      - Created custom ENUM `plant_adjustment_type` (`SUPPLIER_PURCHASE`, `DEFECT_ADJUSTMENT`, `PHYSICAL_COUNT`) and guarded `inventory_transfer_type`.
      - Enhanced `trip_stock_reconciliations` with `full_discrepancy INT`, `empty_discrepancy INT`, and structured `reconciliation_data JSONB` for per-product SKU variance tracking (canisters vs cylinders).
      - Added compatibility views `trip_stock_transfers` and `trip_stock_transfer_items` aliasing `trip_loads` and `trip_load_items`.
      - Granted `dashboard.view`, `inventory.view`, `inventory.manage`, and `route.view` permissions to role `Plant Supervisor` in `role_permissions`.
    * Created seed `007_plant_inventory_seed.sql`:
      - Standardized product catalog scope with `Butane Canister 170g` and `50kg LPG Cylinder`.
      - Initialized Bunawan yard physical inventory unit counts across all active products.
      - Seeded initial `SUPPLIER_PURCHASE` audit adjustment records logged by `plant_user`.
    * Updated documentation & Mermaid ERDs:
      - Synchronized `docs/ERD_mermaid/inventory_erd.md` with table specifications, ENUMs, and compatibility views.
      - Updated `docs/ERD_mermaid/master_database_erd.md` (29 application domain tables + 2 compatibility views).
18. **Inventory Subsystem & Route Reconciliation Engine — Phase 2: Centralized Event History Registry**:
    * Registered domain events in `src/features/history/history.events.js`:
      - `INVENTORY_SUPPLIER_RESTOCKED` (`module: 'Inventory Management'`, `actionType: 'Created'`)
      - `INVENTORY_DEFECT_QUARANTINED` (`module: 'Inventory Management'`, `actionType: 'Updated'`)
      - `INVENTORY_TRIP_LOADED` (`module: 'Inventory Management'`, `actionType: 'Created'`)
      - `INVENTORY_TRIP_UNLOADED` (`module: 'Inventory Management'`, `actionType: 'Created'`)
      - `INVENTORY_RECONCILIATION_SETTLED` (`module: 'Inventory Management'`, `actionType: 'Updated'`)
      - `INVENTORY_RECONCILIATION_FLAGGED` (`module: 'Inventory Management'`, `actionType: 'Updated'`)
    * Added comprehensive unit test assertions in `src/test/history.test.js` validating template rendering, target entity typing, and action classifications.
19. **Inventory Subsystem & Route Reconciliation Engine — Phase 3: 3-Layer Feature Implementation**:
    * **Repository Layer (`src/features/inventory/inventory.repository.js`)**:
      - Master plant inventory data access (`plant_inventory`), transactional stock adjustments (`plant_stock_adjustments`).
      - Trip dispatch loading with atomic plant stock validation and deduction (`createTripTransferWithItems`).
      - Post-dispatch physical return unloads with multi-condition plant replenishment (`FILLED`, `EMPTY_GOOD`, `DEFECTIVE`).
      - Active on-board cabin stock aggregation per SKU (`getVehicleActiveStockPerProduct`).
      - Multi-SKU reconciliation upsert (`upsertTripReconciliation`) storing discrete discrepancy totals and JSONB breakdown.
    * **Service Layer (`src/features/inventory/inventory.service.js`)**:
      - `restockFromSupplier`: Supplier delivery recording with invoice auditing and event logging.
      - `quarantineDefects`: Plant yard defect quarantine from filled or empty good to defective bucket.
      - `getSuggestedEqualSplit`: Mathematical truck allocation helper with floor division and remaining units.
      - `createDispatchLoad`: Multi-load outbound manifest generation with strict non-negative plant stock protection.
      - `recordReturnUnload`: Inbound physical return manifests crediting plant condition buckets.
      - `getVehicleActiveStock`: Cabin visibility with sales ownership scoping (`route.view_own` / `inventory.view_own`).
      - `reconcileTrip`: Mathematical reconciliation engine evaluating full and empty variances per SKU against mobile sales and canister debt offsets ($fullDiscrepancy = loaded - sold - returnedFull - returnedDefective$; $emptyDiscrepancy = sold - (returnedEmptyGood + netCustomerDebtCreated)$). Transitions to `SETTLED` (discrepancy = 0), `FLAGGED_VARIANCE` (variance present), or `AWAITING_SYNC`.
    * **Controller & Route Layer (`inventory.controller.js`, `inventory.routes.js`)**:
      - Express v5 route mounts guarded by `inventory.view`, `inventory.manage`, `route.view`, `route.manage`.
      - Zod schemas validating payloads: `RestockSupplierSchema`, `QuarantineDefectsSchema`, `DispatchLoadSchema`, `ReturnUnloadSchema`, `ReconcileTripSchema`.
20. **Inventory Subsystem & Route Reconciliation Engine — Phase 4: Integration Tests & Zero Regression Verification**:
    * Implemented comprehensive test suite in `src/test/inventory.reconciliation.test.js` covering RBAC, plant restock/quarantine, split helper, dispatch loads, active stock visibility, return unloads, exact reconciliation math, and variance/awaiting sync lifecycles.
    * Isolated test namespaces (`test_recon_`, `TEST-RECON-`) avoiding concurrent test run collisions.
    * Fixed cascading foreign keys in `011_plant_inventory_and_reconciliation.sql` (`ON DELETE CASCADE` on `product_id`).
    * Granted `Plant Supervisor` permissions in `001_user_management_seed.sql`, `007_plant_inventory_seed.sql`, and `docs/permissions.md`.
    * Verified 100% test pass rate across all 13 test suites (101 out of 101 tests passing) with clean database reset (`npm run db:reset`).
    * Created dedicated API contract `docs/api-contracts/inventory/plant-inventory-and-reconciliation.api.md` and updated `docs/api-contracts/README.md`.
21. **Standardized Backend Media Subsystem (`src/features/media/`)**:
    * **Dual Runtime Storage Driver (`media.storage.js`)**:
      - Local Mode (`PRODUCTION=false` or unset): Files written to `./uploads/` (or `LOCAL_MEDIA_PATH`), served statically via Express at `/media/*`.
      - Cloud Mode (`PRODUCTION=true`): Files streamed directly to Supabase Storage bucket `madayawgas-media` via `@supabase/supabase-js` service client, preventing ephemeral disk leaks on Render.
    * **In-Memory Streaming & Safety Ceilings (`media.middleware.js`)**:
      - Configured `multer.memoryStorage()` with 5 MB ceiling (`5 * 1024 * 1024` bytes) rejecting excess payloads with `413 Payload Too Large` (`FILE_TOO_LARGE`).
      - Whitelisted MIME types: `image/jpeg`, `image/png`, `image/webp`, `application/pdf`, rejecting unapproved types with `400 Bad Request` (`UNSUPPORTED_MEDIA_TYPE`).
    * **Deterministic Relative Storage Keys & Canonical Domains (`media.service.js`)**:
      - Enforced relative storage key invariant: `{domain}/{timestamp}-{randomHex}{extension}` (e.g. `maintenance/receipts/1775731200000-4b2a8f9c1d0e.jpg`).
      - Restricted uploads to canonical domain whitelist: `maintenance/receipts`, `maintenance/inspections`, `fleet/vehicles`, `sales/receipts`, `sales/payments`, `users/avatars` with directory traversal protection.
    * **Endpoints & Routes (`media.controller.js`, `media.routes.js`)**:
      - `POST /api/media/upload`: Authenticated multipart upload endpoint returning metadata and resolved URL.
      - `POST /api/media/resolve`: Authenticated endpoint resolving canonical relative storage keys to public URLs.
    * **Comprehensive Integration Test Suite (`src/test/media.test.js`)**:
      - 9 integration tests covering RBAC authentication guards, input validation, MIME whitelist rejection, 5MB payload limit enforcement, canonical domain whitelist & path traversal rejection, local storage write and static retrieval via `/media/*`, URL resolution in local and production simulation modes, and safe asset deletion.
      - 100% pass rate across all 15 test suites (127 out of 127 tests passing) with zero regressions.
    * **API Contracts & Documentation**:
      - Created formal API contract `docs/api-contracts/media/media.api.md` and registered endpoints in `docs/api-contracts/README.md`.
22. **Work Order Receipts Normalization & Attachment Ledger Refactor (`src/features/fleet/maintenance/`)**:
    * **Database Migration & Schema Normalization (`012_normalize_work_order_receipts.sql`)**:
      - Dropped redundant and misused columns from `work_order_receipts`: `receipt_number`, `vendor_name`, `amount`, `receipt_type`, and `receipt_date`.
      - Normalized table into a lean visual media proof attachment ledger: `id (UUID PK)`, `work_order_id (UUID FK -> work_orders ON DELETE CASCADE)`, `uploaded_by (UUID FK -> users ON DELETE SET NULL)`, `file_url (TEXT NOT NULL)`, `created_at (TIMESTAMPTZ)`.
      - Cleaned placeholder and corrupted rows (`receipts/N/A`) and updated seed `002_fleet_and_maintenance_seed.sql`.
    * **Storage Invariant & Media Subsystem Interoperability**:
      - Storage keys/URLs seamlessly supported across both environments: local server paths (`uploads/maintenance/receipts/...`) when `PRODUCTION=false`, and Supabase CDN URLs (`https://<ref>.supabase.co/storage/v1/object/public/madayawgas-media/maintenance/receipts/...`) when `PRODUCTION=true`.
      - Canonical subfolder invariant: `maintenance/receipts/{filename}`.
      - Updated `media.storage.js` and `media.service.js` to strip leading `./uploads/` or `uploads/` path prefixes safely when extracting storage keys.
    * **3-Layer Architecture Refactor & Endpoint Standardization**:
      - **Repository Layer (`maintenance.repository.js`)**: Updated `insertWorkOrderReceipt` and `getReceiptsByWorkOrderId` to query strictly the normalized 5 columns. Removed `checkReceiptNumberExists` and dropped the subquery on `receipt_number` from `getMaintenanceLogs`.
      - **Service Layer (`maintenance.service.js`)**: Updated `addWorkOrderReceipt` (validates `fileUrl`, rejects placeholders, formats path), `getWorkOrderReceipts` (returns array of normalized 5-field DTOs: `id`, `workOrderId`, `fileUrl`, `uploadedBy`, `createdAt`), `finalizeMaintenanceLog` (strictly accepts batch `receiptUrls: string[]`), `getWorkOrderDetails` (normalized receipts, dropped `totalReceiptsAmount`), and `getMaintenanceLogs` (dropped `receiptNumber`).
      - **Controller Layer (`maintenance.controller.js`)**: Implemented Zod schemas `AttachReceiptSchema` (`fileUrl` required string) and `FinalizeWorkOrderSchema` (`receiptUrls` optional string array). Updated `getWorkOrderReceipts` to return `{ status: 'success', data }` where `data` is a direct array.
    * **Centralized Event History Registry (`src/features/history/history.events.js`)**:
      - Updated `MAINTENANCE_LOG_FINALIZED` template (`Finalized maintenance log for work order #${p.workOrderId}`) and `MAINTENANCE_RECEIPT_ADDED` template (`Attached receipt image to work order #${p.workOrderId}`).
    * **Testing & Zero Regression Verification**:
      - Added Subtest 13 (`Normalized work_order_receipts Attachment Ledger & Storage Invariants`) to `src/test/fleet.maintenance.test.js`.
      - Updated `src/test/history.test.js` template resolver assertions.
      - 100% test pass rate across all 15 test suites (130 out of 130 tests passing) with `npm test`.
    * **Documentation & Contracts**:
      - Synchronized `docs/ERD_mermaid/fleet_and_maintenance_erd.md`, `docs/ERD_mermaid/master_database_erd.md`, and `docs/api-contracts/fleet/maintenance.api.md` (Sections 16, 19, 20, 22, 23).



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
| **`plant_user`** | `PlantPass123!` | **Plant Supervisor** | `+639170000007` | Plant Operations: Oversees Bunawan refilling yard bulk stock (`dashboard.view`, `inventory.view`, `inventory.manage`, `route.view`). |
| **`samantha_supervisor`** | `SamanthaPass123!` | **Sales Supervisor** *(Primary)* + **Logistics Supervisor** *(Multi-role)* | `+639170000008` | Multi-role Employee: Unions permissions across Sales Supervisor and Logistics Supervisor (`fleet.*`, `route.*`, `inventory.*`, `sales.view/update/delete`, `delivery.*`, `history.view`). |

---

## 6. Next Steps & Roadmap

1. **Sales & Orders Feature Implementation (`src/features/sales/orders/`)**:
   - Build 3-layer architecture for Orders and Sales Transactions with ownership scoping (`sales.view_own` vs `sales.view`).
2. **Inventory & Cylinder Tracking Module**:
   - Track LPG tank types (11kg, 22kg, 50kg), filled vs empty inventory, and refill logs.
3. **Optional In-App Password Reset Queue**:
   - If requested, implement `password_reset_requests` table and `POST /api/users/forgot-password` endpoint.
