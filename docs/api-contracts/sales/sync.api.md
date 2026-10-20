# Sales Sync — Batch Ingestion API Contract

**Endpoint:** `POST /api/sales/sync-batch`  
**Authentication:** Session cookie (`mg_sid`) or `Authorization: Bearer <token>`  
**Permissions:** `sales.create` OR `sales.view_own`  
**Content-Type:** `application/json`

---

## Overview

The batch sync endpoint is the offline-first ingestion gateway for the frontline mobile register. It is designed around three core principles:

1. **Itemized / Partial-Success Ingestion** — Each transaction in the payload is committed in its own isolated database transaction. One bad order never rolls back the surrounding valid orders (eliminates Head-of-Line blocking).
2. **Cellular Radio Efficiency** — Multiple pending orders are packaged in a single HTTP round trip, preventing the high-power radio tail-state cycling that blasting 20–50 individual requests would cause.
3. **Complete Idempotency Acknowledgment** — Previously synced orders (already present in PostgreSQL via UUID or transaction number) are counted under `ignoredCount` and their IDs are included in `syncedTransactionIds` so the mobile SQLite queue can safely purge them.

---

## Request Payload

```json
{
  "tripId": "b8a8b1b0-1e5b-4c0e-9b9a-1f8a7e4b5c6d",
  "customers": [
    {
      "id": "c1a2b3c4-0000-4000-a000-000000000001",
      "businessName": "Aling Nena Sari-Sari Store",
      "contactPerson": "Nena Santos",
      "contactNumber": "+639171112222",
      "deliveryAddress": "Poblacion, Toril, Davao City",
      "customerType": "RETAILER"
    }
  ],
  "transactions": [
    {
      "id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
      "transactionNo": "ORD-20261019-001",
      "customerId": "c1a2b3c4-0000-4000-a000-000000000001",
      "transactedAt": "2026-10-19T08:30:00.000Z",
      "items": [
        {
          "id": "a1b2c3d4-0001-4000-a000-000000000001",
          "productId": "e1f2a3b4-5555-4444-3333-222211110000",
          "quantitySold": 5,
          "emptiesReturned": 5,
          "emptiesDefective": 0,
          "unitPriceAtSale": 125.00,
          "subtotalAmount": 625.00
        }
      ],
      "invoice": {
        "id": "i1b2c3d4-0001-4000-a000-000000000001",
        "invoiceNumber": "INV-20261019-001",
        "declarationNumber": "CD-20261019-001",
        "totalAmount": 625.00,
        "paymentMethod": "CASH",
        "paymentStatus": "PAID_UNVERIFIED"
      }
    }
  ]
}
```

### Field Reference

| Field | Type | Required | Notes |
| :--- | :--- | :--- | :--- |
| `tripId` | `string (UUID)` | ✅ Required | Must reference an existing, active trip. |
| `customers` | `array` | ❌ Optional | Offline-created customer profiles to pre-register before processing transactions. Each entry is isolated — one bad customer never blocks valid inserts. |
| `customers[].id` | `string (UUID)` | Recommended | Client-generated UUIDv4. If omitted, server generates one (response cannot map it back). |
| `customers[].businessName` | `string` | Optional | Business / store name. |
| `customers[].contactPerson` | `string` | Optional | Primary contact. Falls back to `businessName` if omitted. |
| `customers[].contactNumber` | `string` | Optional | E.164-formatted Philippine mobile number. |
| `customers[].deliveryAddress` | `string` | Optional | Full delivery address. |
| `customers[].customerType` | `string` | Optional | `COMMERCIAL` \| `RETAILER` \| `RETAIL` \| `WHOLESALE` \| `HOUSEHOLD`. Defaults to `COMMERCIAL`. |
| `customers[].zoneId` | `string (UUID)` | Optional | Service zone assignment. |
| `transactions` | `array` | ✅ Required | Can be empty `[]`. Must be a JSON array. |
| `transactions[].id` | `string (UUID)` | Recommended | Client-generated UUIDv4 for idempotency. If omitted, server generates one. |
| `transactions[].transactionNo` | `string` | ✅ Required | Unique order reference number (e.g., `ORD-20261019-001`). |
| `transactions[].customerId` | `string (UUID)` | ✅ Required | Must reference a valid customer in the master database. |
| `transactions[].transactedAt` | `string (ISO 8601)` | Optional | Device-local sale timestamp (offline clock). Defaults to server time if omitted. |
| `transactions[].items` | `array` | Optional | Line item SKUs. Empty array is accepted (zero-sale pickup stop). |
| `transactions[].items[].id` | `string (UUID)` | Recommended | Client-generated UUID. |
| `transactions[].items[].productId` | `string (UUID)` | ✅ Required | Must reference an existing active product in the catalog. |
| `transactions[].items[].quantitySold` | `integer` | ✅ Required | Units sold (`>= 0`). |
| `transactions[].items[].emptiesReturned` | `integer` | Optional | Canister shells returned (`>= 0`). Defaults to `0`. |
| `transactions[].items[].emptiesDefective` | `integer` | Optional | Defective returns (`>= 0`). Defaults to `0`. |
| `transactions[].items[].unitPriceAtSale` | `number` | ✅ Required | Frozen per-unit price at time of sale. |
| `transactions[].items[].subtotalAmount` | `number` | Optional | Pre-computed line total. Falls back to `quantitySold × unitPriceAtSale`. |
| `transactions[].invoice` | `object` | Optional | Payment settlement record. |
| `transactions[].invoice.id` | `string (UUID)` | Recommended | Client-generated UUID. |
| `transactions[].invoice.invoiceNumber` | `string` | Optional | Defaults to `INV-{transactionNo}`. |
| `transactions[].invoice.declarationNumber` | `string` | Optional | Defaults to `CD-{transactionNo}`. |
| `transactions[].invoice.totalAmount` | `number` | ✅ Required | Grand total amount. |
| `transactions[].invoice.paymentMethod` | `string` | ✅ Required | `CASH` \| `GCASH` |
| `transactions[].invoice.paymentStatus` | `string` | Optional | `PAID_UNVERIFIED` \| `VERIFIED`. Defaults to `PAID_UNVERIFIED`. |
| `transactions[].invoice.paymentReferenceNumber` | `string` | Optional | GCash reference number. |
| `transactions[].invoice.paymentProofKey` | `string` | Optional | Storage key from `/api/media/upload`. |

