# Real-Time WebSocket API Contracts & Event Specifications

> **Protocol:** WebSockets (`ws://`, `wss://`) over Socket.IO v4.8.x  
> **Backend Service:** `madayawgas-backend` (Single-instance Express v5 + Socket.IO on Render)  
> **Connected Clients:** Office Web Dashboards (Vercel) & Field Mobile POS (React Native / Expo)  
> **Last Updated:** October 19, 2026  

---

## 1. Connection Architecture & Lifecycle

### 1.1. Base URL & Transports
* **Production**: `wss://madayawgas-backend.onrender.com`
* **Local Development**: `ws://localhost:5000` (or `ws://127.0.0.1:5000`)
* **Transports**: `['websocket', 'polling']` (WebSocket-first with HTTP long-polling fallback for constrained cellular environments).
* **Credentials**: `true` (enables cross-origin cookie transmission).

### 1.2. Handshake Authentication Policy
Socket connections strictly require authenticated server-side sessions. Handshake requests are evaluated by the connection middleware before socket establishment:

1. **Office Web Dashboards (Browser / Vercel)**:
   - When establishing the socket connection with `withCredentials: true`, the browser automatically transmits the HTTP-Only `mg_sid` cookie.
2. **Mobile POS & Driver Clients (React Native / Expo)**:
   - Transmits the session token in the Socket.IO `auth` handshake object:
     ```javascript
     const socket = io('https://madayawgas-backend.onrender.com', {
       transports: ['websocket', 'polling'],
       auth: {
         token: '<session_token>',
       },
     });
     ```
   - Alternatively, pass `Authorization: Bearer <token>` in the handshake headers.

> [!WARNING]
> **Authentication Failure Rejection**:
> If the session token is missing, invalid, expired, or revoked, the connection is immediately rejected during handshake with:
> `Error: Authentication error: Unauthorized`

---

## 2. Standardized Application Event Envelope

All application-level events emitted by the backend conform to the unified event envelope:

```json
{
  "event": "EVENT_NAME",
  "data": {
    "...": "Domain-specific payload object"
  },
  "meta": {
    "timestamp": "2026-10-19T08:00:00.120Z",
    "version": "1.0"
  }
}
```

- **`event`** *(string)*: Unique, capitalized, snake_case/constant event name.
- **`data`** *(object)*: Typed domain payload. For high-volume transactional mutations, this follows the **"Poke and Invalidate"** pattern, containing target resource identifiers rather than full entity dumps.
- **`meta.timestamp`** *(string)*: ISO-8601 UTC timestamp of server emission.
- **`meta.version`** *(string)*: Schema version (currently `"1.0"`).

---

## 3. Authorized Rooms & RBAC Scoping

Clients are **automatically joined** to authorized Socket.IO rooms upon successful authentication based on their database-verified RBAC permissions. Clients cannot request arbitrary room subscriptions manually.

| Room Name | Required Permission(s) | Eligible Roles | Description & Scope |
| :--- | :--- | :--- | :--- |
| **`room:alerts`** | `alerts.view` OR `alerts.manage` | Super Admin, Admin, Logistics Supervisor, Sales Supervisor | Real-time driver emergency SOS dispatches, acknowledgments, and triage updates. |
| **`room:fleet`** | `fleet.view` OR `fleet.manage` OR `route.manage` | Super Admin, Admin, Logistics Supervisor | Vehicle operational readiness, groundings (`UNDER_MAINTENANCE`), maintenance releases, driver assignments, and vehicle status changes. |
| **`room:inventory`** | `inventory.view` OR `inventory.plant.manage` OR `inventory.vehicle.manage` | Super Admin, Admin, Plant Supervisor, Sales Supervisor, Logistics Supervisor | Master plant bulk stock changes, load manifests, vehicle stock mutations, product catalog changes, return unloads, and trip reconciliation settlement. |
| **`room:sales`** | `sales.view` OR `dashboard.view` | Super Admin, Admin, Sales Supervisor, Logistics Supervisor | Shift sales counters, offline batch ingestion notifications, transaction cancellations, and invoice verifications. |
| **`room:trips`** | `route.manage` OR `route.view_all` OR `route.reconcile` | Super Admin, Admin, Logistics Supervisor, Plant Supervisor | Daily trip dispatches, midday reload manifests, return check-ins, variance reconciliations, and cancellations. |
| **`room:schedules`** | `route.manage` OR `route.view_all` | Super Admin, Admin, Logistics Supervisor | Daily truck schedule creations, batch template generations, route modifications, and schedule cancellations. |
| **`room:operations`** | `operations.attendance.view_all` OR `operations.attendance.manage` OR `operations.apprehensions.view_all` OR `operations.apprehensions.manage` OR `operations.fuel.view_all` OR `operations.fuel.manage` | Super Admin, Admin, Logistics Supervisor, Sales Supervisor | Operational frontline logging: Driver clock-in/out duty attendance, roadside traffic apprehensions, and vehicle refueling telemetry. |
| **`user:{userId}`** | Authenticated User Identity | All Authenticated Users | Dedicated private channel for direct user notifications: assigned driver trip dispatches/reloads/completions, driver vehicle assignment alerts, driver apprehension logging, duty attendance updates, and immediate session revocation (`AUTH_SESSION_REVOKED`). |

