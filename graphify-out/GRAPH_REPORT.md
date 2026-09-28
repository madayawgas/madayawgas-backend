# Graph Report - madayawgas-backend  (2026-09-28)

## Corpus Check
- 116 files · ~119,650 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 9 file(s) not represented in the graph (top: (none) 8, .example 1)

## Summary
- 1319 nodes · 1977 edges · 114 communities (78 shown, 36 thin omitted)
- Extraction: 95% EXTRACTED · 5% INFERRED · 0% AMBIGUOUS · INFERRED: 98 edges (avg confidence: 0.9)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `82bc2e3d`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- history/index.js
- routes/index.js
- setup.js
- 008_maintenance_and_work_orders.sql
- maintenance.service.js
- MaintenanceRepository
- schema.sql
- package.json
- query
- MaintenanceService
- management.service.js
- UsersController
- app.js
- Endpoints
- customer.test.js
- MaintenanceController
- ManagementService
- fleet.maintenance.test.js
- history.test.js
- users.controller.js
- connection.js
- pagination.js
- Endpoints
- ProductsRepository
- Endpoints
- CustomerRepository
- AuthService
- PermissionService
- auth.test.js
- pagination.test.js
- permission.test.js
- 004_customers.sql
- AvailabilityRepository
- rules/graphify.md
- workflows/graphify.md
- MadayawGas Backend: Developer Guide & Architecture Conventions
- inventory.test.js
- fleet/index.js
- management.test.js
- profile.test.js
- post-checkout
- post-commit
- Endpoints
- 3. Step-by-Step Test Scenarios
- Mid-Route Incident & Breakdown Reporting
- HistoryRepository
- 003_products.sql
- Fleet Maintenance API
- RBAC System
- check-node.js
- Products API
- Customer API
- Auth API
- Sales ERD
- Endpoints
- Endpoints
- MadayawGas API Contract: System Event History Log
- 2. Core User Flows & Step-by-Step Workflows
- VehiclesRepository
- Detailed Role & Permission Breakdown
- 3. Coding Standards & Architectural Patterns
- User Administration Endpoints (Admin)
- users.routes.js
- customer.service.js
- sales.routes.js
- 11. Record Single-Point Return Odometer Reading
- 1. User Login
- MadayawGas API Contract: Fleet & Maintenance Endpoints
- MadayawGas API Contract: User & Authentication Endpoints
- 2. General Testing Principles (For the Entire System)
- 3. Master Endpoint Routing Matrix
- 2. Update Current User Profile (`/me`)
- Setup
- Safety Inspections (Issue-Reporting Only — No Checklists)
- fleet.routes.js
- 009_vehicles_and_receipts_refactor.sql
- availability.service.js
- history.routes.js
- inventory.routes.js
- vehicles.service.js
- CustomerService
- 18. Delete System Role
- fleet.test.js
- 12. Record Vehicle Mileage
- 10. Change User Role (Admin)
- 7. Register / Create User Account
- System Permissions & RBAC Matrix
- 10. Assign Driver to Vehicle
- 12. Driver Directory (List All Drivers)
- 11. Update User Credentials / Reset Password (Admin Reset)
- 12. Deactivate / Activate or Block / Unblock User Account
- 14. Get Single Role Details
- 16. Create System Role
- 9. Update User Profile by ID
- "vehicles"
- 2. View Fleet Availability
- 3. List All Vehicles
- 5. Register Vehicle
- availability.controller.js
- 8. Set Vehicle Availability Status
- 9. Deactivate Vehicle
- AvailabilityService
- "incident_reports"
- "maintenance_logs"
- src_features_history_index_resolveevent
- "vehicle_inspections"
- "vehicle_odometer_logs"

## God Nodes (most connected - your core abstractions)
1. `query()` - 129 edges
2. `MaintenanceRepository` - 44 edges
3. `4. Recent Work Completed` - 37 edges
4. `UsersRepository` - 34 edges
5. `MaintenanceController` - 26 edges
6. `MaintenanceService` - 26 edges
7. `UsersController` - 20 edges
8. `Endpoints` - 16 edges
9. `ManagementService` - 15 edges
10. `VehiclesRepository` - 14 edges

