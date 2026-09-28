# Sales & Delivery Subsystem — Entity Relationship Diagram (ERD)

> **Module**: Sales & Delivery Subsystem  
> **Target Database**: PostgreSQL 18.x  
> **Status**: Customer Profile Management is implemented in Migration 004 (`004_customers.sql`). Frontline transactional sales orders and customer cylinder debt ledgers are slated for the subsequent roadmap phase.

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
    %% customer_type_enum: 'RETAIL', 'COMMERCIAL', 'WHOLESALE'

    CUSTOMERS {
        uuid id PK
        string name "NOT NULL"
        string address "NOT NULL"
        string contact_number "NOT NULL"
        enum customer_type "customer_type_enum: RETAIL, COMMERCIAL, WHOLESALE"
        boolean is_active "DEFAULT TRUE"
        timestamptz created_at
        timestamptz updated_at
    }
```

---

## 2. Table Specifications

### `customers`
Stores customer master profiles and institutional accounts for LPG distribution, orders, and delivery dispatch.

| Column | Data Type | Nullable | Default / Constraints | Description |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `UUID` | No | `PRIMARY KEY DEFAULT gen_random_uuid()` | Unique customer identifier |
| `name` | `VARCHAR(255)` | No | Non-empty | Full name or business trade name of the customer |
| `address` | `TEXT` | No | Non-empty | Complete physical delivery address |
| `contact_number` | `VARCHAR(50)` | No | Non-empty | Mobile or landline contact number |
| `customer_type` | `customer_type_enum` | No | `'RETAIL'`, `'COMMERCIAL'`, `'WHOLESALE'` | Customer segment classification |
| `is_active` | `BOOLEAN` | No | `DEFAULT TRUE` | Soft-deactivation indicator |
| `created_at` | `TIMESTAMPTZ` | No | `DEFAULT NOW()` | Record creation timestamp |
| `updated_at` | `TIMESTAMPTZ` | No | `DEFAULT NOW()` | Managed automatically via trigger |

**Lookup Indexes:**
- `idx_customers_name`: Index on `customers(name)` for search lookups.
- `idx_customers_customer_type`: Index on `customers(customer_type)` for segmentation queries.
- `idx_customers_is_active`: Index on `customers(is_active)` for active filtering.

---

## 3. Triggers & Automation

- **`trigger_update_customers_updated_at`**: `BEFORE UPDATE` trigger on `customers` that executes `update_customers_updated_at_column()` to automatically maintain the `updated_at` timestamp.
