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

### 10. Assign Driver to Vehicle

Assigns an active eligible driver to a vehicle as their soft-bounded default driver.

> [!IMPORTANT]
> **Strict Unassign-First Invariant**:
> 1. If the driver is already assigned to another vehicle, the request is rejected with `409 Conflict`. The driver must be unassigned from their current vehicle first.
> 2. If the vehicle already has an assigned driver, the request is rejected with `409 Conflict`. The current driver must be unassigned first before assigning a new driver.

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

### 11. Unassign Driver from Vehicle

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

### 12. Driver Directory (List All Drivers)

Lists all eligible driver accounts with their live assignment status (`AVAILABLE` vs `ASSIGNED`) and attached truck details.

- **HTTP Method**: `GET`
- **URL**: `/api/fleet/drivers`
- **Authentication**: Required (`mg_sid` cookie)
- **Permission Required**: `fleet.view`

#### Query Parameters

| Parameter | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `search` | String | No | Search keyword matching first name, last name, or username |
| `availableOnly` | Boolean | No | Filter to only unassigned drivers (`true` / `false`) |

#### Response: `200 OK` (Success)

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

### 13. List Available Drivers

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

---

### 14. Fleet Register Page Options

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

---

## Maintenance & Preventive Maintenance (PM) Endpoints

### 11. Record Single-Point Return Odometer Reading

Records single-point odometer reading upon plant check-in/return during post-dispatch operations. Automatically updates the truck's registered odometer, tracks distance driven this trip, evaluates the 5,000-km preventive maintenance threshold, and emits a centralized history log.

- **HTTP Method**: `POST`
- **URL**: `/api/fleet/maintenance/odometer`
- **Authentication**: Required (`mg_sid` cookie)
- **Permission Required**: `fleet.manage`

#### Request Body

| Field | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `truckId` | UUID | Yes | Target truck UUID |
| `odometerReading` | Integer | Yes | Non-negative integer reading in km (must be >= `truck.current_odometer`) |
| `source` | String | No | Source of reading (default: `'POST_DISPATCH_RETURN'`) |
| `notes` | String | No | Optional supervisor notes or remarks |

```json
{
  "truckId": "3c82ae11-4c79-4a0d-85a2-c1ad6052a748",
  "odometerReading": 45500,
  "source": "POST_DISPATCH_RETURN",
  "notes": "End of shift return check-in"
}
```

#### Response: `201 Created` (Success)

```json
{
  "status": "success",
  "message": "Odometer reading recorded successfully.",
  "data": {
    "logId": "5ca9dc91-d5eb-4e9a-8450-9c1680541392",
    "truckId": "3c82ae11-4c79-4a0d-85a2-c1ad6052a748",
    "plateNumber": "ABC-1001",
    "currentOdometer": 45500,
    "previousOdometer": 45200,
    "distanceDrivenThisTrip": 300,
    "lastPmOdometer": 40000,
    "distanceSinceLastPm": 5500,
    "isPmDue": true,
    "remainingKmBeforePm": 0,
    "loggedAt": "2026-09-18T05:30:00.000Z"
  }
}
```

#### Response: `400 Bad Request` (Monotonic Violation)

```json
{
  "status": "fail",
  "message": "New odometer reading (44000 km) cannot be less than the current odometer reading (45200 km)."
}
```

---

### 12. View Truck Odometer Log History

Retrieves paginated history of odometer logs recorded for a specific truck.

- **HTTP Method**: `GET`
- **URL**: `/api/fleet/maintenance/odometer/truck/:truckId`
- **Authentication**: Required (`mg_sid` cookie)
- **Permission Required**: `fleet.view`

#### Query Parameters

| Parameter | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `page` | Integer | No | Page number (default: 1) |
| `limit` | Integer | No | Items per page (default: 50, max: 100) |

#### Response: `200 OK` (Success)