## Surprising Connections (you probably didn't know these)
- `1. Overview & Tech Stack` --references--> `query()`  [INFERRED]
  AGENTS.md → database/connection.js
- `C. System Autonomy in User Credentials` --references--> `authenticate()`  [INFERRED]
  AGENTS.md → src/middleware/auth.middleware.js
- `F. Centralized Event History Logging & Template Resolver` --references--> `resolveEvent()`  [INFERRED]
  AGENTS.md → src/features/history/history.events.js
- `Dangerous Operations Protection (`requirePasswordConfirmation`)` --references--> `requirePasswordConfirmation()`  [INFERRED]
  docs/api-contracts/README.md → src/middleware/auth.middleware.js
- `D. Dangerous Operations Protection (Password Confirmation Middleware)` --references--> `requirePasswordConfirmation()`  [INFERRED]
  AGENTS.md → src/middleware/auth.middleware.js

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Maintenance Workflow Participants** — docs_api_contracts_fleet_maintenance_api_md, docs_erd_mermaid_fleet_and_maintenance_erd_md, maintenance_work_order_flow [EXTRACTED 1.00]

## Communities (114 total, 36 thin omitted)

### Community 0 - "history/index.js"
Cohesion: 0.06
Nodes (32): formatDriver(), formatVehicle(), VehiclesService, ACTION_TYPES, EVENT_DEFINITIONS, EVENTS, MODULES, resolveEvent() (+24 more)

### Community 1 - "routes/index.js"
Cohesion: 0.15
Nodes (12): historyRoutes, customerController, customerRepository, customerService, salesRoutes, express, fleetRoutes, { historyRoutes } (+4 more)

### Community 2 - "setup.js"
Cohesion: 0.06
Nodes (45): { Pool }, cleanDump(), { execFileSync }, exportSchema(), findPgDump(), fs, getPostgresVersion(), main() (+37 more)

### Community 3 - "008_maintenance_and_work_orders.sql"
Cohesion: 0.08
Nodes (43): "audit_logs", "permissions", "role_permissions", "roles", "sessions", "users", IX_trucks_driver_id, trigger_update_trucks_updated_at (+35 more)

### Community 4 - "maintenance.service.js"
Cohesion: 0.16
Nodes (11): c_users_giann_documents_programming_stuff_madayawgas_madayawgas_backend_database_connection_pool, c_users_giann_documents_programming_stuff_madayawgas_madayawgas_backend_src_features_history_index_events, maintenanceController, maintenanceRepository, maintenanceRoutes, maintenanceService, maintenanceService, { query, pool } (+3 more)

### Community 6 - "schema.sql"
Cohesion: 0.11
Nodes (34): IX_approval_requests_decider_id, IX_approval_requests_work_order_id, IX_incident_reports_incident_type_id, IX_incident_reports_reporter_id, IX_incident_reports_truck_id, IX_maintenance_logs_maintenance_type_id, IX_maintenance_logs_work_order_id, IX_trucks_driver_id (+26 more)

### Community 7 - "package.json"
Cohesion: 0.06
Nodes (35): author, dependencies, bcrypt, cors, dotenv, express, pg, zod (+27 more)

### Community 8 - "query"
Cohesion: 0.11
Nodes (3): query(), { query }, UsersRepository

### Community 10 - "management.service.js"
Cohesion: 0.16
Nodes (13): authService, bcrypt, { calculateOffset, buildPaginationMeta }, { generateBaseUsername, resolveUniqueUsername }, { generateTemporaryPassword }, { historyService, EVENTS }, { parsePhoneNumber }, permissionService (+5 more)

