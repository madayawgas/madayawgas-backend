# MadayawGas API Contract: Fleet Drivers & Assignments

This document specifies the HTTP endpoints, payload structures, headers, authentication mechanics, RBAC permissions, and response schemas for soft-bounded driver assignments, unassignments, and driver directories in the MadayawGas Backend API.

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
| `fleet.view` | View driver directory and available driver lists | Super Admin, Admin, Fleet Manager |
| `fleet.manage` | Assign and unassign drivers to/from vehicles | Super Admin, Admin, Fleet Manager |

---

## Domain Concepts: Soft-Bounded Default Drivers

- **Soft-Bounded Default Driver**: A driver is soft-bounded to a truck as its designated default operator. The system does not require reassigning a truck for every single trip.
- **Strict Unassign-First Invariant**:
  1. If a driver is already assigned to a vehicle, they cannot be assigned to another vehicle until unassigned (`409 Conflict`).
  2. If a vehicle already has an assigned driver, a new driver cannot be assigned until the existing driver is unassigned (`409 Conflict`).
- **Status Synchronization**: When assigned, the driver's operational status transitions to `ASSIGNED`. When unassigned or when the vehicle is deactivated, the driver's status reverts to `AVAILABLE`.

---

## Endpoints

### 1. Assign Driver to Vehicle

Assigns an active eligible driver to a vehicle as their soft-bounded default driver.

- **HTTP Method**: `PATCH` / `POST`
- **URL**: `/api/fleet/trucks/:id/assign`
- **Authentication**: Required (`mg_sid` cookie)
- **Permission Required**: `fleet.manage`

#### Request Body

```json
{
  "driverId": "22222222-3333-4444-5555-666666666666"
}
```

| Field | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `driverId` | UUID | Yes | UUID of the eligible, unassigned driver to bind |

#### Response: `200 OK` (Success)

```json
{
  "status": "success",
  "message": "Driver successfully assigned",
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
      "driverId": "22222222-3333-4444-5555-666666666666",
      "createdAt": "2026-08-27T21:40:00.000Z",
      "updatedAt": "2026-08-27T22:45:00.000Z",
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

#### Response: `409 Conflict` (Driver Already Assigned)

```json
{
  "status": "fail",
  "message": "Driver 'Juan Sales' is already assigned to vehicle 'NGX-2045'. The driver must be unassigned from vehicle 'NGX-2045' first before being assigned to another vehicle."
}
```

---

### 2. Unassign Driver from Vehicle

Unassigns the driver currently attached to a vehicle, immediately transitioning the driver's status back to `AVAILABLE`.

- **HTTP Method**: `PATCH` / `POST`
- **URL**: `/api/fleet/trucks/:id/unassign`
- **Authentication**: Required (`mg_sid` cookie)
- **Permission Required**: `fleet.manage`

#### Response: `200 OK` (Success)

```json
{
  "status": "success",
  "message": "Driver successfully unassigned",
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
      "updatedAt": "2026-08-27T22:50:00.000Z"
    }
  }
}
```

---

### 3. Driver Directory (List All Drivers)

Lists all eligible driver accounts with their live assignment status (`AVAILABLE` vs `ASSIGNED`), attached truck details, deterministic sorting, and server-side pagination.

- **HTTP Method**: `GET`
- **URL**: `/api/fleet/drivers`
- **Authentication**: Required (`mg_sid` cookie)
- **Permission Required**: `fleet.view`

#### Query Parameters

| Parameter | Type | Required | Default | Description |
| :--- | :--- | :--- | :--- | :--- |
| `page` | Integer | No | `1` | Page number (triggers standardized pagination envelope). Minimum `1`. |
| `limit` / `pageSize` | Integer | No | `20` | Items per page (clamped between `1` and `100`). Triggers standardized envelope. |
| `search` | String | No | None | Search keyword matching first name, last name, or username |
| `availableOnly` | Boolean | No | None | Filter to only unassigned drivers (`true` / `false`) |
| `sortBy` | String | No | `createdAt` | Sort field: `createdAt`, `username`, `firstName`, `lastName`, `phone`. |
| `sortOrder` | String | No | `DESC` | Sort direction: `ASC` or `DESC`. |

#### Response: `200 OK` (Standardized Paginated Format)
*Returned when `page`, `limit`, or `pageSize` query parameters are provided.*

```json
{
  "status": "success",
  "data": [
    {
      "id": "22222222-3333-4444-5555-666666666666",
      "username": "sales_user",
      "firstName": "Juan",
      "lastName": "Sales",
      "phone": "+639170000004",
      "role": "Driver",
      "isAssigned": true,
      "status": "ASSIGNED",
      "assignedTruck": {
        "id": "33333333-4444-5555-6666-777777777777",
        "plateNumber": "NGX-2045",
        "model": "Isuzu Forward FVR 34P"
      }
    },
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
  "meta": {
    "page": 1,
    "limit": 20,
    "totalItems": 2,
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
    "count": 2,
    "drivers": [
      {
        "id": "22222222-3333-4444-5555-666666666666",
        "username": "sales_user",
        "firstName": "Juan",
        "lastName": "Sales",
        "phone": "+639170000004",
        "role": "Driver",
        "isAssigned": true,
        "status": "ASSIGNED",
        "assignedTruck": {
          "id": "33333333-4444-5555-6666-777777777777",
          "plateNumber": "NGX-2045",
          "model": "Isuzu Forward FVR 34P"
        }
      },
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
    ]
  }
}
```

---

### 4. List Available Drivers

Dedicated endpoint returning only active, eligible, unassigned drivers ready for vehicle assignment.

- **HTTP Method**: `GET`
- **URL**: `/api/fleet/drivers/available` (alias: `/api/fleet/available-drivers`)
- **Authentication**: Required (`mg_sid` cookie)
- **Permission Required**: `fleet.view`

#### Response: `200 OK` (Success)

```json
{
  "status": "success",
  "data": {
    "count": 1,
    "drivers": [
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
    ]
  }
}
```