> [!NOTE]
> **Mobile Driver & Sales Rep Scoping**:
> Field crew accounts holding scoped permissions (`route.view_own`, `fleet.view_own`) are **not** joined to broad supervisor rooms (`room:trips` or `room:fleet`). Instead, they receive their specific dispatches, reloads, vehicle assignments, and alerts directly via their private **`user:{userId}`** room.

---

## 4. Domain Event Catalog

### 4.1. Driver Emergency Alerts (`src/features/operations/alerts/`)

#### Event: `EMERGENCY_ALERT_TRIGGERED`
Emitted immediately when a mobile driver presses the emergency SOS button.

* **Trigger**: `POST /api/operations/alerts` committed in database.
* **Target Room**: `room:alerts`
* **Payload Structure**:
```json
{
  "event": "EMERGENCY_ALERT_TRIGGERED",
  "data": {
    "id": "c5a7f29b-98f1-4df2-9b22-824c084e7a11",
    "driverId": "e829bf42-9988-4db8-8314-8782a62ffb52",
    "vehicleId": "7fa8411b-10ab-4841-8693-01865a94eb73",
    "tripId": "90d1525a-4ba4-4113-a442-fcaeeeb08df5",
    "emergencyType": "ACCIDENT",
    "description": "Blown tire on highway, truck pulled over to shoulder",
    "status": "ACTIVE",
    "location": {
      "latitude": 7.1907,
      "longitude": 125.4553
    },
    "driver": {
      "id": "e829bf42-9988-4db8-8314-8782a62ffb52",
      "fullName": "Pedro Penduko",
      "phone": "+639171234567"
    },
    "vehicle": {
      "id": "7fa8411b-10ab-4841-8693-01865a94eb73",
      "plateNumber": "XYZ-1234",
      "model": "Isuzu Forward 10-Wheeler"
    },
    "trip": {
      "id": "90d1525a-4ba4-4113-a442-fcaeeeb08df5",
      "tripNumber": "TRIP-20261017-001"
    },
    "createdAt": "2026-10-17T09:30:00.000Z"
  },
  "meta": {
    "timestamp": "2026-10-17T09:30:00.120Z",
    "version": "1.0"
  }
}
```
* **Frontend Action**: Play audio alarm cue, display modal takeover, pin location on live operations map, increment active alerts counter.

---

#### Event: `EMERGENCY_ALERT_STATUS_UPDATED`
Emitted when a supervisor acknowledges or resolves an active emergency alert.

* **Trigger**: `PATCH /api/operations/alerts/:id/acknowledge` or `PATCH /api/operations/alerts/:id/resolve`.
* **Target Room**: `room:alerts`
* **Payload Structure**:
```json
{
  "event": "EMERGENCY_ALERT_STATUS_UPDATED",
  "data": {
    "id": "c5a7f29b-98f1-4df2-9b22-824c084e7a11",
    "status": "ACKNOWLEDGED",
    "acknowledgedBy": "8a32a611-6453-4876-96cb-8d02df918231",
    "acknowledgedByName": "Juan Dela Cruz",
    "acknowledgedAt": "2026-10-17T09:32:15.000Z",
    "resolvedBy": null,
    "resolvedByName": null,
    "resolvedAt": null,
    "resolutionNotes": null
  },
  "meta": {
    "timestamp": "2026-10-17T09:32:15.150Z",
    "version": "1.0"
  }
}
```
* **Frontend Action**: Silence audio cue, update triage status pill from `ACTIVE` to `ACKNOWLEDGED` or `RESOLVED`, prevent duplicate supervisor actions.

---

### 4.2. Trips & Route Dispatching (`src/features/trips/`)

#### Event: `TRIP_DISPATCHED`
Emitted when a schedule is dispatched into an active field delivery trip. Immediately notifies both office dispatchers and the assigned driver's mobile device so the driver's active trip screen updates automatically without requiring pull-to-refresh.

* **Trigger**: `POST /api/trips/:id/dispatch`
* **Target Rooms**: `room:trips`, `user:{driverUserId}`
* **Payload Structure**:
```json
{
  "event": "TRIP_DISPATCHED",
  "data": {
    "tripId": "90d1525a-4ba4-4113-a442-fcaeeeb08df5",
    "tripNumber": "TRIP-20261019-001",
    "scheduleId": "fa71e892-1b32-47ef-a0f1-0985cc312101",
    "vehicleId": "7fa8411b-10ab-4841-8693-01865a94eb73",
    "driverId": "e829bf42-9988-4db8-8314-8782a62ffb52",
    "driverUserId": "3c82fa11-4712-4eb2-a9b3-11985da38101",
    "status": "DISPATCHED",
    "dispatchedAt": "2026-10-19T06:30:00.000Z",
    "initialLoadCount": 140
  },
  "meta": {
    "timestamp": "2026-10-19T06:30:00.120Z",
    "version": "1.0"
  }
}
```
* **Client Action**:
  - **Driver Mobile**: Switch view from "No Active Trip" standby to the Active Route Screen, hydrate load inventory, begin delivery navigation.
  - **Office Web**: Invalidate `['active-trips']`, `['trip', tripId]`, and `['daily-schedules']`.

