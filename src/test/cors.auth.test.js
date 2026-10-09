const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcrypt');
const app = require('../app');
const { query, pool } = require('../../database/connection');

let server;
let baseUrl;

before(async () => {
  await new Promise((resolve) => {
    server = app.listen(0, () => {
      const port = server.address().port;
      baseUrl = `http://localhost:${port}`;
      resolve();
    });
  });
});

after(async () => {
  if (server) {
    server.close();
  }
  await pool.end();
});

test('Cross-Origin CORS & Cookie Authentication Tests', async (t) => {
  let testRoleId;

  beforeEach(async () => {
    // Clean test_cors sessions & users
    await query(`DELETE FROM history_logs WHERE user_id IN (SELECT id FROM users WHERE username LIKE 'test_cors_%')`);
    await query(`DELETE FROM audit_logs WHERE user_id IN (SELECT id FROM users WHERE username LIKE 'test_cors_%') OR target_user_id IN (SELECT id FROM users WHERE username LIKE 'test_cors_%')`);
    await query(`DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE username LIKE 'test_cors_%')`);
    await query(`DELETE FROM users WHERE username LIKE 'test_cors_%'`);

    // Get Super Admin role ID
    const roleRes = await query(`SELECT id FROM roles WHERE name = 'Super Admin'`);
    testRoleId = roleRes.rows[0].id;

    // Create test user
    const passwordHash = await bcrypt.hash('TestPass123!', 10);
    await query(
      `INSERT INTO users (username, password_hash, first_name, last_name, phone, role_id, is_active, is_blocked, must_change_password)
       VALUES ($1, $2, $3, $4, $5, $6, TRUE, FALSE, FALSE)`,
      ['test_cors_admin', passwordHash, 'Cors', 'Admin', '+639170000009', testRoleId]
    );
  });

  await t.test('1. CORS Whitelist - Allows localhost on any development port with credentials', async () => {
    const res = await fetch(`${baseUrl}/api/users/login`, {
      method: 'OPTIONS',
      headers: {
        Origin: 'http://localhost:5173',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'Content-Type',
      },
    });

    assert.equal(res.headers.get('access-control-allow-origin'), 'http://localhost:5173');
    assert.equal(res.headers.get('access-control-allow-credentials'), 'true');
  });

  await t.test('2. CORS Whitelist - Allows production Vercel domain with credentials', async () => {
    const res = await fetch(`${baseUrl}/api/users/login`, {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://madayawgas.vercel.app',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'Content-Type',
      },
    });

    assert.equal(res.headers.get('access-control-allow-origin'), 'https://madayawgas.vercel.app');
    assert.equal(res.headers.get('access-control-allow-credentials'), 'true');
  });

  await t.test('3. CORS Whitelist - Allows Vercel preview deployment domains', async () => {
    const res = await fetch(`${baseUrl}/api/users/login`, {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://madayawgas-preview-test.vercel.app',
        'Access-Control-Request-Method': 'POST',
      },
    });

    assert.equal(res.headers.get('access-control-allow-origin'), 'https://madayawgas-preview-test.vercel.app');
    assert.equal(res.headers.get('access-control-allow-credentials'), 'true');
  });

  await t.test('4. CORS Headers - Permits X-Confirm-Password custom header in preflight', async () => {
    const res = await fetch(`${baseUrl}/api/users/123/status`, {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://madayawgas.vercel.app',
        'Access-Control-Request-Method': 'PATCH',
        'Access-Control-Request-Headers': 'Content-Type, X-Confirm-Password',
      },
    });

    const allowedHeaders = res.headers.get('access-control-allow-headers');
    assert.ok(allowedHeaders);
    assert.ok(allowedHeaders.toLowerCase().includes('x-confirm-password'));
  });

  await t.test('5. CORS Guard - Disallows unauthorized external origins', async () => {
    const res = await fetch(`${baseUrl}/api/users/login`, {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://evil-unauthorized-site.com',
        'Access-Control-Request-Method': 'POST',
      },
    });

    assert.equal(res.headers.get('access-control-allow-origin'), null);
  });

  await t.test('6. Cookie Setting - Sets SameSite=None, Secure, and HttpOnly on Login', async () => {
    const res = await fetch(`${baseUrl}/api/users/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'http://localhost:5173',
      },
      body: JSON.stringify({
        username: 'test_cors_admin',
        password: 'TestPass123!',
      }),
    });

    assert.equal(res.status, 200);
    const setCookie = res.headers.get('set-cookie');
    assert.ok(setCookie, 'set-cookie header should be present');
    assert.ok(setCookie.includes('mg_sid='), 'mg_sid cookie should be set');
    assert.ok(setCookie.toLowerCase().includes('samesite=none'), 'SameSite=None must be present for cross-origin');
    assert.ok(setCookie.toLowerCase().includes('secure'), 'Secure must be present for cross-origin');
    assert.ok(setCookie.toLowerCase().includes('httponly'), 'HttpOnly must be present');
  });

  await t.test('7. Dual Authentication - Accepts Bearer token fallback in Authorization header', async () => {
    // 1. Log in to get token
    const loginRes = await fetch(`${baseUrl}/api/users/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'test_cors_admin', password: 'TestPass123!' }),
    });
    const setCookie = loginRes.headers.get('set-cookie');
    const tokenMatch = setCookie.match(/mg_sid=([^;]+)/);
    const token = tokenMatch[1];

    // 2. Request /api/users/me using ONLY Authorization: Bearer <token> (no cookie)
    const meRes = await fetch(`${baseUrl}/api/users/me`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    assert.equal(meRes.status, 200);
    const meBody = await meRes.json();
    assert.equal(meBody.status, 'success');
    assert.equal(meBody.data.user.username, 'test_cors_admin');
  });

  await t.test('8. Logout - Clears cookie with SameSite=None and Secure', async () => {
    const loginRes = await fetch(`${baseUrl}/api/users/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'test_cors_admin', password: 'TestPass123!' }),
    });
    const setCookie = loginRes.headers.get('set-cookie');
    const token = setCookie.match(/mg_sid=([^;]+)/)[1];

    const logoutRes = await fetch(`${baseUrl}/api/users/logout`, {
      method: 'POST',
      headers: {
        Cookie: `mg_sid=${token}`,
      },
    });

    assert.equal(logoutRes.status, 200);
    const clearCookieHeader = logoutRes.headers.get('set-cookie');
    assert.ok(clearCookieHeader);
    assert.ok(clearCookieHeader.toLowerCase().includes('samesite=none'));
    assert.ok(clearCookieHeader.toLowerCase().includes('secure'));
  });
});