### Community 11 - "UsersController"
Cohesion: 0.05
Nodes (22): 1. The Most Important Rule: Auth & Cookies (`mg_sid`), 2. Local Development: Switching Between Mock Data & Live API, 3. Recommended API Helper Files (Using Native `fetch`), 4. How to Check If User is Logged In (On Page Refresh), 5. How to Use Permissions (RBAC) in UI Components, 6. Simple Frontend Folder Structure, 7. Quick Troubleshooting & Tips, Example 1: Hide or Show Buttons (+14 more)

### Community 12 - "app.js"
Cohesion: 0.14
Nodes (8): app, cookieParser, cors, corsOptions, errorHandler, express, routes, corsOptions

### Community 13 - "Endpoints"
Cohesion: 0.12
Nodes (17): 11. Unassign Driver from Vehicle, 13. List Available Drivers, 14. Fleet Register Page Options, 1. View Fleet Overview, 4. Get Vehicle by ID, 6. Update Vehicle Information, 7. View Vehicle Status, Endpoints (+9 more)

### Community 14 - "customer.test.js"
Cohesion: 0.29
Nodes (5): app, assert, bcrypt, { query, pool }, { test, before, after, beforeEach }

### Community 17 - "fleet.maintenance.test.js"
Cohesion: 0.20
Nodes (11): ref_node_http, app, assert, bcrypt, cleanupTestData(), http, login(), makeRequest() (+3 more)

### Community 18 - "history.test.js"
Cohesion: 0.23
Nodes (11): c_users_giann_documents_programming_stuff_madayawgas_madayawgas_backend_src_features_history_index_resolveevent, app, assert, cleanupTestData(), http, loginAsSalesUser(), loginAsSuperAdmin(), makeRequest() (+3 more)

### Community 19 - "users.controller.js"
Cohesion: 0.12
Nodes (14): authService, managementService, permissionService, profileService, usersController, usersRepository, usersRoutes, usersRepository (+6 more)

### Community 20 - "connection.js"
Cohesion: 0.43
Nodes (5): testConnection(), app, initializeDatabase(), startServer(), { testConnection }

### Community 21 - "pagination.js"
Cohesion: 0.05
Nodes (21): c_users_giann_documents_programming_stuff_madayawgas_madayawgas_backend_src_utils_pagination_formatpaginatedenvelope, c_users_giann_documents_programming_stuff_madayawgas_madayawgas_backend_src_utils_pagination_parsepaginationquery, ALLOWED_DRIVER_SORT_FIELDS, ALLOWED_VEHICLE_SORT_FIELDS, { parsePaginationQuery, formatPaginatedEnvelope }, VehiclesController, vehiclesService, ALLOWED_HISTORY_SORT_FIELDS (+13 more)

### Community 22 - "Endpoints"
Cohesion: 0.07
Nodes (29): 1. Register Item / Product, 2. View Item Profiles (List & Search), 3. View Single Item Profile, 4. Update Item Profile, 5. Deactivate Item, Company Standard Products, Endpoints, Error Responses (+21 more)

### Community 24 - "Endpoints"
Cohesion: 0.07
Nodes (29): 1. Register Customer, 2. View Customer Overview (List & Search), 3. View Single Customer Profile, 4. Update Customer Profile, 5. Deactivate Customer, Customer Data Model & Database Schema, Customer Segments (`customer_type_enum`), `customers` Table Schema (+21 more)

### Community 28 - "auth.test.js"
Cohesion: 0.12
Nodes (13): bcrypt, ref_crypto, bcrypt, crypto, permissionService, usersRepository, app, assert (+5 more)

### Community 29 - "pagination.test.js"
Cohesion: 0.25
Nodes (6): app, assert, bcrypt, cleanup(), { query, pool }, { test, before, after, beforeEach }

### Community 30 - "permission.test.js"
Cohesion: 0.25
Nodes (6): app, assert, bcrypt, permissionService, { query, pool }, { test, before, after, beforeEach }

### Community 31 - "004_customers.sql"
Cohesion: 0.48
Nodes (6): "customers", idx_customers_customer_type, idx_customers_is_active, idx_customers_name, trigger_update_customers_updated_at, update_customers_updated_at_column()