---

#### Event: `TRIP_LOAD_RECORDED`
Emitted when an initial load slip or midday reload slip is recorded for a trip.

* **Trigger**: `POST /api/trips/:id/loads`
* **Target Rooms**: `room:trips`, `room:inventory`, `user:{driverUserId}`
* **Payload Structure**:
```json
{
  "event": "TRIP_LOAD_RECORDED",
  "data": {
    "tripId": "90d1525a-4ba4-4113-a442-fcaeeeb08df5",
    "tripNumber": "TRIP-20261019-001",
    "slipNumber": "LOAD-20261019-102",
    "loadType": "MIDDAY_RELOAD",
    "itemCount": 50,
    "recordedAt": "2026-10-19T11:15:00.000Z"
  },
  "meta": {
    "timestamp": "2026-10-19T11:15:00.150Z",
    "version": "1.0"
  }
}
```
* **Client Action**: Driver mobile updates onboard cylinder stock balances; warehouse inventory dashboard invalidates active transfers.

---

#### Event: `VEHICLE_STOCK_UPDATED`
Emitted whenever the physical inventory carried by a delivery truck changes (after load addition or post-trip return).

* **Trigger**: `POST /api/trips/:id/loads`, `POST /api/trips/:id/reconcile`
* **Target Rooms**: `room:inventory`, `room:trips`, `user:{driverUserId}`
* **Payload Structure**:
```json
{
  "event": "VEHICLE_STOCK_UPDATED",
  "data": {
    "tripId": "90d1525a-4ba4-4113-a442-fcaeeeb08df5",
    "vehicleId": "7fa8411b-10ab-4841-8693-01865a94eb73",
    "action": "LOAD_ADDED",
    "updatedAt": "2026-10-19T11:15:00.000Z"
  },
  "meta": {
    "timestamp": "2026-10-19T11:15:00.180Z",
    "version": "1.0"
  }
}
```
* **Client Action**: Invalidate `['vehicle-stock', vehicleId]` and `['trip-stock', tripId]`.

---

#### Event: `TRIP_COMPLETED`
Emitted when a driver checks in at the yard and completes the field route.

* **Trigger**: `POST /api/trips/:id/complete`
* **Target Rooms**: `room:trips`, `user:{driverUserId}`
* **Payload Structure**:
```json
{
  "event": "TRIP_COMPLETED",
  "data": {
    "tripId": "90d1525a-4ba4-4113-a442-fcaeeeb08df5",
    "tripNumber": "TRIP-20261019-001",
    "status": "COMPLETED",
    "completedAt": "2026-10-19T17:30:00.000Z"
  },
  "meta": {
    "timestamp": "2026-10-19T17:30:00.200Z",
    "version": "1.0"
  }
}
```
* **Client Action**: Driver mobile transitions to "Trip Completed / Awaiting Reconciliation" summary screen; office supervisor dashboard queues trip for stock variance audit.

---

#### Event: `TRIP_RECONCILED`
Emitted when a plant supervisor settles post-trip cylinder variances and unloads.

* **Trigger**: `POST /api/trips/:id/reconcile`
* **Target Rooms**: `room:trips`, `room:inventory`, `user:{driverUserId}`
* **Payload Structure**:
```json
{
  "event": "TRIP_RECONCILED",
  "data": {
    "tripId": "90d1525a-4ba4-4113-a442-fcaeeeb08df5",
    "tripNumber": "TRIP-20261019-001",
    "status": "RECONCILED",
    "varianceFound": false,
    "discrepancyCount": 0,
    "reconciledAt": "2026-10-19T18:00:00.000Z"
  },
  "meta": {
    "timestamp": "2026-10-19T18:00:00.220Z",
    "version": "1.0"
  }
}
```
* **Client Action**: Invalidate `['trip-reconciliation', tripId]`, `['active-trips']`, and `['inventory-plant']`.

---

#### Event: `TRIP_CANCELLED`
Emitted when an uncompleted or drafted trip is cancelled by logistics dispatch.