```json
{
  "status": "success",
  "data": {
    "truckId": "3c82ae11-4c79-4a0d-85a2-c1ad6052a748",
    "plateNumber": "ABC-1001",
    "model": "Isuzu Elf N-Series",
    "currentOdometer": 45500,
    "lastPmOdometer": 40000,
    "count": 1,
    "total": 1,
    "page": 1,
    "limit": 50,
    "logs": [
      {
        "id": "5ca9dc91-d5eb-4e9a-8450-9c1680541392",
        "truckId": "3c82ae11-4c79-4a0d-85a2-c1ad6052a748",
        "odometerReading": 45500,
        "loggedBy": "11111111-2222-3333-4444-555555555555",
        "loggedByName": "Logistics Supervisor",
        "source": "POST_DISPATCH_RETURN",
        "notes": "End of shift return check-in",
        "loggedAt": "2026-09-18T05:30:00.000Z"
      }
    ]
  }
}
```

---

### 13. View Fleet PM Status Overview

Retrieves a summary of all fleet trucks with computed 5,000-km preventive maintenance indicators, distance driven since last PM service, and remaining kilometers.

- **HTTP Method**: `GET`
- **URL**: `/api/fleet/maintenance/pm-overview`
- **Authentication**: Required (`mg_sid` cookie)
- **Permission Required**: `fleet.view`

#### Query Parameters

| Parameter | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `status` | String | No | Filter by truck status (`ACTIVE`, `UNDER_MAINTENANCE`, etc.) |
| `search` | String | No | Search by plate number or truck model |
| `isPmDue` | Boolean | No | Filter by PM due status (`true` / `false`) |

#### Response: `200 OK` (Success)

```json
{
  "status": "success",
  "data": {
    "count": 5,
    "summary": {
      "totalVehicles": 5,
      "operationalVehicles": 3,
      "pmDueTotal": 2,
      "operationalPmDue": 1
    },
    "trucks": [
      {
        "id": "3c82ae11-4c79-4a0d-85a2-c1ad6052a748",
        "plateNumber": "ABC-1001",
        "model": "Isuzu Elf N-Series",
        "yearModel": 2022,
        "status": "ACTIVE",
        "driverId": "22222222-3333-4444-5555-666666666666",
        "driverName": "Juan Driver",
        "currentOdometer": 45500,
        "lastPmOdometer": 40000,
        "distanceSinceLastPm": 5500,
        "isPmDue": true,
        "remainingKmBeforePm": 0,
        "createdAt": "2026-08-27T21:40:00.000Z",
        "updatedAt": "2026-09-18T05:30:00.000Z"
      }
    ]
  }
}
```

---

## Safety Inspections (Issue-Reporting Only — No Checklists)

Safety inspections allow supervisors or authorized personnel to log physical vehicle inspections without cumbersome checklist schemas. If an inspection fails (`result === 'FAILED'`), the vehicle asset is immediately and automatically grounded (`status -> 'UNDER_MAINTENANCE'`) in an atomic transaction while retaining the assigned driver.

### 5. Record Safety Inspection

Records a vehicle safety inspection and automatically grounds the vehicle if failed.

- **HTTP Method**: `POST`
- **URL**: `/api/fleet/maintenance/inspections`
- **Authentication**: Required (`mg_sid` cookie)
- **Permission Required**: `fleet.manage`

#### Request Body

```json
{
  "truckId": "3c82ae11-4c79-4a0d-85a2-c1ad6052a748",
  "result": "FAILED",
  "findings": "Brake line leaking fluid near rear axle; pedal spongey.",
  "issueDetected": true,
  "inspectionDate": "2026-09-18T08:00:00.000Z"
}
```

#### Response: `201 Created` (Success)

```json
{
  "status": "success",
  "message": "Vehicle inspection recorded successfully.",
  "data": {
    "inspection": {
      "id": "7b82fe10-6a55-4bc9-9302-d922a9452011",
      "truckId": "3c82ae11-4c79-4a0d-85a2-c1ad6052a748",
      "plateNumber": "ABC-1001",
      "inspectorId": "11111111-2222-3333-4444-555555555555",
      "inspectorName": "Logistics Supervisor",
      "result": "FAILED",
      "findings": "Brake line leaking fluid near rear axle; pedal spongey.",
      "issueDetected": true,
      "inspectionDate": "2026-09-18T08:00:00.000Z"
    },
    "truck": {
      "id": "3c82ae11-4c79-4a0d-85a2-c1ad6052a748",
      "plateNumber": "ABC-1001",
      "previousStatus": "ACTIVE",
      "currentStatus": "UNDER_MAINTENANCE",
      "isGrounded": true
    }
  }
}
```

