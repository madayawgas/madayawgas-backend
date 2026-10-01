# API Contract: Plant Inventory & Route Reconciliation Engine

> **Subsystem**: Inventory Management  
> **Base Path**: `/api/inventory`  
> **Primary Roles**: Plant Supervisor (`plant_user`), Super Admin, Admin, Logistics Supervisor, Sales Person (Cabin View)  
> **Authentication**: Stateful session cookie (`mg_sid`), `HttpOnly`, `SameSite=Lax`.

---

## 1. Overview & Operational Principles

1. **Discrete Unit Storage**: All inventory in `plant_inventory`, transfer items, and reconciliations are stored strictly as discrete integer unit counts (`quantity_units INT`). Crate values ($1\text{ crate} = 24\text{ canisters}$) are computed on demand for presentation.
2. **Catalog Scope**: Butane Canister 170g, Butane Canister 250g, 11kg LPG Cylinder, 22kg LPG Cylinder, 50kg LPG Cylinder.
3. **Atomic Multi-Load Dispatch**: Dispatch loads atomically verify and deduct `quantity_filled` from plant bulk stock. Trucks support multiple midday reload events per trip (`DISPATCH_LOAD`).
4. **Physical Return Unload**: Returns replenish plant stock across three distinct condition buckets: `FILLED` (unsold), `EMPTY_GOOD` (customer returns), and `DEFECTIVE` (mid-route leaks/damage).
5. **Reconciliation Engine**: Reconciles loaded units against mobile sales, returns, defective allowances, and customer debts per SKU. Discrepancies equal to 0 transition to `SETTLED`; non-zero discrepancies transition to `FLAGGED_VARIANCE`. If offline sales batches are pending ingestion, status is `AWAITING_SYNC`.

---

## 2. Endpoints Matrix

