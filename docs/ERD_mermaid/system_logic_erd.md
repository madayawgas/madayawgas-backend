# System Logic (Cross-Cutting Infrastructure) — Entity Relationship Diagram (ERD)

> **Classification**: Cross-Cutting System Logic & Infrastructure *(Non-Subsystem)*  
> **Target Database**: PostgreSQL 18.x  
> **Scope**: Houses cross-cutting event history auditing (`history_logs`), business configuration (`system_settings`), and schema migration tracking (`schema_migrations`) that support all 5 main business subsystems without belonging to a single domain subsystem.

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
    %% EXTERNAL SUBSYSTEM BOUNDARY STUB
    %% ==========================================

    USERS {
        uuid id PK
        string username UK
        string first_name
        string last_name
    }

    %% ==========================================
    %% SYSTEM LOGIC & INFRASTRUCTURE TABLES
    %% ==========================================

    HISTORY_LOGS {
        uuid id PK
        uuid user_id FK "Nullable (ON DELETE SET NULL)"
        string user_name "Denormalized actor name"
        string user_role "Denormalized actor role"
        string action_type "Created, Updated, Deactivated, Assigned, Status Changed, Deleted"
        string module "Cross-subsystem module classification"
        string action "Standardized event slug"
        string details "Resolved message template"
        string target_id "Nullable target entity identifier"
        string target_type "Nullable target entity classification"
        jsonb metadata "Arbitrary structured context"
        timestamptz created_at
    }

    SYSTEM_SETTINGS {
        string key PK
        string value
        string value_type "INTEGER, NUMBER, BOOLEAN, STRING"
        string category
        string label
        string description
        string unit
        numeric min_value
        numeric max_value
        uuid updated_by FK "Nullable (ON DELETE SET NULL)"
        timestamptz created_at
        timestamptz updated_at
    }

    SCHEMA_MIGRATIONS {
        int id PK
        string filename UK "Migration filename"
        timestamptz applied_at
    }

    %% ==========================================
    %% RELATIONSHIPS
    %% ==========================================

    USERS ||--o{ HISTORY_LOGS : "logs_event (user_id)"
    USERS ||--o{ SYSTEM_SETTINGS : "updates_setting (updated_by)"
```

---

## 2. Table Specifications

### `history_logs`
Chronological event ledger recording operational, financial, route, and administrative actions across all 5 main subsystems.

| Column | Data Type | Nullable | Default / Constraints | Description |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `UUID` | No | `PRIMARY KEY DEFAULT gen_random_uuid()` | Unique log identifier |
| `user_id` | `UUID` | Yes | `FK -> users(id) ON DELETE SET NULL` | Performing authenticated user (system events use NULL) |
| `user_name` | `VARCHAR(150)` | No | Non-empty | Snapshot of actor's full name at log time |
| `user_role` | `VARCHAR(100)` | No | Non-empty | Snapshot of actor's active role at log time |
| `action_type` | `VARCHAR(50)` | No | Non-empty | High-level action category: `Created`, `Updated`, `Deactivated`, `Assigned`, `Status Changed`, `Deleted` |
| `module` | `VARCHAR(100)` | No | Non-empty | Domain classification (e.g. `User Management`, `Fleet Management`, `Inventory Management`, `Sales & Delivery`, `SCHEDULE`, `TRIP`) |
| `action` | `VARCHAR(100)` | No | Non-empty | Standard event key (e.g. `TRIP_DISPATCHED`, `PRODUCT_CREATED`) |
| `details` | `TEXT` | No | Non-empty | Resolved descriptive message |
| `target_id` | `VARCHAR(255)` | Yes | `NULL` | ID of the affected entity |
| `target_type` | `VARCHAR(100)` | Yes | `NULL` | Entity type (e.g. `TRIP`, `VEHICLE`, `PRODUCT`, `USER`) |
| `metadata` | `JSONB` | Yes | `DEFAULT '{}'::jsonb` | Structured JSON payload for auxiliary event data |
| `created_at` | `TIMESTAMPTZ` | No | `DEFAULT NOW()` | Event recording timestamp |

### `system_settings`
Stores configurable operational business thresholds and system variables managed by Super Admin and Admin accounts.

| Column | Data Type | Nullable | Default / Constraints | Description |
| :--- | :--- | :--- | :--- | :--- |
| `key` | `VARCHAR(100)` | No | `PRIMARY KEY` | Unique dot-delimited setting key (e.g. `fleet.pm_odometer_threshold_km`) |
| `value` | `TEXT` | No | — | Serialized current setting value |
| `value_type` | `VARCHAR(20)` | No | `CHECK IN ('INTEGER', 'NUMBER', 'BOOLEAN', 'STRING')` | Runtime type coercion rule |
| `category` | `VARCHAR(50)` | No | — | Operational domain category (`FLEET`, `OPERATIONS`, `INVENTORY`, `SCHEDULES`) |
| `label` | `VARCHAR(150)` | No | — | Human-readable display label |
| `description` | `TEXT` | Yes | `NULL` | Detailed explanation of the setting's operational impact |
| `unit` | `VARCHAR(30)` | Yes | `NULL` | Measurement unit (`km`, `PHP`, `%`, `seconds`, `units`, `days`) |
| `min_value` | `NUMERIC` | Yes | `NULL` | Optional lower numeric validation bound |
| `max_value` | `NUMERIC` | Yes | `NULL` | Optional upper numeric validation bound |
| `updated_by` | `UUID` | Yes | `FK -> users(id) ON DELETE SET NULL` | Last administrator who updated this setting |
| `created_at` | `TIMESTAMPTZ` | No | `DEFAULT NOW()` | Record creation timestamp |
| `updated_at` | `TIMESTAMPTZ` | No | `DEFAULT NOW()` | Record update timestamp |

### `schema_migrations`
Internal PostgreSQL migration tracking ledger managed by `database/scripts/migrate.js`.

| Column | Data Type | Nullable | Default / Constraints | Description |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `SERIAL` | No | `PRIMARY KEY` | Sequential migration execution ID |
| `filename` | `VARCHAR(255)` | No | `UNIQUE` | Executed SQL migration filename |
| `applied_at` | `TIMESTAMPTZ` | No | `DEFAULT CURRENT_TIMESTAMP` | Migration execution timestamp |
