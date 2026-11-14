# Sales & Delivery — Transactions & Analytics API Contract

> **Subsystem**: Sales & Delivery  
> **Base Paths**: `/api/sales/transactions`, `/api/sales`  
> **Authentication**: Required (`mg_sid` cookie or `Authorization: Bearer <token>`)

---

## 1. Permissions Matrix

| Permission | Scope / Capability |
| :--- | :--- |
| `sales.view` | Global view of all sales transactions, overview analytics, trip performance, and shift summaries |
| `sales.view_own` | Scoped view of transactions and analytics recorded by the authenticated user |
| `dashboard.view` | Global access to `/api/sales/overview` and `/api/sales/analytics` |
| `sales.delete` | Cancel/void completed sales transactions (`PATCH /api/sales/transactions/:id/cancel`) |

---

## 2. Endpoints

### 2.1 List Sales Transactions
- **Method & URL**: `GET /api/sales/transactions`
- **Permissions**: `sales.view` or `sales.view_own`
- **Query Parameters**:
  - `tripId` (UUID, optional)
  - `customerId` (UUID, optional)
  - `status` (`COMPLETED` | `CANCELLED`, optional)
  - `paymentMethod` (`CASH` | `GCASH`, optional)
  - `startDate` / `endDate` (ISO 8601, optional)
  - `search` (string, optional — matches transaction number or customer)
  - `page`, `limit`, `pageSize`, `sortBy`, `sortOrder` (opt-in pagination)
- **Response (`200 OK`)**: Returns paginated envelope (`data: [...]`, `meta`) when `page`/`limit` is passed, or `{ status: 'success', data: { count, transactions } }`.

---

### 2.2 Get Single Transaction Details
- **Method & URL**: `GET /api/sales/transactions/:id`
- **Permissions**: `sales.view` or `sales.view_own`
- **Response (`200 OK`)**:
  ```json
  {
    "status": "success",
    "data": {
      "transaction": {
        "id": "uuid",
        "transaction_no": "TX-...",
        "trip_id": "uuid",
        "customer_id": "uuid",
        "status": "COMPLETED",
        "items": [],
        "invoice": {}
      }
    }
  }
  ```

---

### 2.3 Cancel / Void Sales Transaction
- **Method & URL**: `PATCH /api/sales/transactions/:id/cancel`
- **Permissions**: `sales.delete`
- **Request Body**:
  ```json
  {
    "reason": "Customer returned sealed cylinder due to wrong size"
  }
  ```
- **Side Effects**: Marks transaction `CANCELLED`, cleans associated `canister_ledger` entries, records `SALES_TRANSACTION_CANCELLED` in `history_logs`, and emits `SALES_TRANSACTION_CANCELLED` to `room:sales` and `room:inventory`.
- **Response (`200 OK`)**: `{ status: 'success', message: 'Transaction successfully cancelled', data: { transaction } }`

---

### 2.4 Sales Overview & Analytics
- **Method & URL**:
  - `GET /api/sales/overview`
  - `GET /api/sales/analytics`
- **Permissions**: `sales.view`, `sales.view_own`, or `dashboard.view`
- **Query Parameters**:
  - `startDate` / `start_date` (ISO 8601, optional)
  - `endDate` / `end_date` (ISO 8601, optional)
  - `timeframe` (`daily` | `weekly` | `monthly` | `annually`, default `monthly`)
  - `tripId` / `trip_id` (UUID, optional)
  - `truckId` / `truck_id` (UUID, optional)
- **Response (`200 OK`)**:
  ```json
  {
    "status": "success",
    "data": {
      "summary": {
        "totalGrossSales": 125000,
        "totalTransactions": 140,
        "completedTransactions": 138,
        "cancelledTransactions": 2,
        "totalUnitsSold": 320,
        "canisterUnitsSold": 200,
        "cylinderUnitsSold": 120,
        "averageOrderValue": 905.8,
        "totalEmptiesReturned": 280,
        "totalEmptiesDefective": 4,
        "netCanisterDebtCreated": 12
      },
      "productBreakdown": [],
      "paymentBreakdown": {
        "cash": { "totalAmount": 90000, "count": 100, "percentage": 72.0 },
        "gcash": { "totalAmount": 35000, "count": 38, "unverifiedCount": 3, "verifiedCount": 35, "percentage": 28.0 }
      },
      "salesTrends": [],
      "weekly": [],
      "monthly": [],
      "annually": []
    }
  }
  ```

---

### 2.5 Operational Delivery Trip Performance
- **Method & URL**: `GET /api/sales/trip-performance`
- **Permissions**: `sales.view` or `sales.view_own`
- **Query Parameters**: `startDate`, `endDate`, `truckId`, `status`, `search`, plus opt-in pagination (`page`, `limit`).
- **Response (`200 OK`)**: Returns paginated envelope or `{ status: 'success', data: { count, trips } }`.

---

### 2.6 Shift Closeout Remittance Summary
- **Method & URL**: `GET /api/sales/trips/:tripId/shift-summary`
- **Permissions**: `sales.view` or `sales.view_own`
- **Response (`200 OK`)**: Returns `{ status: 'success', data: summary }` containing cash/GCash revenue totals, resolved `paymentProofUrl`s, and empties aggregation for the trip.
