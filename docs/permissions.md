# System Permissions & RBAC Matrix

## 1. Role Permissions Matrix

| Permission | Super Admin | Admin | Fleet Manager | Sales Manager | Sales Person | Driver | Description |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :--- |
| **`dashboard.view`** | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | View the main operational dashboard |
| **`fleet.view`** | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | View fleet and maintenance overview & vehicle profiles |
| **`fleet.manage`** | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | Register vehicles, update info, set condition, assign drivers, deactivate |
| **`route.view`** | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | View all route dispatch schedules and trip logs |
| **`route.view_own`** | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ | View routes specifically assigned to the current user |
| **`route.manage`** | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | Create, update, assign, and dispatch delivery routes |
| **`inventory.view`** | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ | View inventory product catalog and stock levels |
| **`inventory.manage`** | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ | Register, update, and deactivate inventory items/products |
| **`sales.view`** | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ | View all sales and customer profiles across the organization |
| **`sales.view_own`** | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ | View customer profiles and sales created by the current user |
| **`sales.create`** | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ | Register new sales customers and create frontline sales orders |
| **`sales.update`** | ✅ | ✅ | ❌ | ✅ | ✅ | ❌ | Update sales customer profiles and sales orders |
| **`sales.delete`** | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ | Delete, cancel, or void sales records |
| **`delivery.view`** | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ | View all delivery fulfillment transactions |
| **`delivery.view_own`** | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ | View delivery fulfillment assigned to the current user |
| **`delivery.update`** | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ | Update delivery statuses and completion records |
| **`delivery.update_own`**| ✅ | ✅ | ❌ | ❌ | ✅ | ❌ | Update delivery progress assigned to the current user |
| **`users.view`** | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | View employee profiles and user lists |
| **`users.manage`** | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | Create accounts, reset credentials, deactivate, manage roles & permissions |
| **`history.view`** | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ | View system event historical audit logs |

> [!NOTE]
> **Driver Role**: The Driver role has no login access or system permissions. Driver records exist in the database for assignment to fleet vehicles.

---

## 2. Complete Permissions Reference

| Permission | Subsystem Domain | Description |
| :--- | :--- | :--- |
| `dashboard.view` | Dashboard | View operational dashboard metrics and summaries. |
| `fleet.view` | Fleet & Maintenance | View fleet inventory, condition metrics, and vehicle records. |
| `fleet.manage` | Fleet & Maintenance | Register vehicles, update odometer/details, set status, and assign drivers. |
| `route.view` | Schedule & Trip | View all organizational route dispatch schedules. |
| `route.view_own` | Schedule & Trip | View routes and trip schedules assigned to the current user. |
| `route.manage` | Schedule & Trip | Create, update, assign, and manage route dispatches. |
| `inventory.view` | Inventory Management | View inventory products catalog and stock levels. |
| `inventory.manage` | Inventory Management | Register, modify, and deactivate inventory items. |
| `sales.view` | Sales & Delivery | View all customer accounts and sales records. |
| `sales.view_own` | Sales & Delivery | View sales and customers created by the current user. |
| `sales.create` | Sales & Delivery | Register new customer accounts and create sales orders. |
| `sales.update` | Sales & Delivery | Update customer account profiles and edit sales transactions. |
| `sales.delete` | Sales & Delivery | Void, delete, or cancel sales transactions. |
| `delivery.view` | Sales & Delivery | View all delivery transactions across the system. |
| `delivery.view_own` | Sales & Delivery | View deliveries assigned to the current user. |
| `delivery.update` | Sales & Delivery | Update delivery status and proof of delivery information. |
| `delivery.update_own` | Sales & Delivery | Update delivery status for own assigned deliveries. |
| `users.view` | User Management | View user directory and employee profiles. |
| `users.manage` | User Management | Create users, manage credentials, deactivate accounts, and manage roles. |
| `history.view` | System Event Logs | View system event history and audit trails. |
