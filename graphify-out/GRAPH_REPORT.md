# Graph Report - madayawgas-backend  (2026-09-27)

## Corpus Check
- 114 files · ~108,716 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 8 file(s) not represented in the graph (top: (none) 7, .example 1)

## Summary
- 800 nodes · 1428 edges · 60 communities (32 shown, 28 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 43 edges (avg confidence: 0.85)
- Token cost: 124,352 input · 2,864 output

## Community Hubs (Navigation)
- Fleet Availability Service
- Fleet Express Routes
- PostgreSQL Database Connection
- Initial RBAC SQL Schema
- Fleet Availability Controller
- Maintenance Repository Queries
- Approval & Incident Schema
- Project Dependencies & Configuration
- User Management Repository
- Maintenance Service Operations
- User Management Service
- User Auth Controller
- Express Application Setup
- Fleet Trucks Repository
- Customer Integration Tests
- Fleet Trucks Service
- Role Management Service
- Fleet Maintenance Tests
- History Log Tests
- User Subsystem Exports
- User Profile Service
- Fleet Trucks Controller
- Inventory Subsystem Exports
- Inventory Products Repository
- Sales Customer Controller
- Sales Customer Repository
- Authentication & Session Service
- RBAC Permission Service
- Authentication Integration Tests
- Pagination Integration Tests
- Permission Integration Tests
- Customer SQL Schema
- Fleet Availability Repository
- History Log Controller
- Sales Customer Service
- Users Controller Endpoints
- Fleet Integration Tests
- Inventory Integration Tests
- Management Integration Tests
- Profile Integration Tests
- Password Hashing & Crypto
- Pagination Utility Envelopes
- Inventory Products Controller
- Fleet Status State Transitions
- Trucks Controller Sorting
- History Logs Repository
- Products SQL Schema
- Fleet & Maintenance Contracts
- User & RBAC Contracts
- Node Runtime Environment Check
- Products API Contract
- Customer API Contract
- Auth API Contract
- Sales ERD Diagram

## God Nodes (most connected - your core abstractions)
1. `query()` - 125 edges
2. `MaintenanceRepository` - 37 edges
3. `UsersRepository` - 34 edges
4. `MaintenanceController` - 21 edges
5. `MaintenanceService` - 21 edges
6. `UsersController` - 20 edges
7. `{ Pool }` - 17 edges
8. `ManagementService` - 15 edges
9. `TrucksRepository` - 14 edges
10. `"users"` - 12 edges

## Surprising Connections (you probably didn't know these)
- `cleanupTestData()` --calls--> `query()`  [EXTRACTED]
  src/test/fleet.maintenance.test.js → database/connection.js
- `cleanupTestData()` --calls--> `query()`  [EXTRACTED]
  src/test/history.test.js → database/connection.js
- `cleanup()` --calls--> `query()`  [EXTRACTED]
  src/test/pagination.test.js → database/connection.js
- `initializeDatabase()` --calls--> `testConnection()`  [EXTRACTED]
  src/server.js → database/connection.js
- `"user_roles"` --references--> `"roles"`  [EXTRACTED]
  database/migrations/007_multi_role_and_org_chart_roles.sql → database/migrations/001_initial-setup.sql

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Maintenance Workflow Participants** — docs_api_contracts_fleet_maintenance_api_md, docs_erd_mermaid_fleet_and_maintenance_erd_md, maintenance_work_order_flow [EXTRACTED 1.00]

## Communities (60 total, 28 thin omitted)

### Community 0 - "Fleet Availability Service"
Cohesion: 0.06
Nodes (40): availabilityRepository, { historyService, EVENTS }, trucksRepository, { historyService, EVENTS }, maintenanceRepository, { pool }, { query }, { calculateOffset, buildPaginationMeta } (+32 more)

### Community 1 - "Fleet Express Routes"
Cohesion: 0.05
Nodes (49): express, asyncHandler, { authenticate, requirePermission, requirePasswordConfirmation }, availabilityController, express, maintenanceRoutes, router, trucksController (+41 more)

### Community 2 - "PostgreSQL Database Connection"
Cohesion: 0.06
Nodes (51): { Pool }, testConnection(), cleanDump(), { execFileSync }, exportSchema(), findPgDump(), fs, getPostgresVersion() (+43 more)

### Community 3 - "Initial RBAC SQL Schema"
Cohesion: 0.08
Nodes (43): "audit_logs", "permissions", "role_permissions", "roles", "sessions", "users", IX_trucks_driver_id, trigger_update_trucks_updated_at (+35 more)

### Community 4 - "Fleet Availability Controller"
Cohesion: 0.05
Nodes (16): AvailabilityController, availabilityService, availabilityController, availabilityRepository, availabilityService, fleetRoutes, {
  maintenanceRepository,
  maintenanceService,
  maintenanceController,
  maintenanceRoutes,
}, trucksController (+8 more)

### Community 6 - "Approval & Incident Schema"
Cohesion: 0.11
Nodes (34): IX_approval_requests_decider_id, IX_approval_requests_work_order_id, IX_incident_reports_incident_type_id, IX_incident_reports_reporter_id, IX_incident_reports_truck_id, IX_maintenance_logs_maintenance_type_id, IX_maintenance_logs_work_order_id, IX_trucks_driver_id (+26 more)

### Community 7 - "Project Dependencies & Configuration"
Cohesion: 0.06
Nodes (35): author, dependencies, bcrypt, cors, dotenv, express, pg, zod (+27 more)

### Community 10 - "User Management Service"
Cohesion: 0.13
Nodes (16): ref_crypto, authService, bcrypt, { calculateOffset, buildPaginationMeta }, { generateBaseUsername, resolveUniqueUsername }, { generateTemporaryPassword }, { historyService, EVENTS }, { parsePhoneNumber } (+8 more)

### Community 12 - "Express Application Setup"
Cohesion: 0.14
Nodes (8): app, cookieParser, cors, corsOptions, errorHandler, express, routes, corsOptions

### Community 14 - "Customer Integration Tests"
Cohesion: 0.17
Nodes (10): ref_node_assert, ref_node_test, app, assert, bcrypt, { query, pool }, { test, before, after, beforeEach }, assert (+2 more)

### Community 15 - "Fleet Trucks Service"
Cohesion: 0.31
Nodes (3): formatDriver(), formatTruck(), TrucksService

### Community 17 - "Fleet Maintenance Tests"
Cohesion: 0.20
Nodes (11): ref_node_http, app, assert, bcrypt, cleanupTestData(), http, login(), makeRequest() (+3 more)

### Community 18 - "History Log Tests"
Cohesion: 0.23
Nodes (11): src_features_history_index_resolveevent, app, assert, cleanupTestData(), http, loginAsSalesUser(), loginAsSuperAdmin(), makeRequest() (+3 more)

### Community 19 - "User Subsystem Exports"
Cohesion: 0.18
Nodes (9): authService, managementService, permissionService, profileService, usersController, usersRepository, usersRoutes, usersRepository (+1 more)

### Community 20 - "User Profile Service"
Cohesion: 0.24
Nodes (8): { historyService, EVENTS }, { parsePhoneNumber }, permissionService, ProfileService, usersRepository, getPhoneType(), isValidPhoneNumber(), parsePhoneNumber()

### Community 22 - "Inventory Subsystem Exports"
Cohesion: 0.22
Nodes (7): inventoryRoutes, productsController, productsRepository, productsService, ALLOWED_PRODUCT_SORT_FIELDS, { parsePaginationQuery, formatPaginatedEnvelope }, productsService

### Community 24 - "Sales Customer Controller"
Cohesion: 0.22
Nodes (4): ALLOWED_CUSTOMER_SORT_FIELDS, CustomerController, customerService, { parsePaginationQuery, formatPaginatedEnvelope }

### Community 28 - "Authentication Integration Tests"
Cohesion: 0.25
Nodes (6): app, assert, bcrypt, crypto, { query, pool }, { test, before, after, beforeEach }

### Community 29 - "Pagination Integration Tests"
Cohesion: 0.25
Nodes (6): app, assert, bcrypt, cleanup(), { query, pool }, { test, before, after, beforeEach }

### Community 30 - "Permission Integration Tests"
Cohesion: 0.25
Nodes (6): app, assert, bcrypt, permissionService, { query, pool }, { test, before, after, beforeEach }

### Community 31 - "Customer SQL Schema"
Cohesion: 0.48
Nodes (6): "customers", idx_customers_customer_type, idx_customers_is_active, idx_customers_name, trigger_update_customers_updated_at, update_customers_updated_at_column()

### Community 33 - "History Log Controller"
Cohesion: 0.29
Nodes (4): ALLOWED_HISTORY_SORT_FIELDS, HistoryController, historyService, { parsePaginationQuery, formatPaginatedEnvelope }

### Community 35 - "Users Controller Endpoints"
Cohesion: 0.29
Nodes (6): ALLOWED_USER_SORT_FIELDS, authService, managementService, { parsePaginationQuery, formatPaginatedEnvelope }, permissionService, profileService

### Community 36 - "Fleet Integration Tests"
Cohesion: 0.29
Nodes (5): app, assert, bcrypt, { query, pool }, { test, before, after, beforeEach }

### Community 37 - "Inventory Integration Tests"
Cohesion: 0.29
Nodes (5): app, assert, bcrypt, { query, pool }, { test, before, after, beforeEach }

### Community 38 - "Management Integration Tests"
Cohesion: 0.29
Nodes (5): app, assert, bcrypt, { query, pool }, { test, before, after, beforeEach }

### Community 39 - "Profile Integration Tests"
Cohesion: 0.29
Nodes (5): app, assert, bcrypt, { query, pool }, { test, before, after, beforeEach }

### Community 40 - "Password Hashing & Crypto"
Cohesion: 0.33
Nodes (5): bcrypt, bcrypt, crypto, permissionService, usersRepository

### Community 44 - "Trucks Controller Sorting"
Cohesion: 0.40
Nodes (4): ALLOWED_DRIVER_SORT_FIELDS, ALLOWED_TRUCK_SORT_FIELDS, { parsePaginationQuery, formatPaginatedEnvelope }, trucksService

### Community 46 - "Products SQL Schema"
Cohesion: 0.67
Nodes (3): "products", trigger_update_products_updated_at, update_products_updated_at_column()

### Community 47 - "Fleet & Maintenance Contracts"
Cohesion: 0.50
Nodes (4): Fleet Maintenance API, Trucks API, Fleet ERD, Maintenance Lifecycle

### Community 48 - "User & RBAC Contracts"
Cohesion: 0.50
Nodes (4): History API, User Management API, Roles API, RBAC System

## Knowledge Gaps
- **265 isolated node(s):** `"products"`, `{ execFileSync }`, `fs`, `path`, `fs` (+260 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 322 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **28 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `query()` connect `Maintenance Repository Queries` to `Fleet Availability Service`, `PostgreSQL Database Connection`, `User Management Repository`, `Fleet Trucks Repository`, `Customer Integration Tests`, `Fleet Maintenance Tests`, `History Log Tests`, `User Subsystem Exports`, `Inventory Products Repository`, `Sales Customer Repository`, `Authentication Integration Tests`, `Pagination Integration Tests`, `Permission Integration Tests`, `Fleet Availability Repository`, `Fleet Integration Tests`, `Inventory Integration Tests`, `Management Integration Tests`, `Profile Integration Tests`, `History Logs Repository`?**
  _High betweenness centrality (0.215) - this node is a cross-community bridge._
- **Why does `bcrypt` connect `Password Hashing & Crypto` to `Fleet Integration Tests`, `Inventory Integration Tests`, `Management Integration Tests`, `Project Dependencies & Configuration`, `Profile Integration Tests`, `User Management Service`, `Customer Integration Tests`, `Fleet Maintenance Tests`, `Authentication Integration Tests`, `Pagination Integration Tests`, `Permission Integration Tests`?**
  _High betweenness centrality (0.059) - this node is a cross-community bridge._
- **Are the 18 inferred relationships involving `query()` (e.g. with `connection.js` and `.checkReceiptNumberExists()`) actually correct?**
  _`query()` has 18 INFERRED edges - model-reasoned connections that need verification._
- **What connects `"products"`, `{ execFileSync }`, `fs` to the rest of the system?**
  _265 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Fleet Availability Service` be split into smaller, more focused modules?**
  _Cohesion score 0.05711263881544157 - nodes in this community are weakly interconnected._
- **Should `Fleet Express Routes` be split into smaller, more focused modules?**
  _Cohesion score 0.05084745762711865 - nodes in this community are weakly interconnected._
- **Should `PostgreSQL Database Connection` be split into smaller, more focused modules?**
  _Cohesion score 0.05669199298655757 - nodes in this community are weakly interconnected._