* **Trigger**: `POST /api/trips/:id/cancel`
* **Target Rooms**: `room:trips`, `user:{driverUserId}`
* **Payload Structure**:
```json
{
  "event": "TRIP_CANCELLED",
  "data": {
    "tripId": "90d1525a-4ba4-4113-a442-fcaeeeb08df5",
    "tripNumber": "TRIP-20261019-001",
    "status": "CANCELLED",
    "reason": "Severe weather alert in target zone",
    "cancelledAt": "2026-10-19T07:00:00.000Z"
  },
  "meta": {
    "timestamp": "2026-10-19T07:00:00.250Z",
    "version": "1.0"
  }
}
```
* **Client Action**: Revert driver mobile screen back to route selection; clear active route indicators.

---

### 4.3. Daily Schedules & Route Planning (`src/features/schedules/`)

#### Event: `SCHEDULE_CREATED`
* **Trigger**: `POST /api/schedules`
* **Target Room**: `room:schedules`
* **Payload Structure**:
```json
{
  "event": "SCHEDULE_CREATED",
  "data": {
    "scheduleId": "fa71e892-1b32-47ef-a0f1-0985cc312101",
    "scheduleDate": "2026-10-20",
    "zoneId": "a1b2c3d4-0001-4000-8000-000000000001",
    "vehicleId": "7fa8411b-10ab-4841-8693-01865a94eb73",
    "driverId": "e829bf42-9988-4db8-8314-8782a62ffb52",
    "status": "DRAFT",
    "createdAt": "2026-10-19T14:00:00.000Z"
  },
  "meta": {
    "timestamp": "2026-10-19T14:00:00.100Z",
    "version": "1.0"
  }
}
```

---

#### Event: `SCHEDULES_BATCH_GENERATED`
* **Trigger**: `POST /api/schedules/generate-batch`
* **Target Room**: `room:schedules`
* **Payload Structure**:
```json
{
  "event": "SCHEDULES_BATCH_GENERATED",
  "data": {
    "generatedCount": 12,
    "scheduleDate": "2026-10-20",
    "generatedAt": "2026-10-19T14:05:00.000Z"
  },
  "meta": {
    "timestamp": "2026-10-19T14:05:00.150Z",
    "version": "1.0"
  }
}
```

---

#### Event: `SCHEDULE_UPDATED`
* **Trigger**: `PUT /api/schedules/:id` or `PATCH /api/schedules/:id`
* **Target Room**: `room:schedules`
* **Payload Structure**:
```json
{
  "event": "SCHEDULE_UPDATED",
  "data": {
    "scheduleId": "fa71e892-1b32-47ef-a0f1-0985cc312101",
    "scheduleDate": "2026-10-20",
    "zoneId": "a1b2c3d4-0001-4000-8000-000000000001",
    "vehicleId": "7fa8411b-10ab-4841-8693-01865a94eb73",
    "driverId": "e829bf42-9988-4db8-8314-8782a62ffb52",
    "status": "CONFIRMED",
    "updatedAt": "2026-10-19T14:10:00.000Z"
  },
  "meta": {
    "timestamp": "2026-10-19T14:10:00.120Z",
    "version": "1.0"
  }
}
```

---

#### Event: `SCHEDULE_CANCELLED`
* **Trigger**: `POST /api/schedules/:id/cancel`
* **Target Room**: `room:schedules`
* **Payload Structure**:
```json
{
  "event": "SCHEDULE_CANCELLED",
  "data": {
    "scheduleId": "fa71e892-1b32-47ef-a0f1-0985cc312101",
    "reason": "Truck reassigned to emergency maintenance",
    "cancelledAt": "2026-10-19T14:15:00.000Z"
  },
  "meta": {
    "timestamp": "2026-10-19T14:15:00.130Z",
    "version": "1.0"
  }
}
```

---

### 4.4. Fleet Assets & Vehicle Readiness (`src/features/fleet/`)

#### Event: `FLEET_VEHICLE_GROUNDED`
Emitted when a vehicle is grounded (`UNDER_MAINTENANCE`) due to inspection failure or roadside incident.

* **Trigger**: `POST /api/fleet/maintenance/inspections`, `POST /api/fleet/maintenance/incidents`, or `PATCH /api/fleet/vehicles/:id/status`.
* **Target Room**: `room:fleet`
* **Payload Structure**:
```json
{
  "event": "FLEET_VEHICLE_GROUNDED",
  "data": {
    "vehicleId": "7fa8411b-10ab-4841-8693-01865a94eb73",
    "plateNumber": "XYZ-1234",
    "status": "UNDER_MAINTENANCE",
    "reason": "FAILED_INSPECTION",
    "sourceId": "553b6d21-411a-428e-8a9d-b8d2a6e9f1a0",
    "findings": "Severely worn brake pads detected during morning inspection",
    "groundedAt": "2026-10-17T07:15:00.000Z"
  },
  "meta": {
    "timestamp": "2026-10-17T07:15:00.250Z",
    "version": "1.0"
  }
}
```

---

#### Event: `FLEET_VEHICLE_RELEASED`
Emitted when servicing is complete and a vehicle returns to operational service (`ACTIVE`).

