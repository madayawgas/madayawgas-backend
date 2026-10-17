# System Permissions & RBAC Matrix

## 1. Role Permissions Matrix

| Permission | Super Admin | Admin | Plant Supervisor | Logistics Supervisor | Sales Supervisor | Sales Person | Driver | Description |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :--- |
| **`dashboard.view`** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | View the main operational dashboard |
| **`fleet.view`** | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | View fleet and maintenance overview & vehicle profiles |
| **`fleet.view_own`** | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ | ✅ | View details & maintenance for assigned truck only |
| **`fleet.manage`** | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | Register vehicles, update info, set condition, assign drivers, deactivate |
| **`route.view`** | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | View all route dispatch schedules and trip logs |
| **`route.view_own`** | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ | ✅ | View routes and trip schedules assigned to current user |
| **`route.manage`** | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | Create, update, assign, and dispatch delivery routes |
| **`inventory.view`** | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ | View inventory product catalog and stock levels |
| **`inventory.manage`** | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | Register, update, and deactivate product catalog items |
| **`inventory.plant.manage`** | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | Master plant stock management, supplier restocks, and yard defect quarantines |
| **`inventory.vehicle.manage`** | ✅ | ✅ | ❌ | ✅ | ✅ | ❌ | ❌ | Manage vehicle fleet stock, transfers between plant and trucks, and route reconciliations |
| **`sales.view`** | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | View all sales and customer profiles across the organization |
| **`sales.view_own`** | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ | View customer profiles and sales created by the current user |
| **`sales.create`** | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ | Register new sales customers and create frontline sales orders |
| **`sales.update`** | ✅ | ✅ | ❌ | ❌ | ✅ | ✅ | ❌ | Update sales customer profiles and sales orders |
| **`sales.delete`** | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | Delete, cancel, or void sales records |
| **`delivery.view`** | ✅ | ✅ | ❌ | ✅ | ✅ | ❌ | ❌ | View all delivery fulfillment transactions |
| **`delivery.view_own`** | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ | View delivery fulfillment assigned to the current user |
| **`delivery.update`** | ✅ | ✅ | ❌ | ✅ | ✅ | ❌ | ❌ | Update delivery statuses and completion records |
| **`delivery.update_own`**| ✅ | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ | Update delivery progress assigned to the current user |
| **`attendance.view`** | ✅ | ✅ | ❌ | ✅ | ✅ | ❌ | ❌ | View all employee duty shift attendance records |
| **`attendance.view_own`** | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ | View own duty shift attendance records |
| **`attendance.record`** | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ | Clock in and clock out of duty shifts |
| **`attendance.manage`** | ✅ | ✅ | ❌ | ✅ | ✅ | ❌ | ❌ | Clock in/out on behalf of personnel, void/manage attendance |
| **`apprehensions.view`** | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | View all roadside traffic apprehension records |
| **`apprehensions.view_own`** | ✅ | ✅ | ❌ | ✅ | ❌ | ✅ | ✅ | View roadside apprehensions involving own vehicle or trip |
| **`apprehensions.create`** | ✅ | ✅ | ❌ | ✅ | ❌ | ✅ | ✅ | Record road traffic apprehension with mandatory ticket proof |
| **`apprehensions.manage`** | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | Update, settle, or dispute road apprehension tickets |
| **`fuel.view`** | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | View all vehicle fuel intake records and consumption summaries |
| **`fuel.view_own`** | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ | ✅ | View fuel intake logs for assigned vehicle only |
| **`fuel.create`** | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ | ✅ | Record vehicle fuel intake, cost, and odometer reading |
| **`fuel.manage`** | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | Edit or delete vehicle fuel log records |
| **`alerts.view`** | ✅ | ✅ | ❌ | ✅ | ✅ | ❌ | ❌ | View organizational driver emergency alerts feed |
| **`alerts.view_own`** | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ | View own submitted driver emergency alerts |
| **`alerts.trigger`** | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ | Single-action mobile emergency alert SOS dispatch |
| **`alerts.manage`** | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | Acknowledge and resolve driver emergency alerts |
| **`users.view`** | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | View employee profiles and user lists |
| **`users.manage`** | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | Create accounts, reset credentials, deactivate, manage roles & permissions |
| **`history.view`** | ✅ | ✅ | ❌ | ✅ | ✅ | ❌ | ❌ | View system event historical audit logs |

