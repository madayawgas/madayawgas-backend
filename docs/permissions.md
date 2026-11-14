# System Permissions & RBAC Matrix

## 1. Role Permissions Matrix

| Permission | Super Admin | Admin | Plant Supervisor | Logistics Supervisor | Sales Supervisor | Sales Person | Driver | Description |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :--- |
| **`dashboard.view`** | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | View the main operational dashboard |
| **`fleet.view`** | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | View fleet and maintenance overview & vehicle profiles |
| **`fleet.view_own`** | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ | ✅ | View details & maintenance for assigned truck only |
| **`fleet.manage`** | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | Register vehicles, update info, set condition, assign drivers, deactivate |
| **`route.view`** | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | View all route dispatch schedules and trip logs |
| **`route.view_own`** | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ | ✅ | View routes and trip schedules assigned to current user |
| **`route.end_own`** | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ | ✅ | End active delivery trip with mandatory odometer reading |
| **`route.manage`** | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | Create, update, assign, and dispatch delivery routes |
| **`inventory.view`** | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | View inventory product catalog and stock levels |
| **`inventory.manage`** | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | Register, update, and deactivate product catalog items |
| **`inventory.plant.manage`** | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | Master plant stock management, supplier restocks, and yard defect quarantines |
| **`inventory.vehicle.manage`** | ✅ | ✅ | ❌ | ✅ | ✅ | ❌ | ❌ | Manage vehicle fleet stock, transfers between plant and trucks, and route reconciliations |
| **`sales.view`** | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | View all sales and customer profiles across the organization |
| **`sales.view_own`** | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ | View customer profiles and sales created by the current user |
| **`sales.create`** | ✅ | ✅ | ❌ | ❌ | ✅ | ✅ | ❌ | Register new sales customers and create frontline sales orders |
| **`sales.update`** | ✅ | ✅ | ❌ | ❌ | ✅ | ✅ | ❌ | Update sales customer profiles and sales orders |
| **`sales.delete`** | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | Delete, cancel, or void sales records |
| **`delivery.view`** | ✅ | ✅ | ❌ | ✅ | ✅ | ❌ | ❌ | View all delivery fulfillment transactions |
| **`delivery.view_own`** | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ | View delivery fulfillment assigned to the current user |
| **`delivery.update`** | ✅ | ✅ | ❌ | ✅ | ✅ | ❌ | ❌ | Update delivery statuses and completion records |
| **`delivery.update_own`**| ✅ | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ | Update delivery progress assigned to the current user |
| **`apprehensions.view`** | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | View all roadside traffic apprehension records |
| **`apprehensions.view_own`** | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ | ✅ | View roadside apprehensions involving own vehicle or trip |
| **`apprehensions.create`** | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ | ✅ | Record road traffic apprehension with mandatory ticket proof |
| **`apprehensions.manage`** | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | Update, settle, or dispute road apprehension tickets |
| **`fuel.view`** | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | View all vehicle fuel intake records and consumption summaries |
| **`fuel.view_own`** | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ | ✅ | View fuel intake logs for assigned vehicle only |
| **`fuel.create`** | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ | ✅ | Record vehicle fuel intake, cost, and odometer reading |
| **`fuel.manage`** | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | Edit or delete vehicle fuel log records |
| **`alerts.view`** | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | View organizational driver emergency alerts feed |
| **`alerts.view_own`** | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ | ✅ | View own submitted driver emergency alerts |
| **`alerts.trigger`** | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ | ✅ | Single-action mobile emergency alert SOS dispatch |
| **`alerts.manage`** | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | Acknowledge and resolve driver emergency alerts |
| **`users.view`** | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | View employee profiles and user lists |
| **`users.manage`** | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | Create accounts, reset credentials, deactivate, manage roles & permissions |
| **`history.view`** | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | View system event historical audit logs |

> [!NOTE]
> * **Canonical Roles (7 Total)**: `Super Admin`, `Admin`, `Plant Supervisor`, `Logistics Supervisor`, `Sales Supervisor`, `Sales Person`, and `Driver`. Legacy alias roles (`Fleet Manager`, `Sales Manager`) have been deprecated and removed.
> * **Super Admin Self-Only Protection**: `Super Admin` accounts cannot be deactivated, blocked, or have their role changed. In addition, non-self `Admin` accounts are blocked from modifying a `Super Admin` account's credentials (password reset or username change), profile details, or avatar — only the `Super Admin` account itself can modify its own credentials and profile.
> * **Plant Supervisor**: Oversees Bunawan refilling yard bulk physical inventory, product catalog items (`inventory.manage`), supplier purchases, defect quarantining, and yard return receiving (`route.view`). Has total control of master plant stock, but no direct control over vehicle fleet stock or trip reconciliations.
> * **Logistics Supervisor**: Oversees fleet, vehicle maintenance, route dispatch, truck loading/reconciliation (`inventory.view`, `inventory.vehicle.manage`), deliveries, and all operational logging (road apprehensions, vehicle fuel, and driver SOS emergency alerts).
> * **Sales Supervisor**: Oversees frontline sales (`sales.*`), customers, transactions, delivery fulfillment (`delivery.*`), vehicle stock loading & post-trip reconciliation (`inventory.view`, `inventory.vehicle.manage`, `route.view`). Road/vehicle operational logs (apprehensions, fuel, SOS alerts) remain strictly under `Logistics Supervisor`.
> * **Sales Person**: Focused strictly on frontline sales (`sales.view_own`, `sales.create`, `sales.update`), assigned deliveries (`delivery.view_own`, `delivery.update_own`), and assigned route schedules (`route.view_own`).
> * **Driver Role**: Drivers possess authenticated login capabilities for the mobile application with frontline permissions (`apprehensions.create`, `apprehensions.view_own`, `fuel.create`, `fuel.view_own`, `alerts.trigger`, `alerts.view_own`, `route.view_own`, `route.end_own`, and `fleet.view_own`). Access to vehicle telemetry, maintenance, and trips is strictly scoped to the driver's assigned vehicle and trips.
> * **Product Catalog Visibility**: To empower mobile and in-field sales operations without exposing sensitive plant storage ledgers, `GET /api/inventory/products` and `GET /api/inventory/products/:id` permit users holding `inventory.view`, `sales.view`, `sales.view_own`, or `sales.create`. Frontline `Sales Person` accounts can freely read available products and specifications while plant physical stock (`/plant`) and cross-fleet transfers (`/transfers`) remain strictly guarded by `inventory.view`.
> * **Multi-Role Employees**: Users assigned multiple roles (such as an employee holding both `Sales Supervisor` and `Logistics Supervisor`) automatically receive the union of all permissions across their assigned roles.

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
| `route.end_own` | Schedule & Trip | End active delivery trip with mandatory odometer reading for own assigned trip. |
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