---

### 6. View Truck Inspections History

Retrieves paginated safety inspection records for a specific vehicle asset.

- **HTTP Method**: `GET`
- **URL**: `/api/fleet/maintenance/inspections/truck/:truckId`
- **Authentication**: Required (`mg_sid` cookie)
- **Permission Required**: `fleet.view`

#### Response: `200 OK` (Success)

```json
{
  "status": "success",
  "data": {
    "truckId": "3c82ae11-4c79-4a0d-85a2-c1ad6052a748",
    "plateNumber": "ABC-1001",
    "count": 1,
    "total": 1,
    "page": 1,
    "limit": 50,
    "inspections": [
      {
        "id": "7b82fe10-6a55-4bc9-9302-d922a9452011",
        "truckId": "3c82ae11-4c79-4a0d-85a2-c1ad6052a748",
        "plateNumber": "ABC-1001",
        "truckModel": "Isuzu Elf N-Series",
        "inspectorId": "11111111-2222-3333-4444-555555555555",
        "inspectorName": "Logistics Supervisor",
        "inspectorUsername": "logistics_supervisor",
        "result": "FAILED",
        "findings": "Brake line leaking fluid near rear axle; pedal spongey.",
        "issueDetected": true,
        "inspectionDate": "2026-09-18T08:00:00.000Z"
      }
    ]
  }
}
```

---

### 7. Get Inspection Record by ID

Retrieves a single safety inspection record by its UUID.

- **HTTP Method**: `GET`
- **URL**: `/api/fleet/maintenance/inspections/:id`
- **Authentication**: Required (`mg_sid` cookie)
- **Permission Required**: `fleet.view`

#### Response: `200 OK` (Success)

```json
{
  "status": "success",
  "data": {
    "inspection": {
      "id": "7b82fe10-6a55-4bc9-9302-d922a9452011",
      "truckId": "3c82ae11-4c79-4a0d-85a2-c1ad6052a748",
      "plateNumber": "ABC-1001",
      "truckModel": "Isuzu Elf N-Series",
      "truckStatus": "UNDER_MAINTENANCE",
      "inspectorId": "11111111-2222-3333-4444-555555555555",
      "inspectorName": "Logistics Supervisor",
      "inspectorUsername": "logistics_supervisor",
      "result": "FAILED",
      "findings": "Brake line leaking fluid near rear axle; pedal spongey.",
      "issueDetected": true,
      "inspectionDate": "2026-09-18T08:00:00.000Z"
    }
  }
}
```

---

## Mid-Route Incident & Breakdown Reporting

Records unexpected roadside failures, accidents, tire punctures, and mechanical breakdowns. Critical incidents (`severity === 'CRITICAL'`) automatically ground the vehicle (`status -> 'UNDER_MAINTENANCE'`) while retaining the assigned driver.

### 8. Get Incident Types Catalog

Retrieves reference list of registered incident classification categories.

- **HTTP Method**: `GET`
- **URL**: `/api/fleet/maintenance/incidents/types`
- **Authentication**: Required (`mg_sid` cookie)
- **Permission Required**: `fleet.view`

#### Response: `200 OK` (Success)

```json
{
  "status": "success",
  "data": {
    "count": 4,
    "types": [
      { "id": 1, "typeName": "MECHANICAL_DEFECT", "createdAt": "2026-09-18T00:00:00.000Z" },
      { "id": 2, "typeName": "ROAD_ACCIDENT", "createdAt": "2026-09-18T00:00:00.000Z" },
      { "id": 3, "typeName": "TIRE_FAILURE", "createdAt": "2026-09-18T00:00:00.000Z" },
      { "id": 4, "typeName": "LEAK_ISSUE", "createdAt": "2026-09-18T00:00:00.000Z" }
    ]
  }
}
```

