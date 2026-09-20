# MadayawGas API Contract: Vehicle Inventory (Trucks)

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
| `fleet.view` | View truck lists and individual vehicle profiles | Super Admin, Admin, Fleet Manager |
| `fleet.manage` | Register vehicles, update vehicle details, and deactivate assets | Super Admin, Admin, Fleet Manager |

---

## Endpoints

### 1. List All Vehicles

Retrieves a list of fleet vehicles with optional search, filtering, deterministic sorting, and server-side pagination.

- **HTTP Method**: `GET`
- **URL**: `/api/fleet/trucks` (or `/api/fleet`)
- **Authentication**: Required (`mg_sid` cookie)
- **Permission Required**: `fleet.view`

#### Query Parameters

| Parameter | Type | Required | Default | Description |
| :--- | :--- | :--- | :--- | :--- |
| `page` | Integer | No | `1` | Page number (triggers standardized pagination envelope). Minimum `1`. |
| `limit` / `pageSize` | Integer | No | `20` | Items per page (clamped between `1` and `100`). Triggers standardized envelope. |
| `status` | String | No | None | Filter by status (`ACTIVE`, `INACTIVE`, `UNDER_MAINTENANCE`, `RETIRED`) |
| `search` | String | No | None | Search query matching plate number or model |
| `driverAssigned` | Boolean | No | None | Filter vehicles by assignment status (`true` / `false`) |
| `sortBy` | String | No | `createdAt` | Sort field: `createdAt`, `plateNumber`, `model`, `yearModel`, `currentOdometer`, `lastPmOdometer`, `status`, `updatedAt`. |
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
      "currentOdometer": 45000,
      "lastPmOdometer": 40000,
      "status": "ACTIVE",
      "operationalStatus": "ACTIVE",
      "isAvailable": true,
      "driverId": "22222222-3333-4444-5555-666666666666",
      "createdAt": "2026-08-20T10:00:00.000Z",
      "updatedAt": "2026-08-20T10:00:00.000Z",
      "driver": {
        "id": "22222222-3333-4444-5555-666666666666",
        "firstName": "Juan",
        "lastName": "Sales",
        "phone": "+639170000004",
        "username": "sales_user"
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

#### Response: `200 OK` (Legacy Unpaginated Format)
*Preserved for backward compatibility when pagination query parameters are omitted.*

```json
{
  "status": "success",
  "data": {
    "count": 1,
    "trucks": [
      {
        "id": "11111111-2222-3333-4444-555555555555",
        "plateNumber": "ABC-1001",
        "model": "Isuzu Elf N-Series",
        "yearModel": 2022,
        "currentOdometer": 45000,
        "lastPmOdometer": 40000,
        "status": "ACTIVE",
        "operationalStatus": "ACTIVE",
        "isAvailable": true,
        "driverId": "22222222-3333-4444-5555-666666666666",
        "createdAt": "2026-08-20T10:00:00.000Z",
        "updatedAt": "2026-08-20T10:00:00.000Z",
        "driver": {
          "id": "22222222-3333-4444-5555-666666666666",
          "firstName": "Juan",
          "lastName": "Sales",
          "phone": "+639170000004",
          "username": "sales_user"
        }
      }
    ]
  }
}
```

---

### 2. Get Vehicle by ID

Retrieves detailed information for a specific vehicle.

- **HTTP Method**: `GET`
- **URL**: `/api/fleet/trucks/:id`
- **Authentication**: Required (`mg_sid` cookie)
- **Permission Required**: `fleet.view`

#### Path Parameters

| Parameter | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `id` | UUID | Yes | Unique identifier of the truck |

#### Response: `200 OK` (Success)

```json
{
  "status": "success",
  "data": {
    "truck": {
      "id": "11111111-2222-3333-4444-555555555555",
      "plateNumber": "ABC-1001",
      "model": "Isuzu Elf N-Series",
      "yearModel": 2022,
      "currentOdometer": 45000,
      "lastPmOdometer": 40000,
      "status": "ACTIVE",
      "operationalStatus": "ACTIVE",
      "isAvailable": true,
      "driverId": "22222222-3333-4444-5555-666666666666",
      "createdAt": "2026-08-20T10:00:00.000Z",
      "updatedAt": "2026-08-20T10:00:00.000Z",
      "driver": {
        "id": "22222222-3333-4444-5555-666666666666",
        "firstName": "Juan",
        "lastName": "Sales",
        "phone": "+639170000004",
        "username": "sales_user"
      }
    }
  }
}
```

---

### 3. Register Vehicle

Registers a new vehicle in the fleet with an optional initial soft-bounded default driver.

- **HTTP Method**: `POST`
- **URL**: `/api/fleet/trucks` (or `/api/fleet`)
- **Authentication**: Required (`mg_sid` cookie)
- **Permission Required**: `fleet.manage`

#### Request Body

```json
{
  "plateNumber": "NGX-2045",
  "model": "Isuzu Forward FVR",
  "yearModel": 2023,
  "currentOdometer": 15000,
  "lastPmOdometer": 10000,
  "status": "ACTIVE",
  "driverId": null
}
```

| Field | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `plateNumber` | String | Yes | Vehicle license plate number (must be unique) |
| `model` | String | Yes | Make and model description |
| `yearModel` | Integer | Yes | Manufacturing model year (1900 to current year + 1) |
| `currentOdometer` | Integer | No | Current odometer reading in km (default: `0`, >= 0) |
| `lastPmOdometer` | Integer | No | Last preventive maintenance odometer reading (default: `0`, >= 0) |
| `status` | String | No | Initial status (`ACTIVE`, `INACTIVE`, `UNDER_MAINTENANCE`, `RETIRED`, default: `ACTIVE`) |
| `driverId` | UUID | No | Optional UUID of an active, unassigned driver |

#### Response: `201 Created` (Success)

```json
{
  "status": "success",
  "data": {
    "truck": {
      "id": "33333333-4444-5555-6666-777777777777",
      "plateNumber": "NGX-2045",
      "model": "Isuzu Forward FVR",
      "yearModel": 2023,
      "currentOdometer": 15000,
      "lastPmOdometer": 10000,
      "status": "ACTIVE",
      "operationalStatus": "ACTIVE",
      "isAvailable": true,
      "driverId": null,
      "driver": null,
      "createdAt": "2026-08-27T21:40:00.000Z",
      "updatedAt": "2026-08-27T21:40:00.000Z"
    }
  }
}
```

---

### 4. Update Vehicle Information

Updates vehicle specifications and odometer readings.

- **HTTP Method**: `PATCH`
- **URL**: `/api/fleet/trucks/:id`
- **Authentication**: Required (`mg_sid` cookie)
- **Permission Required**: `fleet.manage`

#### Request Body

```json
{
  "plateNumber": "NGX-2045",
  "model": "Isuzu Forward FVR 34P",
  "yearModel": 2023,
  "currentOdometer": 18500,
  "lastPmOdometer": 15000
}
```

#### Response: `200 OK` (Success)

```json
{
  "status": "success",
  "data": {
    "truck": {
      "id": "33333333-4444-5555-6666-777777777777",
      "plateNumber": "NGX-2045",
      "model": "Isuzu Forward FVR 34P",
      "yearModel": 2023,
      "currentOdometer": 18500,
      "lastPmOdometer": 15000,
      "status": "ACTIVE",
      "operationalStatus": "ACTIVE",
      "isAvailable": true,
      "driverId": null,
      "driver": null,
      "createdAt": "2026-08-27T21:40:00.000Z",
      "updatedAt": "2026-08-27T22:15:00.000Z"
    }
  }
}
```

---

### 5. Deactivate Vehicle

> [!CAUTION]
> **Dangerous Operation**: Deactivating a vehicle immediately marks it as `INACTIVE`, unassigns any assigned driver, and excludes it from the available dispatch fleet. Requires password confirmation.

Deactivates a vehicle asset (`status = 'INACTIVE'`) and releases its driver assignment.

- **HTTP Method**: `PATCH`
- **URL**: `/api/fleet/trucks/:id/deactivate`
- **Authentication**: Required (`mg_sid` cookie)
- **Permission Required**: `fleet.manage`
- **Dangerous Operation Guard**: Requires password confirmation (`confirmPassword` in body or `x-confirm-password` header)

#### Request Body

```json
{
  "confirmPassword": "YourCurrentPassword123!"
}
```

| Field | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `confirmPassword` | String | Yes | Acting manager/admin's current account password |

#### Response: `200 OK` (Success)

```json
{
  "status": "success",
  "message": "Vehicle successfully deactivated",
  "data": {
    "truck": {
      "id": "33333333-4444-5555-6666-777777777777",
      "plateNumber": "NGX-2045",
      "model": "Isuzu Forward FVR 34P",
      "yearModel": 2023,
      "currentOdometer": 18500,
      "lastPmOdometer": 15000,
      "status": "INACTIVE",
      "operationalStatus": "INACTIVE",
      "isAvailable": false,
      "driverId": null,
      "driver": null,
      "createdAt": "2026-08-27T21:40:00.000Z",
      "updatedAt": "2026-08-27T22:30:00.000Z"
    }
  }
}
```

---

### 6. Fleet Register Page Options

Retrieves configuration metadata and eligible unassigned drivers to populate vehicle registration forms.

- **HTTP Method**: `GET`
- **URL**: `/api/fleet/register-options` (or `/api/fleet/trucks/options/register`)
- **Authentication**: Required (`mg_sid` cookie)
- **Permission Required**: `fleet.manage`

#### Response: `200 OK` (Success)

```json
{
  "status": "success",
  "data": {
    "availableDrivers": [
      {
        "id": "44444444-5555-6666-7777-888888888888",
        "username": "driver_two",
        "firstName": "Pedro",
        "lastName": "Santos",
        "phone": "+639170000009",
        "role": "Driver",
        "isAssigned": false,
        "status": "AVAILABLE",
        "assignedTruck": null
      }
    ],
    "statusOptions": [
      "ACTIVE",
      "INACTIVE",
      "UNDER_MAINTENANCE",
      "RETIRED"
    ]
  }
}
```
