# MadayawGas Seed Credentials & Test Accounts

This document lists the pre-configured seed user accounts for testing authentication, roles, and authorization in the MadayawGas backend.

> [!NOTE]
> All seed accounts have `must_change_password = FALSE` so you can immediately log in without being forced to change their password during testing. Newly created users (via `POST /api/users`) will have `mustChangePassword = true` and will use their auto-generated temporary password on first login.

---

## Seed Accounts Summary

| Username | Password | Role | Phone | Permissions Overview |
| :--- | :--- | :--- | :--- | :--- |
| **`superadmin`** | `Superadmin123!` | **Super Admin** | `+639170000001` | **Full access**: Can manage all users, fleet, routes, sales, inventory, and deliveries. Cannot be blocked or deactivated. |
| **`admin_user`** | `AdminPass123!` | **Admin** | `+639170000002` | **Administrator access**: Can manage users, fleet, inventory, and view reports. |
| **`fleet_user`** | `FleetPass123!` | **Fleet Manager** | `+639170000003` | **Fleet & routes access**: `fleet.*`, `route.*`, `dashboard.view`. Cannot manage user accounts (`403 Forbidden`). |
| **`sales_user`** | `SalesPass123!` | **Sales Person** | `+639170000004` | **Sales representative**: `sales.view_own`, `sales.create`, `delivery.view_own`. Cannot access admin or fleet management (`403 Forbidden`). |

---

## Detailed Role & Permission Breakdown

### 1. Super Admin (`superadmin`)
* **Password**: `Superadmin123!`
* **Phone**: `+639170000001`
* **Role**: `Super Admin`
* **Permissions**:
  * `dashboard.view`
  * `fleet.view`, `fleet.manage`
  * `route.view`, `route.view_own`, `route.manage`
  * `inventory.view`, `inventory.manage`
  * `sales.view`, `sales.view_own`, `sales.create`, `sales.update`, `sales.delete`
  * `delivery.view`, `delivery.view_own`, `delivery.update`, `delivery.update_own`
  * `users.view`, `users.manage`

---

### 2. Administrator (`admin_user`)
* **Password**: `AdminPass123!`
* **Phone**: `+639170000002`
* **Role**: `Admin`
* **Permissions**:
  * `dashboard.view`
  * `fleet.view`, `fleet.manage`
  * `route.view`, `route.manage`
  * `inventory.view`, `inventory.manage`
  * `sales.view`, `sales.create`, `sales.update`
  * `delivery.view`, `delivery.update`
  * `users.view`, `users.manage`

---

### 3. Fleet Manager (`fleet_user`)
* **Password**: `FleetPass123!`
* **Phone**: `+639170000003`
* **Role**: `Fleet Manager`
* **Permissions**:
  * `dashboard.view`
  * `fleet.view`, `fleet.manage`
  * `route.view`, `route.manage`
  * `delivery.view`, `delivery.update`

---

### 4. Sales Person (`sales_user`)
* **Password**: `SalesPass123!`
* **Phone**: `+639170000004`
* **Role**: `Sales Person`
* **Permissions**:
  * `dashboard.view`
  * `route.view_own`
  * `sales.view_own`, `sales.create`, `sales.update`
  * `delivery.view_own`, `delivery.update_own`

---

## How to Reset / Re-seed the Database

To apply the migrations and reload these seed accounts at any time:

```bash
# 1. Run migrations
npm run db:migrate

# 2. Run seed script
npm run db:seed
```
