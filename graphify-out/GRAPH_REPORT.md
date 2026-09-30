# Graph Report - madayawgas-backend  (2026-09-29)

## Corpus Check
- 144 files · ~149,469 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 9 file(s) not represented in the graph (top: (none) 8, .example 1)

## Summary
- 1694 nodes · 2645 edges · 143 communities (90 shown, 53 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 102 edges (avg confidence: 0.9)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `86643363`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- history/index.js
- routes/index.js
- migrate.js
- 008_maintenance_and_work_orders.sql
- products.service.js
- MaintenanceRepository
- public.work_orders
- package.json
- query
- MaintenanceService
- management.service.js
- Frontend API & Development Setup
- app.js
- Endpoints
- schedules.trips.test.js
- MaintenanceController
- ManagementService
- fleet.maintenance.test.js
- history.test.js
- UsersController
- connection.js
- parsePaginationQuery
- Endpoints
- products.repository.js
- Endpoints
- CustomerRepository
- AuthService
- export-schema.js
- auth.test.js
- pagination.test.js
- permission.test.js
- 004_customers.sql
- availability.repository.js
- rules/graphify.md
- workflows/graphify.md
- MadayawGas Backend: Developer Guide & Architecture Conventions
- setup.js
- c_users_giann_documents_programming_stuff_madayawgas_madayawgas_backend_src_features_fleet_maintenance_index_maintenancecontroller
- 003_products.sql
- profile.test.js
- post-checkout
- post-commit
- Endpoints
- 3. Step-by-Step Test Scenarios
- Mid-Route Incident & Breakdown Reporting
- HistoryRepository
- 010_schedules_and_trips.sql
- master_database_erd.md
- RBAC System
- check-node.js
- Products API
- Customer API
- Auth API
- schema.sql
- Endpoints
- Endpoints
- MadayawGas API Contract: System Event History Log
- 2. Core User Flows & Step-by-Step Workflows
- VehiclesRepository
- Detailed Role & Permission Breakdown
- 3. Coding Standards & Architectural Patterns
- User Administration Endpoints (Admin)
- users.routes.js
- profile.service.js
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
- 3. Operational Daily Truck Schedules
- schedules.service.js
- history.routes.js
- inventory.routes.js
- vehicles.service.js
- customer.service.js
- 18. Delete System Role
- "vehicles"
- schedules/index.js
- 10. Change User Role (Admin)
- 7. Register / Create User Account
- System Permissions & RBAC Matrix
- MadayawGas API Contract: Trip Subsystem
- trips.service.js
- 11. Update User Credentials / Reset Password (Admin Reset)
- 12. Deactivate / Activate or Block / Unblock User Account
- 14. Get Single Role Details
- 16. Create System Role
- 9. Update User Profile by ID
- trips/index.js
- VehiclesService
- schedules.controller.js
- TripsService
- AvailabilityService
- public.users
- schedules.routes.js
- public.trips
- formatProduct
- SchedulesRepository
- TemplatesRepository
- TemplatesService
- ZonesRepository
- AGENTS.md — MadayawGas Backend System Context & Engineering Handbook
- maintenance.routes.js
- HistoryService
- SchedulesService
- TemplatesController
- TripsRepository
- public.vehicles
- ZonesController
- ZonesService
- 17. Update Work Order Status
- 19. Finalize Maintenance Log & Release Vehicle
- LoadsRepository
- 14. Create Maintenance Work Order
- 18. Executive Cost Approval Decision
- ReconciliationRepository
- c_users_giann_documents_programming_stuff_madayawgas_madayawgas_backend_src_features_fleet_maintenance_index_maintenancerepository
- c_users_giann_documents_programming_stuff_madayawgas_madayawgas_backend_src_features_fleet_maintenance_index_maintenanceroutes
- c_users_giann_documents_programming_stuff_madayawgas_madayawgas_backend_src_features_history_index_resolveevent
- c_users_giann_documents_programming_stuff_madayawgas_madayawgas_backend_src_middleware_auth_middleware_requirepasswordconfirmation
- c_users_giann_documents_programming_stuff_madayawgas_madayawgas_backend_src_utils_pagination_calculateoffset
- "vehicles"
- public.schedule_templates
- public.truck_schedules
- public.update_timestamp_column
- public.approval_requests
- trigger_update_customers_updated_at
- trigger_update_products_updated_at
- trigger_update_vehicles_updated_at
- trigger_update_work_orders_updated_at

## God Nodes (most connected - your core abstractions)
1. `query()` - 163 edges
2. `MaintenanceRepository` - 44 edges
3. `4. Recent Work Completed` - 37 edges
4. `UsersRepository` - 34 edges
5. `MaintenanceController` - 26 edges
6. `MaintenanceService` - 26 edges
7. `UsersController` - 20 edges
8. `public.users` - 18 edges
9. `{ Pool }` - 17 edges
10. `parsePaginationQuery()` - 16 edges

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

## Communities (143 total, 53 thin omitted)

### Community 0 - "history/index.js"
Cohesion: 0.11
Nodes (18): ALLOWED_HISTORY_SORT_FIELDS, HistoryController, historyService, { parsePaginationQuery, formatPaginatedEnvelope }, ACTION_TYPES, EVENT_DEFINITIONS, EVENTS, MODULES (+10 more)

### Community 1 - "routes/index.js"
Cohesion: 0.17
Nodes (11): c_users_giann_documents_programming_stuff_madayawgas_madayawgas_backend_src_features_history_index_historyroutes, c_users_giann_documents_programming_stuff_madayawgas_madayawgas_backend_src_features_sales_index_salesroutes, express, fleetRoutes, { historyRoutes }, inventoryRoutes, router, { salesRoutes } (+3 more)

### Community 2 - "migrate.js"
Cohesion: 0.11
Nodes (24): applyMigration(), ensureMigrationTable(), fs, getAppliedMigrations(), getMigrationFiles(), main(), migrate(), MIGRATIONS_DIR (+16 more)

### Community 3 - "008_maintenance_and_work_orders.sql"
Cohesion: 0.07
Nodes (49): "audit_logs", "permissions", "role_permissions", "roles", "sessions", "users", IX_trucks_driver_id, trigger_update_trucks_updated_at (+41 more)

### Community 4 - "products.service.js"
Cohesion: 0.15
Nodes (12): availabilityRepository, { historyService, EVENTS }, vehiclesRepository, { historyService, EVENTS }, maintenanceRepository, { pool }, src_features_history_index_events, historyService (+4 more)

### Community 6 - "public.work_orders"
Cohesion: 0.20
Nodes (11): IX_maintenance_logs_work_order_id, IX_vehicle_inspections_inspection_date, IX_vehicle_inspections_result, IX_vehicle_inspections_vehicle_id, IX_work_orders_maintenance_type_id, IX_work_orders_status, IX_work_orders_vehicle_id, public.maintenance_logs (+3 more)

### Community 7 - "package.json"
Cohesion: 0.06
Nodes (35): author, dependencies, bcrypt, cors, dotenv, express, pg, zod (+27 more)

### Community 10 - "management.service.js"
Cohesion: 0.16
Nodes (13): authService, bcrypt, { calculateOffset, buildPaginationMeta }, { generateBaseUsername, resolveUniqueUsername }, { generateTemporaryPassword }, { historyService, EVENTS }, { parsePhoneNumber }, permissionService (+5 more)

### Community 11 - "Frontend API & Development Setup"
Cohesion: 0.09
Nodes (20): 1. The Most Important Rule: Auth & Cookies (`mg_sid`), 2. Local Development: Switching Between Mock Data & Live API, 3. Recommended API Helper Files (Using Native `fetch`), 4. How to Check If User is Logged In (On Page Refresh), 5. How to Use Permissions (RBAC) in UI Components, 6. Simple Frontend Folder Structure, 7. Quick Troubleshooting & Tips, Example 1: Hide or Show Buttons (+12 more)

### Community 12 - "app.js"
Cohesion: 0.10
Nodes (13): app, cookieParser, cors, corsOptions, errorHandler, express, routes, corsOptions (+5 more)

### Community 13 - "Endpoints"
Cohesion: 0.05
Nodes (44): 10. Assign Driver to Vehicle, 11. Unassign Driver from Vehicle, 12. Driver Directory (List All Drivers), 12. Record Vehicle Mileage, 13. List Available Drivers, 14. Fleet Register Page Options, 1. View Fleet Overview, 2. View Fleet Availability (+36 more)

### Community 14 - "schedules.trips.test.js"
Cohesion: 0.09
Nodes (17): ref_node_assert, ref_node_test, app, assert, bcrypt, { query, pool }, { test, before, after, beforeEach }, app (+9 more)

### Community 15 - "MaintenanceController"
Cohesion: 0.04
Nodes (16): AvailabilityController, availabilityService, availabilityController, availabilityRepository, availabilityService, fleetRoutes, {
  maintenanceRepository,
  maintenanceService,
  maintenanceController,
  maintenanceRoutes,
}, vehiclesController (+8 more)

### Community 17 - "fleet.maintenance.test.js"
Cohesion: 0.20
Nodes (11): ref_node_http, app, assert, bcrypt, cleanupTestData(), http, login(), makeRequest() (+3 more)

### Community 18 - "history.test.js"
Cohesion: 0.23
Nodes (11): src_features_history_index_resolveevent, app, assert, cleanupTestData(), http, loginAsSalesUser(), loginAsSuperAdmin(), makeRequest() (+3 more)

### Community 19 - "UsersController"
Cohesion: 0.05
Nodes (18): authService, managementService, permissionService, profileService, usersController, usersRepository, usersRoutes, PermissionService (+10 more)

### Community 20 - "connection.js"
Cohesion: 0.15
Nodes (12): { Pool }, testConnection(), { query, pool }, app, initializeDatabase(), startServer(), { testConnection }, app (+4 more)

### Community 21 - "parsePaginationQuery"
Cohesion: 0.05
Nodes (19): ALLOWED_DRIVER_SORT_FIELDS, ALLOWED_VEHICLE_SORT_FIELDS, { parsePaginationQuery, formatPaginatedEnvelope }, VehiclesController, vehiclesService, inventoryRoutes, productsController, productsRepository (+11 more)

### Community 22 - "Endpoints"
Cohesion: 0.07
Nodes (29): 1. Register Item / Product, 2. View Item Profiles (List & Search), 3. View Single Item Profile, 4. Update Item Profile, 5. Deactivate Item, Company Standard Products, Endpoints, Error Responses (+21 more)

### Community 24 - "Endpoints"
Cohesion: 0.07
Nodes (29): 1. Register Customer, 2. View Customer Overview (List & Search), 3. View Single Customer Profile, 4. Update Customer Profile, 5. Deactivate Customer, Customer Data Model & Database Schema, Customer Segments (`customer_type_enum`), `customers` Table Schema (+21 more)

### Community 27 - "export-schema.js"
Cohesion: 0.25
Nodes (10): cleanDump(), { execFileSync }, exportSchema(), findPgDump(), fs, getPostgresVersion(), main(), path (+2 more)

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

### Community 36 - "setup.js"
Cohesion: 0.24
Nodes (10): checkPostgresVersion(), { Client }, createDatabaseIfNotExists(), { execFileSync }, findPgDump(), fs, { migrate }, path (+2 more)

### Community 38 - "003_products.sql"
Cohesion: 0.67
Nodes (3): "products", trigger_update_products_updated_at, update_products_updated_at_column()

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
Cohesion: 0.11
Nodes (19): 10. List Fleet Incidents, 11. View Truck Incident History, 12. Get Incident Report by ID, 13. List Maintenance Types, 15. List Fleet Work Orders, 16. Get Work Order Details by ID, 20. Query Historical Maintenance Logs, 8. Get Incident Types Catalog (+11 more)

### Community 46 - "010_schedules_and_trips.sql"
Cohesion: 0.09
Nodes (43): IX_schedule_templates_day_of_week, IX_schedule_templates_is_active, IX_schedule_templates_truck_id, IX_schedule_templates_zone_id, IX_service_zones_code, IX_service_zones_is_active, IX_trip_load_items_condition, IX_trip_load_items_load_id (+35 more)

### Community 47 - "master_database_erd.md"
Cohesion: 0.05
Nodes (42): Fleet Maintenance API, Fleet ERD, 1. Mermaid Entity-Relationship Diagram, 2. Table Specifications, 3. Triggers & Automation, Inventory Subsystem — Entity Relationship Diagram (ERD), `products`, 1. Unified Mermaid Entity-Relationship Diagram (+34 more)

### Community 48 - "RBAC System"
Cohesion: 0.50
Nodes (4): History API, User Management API, Roles API, RBAC System

### Community 59 - "schema.sql"
Cohesion: 0.12
Nodes (19): idx_customers_customer_type, idx_customers_is_active, idx_customers_name, idx_history_logs_action_type, idx_history_logs_created_at, idx_history_logs_module, idx_history_logs_user_id, IX_trip_load_items_condition (+11 more)

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
Cohesion: 0.33
Nodes (6): 3. Coding Standards & Architectural Patterns, A. 3-Layer Architecture Rules, B. Authentication & Session Management, C. System Autonomy in User Credentials, E. Test Concurrency & Isolation, F. Centralized Event History Logging & Template Resolver

### Community 67 - "User Administration Endpoints (Admin)"
Cohesion: 0.17
Nodes (12): 13. Get System Roles List, 15. Get System Permissions Catalog, 17. Update System Role, 6. List All Users, 8. View User Profile by ID, Request Body, Response: `200 OK` (Success), Response: `200 OK` (Success) (+4 more)

### Community 68 - "users.routes.js"
Cohesion: 0.33
Nodes (5): asyncHandler, { authenticate, requirePermission, requirePasswordConfirmation }, express, router, usersController

### Community 69 - "profile.service.js"
Cohesion: 0.19
Nodes (11): { historyService, EVENTS }, { parsePhoneNumber }, permissionService, ProfileService, usersRepository, assert, { parsePhoneNumber, isValidPhoneNumber, getPhoneType }, { test } (+3 more)

### Community 70 - "sales.routes.js"
Cohesion: 0.18
Nodes (9): customerController, customerRepository, customerService, salesRoutes, asyncHandler, { authenticate, requirePermission, requirePasswordConfirmation }, customerController, express (+1 more)

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
Cohesion: 0.11
Nodes (17): 1. Global API Standards & Architecture, 2. Directory Structure, 3. Master Endpoint Routing Matrix, Base URL Paths, Dangerous Operations Protection (`requirePasswordConfirmation`), Error Envelope (`400`, `401`, `403`, `404`, `409`, `500`), MadayawGas API Contracts & Documentation Directory, Standard Paginated Envelope (`200 OK`) (+9 more)

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
Cohesion: 0.17
Nodes (11): D. Dangerous Operations Protection (Password Confirmation Middleware), asyncHandler, { authenticate, requirePermission, requirePasswordConfirmation }, availabilityController, express, maintenanceRoutes, router, vehiclesController (+3 more)

### Community 81 - "3. Operational Daily Truck Schedules"
Cohesion: 0.08
Nodes (23): 1. Service Zones, 1. `service_zones` Table, 2. `schedule_templates` Table, 2. Weekly Master Route Templates, 3. Operational Daily Truck Schedules, 3. `truck_schedules` Table, Data Models & Database Schemas, `DELETE /api/schedules/templates/:id` (+15 more)

### Community 82 - "schedules.service.js"
Cohesion: 0.10
Nodes (18): c_users_giann_documents_programming_stuff_madayawgas_madayawgas_backend_database_connection_query, c_users_giann_documents_programming_stuff_madayawgas_madayawgas_backend_src_features_history_index_events, c_users_giann_documents_programming_stuff_madayawgas_madayawgas_backend_src_features_history_index_historyservice, { query }, { query }, { historyService, EVENTS }, schedulesRepository, templatesRepository (+10 more)

### Community 83 - "history.routes.js"
Cohesion: 0.33
Nodes (5): express, { authenticate, requirePermission }, express, historyController, router

### Community 84 - "inventory.routes.js"
Cohesion: 0.33
Nodes (5): asyncHandler, { authenticate, requirePermission, requirePasswordConfirmation }, express, productsController, router

### Community 85 - "vehicles.service.js"
Cohesion: 0.24
Nodes (8): { calculateOffset, buildPaginationMeta }, formatVehicle(), { historyService, EVENTS }, VALID_STATUSES, VALID_VEHICLE_TYPES, vehiclesRepository, buildPaginationMeta(), calculateOffset()

### Community 86 - "customer.service.js"
Cohesion: 0.24
Nodes (7): ALLOWED_CUSTOMER_TYPES, { calculateOffset, buildPaginationMeta }, customerRepository, CustomerService, formatCustomer(), { historyService, EVENTS }, { parsePhoneNumber }

### Community 87 - "18. Delete System Role"
Cohesion: 0.40
Nodes (5): 18. Delete System Role, Error Responses, Request Body, Response: `200 OK` (Success), URL Parameters

### Community 89 - "schedules/index.js"
Cohesion: 0.14
Nodes (12): schedulesController, schedulesRepository, schedulesRoutes, schedulesService, templatesController, templatesRepository, templatesService, zonesController (+4 more)

### Community 90 - "10. Change User Role (Admin)"
Cohesion: 0.50
Nodes (4): 10. Change User Role (Admin), Request Body (Multi-Role), Request Body (Single Role), Response: `200 OK` (Success)

### Community 91 - "7. Register / Create User Account"
Cohesion: 0.50
Nodes (4): 7. Register / Create User Account, Request Body (Multi-Role), Request Body (Single Role), Response: `201 Created` (Success)

### Community 92 - "System Permissions & RBAC Matrix"
Cohesion: 0.50
Nodes (3): 1. Role Permissions Matrix, 2. Complete Permissions Reference, System Permissions & RBAC Matrix

### Community 93 - "MadayawGas API Contract: Trip Subsystem"
Cohesion: 0.13
Nodes (14): 1. Dispatch Trip (`POST /api/trips/dispatch`), 1. `trips` Table, 2. Multi-Load Inventory Transfer (`POST /api/trips/:id/loads`), 2. `trip_loads` Table, 3. Plant Return Check-In (`POST /api/trips/:id/complete`), 3. `trip_load_items` Table, 4. Post-Trip Stock Reconciliation (`POST /api/trips/:id/reconcile`), 4. `trip_stock_reconciliations` Table (+6 more)

### Community 94 - "trips.service.js"
Cohesion: 0.12
Nodes (16): c_users_giann_documents_programming_stuff_madayawgas_madayawgas_backend_database_connection_pool, c_users_giann_documents_programming_stuff_madayawgas_madayawgas_backend_src_features_fleet_maintenance_index_maintenanceservice, { query, pool }, { buildPaginationMeta }, crypto, { historyService, EVENTS }, loadsRepository, { maintenanceService } (+8 more)

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

### Community 100 - "trips/index.js"
Cohesion: 0.22
Nodes (7): loadsRepository, reconciliationRepository, tripsController, tripsRepository, tripsRoutes, tripsService, { query }

### Community 103 - "schedules.controller.js"
Cohesion: 0.08
Nodes (10): c_users_giann_documents_programming_stuff_madayawgas_madayawgas_backend_src_utils_pagination_formatpaginatedenvelope, c_users_giann_documents_programming_stuff_madayawgas_madayawgas_backend_src_utils_pagination_parsepaginationquery, ALLOWED_SCHEDULE_SORT_FIELDS, { parsePaginationQuery, formatPaginatedEnvelope }, SchedulesController, schedulesService, ALLOWED_TRIP_SORT_FIELDS, { parsePaginationQuery, formatPaginatedEnvelope } (+2 more)

### Community 108 - "public.users"
Cohesion: 0.18
Nodes (12): idx_user_roles_role_id, idx_user_roles_user_id, IX_work_order_receipts_receipt_type, IX_work_order_receipts_work_order_id, public.audit_logs, public.permissions, public.role_permissions, public.roles (+4 more)

### Community 111 - "schedules.routes.js"
Cohesion: 0.13
Nodes (14): c_users_giann_documents_programming_stuff_madayawgas_madayawgas_backend_src_middleware_auth_middleware_authenticate, c_users_giann_documents_programming_stuff_madayawgas_madayawgas_backend_src_middleware_auth_middleware_requirepermission, asyncHandler, { authenticate, requirePermission }, express, router, schedulesController, templatesController (+6 more)

### Community 112 - "public.trips"
Cohesion: 0.18
Nodes (11): IX_trip_stock_reconciliations_status, IX_trip_stock_reconciliations_trip_id, IX_trips_departure_time, IX_trips_driver_id, IX_trips_sales_user_id, IX_trips_status, IX_trips_truck_id, IX_trips_zone_id (+3 more)

### Community 120 - "AGENTS.md — MadayawGas Backend System Context & Engineering Handbook"
Cohesion: 0.33
Nodes (5): 1. Overview & Tech Stack, 2. Current Architecture & Key Files, 5. Seed Users & Permanent Test Accounts, 6. Next Steps & Roadmap, AGENTS.md — MadayawGas Backend System Context & Engineering Handbook

### Community 121 - "maintenance.routes.js"
Cohesion: 0.16
Nodes (14): 11. Summary Checklist for Developers, 3. Layer Responsibilities & Strict Rules, 7. How to Add a New Feature (Step-by-Step), Layer 1: Route Layer (`*.routes.js`), Layer 2: Service Layer (`*.service.js`), Layer 3: Repository Layer (`*.repository.js`), asyncHandler, { authenticate, requirePermission } (+6 more)

### Community 126 - "public.vehicles"
Cohesion: 0.20
Nodes (10): IX_incident_reports_report_date, IX_incident_reports_severity, IX_incident_reports_vehicle_id, IX_vehicle_odometer_logs_logged_at, IX_vehicle_odometer_logs_vehicle_id, IX_vehicles_driver_id, public.incident_reports, public.incident_types (+2 more)

### Community 130 - "17. Update Work Order Status"
Cohesion: 0.50
Nodes (4): 17. Update Work Order Status, Request Body, Response: `200 OK` (Success), Response: `400 Bad Request` (Attempting Manual Completion)

### Community 131 - "19. Finalize Maintenance Log & Release Vehicle"
Cohesion: 0.50
Nodes (4): 19. Finalize Maintenance Log & Release Vehicle, Request Body, Response: `201 Created` (Success), Response: `409 Conflict` (Duplicate Receipt Number)

### Community 134 - "14. Create Maintenance Work Order"
Cohesion: 0.67
Nodes (3): 14. Create Maintenance Work Order, Request Body, Response: `201 Created` (Success)

### Community 135 - "18. Executive Cost Approval Decision"
Cohesion: 0.67
Nodes (3): 18. Executive Cost Approval Decision, Request Body, Response: `200 OK` (Success)

### Community 154 - "public.schedule_templates"
Cohesion: 0.25
Nodes (8): IX_schedule_templates_day_of_week, IX_schedule_templates_is_active, IX_schedule_templates_truck_id, IX_schedule_templates_zone_id, IX_service_zones_code, IX_service_zones_is_active, public.schedule_templates, public.service_zones

### Community 155 - "public.truck_schedules"
Cohesion: 0.33
Nodes (6): IX_truck_schedules_sales_user_id, IX_truck_schedules_scheduled_date, IX_truck_schedules_status, IX_truck_schedules_truck_id, IX_truck_schedules_zone_id, public.truck_schedules

### Community 156 - "public.update_timestamp_column"
Cohesion: 0.33
Nodes (6): trigger_update_schedule_templates_updated_at, trigger_update_service_zones_updated_at, trigger_update_trip_stock_reconciliations_updated_at, trigger_update_trips_updated_at, trigger_update_truck_schedules_updated_at, public.update_timestamp_column

### Community 157 - "public.approval_requests"
Cohesion: 0.50
Nodes (4): IX_approval_requests_is_approved, IX_approval_requests_work_order_id, public.approval_requests, UQ_approval_requests_pending

## Knowledge Gaps
- **681 isolated node(s):** `2. Current Architecture & Key Files`, `A. 3-Layer Architecture Rules`, `B. Authentication & Session Management`, `E. Test Concurrency & Isolation`, `5. Seed Users & Permanent Test Accounts` (+676 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 784 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **53 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `query()` connect `query` to `history/index.js`, `LoadsRepository`, `MaintenanceRepository`, `ReconciliationRepository`, `app.js`, `schedules.trips.test.js`, `fleet.maintenance.test.js`, `history.test.js`, `UsersController`, `connection.js`, `products.repository.js`, `CustomerRepository`, `auth.test.js`, `pagination.test.js`, `permission.test.js`, `availability.repository.js`, `profile.test.js`, `HistoryRepository`, `VehiclesRepository`, `schedules.service.js`, `VehiclesService`, `SchedulesRepository`, `TemplatesRepository`, `TemplatesService`, `ZonesRepository`, `AGENTS.md — MadayawGas Backend System Context & Engineering Handbook`, `TripsRepository`?**
  _High betweenness centrality (0.091) - this node is a cross-community bridge._
- **Why does `4. Recent Work Completed` connect `MaintenanceRepository` to `VehiclesRepository`, `history/index.js`, `MaintenanceController`, `ManagementService`, `fleet.routes.js`, `vehicles.service.js`, `parsePaginationQuery`, `AGENTS.md — MadayawGas Backend System Context & Engineering Handbook`, `maintenance.routes.js`?**
  _High betweenness centrality (0.037) - this node is a cross-community bridge._
- **Why does `MadayawGas Backend: Developer Guide & Architecture Conventions` connect `MadayawGas Backend: Developer Guide & Architecture Conventions` to `maintenance.routes.js`?**
  _High betweenness centrality (0.023) - this node is a cross-community bridge._
- **Are the 28 inferred relationships involving `query()` (e.g. with `1. Overview & Tech Stack` and `connection.js`) actually correct?**
  _`query()` has 28 INFERRED edges - model-reasoned connections that need verification._
- **Are the 36 inferred relationships involving `4. Recent Work Completed` (e.g. with `.getPmOverview()` and `.checkReceiptNumberExists()`) actually correct?**
  _`4. Recent Work Completed` has 36 INFERRED edges - model-reasoned connections that need verification._
- **What connects `2. Current Architecture & Key Files`, `A. 3-Layer Architecture Rules`, `B. Authentication & Session Management` to the rest of the system?**
  _681 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `history/index.js` be split into smaller, more focused modules?**
  _Cohesion score 0.11333333333333333 - nodes in this community are weakly interconnected._