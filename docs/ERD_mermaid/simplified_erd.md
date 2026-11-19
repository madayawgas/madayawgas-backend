# Simplified Master Database Architecture — Core ERD

> **Database Engine**: PostgreSQL 18.x  
> **Scope**: 15 Core Operational Tables (distilled from the 38-table [`master_database_erd.md`](./master_database_erd.md))  
> **Purpose**: Presentation-friendly (PPT) entity-relationship diagram highlighting the core tables, primary keys, foreign keys, essential business fields, and cross-subsystem relationships.

---

## 1. Simplified Core Mermaid ERD

```mermaid
---
config:
  layout: elk
  theme: neutral
---

erDiagram

    %% ========================================================
    %% 1. USER MANAGEMENT (2 Core Tables)
    %% ========================================================

    ROLES {
        uuid id PK
        string name UK
    }

    USERS {
        uuid id PK
        uuid role_id FK
        string username UK
        string first_name
        string last_name
        boolean is_active
    }

    %% ========================================================
    %% 2. FLEET & MAINTENANCE (2 Core Tables)
    %% ========================================================

    VEHICLES {
        uuid id PK
        uuid driver_id FK "UK"
        string plate_number UK
        string vehicle_type
        int current_odometer
        enum status "truck_status"
    }

    WORK_ORDERS {
        uuid id PK
        uuid vehicle_id FK
        uuid creator_id FK
        string status
        timestamptz scheduled_date
        numeric estimated_cost
    }

    %% ========================================================
    %% 3. INVENTORY (2 Core Tables)
    %% ========================================================

    PRODUCTS {
        uuid id PK
        string name UK
        string category
        enum container_type "container_type_enum"
        numeric unit_price
        boolean is_active
    }

    PLANT_INVENTORY {
        uuid id PK
        uuid product_id FK "UK"
        int quantity_filled
        int quantity_empty_good
        int quantity_defective
    }

    %% ========================================================
    %% 4. SCHEDULE & TRIPS (5 Core Tables)
    %% ========================================================

    SERVICE_ZONES {
        uuid id PK
        string code UK
        string name UK
    }

    TRUCK_SCHEDULES {
        uuid id PK
        uuid truck_id FK
        uuid sales_user_id FK
        uuid zone_id FK
        date scheduled_date
        enum status "schedule_status"
    }

    TRIPS {
        uuid id PK
        uuid schedule_id FK
        uuid truck_id FK
        uuid driver_id FK
        uuid sales_user_id FK
        uuid zone_id FK
        string trip_number UK
        enum status "trip_status"
    }

    TRIP_LOADS {
        uuid id PK
        uuid trip_id FK
        enum transfer_type "transfer_type"
        string slip_number UK
    }

    TRIP_LOAD_ITEMS {
        uuid id PK
        uuid load_id FK
        uuid product_id FK
        enum condition "stock_condition"
        int quantity_units
    }

    %% ========================================================
    %% 5. SALES & DELIVERY (4 Core Tables)
    %% ========================================================

    CUSTOMERS {
        uuid id PK
        uuid zone_id FK
        string name
        string customer_type
        string contact_number
        string delivery_address
    }

    SALES_TRANSACTIONS {
        uuid id PK
        uuid trip_id FK
        uuid customer_id FK
        uuid recorded_by FK
        string transaction_no UK
        string status
        timestamptz transacted_at
    }

    SALES_TRANSACTION_ITEMS {
        uuid id PK
        uuid transaction_id FK
        uuid product_id FK
        int quantity_sold
        int empties_returned
        numeric subtotal_amount
    }

    SALES_INVOICES {
        uuid id PK
        uuid transaction_id FK,UK
        string invoice_number UK
        numeric total_amount
        string payment_method
        string payment_status
    }

    %% ========================================================
    %% CORE CROSS-SUBSYSTEM RELATIONSHIPS
    %% ========================================================

    ROLES ||--o{ USERS : "primary_role"
    USERS ||--o| VEHICLES : "assigned_driver"
    USERS ||--o{ WORK_ORDERS : "created_by"
    USERS ||--o{ TRUCK_SCHEDULES : "assigned_sales_rep"
    USERS ||--o{ TRIPS : "driver / sales_rep"
    USERS ||--o{ SALES_TRANSACTIONS : "recorded_by"

    VEHICLES ||--o{ WORK_ORDERS : "serviced_by"
    VEHICLES ||--o{ TRUCK_SCHEDULES : "assigned_truck"
    VEHICLES ||--o{ TRIPS : "assigned_truck"

    PRODUCTS ||--|| PLANT_INVENTORY : "tracks_stock"
    PRODUCTS ||--o{ TRIP_LOAD_ITEMS : "manifest_item"
    PRODUCTS ||--o{ SALES_TRANSACTION_ITEMS : "sold_item"

    SERVICE_ZONES ||--o{ TRUCK_SCHEDULES : "zoned_for"
    SERVICE_ZONES ||--o{ TRIPS : "destined_for"
    SERVICE_ZONES ||--o{ CUSTOMERS : "locates"

    TRUCK_SCHEDULES |o--o| TRIPS : "executed_as"
    TRIPS ||--o{ TRIP_LOADS : "manifests"
    TRIP_LOADS ||--|{ TRIP_LOAD_ITEMS : "contains"
    TRIPS ||--o{ SALES_TRANSACTIONS : "delivers"

    CUSTOMERS ||--o{ SALES_TRANSACTIONS : "purchases"
    SALES_TRANSACTIONS ||--|{ SALES_TRANSACTION_ITEMS : "contains"
    SALES_TRANSACTIONS ||--|| SALES_INVOICES : "bills"
```

---

## 2. Core Subsystem Breakdown

| Subsystem | Core Tables Included | Role in System Flow |
| :--- | :--- | :--- |
| **1. User Management** | `roles`, `users` | Defines system actors (Admin, Driver, Sales Rep, Supervisor) and their primary roles. |
| **2. Fleet & Maintenance** | `vehicles`, `work_orders` | Tracks delivery trucks, assigned drivers, odometer readings, and maintenance work orders. |
| **3. Inventory** | `products`, `plant_inventory` | Defines LPG products/containers and tracks filled, empty-good, and defective plant stock. |
| **4. Schedule & Trips** | `service_zones`, `truck_schedules`, `trips`, `trip_loads`, `trip_load_items` | Plans daily truck routes, executes dispatch trips, and records outbound/return stock manifests. |
| **5. Sales & Delivery** | `customers`, `sales_transactions`, `sales_transaction_items`, `sales_invoices` | Manages customer profiles, field sales transactions, line-item quantities, and payment invoices. |

> For the complete 38-table schema including RBAC junctions, audit/history logs, odometer/fuel telemetry, stock reconciliations, and canister ledgers, see [`master_database_erd.md`](./master_database_erd.md).
