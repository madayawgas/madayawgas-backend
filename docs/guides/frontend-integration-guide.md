# Frontend API & Development Setup

> [!NOTE]
> - For the full list of API endpoints, request bodies, and responses, see [**`docs/api-contract.md`**](./api-contract.md).
> - For the complete list of system permissions, see [**`docs/permissions.md`**](./permissions.md).
> - Code shown in this file is just an example/suggestion. You can create your own implementation that fits best for the existing structure.

---

## 1. Authentication & Cross-Platform Support (Cookies & Bearer Token)

The backend supports a robust **Dual Authentication Strategy** designed for 100% compatibility across all operating systems and browsers (iOS Safari, Android Chrome, Samsung Internet, macOS, Windows, Linux, and mobile WebViews).

### Why Dual Authentication?
- **Desktop & Standard Browsers**: The backend sets an `HttpOnly` cookie named `mg_sid`. When `credentials: 'include'` is set, the browser automatically transmits the session cookie.
- **iOS Devices (iPhone & iPad)**: Apple mandates WebKit across all iOS browsers (Safari, Chrome iOS, Firefox iOS). WebKit's **Intelligent Tracking Prevention (ITP)** blocks third-party cross-site cookies by default when the frontend (`madayawgas.vercel.app`) calls the backend (`onrender.com`).
- **Android & Privacy Browsers**: Modern Chromium browsers enforce Third-Party Cookie Deprecation (3PCD) and Private Network Access (PNA) guards.
- **The Solution**: On login, the backend returns both the session cookie **AND** a raw session token (`data.token`). The frontend client stores this token in `localStorage` and attaches `Authorization: Bearer <token>` on all requests alongside `credentials: 'include'`. The backend automatically accepts whichever is available!

```javascript
// Example native fetch with Dual Auth enabled:
const token = localStorage.getItem('mg_token');

const response = await fetch('http://localhost:5000/api/users/me', {
  method: 'GET',
  credentials: 'include', // Sends cookie on supported browsers
  headers: {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}), // Guarantees iOS Safari & Android mobile support
  },
});
```

---

## 2. Local Development & Mobile Device Testing (LAN / Wi-Fi)

You can test UI features locally against mock `.json` files, a local backend, or across physical mobile devices on the same Wi-Fi.

### Step 1: Create your `.env.local`
In the root of your frontend project, create a `.env.local` file:

```ini
# Set to 'true' to use local .json mock files
# Set to 'false' to call the real backend server
VITE_USE_MOCK=true

# Real backend API URL (used when VITE_USE_MOCK=false)
# For local desktop testing:
VITE_API_URL=http://localhost:5000/api
# For testing from a mobile phone on the same Wi-Fi:
# VITE_API_URL=http://192.168.1.X:5000/api
```

### Step 2: Testing on a Physical Mobile Phone via Local Wi-Fi
1. Ensure your computer and mobile phone are connected to the same Wi-Fi network.
2. Run your Vite dev server with the `--host` flag:
   ```bash
   npm run dev -- --host
   ```
3. Vite will display a Network URL (e.g., `http://192.168.1.15:5173`).
4. Set `VITE_API_URL=http://192.168.1.15:5000/api` in your `.env.local`.
5. Open the Network URL in your mobile phone's browser (Safari or Chrome).
6. **Zero CORS Issues**: The backend automatically whitelists private LAN IP ranges (`192.168.x.x`, `10.x.x.x`, `172.16-31.x.x`), supports Chromium Private Network Access (PNA), and listens on `0.0.0.0`.

---

### Step 3: Organize your Mock `.json` Files
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

Create helper files in `src/api/` that automatically manage credentials, Bearer tokens, JSON formatting, and switching to mock data.

### Helper 1: Base Fetch Client (`src/api/client.js`)
```javascript
// src/api/client.js

export const isMock = import.meta.env.VITE_USE_MOCK === 'true';
export const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

/**
 * Lightweight native fetch wrapper
 * Automatically attaches Authorization Bearer token (for iOS Safari ITP & mobile compatibility)
 * and credentials: 'include' (for desktop cookie sessions).
 */
export async function apiClient(endpoint, options = {}) {
  const url = `${API_BASE_URL}${endpoint}`;
  const token = typeof window !== 'undefined' ? localStorage.getItem('mg_token') : null;

  const config = {
    method: options.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
    credentials: 'include', // Sends and receives the mg_sid session cookie
    ...options,
  };

  // Convert JS object body to JSON string
  if (options.body && typeof options.body === 'object') {
    config.body = JSON.stringify(options.body);
  }

  const response = await fetch(url, config);
  const data = await response.json();

  if (!response.ok) {
    // Automatically clear invalid token on 401 Unauthorized
    if (response.status === 401 && typeof window !== 'undefined') {
      localStorage.removeItem('mg_token');
    }
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
  // 1. Log in (saves token to localStorage for mobile cross-browser compatibility)
  async login(username, password) {
    if (isMock) {
      await delay();
      return mockMe.data.user;
    }
    const result = await apiClient('/users/login', {
      method: 'POST',
      body: { username, password },
    });

    if (result.data?.token && typeof window !== 'undefined') {
      localStorage.setItem('mg_token', result.data.token);
    }

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

  // 3. Log out (clears token from localStorage)
  async logout() {
    if (isMock) {
      await delay();
      return true;
    }
    try {
      await apiClient('/users/logout', { method: 'POST' });
    } finally {
      if (typeof window !== 'undefined') {
        localStorage.removeItem('mg_token');
      }
    }
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
