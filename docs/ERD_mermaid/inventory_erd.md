# Inventory Subsystem & Route Reconciliation — Entity Relationship Diagram (ERD)

> **Subsystem**: Inventory & Route Reconciliation Engine  
> **Target Database**: PostgreSQL 18.x  
> **Schema Migrations**: `003_products.sql`, `010_schedules_and_trips.sql`, `011_plant_inventory_and_reconciliation.sql`  
> **Operational Tiers**:
> 1. **Plant Bulk Inventory**: Master physical stock at the Bunawan refilling yard managed by the Plant Supervisor (`plant_user` / `plant_supervisor`).
> 2. **Vehicle Route Inventory**: Stock loaded onto delivery vehicles acting as mobile storefronts during trips, tracking morning dispatch loads, midday reloads, cabin on-board stock visibility, post-trip physical return unloads, and variance settlement.

---

## 1. Mermaid Entity-Relationship Diagram

```mermaid
---
config:
  layout: elk
  theme: neutral
---

erDiagram

    %% ==========================================
    %% ENUMS
    %% ==========================================

    %% PostgreSQL ENUMS:
    %%   container_type_enum:
    %%     CYLINDER, CANISTER
    %%
    %%   stock_condition:
    %%     FILLED, EMPTY_GOOD, DEFECTIVE
    %%
    %%   plant_adjustment_type:
    %%     SUPPLIER_PURCHASE, DEFECT_ADJUSTMENT, PHYSICAL_COUNT
    %%
    %%   transfer_type / inventory_transfer_type:
    %%     DISPATCH_LOAD, RETURN_UNLOAD, SUPPLIER_PURCHASE, DEFECT_ADJUSTMENT
    %%
    %%   reconciliation_status:
    %%     AWAITING_SYNC, SETTLED, FLAGGED_VARIANCE


    %% ==========================================
    %% EXTERNAL SUBSYSTEM BOUNDARY STUBS
    %% ==========================================

    USERS {
        uuid id PK
        string username UK
        string first_name
        string last_name
    }

    TRIPS {
        uuid id PK
        string trip_number UK
        enum status
        timestamptz departure_time
        timestamptz return_time
    }

    SALES_TRANSACTIONS {
        uuid id PK
        uuid trip_id FK
        datetime created_at
    }

    CANISTER_LEDGER {
        uuid id PK
        uuid customer_id FK
        uuid product_id FK
        uuid trip_id FK
        int canisters_loaned
        int canisters_returned
    }


    %% ==========================================
    %% INVENTORY CORE ENTITIES
    %% ==========================================

    PRODUCTS {
        uuid id PK
        string name UK
        string category
        enum container_type "container_type_enum"
        numeric net_weight_kg
        boolean is_active
        timestamptz created_at
        timestamptz updated_at
    }

    PLANT_INVENTORY {
        uuid id PK
        uuid product_id FK "UK"
        int quantity_filled "CHECK >= 0"
        int quantity_empty_good "CHECK >= 0"
        int quantity_defective "CHECK >= 0"
        timestamptz last_counted_at
        timestamptz created_at
        timestamptz updated_at
    }

    PLANT_STOCK_ADJUSTMENTS {
        uuid id PK
        uuid product_id FK
        uuid recorded_by FK
        enum adjustment_type "plant_adjustment_type"
        enum target_condition "stock_condition"
        int delta_quantity
        enum source_condition "stock_condition Nullable"
        string supplier_invoice_number "Nullable"
        string reason
        timestamptz recorded_at
        timestamptz created_at
    }

    TRIP_LOADS {
        uuid id PK
        uuid trip_id FK
        enum transfer_type "transfer_type"
        string slip_number UK
        uuid recorded_by FK
        timestamptz recorded_at
        string remarks "Nullable"
    }

    TRIP_LOAD_ITEMS {
        uuid id PK
        uuid load_id FK
        uuid product_id FK
        enum condition "stock_condition"
        int quantity_units "CHECK >= 0"
    }

    TRIP_STOCK_RECONCILIATIONS {
        uuid id PK
        uuid trip_id FK "UK"
        uuid verified_by FK
        int total_loaded_full "CHECK >= 0"
        int total_sold_full "CHECK >= 0"
        int total_returned_full "CHECK >= 0"
        int total_returned_empty_good "CHECK >= 0"
        int total_returned_defective "CHECK >= 0"
        int net_customer_debt_created "Signed Integer"
        int full_discrepancy "Computed Variance"
        int empty_discrepancy "Computed Variance"
        jsonb reconciliation_data "Per-Product Breakdown"
        enum status "reconciliation_status"
        string supervisor_notes "Nullable"
        timestamptz reconciled_at "Nullable"
        timestamptz created_at
        timestamptz updated_at
    }


    %% ==========================================
    %% RELATIONSHIPS
    %% ==========================================

    %% User associations
    USERS ||--o{ PLANT_STOCK_ADJUSTMENTS : "recorded_by"
    USERS ||--o{ TRIP_LOADS : "recorded_by (authorized_by)"
    USERS ||--o{ TRIP_STOCK_RECONCILIATIONS : "verified_by"

    %% Plant Inventory
    PRODUCTS ||--|| PLANT_INVENTORY : "tracks_stock_for"
    PRODUCTS ||--o{ PLANT_STOCK_ADJUSTMENTS : "adjusts"

    %% Stock Transfers (trip_loads & views)
    TRIPS ||--o{ TRIP_LOADS : "undergoes"
    TRIP_LOADS ||--|{ TRIP_LOAD_ITEMS : "contains"
    PRODUCTS ||--o{ TRIP_LOAD_ITEMS : "specifies"

    %% Trip Settlement & Cross-Domain Boundaries
    TRIPS ||--o| TRIP_STOCK_RECONCILIATIONS : "settles"
    TRIPS ||--o{ SALES_TRANSACTIONS : "generates_in_field"
    SALES_TRANSACTIONS ||--o{ CANISTER_LEDGER : "updates_customer_balance"
    CANISTER_LEDGER }o--|| PRODUCTS : "targets_product"

    %% Cross-Domain Aggregations
    TRIP_STOCK_RECONCILIATIONS ||--o{ SALES_TRANSACTIONS : "aggregates_sales"
    TRIP_STOCK_RECONCILIATIONS ||--o{ CANISTER_LEDGER : "aggregates_debt"
```

