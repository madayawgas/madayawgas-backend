# Executive Dashboard API Contract

**Endpoint:** `GET /api/dashboard/overview`  
**Authentication:** Session cookie (`mg_sid`) or `Authorization: Bearer <token>`  
**Permission:** `dashboard.view` (`Super Admin` and `Admin`)

---

## Overview

Aggregates cross-domain operational KPIs across Fleet, Trips & Schedules, Operations (SOS Alerts, Apprehensions, Fuel), Plant Inventory, and Sales in a single parallelized query response.

## Response: `200 OK`

```json
{
  "status": "success",
  "data": {
    "fleet": {
      "totalVehicles": 12,
      "activeVehicles": 10,
      "underMaintenance": 1,
      "inactiveOrRetired": 1,
      "pmDueCount": 2
    },
    "trips": {
      "activeTrips": 4,
      "returnedAwaitingReconciliation": 1,
      "completedToday": 3,
      "scheduledToday": 6
    },
    "operations": {
      "activeSosAlerts": 0,
      "pendingApprehensions": 1,
      "fuelCostToday": 4500.00,
      "fuelCost30d": 128400.00,
      "fuelLiters30d": 2140.50
    },
    "inventory": {
      "totalFilled": 1450,
      "totalEmptyGood": 620,
      "totalDefective": 18
    },
    "sales": {
      "transactionsToday": 24,
      "transactions30d": 612,
      "revenueToday": 48500.00,
      "revenue30d": 1245000.00,
      "unverifiedInvoicesCount": 3
    },
    "generatedAt": "2026-11-17T02:15:00.000Z"
  }
}
```