### Community 35 - "MadayawGas Backend: Developer Guide & Architecture Conventions"
Cohesion: 0.09
Nodes (21): 10. Standardized Server-Side Pagination Pattern, 1. Architectural Overview, 1. Opt-in vs Legacy Fallback (100% Backward Compatibility), 2. Directory Structure, 2. Standardized Response Envelope, 3. Layer Responsibilities, 4. Authentication & Stateful Sessions, 5. Role-Based Access Control (RBAC) (+13 more)

### Community 36 - "inventory.test.js"
Cohesion: 0.17
Nodes (10): ref_node_assert, ref_node_test, app, assert, bcrypt, { query, pool }, { test, before, after, beforeEach }, assert (+2 more)

### Community 37 - "fleet/index.js"
Cohesion: 0.15
Nodes (12): c_users_giann_documents_programming_stuff_madayawgas_madayawgas_backend_src_features_fleet_maintenance_index_maintenancecontroller, c_users_giann_documents_programming_stuff_madayawgas_madayawgas_backend_src_features_fleet_maintenance_index_maintenancerepository, c_users_giann_documents_programming_stuff_madayawgas_madayawgas_backend_src_features_fleet_maintenance_index_maintenanceroutes, c_users_giann_documents_programming_stuff_madayawgas_madayawgas_backend_src_features_fleet_maintenance_index_maintenanceservice, availabilityController, availabilityRepository, availabilityService, fleetRoutes (+4 more)

### Community 38 - "management.test.js"
Cohesion: 0.29
Nodes (5): app, assert, bcrypt, { query, pool }, { test, before, after, beforeEach }

### Community 39 - "profile.test.js"
Cohesion: 0.29
Nodes (5): app, assert, bcrypt, { query, pool }, { test, before, after, beforeEach }

### Community 42 - "Endpoints"
Cohesion: 0.09
Nodes (22): 1. List All Vehicles, 2. Get Single Vehicle Detail, 3. Register Vehicle, 4. Update Vehicle, 5. Update Vehicle Operational Status, 6. Deactivate Vehicle (Password Confirmation Required), 7. Assign Driver to Vehicle, 8. Unassign Driver from Vehicle (+14 more)

### Community 43 - "3. Step-by-Step Test Scenarios"
Cohesion: 0.10
Nodes (20): 1. Test Accounts & Credentials, 2. How Authentication Works in Postman, 3. Step-by-Step Test Scenarios, Expected Response (`200 OK`), Expected Response (`401 Unauthorized`), Postman Testing Guide: Authentication & RBAC, Scenario A: Unauthenticated Request (401 Unauthorized), Scenario B: Login as `sales_user` (Normal User) (+12 more)

### Community 44 - "Mid-Route Incident & Breakdown Reporting"
Cohesion: 0.06
Nodes (33): 10. List Fleet Incidents, 11. View Truck Incident History, 12. Get Incident Report by ID, 13. List Maintenance Types, 14. Create Maintenance Work Order, 15. List Fleet Work Orders, 16. Get Work Order Details by ID, 17. Update Work Order Status (+25 more)

### Community 46 - "003_products.sql"
Cohesion: 0.67
Nodes (3): "products", trigger_update_products_updated_at, update_products_updated_at_column()

### Community 47 - "Fleet Maintenance API"
Cohesion: 0.67
Nodes (3): Fleet Maintenance API, Fleet ERD, Maintenance Lifecycle

### Community 48 - "RBAC System"
Cohesion: 0.50
Nodes (4): History API, User Management API, Roles API, RBAC System

### Community 60 - "Endpoints"
Cohesion: 0.11
Nodes (17): 1. Assign Driver to Vehicle, 2. Unassign Driver from Vehicle, 3. Driver Directory (List All Drivers), 4. List Available Drivers, Domain Concepts: Soft-Bounded Default Drivers, Endpoints, General Information, MadayawGas API Contract: Fleet Drivers & Assignments (+9 more)

