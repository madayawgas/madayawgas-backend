# MadayawGas API Contract: Sales Customer Profile CRUD

This document specifies the HTTP endpoints, payload structures, headers, authentication mechanics, RBAC permissions, and response schemas for Customer Profile management in the MadayawGas Backend API (Sales & Delivery subsystem).

---

## General Information

- **Base URL Path**: `/api/sales`
- **Request / Response Format**: `application/json`
- **Authentication**: Server-side session via HTTP-Only cookie (`mg_sid`).
- **Authorization**: Role-Based Access Control (RBAC).

---

## Permissions Summary

| Permission | Description | Allowed Roles (Default) |
| :--- | :--- | :--- |
| `sales.view` / `sales.view_own` | View customer overview, list, search, and individual customer profiles | Super Admin, Admin, Fleet Manager, Sales Person |
| `sales.create` | Register new customer records | Super Admin, Admin, Sales Person |
| `sales.update` | Update customer profiles and soft-deactivate customers | Super Admin, Admin, Sales Person |

---

## Customer Data Model & Database Schema

### `customers` Table Schema

| Column | Type | Nullable | Constraints & Defaults | Description |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `UUID` | No | `PRIMARY KEY DEFAULT gen_random_uuid()` | Unique customer identifier |
| `name` | `VARCHAR(255)` | No | Non-empty | Full name / Business name of customer |
| `address` | `TEXT` | No | Non-empty | Delivery / Physical address |
| `contact_number` | `VARCHAR(50)` | No | Non-empty | Phone or mobile contact number |
| `customer_type` | `customer_type_enum` | No | `'RETAIL'` \| `'COMMERCIAL'` \| `'WHOLESALE'` | Customer segment category |
| `is_active` | `BOOLEAN` | No | `DEFAULT true` | Active customer status indicator |
| `created_at` | `TIMESTAMPTZ` | No | `DEFAULT CURRENT_TIMESTAMP` | Record creation timestamp |
| `updated_at` | `TIMESTAMPTZ` | No | `DEFAULT CURRENT_TIMESTAMP` | Record last updated timestamp (via trigger) |

### Customer Segments (`customer_type_enum`)

1. **`RETAIL`**: Household and end-user retail consumers.
2. **`COMMERCIAL`**: Restaurants, bakeries, hotels, eateries, and commercial establishments.
3. **`WHOLESALE`**: LPG dealers, sub-dealers, and bulk distributors.

---

## Endpoints

### 1. Register Customer

Registers a new customer record into the sales system.

- **HTTP Method**: `POST`
- **URL**: `/api/sales/customers`
- **Authentication**: Required (`mg_sid` cookie)
- **Permission Required**: `sales.create`

#### Request Headers

```http
Content-Type: application/json
```

#### Request Body

```json
{
  "name": "Davao Central Bakery",
  "address": "Corner San Pedro St, Davao City",
  "contactNumber": "+63822245678",
  "customerType": "COMMERCIAL",
  "isActive": true
}
```

| Field | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `name` | String | Yes | Full customer or business name (1-255 chars) |
| `address` | String | Yes | Complete delivery/location address (non-empty) |
| `contactNumber` | String | Yes | Contact phone or mobile number (1-50 chars) |
| `customerType` | String | Yes | Customer category (`RETAIL`, `COMMERCIAL`, `WHOLESALE`) |
| `isActive` | Boolean | No | Active status flag (defaults to `true`) |

#### Response: `201 Created` (Success)

```json
{
  "status": "success",
  "data": {
    "customer": {
      "id": "7b8f9e6a-5432-41a9-83bc-9d0e12345678",
      "name": "Davao Central Bakery",
      "address": "Corner San Pedro St, Davao City",
      "contactNumber": "+63822245678",
      "customerType": "COMMERCIAL",
      "isActive": true,
      "createdAt": "2026-08-28T14:40:00.000Z",
      "updatedAt": "2026-08-28T14:40:00.000Z"
    }
  }
}
```

#### Error Responses

- **`400 Bad Request`**: Missing required fields or invalid customer type.
  ```json
  {
    "status": "fail",
    "message": "Customer name is required"
  }
  ```
- **`401 Unauthorized`**: Missing or invalid session cookie (`mg_sid`).
- **`403 Forbidden`**: Insufficient permissions (requires `sales.create`).

---

### 2. View Customer Overview (List & Search)

Retrieves a list of customers with optional filtering by status, active flag, customer type, or text search across name, address, and contact number.

- **HTTP Method**: `GET`
- **URL**: `/api/sales/customers`
- **Authentication**: Required (`mg_sid` cookie)
- **Permission Required**: `sales.view` OR `sales.view_own`

#### Query Parameters

| Parameter | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `isActive` | Boolean / String | No | Filter by active flag (`true` / `false`) |
| `status` | String | No | Filter by status string (`ACTIVE` / `INACTIVE`) |
| `customerType` | String | No | Filter by customer type (`RETAIL` / `COMMERCIAL` / `WHOLESALE`) |
| `search` | String | No | Case-insensitive substring search in `name`, `address`, or `contact_number` |

#### Response: `200 OK` (Success)

