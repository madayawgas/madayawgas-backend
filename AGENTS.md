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
│   │   └── 002_fleet_and_maintenance.sql    # Vehicles, maintenance, dispatch schema
│   ├── scripts/
│   │   ├── setup.js                         # DB initialization script
│   │   ├── migrate.js                       # Migration runner
│   │   ├── seed.js                          # Seed runner
│   │   ├── reset.js                         # Complete database reset script
│   │   └── export-schema.js                 # Schema export script
│   └── seeds/
│       ├── user_management_seed.sql         # Roles, permissions, role_permissions, seed users
│       └── fleet_and_maintenance_seed.sql   # Seed vehicles and maintenance logs
├── docs/
│   ├── API Contract/
│   │   └── user-management.api.md           # Formal HTTP API contract and schemas
│   ├── ERD_mermaid/
│   │   └── fleet_and_maintenance_erd.md     # Fleet ERD diagram
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
│   │   │   └── index.js                     # Fleet feature placeholder (to be implemented)
│   │   └── sales/
│   │       └── index.js                     # Sales feature placeholder (to be implemented)
│   ├── middleware/
│   │   ├── auth.middleware.js               # authenticate, requirePermission, mustChangePassword guard
│   │   ├── cookie.middleware.js             # Zero-dependency HTTP cookie parser
│   │   └── error.middleware.js              # Centralized global error handler
│   ├── test/                                # Modular domain test suites (node:test)
│   │   ├── auth.test.js                     # Authentication & session tests (prefix: test_auth_)
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

### D. Dangerous Operations Protection (Admin Password Confirmation)
* Destructive operations require the acting administrator to supply their own password (`adminPassword`) in the request body:
  * `PATCH /api/users/:id/status` (deactivation, activation, blocking, unblocking).
  * `PATCH /api/users/:id/credentials` (admin resetting temporary password or changing username).
* Missing or incorrect `adminPassword` immediately rejects with `401 Unauthorized` without modifying any data.
* **Super Admin Protection**: The Super Admin account cannot be deactivated or blocked (`400 Bad Request`).

### E. Test Concurrency & Isolation
* Node.js test runner (`node --test src/test/*.test.js`) runs test files in parallel worker processes.
* To prevent database race conditions and duplicate key collisions:
  - `auth.test.js` uses prefix `test_auth_`
  - `management.test.js` uses prefix `test_mgmt_`
  - `permission.test.js` uses prefix `test_perm_`
  - `profile.test.js` uses prefix `test_prof_`
* Each test file cleans its own prefixed records in `beforeEach()`.

---

## 4. Recent Work Completed

1. **Modular Service Refactoring**:
   * Split monolithic user service into dedicated domain services: `auth.service.js`, `profile.service.js`, `management.service.js`, and `permission.service.js`.
   * Maintained facade `users.service.js` for backward compatibility.
2. **Modular Test Suite**:
   * Divided tests into 4 dedicated files in `src/test/`.
   * Replaced test credentials with unique isolation prefixes.
   * All 19 integration tests pass with 100% success.
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
   * Created integration test suite in `src/test/fleet.test.js` covering RBAC, overview, registration, updates, status transitions, deactivation, and driver assignment constraints (29 total project tests passing).
   * Created formal API contract `docs/API Contract/fleet-and-maintenance.api.md`.

---

## 5. Seed Users & Permanent Test Accounts

The database seed provides permanent accounts for all 4 roles (`must_change_password = FALSE`):

| Username | Password | Role | Phone | Permissions Summary |
| :--- | :--- | :--- | :--- | :--- |
| **`superadmin`** | `Superadmin123!` | **Super Admin** | `+639170000001` | Full unrestricted access. Cannot be deactivated or blocked. |
| **`admin_user`** | `AdminPass123!` | **Admin** | `+639170000002` | Administrator access: user management, fleet, inventory. |
| **`fleet_user`** | `FleetPass123!` | **Fleet Manager** | `+639170000003` | Fleet & routes management (`fleet.*`, `route.*`). |
| **`sales_user`** | `SalesPass123!` | **Sales Person** | `+639170000004` | Sales representative (`sales.view_own`, `sales.create`, `delivery.view_own`). |

---

## 6. Next Steps & Roadmap

1. **Maintenance Logs & Work Orders Module (`src/features/fleet/maintenance/`)**:
   - Vehicle inspections, incident reporting, work orders, repair approvals, and maintenance logs when requested.
2. **Sales & Orders Feature Implementation (`src/features/sales/`)**:
   - Build 3-layer architecture for Sales, Orders, and Customers with ownership scoping (`sales.view_own` vs `sales.view`).
3. **Inventory & Cylinder Tracking Module**:
   - Track LPG tank types (11kg, 22kg, 50kg), filled vs empty inventory, and refill logs.
4. **Optional In-App Password Reset Queue**:
   - If requested, implement `password_reset_requests` table and `POST /api/users/forgot-password` endpoint.