---

## 2. Table Specifications & Architectural Decisions

### `plant_inventory`
Maintains real-time discrete unit counts at the Bunawan refilling yard.

| Column | Data Type | Nullable | Default / Constraints | Description |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `UUID` | No | `PRIMARY KEY DEFAULT gen_random_uuid()` | Record UUID |
| `product_id` | `UUID` | No | `UNIQUE REFERENCES products(id) ON DELETE RESTRICT` | Referenced product item |
| `quantity_filled` | `INT` | No | `DEFAULT 0 CHECK (quantity_filled >= 0)` | Filled, sale-ready stock in units |
| `quantity_empty_good` | `INT` | No | `DEFAULT 0 CHECK (quantity_empty_good >= 0)` | Clean, refilling-ready empty units |
| `quantity_defective` | `INT` | No | `DEFAULT 0 CHECK (quantity_defective >= 0)` | Quarantined defective/leaker units |
| `last_counted_at` | `TIMESTAMPTZ` | No | `DEFAULT CURRENT_TIMESTAMP` | Last physical audit count timestamp |
| `created_at` | `TIMESTAMPTZ` | No | `DEFAULT CURRENT_TIMESTAMP` | Row creation timestamp |
| `updated_at` | `TIMESTAMPTZ` | No | `DEFAULT CURRENT_TIMESTAMP` | Managed automatically via trigger |

---

### `plant_stock_adjustments`
Immutable audit log of all yard-level bulk stock movements.

| Column | Data Type | Nullable | Default / Constraints | Description |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `UUID` | No | `PRIMARY KEY DEFAULT gen_random_uuid()` | Adjustment UUID |
| `product_id` | `UUID` | No | `REFERENCES products(id) ON DELETE RESTRICT` | Target product item |
| `recorded_by` | `UUID` | Yes | `REFERENCES users(id) ON DELETE SET NULL` | Plant Supervisor who logged the adjustment |
| `adjustment_type` | `plant_adjustment_type` | No | `'SUPPLIER_PURCHASE'`, `'DEFECT_ADJUSTMENT'`, `'PHYSICAL_COUNT'` | Movement type |
| `target_condition` | `stock_condition` | No | `'FILLED'`, `'EMPTY_GOOD'`, `'DEFECTIVE'` | Condition bucket credited/adjusted |
| `delta_quantity` | `INT` | No | Signed integer unit count | Stock delta quantity |
| `source_condition` | `stock_condition` | Yes | `NULL` | Decremented condition (for defect quarantine) |
| `supplier_invoice_number` | `VARCHAR(100)` | Yes | `NULL` | Invoice/receipt reference for supplier purchases |
| `reason` | `TEXT` | No | Text description | Operational rationale |
| `recorded_at` | `TIMESTAMPTZ` | No | `DEFAULT CURRENT_TIMESTAMP` | Event timestamp |
| `created_at` | `TIMESTAMPTZ` | No | `DEFAULT CURRENT_TIMESTAMP` | Record creation timestamp |

---

### Compatibility Views
To bridge nomenclature between the Schedule & Trip subsystem and the Inventory subsystem without data duplication:
- **`trip_stock_transfers`**: `VIEW` projecting `trip_loads` (`id`, `trip_id`, `transfer_type`, `slip_number`, `recorded_by`, `recorded_at`, `remarks`).
- **`trip_stock_transfer_items`**: `VIEW` projecting `trip_load_items` (`id`, `load_id`, `load_id AS transfer_id`, `product_id`, `condition`, `quantity_units`).