* **Trigger**: `POST /api/fleet/maintenance/work-orders/:id/finalize` or `PATCH /api/fleet/vehicles/:id/status`.
* **Target Room**: `room:fleet`
* **Payload Structure**:
```json
{
  "event": "FLEET_VEHICLE_RELEASED",
  "data": {
    "vehicleId": "7fa8411b-10ab-4841-8693-01865a94eb73",
    "plateNumber": "XYZ-1234",
    "status": "ACTIVE",
    "workOrderId": "e4412c9b-6512-4091-b3b1-ef4a54c82b99",
    "releasedAt": "2026-10-17T14:45:00.000Z"
  },
  "meta": {
    "timestamp": "2026-10-17T14:45:00.180Z",
    "version": "1.0"
  }
}
```

---

#### Event: `VEHICLE_DRIVER_ASSIGNED`
Emitted when a driver is assigned to a delivery vehicle. Updates fleet boards and immediately notifies the assigned driver.

* **Trigger**: `POST /api/fleet/trucks/:id/assign-driver`
* **Target Rooms**: `room:fleet`, `user:{driverUserId}`
* **Payload Structure**:
```json
{
  "event": "VEHICLE_DRIVER_ASSIGNED",
  "data": {
    "vehicleId": "7fa8411b-10ab-4841-8693-01865a94eb73",
    "plateNumber": "XYZ-1234",
    "driverId": "e829bf42-9988-4db8-8314-8782a62ffb52",
    "driverUserId": "3c82fa11-4712-4eb2-a9b3-11985da38101",
    "assignedAt": "2026-10-19T06:00:00.000Z"
  },
  "meta": {
    "timestamp": "2026-10-19T06:00:00.150Z",
    "version": "1.0"
  }
}
```
* **Client Action**: Driver mobile updates default vehicle profile, plate number, and current odometer reading automatically.

---

#### Event: `VEHICLE_DRIVER_UNASSIGNED`
Emitted when a driver is unassigned from a delivery vehicle.

* **Trigger**: `POST /api/fleet/trucks/:id/unassign-driver`
* **Target Rooms**: `room:fleet`, `user:{unassignedDriverUserId}`
* **Payload Structure**:
```json
{
  "event": "VEHICLE_DRIVER_UNASSIGNED",
  "data": {
    "vehicleId": "7fa8411b-10ab-4841-8693-01865a94eb73",
    "plateNumber": "XYZ-1234",
    "unassignedDriverId": "e829bf42-9988-4db8-8314-8782a62ffb52",
    "unassignedDriverUserId": "3c82fa11-4712-4eb2-a9b3-11985da38101",
    "unassignedAt": "2026-10-19T18:30:00.000Z"
  },
  "meta": {
    "timestamp": "2026-10-19T18:30:00.160Z",
    "version": "1.0"
  }
}
```

---

#### Event: `VEHICLE_STATUS_UPDATED`
Emitted on general vehicle operational status updates.

* **Trigger**: `PATCH /api/fleet/trucks/:id/status`
* **Target Room**: `room:fleet`
* **Payload Structure**:
```json
{
  "event": "VEHICLE_STATUS_UPDATED",
  "data": {
    "vehicleId": "7fa8411b-10ab-4841-8693-01865a94eb73",
    "plateNumber": "XYZ-1234",
    "status": "STANDBY",
    "reason": "Scheduled rest day",
    "updatedAt": "2026-10-19T18:35:00.000Z"
  },
  "meta": {
    "timestamp": "2026-10-19T18:35:00.170Z",
    "version": "1.0"
  }
}
```

---

### 4.5. Inventory & Product Catalog (`src/features/inventory/`)

#### Event: `PLANT_STOCK_UPDATED` (Poke & Invalidate)
Emitted whenever bulk plant stock balances mutate at the Bunawan refilling yard.

* **Trigger**: `POST /api/inventory/trips/:tripId/dispatch-load`, `POST /api/inventory/trips/:tripId/return-unload`, `POST /api/inventory/plant/restock`, `POST /api/inventory/plant/quarantine-defects`.
* **Target Room**: `room:inventory`
* **Payload Structure**:
```json
{
  "event": "PLANT_STOCK_UPDATED",
  "data": {
    "operation": "DISPATCH_LOAD",
    "tripId": "90d1525a-4ba4-4113-a442-fcaeeeb08df5",
    "slipNumber": "LOAD-20261017-4F9A",
    "affectedProductIds": [
      "11111111-1111-1111-1111-111111111111",
      "22222222-2222-2222-2222-222222222222"
    ],
    "updatedAt": "2026-10-17T06:30:00.000Z"
  },
  "meta": {
    "timestamp": "2026-10-17T06:30:00.310Z",
    "version": "1.0"
  }
}
```
* **Frontend Action**: Invalidate `['inventory-plant']`, `['transfers']`, and `['trip-stock', tripId]`. TanStack Query refetches authoritative balances via `GET /api/inventory/plant`.

---

#### Event: `PRODUCT_CATALOG_UPDATED`
Emitted when products in the catalog are added, modified, or deactivated.

