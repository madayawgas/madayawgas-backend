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
    await query(`DELETE FROM audit_logs WHERE user_id IN (SELECT id FROM users WHERE username LIKE 'test_mgmt_%' OR username IN ('jcruz', 'jcruz1')) OR target_user_id IN (SELECT id FROM users WHERE username LIKE 'test_mgmt_%' OR username IN ('jcruz', 'jcruz1'))`);
    await query(`DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE username LIKE 'test_mgmt_%' OR username IN ('jcruz', 'jcruz1'))`);
    await query(`DELETE FROM users WHERE username LIKE 'test_mgmt_%' OR username IN ('jcruz', 'jcruz1')`);

    const roleRes = await query(`SELECT id FROM roles WHERE name = 'Super Admin'`);
    testRoleId = roleRes.rows[0].id;

    const salesRoleRes = await query(`SELECT id FROM roles WHERE name = 'Sales Person'`);
    salesPersonRoleId = salesRoleRes.rows[0].id;

    const passwordHash = await bcrypt.hash('TestPass123!', 10);
    const userRes = await query(
      `INSERT INTO users (username, password_hash, first_name, last_name, phone, role_id, is_active, is_blocked, must_change_password)
       VALUES ($1, $2, $3, $4, $5, $6, TRUE, FALSE, FALSE)
       RETURNING id`,
      ['test_mgmt_superadmin', passwordHash, 'Test', 'Admin', '+639170000001', testRoleId]
    );
    testUserId = userRes.rows[0].id;
  });

  await t.test('1. Register / Create User Account - Automatic username & temporary password generation', async () => {
    const adminLogin = await fetch(`${baseUrl}/api/users/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'test_mgmt_superadmin', password: 'TestPass123!' }),
    });
    const adminCookie = parseCookieHeader(adminLogin);

    // 1) Admin creates user without providing username or password
    const createRes1 = await fetch(`${baseUrl}/api/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `mg_sid=${adminCookie}`,
      },
      body: JSON.stringify({
        firstName: 'Juan',
        lastName: 'Cruz',
        phone: '+639171234567',
        birthdate: '1992-04-10',
        roleId: salesPersonRoleId,
      }),
    });

    assert.equal(createRes1.status, 201);
    const createBody1 = await createRes1.json();
    assert.equal(createBody1.status, 'success');
    assert.equal(createBody1.data.user.username, 'jcruz');
    assert.equal(createBody1.data.user.phone, '+639171234567');
    assert.equal(createBody1.data.user.role, 'Sales Person');
    assert.equal(createBody1.data.user.mustChangePassword, true);
    assert.ok(createBody1.data.temporaryPassword, 'Temporary password should be returned');

    // Verify new user can log in with auto-generated username and temporary password
    const userLogin = await fetch(`${baseUrl}/api/users/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'jcruz',
        password: createBody1.data.temporaryPassword,
      }),
    });
    assert.equal(userLogin.status, 200);
    const userLoginBody = await userLogin.json();
    assert.equal(userLoginBody.data.user.mustChangePassword, true);

    // 2) Automatic username collision resolution: create another user named Jane Cruz -> jcruz1
    const createRes2 = await fetch(`${baseUrl}/api/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `mg_sid=${adminCookie}`,
      },
      body: JSON.stringify({
        firstName: 'Jane',
        lastName: 'Cruz',
        phone: '+639179876543',
        roleId: salesPersonRoleId,
      }),
    });
    assert.equal(createRes2.status, 201);
    const createBody2 = await createRes2.json();
    assert.equal(createBody2.data.user.username, 'jcruz1');

    // 3) Non-admin prevented from creating users
    const userCookie = parseCookieHeader(userLogin);
    const unauthorizedCreate = await fetch(`${baseUrl}/api/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `mg_sid=${userCookie}`,
      },
      body: JSON.stringify({
        firstName: 'Bad',
        lastName: 'Actor',
        roleId: salesPersonRoleId,
      }),
    });
    assert.equal(unauthorizedCreate.status, 403);
  });

  await t.test('2. Update User Credentials / Reset Temporary Password by Administrator', async () => {
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
        firstName: 'Cred',
        lastName: 'User',
        phone: '+639171112222',
        roleId: salesPersonRoleId,
      }),
    });
    const created = await createRes.json();
    const targetUserId = created.data.user.id;
    const initialTempPassword = created.data.temporaryPassword;
    const generatedUsername = created.data.user.username;

    // Login as target user
    const userLogin = await fetch(`${baseUrl}/api/users/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: generatedUsername, password: initialTempPassword }),
    });
    const userCookie = parseCookieHeader(userLogin);

    // Admin resets target user's password (generates new temporary password)
    const resetRes = await fetch(`${baseUrl}/api/users/${targetUserId}/credentials`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: `mg_sid=${adminCookie}` },
      body: JSON.stringify({
        resetPassword: true,
        username: 'test_mgmt_cred_renamed',
      }),
    });
    assert.equal(resetRes.status, 200);
    const resetBody = await resetRes.json();
    assert.ok(resetBody.data.temporaryPassword, 'New temporary password should be generated');
    assert.equal(resetBody.data.mustChangePassword, true);

    // Target user's active session is immediately revoked
    const checkRevoked = await fetch(`${baseUrl}/api/users/me`, {
      headers: { Cookie: `mg_sid=${userCookie}` },
    });
    assert.equal(checkRevoked.status, 401);

    // Old temporary password fails
    const oldLogin = await fetch(`${baseUrl}/api/users/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: generatedUsername, password: initialTempPassword }),
    });
    assert.equal(oldLogin.status, 401);

    // New temporary password and new username succeed
    const newLogin = await fetch(`${baseUrl}/api/users/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'test_mgmt_cred_renamed', password: resetBody.data.temporaryPassword }),
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
        firstName: 'Status',
        lastName: 'User',
        roleId: salesPersonRoleId,
      }),
    });
    const created = await createRes.json();
    const targetUserId = created.data.user.id;
    const targetUsername = created.data.user.username;
    const targetPassword = created.data.temporaryPassword;

    // Login as target user
    const userLogin = await fetch(`${baseUrl}/api/users/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: targetUsername, password: targetPassword }),
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
      body: JSON.stringify({ username: targetUsername, password: targetPassword }),
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
      body: JSON.stringify({ username: targetUsername, password: targetPassword }),
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
