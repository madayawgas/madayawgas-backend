# MadayawGas API Contract: Fleet Maintenance & Preventive Maintenance (PM)

This document specifies the HTTP endpoints, payload structures, headers, authentication mechanics, RBAC permissions, and response schemas for single-point yard return odometer logging, distance-based 5,000-km Preventive Maintenance (PM) tracking, and odometer history in the MadayawGas Backend API.

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
| `fleet.view` | View PM overview summaries, odometer logs, and vehicle mileage history | Super Admin, Admin, Fleet Manager |
| `fleet.manage` | Record yard return odometer readings and update vehicle mileage | Super Admin, Admin, Fleet Manager |

---

## Domain Concepts: Distance-Based 5,000-km PM Tracking

- **Single-Point Return Check-in**: Trucks log their odometer reading upon return to the Bunawan yard during post-dispatch operations. There is no duplicate pre-trip/post-trip entry.
- **Monotonic Integrity**: Odometer readings must strictly increase. Any attempt to record an odometer reading lower than the vehicle's current registered odometer is rejected with `400 Bad Request`.
- **5,000-km PM Evaluation**:
  - Threshold formula: `distanceSinceLastPm = currentOdometer - lastPmOdometer`.
  - Condition: `isPmDue = distanceSinceLastPm >= 5000`.
  - Remaining distance: `remainingKmBeforePm = Math.max(0, 5000 - distanceSinceLastPm)`.

---

## Endpoints

### 1. Record Single-Point Return Odometer Reading

Records single-point odometer reading upon plant check-in/return during post-dispatch operations. Automatically updates the truck's registered odometer, tracks distance driven this trip, evaluates the 5,000-km preventive maintenance threshold, and emits a centralized history log.

- **HTTP Method**: `POST`
- **URL**: `/api/fleet/maintenance/odometer`
- **Authentication**: Required (`mg_sid` cookie)
- **Permission Required**: `fleet.manage`

#### Request Body

```json
{
  "truckId": "3c82ae11-4c79-4a0d-85a2-c1ad6052a748",
  "odometerReading": 45500,
  "source": "POST_DISPATCH_RETURN",
  "notes": "End of shift return check-in"
}
```

| Field | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `truckId` | UUID | Yes | Target truck UUID |
| `odometerReading` | Integer | Yes | Non-negative integer reading in km (must be >= `truck.current_odometer`) |
| `source` | String | No | Source of reading (default: `'POST_DISPATCH_RETURN'`) |
| `notes` | String | No | Optional supervisor notes or remarks |

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

### 2. View Truck Odometer Log History

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

### 3. View Fleet PM Status Overview

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

### 4. Record Vehicle Mileage (Legacy)

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

| Field | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `truckId` | UUID | Yes | Target truck UUID |
| `result` | String | Yes | Inspection outcome: `'PASSED'`, `'NEEDS_ATTENTION'`, or `'FAILED'` |
| `findings` | String | Yes | Non-empty text report describing inspection observations and findings |
| `issueDetected` | Boolean | No | Indicates whether defects were found (defaults to `true` on `'FAILED'` or `'NEEDS_ATTENTION'`, `false` on `'PASSED'`) |
| `inspectionDate` | ISO 8601 | No | Optional timestamp of inspection (defaults to `NOW()`) |

#### Response: `201 Created` (Success - Vehicle Grounded on Failure)

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

#### Query Parameters

| Parameter | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `page` | Integer | No | Page number (default: `1`) |
| `limit` | Integer | No | Page size limit (default: `50`, max: `100`) |
| `result` | String | No | Filter by result (`'PASSED'`, `'NEEDS_ATTENTION'`, `'FAILED'`) |

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

#### Request Body

```json
{
  "truckId": "3c82ae11-4c79-4a0d-85a2-c1ad6052a748",
  "incidentTypeId": 1,
  "severity": "CRITICAL",
  "incidentLocation": "Km 14 Panacan Highway, Davao City",
  "description": "Engine overheating with thick white smoke; truck stalled roadside.",
  "reportDate": "2026-09-18T08:15:00.000Z"
}
```

| Field | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `truckId` | UUID | Yes | Target truck UUID |
| `incidentTypeId` | Integer | Yes | Foreign key to `incident_types.id` |
| `severity` | String | Yes | Severity level: `'LOW'`, `'MEDIUM'`, `'HIGH'`, or `'CRITICAL'` |
| `description` | String | Yes | Detailed description of the incident |
| `incidentLocation` | String | No | Road location, street, or landmark where incident occurred |
| `reportDate` | ISO 8601 | No | Incident occurrence timestamp (defaults to `NOW()`) |

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

#### Query Parameters

| Parameter | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `page` | Integer | No | Page number (default: `1`) |
| `limit` | Integer | No | Page size limit (default: `50`, max: `100`) |
| `truckId` | UUID | No | Filter by specific truck |
| `severity` | String | No | Filter by severity (`'LOW'`, `'MEDIUM'`, `'HIGH'`, `'CRITICAL'`) |
| `incidentTypeId` | Integer | No | Filter by incident type ID |
| `startDate` | ISO Date | No | Filter reports after date |
| `endDate` | ISO Date | No | Filter reports before date |
| `search` | String | No | Case-insensitive search on description, plate number, or location |

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

