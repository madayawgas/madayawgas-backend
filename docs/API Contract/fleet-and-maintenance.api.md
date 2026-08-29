# MadayawGas API Contract: Fleet & Maintenance Endpoints

This document specifies the HTTP endpoints, payload structures, headers, authentication mechanics, RBAC permissions, and response schemas for fleet vehicle management, availability monitoring, and soft-bounded driver assignments in the MadayawGas Backend API.

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
| `fleet.view` | View fleet overview, availability, truck records, and vehicle status | Super Admin, Admin, Fleet Manager |
| `fleet.manage` | Register vehicles, update vehicle details, set status, deactivate, and assign drivers | Super Admin, Admin, Fleet Manager |

---

## Domain Concepts: Soft-Bounded Default Drivers & Fleet Availability

- **Soft-Bounded Default Driver**: A driver is soft-bounded to a truck as its default assigned operator (as drivers know their designated trucks best). The system does not require assigning a new truck for every trip. Drivers can still be reassigned or transferred by fleet management when necessary.
- **Operational Availability**: All vehicles in `ACTIVE` status are available for fleet operations, whether they currently have their dedicated default driver assigned or are awaiting driver assignment.
- **Maintenance Preservation**: Transitioning a vehicle to `UNDER_MAINTENANCE` retains the soft-bounded default driver so the driver resumes operation once repairs are completed.
- **Decommission / Deactivation Release**: Setting a vehicle to `INACTIVE` or `RETIRED` automatically releases the driver back to the unassigned driver pool.

---

## Endpoints

### 1. View Fleet Overview

Retrieves aggregate summary counts and operational metrics for the entire fleet.

- **HTTP Method**: `GET`
- **URL**: `/api/fleet/overview`
- **Authentication**: Required (`mg_sid` cookie)
- **Permission Required**: `fleet.view`

#### Response: `200 OK` (Success)

```json
{
  "status": "success",
  "data": {
    "metrics": {
      "totalVehicles": 5,
      "availableVehicles": 3,
      "assignedVehicles": 2,
      "unassignedVehicles": 1,
      "underMaintenanceVehicles": 1,
      "inactiveVehicles": 1
    },
    "summary": {
      "operationalTotal": 3,
      "operationalRatePercent": 60.0
    }
  }
}
```

---

### 2. View Fleet Availability

Retrieves list and counts of operational vehicles (`status = 'ACTIVE'`) ready for dispatch, including their soft-bounded default driver details.

- **HTTP Method**: `GET`
- **URL**: `/api/fleet/availability`
- **Authentication**: Required (`mg_sid` cookie)
- **Permission Required**: `fleet.view`

#### Query Parameters

| Parameter | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `driverAssigned` | Boolean | No | Filter by driver assignment status (`true` / `false`) |

#### Response: `200 OK` (Success)

```json
{
  "status": "success",
  "data": {
    "availableCount": 2,
    "vehicles": [
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
        "driver": {
          "id": "22222222-3333-4444-5555-666666666666",
          "firstName": "Juan",
          "lastName": "Sales",
          "phone": "+639170000004",
          "username": "sales_user"
        },
        "createdAt": "2026-08-20T10:00:00.000Z",
        "updatedAt": "2026-08-20T10:00:00.000Z"
      },
      {
        "id": "33333333-4444-5555-6666-777777777777",
        "plateNumber": "ABC-1002",
        "model": "Fuso Canter FE71",
        "yearModel": 2021,
        "currentOdometer": 62500,
        "lastPmOdometer": 60000,
        "status": "ACTIVE",
        "operationalStatus": "ACTIVE",
        "isAvailable": true,
        "driverId": null,
        "driver": null,
        "createdAt": "2026-08-20T10:00:00.000Z",
        "updatedAt": "2026-08-20T10:00:00.000Z"
      }
    ]
  }
}
```

---

### 3. List All Vehicles

Retrieves a list of fleet vehicles with optional search and filtering.

- **HTTP Method**: `GET`
- **URL**: `/api/fleet/trucks` (or `/api/fleet`)
- **Authentication**: Required (`mg_sid` cookie)
- **Permission Required**: `fleet.view`

#### Query Parameters

| Parameter | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `status` | String | No | Filter by status (`ACTIVE`, `INACTIVE`, `UNDER_MAINTENANCE`, `RETIRED`) |
| `search` | String | No | Search query for plate number or model |
| `driverAssigned` | Boolean | No | Filter vehicles by assignment status (`true` / `false`) |

#### Response: `200 OK` (Success)

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

### 4. Get Vehicle by ID

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

### 5. Register Vehicle

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

### 6. Update Vehicle Information

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

### 7. View Vehicle Status

