# Frontend API & Development Setup

> [!NOTE]
> - For the full list of API endpoints, request bodies, and responses, see [**`docs/api-contract.md`**](./api-contract.md).
> - For the complete list of system permissions, see [**`docs/permissions.md`**](./permissions.md).
> - Code shown in this file is just an example/suggestion. You can create your own implementation that fits best for the existing structure.

---

## 1. The Most Important Rule: Auth & Cookies (`mg_sid`)

The backend handles login sessions using an **HTTP-Only cookie** named `mg_sid`.

### What does this mean for you?
- **You do NOT need to save tokens in `localStorage`**.
- The browser will save the cookie automatically when you log in and send it automatically with every subsequent request.
- **The Golden Rule**: Every time you call the backend using `fetch`, you **MUST include `credentials: 'include'`**. If you forget this, the backend will not see your session cookie and will return `401 Unauthorized`.

```javascript
// Native fetch with credentials enabled:
const response = await fetch('http://localhost:5000/api/users/me', {
  method: 'GET',
  credentials: 'include', // <-- MUST HAVE THIS!
  headers: {
    'Content-Type': 'application/json',
  },
});
```

---

## 2. Local Development: Switching Between Mock Data & Live API

You don't always need the backend running to build UI features. You can build your pages using local `.json` mock files, and switch to the live backend with a single setting in `.env.local`.

### Step 1: Create your `.env.local`
In the root of your frontend project, create a `.env.local` file:

```ini
# Set to 'true' to use local .json mock files
# Set to 'false' to call the real backend server
VITE_USE_MOCK=true

# Real backend API URL (used when VITE_USE_MOCK=false)
VITE_API_URL=http://localhost:5000/api
```

---

### Step 2: Organize your Mock `.json` Files
Put your sample mock responses in a `src/mocks/` folder.

Example structure:
```text
src/
└── mocks/
    ├── me.json          # Mock current user profile & permissions
    ├── users.json       # Mock list of users
    └── roles.json       # Mock list of roles
```

#### Example `src/mocks/me.json`:
```json
{
  "status": "success",
  "data": {
    "user": {
      "id": "1",
      "username": "superadmin",
      "firstName": "Super",
      "lastName": "Admin",
      "role": "Super Admin",
      "permissions": [
        "dashboard.view",
        "fleet.view",
        "fleet.manage",
        "inventory.view",
        "inventory.manage",
        "sales.view",
        "sales.create",
        "sales.update",
        "users.view",
        "users.manage"
      ]
    }
  }
}
```

---

## 3. Recommended API Helper Files (Using Native `fetch`)

Instead of writing raw `fetch` calls directly inside your UI components, create helper files in `src/api/`. These helpers will automatically handle `credentials: 'include'`, JSON parsing, and switching to mock data when `VITE_USE_MOCK=true`.

### Helper 1: Base Fetch Client (`src/api/client.js`)
```javascript
// src/api/client.js

export const isMock = import.meta.env.VITE_USE_MOCK === 'true';
export const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

/**
 * Lightweight native fetch wrapper
 * Automatically adds credentials: 'include' and handles JSON formatting.
 */
export async function apiClient(endpoint, options = {}) {
  const url = `${API_BASE_URL}${endpoint}`;

  const config = {
    method: options.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    credentials: 'include', // <-- CRITICAL: Sends and receives the mg_sid session cookie
    ...options,
  };

  // Convert JS object body to JSON string
  if (options.body && typeof options.body === 'object') {
    config.body = JSON.stringify(options.body);
  }

  const response = await fetch(url, config);
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || 'An error occurred while fetching data');
  }

  return data;
}
```

---

### Helper 2: Auth API (`src/api/auth.js`)
```javascript
// src/api/auth.js
import { apiClient, isMock } from './client';
import mockMe from '../mocks/me.json';

// Simulated small delay for mock data to feel like a real network call
const delay = (ms = 300) => new Promise((res) => setTimeout(res, ms));

export const authApi = {
  // 1. Log in
  async login(username, password) {
    if (isMock) {
      await delay();
      return mockMe.data.user;
    }
    const result = await apiClient('/users/login', {
      method: 'POST',
      body: { username, password },
    });
    return result.data.user;
  },

  // 2. Get current logged-in user (Check session on app load)
  async getMe() {
    if (isMock) {
      await delay();
      return mockMe.data.user;
    }
    const result = await apiClient('/users/me');
    return result.data.user;
  },

  // 3. Log out
  async logout() {
    if (isMock) {
      await delay();
      return true;
    }
    await apiClient('/users/logout', { method: 'POST' });
    return true;
  },

  // 4. Change password
  async changePassword(currentPassword, newPassword) {
    if (isMock) {
      await delay();
      return true;
    }
    return apiClient('/users/change-password', {
      method: 'POST',
      body: { currentPassword, newPassword },
    });
  },
};
```

---