* **Trigger**: `POST /api/inventory/products`, `PUT /api/inventory/products/:id`, `PATCH /api/inventory/products/:id/deactivate`.
* **Target Room**: `room:inventory`
* **Payload Structure**:
```json
{
  "event": "PRODUCT_CATALOG_UPDATED",
  "data": {
    "action": "UPDATED",
    "productId": "11111111-1111-1111-1111-111111111111",
    "sku": "LPG-11KG-POL",
    "name": "11kg POL Valve LPG Cylinder",
    "category": "LPG_CYLINDER",
    "updatedAt": "2026-10-19T10:00:00.000Z"
  },
  "meta": {
    "timestamp": "2026-10-19T10:00:00.120Z",
    "version": "1.0"
  }
}
```
* **Frontend Action**: Invalidate `['inventory-products']` and POS product selection pickers.

---

### 4.6. Commercial Sales & Invoicing (`src/features/sales/`)

#### Event: `SALES_BATCH_SYNCED` (Poke & Invalidate)
Emitted when offline frontline sales transactions from mobile trucks are committed.

* **Trigger**: `POST /api/sales/sync-batch` commits with `processedCount > 0`.
* **Zero-Emission Invariant**: If `processedCount === 0` (entire batch was duplicate retry), **zero events are emitted**.
* **Target Room**: `room:sales`
* **Payload Structure**:
```json
{
  "event": "SALES_BATCH_SYNCED",
  "data": {
    "tripId": "90d1525a-4ba4-4113-a442-fcaeeeb08df5",
    "tripNumber": "TRIP-20261017-001",
    "processedCount": 8,
    "syncedAt": "2026-10-17T16:45:00.000Z"
  },
  "meta": {
    "timestamp": "2026-10-17T16:45:00.220Z",
    "version": "1.0"
  }
}
```
* **Frontend Action**: Invalidate `['sales-shift-summary', tripId]`, `['sales-transactions']`, and `['trip-stock', tripId]`. Dashboard refetches fresh shift remittance totals via `GET /api/sales/trips/:tripId/shift-summary`.

---

#### Event: `SALES_TRANSACTION_CANCELLED`
Emitted when a supervisor voids an erroneously entered sales transaction.

* **Trigger**: `PATCH /api/sales/transactions/:id/cancel`
* **Target Room**: `room:sales`
* **Payload Structure**:
```json
{
  "event": "SALES_TRANSACTION_CANCELLED",
  "data": {
    "transactionId": "bbbbbbbb-2222-2222-2222-bbbbbbbbbbbb",
    "tripId": "90d1525a-4ba4-4113-a442-fcaeeeb08df5",
    "cancellationReason": "Customer duplicate order error",
    "cancelledAt": "2026-10-19T15:20:00.000Z"
  },
  "meta": {
    "timestamp": "2026-10-19T15:20:00.140Z",
    "version": "1.0"
  }
}
```
* **Frontend Action**: Invalidate `['sales-transactions']`, `['sales-shift-summary', tripId]`, and customer balance records.

---

#### Event: `SALES_INVOICE_VERIFIED`
Emitted when a supervisor validates and confirms GCash payment proof for an invoice.

* **Trigger**: `PATCH /api/sales/invoices/:id/verify`
* **Target Room**: `room:sales`
* **Payload Structure**:
```json
{
  "event": "SALES_INVOICE_VERIFIED",
  "data": {
    "invoiceId": "cccccccc-3333-3333-3333-cccccccccccc",
    "tripId": "90d1525a-4ba4-4113-a442-fcaeeeb08df5",
    "invoiceNumber": "INV-20261019-0012",
    "paymentStatus": "VERIFIED",
    "verifiedAt": "2026-10-19T15:30:00.000Z"
  },
  "meta": {
    "timestamp": "2026-10-19T15:30:00.150Z",
    "version": "1.0"
  }
}
```
* **Frontend Action**: Invalidate `['sales-invoices']` and update payment badge from `PAID_UNVERIFIED` to `VERIFIED`.

---

### 4.7. Frontline Operations Telemetry (`src/features/operations/`)

#### Event: `ATTENDANCE_DUTY_UPDATED`
Emitted when personnel clock in or clock out of duty.

* **Trigger**: `POST /api/operations/attendance/clock-in` or `POST /api/operations/attendance/clock-out`.
* **Target Rooms**: `room:operations`, `user:{userId}`
* **Payload Structure (Clock Out example)**:
```json
{
  "event": "ATTENDANCE_DUTY_UPDATED",
  "data": {
    "attendanceId": "dddddddd-4444-4444-4444-dddddddddddd",
    "userId": "3c82fa11-4712-4eb2-a9b3-11985da38101",
    "type": "CLOCK_OUT",
    "clockOut": "2026-10-19T18:00:00.000Z",
    "durationMinutes": 510,
    "timestamp": "2026-10-19T18:00:00.000Z"
  },
  "meta": {
    "timestamp": "2026-10-19T18:00:00.120Z",
    "version": "1.0"
  }
}
```
* **Frontend Action**: Supervisor duty board marks employee on/off duty; mobile client switches duty toggle indicator without pull-to-refresh.