---

### 9. Report Incident / Breakdown

Records a mid-route breakdown or roadside incident. If severity is `'CRITICAL'`, the truck is automatically grounded to `'UNDER_MAINTENANCE'`.

- **HTTP Method**: `POST`
- **URL**: `/api/fleet/maintenance/incidents`
- **Authentication**: Required (`mg_sid` cookie)
- **Permission Required**: `fleet.manage`

#### Response: `201 Created` (Success)

```json
{
  "status": "success",
  "message": "Incident reported successfully.",
  "data": {
    "incident": {
      "id": "8c93ef21-7b66-4cd0-a413-e033b0563122",
      "truckId": "3c82ae11-4c79-4a0d-85a2-c1ad6052a748",
      "plateNumber": "ABC-1001",
      "reporterId": "11111111-2222-3333-4444-555555555555",
      "reporterName": "Logistics Supervisor",
      "incidentTypeId": 1,
      "incidentTypeName": "MECHANICAL_DEFECT",
      "severity": "CRITICAL",
      "incidentLocation": "Km 14 Panacan Highway, Davao City",
      "description": "Engine overheating with thick white smoke; truck stalled roadside.",
      "reportDate": "2026-09-18T08:15:00.000Z"
    },
    "truck": {
      "id": "3c82ae11-4c79-4a0d-85a2-c1ad6052a748",
      "plateNumber": "ABC-1001",
      "previousStatus": "ACTIVE",
      "currentStatus": "UNDER_MAINTENANCE",
      "isGrounded": true
    }
  }
}
```

---

### 10. List Fleet Incidents

Retrieves fleet-wide incident reports with filtering and pagination.

- **HTTP Method**: `GET`
- **URL**: `/api/fleet/maintenance/incidents`
- **Authentication**: Required (`mg_sid` cookie)
- **Permission Required**: `fleet.view`

#### Response: `200 OK` (Success)

```json
{
  "status": "success",
  "data": {
    "count": 1,
    "total": 1,
    "page": 1,
    "limit": 50,
    "incidents": [
      {
        "id": "8c93ef21-7b66-4cd0-a413-e033b0563122",
        "truckId": "3c82ae11-4c79-4a0d-85a2-c1ad6052a748",
        "plateNumber": "ABC-1001",
        "truckModel": "Isuzu Elf N-Series",
        "truckStatus": "UNDER_MAINTENANCE",
        "reporterId": "11111111-2222-3333-4444-555555555555",
        "reporterName": "Logistics Supervisor",
        "reporterUsername": "logistics_supervisor",
        "incidentTypeId": 1,
        "incidentTypeName": "MECHANICAL_DEFECT",
        "severity": "CRITICAL",
        "incidentLocation": "Km 14 Panacan Highway, Davao City",
        "description": "Engine overheating with thick white smoke; truck stalled roadside.",
        "reportDate": "2026-09-18T08:15:00.000Z"
      }
    ]
  }
}
```

---

### 11. View Truck Incident History

Retrieves incident reports for a specific vehicle asset.

- **HTTP Method**: `GET`
- **URL**: `/api/fleet/maintenance/incidents/truck/:truckId`
- **Authentication**: Required (`mg_sid` cookie)
- **Permission Required**: `fleet.view`

#### Response: `200 OK` (Success)

```json
{
  "status": "success",
  "data": {
    "truckId": "3c82ae11-4c79-4a0d-85a2-c1ad6052a748",
    "plateNumber": "ABC-1001",
    "count": 1,
    "total": 1,
    "page": 1,
    "limit": 50,
    "incidents": [
      {
        "id": "8c93ef21-7b66-4cd0-a413-e033b0563122",
        "truckId": "3c82ae11-4c79-4a0d-85a2-c1ad6052a748",
        "plateNumber": "ABC-1001",
        "truckModel": "Isuzu Elf N-Series",
        "truckStatus": "UNDER_MAINTENANCE",
        "reporterId": "11111111-2222-3333-4444-555555555555",
        "reporterName": "Logistics Supervisor",
        "reporterUsername": "logistics_supervisor",
        "incidentTypeId": 1,
        "incidentTypeName": "MECHANICAL_DEFECT",
        "severity": "CRITICAL",
        "incidentLocation": "Km 14 Panacan Highway, Davao City",
        "description": "Engine overheating with thick white smoke; truck stalled roadside.",
        "reportDate": "2026-09-18T08:15:00.000Z"
      }
    ]
  }
}
```

