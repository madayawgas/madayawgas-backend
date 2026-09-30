# MadayawGas API Contract: Trip Subsystem

This document specifies the HTTP endpoints, payload structures, headers, authentication mechanics, RBAC permissions, and response schemas for Trip Lifecycles, Multi-Load Inventory Transfers, Single-Point Return Odometer Telemetry, and Post-Trip Stock Reconciliation.

---

## General Information

- **Base URL Path**: `/api/trips`
- **Request / Response Format**: `application/json`
- **Authentication**: Server-side session via HTTP-Only cookie (`mg_sid`).
- **Authorization**: Role-Based Access Control (RBAC).

---

## Permissions Summary

| Permission | Description | Allowed Roles (Default) |
| :--- | :--- | :--- |
| `route.view` | View all delivery trips, load manifests, and reconciliation records | Super Admin, Admin, Logistics Supervisor |
| `route.view_own` | View trips and load manifests assigned to the authenticated Sales Person | Sales Person |
| `route.manage` | Dispatch trips, cancel trips, record reloads/unloads, complete plant return, and settle stock reconciliation | Super Admin, Admin, Logistics Supervisor |

---

## Data Models & Database Schemas

### 1. `trips` Table
| Column | Type | Nullable | Constraints & Defaults | Description |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `UUID` | No | `PRIMARY KEY DEFAULT gen_random_uuid()` | Unique trip identifier |
| `schedule_id` | `UUID` | Yes | `REFERENCES truck_schedules(id)` | Scheduled assignment (nullable for ad-hoc) |
| `truck_id` | `UUID` | No | `REFERENCES vehicles(id)` | Physical delivery vehicle |
| `driver_id` | `UUID` | No | `REFERENCES users(id)` | Soft-bound Driver snapshot at dispatch |
| `sales_user_id` | `UUID` | No | `REFERENCES users(id)` | Authenticated cabin Sales Person snapshot |
| `zone_id` | `UUID` | No | `REFERENCES service_zones(id)` | Delivery route target zone |
| `dispatched_by` | `UUID` | Yes | `REFERENCES users(id)` | User authorizing vehicle departure |
| `return_odometer_log_id` | `UUID` | Yes | `REFERENCES vehicle_odometer_logs(id) UNIQUE` | Telemetry link to yard return check-in |
| `trip_number` | `VARCHAR(50)` | No | `UNIQUE` | Unique human-readable trip identifier |
| `status` | `trip_status` | No | `'PENDING'` \| `'IN_PROGRESS'` \| `'COMPLETED'` \| `'CANCELLED'` | Current operational state |
| `departure_time` | `TIMESTAMPTZ` | No | `DEFAULT CURRENT_TIMESTAMP` | Yard departure timestamp |
| `return_time` | `TIMESTAMPTZ` | Yes | Nullable | Yard return timestamp |
| `notes` | `TEXT` | Yes | Nullable | Trip dispatch & supervisor notes |

### 2. `trip_loads` Table
| Column | Type | Nullable | Constraints & Defaults | Description |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `UUID` | No | `PRIMARY KEY DEFAULT gen_random_uuid()` | Transfer slip UUID |
| `trip_id` | `UUID` | No | `REFERENCES trips(id) ON DELETE CASCADE` | Associated trip |
| `transfer_type` | `transfer_type` | No | `'DISPATCH_LOAD'` \| `'RETURN_UNLOAD'` | Direction of transfer |
| `slip_number` | `VARCHAR(50)` | No | `UNIQUE` | Physical transfer slip number |
| `recorded_by` | `UUID` | Yes | `REFERENCES users(id)` | Plant/logistics personnel |
| `recorded_at` | `TIMESTAMPTZ` | No | `DEFAULT CURRENT_TIMESTAMP` | Transfer timestamp |
| `remarks` | `TEXT` | Yes | Nullable | Remarks / special instructions |

### 3. `trip_load_items` Table
| Column | Type | Nullable | Constraints & Defaults | Description |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `UUID` | No | `PRIMARY KEY DEFAULT gen_random_uuid()` | Line item identifier |
| `load_id` | `UUID` | No | `REFERENCES trip_loads(id) ON DELETE CASCADE` | Parent transfer slip |
| `product_id` | `UUID` | No | `REFERENCES products(id)` | Catalog item reference |
| `condition` | `stock_condition` | No | `'FILLED'` \| `'EMPTY_GOOD'` \| `'DEFECTIVE'` | Physical canister condition |
| `quantity_units` | `INT` | No | `CHECK (quantity_units >= 0)` | Canonical item unit count |

