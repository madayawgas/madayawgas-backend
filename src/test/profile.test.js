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

function parseCookieHeader(res) {
  const setCookie = res.headers.get('set-cookie');
  if (!setCookie) return null;
  const match = setCookie.match(/mg_sid=([^;]+)/);
  return match ? match[1] : null;
}

test('User Profile Operations Tests', async (t) => {
  let testUserId;
  let testRoleId;
  let salesPersonRoleId;
  let fleetManagerRoleId;

  beforeEach(async () => {
    // Clean test_prof sessions & users
    await query(`DELETE FROM audit_logs WHERE user_id IN (SELECT id FROM users WHERE username LIKE 'test_prof_%') OR target_user_id IN (SELECT id FROM users WHERE username LIKE 'test_prof_%')`);
    await query(`DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE username LIKE 'test_prof_%')`);
    await query(`DELETE FROM users WHERE username LIKE 'test_prof_%'`);

    const roleRes = await query(`SELECT id FROM roles WHERE name = 'Super Admin'`);
    testRoleId = roleRes.rows[0].id;

    const salesRoleRes = await query(`SELECT id FROM roles WHERE name = 'Sales Person'`);
    salesPersonRoleId = salesRoleRes.rows[0].id;

    const fleetRoleRes = await query(`SELECT id FROM roles WHERE name = 'Fleet Manager'`);
    fleetManagerRoleId = fleetRoleRes.rows[0].id;

    const passwordHash = await bcrypt.hash('TestPass123!', 10);
    const userRes = await query(
      `INSERT INTO users (username, password_hash, first_name, last_name, role_id, is_active, is_blocked)
       VALUES ($1, $2, $3, $4, $5, TRUE, FALSE)
       RETURNING id`,
      ['test_prof_superadmin', passwordHash, 'Test', 'Admin', testRoleId]
    );
    testUserId = userRes.rows[0].id;
  });

  await t.test('1. View & Update Own Profile (/api/users/me)', async () => {
    // Create regular user
    const userPasswordHash = await bcrypt.hash('UserPass123!', 10);
    const userRes = await query(
      `INSERT INTO users (username, password_hash, first_name, last_name, role_id, is_active, is_blocked)
       VALUES ($1, $2, $3, $4, $5, TRUE, FALSE)
       RETURNING id`,
      ['test_prof_regularuser', userPasswordHash, 'Regular', 'User', salesPersonRoleId]
    );
    const regularUserId = userRes.rows[0].id;

    // Login as regular user
    const loginRes = await fetch(`${baseUrl}/api/users/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'test_prof_regularuser', password: 'UserPass123!' }),
    });
    const userCookie = parseCookieHeader(loginRes);

    // 1) View own profile via /me
    const meRes = await fetch(`${baseUrl}/api/users/me`, {
      headers: { Cookie: `mg_sid=${userCookie}` },
    });
    assert.equal(meRes.status, 200);
    const meData = await meRes.json();
    assert.equal(meData.data.user.username, 'test_prof_regularuser');
    assert.equal(meData.data.user.role, 'Sales Person');

    // 2) Update own profile personal info via /me
    const updateRes = await fetch(`${baseUrl}/api/users/me`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: `mg_sid=${userCookie}` },
      body: JSON.stringify({
        firstName: 'UpdatedFirst',
        lastName: 'UpdatedLast',
        birthdate: '1995-12-01',
      }),
    });
    assert.equal(updateRes.status, 200);
    const updateData = await updateRes.json();
    assert.equal(updateData.data.user.firstName, 'UpdatedFirst');
    assert.equal(updateData.data.user.lastName, 'UpdatedLast');
  });

  await t.test('2. Role Modification & Profile Access Controls', async () => {
    // Admin login
    const adminLogin = await fetch(`${baseUrl}/api/users/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'test_prof_superadmin', password: 'TestPass123!' }),
    });
    const adminCookie = parseCookieHeader(adminLogin);

    // Create regular user
    const userPasswordHash = await bcrypt.hash('UserPass123!', 10);
    const userRes = await query(
      `INSERT INTO users (username, password_hash, first_name, last_name, role_id, is_active, is_blocked)
       VALUES ($1, $2, $3, $4, $5, TRUE, FALSE)
       RETURNING id`,
      ['test_prof_targetuser', userPasswordHash, 'Target', 'User', salesPersonRoleId]
    );
    const targetUserId = userRes.rows[0].id;

    // Login as regular user
    const userLogin = await fetch(`${baseUrl}/api/users/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'test_prof_targetuser', password: 'UserPass123!' }),
    });
    const userCookie = parseCookieHeader(userLogin);

    // Regular user cannot change their own role (403 Forbidden)
    const illegalRoleUpdate = await fetch(`${baseUrl}/api/users/${targetUserId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: `mg_sid=${userCookie}` },
      body: JSON.stringify({ roleId: testRoleId }),
    });
    assert.equal(illegalRoleUpdate.status, 403);

    // Regular user cannot update other users profile (403 Forbidden)
    const illegalOtherUpdate = await fetch(`${baseUrl}/api/users/${testUserId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: `mg_sid=${userCookie}` },
      body: JSON.stringify({ firstName: 'Hacked' }),
    });
    assert.equal(illegalOtherUpdate.status, 403);

    // Admin updates target user's role
    const adminRoleUpdate = await fetch(`${baseUrl}/api/users/${targetUserId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: `mg_sid=${adminCookie}` },
      body: JSON.stringify({ roleId: fleetManagerRoleId }),
    });
    assert.equal(adminRoleUpdate.status, 200);
    const updatedUser = await adminRoleUpdate.json();
    assert.equal(updatedUser.data.user.role, 'Fleet Manager');

    // Target user's active session is invalidated due to role change
    const checkInvalidSession = await fetch(`${baseUrl}/api/users/me`, {
      headers: { Cookie: `mg_sid=${userCookie}` },
    });
    assert.equal(checkInvalidSession.status, 401);
  });
});