---

### 12. Get Incident Report by ID

Retrieves a single incident report by its UUID.

- **HTTP Method**: `GET`
- **URL**: `/api/fleet/maintenance/incidents/:id`
- **Authentication**: Required (`mg_sid` cookie)
- **Permission Required**: `fleet.view`

#### Response: `200 OK` (Success)

```json
{
  "status": "success",
  "data": {
    "incident": {
      "id": "8c93ef21-7b66-4cd0-a413-e033b0563122",
      "truckId": "3c82ae11-4c79-4a0d-85a2-c1ad6052a748",
      "plateNumber": "ABC-1001",
      "truckModel": "Isuzu Elf N-Series",
      "truckStatus": "UNDER_MAINTENANCE",
      "reporterId": "11111111-2222-3333-4444-555555555555",
      "reporterName": "Logistics Supervisor",
      "reporterUsername": "logistics_supervisor",
      "incidentTypeId": 1,
      "incidentTypeName": "MECHANICAL_DEFECT",
      "severity": "CRITICAL",
      "incidentLocation": "Km 14 Panacan Highway, Davao City",
      "description": "Engine overheating with thick white smoke; truck stalled roadside.",
      "reportDate": "2026-09-18T08:15:00.000Z"
    }
  }
}
```

---

### 13. List Maintenance Types

Retrieves the catalog of maintenance service types (e.g. `PREVENTIVE`, `CORRECTIVE`, `EMERGENCY`).

- **HTTP Method**: `GET`
- **URL**: `/api/fleet/maintenance/work-orders/types`
- **Authentication**: Required (`mg_sid` cookie)
- **Permission Required**: `fleet.view`

#### Response: `200 OK` (Success)

```json
{
  "status": "success",
  "data": {
    "count": 3,
    "types": [
      {
        "id": 1,
        "typeName": "PREVENTIVE",
        "description": "Routine scheduled service (5,000-km intervals, oil, filters, tune-up)"
      },
      {
        "id": 2,
        "typeName": "CORRECTIVE",
        "description": "Unscheduled repairs discovered during daily inspection or operations"
      },
      {
        "id": 3,
        "typeName": "EMERGENCY",
        "description": "Critical road breakdowns requiring roadside towing or urgent repairs"
      }
    ]
  }
}
```

---

### 14. Create Maintenance Work Order

Creates a new work order for vehicle maintenance. If `estimatedCost >= 5000.00` or `requiresApproval: true`, the work order is automatically placed in `'PENDING'` status and creates an entry in `approval_requests`. Otherwise, it initiates in `'APPROVED'`. The vehicle is automatically grounded to `'UNDER_MAINTENANCE'`.

- **HTTP Method**: `POST`
- **URL**: `/api/fleet/maintenance/work-orders`
- **Authentication**: Required (`mg_sid` cookie)
- **Permission Required**: `fleet.manage`

#### Request Body

```json
{
  "truckId": "3c82ae11-4c79-4a0d-85a2-c1ad6052a748",
  "maintenanceTypeId": 1,
  "inspectionId": null,
  "incidentReportId": null,
  "shopName": "Bunawan Heavy Repair Center",
  "estimatedCost": 7500.00,
  "description": "5,000-km preventive maintenance overhaul and brake pad replacement",
  "scheduledDate": "2026-09-20T08:00:00.000Z"
}
```

