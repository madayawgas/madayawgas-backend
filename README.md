# MadayawGas Backend API

A clean, modular RESTful API built with Express.js and PostgreSQL for managing MadayawGas operations including Authentication, User Roles, Inventory, Deliveries, and Truck Fleet Management.

---

## 📁 Project Structure

```text
madayawgas-backend/
│
├── src/
│   │
│   ├── app.js                     # Configures Express middlewares & master routes
│   ├── server.js                  # Starts HTTP server & handles graceful shutdown
│   │
│   ├── config/
│   │   ├── database.js            # PostgreSQL connection pool & helpers
│   │   └── cors.js                # CORS configuration
│   │
│   ├── middleware/
│   │   ├── auth.middleware.js     # JWT Verification & RBAC authorization
│   │   └── error.middleware.js    # Global error handler middleware
│   │
│   ├── routes/
│   │   └── index.js               # Master API Router
│   │
│   ├── modules/
│   │   │
│   │   ├── auth/                  # Authentication Module
│   │   │   ├── auth.routes.js
│   │   │   ├── auth.service.js
│   │   │   └── auth.repository.js
│   │   │
│   │   ├── users/                 # User Management Module
│   │   │   ├── users.routes.js
│   │   │   ├── users.service.js
│   │   │   └── users.repository.js
│   │   │
│   │   ├── inventory/             # Inventory Module
│   │   │   ├── inventory.routes.js
│   │   │   ├── inventory.service.js
│   │   │   └── inventory.repository.js
│   │   │
│   │   ├── deliveries/            # Deliveries Module
│   │   │   ├── deliveries.routes.js
│   │   │   ├── deliveries.service.js
│   │   │   └── deliveries.repository.js
│   │   │
│   │   └── truck/                 # Truck Fleet Module
│   │       ├── truck.routes.js
│   │       ├── truck.service.js
│   │       └── truck.repository.js
│   │
│   └── utils/
│       └── asyncHandler.js        # Catch async errors in route handlers
│
├── .env                           # Local environment variables
├── .gitignore
├── package.json
└── README.md
```

---

## ⚡ Quick Start

### 1. Prerequisites
- Node.js (v18+)
- PostgreSQL database

### 2. Environment Setup
Create a `.env` file in the root directory:

```env
PORT=5000
NODE_ENV=development

DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=postgres
DB_NAME=madayawgas_db

JWT_SECRET=madayawgas_super_secret_jwt_key_2026_change_in_prod
JWT_EXPIRES_IN=1d

CORS_ORIGIN=http://localhost:3000,http://localhost:5173
```

### 3. Installation
Install dependencies:
```bash
npm install
```

### 4. Running the Application
Development mode (with auto-reload via `nodemon`):
```bash
npm run dev
```

Production mode:
```bash
npm start
```

---

## 🗄️ Sample PostgreSQL Database Schema

Run the following SQL statements in your PostgreSQL database (`madayawgas_db`) to create the initial tables:

```sql
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    role VARCHAR(50) DEFAULT 'staff',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS inventory (
    id SERIAL PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    sku VARCHAR(50) UNIQUE NOT NULL,
    category VARCHAR(50) NOT NULL,
    quantity INT DEFAULT 0,
    unit_price NUMERIC(10, 2) NOT NULL,
    reorder_level INT DEFAULT 10,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS deliveries (
    id SERIAL PRIMARY KEY,
    customer_name VARCHAR(150) NOT NULL,
    delivery_address TEXT NOT NULL,
    driver_id INT REFERENCES users(id) ON DELETE SET NULL,
    status VARCHAR(50) DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS trucks (
    id SERIAL PRIMARY KEY,
    plate_number VARCHAR(50) UNIQUE NOT NULL,
    model VARCHAR(100) NOT NULL,
    capacity_kg NUMERIC(10, 2) NOT NULL,
    assigned_driver_id INT REFERENCES users(id) ON DELETE SET NULL,
    fuel_level INT DEFAULT 100,
    status VARCHAR(50) DEFAULT 'Available',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

## 🔗 Module Architecture & Data Flow

Each module follows a clean 3-tier layered architecture:

1. **Routes (`*.routes.js`)**: Defines endpoints, applies auth middleware, and calls service methods wrapped in `asyncHandler`.
2. **Service (`*.service.js`)**: Contains pure business logic, authorization checks, and data manipulation.
3. **Repository (`*.repository.js`)**: Direct database access using parameterized SQL queries with the PostgreSQL `pg` pool (`db.query`).

---

## 🌐 API Endpoints Summary

### Health Check
- `GET /health` - Server health status

### Auth (`/api/auth`)
- `POST /api/auth/register` - Register a new user
- `POST /api/auth/login` - User login & JWT issuance

### Inventory (`/api/inventory`)
- `GET /api/inventory` - List inventory items (supports `?search=`, `?category=`, `?page=`, `?limit=`)
- `GET /api/inventory/:id` - Get item by ID
- `POST /api/inventory` - Create inventory item (Protected)
- `PUT /api/inventory/:id` - Update inventory item (Protected)
- `DELETE /api/inventory/:id` - Delete inventory item (Protected)

### Users (`/api/users`)
- `GET /api/users` - List all users (Protected / Admin only)
- `GET /api/users/me` - Get current user profile (Protected)
- `GET /api/users/:id` - Get user by ID (Protected)
- `PUT /api/users/:id` - Update user (Protected)
- `DELETE /api/users/:id` - Delete user (Protected / Admin only)

### Deliveries (`/api/deliveries`)
- `GET /api/deliveries` - List all deliveries (Protected)
- `GET /api/deliveries/:id` - Get delivery details (Protected)
- `POST /api/deliveries` - Create delivery (Protected)
- `PATCH /api/deliveries/:id/status` - Update delivery status (Protected)

### Trucks (`/api/truck`)
- `GET /api/truck` - List all trucks
- `GET /api/truck/available` - List available trucks
- `GET /api/truck/:id` - Get single truck details by ID
- `GET /api/truck/:id/maintenance` - Get maintenance logs for a truck
- `PATCH /api/truck/:id/fuel` - Update fuel level for a truck