---

#### Event: `APPREHENSION_LOGGED`
Emitted when a driver logs a roadside traffic citation or ticket.

* **Trigger**: `POST /api/operations/apprehensions`
* **Target Rooms**: `room:operations`, `user:{driverUserId}`
* **Payload Structure**:
```json
{
  "event": "APPREHENSION_LOGGED",
  "data": {
    "apprehensionId": "eeeeeeee-5555-5555-5555-eeeeeeeeeeee",
    "driverId": "e829bf42-9988-4db8-8314-8782a62ffb52",
    "vehicleId": "7fa8411b-10ab-4841-8693-01865a94eb73",
    "violationType": "ILLEGAL_PARKING",
    "fineAmount": 1500,
    "status": "RECORDED",
    "loggedAt": "2026-10-19T11:45:00.000Z"
  },
  "meta": {
    "timestamp": "2026-10-19T11:45:00.110Z",
    "version": "1.0"
  }
}
```
* **Frontend Action**: Invalidate `['operations-apprehensions']` on supervisor portal.

---

#### Event: `APPREHENSION_STATUS_UPDATED`
Emitted when a supervisor resolves or settles an apprehension.

* **Trigger**: `PATCH /api/operations/apprehensions/:id/status`
* **Target Rooms**: `room:operations`, `user:{driverUserId}`
* **Payload Structure**:
```json
{
  "event": "APPREHENSION_STATUS_UPDATED",
  "data": {
    "apprehensionId": "eeeeeeee-5555-5555-5555-eeeeeeeeeeee",
    "driverId": "e829bf42-9988-4db8-8314-8782a62ffb52",
    "status": "SETTLED",
    "resolutionNotes": "Fine paid at CTTMO Davao",
    "updatedAt": "2026-10-19T16:00:00.000Z"
  },
  "meta": {
    "timestamp": "2026-10-19T16:00:00.130Z",
    "version": "1.0"
  }
}
```

---

#### Event: `FUEL_LOGGED`
Emitted when a vehicle refueling entry is recorded.

* **Trigger**: `POST /api/operations/fuel`
* **Target Room**: `room:operations`
* **Payload Structure**:
```json
{
  "event": "FUEL_LOGGED",
  "data": {
    "fuelLogId": "ffffffff-6666-6666-6666-ffffffffffff",
    "vehicleId": "7fa8411b-10ab-4841-8693-01865a94eb73",
    "liters": 45.5,
    "totalCost": 2730,
    "fuelType": "DIESEL",
    "odometerKm": 48250,
    "loggedAt": "2026-10-19T07:15:00.000Z"
  },
  "meta": {
    "timestamp": "2026-10-19T07:15:00.140Z",
    "version": "1.0"
  }
}
```
* **Frontend Action**: Invalidate `['operations-fuel']`, `['fleet-vehicles']`, and vehicle odometer cards.

---

### 4.8. User Security & Session Invalidation (`src/features/users/`)

#### Event: `AUTH_SESSION_REVOKED`
Emitted to a specific user's private channel when their active sessions are invalidated (due to role modification, admin credential reset, account deactivation, or password change).

* **Trigger**: `authService.revokeAllUserSessions(userId)`
* **Target Room**: `user:{userId}`
* **Payload Structure**:
```json
{
  "event": "AUTH_SESSION_REVOKED",
  "data": {
    "userId": "3c82fa11-4712-4eb2-a9b3-11985da38101",
    "reason": "REVOKED_BY_ADMIN_OR_PASSWORD_CHANGE",
    "revokedAt": "2026-10-19T16:45:00.000Z"
  },
  "meta": {
    "timestamp": "2026-10-19T16:45:00.050Z",
    "version": "1.0"
  }
}
```
* **Client Action**: Immediately disconnect socket, clear client-side token/storage, display session termination alert, and redirect user to the login screen.

---

## 5. Client Integration Patterns

### 5.1. Web Dashboard (TanStack Query Invalidation)