| Field | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `truckId` | UUID | Yes | Target truck UUID |
| `maintenanceTypeId` | Integer | Yes | Foreign key to `maintenance_types.id` |
| `inspectionId` | UUID | No | Optional reference to triggered `safety_inspections.id` |
| `incidentReportId` | UUID | No | Optional reference to triggered `incident_reports.id` |
| `shopName` | String | No | Repair shop or service center name |
| `estimatedCost` | Number | No | Estimated cost in PHP (if >= 5000.00, triggers approval gate) |
| `description` | String | Yes | Scope of work or diagnosis |
| `scheduledDate` | ISO 8601 | No | Scheduled date for service execution |

#### Response: `201 Created` (Success)

```json
{
  "status": "success",
  "message": "Work order created successfully.",
  "data": {
    "workOrder": {
      "id": "e4a5d89b-90f1-43cb-b091-66778899aabb",
      "truckId": "3c82ae11-4c79-4a0d-85a2-c1ad6052a748",
      "plateNumber": "ABC-1001",
      "truckModel": "Isuzu Elf N-Series",
      "maintenanceTypeId": 1,
      "maintenanceTypeName": "PREVENTIVE",
      "inspectionId": null,
      "incidentReportId": null,
      "shopName": "Bunawan Heavy Repair Center",
      "estimatedCost": 7500.00,
      "description": "5,000-km preventive maintenance overhaul and brake pad replacement",
      "status": "PENDING",
      "scheduledDate": "2026-09-20T08:00:00.000Z",
      "createdAt": "2026-09-18T09:00:00.000Z"
    },
    "requiresApproval": true,
    "approvalRequest": {
      "id": "f5b6e90c-01a2-54dc-c102-778899aabbcc",
      "status": "PENDING",
      "estimatedCost": 7500.00
    },
    "truck": {
      "id": "3c82ae11-4c79-4a0d-85a2-c1ad6052a748",
      "plateNumber": "ABC-1001",
      "status": "UNDER_MAINTENANCE",
      "isGrounded": true
    }
  }
}
```

---

### 15. List Fleet Work Orders

Retrieves paginated work orders with filtering across vehicle, status, maintenance type, and date range.

- **HTTP Method**: `GET`
- **URL**: `/api/fleet/maintenance/work-orders`
- **Authentication**: Required (`mg_sid` cookie)
- **Permission Required**: `fleet.view`

#### Response: `200 OK` (Success)

```json
{
  "status": "success",
  "data": {
    "count": 1,
    "total": 1,
    "page": 1,
    "limit": 50,
    "workOrders": [
      {
        "id": "e4a5d89b-90f1-43cb-b091-66778899aabb",
        "truckId": "3c82ae11-4c79-4a0d-85a2-c1ad6052a748",
        "plateNumber": "ABC-1001",
        "truckModel": "Isuzu Elf N-Series",
        "truckStatus": "UNDER_MAINTENANCE",
        "maintenanceTypeId": 1,
        "maintenanceTypeName": "PREVENTIVE",
        "inspectionId": null,
        "incidentReportId": null,
        "shopName": "Bunawan Heavy Repair Center",
        "estimatedCost": 7500.00,
        "description": "5,000-km preventive maintenance overhaul and brake pad replacement",
        "status": "PENDING",
        "scheduledDate": "2026-09-20T08:00:00.000Z",
        "approvalStatus": "PENDING",
        "createdAt": "2026-09-18T09:00:00.000Z"
      }
    ]
  }
}
```

---

### 16. Get Work Order Details by ID

Retrieves single work order details including linked approval requests, inspections, and incidents.

- **HTTP Method**: `GET`
- **URL**: `/api/fleet/maintenance/work-orders/:id`
- **Authentication**: Required (`mg_sid` cookie)
- **Permission Required**: `fleet.view`

#### Response: `200 OK` (Success)