### 4. `trip_stock_reconciliations` Table
| Column | Type | Nullable | Constraints & Defaults | Description |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `UUID` | No | `PRIMARY KEY DEFAULT gen_random_uuid()` | Unique reconciliation record |
| `trip_id` | `UUID` | No | `REFERENCES trips(id) UNIQUE ON DELETE CASCADE` | 1:1 Trip reference |
| `verified_by` | `UUID` | Yes | `REFERENCES users(id)` | Supervisor settling reconciliation |
| `total_loaded_full` | `INT` | No | `DEFAULT 0` | Aggregated filled units loaded (dispatches + reloads) |
| `total_sold_full` | `INT` | No | `DEFAULT 0` | Synchronized full units sold in cabin app |
| `total_returned_full` | `INT` | No | `DEFAULT 0` | Physical filled units returned to plant |
| `total_returned_empty_good` | `INT` | No | `DEFAULT 0` | Physical good empty canisters returned |
| `total_returned_defective` | `INT` | No | `DEFAULT 0` | Defective canisters returned |
| `net_customer_debt_created` | `INT` | No | `DEFAULT 0` | Net customer debt canisters created |
| `status` | `reconciliation_status`| No | `'AWAITING_SYNC'` \| `'SETTLED'` \| `'FLAGGED_VARIANCE'` | Post-trip audit settlement status |
| `supervisor_notes` | `TEXT` | Yes | Nullable | Discrepancy explanation or settlement audit note |
| `reconciled_at` | `TIMESTAMPTZ` | Yes | Nullable | Final settlement timestamp |

---

## Reconciliation Math & Formulas

$$\text{Full Discrepancy} = \text{Total Loaded Full} - \text{Total Sold Full} - \text{Total Returned Full}$$
$$\text{Empty Discrepancy} = \text{Total Sold Full} - (\text{Total Returned Empty Good} + \text{Net Customer Canister Debt Created})$$

- **`SETTLED`**: Both `Full Discrepancy === 0` AND `Empty Discrepancy === 0`.
- **`FLAGGED_VARIANCE`**: Either discrepancy is non-zero (missing cylinders or debt imbalance).
- **`AWAITING_SYNC`**: Offline mobile sales batch has not yet been processed.

---

## Endpoints

### 1. Dispatch Trip (`POST /api/trips/dispatch`)
Dispatches a delivery truck for a scheduled or ad-hoc run.
- **Permission**: `route.manage`
- **Request Body (Scheduled Run)**:
```json
{
  "scheduleId": "5c123456-7890-4abc-def1-234567890abc",
  "notes": "Morning departure manifest",
  "initialLoads": [
    { "productId": "1a234567-8901-4bcd-ef12-345678901bcd", "condition": "FILLED", "quantityUnits": 100 },
    { "productId": "2b345678-9012-4cde-f123-456789012cde", "condition": "FILLED", "quantityUnits": 20 }
  ]
}
```
- **Request Body (Ad-Hoc / Emergency Run)**:
```json
{
  "truckId": "4a123456-7890-4abc-def1-234567890abc",
  "salesUserId": "3c987654-3210-4cba-fed0-987654321cba",
  "driverId": "8f123456-7890-4abc-def1-234567890abc",
  "zoneId": "7b8f9e6a-5432-41a9-83bc-9d0e12345678",
  "notes": "Emergency hospital supply run"
}
```

---

### 2. Multi-Load Inventory Transfer (`POST /api/trips/:id/loads`)
Records a midday stock reload or evening unload manifest slip.
- **Permission**: `route.manage`
- **Request Body**:
```json
{
  "transferType": "DISPATCH_LOAD",
  "remarks": "Midday plant reload slip",
  "items": [
    { "productId": "1a234567-8901-4bcd-ef12-345678901bcd", "condition": "FILLED", "quantityUnits": 40 }
  ]
}
```

---

### 3. Plant Return Check-In (`POST /api/trips/:id/complete`)
Completes a trip upon return to plant:
- Verifies return odometer reading monotonically (`returnOdometerKm >= current_odometer`).
- Automatically evaluates distance driven toward 5,000-km PM threshold.
- Records physical return unload slip if `returnLoads` provided.
- Initializes reconciliation record in `AWAITING_SYNC` status.
- **Permission**: `route.manage`
- **Request Body**:
```json
{
  "returnOdometerKm": 45450,
  "supervisorNotes": "Trip completed on schedule, vehicle clean",
  "returnLoads": [
    { "productId": "1a234567-8901-4bcd-ef12-345678901bcd", "condition": "FILLED", "quantityUnits": 20 },
    { "productId": "1a234567-8901-4bcd-ef12-345678901bcd", "condition": "EMPTY_GOOD", "quantityUnits": 75 },
    { "productId": "1a234567-8901-4bcd-ef12-345678901bcd", "condition": "DEFECTIVE", "quantityUnits": 5 }
  ]
}
```

---

### 4. Post-Trip Stock Reconciliation (`POST /api/trips/:id/reconcile`)
Calculates inventory variance against synchronized offline sales and customer debt.
- **Permission**: `route.manage`
- **Request Body**:
```json
{
  "totalSoldFull": 80,
  "netCustomerDebtCreated": 5,
  "supervisorNotes": "Balanced return verified against driver receipts"
}
```
- **Response**: `200 OK`
```json
{
  "status": "success",
  "data": {
    "reconciliation": {
      "tripId": "9e123456-7890-4abc-def1-234567890abc",
      "tripNumber": "TRIP-20261006-A1B2",
      "status": "SETTLED",
      "totalLoadedFull": 100,
      "totalSoldFull": 80,
      "totalReturnedFull": 20,
      "totalReturnedEmptyGood": 75,
      "totalReturnedDefective": 5,
      "netCustomerDebtCreated": 5,
      "fullDiscrepancy": 0,
      "emptyDiscrepancy": 0,
      "isSettled": true,
      "reconciledAt": "2026-10-06T17:30:00.000Z"
    }
  }
}
```
