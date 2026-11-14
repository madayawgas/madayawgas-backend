# Entity-Relationship Diagrams (ERD) — Directory & Architecture Guide

> **Database Engine**: PostgreSQL 18.x  
> **Schema Migrations**: 001 through 021 (`database/migrations/`)  
> **Last Synchronized**: November 13, 2026

Welcome to the Entity-Relationship Diagram (ERD) directory for the MadayawGas backend. All schemas documented here reflect the exact live database implementation across all migrations (`001` through `021`).

---

## 1. Subsystem ERD Documents

| Subsystem | Scope & Tables | Document Link |
| :--- | :--- | :--- |
| **Unified Master Database (Full)** | Complete 36-table system diagram with all fields and constraints | [**`master_database_erd.md`**](./master_database_erd.md) |
| **Unified Master Database (Relationships Only)** | Clean high-level table-and-connector diagram without fields | [**`master_database_relationships_erd.md`**](./master_database_relationships_erd.md) |
| **User Management & RBAC** | `roles`, `permissions`, `role_permissions`, `users`, `user_roles`, `sessions`, `audit_logs` | [**`users_and_rbac_erd.md`**](./users_and_rbac_erd.md) |
| **System Event History Logs** | `history_logs` (denormalized actor snapshots, JSONB `metadata`) | [**`system_history_logs_erd.md`**](./system_history_logs_erd.md) |
| **Fleet & Maintenance** | `vehicles`, `maintenance_types`, `incident_types`, `vehicle_odometer_logs`, `vehicle_inspections`, `incident_reports`, `work_orders`, `approval_requests`, `maintenance_logs`, `work_order_receipts` | [**`fleet_and_maintenance_erd.md`**](./fleet_and_maintenance_erd.md) |
| **Inventory Subsystem** | `products`, `plant_inventory`, `plant_stock_adjustments`, `trip_loads`, `trip_load_items`, `trip_stock_reconciliations` | [**`inventory_erd.md`**](./inventory_erd.md) |
| **Sales & Delivery** | `customers`, `sales_transactions`, `sales_transaction_items`, `sales_invoices`, `canister_ledger` | [**`sales_and_delivery_erd.md`**](./sales_and_delivery_erd.md) |
| **Schedule & Trip Subsystem** | `service_zones`, `schedule_templates`, `truck_schedules`, `trips`, `trip_loads`, `trip_load_items`, `trip_stock_reconciliations` | [**`schedule_and_trip_erd.md`**](./schedule_and_trip_erd.md) |
| **Frontline Operations** | `driver_apprehensions`, `vehicle_fuel_logs`, `emergency_alerts` | [**`operations_erd.md`**](./operations_erd.md) |

---

## 2. PostgreSQL 18 Custom ENUM Types

| ENUM Name | Allowed Literals | Used In Table(s) |
| :--- | :--- | :--- |
| `truck_status` | `'ACTIVE'`, `'INACTIVE'`, `'UNDER_MAINTENANCE'`, `'RETIRED'` | `vehicles.status` |
| `container_type_enum` | `'CYLINDER'`, `'CANISTER'` | `products.container_type` |
| `customer_type_enum` | `'RETAIL'`, `'COMMERCIAL'`, `'WHOLESALE'` | Legacy enum (replaced on `customers.customer_type` in Migration `015` by `VARCHAR(30)` check `'COMMERCIAL'`, `'RETAIL'`, `'RETAILER'`, `'WHOLESALE'`, `'HOUSEHOLD'`) |
| `plant_adjustment_type` | `'SUPPLIER_PURCHASE'`, `'DEFECT_ADJUSTMENT'`, `'PHYSICAL_COUNT'` | `plant_stock_adjustments.adjustment_type` |
| `inventory_transfer_type` | `'DISPATCH_LOAD'`, `'RETURN_UNLOAD'`, `'SUPPLIER_PURCHASE'`, `'DEFECT_ADJUSTMENT'` | Inventory transfer audit classification |
| `schedule_status` | `'SCHEDULED'`, `'DISPATCHED'`, `'CANCELLED'` | `truck_schedules.status` |
| `trip_status` | `'PENDING'`, `'IN_PROGRESS'`, `'RETURNED'`, `'COMPLETED'`, `'CANCELLED'` | `trips.status` |
| `transfer_type` | `'DISPATCH_LOAD'`, `'RETURN_UNLOAD'` | `trip_loads.transfer_type` |
| `stock_condition` | `'FILLED'`, `'EMPTY_GOOD'`, `'DEFECTIVE'` | `trip_load_items.condition` |
| `reconciliation_status` | `'AWAITING_SYNC'`, `'SETTLED'`, `'FLAGGED_VARIANCE'` | `trip_stock_reconciliations.status` |

---

## 3. Database Conventions

1. **Primary Keys**: Every application table uses `UUID DEFAULT gen_random_uuid() PRIMARY KEY`, except classification lookup tables (`maintenance_types`, `incident_types`) which use integer `SERIAL PRIMARY KEY`.
2. **Timestamps**: All temporal fields are typed `TIMESTAMPTZ` with defaults (`NOW()` or `CURRENT_TIMESTAMP`).
3. **Automated Maintenance**: Tables with mutable states maintain `updated_at` timestamps backed by PostgreSQL `BEFORE UPDATE` trigger functions.
4. **Generated Columns**:
   - `vehicles.pm_due_flag`: Evaluated automatically on odometer updates.
   - `maintenance_logs.total_cost`: Computed automatically from parts and labor costs.
5. **Partial Indexes**:
   - `UQ_approval_requests_pending`: `ON approval_requests (work_order_id) WHERE is_approved IS NULL`.
   - `UQ_trips_schedule_id`: `ON trips (schedule_id) WHERE schedule_id IS NOT NULL`.
   - `UQ_trips_active_truck`: `ON trips (truck_id) WHERE status IN ('PENDING', 'IN_PROGRESS', 'RETURNED')`.
   - `UQ_trips_active_driver`: `ON trips (driver_id) WHERE status IN ('PENDING', 'IN_PROGRESS')`.
   - `UQ_trips_active_sales_user`: `ON trips (sales_user_id) WHERE status IN ('PENDING', 'IN_PROGRESS')`.
   - `UQ_truck_schedules_active_truck_date`: `ON truck_schedules (truck_id, scheduled_date) WHERE status <> 'CANCELLED'`.
   - `UQ_truck_schedules_active_sales_date`: `ON truck_schedules (sales_user_id, scheduled_date) WHERE status <> 'CANCELLED'`.
   - `UQ_schedule_templates_active_sales_day`: `ON schedule_templates (default_sales_user_id, day_of_week) WHERE is_active = TRUE AND default_sales_user_id IS NOT NULL`.