```json
{
  "status": "success",
  "data": {
    "workOrder": {
      "id": "e4a5d89b-90f1-43cb-b091-66778899aabb",
      "truckId": "3c82ae11-4c79-4a0d-85a2-c1ad6052a748",
      "plateNumber": "ABC-1001",
      "truckModel": "Isuzu Elf N-Series",
      "truckStatus": "UNDER_MAINTENANCE",
      "maintenanceTypeId": 1,
      "maintenanceTypeName": "PREVENTIVE",
      "inspectionId": null,
      "incidentReportId": null,
      "shopName": "Bunawan Heavy Repair Center",
      "estimatedCost": 7500.00,
      "description": "5,000-km preventive maintenance overhaul and brake pad replacement",
      "status": "PENDING",
      "scheduledDate": "2026-09-20T08:00:00.000Z",
      "approvalStatus": "PENDING",
      "createdAt": "2026-09-18T09:00:00.000Z",
      "approvalRequest": {
        "id": "f5b6e90c-01a2-54dc-c102-778899aabbcc",
        "status": "PENDING",
        "estimatedCost": 7500.00,
        "decidedBy": null,
        "decisionDate": null,
        "remarks": null
      }
    }
  }
}
```

---

### 17. Update Work Order Status

Updates operational progress of a work order through allowed state transitions. Direct completion to `COMPLETED` via this endpoint is strictly prohibited and returns `400 Bad Request`.

- **HTTP Method**: `PATCH`
- **URL**: `/api/fleet/maintenance/work-orders/:id/status`
- **Authentication**: Required (`mg_sid` cookie)
- **Permission Required**: `fleet.manage`

#### Request Body

```json
{
  "status": "IN_PROGRESS"
}
```

#### Response: `200 OK` (Success)

```json
{
  "status": "success",
  "message": "Work order status updated to IN_PROGRESS.",
  "data": {
    "workOrder": {
      "id": "e4a5d89b-90f1-43cb-b091-66778899aabb",
      "previousStatus": "APPROVED",
      "currentStatus": "IN_PROGRESS",
      "truckId": "3c82ae11-4c79-4a0d-85a2-c1ad6052a748",
      "plateNumber": "ABC-1001",
      "updatedAt": "2026-09-18T10:00:00.000Z"
    }
  }
}
```

#### Response: `400 Bad Request` (Attempting Manual Completion)

```json
{
  "status": "fail",
  "message": "Work order can only be completed by finalizing the maintenance log via /api/fleet/maintenance/work-orders/:id/finalize"
}
```

---

### 18. Executive Cost Approval Decision

Approves or rejects a high-cost repair work order exceeding the ₱5,000.00 threshold. Restricted to executive administrators (`Super Admin` or `Admin`).

- **HTTP Method**: `POST`
- **URL**: `/api/fleet/maintenance/work-orders/:id/approve`
- **Authentication**: Required (`mg_sid` cookie)
- **Permission / Role Required**: `users.manage` or role `Super Admin` / `Admin` (Supervisors receive `403 Forbidden`)

#### Request Body

```json
{
  "isApproved": true,
  "remarks": "Approved. Schedule repair with Bunawan Heavy Repair Center immediately."
}
```

#### Response: `200 OK` (Success)

```json
{
  "status": "success",
  "message": "Work order cost approval request decided successfully.",
  "data": {
    "workOrder": {
      "id": "e4a5d89b-90f1-43cb-b091-66778899aabb",
      "truckId": "3c82ae11-4c79-4a0d-85a2-c1ad6052a748",
      "plateNumber": "ABC-1001",
      "status": "APPROVED",
      "updatedAt": "2026-09-18T09:30:00.000Z"
    },
    "approvalRequest": {
      "id": "f5b6e90c-01a2-54dc-c102-778899aabbcc",
      "status": "APPROVED",
      "decidedBy": "00000000-0000-0000-0000-000000000001",
      "decisionDate": "2026-09-18T09:30:00.000Z",
      "remarks": "Approved. Schedule repair with Bunawan Heavy Repair Center immediately."
    }
  }
}
```

---

### 19. Finalize Maintenance Log & Release Vehicle

Completes the repair lifecycle by logging official parts/labor costs, receipt number, downtime, and odometer reading. Updates the work order status to `'COMPLETED'`, resets the 5,000-km PM baseline if the work order was `PREVENTIVE`, and restores the vehicle operational condition to `'ACTIVE'` while preserving driver assignment.

- **HTTP Method**: `POST`
- **URL**: `/api/fleet/maintenance/work-orders/:id/finalize`
- **Authentication**: Required (`mg_sid` cookie)
- **Permission Required**: `fleet.manage`