### Community 61 - "Endpoints"
Cohesion: 0.12
Nodes (15): 1. View Fleet Overview, 2. View Fleet Availability, 3. View Vehicle Status, 4. Set Vehicle Availability Status, Domain Concepts: Operational Availability & State Transitions, Endpoints, General Information, MadayawGas API Contract: Fleet Overview & Availability (+7 more)

### Community 62 - "MadayawGas API Contract: System Event History Log"
Cohesion: 0.13
Nodes (14): 1. View History Logs (List, Filter, Search & Pagination), 2. View Single History Log Detail, Endpoints, Error Responses, Error Responses, Frontend-Ready Object Format, General Information, History Log Data Model & Format (+6 more)

### Community 63 - "2. Core User Flows & Step-by-Step Workflows"
Cohesion: 0.13
Nodes (14): 1. Executive Summary: What Changed & What's New, 2. Core User Flows & Step-by-Step Workflows, 3. System Roles & Permissions Matrix, 4. Pre-Configured Test Accounts (Seed Credentials), 5. QA Quick Test Checklist, Flow 1: Employee Onboarding (Account Creation to First Login), Flow 2: Daily Employee Login & Session Expiration, Flow 3: Voluntary Password Change (From Profile) (+6 more)

### Community 65 - "Detailed Role & Permission Breakdown"
Cohesion: 0.15
Nodes (12): 1. Super Admin (`superadmin`), 2. Administrator (`admin_user`), 3. Logistics Supervisor (`logistics_supervisor`), 4. Sales Supervisor (`sales_supervisor`), 5. Sales Person (`sales_user`), 6. Driver (`driver_user`), 7. Plant Supervisor (`plant_user`), 8. Multi-Role Supervisor (`samantha_supervisor`) (+4 more)

### Community 66 - "3. Coding Standards & Architectural Patterns"
Cohesion: 0.17
Nodes (11): 1. Overview & Tech Stack, 2. Current Architecture & Key Files, 3. Coding Standards & Architectural Patterns, 5. Seed Users & Permanent Test Accounts, 6. Next Steps & Roadmap, A. 3-Layer Architecture Rules, AGENTS.md — MadayawGas Backend System Context & Engineering Handbook, B. Authentication & Session Management (+3 more)

### Community 67 - "User Administration Endpoints (Admin)"
Cohesion: 0.17
Nodes (12): 13. Get System Roles List, 15. Get System Permissions Catalog, 17. Update System Role, 6. List All Users, 8. View User Profile by ID, Request Body, Response: `200 OK` (Success), Response: `200 OK` (Success) (+4 more)

### Community 68 - "users.routes.js"
Cohesion: 0.16
Nodes (14): 11. Summary Checklist for Developers, 3. Layer Responsibilities & Strict Rules, 7. How to Add a New Feature (Step-by-Step), Layer 1: Route Layer (`*.routes.js`), Layer 2: Service Layer (`*.service.js`), Layer 3: Repository Layer (`*.repository.js`), asyncHandler, { authenticate, requirePermission, requirePasswordConfirmation } (+6 more)

### Community 69 - "customer.service.js"
Cohesion: 0.15
Nodes (14): src_features_history_index_events, ALLOWED_CUSTOMER_TYPES, { calculateOffset, buildPaginationMeta }, customerRepository, { historyService, EVENTS }, { parsePhoneNumber }, { historyService, EVENTS }, { parsePhoneNumber } (+6 more)

### Community 70 - "sales.routes.js"
Cohesion: 0.33
Nodes (5): asyncHandler, { authenticate, requirePermission, requirePasswordConfirmation }, customerController, express, router

### Community 71 - "11. Record Single-Point Return Odometer Reading"
Cohesion: 0.18
Nodes (11): 11. Record Single-Point Return Odometer Reading, 12. View Truck Odometer Log History, 13. View Fleet PM Status Overview, Maintenance & Preventive Maintenance (PM) Endpoints, Query Parameters, Query Parameters, Request Body, Response: `200 OK` (Success) (+3 more)

