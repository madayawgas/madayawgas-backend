# MadayawGas API Contract: Vehicle Inventory (Vehicles)

This document specifies the HTTP endpoints, payload structures, headers, authentication mechanics, RBAC permissions, and response schemas for fleet vehicle asset management in the MadayawGas Backend API.

---

## General Information

- **Base URL Path**: `/api/fleet`
- **Request / Response Format**: `application/json`
- **Authentication**: Server-side session via HTTP-Only cookie (`mg_sid`).
- **Authorization**: Role-Based Access Control (RBAC).

---

## Permissions Summary

| Permission | Description | Allowed Roles (Default) |
| :--- | :--- | :--- |
| `fleet.view` | View vehicle lists and individual vehicle profiles | Super Admin, Admin, Fleet Manager |
| `fleet.manage` | Register vehicles, update vehicle details, and deactivate assets | Super Admin, Admin, Fleet Manager |

---

## Endpoints

### 1. List All Vehicles

Retrieves a list of fleet vehicles with optional search, vehicle type filtering, deterministic sorting, and server-side pagination.

- **HTTP Method**: `GET`
- **URL**: `/api/fleet/vehicles` (or `/api/fleet`)
- **Authentication**: Required (`mg_sid` cookie)
- **Permission Required**: `fleet.view`

#### Query Parameters

| Parameter | Type | Required | Default | Description |
| :--- | :--- | :--- | :--- | :--- |
| `page` | Integer | No | `1` | Page number (triggers standardized pagination envelope). Minimum `1`. |
| `limit` / `pageSize` | Integer | No | `20` | Items per page (clamped between `1` and `100`). Triggers standardized envelope. |
| `status` | String | No | None | Filter by status (`ACTIVE`, `INACTIVE`, `UNDER_MAINTENANCE`, `RETIRED`) |
| `vehicleType` / `type` | String | No | None | Filter by vehicle type (`DELIVERY_TRUCK`, `SERVICE_PICKUP`, `MOTORCYCLE`, `UTILITY_VAN`) |
| `search` | String | No | None | Search query matching plate number or model |
| `driverAssigned` | Boolean | No | None | Filter vehicles by assignment status (`true` / `false`) |
| `sortBy` | String | No | `createdAt` | Sort field: `createdAt`, `plateNumber`, `model`, `yearModel`, `vehicleType`, `currentOdometer`, `lastPmOdometer`, `status`, `updatedAt`. |
| `sortOrder` | String | No | `DESC` | Sort direction: `ASC` or `DESC`. |

#### Response: `200 OK` (Standardized Paginated Format)
*Returned when `page`, `limit`, or `pageSize` query parameters are provided.*

```json
{
  "status": "success",
  "data": [
    {
      "id": "11111111-2222-3333-4444-555555555555",
      "plateNumber": "ABC-1001",
      "model": "Isuzu Elf N-Series",
      "yearModel": 2022,
      "vehicleType": "DELIVERY_TRUCK",
      "currentOdometer": 45200,
      "lastPmOdometer": 40000,
      "pmDueFlag": true,
      "status": "ACTIVE",
      "operationalStatus": "ACTIVE",
      "isAvailable": true,
      "driverId": "22222222-3333-4444-5555-666666666666",
      "createdAt": "2026-08-20T10:00:00.000Z",
      "updatedAt": "2026-08-20T10:00:00.000Z",
      "driver": {
        "id": "22222222-3333-4444-5555-666666666666",
        "firstName": "Juan",
        "lastName": "Driver",
        "phone": "+639170000004",
        "username": "driver_user"
      }
    }
  ],
  "meta": {
    "page": 1,
    "limit": 20,
    "totalItems": 1,
    "totalPages": 1,
    "hasNextPage": false,
    "hasPrevPage": false
  }
}
```

#### Response: `200 OK` (Unpaginated Format)

```json
{
  "status": "success",
  "data": {
    "count": 1,
    "vehicles": [
      {
        "id": "11111111-2222-3333-4444-555555555555",
        "plateNumber": "ABC-1001",
        "model": "Isuzu Elf N-Series",
        "yearModel": 2022,
        "vehicleType": "DELIVERY_TRUCK",
        "currentOdometer": 45200,
        "lastPmOdometer": 40000,
        "pmDueFlag": true,
        "status": "ACTIVE",
        "operationalStatus": "ACTIVE",
        "isAvailable": true,
        "driverId": "22222222-3333-4444-5555-666666666666",
        "createdAt": "2026-08-20T10:00:00.000Z",
        "updatedAt": "2026-08-20T10:00:00.000Z",
        "driver": {
          "id": "22222222-3333-4444-5555-666666666666",
          "firstName": "Juan",
          "lastName": "Driver",
          "phone": "+639170000004",
          "username": "driver_user"
        }
      }
    ]
  }
}
```

---

