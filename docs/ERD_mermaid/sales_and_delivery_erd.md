# Sales & Delivery Subsystem — Entity Relationship Diagram (ERD)

> **Module**: Sales & Delivery Subsystem  
> **Target Database**: PostgreSQL 18.x  
> **Status**: Phase 1 Implemented in Migration 015 (`015_sales_and_delivery_phase1.sql`) and Seed 008 (`008_sales_and_delivery_seed.sql`). Frontline transactional sales orders, line items, invoices, and append-only canister receivables ledger are established.

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
    %% EXTERNAL RELATIONSHIPS
    %% ==========================================
    SERVICE_ZONES ||--o{ CUSTOMERS : "locates"
    USERS ||--o{ CUSTOMERS : "registered_by"
    
    TRIPS ||--o{ SALES_TRANSACTIONS : "delivers"
    CUSTOMERS ||--o{ SALES_TRANSACTIONS : "purchases"
    USERS ||--o{ SALES_TRANSACTIONS : "recorded_by"
    USERS ||--o{ SALES_TRANSACTIONS : "cancelled_by"
    
    SALES_TRANSACTIONS ||--|{ SALES_TRANSACTION_ITEMS : "contains"
    PRODUCTS ||--o{ SALES_TRANSACTION_ITEMS : "catalog_item"
    
    SALES_TRANSACTIONS ||--|| SALES_INVOICES : "bills"
    USERS ||--o{ SALES_INVOICES : "verified_by"
    
    CUSTOMERS ||--o{ CANISTER_LEDGER : "owes_receivables"
    PRODUCTS ||--o{ CANISTER_LEDGER : "sku"
    TRIPS ||--o{ CANISTER_LEDGER : "trip_attribution"
    SALES_TRANSACTIONS ||--o{ CANISTER_LEDGER : "generates"

    %% ==========================================
    %% TABLES
    %% ==========================================

    CUSTOMERS {
        uuid id PK
        varchar customer_type "COMMERCIAL, RETAIL, RETAILER, WHOLESALE, HOUSEHOLD"
        varchar business_name "Nullable"
        varchar contact_person "NOT NULL"
        varchar contact_number "NOT NULL"
        varchar alternate_contact_number "Nullable"
        varchar tin "Nullable"
        text delivery_address "NOT NULL"
        uuid zone_id FK "service_zones(id)"
        boolean is_active "DEFAULT TRUE"
        uuid created_by FK "users(id)"
        timestamptz created_at
        timestamptz updated_at
    }

    SALES_TRANSACTIONS {
        uuid id PK
        varchar transaction_no UK "TX-<prefix>-XXXX"
        uuid trip_id FK "trips(id)"
        uuid customer_id FK "customers(id)"
        uuid recorded_by FK "users(id)"
        varchar status "COMPLETED, CANCELLED"
        text cancellation_reason "Nullable"
        uuid cancelled_by FK "users(id)"
        timestamptz cancelled_at "Nullable"
        timestamptz transacted_at "Mobile wall-clock"
        timestamptz synced_at "Server ingest"
        timestamptz created_at
        timestamptz updated_at
    }

    SALES_TRANSACTION_ITEMS {
        uuid id PK
        uuid transaction_id FK "sales_transactions(id) ON DELETE CASCADE"
        uuid product_id FK "products(id)"
        integer quantity_sold ">= 0"
        integer empties_returned ">= 0"
        integer empties_defective ">= 0"
        numeric unit_price_at_sale "Frozen snapshot"
        numeric subtotal_amount "Frozen snapshot"
        timestamptz created_at
    }

    SALES_INVOICES {
        uuid id PK
        uuid transaction_id FK,UK "sales_transactions(id) ON DELETE CASCADE"
        varchar invoice_number UK "INV-<prefix>-XXXX"
        varchar declaration_number "CD-<prefix>-XXXX"
        numeric total_amount ">= 0"
        varchar payment_method "CASH, GCASH"
        varchar payment_status "PAID_UNVERIFIED, VERIFIED"
        varchar payment_reference_number "Nullable"
        varchar payment_proof_key "Nullable"
        uuid verified_by FK "users(id)"
        timestamptz verified_at "Nullable"
        timestamptz transacted_at
        timestamptz synced_at
        timestamptz created_at
        timestamptz updated_at
    }

    CANISTER_LEDGER {
        uuid id PK
        uuid customer_id FK "customers(id)"
        uuid product_id FK "products(id)"
        uuid trip_id FK "trips(id)"
        uuid transaction_id FK "sales_transactions(id) ON DELETE CASCADE"
        integer quantity_loaned ">= 0"
        integer quantity_returned ">= 0"
        integer net_balance_change "loaned - returned"
        timestamptz transacted_at
        timestamptz synced_at
        timestamptz created_at
    }
```

---

## 2. Table Specifications

### `customers`
Stores customer master profiles and institutional accounts for LPG distribution, orders, and delivery dispatch.

| Column | Data Type | Nullable | Default / Constraints | Description |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `UUID` | No | `PRIMARY KEY DEFAULT gen_random_uuid()` | Unique customer identifier |
| `name` | `VARCHAR(255)` | No | Auto-synced via trigger | Legacy trade/full name for backward compatibility |
| `business_name` | `VARCHAR(150)` | Yes | — | Registered business/trade entity name |
| `contact_person` | `VARCHAR(100)` | No | Auto-synced from `name` | Primary contact name |
| `contact_number` | `VARCHAR(50)` | No | Standardized E.164 | Primary phone number |
| `alternate_contact_number` | `VARCHAR(30)` | Yes | Standardized E.164 | Secondary phone or landline |
| `tin` | `VARCHAR(30)` | Yes | — | Tax identification number |
| `address` | `TEXT` | No | Auto-synced via trigger | Legacy address column |
| `delivery_address` | `TEXT` | No | Auto-synced from `address` | Full delivery physical address |
| `customer_type` | `VARCHAR(30)` | No | `'COMMERCIAL'`, `'RETAIL'`, `'RETAILER'`, `'WHOLESALE'`, `'HOUSEHOLD'` | Account segment |
| `zone_id` | `UUID` | Yes | `REFERENCES service_zones(id)` | Assigned delivery route zone |
| `is_active` | `BOOLEAN` | No | `DEFAULT TRUE` | Soft-deactivation indicator |
| `created_by` | `UUID` | Yes | `REFERENCES users(id)` | User who registered the profile |
| `created_at` | `TIMESTAMPTZ` | No | `DEFAULT NOW()` | Record creation timestamp |
| `updated_at` | `TIMESTAMPTZ` | No | `DEFAULT NOW()` | Managed automatically via trigger |

---

### `sales_transactions`
Frontline delivery orders recorded in-field on the mobile register and synced idempotently.

| Column | Data Type | Nullable | Default / Constraints | Description |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `UUID` | No | `PRIMARY KEY DEFAULT gen_random_uuid()` | Client-generated or server UUID |
| `transaction_no` | `VARCHAR(50)` | No | `UNIQUE` | Human-readable sequential reference |
| `trip_id` | `UUID` | No | `REFERENCES trips(id)` | Trip attribution |
| `customer_id` | `UUID` | No | `REFERENCES customers(id)` | Purchasing customer |
| `recorded_by` | `UUID` | No | `REFERENCES users(id)` | Sales Agent who processed order |
| `status` | `VARCHAR(20)` | No | `DEFAULT 'COMPLETED'` (`'COMPLETED'`, `'CANCELLED'`) | Order status |
| `cancellation_reason`| `TEXT` | Yes | — | Audit reason for cancellation |
| `cancelled_by` | `UUID` | Yes | `REFERENCES users(id)` | Supervisor who voided the sale |
| `cancelled_at` | `TIMESTAMPTZ`| Yes | — | Timestamp of cancellation |
| `transacted_at` | `TIMESTAMPTZ`| No | Mobile wall-clock | Time recorded on mobile device |
| `synced_at` | `TIMESTAMPTZ`| No | `DEFAULT NOW()` | Server ingestion timestamp |
| `created_at` | `TIMESTAMPTZ`| No | `DEFAULT NOW()` | Server record timestamp |
| `updated_at` | `TIMESTAMPTZ`| No | `DEFAULT NOW()` | Update timestamp |

---

### `sales_transaction_items`
Individual product line items within a sales order with frozen catalog pricing.

| Column | Data Type | Nullable | Default / Constraints | Description |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `UUID` | No | `PRIMARY KEY DEFAULT gen_random_uuid()` | Line item identifier |
| `transaction_id` | `UUID` | No | `REFERENCES sales_transactions(id) ON DELETE CASCADE` | Parent transaction |
| `product_id` | `UUID` | No | `REFERENCES products(id)` | Catalog SKU |
| `quantity_sold` | `INTEGER` | No | `CHECK (quantity_sold >= 0)` | Number of full units sold |
| `empties_returned` | `INTEGER`| No | `DEFAULT 0 CHECK (empties_returned >= 0)` | Empty units swapped/returned |
| `empties_defective`| `INTEGER`| No | `DEFAULT 0 CHECK (empties_defective >= 0)`| Defective empty units |
| `unit_price_at_sale`|`NUMERIC(10,2)`| No | `CHECK (unit_price_at_sale >= 0)` | Frozen snapshot price per unit |
| `subtotal_amount` | `NUMERIC(12,2)`| No | `CHECK (subtotal_amount >= 0)` | Frozen total amount for line |
| `created_at` | `TIMESTAMPTZ`| No | `DEFAULT NOW()` | Creation timestamp |

---

### `sales_invoices`
Transactional invoices, customer declaration slips, and payment settlements.

| Column | Data Type | Nullable | Default / Constraints | Description |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `UUID` | No | `PRIMARY KEY DEFAULT gen_random_uuid()` | Unique invoice identifier |
| `transaction_id` | `UUID` | No | `UNIQUE REFERENCES sales_transactions(id) ON DELETE CASCADE` | 1-to-1 transaction link |
| `invoice_number` | `VARCHAR(50)` | No | `UNIQUE` | Sequential invoice series |
| `declaration_number`| `VARCHAR(50)`| No | Sequential declaration series | Cylinder declaration number |
| `total_amount` | `NUMERIC(12,2)`| No | `CHECK (total_amount >= 0)` | Total invoice price |
| `payment_method` | `VARCHAR(20)` | No | `'CASH'`, `'GCASH'` | Mode of payment |
| `payment_status` | `VARCHAR(20)` | No | `DEFAULT 'PAID_UNVERIFIED'` (`'PAID_UNVERIFIED'`, `'VERIFIED'`) | Verification state |
| `payment_reference_number`| `VARCHAR(100)`| Yes | — | GCash reference string |
| `payment_proof_key` | `VARCHAR(255)`| Yes | — | Media attachment key for receipt screenshot |
| `verified_by` | `UUID` | Yes | `REFERENCES users(id)` | Cashier/supervisor who verified payment |
| `verified_at` | `TIMESTAMPTZ` | Yes | — | Verification timestamp |
| `transacted_at` | `TIMESTAMPTZ` | No | Mobile wall-clock | Transaction time |
| `synced_at` | `TIMESTAMPTZ` | No | `DEFAULT NOW()` | Ingestion timestamp |
| `created_at` | `TIMESTAMPTZ` | No | `DEFAULT NOW()` | Record creation timestamp |
| `updated_at` | `TIMESTAMPTZ` | No | `DEFAULT NOW()` | Record update timestamp |

---

### `canister_ledger`
Append-only ledger tracking loaned canisters, customer cylinder debt, and returns per product SKU.

| Column | Data Type | Nullable | Default / Constraints | Description |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `UUID` | No | `PRIMARY KEY DEFAULT gen_random_uuid()` | Unique ledger entry identifier |
| `customer_id` | `UUID` | No | `REFERENCES customers(id)` | Debtor customer |
| `product_id` | `UUID` | No | `REFERENCES products(id)` | Product SKU |
| `trip_id` | `UUID` | No | `REFERENCES trips(id)` | Trip attribution for discrepancy reconciliation |
| `transaction_id` | `UUID` | No | `REFERENCES sales_transactions(id) ON DELETE CASCADE` | Originating sales order |
| `quantity_loaned` | `INTEGER` | No | `DEFAULT 0 CHECK (quantity_loaned >= 0)` | `GREATEST(0, sold - returned)` |
| `quantity_returned`| `INTEGER` | No | `DEFAULT 0 CHECK (quantity_returned >= 0)`| `GREATEST(0, returned - sold)` |
| `net_balance_change`|`INTEGER` | No | `CHECK (net_balance_change = quantity_loaned - quantity_returned)` | Signed delta |
| `transacted_at` | `TIMESTAMPTZ` | No | Mobile wall-clock | Ledger entry timestamp |
| `synced_at` | `TIMESTAMPTZ` | No | `DEFAULT NOW()` | Server ingestion timestamp |
| `created_at` | `TIMESTAMPTZ` | No | `DEFAULT NOW()` | Record creation timestamp |

---

## 3. Triggers & Automation

- **`trigger_sync_customer_profile`**: `BEFORE INSERT OR UPDATE` trigger on `customers` that synchronizes legacy `name`/`address` fields with modern `contact_person`/`business_name`/`delivery_address` fields.
- **`trigger_update_customers_updated_at`**: `BEFORE UPDATE` trigger on `customers` that automatically refreshes `updated_at`.
- **`trigger_update_sales_transactions_updated_at`**: `BEFORE UPDATE` trigger on `sales_transactions` that automatically refreshes `updated_at`.
- **`trigger_update_sales_invoices_updated_at`**: `BEFORE UPDATE` trigger on `sales_invoices` that automatically refreshes `updated_at`.