```json
{
  "status": "success",
  "data": {
    "count": 3,
    "customers": [
      {
        "id": "7b8f9e6a-5432-41a9-83bc-9d0e12345678",
        "name": "Davao Central Bakery",
        "address": "Corner San Pedro St, Davao City",
        "contactNumber": "+63822245678",
        "customerType": "COMMERCIAL",
        "isActive": true,
        "createdAt": "2026-08-28T14:40:00.000Z",
        "updatedAt": "2026-08-28T14:40:00.000Z"
      },
      {
        "id": "c1a2b3c4-d5e6-7f80-1234-56789abcdef0",
        "name": "Juan Dela Cruz",
        "address": "123 Mabini St., Poblacion, Davao City",
        "contactNumber": "+639171234567",
        "customerType": "RETAIL",
        "isActive": true,
        "createdAt": "2026-08-28T14:00:00.000Z",
        "updatedAt": "2026-08-28T14:00:00.000Z"
      }
    ]
  }
}
```

---

### 3. View Single Customer Profile

Retrieves detailed profile information for a specific customer by UUID.

- **HTTP Method**: `GET`
- **URL**: `/api/sales/customers/:id`
- **Authentication**: Required (`mg_sid` cookie)
- **Permission Required**: `sales.view` OR `sales.view_own`

#### URL Parameters

| Parameter | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `id` | UUID | Yes | Unique identifier of the customer |

#### Response: `200 OK` (Success)

```json
{
  "status": "success",
  "data": {
    "customer": {
      "id": "7b8f9e6a-5432-41a9-83bc-9d0e12345678",
      "name": "Davao Central Bakery",
      "address": "Corner San Pedro St, Davao City",
      "contactNumber": "+63822245678",
      "customerType": "COMMERCIAL",
      "isActive": true,
      "createdAt": "2026-08-28T14:40:00.000Z",
      "updatedAt": "2026-08-28T14:40:00.000Z"
    }
  }
}
```

#### Error Responses

- **`404 Not Found`**: Customer with specified UUID does not exist.
  ```json
  {
    "status": "fail",
    "message": "Customer not found"
  }
  ```

---

### 4. Update Customer Profile

Updates one or more attributes of an existing customer record.

- **HTTP Method**: `PATCH`
- **URL**: `/api/sales/customers/:id`
- **Authentication**: Required (`mg_sid` cookie)
- **Permission Required**: `sales.update`

#### Request Headers

```http
Content-Type: application/json
```

#### Request Body (Partial updates supported)

```json
{
  "name": "Davao Central Bakery & Cafe",
  "address": "Corner San Pedro St and Bolton St, Davao City",
  "contactNumber": "+63822249999",
  "customerType": "COMMERCIAL"
}
```

| Field | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `name` | String | No | Updated customer/business name (non-empty, max 255 chars) |
| `address` | String | No | Updated address (non-empty) |
| `contactNumber` | String | No | Updated contact number (non-empty, max 50 chars) |
| `customerType` | String | No | Updated customer type (`RETAIL`, `COMMERCIAL`, `WHOLESALE`) |
| `isActive` | Boolean | No | Updated active status |

#### Response: `200 OK` (Success)

```json
{
  "status": "success",
  "data": {
    "customer": {
      "id": "7b8f9e6a-5432-41a9-83bc-9d0e12345678",
      "name": "Davao Central Bakery & Cafe",
      "address": "Corner San Pedro St and Bolton St, Davao City",
      "contactNumber": "+63822249999",
      "customerType": "COMMERCIAL",
      "isActive": true,
      "createdAt": "2026-08-28T14:40:00.000Z",
      "updatedAt": "2026-08-28T14:45:00.000Z"
    }
  }
}
```

#### Error Responses

- **`400 Bad Request`**: Validation error on supplied values.
- **`404 Not Found`**: Customer ID not found.

---

### 5. Deactivate Customer

Soft-deactivates a customer profile (`is_active = false`) so they are not treated as active in the system.

- **HTTP Method**: `PATCH`
- **URL**: `/api/sales/customers/:id/deactivate`
- **Authentication**: Required (`mg_sid` cookie)
- **Permission Required**: `sales.update`
- **Dangerous Operation Guard**: Requires password confirmation (`confirmPassword` in body or `x-confirm-password` header)

#### URL Parameters

| Parameter | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `id` | UUID | Yes | Unique identifier of the customer |

#### Request Body

```json
{
  "confirmPassword": "YourCurrentPassword123!"
}
```

| Field | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `confirmPassword` | String | Yes | Acting representative/admin's current account password |

#### Response: `200 OK` (Success)

```json
{
  "status": "success",
  "message": "Customer successfully deactivated",
  "data": {
    "customer": {
      "id": "7b8f9e6a-5432-41a9-83bc-9d0e12345678",
      "name": "Davao Central Bakery & Cafe",
      "address": "Corner San Pedro St and Bolton St, Davao City",
      "contactNumber": "+63822249999",
      "customerType": "COMMERCIAL",
      "isActive": false,
      "createdAt": "2026-08-28T14:40:00.000Z",
      "updatedAt": "2026-08-28T14:50:00.000Z"
    }
  }
}
```

#### Error Responses

- **`404 Not Found`**: Customer ID not found.
  ```json
  {
    "status": "fail",
    "message": "Customer not found"
  }
  ```