### Community 72 - "1. User Login"
Cohesion: 0.18
Nodes (11): 1. User Login, 2. User Logout, 3. Change Password (Self), Authentication Endpoints, Request Body, Request Body (First Login / `mustChangePassword: true`), Request Body (Voluntary Profile Change / `mustChangePassword: false`), Response: `200 OK` (Success) (+3 more)

### Community 73 - "MadayawGas API Contract: Fleet & Maintenance Endpoints"
Cohesion: 0.20
Nodes (9): 21. Get Recurring Issues Fleet Analytics, Domain Concepts: Soft-Bounded Default Drivers & Fleet Availability, General Information, MadayawGas API Contract: Fleet & Maintenance Endpoints, Maintenance Fleet Analytics, Permissions Summary, Query Parameters, Response: `200 OK` (Success) (+1 more)

### Community 74 - "MadayawGas API Contract: User & Authentication Endpoints"
Cohesion: 0.20
Nodes (9): 4. Get Current User Profile (`/me`), 5. Update Current User Profile (`/me`), General Information, MadayawGas API Contract: User & Authentication Endpoints, Request Body, Response: `200 OK` (Success), Response: `200 OK` (Success), Session & Security Specifications (+1 more)

### Community 75 - "2. General Testing Principles (For the Entire System)"
Cohesion: 0.20
Nodes (9): 1. Happy Path Testing (Valid Inputs), 1. What is the QA's Role?, 2. Form & Input Validation (Unhappy Path), 2. General Testing Principles (For the Entire System), 3. How to Write a High-Quality Bug Report, 3. Role-Based Access Control (RBAC) Checks, 4. State Transitions & Business Logic, 5. Security & Error Safety (+1 more)

### Community 76 - "3. Master Endpoint Routing Matrix"
Cohesion: 0.12
Nodes (15): 1. Global API Standards & Architecture, 2. Directory Structure, 3. Master Endpoint Routing Matrix, Base URL Paths, Dangerous Operations Protection (`requirePasswordConfirmation`), Error Envelope (`400`, `401`, `403`, `404`, `409`, `500`), MadayawGas API Contracts & Documentation Directory, Standard Paginated Envelope (`200 OK`) (+7 more)

### Community 77 - "2. Update Current User Profile (`/me`)"
Cohesion: 0.22
Nodes (8): 1. Get Current User Profile (`/me`), 2. Update Current User Profile (`/me`), Endpoints, General Information, MadayawGas API Contract: User Profile, Request Body, Response: `200 OK` (Success), Response: `200 OK` (Success)

### Community 78 - "Setup"
Cohesion: 0.22
Nodes (8): 1. Clone the repository, 2. Check your current Node.js version, 3. Install Node.js 22.19.0, 4. Switch to Node.js 22.19.0, 5. Install project dependencies, 6. Start the development server, Prerequisites, Setup

### Community 79 - "Safety Inspections (Issue-Reporting Only — No Checklists)"
Cohesion: 0.25
Nodes (8): 5. Record Safety Inspection, 6. View Truck Inspections History, 7. Get Inspection Record by ID, Request Body, Response: `200 OK` (Success), Response: `200 OK` (Success), Response: `201 Created` (Success), Safety Inspections (Issue-Reporting Only — No Checklists)

### Community 80 - "fleet.routes.js"
Cohesion: 0.13
Nodes (15): c_users_giann_documents_programming_stuff_madayawgas_madayawgas_backend_src_middleware_auth_middleware_authenticate, c_users_giann_documents_programming_stuff_madayawgas_madayawgas_backend_src_middleware_auth_middleware_requirepasswordconfirmation, c_users_giann_documents_programming_stuff_madayawgas_madayawgas_backend_src_middleware_auth_middleware_requirepermission, asyncHandler, { authenticate, requirePermission, requirePasswordConfirmation }, availabilityController, express, maintenanceRoutes (+7 more)