---

## Response Schemas

### HTTP 200 — Full Success (`status: "success"`)
All transactions committed; zero failures.

```json
{
  "status": "success",
  "data": {
    "tripId": "b8a8b1b0-1e5b-4c0e-9b9a-1f8a7e4b5c6d",
    "summary": {
      "totalSubmitted": 3,
      "processed": 3,
      "ignored": 0,
      "failed": 0
    },
    "processedCount": 3,
    "ignoredCount": 0,
    "failedCount": 0,
    "totalTransactions": 3,
    "syncedTransactionIds": [
      "f47ac10b-58cc-4372-a567-0e02b2c3d479",
      "a1b2c3d4-0001-4000-a000-000000000001",
      "b2c3d4e5-0002-4000-b000-000000000002"
    ],
    "ignoredTransactionIds": [],
    "transactionIds": [
      "f47ac10b-58cc-4372-a567-0e02b2c3d479",
      "a1b2c3d4-0001-4000-a000-000000000001",
      "b2c3d4e5-0002-4000-b000-000000000002"
    ],
    "syncedCustomerIds": [],
    "failedTransactions": [],
    "failedCustomers": []
  }
}
```

---

### HTTP 200 — Partial Success (`status: "partial_success"`)
Some transactions committed, some failed. Mobile client should quarantine the failed items.

```json
{
  "status": "partial_success",
  "data": {
    "tripId": "b8a8b1b0-1e5b-4c0e-9b9a-1f8a7e4b5c6d",
    "summary": {
      "totalSubmitted": 3,
      "processed": 2,
      "ignored": 0,
      "failed": 1
    },
    "processedCount": 2,
    "ignoredCount": 0,
    "failedCount": 1,
    "totalTransactions": 2,
    "syncedTransactionIds": [
      "f47ac10b-58cc-4372-a567-0e02b2c3d479",
      "a1b2c3d4-0001-4000-a000-000000000001"
    ],
    "ignoredTransactionIds": [],
    "transactionIds": [
      "f47ac10b-58cc-4372-a567-0e02b2c3d479",
      "a1b2c3d4-0001-4000-a000-000000000001"
    ],
    "syncedCustomerIds": ["c1a2b3c4-0000-4000-a000-000000000001"],
    "failedTransactions": [
      {
        "id": "e88ac10b-58cc-4372-a567-0e02b2c3d999",
        "transactionNo": "ORD-20261019-003",
        "errorCode": "INVALID_ITEM_PAYLOAD",
        "errorMessage": "Product UUID does not exist in the product catalog",
        "details": "Transaction #ORD-20261019-003: violates foreign key constraint on product_id"
      }
    ],
    "failedCustomers": []
  }
}
```

---

### HTTP 200 — All Failed (`status: "fail"`)
Every transaction in the batch failed validation or DB constraints. No orders were committed.

```json
{
  "status": "fail",
  "data": {
    "tripId": "b8a8b1b0-1e5b-4c0e-9b9a-1f8a7e4b5c6d",
    "summary": {
      "totalSubmitted": 1,
      "processed": 0,
      "ignored": 0,
      "failed": 1
    },
    "processedCount": 0,
    "ignoredCount": 0,
    "failedCount": 1,
    "totalTransactions": 0,
    "syncedTransactionIds": [],
    "ignoredTransactionIds": [],
    "transactionIds": [],
    "syncedCustomerIds": [],
    "failedTransactions": [
      {
        "id": "e88ac10b-58cc-4372-a567-0e02b2c3d999",
        "transactionNo": "ORD-20261019-003",
        "errorCode": "INVALID_CUSTOMER_ID",
        "errorMessage": "Customer UUID does not exist in the master customer database",
        "details": "Transaction #ORD-20261019-003: violates foreign key constraint on customer_id"
      }
    ],
    "failedCustomers": []
  }
}
```