Retrieves the current operational and availability status of a vehicle.

- **HTTP Method**: `GET`
- **URL**: `/api/fleet/trucks/:id/status`
- **Authentication**: Required (`mg_sid` cookie)
- **Permission Required**: `fleet.view`

#### Response: `200 OK` (Success)

```json
{
  "status": "success",
  "data": {
    "truck": {
      "id": "33333333-4444-5555-6666-777777777777",
      "plateNumber": "NGX-2045",
      "model": "Isuzu Forward FVR 34P",
      "status": "ACTIVE",
      "operationalStatus": "ACTIVE",
      "isAvailable": true,
      "driver": null
    }
  }
}
```

---

### 8. Set Vehicle Availability Status

Updates the operational condition of a vehicle (`ACTIVE`, `INACTIVE`, `UNDER_MAINTENANCE`, `RETIRED`).
- **Maintenance**: Setting `UNDER_MAINTENANCE` preserves the soft-bounded driver assignment.
- **Decommission**: Setting `INACTIVE` or `RETIRED` releases the driver assignment.

- **HTTP Method**: `PATCH`
- **URL**: `/api/fleet/trucks/:id/status`
- **Authentication**: Required (`mg_sid` cookie)
- **Permission Required**: `fleet.manage`

#### Request Body

```json
{
  "status": "UNDER_MAINTENANCE"
}
```

#### Response: `200 OK` (Success)

```json
{
  "status": "success",
  "message": "Vehicle availability status updated",
  "data": {
    "truck": {
      "id": "33333333-4444-5555-6666-777777777777",
      "plateNumber": "NGX-2045",
      "model": "Isuzu Forward FVR 34P",
      "status": "UNDER_MAINTENANCE",
      "operationalStatus": "UNDER_MAINTENANCE",
      "isAvailable": false,
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

### 9. Deactivate Vehicle

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

### 10. Assign / Transfer Vehicle Driver

Assigns or transfers an active eligible driver to a vehicle as their soft-bounded default driver, or unassigns with `driverId: null`.

- **HTTP Method**: `PATCH`
- **URL**: `/api/fleet/trucks/:id/assign`
- **Authentication**: Required (`mg_sid` cookie)
- **Permission Required**: `fleet.manage`

#### Request Body

```json
{
  "driverId": "22222222-3333-4444-5555-666666666666"
}
```

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

---

### 11. Fleet Register Page Options

Retrieves configuration metadata and eligible unassigned drivers to populate vehicle registration forms.

- **HTTP Method**: `GET`
- **URL**: `/api/fleet/register-options`
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
        "role": "Sales Person"
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

---

### 12. Record Vehicle Mileage

Records a new vehicle mileage reading (odometer), calculates the distance traveled since the previous reading, and monitors usage against the last preventive maintenance service.

- **HTTP Method**: `POST` / `PATCH`
- **URL**: `/api/fleet/trucks/:id/mileage`
- **Authentication**: Required (`mg_sid` cookie)
- **Permission Required**: `fleet.manage`

#### Path Parameters

| Parameter | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `id` | UUID | Yes | Unique identifier of the truck |

#### Request Body

```json
{
  "odometer": 48500
}
```

| Field | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `odometer` | Integer | Yes | New current odometer reading in km (must be >= current recorded odometer) |

#### Response: `200 OK` (Success)

```json
{
  "status": "success",
  "message": "Vehicle mileage recorded successfully",
  "data": {
    "truck": {
      "id": "33333333-4444-5555-6666-777777777777",
      "plateNumber": "NGX-2045",
      "model": "Isuzu Forward FVR 34P",
      "yearModel": 2023,
      "currentOdometer": 48500,
      "lastPmOdometer": 40000,
      "status": "ACTIVE",
      "operationalStatus": "ACTIVE",
      "isAvailable": true,
      "driverId": "22222222-3333-4444-5555-666666666666",
      "createdAt": "2026-08-27T21:40:00.000Z",
      "updatedAt": "2026-08-27T23:00:00.000Z",
      "driver": {
        "id": "22222222-3333-4444-5555-666666666666",
        "firstName": "Juan",
        "lastName": "Sales",
        "phone": "+639170000004",
        "username": "sales_user"
      }
    },
    "mileageSummary": {
      "previousOdometer": 45000,
      "currentOdometer": 48500,
      "distanceRecorded": 3500,
      "lastPmOdometer": 40000,
      "distanceSinceLastPm": 8500
    }
  }
}
```

#### Response: `400 Bad Request` (Lower Odometer / Rollback Attempt)

```json
{
  "status": "fail",
  "message": "New odometer reading (42000 km) cannot be less than current recorded odometer (45000 km)"
}
```