```typescript
// Example TanStack Query Invalidation Integration in React Web Dashboard
import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { io } from 'socket.io-client';

export function useRealtimeDashboardSync() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const socket = io(process.env.NEXT_PUBLIC_API_URL, {
      withCredentials: true,
      transports: ['websocket', 'polling'],
    });

    // 1. Trips & Route Planning
    socket.on('TRIP_DISPATCHED', (envelope) => {
      queryClient.invalidateQueries({ queryKey: ['active-trips'] });
      queryClient.invalidateQueries({ queryKey: ['daily-schedules'] });
    });

    socket.on('TRIP_COMPLETED', (envelope) => {
      queryClient.invalidateQueries({ queryKey: ['active-trips'] });
      queryClient.invalidateQueries({ queryKey: ['trip-reconciliations'] });
    });

    socket.on('TRIP_RECONCILED', (envelope) => {
      queryClient.invalidateQueries({ queryKey: ['active-trips'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-plant'] });
    });

    // 2. Driver Emergency Alerts
    socket.on('EMERGENCY_ALERT_TRIGGERED', (envelope) => {
      queryClient.invalidateQueries({ queryKey: ['operations-alerts-active'] });
      playAlertAudio();
    });

    socket.on('EMERGENCY_ALERT_STATUS_UPDATED', (envelope) => {
      queryClient.invalidateQueries({ queryKey: ['operations-alerts-active'] });
    });

    // 3. Fleet Readiness
    socket.on('FLEET_VEHICLE_GROUNDED', () => {
      queryClient.invalidateQueries({ queryKey: ['fleet-availability'] });
      queryClient.invalidateQueries({ queryKey: ['fleet-vehicles'] });
    });

    socket.on('FLEET_VEHICLE_RELEASED', () => {
      queryClient.invalidateQueries({ queryKey: ['fleet-availability'] });
      queryClient.invalidateQueries({ queryKey: ['fleet-vehicles'] });
    });

    // 4. Inventory & Sales (Poke & Invalidate)
    socket.on('PLANT_STOCK_UPDATED', (envelope) => {
      queryClient.invalidateQueries({ queryKey: ['inventory-plant'] });
      queryClient.invalidateQueries({ queryKey: ['transfers'] });
      if (envelope.data.tripId) {
        queryClient.invalidateQueries({ queryKey: ['trip-stock', envelope.data.tripId] });
      }
    });

    socket.on('SALES_BATCH_SYNCED', (envelope) => {
      queryClient.invalidateQueries({ queryKey: ['sales-transactions'] });
      queryClient.invalidateQueries({ queryKey: ['sales-shift-summary', envelope.data.tripId] });
      queryClient.invalidateQueries({ queryKey: ['trip-stock', envelope.data.tripId] });
    });

    return () => {
      socket.disconnect();
    };
  }, [queryClient]);
}
```

---

### 5.2. Mobile Driver Client (React Native / Expo Hooks)

Frontline mobile applications (e.g. `madayaw-mobile`) eliminate manual pull-to-refresh by subscribing to their private user room events:

```typescript
// hooks/useDriverActiveTrip.ts
import { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { fetchMyActiveTrip, logoutLocally } from '../services/api';

export function useDriverActiveTrip(sessionToken: string) {
  const [activeTrip, setActiveTrip] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    // 1. Initial REST Hydration
    fetchMyActiveTrip()
      .then((trip) => setActiveTrip(trip))
      .finally(() => setLoading(false));

    // 2. Establish Socket Connection with Auth Token
    const socket: Socket = io('https://madayawgas-backend.onrender.com', {
      transports: ['websocket', 'polling'],
      auth: { token: sessionToken },
    });

    // Real-Time Dispatch: Update active trip immediately upon office dispatch
    socket.on('TRIP_DISPATCHED', (envelope) => {
      console.log('New trip dispatched to me:', envelope.data.tripNumber);
      fetchMyActiveTrip().then((trip) => setActiveTrip(trip));
    });

    // Midday Reload or Stock Change
    socket.on('TRIP_LOAD_RECORDED', (envelope) => {
      console.log('Load slip recorded:', envelope.data.slipNumber);
      fetchMyActiveTrip().then((trip) => setActiveTrip(trip));
    });

    // Trip Completion
    socket.on('TRIP_COMPLETED', () => {
      setActiveTrip(null);
    });

    // Vehicle Assignment Change
    socket.on('VEHICLE_DRIVER_ASSIGNED', (envelope) => {
      console.log('Assigned to vehicle:', envelope.data.plateNumber);
    });

    // Session Revocation (Immediate Security Logout)
    socket.on('AUTH_SESSION_REVOKED', () => {
      socket.disconnect();
      logoutLocally();
    });

    return () => {
      socket.disconnect();
    };
  }, [sessionToken]);

  return { activeTrip, loading };
}
```

---

## 6. Offline Mobile Resilience & Recovery Invariants

1. **Write Independence**: Frontline React Native / Expo clients perform actions (sales, return unloads, SOS alerts) through HTTPS REST endpoints or local SQLite offline queues. Sockets are **NEVER** required to commit work.
2. **Post-Reconnection REST Recovery**: Office web dashboards always execute authoritative REST queries (`GET /api/operations/alerts/active`, `GET /api/inventory/plant`, `GET /api/fleet/availability`) upon initial component mount or reconnection. Missed socket events during temporary disconnections are automatically reconciled by REST refetching.
3. **Headless & Offline Test Safety**: All backend domain services emit through safe wrappers (`safeEmitSocketEvent`). Sockets failing to broadcast or running in headless testing environments will never fail or roll back the underlying database transactions.