> [!NOTE]
> * **Plant Supervisor**: Oversees Bunawan refilling yard bulk physical inventory, supplier purchases, defect quarantining, and yard return receiving. Has total control of master plant stock, but no direct control on vehicle fleet stock.
> * **Sales Supervisor**: Oversees frontline sales, customers, transactions, delivery fulfillment, vehicle stock, and post-trip reconciliation. Has full control of vehicle fleet stock, but limited control to plant stock (strictly moving between plant and vehicles via dispatch loads and return unloads).
> * **Driver Role**: Drivers possess authenticated login capabilities for the mobile application with frontline permissions (`attendance.record`, `attendance.view_own`, `apprehensions.create`, `apprehensions.view_own`, `fuel.create`, `fuel.view_own`, `alerts.trigger`, `alerts.view_own`, `route.view_own`, and `fleet.view_own`). Access to vehicle telemetry, maintenance, and trips is strictly scoped to the driver's assigned vehicle and trips.
> * **Multi-Role Employees**: Users assigned multiple roles (such as an employee holding both `Sales Supervisor` and `Logistics Supervisor`) automatically receive the union of all permissions across their assigned roles.
> * **Legacy Role Aliases**: `Fleet Manager` maps to `Logistics Supervisor`; `Sales Manager` maps to `Sales Supervisor`.

---

## 2. Complete Permissions Reference

| Permission | Subsystem Domain | Description |
| :--- | :--- | :--- |
| `dashboard.view` | Dashboard | View operational dashboard metrics and summaries. |
| `fleet.view` | Fleet & Maintenance | View fleet inventory, condition metrics, and vehicle records. |
| `fleet.view_own` | Fleet & Maintenance | View details and maintenance records for own assigned vehicle. |
| `fleet.manage` | Fleet & Maintenance | Register vehicles, update odometer/details, set status, and assign drivers. |
| `route.view` | Schedule & Trip | View all organizational route dispatch schedules. |
| `route.view_own` | Schedule & Trip | View routes and trip schedules assigned to the current user. |
| `route.manage` | Schedule & Trip | Create, update, assign, and manage route dispatches. |
| `inventory.view` | Inventory Management | View inventory products catalog and stock levels. |
| `inventory.manage` | Inventory Management | Register, modify, and deactivate inventory items. |
| `inventory.plant.manage` | Inventory Management | Manage master plant physical stock, supplier restocks, and yard defect quarantines. |
| `inventory.vehicle.manage` | Inventory Management | Manage vehicle fleet stock, transfers between plant and trucks, and route reconciliations. |
| `sales.view` | Sales & Delivery | View all customer accounts and sales records. |
| `sales.view_own` | Sales & Delivery | View sales and customers created by the current user. |
| `sales.create` | Sales & Delivery | Register new customer accounts and create sales orders. |
| `sales.update` | Sales & Delivery | Update customer account profiles and edit sales transactions. |
| `sales.delete` | Sales & Delivery | Void, delete, or cancel sales transactions. |
| `delivery.view` | Sales & Delivery | View all delivery transactions across the system. |
| `delivery.view_own` | Sales & Delivery | View deliveries assigned to the current user. |
| `delivery.update` | Sales & Delivery | Update delivery status and proof of delivery information. |
| `delivery.update_own` | Sales & Delivery | Update delivery status for own assigned deliveries. |
| `attendance.view` | Operations | View attendance logs across all personnel. |
| `attendance.view_own` | Operations | View own duty shift attendance records. |
| `attendance.record` | Operations | Clock in and clock out of active duty shifts. |
| `attendance.manage` | Operations | Clock in/out on behalf of personnel, void/manage attendance records. |
| `apprehensions.view` | Operations | View all roadside traffic apprehension records. |
| `apprehensions.view_own` | Operations | View roadside apprehensions involving own vehicle or trip. |
| `apprehensions.create` | Operations | Record road traffic apprehension with mandatory ticket proof. |
| `apprehensions.manage` | Operations | Update, settle, or dispute road apprehension tickets. |
| `fuel.view` | Operations | View all vehicle fuel intake records and consumption summaries. |
| `fuel.view_own` | Operations | View fuel intake logs for assigned vehicle only. |
| `fuel.create` | Operations | Record vehicle fuel intake, cost, and odometer reading. |
| `fuel.manage` | Operations | Edit or delete vehicle fuel log records. |
| `alerts.view` | Operations | View organizational driver emergency alerts feed. |
| `alerts.view_own` | Operations | View own submitted driver emergency alerts. |
| `alerts.trigger` | Operations | Single-action mobile emergency alert SOS dispatch. |
| `alerts.manage` | Operations | Acknowledge and resolve driver emergency alerts. |
| `users.view` | User Management | View user directory and employee profiles. |
| `users.manage` | User Management | Create users, manage credentials, deactivate accounts, and manage roles. |
| `history.view` | System Event Logs | View system event history and audit trails. |