#### Request Body

```json
{
  "officialReceiptNumber": "OR-2026-88991",
  "severity": "MEDIUM",
  "dateStarted": "2026-09-18T08:00:00.000Z",
  "dateResolved": "2026-09-19T17:00:00.000Z",
  "partsCost": 4500.00,
  "laborCost": 2200.50,
  "downtimeDays": 1,
  "odometerAtService": 46200
}
```

#### Response: `201 Created` (Success)

```json
{
  "status": "success",
  "message": "Maintenance log finalized and vehicle operational status restored.",
  "data": {
    "maintenanceLog": {
      "id": "c3b2a109-8765-4321-fedc-ba9876543210",
      "workOrderId": "e4a5d89b-90f1-43cb-b091-66778899aabb",
      "maintenanceTypeId": 1,
      "maintenanceTypeName": "PREVENTIVE",
      "severity": "MEDIUM",
      "dateStarted": "2026-09-18T08:00:00.000Z",
      "dateResolved": "2026-09-19T17:00:00.000Z",
      "partsCost": 4500.00,
      "laborCost": 2200.50,
      "totalCost": 6700.50,
      "downtimeDays": 1,
      "odometerAtService": 46200,
      "officialReceiptNumber": "OR-2026-88991",
      "createdAt": "2026-09-19T17:05:00.000Z"
    },
    "workOrder": {
      "id": "e4a5d89b-90f1-43cb-b091-66778899aabb",
      "status": "COMPLETED",
      "shopName": "Bunawan Heavy Repair Center",
      "description": "5,000-km preventive maintenance overhaul and brake pad replacement"
    },
    "truck": {
      "id": "3c82ae11-4c79-4a0d-85a2-c1ad6052a748",
      "plateNumber": "ABC-1001",
      "status": "ACTIVE",
      "currentOdometer": 46200,
      "lastPmOdometer": 46200,
      "isPmReset": true
    }
  }
}
```

#### Response: `409 Conflict` (Duplicate Receipt Number)

```json
{
  "status": "fail",
  "message": "Official receipt number 'OR-2026-88991' has already been registered in maintenance logs"
}
```

---

### 20. Query Historical Maintenance Logs

Retrieves paginated historical maintenance logs with search across receipt numbers, plate numbers, and repair shops.

- **HTTP Method**: `GET`
- **URL**: `/api/fleet/maintenance/logs`
- **Authentication**: Required (`mg_sid` cookie)
- **Permission Required**: `fleet.view`

#### Response: `200 OK` (Success)

```json
{
  "status": "success",
  "data": {
    "count": 1,
    "total": 1,
    "page": 1,
    "limit": 50,
    "logs": [
      {
        "id": "c3b2a109-8765-4321-fedc-ba9876543210",
        "workOrderId": "e4a5d89b-90f1-43cb-b091-66778899aabb",
        "truckId": "3c82ae11-4c79-4a0d-85a2-c1ad6052a748",
        "plateNumber": "ABC-1001",
        "maintenanceTypeId": 1,
        "maintenanceTypeName": "PREVENTIVE",
        "severity": "MEDIUM",
        "dateStarted": "2026-09-18T08:00:00.000Z",
        "dateResolved": "2026-09-19T17:00:00.000Z",
        "partsCost": 4500.00,
        "laborCost": 2200.50,
        "totalCost": 6700.50,
        "downtimeDays": 1,
        "odometerAtService": 46200,
        "officialReceiptNumber": "OR-2026-88991",
        "createdAt": "2026-09-19T17:05:00.000Z",
        "truck": {
          "id": "3c82ae11-4c79-4a0d-85a2-c1ad6052a748",
          "plateNumber": "ABC-1001",
          "model": "Isuzu Elf N-Series",
          "status": "ACTIVE"
        },
        "workOrder": {
          "shopName": "Bunawan Heavy Repair Center",
          "description": "5,000-km preventive maintenance overhaul and brake pad replacement"
        }
      }
    ]
  }
}
```



