# MadayawGas Seed Credentials & Test Accounts

This document lists the pre-configured seed user accounts for testing authentication, roles, and authorization in the MadayawGas backend.

> [!NOTE]
> All seed accounts have `must_change_password = FALSE` so you can immediately log in without being forced to change their password during testing. Newly created users (via `POST /api/users`) will have `mustChangePassword = true` and will use their auto-generated temporary password on first login.

---

## Seed Accounts Summary

| Username | Password | Role(s) | Phone | Permissions Overview |
| :--- | :--- | :--- | :--- | :--- |
| **`superadmin`** | `Superadmin123!` | **Super Admin** | `+639170000001` | **Full access**: Can manage all users, fleet, routes, sales, inventory, and deliveries. Cannot be blocked or deactivated. |
| **`admin_user`** | `AdminPass123!` | **Admin** | `+639170000002` | **Administrator access**: Can manage users, fleet, inventory, roles, and view system history reports. |
| **`logistics_supervisor`** | `LogisticsPass123!` | **Logistics Supervisor** | `+639170000003` | **Fleet & logistics oversight**: `fleet.*`, `route.*`, `dashboard.view`, `delivery.view`, `delivery.update`. Cannot manage user accounts (`403 Forbidden`). |
| **`driver_user`** | `DriverPass123!` | **Driver** | `+639170000005` | **Vehicle driver**: Assigned to truck `ABC-1001`. Has no login portal permissions. |
| **`driver_user2`** | `DriverPass123!` | **Driver** | `+639170000009` | **Vehicle driver**: Assigned to truck `ABC-1002`. Has no login portal permissions. |
| **`driver_user3`** | `DriverPass123!` | **Driver** | `+639170000010` | **Vehicle driver**: Assigned to pickup `ABC-1004`. Has no login portal permissions. |
| **`sales_supervisor`** | `SalesSupPass123!` | **Sales Supervisor** | `+639170000006` | **Sales & inventory oversight**: `inventory.*`, `sales.view`, `sales.update`, `sales.delete`, `delivery.*`, `history.view`. |
| **`sales_user`** | `SalesPass123!` | **Sales Person** | `+639170000004` | **Sales representative**: `sales.view_own`, `sales.create`, `sales.update`, `delivery.view_own`, `delivery.update_own`. |
| **`plant_supervisor`** | `PlantPass123!` | **Plant Supervisor** | `+639170000007` | **Plant Operations**: Oversees Bunawan refilling yard bulk stock (`dashboard.view`, `inventory.view`, `inventory.manage`). Routes, fleet, sales, and user admin are strictly blocked. |
| **`samantha_supervisor`** | `SamanthaPass123!` | **Sales Supervisor** *(Primary)* + **Logistics Supervisor** *(Multi-role)* | `+639170000008` | **Multi-role Employee**: Unions permissions across Sales Supervisor and Logistics Supervisor (`fleet.*`, `route.*`, `inventory.*`, `sales.view/update/delete`, `delivery.*`, `history.view`). |

---

## Detailed Role & Permission Breakdown

### 1. Super Admin (`superadmin`)
* **Password**: `Superadmin123!`
* **Phone**: `+639170000001`
* **Role**: `Super Admin`
* **Permissions**: All system permissions.

---

### 2. Administrator (`admin_user`)
* **Password**: `AdminPass123!`
* **Phone**: `+639170000002`
* **Role**: `Admin`
* **Permissions**: Full administration permissions (user management, roles, fleet, inventory, sales, history).

---

### 3. Logistics Supervisor (`logistics_supervisor`)
* **Password**: `LogisticsPass123!`
* **Phone**: `+639170000003`
* **Role**: `Logistics Supervisor`
* **Permissions**: `dashboard.view`, `fleet.view`, `fleet.manage`, `route.view`, `route.manage`, `delivery.view`, `delivery.update`.

---

### 4. Sales Supervisor (`sales_supervisor`)
* **Password**: `SalesSupPass123!`
* **Phone**: `+639170000006`
* **Role**: `Sales Supervisor`
* **Permissions**: `dashboard.view`, `inventory.view`, `inventory.manage`, `sales.view`, `sales.update`, `sales.delete`, `delivery.view`, `delivery.update`, `history.view`.

---

### 5. Sales Person (`sales_user`)
* **Password**: `SalesPass123!`
* **Phone**: `+639170000004`
* **Role**: `Sales Person`
* **Permissions**: `dashboard.view`, `route.view_own`, `sales.view_own`, `sales.create`, `sales.update`, `delivery.view_own`, `delivery.update_own`.

---

### 6. Driver Accounts
MadayawGas operations utilize dedicated registered drivers assigned to fleet vehicles:
* **`driver_user`** (Danilo Driver): Assigned to Delivery Truck `ABC-1001` (Password: `DriverPass123!`, Phone: `+639170000005`, Role: `Driver`)
* **`driver_user2`** (Roberto Driver): Assigned to Delivery Truck `ABC-1002` (Password: `DriverPass123!`, Phone: `+639170000009`, Role: `Driver`)
* **`driver_user3`** (Eduardo Driver): Assigned to Service Pickup `ABC-1004` (Password: `DriverPass123!`, Phone: `+63917000010`, Role: `Driver`)
* **Permissions**: None (`[]`). Drivers do not log in via the web portal but represent operational crew on routes and fleet assignments.

---

### 7. Plant Supervisor (`plant_supervisor`)
* **Password**: `PlantPass123!`
* **Phone**: `+639170000007`
* **Role**: `Plant Supervisor`
* **Permissions**: `['dashboard.view', 'inventory.view', 'inventory.manage']`. Manages Bunawan plant bulk inventory, supplier purchases, defect quarantines, and cylinder transfer manifests. Routes and history logs are strictly blocked (`403 Forbidden`).

---

### 8. Multi-Role Supervisor (`samantha_supervisor`)
* **Password**: `SamanthaPass123!`
* **Phone**: `+639170000008`
* **Roles**: `Sales Supervisor` (Primary) + `Logistics Supervisor`
* **Permissions**: Seamless union of permissions across both roles:
  * `dashboard.view`
  * `fleet.view`, `fleet.manage`
  * `route.view`, `route.manage`
  * `inventory.view`, `inventory.manage`
  * `sales.view`, `sales.update`, `sales.delete`
  * `delivery.view`, `delivery.update`
  * `history.view`

---

## How to Reset / Re-seed the Database

To apply the migrations and reload these seed accounts at any time:

```bash
# 1. Run migrations
npm run db:migrate

# 2. Run seed script
npm run db:seed
```