---

### HTTP 400 — Batch-Level Fatal Error
Reserved for malformed batch structure — missing/invalid `tripId`, non-array `transactions`, etc.

```json
{
  "status": "fail",
  "message": "Trip ID is required"
}
```

### HTTP 404 — Trip Not Found

```json
{
  "status": "fail",
  "message": "Trip not found"
}
```

### HTTP 401 — Unauthenticated

```json
{
  "status": "fail",
  "message": "Authentication required"
}
```

### HTTP 403 — Unauthorized Role

```json
{
  "status": "fail",
  "message": "Insufficient permissions"
}
```

---

## Standardized Sync Error Codes

| `errorCode` | Root Cause | Mobile Client Action |
| :--- | :--- | :--- |
| `INVALID_TRANSACTION_HEADER` | Missing transaction number or customer ID | **Quarantine immediately** — cannot retry without edit. Show "Incomplete Order" banner. |
| `INVALID_CUSTOMER_ID` | `customerId` UUID does not exist in database | **Quarantine immediately** — show "Unknown Customer" alert. Supervisor must resolve. |
| `INVALID_ITEM_PAYLOAD` | Missing `productId`, unknown product UUID, or negative quantity violating DB `CHECK` | **Quarantine immediately** — show "Invalid Item SKU". Prompt agent to re-enter. |
| `INVALID_INVOICE_PAYLOAD` | `paymentMethod` not in `(CASH, GCASH)`, or negative `totalAmount` | **Quarantine immediately** — prompt correction of payment method on device. |
| `CANISTER_LEDGER_ERROR` | `net_balance_change ≠ quantity_loaned − quantity_returned` arithmetic check | **Quarantine immediately** — recalculate canister deltas on device before retrying. |
| `DUPLICATE_ORDER_CONFLICT` | `transaction_no` already exists under a **different** UUID | **Quarantine** — requires supervisor review for duplicate receipt. Do not auto-retry. |
| `DB_CONSTRAINT_ERROR` | Unexpected transient database failure | Increment `retry_count`; **quarantine after 3 consecutive failures**. |

---

## Mobile Sync State Machine

### UI State Binding Matrix

| UI State | Sync Queue Signal | Badge Color | Operational Action Required |
| :--- | :--- | :--- | :--- |
| **Online / All Synced** | `pendingCount === 0 && quarantinedCount === 0` | 🟢 Green | None. Dock reconciliation fully unblocked. |
| **Syncing** | `isSyncing === true` | 🟡 Amber | Network request in-flight. No action. |
| **Offline / Pending** | `isSyncing === false && pendingCount > 0` | 🟡 Amber | Waiting for connectivity. No action. |
| **Attention Required** | `quarantinedCount > 0` | 🔴 Red | Tap banner to open Quarantine Triage (Edit & Resubmit or Void). |

### Mobile Queue Processing Rules
1. **On `200 success`:** Mark all transactions in `syncedTransactionIds` as `SYNCED`. Remove from SQLite outbound queue.
2. **On `200 partial_success`:** Mark `syncedTransactionIds` entries as `SYNCED`. Mark each entry in `failedTransactions` as `QUARANTINED` (or increment `retry_count` for `DB_CONSTRAINT_ERROR` codes). Block quarantined items from future automatic batch sweeps.
3. **On `200 fail`:** All items failed — handle each `failedTransactions` entry per error code rules above.
4. **On `400` / `404` (batch-level fatal):** Do not remove any items from the queue. Log the error; escalate to supervisor if persists.
5. **On network error / timeout (no HTTP response):** Items remain `PENDING`. The next heartbeat or network-reconnect event re-triggers the sync sweep. Previously committed items will be acknowledged idempotently on re-submission (their IDs will appear in `syncedTransactionIds`).

---

## Idempotency Invariants

- **UUIDv4 Client Generation:** All UUIDs (`id` for transactions, items, invoices, ledger entries) must be generated on-device using `crypto.randomUUID()` or equivalent before the order is recorded offline. This enables safe resubmission across network failures.
- **Already-Synced Acknowledgment:** If the server detects a previously committed transaction by `id` OR `transaction_no`, it will include the UUID in both `syncedTransactionIds` and `ignoredTransactionIds`, without re-inserting any rows.
- **Customer Upsert:** Customer records submitted in the `customers[]` array are inserted with `ON CONFLICT (id) DO NOTHING`, making repeated submissions safe.

---

## WebSocket Event: `SALES_BATCH_SYNCED`

Emitted on `room:sales` when `processedCount > 0 || ignoredCount > 0`.

```json
{
  "event": "SALES_BATCH_SYNCED",
  "data": {
    "tripId": "b8a8b1b0-1e5b-4c0e-9b9a-1f8a7e4b5c6d",
    "tripNumber": "TRIP-20261019-001",
    "processedCount": 2,
    "ignoredCount": 0,
    "failedCount": 1,
    "syncedAt": "2026-10-19T09:15:32.000Z"
  }
}
```

**Client Invalidation on this event:** Invalidate `['sales-shift-summary']`, `['sales-transactions']`.