### Community 81 - "009_vehicles_and_receipts_refactor.sql"
Cohesion: 0.27
Nodes (9): "approval_requests", IX_work_order_receipts_receipt_type, IX_work_order_receipts_work_order_id, trigger_update_vehicles_updated_at, update_vehicles_updated_at_column(), UQ_approval_requests_pending, "work_order_receipts", "users" (+1 more)

### Community 82 - "availability.service.js"
Cohesion: 0.22
Nodes (7): c_users_giann_documents_programming_stuff_madayawgas_madayawgas_backend_database_connection_query, c_users_giann_documents_programming_stuff_madayawgas_madayawgas_backend_src_features_history_index_historyservice, { query }, availabilityRepository, { historyService, EVENTS }, vehiclesRepository, { query }

### Community 83 - "history.routes.js"
Cohesion: 0.33
Nodes (5): express, { authenticate, requirePermission }, express, historyController, router

### Community 84 - "inventory.routes.js"
Cohesion: 0.20
Nodes (9): D. Dangerous Operations Protection (Password Confirmation Middleware), asyncHandler, { authenticate, requirePermission, requirePasswordConfirmation }, express, productsController, router, authService, permissionService (+1 more)

### Community 85 - "vehicles.service.js"
Cohesion: 0.25
Nodes (7): c_users_giann_documents_programming_stuff_madayawgas_madayawgas_backend_src_utils_pagination_buildpaginationmeta, c_users_giann_documents_programming_stuff_madayawgas_madayawgas_backend_src_utils_pagination_calculateoffset, { calculateOffset, buildPaginationMeta }, { historyService, EVENTS }, VALID_STATUSES, VALID_VEHICLE_TYPES, vehiclesRepository

### Community 87 - "18. Delete System Role"
Cohesion: 0.40
Nodes (5): 18. Delete System Role, Error Responses, Request Body, Response: `200 OK` (Success), URL Parameters

### Community 88 - "fleet.test.js"
Cohesion: 0.29
Nodes (5): app, assert, bcrypt, { query, pool }, { test, before, after, beforeEach }

### Community 89 - "12. Record Vehicle Mileage"
Cohesion: 0.40
Nodes (5): 12. Record Vehicle Mileage, Path Parameters, Request Body, Response: `200 OK` (Success), Response: `400 Bad Request` (Lower Odometer / Rollback Attempt)

### Community 90 - "10. Change User Role (Admin)"
Cohesion: 0.50
Nodes (4): 10. Change User Role (Admin), Request Body (Multi-Role), Request Body (Single Role), Response: `200 OK` (Success)

### Community 91 - "7. Register / Create User Account"
Cohesion: 0.50
Nodes (4): 7. Register / Create User Account, Request Body (Multi-Role), Request Body (Single Role), Response: `201 Created` (Success)

### Community 92 - "System Permissions & RBAC Matrix"
Cohesion: 0.50
Nodes (3): 1. Role Permissions Matrix, 2. Complete Permissions Reference, System Permissions & RBAC Matrix

### Community 93 - "10. Assign Driver to Vehicle"
Cohesion: 0.50
Nodes (4): 10. Assign Driver to Vehicle, Request Body, Response: `200 OK` (Success), Response: `409 Conflict` (Driver Already Assigned)

### Community 94 - "12. Driver Directory (List All Drivers)"
Cohesion: 0.67
Nodes (3): 12. Driver Directory (List All Drivers), Query Parameters, Response: `200 OK` (Success)

### Community 95 - "11. Update User Credentials / Reset Password (Admin Reset)"
Cohesion: 0.67
Nodes (3): 11. Update User Credentials / Reset Password (Admin Reset), Request Body, Response: `200 OK` (Success)

### Community 96 - "12. Deactivate / Activate or Block / Unblock User Account"
Cohesion: 0.67
Nodes (3): 12. Deactivate / Activate or Block / Unblock User Account, Request Body, Response: `200 OK` (Success)