### 2. Get Single Vehicle Detail

- **HTTP Method**: `GET`
- **URL**: `/api/fleet/vehicles/:id`
- **Authentication**: Required (`mg_sid` cookie)
- **Permission Required**: `fleet.view`

#### Response: `200 OK`

```json
{
  "status": "success",
  "data": {
    "vehicle": {
      "id": "11111111-2222-3333-4444-555555555555",
      "plateNumber": "ABC-1001",
      "model": "Isuzu Elf N-Series",
      "yearModel": 2022,
      "vehicleType": "DELIVERY_TRUCK",
      "currentOdometer": 45200,
      "lastPmOdometer": 40000,
      "pmDueFlag": true,
      "status": "ACTIVE",
      "operationalStatus": "ACTIVE",
      "isAvailable": true,
      "driverId": "22222222-3333-4444-5555-666666666666",
      "createdAt": "2026-08-20T10:00:00.000Z",
      "updatedAt": "2026-08-20T10:00:00.000Z",
      "driver": {
        "id": "22222222-3333-4444-5555-666666666666",
        "firstName": "Juan",
        "lastName": "Driver",
        "phone": "+639170000004",
        "username": "driver_user"
      }
    }
  }
}
```

---

### 3. Register Vehicle

- **HTTP Method**: `POST`
- **URL**: `/api/fleet/vehicles` (or `/api/fleet`)
- **Authentication**: Required (`mg_sid` cookie)
- **Permission Required**: `fleet.manage`

#### Request Body

```json
{
  "plateNumber": "XYZ-9988",
  "model": "Toyota Hilux Single Cab",
  "yearModel": 2023,
  "vehicleType": "SERVICE_PICKUP",
  "currentOdometer": 15000,
  "lastPmOdometer": 10000,
  "status": "ACTIVE",
  "driverId": "22222222-3333-4444-5555-666666666666"
}
```

#### Response: `201 Created`

```json
{
  "status": "success",
  "message": "Vehicle registered successfully",
  "data": {
    "vehicle": {
      "id": "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      "plateNumber": "XYZ-9988",
      "model": "Toyota Hilux Single Cab",
      "yearModel": 2023,
      "vehicleType": "SERVICE_PICKUP",
      "currentOdometer": 15000,
      "lastPmOdometer": 10000,
      "pmDueFlag": true,
      "status": "ACTIVE",
      "operationalStatus": "ACTIVE",
      "isAvailable": true,
      "driverId": "22222222-3333-4444-5555-666666666666",
      "driver": {
        "id": "22222222-3333-4444-5555-666666666666",
        "firstName": "Juan",
        "lastName": "Driver",
        "phone": "+639170000004",
        "username": "driver_user"
      },
      "createdAt": "2026-09-28T12:00:00.000Z",
      "updatedAt": "2026-09-28T12:00:00.000Z"
    }
  }
}
```

---

### 4. Update Vehicle

- **HTTP Method**: `PATCH` / `PUT`
- **URL**: `/api/fleet/vehicles/:id`
- **Authentication**: Required (`mg_sid` cookie)
- **Permission Required**: `fleet.manage`

#### Request Body

```json
{
  "model": "Toyota Hilux 4x4",
  "vehicleType": "SERVICE_PICKUP",
  "currentOdometer": 16000
}
```

---

### 5. Update Vehicle Operational Status

- **HTTP Method**: `PATCH`
- **URL**: `/api/fleet/vehicles/:id/status`
- **Authentication**: Required (`mg_sid` cookie)
- **Permission Required**: `fleet.manage`

#### Request Body

```json
{
  "status": "UNDER_MAINTENANCE"
}
```

---

### 6. Deactivate Vehicle (Password Confirmation Required)

- **HTTP Method**: `PATCH`
- **URL**: `/api/fleet/vehicles/:id/deactivate`
- **Authentication**: Required (`mg_sid` cookie)
- **Permission Required**: `fleet.manage`
- **Confirmation Required**: Super Admin / Admin confirmation password

#### Request Body

```json
{
  "confirmPassword": "AdminPassword123!"
}
```

---

### 7. Assign Driver to Vehicle

- **HTTP Method**: `PATCH` / `POST`
- **URL**: `/api/fleet/vehicles/:id/assign` (or `/api/fleet/vehicles/:id/assign-driver`)
- **Authentication**: Required (`mg_sid` cookie)
- **Permission Required**: `fleet.manage`

#### Request Body

```json
{
  "driverId": "22222222-3333-4444-5555-666666666666"
}
```

---

### 8. Unassign Driver from Vehicle

- **HTTP Method**: `PATCH` / `POST`
- **URL**: `/api/fleet/vehicles/:id/unassign` (or `/api/fleet/vehicles/:id/unassign-driver`)
- **Authentication**: Required (`mg_sid` cookie)
- **Permission Required**: `fleet.manage`