### Helper 3: Users API (`src/api/users.js`)
```javascript
// src/api/users.js
import { apiClient, isMock } from './client';
import mockUsers from '../mocks/users.json';
import mockRoles from '../mocks/roles.json';

const delay = (ms = 300) => new Promise((res) => setTimeout(res, ms));

export const usersApi = {
  // Get all users (Admin only)
  async getAllUsers() {
    if (isMock) {
      await delay();
      return mockUsers.data.users;
    }
    const result = await apiClient('/users');
    return result.data.users;
  },

  // Get available roles
  async getRoles() {
    if (isMock) {
      await delay();
      return mockRoles.data.roles;
    }
    const result = await apiClient('/users/roles');
    return result.data.roles;
  },

  // Create a new user
  async createUser(userData) {
    if (isMock) {
      await delay();
      return { id: `mock-${Date.now()}`, ...userData };
    }
    const result = await apiClient('/users', {
      method: 'POST',
      body: userData,
    });
    return result.data.user;
  },

  // Deactivate or block user
  async updateUserStatus(userId, { isActive, isBlocked }) {
    if (isMock) {
      await delay();
      return { id: userId, isActive, isBlocked };
    }
    const result = await apiClient(`/users/${userId}/status`, {
      method: 'PATCH',
      body: { isActive, isBlocked },
    });
    return result.data.user;
  },
};
```

---

## 4. How to Check If User is Logged In (On Page Refresh)

When the user opens or refreshes the page, your app should call `authApi.getMe()`:

```javascript
// Example in App.jsx or AuthContext.jsx
import { useEffect, useState } from 'react';
import { authApi } from './api/auth';

export function useAuthInit() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function checkSession() {
      try {
        const currentUser = await authApi.getMe();
        setUser(currentUser); // Logged in!
      } catch (err) {
        setUser(null); // Not logged in or session expired
      } finally {
        setLoading(false);
      }
    }

    checkSession();
  }, []);

  return { user, loading, setUser };
}
```

---

## 5. How to Use Permissions (RBAC) in UI Components

The `user` object returned by `getMe()` or `login()` contains a `permissions` array (e.g., `["sales.create", "users.view"]`).

### Step 1: Create a Permission Helper (`src/utils/permissions.js`)
```javascript
// src/utils/permissions.js

// Check if user has a single permission
export function can(user, permission) {
  if (!user || !user.permissions) return false;
  return user.permissions.includes(permission);
}

// Check if user has ALL permissions in a list
export function canAll(user, permissionsList = []) {
  if (!user || !user.permissions) return false;
  return permissionsList.every((p) => user.permissions.includes(p));
}

// Check if user has AT LEAST ONE permission in a list
export function canAny(user, permissionsList = []) {
  if (!user || !user.permissions) return false;
  return permissionsList.some((p) => user.permissions.includes(p));
}
```

---

### Step 2: Use in UI Components

#### Example 1: Hide or Show Buttons
```jsx
import { can } from '../utils/permissions';

function SalesPage({ currentUser }) {
  return (
    <div>
      <h1>Sales</h1>

      {/* Only show button if user has 'sales.create' permission */}
      {can(currentUser, 'sales.create') && (
        <button onClick={openNewSaleModal}>+ New Sale</button>
      )}
    </div>
  );
}
```

#### Example 2: Disable a Button
```jsx
<button 
  disabled={!can(currentUser, 'users.manage')}
  onClick={() => handleDeactivateUser(user.id)}
>
  Deactivate User
</button>
```

#### Example 3: Hide Sidebar Navigation Links
```jsx
<nav>
  <Link to="/dashboard">Dashboard</Link>
  
  {can(currentUser, 'inventory.view') && (
    <Link to="/inventory">Inventory</Link>
  )}

  {can(currentUser, 'fleet.view') && (
    <Link to="/fleet">Fleet</Link>
  )}

  {can(currentUser, 'users.view') && (
    <Link to="/users">User Management</Link>
  )}
</nav>
```

---

## 6. Simple Frontend Folder Structure

Here is the recommended clean folder structure for the frontend team:

```text
src/
├── api/                  # All backend & mock API calls
│   ├── client.js         # Native fetch base client (credentials: 'include')
│   ├── auth.js           # Login, logout, getMe, changePassword
│   ├── users.js          # User management calls
│   ├── fleet.js          # (Future) Fleet calls
│   └── inventory.js      # (Future) Inventory calls
│
├── mocks/                # Mock .json files for offline development
│   ├── me.json
│   ├── users.json
│   └── roles.json
│
├── components/           # Reusable UI components (Buttons, Modals, Navbar)
├── pages/                # Page screens (LoginPage, DashboardPage, UsersPage)
├── utils/                # Helper functions (permissions.js)
├── App.jsx
└── main.jsx
```

---

## 7. Quick Troubleshooting & Tips

1. **"I am getting 401 Unauthorized even after logging in"**:
   - Make sure your request includes `credentials: 'include'`. The `apiClient` helper in `src/api/client.js` includes this automatically.

2. **"How do I switch from mock data to real backend?"**:
   - Open `.env.local` and change `VITE_USE_MOCK=true` to `VITE_USE_MOCK=false`.
   - Restart your frontend dev server (`npm run dev`).

3. **"Where do I see what the backend expects for an endpoint?"**:
   - Check [**`docs/api-contract.md`**](./api-contract.md). It lists the exact parameters, HTTP method, and response format for every single endpoint.

4. **"Where do I see the permission names?"**:
   - Check [**`docs/permissions.md`**](./permissions.md).