| Method | Endpoint | Guard / Permissions | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/inventory/plant` | `inventory.view`, `inventory.manage` | Master Bunawan yard stock overview across all active products |
| `POST` | `/api/inventory/plant/restock` | `inventory.manage` | Supplier bulk shipment stock-in (increments plant stock) |
| `POST` | `/api/inventory/plant/quarantine-defects` | `inventory.manage` | Quarantines yard leakers/defective stock into defective bucket |
| `GET` | `/api/inventory/plant/adjustments` | `inventory.view`, `inventory.manage` | Historical plant stock adjustments audit log |
| `GET` | `/api/inventory/plant/suggested-split` | `inventory.view`, `inventory.manage` | Equal truck loading split suggestion helper |
| `POST` | `/api/inventory/trips/:tripId/dispatch-load` | `inventory.manage`, `route.manage` | Staging/dispatch load or midday reload (deducts plant stock) |
| `POST` | `/api/inventory/trips/:tripId/return-unload` | `inventory.manage`, `route.manage` | Post-dispatch physical return unload manifest |
| `GET` | `/api/inventory/trips/:tripId/transfers` | `inventory.view`, `route.view` | Retrieves all multi-load and return transfer slips for a trip |
| `GET` | `/api/inventory/trips/:tripId/stock` | `inventory.view`, `inventory.view_own`, `route.view_own` | Cabin visibility: Current on-board unit balance per product |
| `POST` | `/api/inventory/trips/:tripId/reconcile` | `inventory.manage`, `route.manage` | Evaluates post-trip reconciliation math per SKU & settles trip |
| `GET` | `/api/inventory/trips/:tripId/reconciliation` | `inventory.view`, `route.view` | Retrieves trip reconciliation report and per-SKU variance breakdown |

---

## 3. Endpoint Specifications

### 3.1 Master Plant Bulk Inventory Overview
- **`GET /api/inventory/plant`**
- **Response `200 OK`**:
```json
{
  "status": "success",
  "data": {
    "count": 3,
    "inventory": [
      {
        "productId": "8f517e0c-1213-46eb-a128-48b3b875374b",
        "productName": "Butane Canister 170g",
        "category": "Canister",
        "containerType": "CANISTER",
        "netWeightKg": 0.17,
        "quantityFilled": 2400,
        "cratesFilled": 100,
        "quantityEmptyGood": 480,
        "cratesEmptyGood": 20,
        "quantityDefective": 24,
        "cratesDefective": 1,
        "lastCountedAt": "2026-10-01T06:00:00.000Z",
        "updatedAt": "2026-10-01T06:00:00.000Z"
      }
    ]
  }
}
```

### 3.2 Supplier Bulk Restock
- **`POST /api/inventory/plant/restock`**
- **Request Body**:
```json
{
  "productId": "8f517e0c-1213-46eb-a128-48b3b875374b",
  "condition": "FILLED",
  "quantityUnits": 2400,
  "supplierInvoiceNumber": "INV-SUP-2026-100",
  "reason": "Direct factory delivery from manufacturer"
}
```
- **Response `201 Created`**:
```json
{
  "status": "success",
  "message": "Supplier restock of 2400 units recorded successfully",
  "data": {
    "stock": { ... },
    "adjustment": { ... }
  }
}
```

### 3.3 Quarantine Yard Defects
- **`POST /api/inventory/plant/quarantine-defects`**
- **Request Body**:
```json
{
  "productId": "8f517e0c-1213-46eb-a128-48b3b875374b",
  "sourceCondition": "FILLED",
  "quantityUnits": 20,
  "reason": "Damaged valves identified during quality inspection"
}
```
- **Response `200 OK`**:
```json
{
  "status": "success",
  "message": "Quarantined 20 units to defective inventory",
  "data": {
    "stock": { ... },
    "adjustment": { ... }
  }
}
```

### 3.4 Suggested Equal Loading Split Helper
- **`GET /api/inventory/plant/suggested-split?productId=:id&activeTripCount=4`**
- **Response `200 OK`**:
```json
{
  "status": "success",
  "data": {
    "productId": "8f517e0c-1213-46eb-a128-48b3b875374b",
    "productName": "Butane Canister 170g",
    "totalAvailableFilledUnits": 2400,
    "activeTripCount": 4,
    "suggestedUnitsPerTruck": 600,
    "suggestedCratesPerTruck": 25,
    "remainingUnits": 0
  }
}
```

### 3.5 Dispatch Load & Midday Reload
- **`POST /api/inventory/trips/:tripId/dispatch-load`**
- **Request Body**:
```json
{
  "remarks": "Morning dispatch load manifest",
  "items": [
    { "productId": "8f517e0c-1213-46eb-a128-48b3b875374b", "quantityUnits": 120 },
    { "productId": "e77d7037-9ec4-4996-80f6-83e0ac424c33", "quantityUnits": 40 }
  ]
}
```
- **Response `201 Created`**:
```json
{
  "status": "success",
  "message": "Dispatch load manifest recorded and plant stock deducted",
  "data": {
    "load": {
      "id": "uuid",
      "trip_id": "uuid",
      "transfer_type": "DISPATCH_LOAD",
      "slip_number": "LOAD-20261001-A1B2C3",
      "items": [ ... ]
    }
  }
}
```

### 3.6 Post-Dispatch Physical Return Unload
- **`POST /api/inventory/trips/:tripId/return-unload`**
- **Request Body**:
```json
{
  "remarks": "Evening return physical count",
  "items": [
    { "productId": "8f517e0c-1213-46eb-a128-48b3b875374b", "condition": "FILLED", "quantityUnits": 20 },
    { "productId": "8f517e0c-1213-46eb-a128-48b3b875374b", "condition": "EMPTY_GOOD", "quantityUnits": 95 },
    { "productId": "8f517e0c-1213-46eb-a128-48b3b875374b", "condition": "DEFECTIVE", "quantityUnits": 5 }
  ]
}
```
- **Response `201 Created`**:
```json
{
  "status": "success",
  "message": "Return unload manifest recorded and plant stock updated",
  "data": {
    "unload": {
      "id": "uuid",
      "trip_id": "uuid",
      "transfer_type": "RETURN_UNLOAD",
      "slip_number": "UNLOAD-20261001-D4E5F6",
      "items": [ ... ]
    }
  }
}
```

### 3.7 Cabin Vehicle Active Stock Visibility
- **`GET /api/inventory/trips/:tripId/stock`**
- Scoped to assigned sales personnel or supervisors with `inventory.view`.
- **Response `200 OK`**:
```json
{
  "status": "success",
  "data": {
    "tripId": "uuid",
    "tripNumber": "TRIP-20261001-001",
    "truckPlateNumber": "ABC-1234",
    "status": "IN_PROGRESS",
    "items": [
      {
        "productId": "8f517e0c-1213-46eb-a128-48b3b875374b",
        "productName": "Butane Canister 170g",
        "category": "Canister",
        "containerType": "CANISTER",
        "netWeightKg": 0.17,
        "loadedFull": 120,
        "returnedFull": 20,
        "returnedEmptyGood": 95,
        "returnedDefective": 5,
        "currentOnBoardFull": 100,
        "cratesOnBoardFull": 4
      }
    ]
  }
}
```

### 3.8 Post-Trip Multi-SKU Reconciliation Engine
- **`POST /api/inventory/trips/:tripId/reconcile`**
- Reconciles math per product:
  $$\text{fullDiscrepancy} = \text{totalLoadedFull} - \text{totalSoldFull} - \text{totalReturnedFull} - \text{totalReturnedDefective}$$
  $$\text{emptyDiscrepancy} = \text{totalSoldFull} - (\text{totalReturnedEmptyGood} + \text{netCustomerDebtCreated})$$
- **Request Body**:
```json
{
  "syncCompleted": true,
  "supervisorNotes": "Evening count verified against physical yard return",
  "salesData": [
    {
      "productId": "8f517e0c-1213-46eb-a128-48b3b875374b",
      "soldFull": 95,
      "netCustomerDebtCreated": 0
    }
  ]
}
```
- **Response `200 OK`**:
```json
{
  "status": "success",
  "message": "Trip stock reconciliation completed with status 'SETTLED'",
  "data": {
    "reconciliation": {
      "id": "uuid",
      "tripId": "uuid",
      "status": "SETTLED",
      "isSettled": true,
      "fullDiscrepancy": 0,
      "emptyDiscrepancy": 0,
      "totalLoadedFull": 120,
      "totalSoldFull": 95,
      "totalReturnedFull": 20,
      "totalReturnedEmptyGood": 95,
      "totalReturnedDefective": 5,
      "netCustomerDebtCreated": 0,
      "reconciliationData": [
        {
          "productId": "8f517e0c-1213-46eb-a128-48b3b875374b",
          "productName": "Butane Canister 170g",
          "loadedFull": 120,
          "soldFull": 95,
          "returnedFull": 20,
          "returnedEmptyGood": 95,
          "returnedDefective": 5,
          "netCustomerDebtCreated": 0,
          "fullDiscrepancy": 0,
          "emptyDiscrepancy": 0,
          "isSettled": true
        }
      ],
      "supervisorNotes": "Evening count verified against physical yard return",
      "reconciledAt": "2026-10-01T10:00:00.000Z"
    }
  }
}
```
