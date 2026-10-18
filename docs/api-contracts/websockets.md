# Real-Time WebSocket API Contracts & Event Specifications

> **Protocol:** WebSockets (`ws://`, `wss://`) over Socket.IO v4.8.x  
> **Backend Service:** `madayawgas-backend` (Single-instance Express v5 + Socket.IO on Render)  
> **Connected Clients:** Office Web Dashboards (Vercel) & Field Mobile POS (React Native / Expo)  
> **Last Updated:** October 17, 2026  

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
2. **Mobile POS Clients & Tooling (React Native / Expo)**:
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
    "timestamp": "2026-10-17T09:30:00.120Z",
    "version": "1.0"
  }
}
```

- **`event`** *(string)*: Unique, capitalized, snake_case/constant event name.
- **`data`** *(object)*: Typed domain payload. For transactional mutations, this follows the **"Poke and Invalidate"** pattern, containing target resource identifiers rather than full entity dumps.
- **`meta.timestamp`** *(string)*: ISO-8601 UTC timestamp of server emission.
- **`meta.version`** *(string)*: Schema version (currently `"1.0"`).

---

## 3. Authorized Rooms & RBAC Scoping

Clients are **automatically joined** to authorized Socket.IO rooms upon successful authentication based on their database-verified RBAC permissions. Clients do not request room subscriptions manually.

| Room Name | Required Permission(s) | Eligible Roles | Description & Scope |
| :--- | :--- | :--- | :--- |
| **`room:alerts`** | `alerts.view` OR `alerts.manage` | Super Admin, Admin, Logistics Supervisor, Sales Supervisor | Real-time driver emergency SOS dispatches, acknowledgments, and triage updates. |
| **`room:fleet`** | `fleet.view` OR `fleet.manage` OR `route.manage` | Super Admin, Admin, Logistics Supervisor | Vehicle operational readiness, groundings (`UNDER_MAINTENANCE`), and maintenance releases. |
| **`room:inventory`** | `inventory.view` OR `inventory.plant.manage` OR `inventory.vehicle.manage` | Super Admin, Admin, Plant Supervisor, Sales Supervisor, Logistics Supervisor | Master plant bulk stock changes, load manifests, return unloads, and trip reconciliation settlement. |
| **`room:sales`** | `sales.view` OR `dashboard.view` | Super Admin, Admin, Sales Supervisor, Logistics Supervisor | Shift sales counters, offline batch ingestion notifications, and payment updates. |
| **`user:{userId}`** | Authenticated User Identity | All Authenticated Users | Dedicated private channel for direct user notifications and individual operational receipts. |

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
* **Frontend Action**: Silence audio cue, update triage status pill from `ACTIVE` (red) to `ACKNOWLEDGED` (amber) or `RESOLVED` (green), prevent redundant supervisor triage actions.

---

### 4.2. Fleet Readiness & Maintenance (`src/features/fleet/maintenance/`)

#### Event: `FLEET_VEHICLE_GROUNDED`
Emitted when a vehicle is grounded (`UNDER_MAINTENANCE`) due to inspection failure, roadside incident, or manual supervisor action.

* **Trigger**: 
  - `POST /api/fleet/maintenance/inspections` with result `FAILED` (or `NEEDS_ATTENTION` with `allowDispatch=false`).
  - `POST /api/fleet/maintenance/incidents` with severity `CRITICAL`.
  - `PATCH /api/fleet/vehicles/:id/status` set to `UNDER_MAINTENANCE`.
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
* **Frontend Action**: Invalidate TanStack query cache keys `['fleet-availability']`, `['fleet-vehicles']`, and `['fleet-overview']`. Disable the vehicle in route scheduling pickers.

---

#### Event: `FLEET_VEHICLE_RELEASED`
Emitted when servicing is complete and a vehicle returns to operational service (`ACTIVE`).

* **Trigger**:
  - `POST /api/fleet/maintenance/work-orders/:id/finalize` commits.
  - `PATCH /api/fleet/vehicles/:id/status` set to `ACTIVE`.
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
* **Frontend Action**: Invalidate `['fleet-availability']`, `['fleet-overview']`, and `['fleet-vehicles']`. Re-enable vehicle in scheduling rotation.

---

### 4.3. Inventory & Plant Stock (`src/features/inventory/`)

#### Event: `PLANT_STOCK_UPDATED` (Poke & Invalidate)
Emitted whenever bulk plant stock balances mutate at the Bunawan refilling yard.

* **Trigger**: 
  - `POST /api/inventory/trips/:tripId/dispatch-load` (Morning loading or midday reload)
  - `POST /api/inventory/trips/:tripId/return-unload` (Yard return check-in)
  - `POST /api/inventory/plant/restock` (Supplier procurement delivery)
  - `POST /api/inventory/plant/quarantine-defects` (Defect quarantine adjustment)
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

#### Event: `TRIP_RECONCILIATION_UPDATED`
Emitted when a supervisor settles post-trip stock variance or flags discrepancy.

* **Trigger**: `POST /api/inventory/trips/:tripId/reconcile` commits.
* **Target Room**: `room:inventory`
* **Payload Structure**:
```json
{
  "event": "TRIP_RECONCILIATION_UPDATED",
  "data": {
    "tripId": "90d1525a-4ba4-4113-a442-fcaeeeb08df5",
    "tripNumber": "TRIP-20261017-001",
    "status": "SETTLED",
    "hasVariance": false,
    "reconciledAt": "2026-10-17T17:15:00.000Z"
  },
  "meta": {
    "timestamp": "2026-10-17T17:15:00.150Z",
    "version": "1.0"
  }
}
```
* **Frontend Action**: Invalidate `['trip-reconciliation', tripId]` and `['active-trips']`. Update status badge to `SETTLED` or `FLAGGED_VARIANCE`.

---

### 4.4. Sales & Shift Synchronization (`src/features/sales/sync/`)

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

## 5. Frontend TanStack Query Integration Patterns

```typescript
// Example TanStack Query Invalidation Integration in React Web Dashboard
import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { io } from 'socket.io-client';

