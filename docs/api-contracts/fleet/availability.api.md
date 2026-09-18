# MadayawGas API Contract: Fleet Overview & Availability

This document specifies the HTTP endpoints, payload structures, headers, authentication mechanics, RBAC permissions, and response schemas for fleet operational overview metrics and vehicle availability monitoring in the MadayawGas Backend API.

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
| `fleet.view` | View fleet overview, availability metrics, and vehicle status | Super Admin, Admin, Fleet Manager |
| `fleet.manage` | Update vehicle operational status and availability transitions | Super Admin, Admin, Fleet Manager |

---

## Domain Concepts: Operational Availability & State Transitions

- **Operational Availability**: All vehicles in `ACTIVE` status are operational and available for dispatch, whether they currently have their default driver assigned or are awaiting driver assignment.
- **Maintenance Preservation**: Transitioning a vehicle to `UNDER_MAINTENANCE` retains the soft-bounded default driver so the driver resumes operation once maintenance is completed.
- **Decommission / Deactivation Release**: Transitioning a vehicle to `INACTIVE` or `RETIRED` automatically unbinds and releases the driver back to the unassigned driver pool.

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

### 3. View Vehicle Status

Retrieves the current operational and availability status of a specific vehicle.

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

### 4. Set Vehicle Availability Status

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

| Field | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `status` | String | Yes | Target operational condition: `'ACTIVE'`, `'INACTIVE'`, `'UNDER_MAINTENANCE'`, `'RETIRED'` |

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