### Community 97 - "14. Get Single Role Details"
Cohesion: 0.67
Nodes (3): 14. Get Single Role Details, Response: `200 OK` (Success), URL Parameters

### Community 98 - "16. Create System Role"
Cohesion: 0.67
Nodes (3): 16. Create System Role, Request Body, Response: `201 Created` (Success)

### Community 99 - "9. Update User Profile by ID"
Cohesion: 0.67
Nodes (3): 9. Update User Profile by ID, Request Body, Response: `200 OK` (Success)

### Community 101 - "2. View Fleet Availability"
Cohesion: 0.67
Nodes (3): 2. View Fleet Availability, Query Parameters, Response: `200 OK` (Success)

### Community 102 - "3. List All Vehicles"
Cohesion: 0.67
Nodes (3): 3. List All Vehicles, Query Parameters, Response: `200 OK` (Success)

### Community 103 - "5. Register Vehicle"
Cohesion: 0.67
Nodes (3): 5. Register Vehicle, Request Body, Response: `201 Created` (Success)

### Community 105 - "8. Set Vehicle Availability Status"
Cohesion: 0.67
Nodes (3): 8. Set Vehicle Availability Status, Request Body, Response: `200 OK` (Success)

### Community 106 - "9. Deactivate Vehicle"
Cohesion: 0.67
Nodes (3): 9. Deactivate Vehicle, Request Body, Response: `200 OK` (Success)

## Knowledge Gaps
- **557 isolated node(s):** `2. Current Architecture & Key Files`, `A. 3-Layer Architecture Rules`, `B. Authentication & Session Management`, `E. Test Concurrency & Isolation`, `5. Seed Users & Permanent Test Accounts` (+552 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 655 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **36 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `query()` connect `query` to `history/index.js`, `MaintenanceRepository`, `customer.test.js`, `fleet.maintenance.test.js`, `history.test.js`, `connection.js`, `ProductsRepository`, `CustomerRepository`, `auth.test.js`, `pagination.test.js`, `permission.test.js`, `AvailabilityRepository`, `inventory.test.js`, `management.test.js`, `profile.test.js`, `HistoryRepository`, `VehiclesRepository`, `3. Coding Standards & Architectural Patterns`, `fleet.test.js`?**
  _High betweenness centrality (0.099) - this node is a cross-community bridge._
- **Why does `4. Recent Work Completed` connect `MaintenanceRepository` to `VehiclesRepository`, `history/index.js`, `3. Coding Standards & Architectural Patterns`, `users.routes.js`, `MaintenanceController`, `ManagementService`, `inventory.routes.js`, `pagination.js`?**
  _High betweenness centrality (0.043) - this node is a cross-community bridge._
- **Why does `bcrypt` connect `auth.test.js` to `inventory.test.js`, `management.test.js`, `package.json`, `profile.test.js`, `management.service.js`, `customer.test.js`, `fleet.maintenance.test.js`, `fleet.test.js`, `pagination.test.js`, `permission.test.js`?**
  _High betweenness centrality (0.028) - this node is a cross-community bridge._
- **Are the 24 inferred relationships involving `query()` (e.g. with `1. Overview & Tech Stack` and `connection.js`) actually correct?**
  _`query()` has 24 INFERRED edges - model-reasoned connections that need verification._
- **Are the 36 inferred relationships involving `4. Recent Work Completed` (e.g. with `.getPmOverview()` and `.checkReceiptNumberExists()`) actually correct?**
  _`4. Recent Work Completed` has 36 INFERRED edges - model-reasoned connections that need verification._
- **What connects `2. Current Architecture & Key Files`, `A. 3-Layer Architecture Rules`, `B. Authentication & Session Management` to the rest of the system?**
  _557 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `history/index.js` be split into smaller, more focused modules?**
  _Cohesion score 0.05683060109289618 - nodes in this community are weakly interconnected._