export function useRealtimeSync() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const socket = io(process.env.NEXT_PUBLIC_API_URL, {
      withCredentials: true,
      transports: ['websocket', 'polling'],
    });

    // 1. Driver Emergency Alerts
    socket.on('EMERGENCY_ALERT_TRIGGERED', (envelope) => {
      queryClient.invalidateQueries({ queryKey: ['operations-alerts-active'] });
      playAlertAudio();
    });

    socket.on('EMERGENCY_ALERT_STATUS_UPDATED', (envelope) => {
      queryClient.invalidateQueries({ queryKey: ['operations-alerts-active'] });
    });

    // 2. Fleet Readiness
    socket.on('FLEET_VEHICLE_GROUNDED', (envelope) => {
      queryClient.invalidateQueries({ queryKey: ['fleet-availability'] });
      queryClient.invalidateQueries({ queryKey: ['fleet-vehicles'] });
    });

    socket.on('FLEET_VEHICLE_RELEASED', (envelope) => {
      queryClient.invalidateQueries({ queryKey: ['fleet-availability'] });
      queryClient.invalidateQueries({ queryKey: ['fleet-vehicles'] });
    });

    // 3. Inventory & Plant Stock (Poke & Invalidate)
    socket.on('PLANT_STOCK_UPDATED', (envelope) => {
      queryClient.invalidateQueries({ queryKey: ['inventory-plant'] });
      queryClient.invalidateQueries({ queryKey: ['transfers'] });
      if (envelope.data.tripId) {
        queryClient.invalidateQueries({ queryKey: ['trip-stock', envelope.data.tripId] });
      }
    });

    // 4. Sales Batch Sync (Poke & Invalidate)
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

## 6. Offline Mobile Resilience & Recovery Invariants

1. **Write Independence**: Frontline React Native / Expo clients perform actions (sales, return unloads, SOS alerts) through HTTPS REST endpoints or local SQLite offline queues. Sockets are **NEVER** required to commit work.
2. **Post-Reconnection REST Recovery**: Office web dashboards always execute authoritative REST queries (`GET /api/operations/alerts/active`, `GET /api/inventory/plant`, `GET /api/fleet/availability`) upon initial component mount or reconnection. Missed socket events during temporary disconnections are automatically reconciled by REST refetching.
