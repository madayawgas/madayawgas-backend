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

test('User Administration & Management Tests', async (t) => {
  let testUserId;
  let testRoleId;
  let salesPersonRoleId;

  beforeEach(async () => {
    // Clean test_mgmt sessions & users
    await query(`DELETE FROM audit_logs WHERE user_id IN (SELECT id FROM users WHERE username LIKE 'test_mgmt_%') OR target_user_id IN (SELECT id FROM users WHERE username LIKE 'test_mgmt_%')`);
    await query(`DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE username LIKE 'test_mgmt_%')`);
    await query(`DELETE FROM users WHERE username LIKE 'test_mgmt_%'`);

    const roleRes = await query(`SELECT id FROM roles WHERE name = 'Super Admin'`);
    testRoleId = roleRes.rows[0].id;

    const salesRoleRes = await query(`SELECT id FROM roles WHERE name = 'Sales Person'`);
    salesPersonRoleId = salesRoleRes.rows[0].id;

    const passwordHash = await bcrypt.hash('TestPass123!', 10);
    const userRes = await query(
      `INSERT INTO users (username, password_hash, first_name, last_name, role_id, is_active, is_blocked)
       VALUES ($1, $2, $3, $4, $5, TRUE, FALSE)
       RETURNING id`,
      ['test_mgmt_superadmin', passwordHash, 'Test', 'Admin', testRoleId]
    );
    testUserId = userRes.rows[0].id;
  });

  await t.test('1. Register / Create User Account (Admin Operation)', async () => {
    const adminLogin = await fetch(`${baseUrl}/api/users/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'test_mgmt_superadmin', password: 'TestPass123!' }),
    });
    const adminCookie = parseCookieHeader(adminLogin);

    // 1) Admin creates user
    const createRes = await fetch(`${baseUrl}/api/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `mg_sid=${adminCookie}`,
      },
      body: JSON.stringify({
        username: 'test_mgmt_newuser',
        password: 'NewUserPassword123!',
        firstName: 'Juan',
        lastName: 'Cruz',
        birthdate: '1992-04-10',
        roleId: salesPersonRoleId,
      }),
    });

    assert.equal(createRes.status, 201);
    const createBody = await createRes.json();
    assert.equal(createBody.status, 'success');
    assert.equal(createBody.data.user.username, 'test_mgmt_newuser');
    assert.equal(createBody.data.user.role, 'Sales Person');

    // Verify new user can log in
    const userLogin = await fetch(`${baseUrl}/api/users/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'test_mgmt_newuser', password: 'NewUserPassword123!' }),
    });
    assert.equal(userLogin.status, 200);

    // 2) Duplicate username rejected
    const duplicateRes = await fetch(`${baseUrl}/api/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `mg_sid=${adminCookie}`,
      },
      body: JSON.stringify({
        username: 'test_mgmt_newuser',
        password: 'AnotherPassword123!',
        firstName: 'Juan',
        lastName: 'Cruz',
        roleId: salesPersonRoleId,
      }),
    });
    assert.equal(duplicateRes.status, 400);

    // 3) Non-admin prevented from creating users
    const userCookie = parseCookieHeader(userLogin);
    const unauthorizedCreate = await fetch(`${baseUrl}/api/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `mg_sid=${userCookie}`,
      },
      body: JSON.stringify({
        username: 'test_mgmt_illegal',
        password: 'Password123!',
        firstName: 'Bad',
        lastName: 'Actor',
        roleId: salesPersonRoleId,
      }),
    });
    assert.equal(unauthorizedCreate.status, 403);
  });

  await t.test('2. Update User Credentials by Administrator', async () => {
    const adminLogin = await fetch(`${baseUrl}/api/users/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'test_mgmt_superadmin', password: 'TestPass123!' }),
    });
    const adminCookie = parseCookieHeader(adminLogin);

    // Create target user
    const createRes = await fetch(`${baseUrl}/api/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: `mg_sid=${adminCookie}` },
      body: JSON.stringify({
        username: 'test_mgmt_creduser',
        password: 'InitialPassword123!',
        firstName: 'Cred',
        lastName: 'User',
        roleId: salesPersonRoleId,
      }),
    });
    const targetUserId = (await createRes.json()).data.user.id;

    // Login as target user
    const userLogin = await fetch(`${baseUrl}/api/users/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'test_mgmt_creduser', password: 'InitialPassword123!' }),
    });
    const userCookie = parseCookieHeader(userLogin);

    // Admin resets target user's username and password
    const resetRes = await fetch(`${baseUrl}/api/users/${targetUserId}/credentials`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: `mg_sid=${adminCookie}` },
      body: JSON.stringify({
        username: 'test_mgmt_creduser_renamed',
        password: 'AdminResetPassword456!',
      }),
    });
    assert.equal(resetRes.status, 200);

    // Target user's active session is immediately revoked
    const checkRevoked = await fetch(`${baseUrl}/api/users/me`, {
      headers: { Cookie: `mg_sid=${userCookie}` },
    });
    assert.equal(checkRevoked.status, 401);

    // Old credentials fail
    const oldLogin = await fetch(`${baseUrl}/api/users/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'test_mgmt_creduser', password: 'InitialPassword123!' }),
    });
    assert.equal(oldLogin.status, 401);

    // New credentials succeed
    const newLogin = await fetch(`${baseUrl}/api/users/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'test_mgmt_creduser_renamed', password: 'AdminResetPassword456!' }),
    });
    assert.equal(newLogin.status, 200);
  });

  await t.test('3. Deactivate / Block User Account and Super Admin Protection', async () => {
    const adminLogin = await fetch(`${baseUrl}/api/users/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'test_mgmt_superadmin', password: 'TestPass123!' }),
    });
    const adminCookie = parseCookieHeader(adminLogin);

    // Create target user
    const createRes = await fetch(`${baseUrl}/api/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: `mg_sid=${adminCookie}` },
      body: JSON.stringify({
        username: 'test_mgmt_statususer',
        password: 'StatusPassword123!',
        firstName: 'Status',
        lastName: 'User',
        roleId: salesPersonRoleId,
      }),
    });
    const targetUserId = (await createRes.json()).data.user.id;

    // Login as target user
    const userLogin = await fetch(`${baseUrl}/api/users/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'test_mgmt_statususer', password: 'StatusPassword123!' }),
    });
    const userCookie = parseCookieHeader(userLogin);

    // 1) Admin deactivates target user (isActive = false)
    const deactivateRes = await fetch(`${baseUrl}/api/users/${targetUserId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: `mg_sid=${adminCookie}` },
      body: JSON.stringify({ isActive: false }),
    });
    assert.equal(deactivateRes.status, 200);

    // Target user's active session is revoked immediately
    const checkDeactivated = await fetch(`${baseUrl}/api/users/me`, {
      headers: { Cookie: `mg_sid=${userCookie}` },
    });
    assert.equal(checkDeactivated.status, 401);

    // Deactivated user cannot log in
    const deactLogin = await fetch(`${baseUrl}/api/users/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'test_mgmt_statususer', password: 'StatusPassword123!' }),
    });
    assert.equal(deactLogin.status, 401);

    // 2) Admin reactivates and blocks user (isActive = true, isBlocked = true)
    const blockRes = await fetch(`${baseUrl}/api/users/${targetUserId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: `mg_sid=${adminCookie}` },
      body: JSON.stringify({ isActive: true, isBlocked: true }),
    });
    assert.equal(blockRes.status, 200);

    // Blocked user cannot log in
    const blockedLogin = await fetch(`${baseUrl}/api/users/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'test_mgmt_statususer', password: 'StatusPassword123!' }),
    });
    assert.equal(blockedLogin.status, 401);

    // 3) Attempting to deactivate or block Super Admin must be rejected (400)
    const superAdminBlock = await fetch(`${baseUrl}/api/users/${testUserId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: `mg_sid=${adminCookie}` },
      body: JSON.stringify({ isBlocked: true }),
    });
    assert.equal(superAdminBlock.status, 400);
    const errBody = await superAdminBlock.json();
    assert.equal(errBody.message, 'Super Admin account cannot be deactivated or blocked');
  });

  await t.test('4. List All Users & Get Roles (Admin)', async () => {
    const adminLogin = await fetch(`${baseUrl}/api/users/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'test_mgmt_superadmin', password: 'TestPass123!' }),
    });
    const adminCookie = parseCookieHeader(adminLogin);

    // List users
    const usersRes = await fetch(`${baseUrl}/api/users`, {
      headers: { Cookie: `mg_sid=${adminCookie}` },
    });
    assert.equal(usersRes.status, 200);
    const usersData = await usersRes.json();
    assert.ok(Array.isArray(usersData.data.users));

    // Get roles
    const rolesRes = await fetch(`${baseUrl}/api/users/roles`, {
      headers: { Cookie: `mg_sid=${adminCookie}` },
    });
    assert.equal(rolesRes.status, 200);
    const rolesData = await rolesRes.json();
    assert.ok(Array.isArray(rolesData.data.roles));
    assert.ok(rolesData.data.roles.some((r) => r.name === 'Super Admin'));
  });
});
