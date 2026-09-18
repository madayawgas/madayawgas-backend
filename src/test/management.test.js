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
    await query(`DELETE FROM history_logs WHERE user_id IN (SELECT id FROM users WHERE username LIKE 'test_mgmt_%' OR username IN ('jcruz', 'jcruz1') OR username LIKE 'sdoe%' OR username LIKE 'pplant%') OR user_name LIKE '%test_mgmt_%' OR details LIKE '%jcruz%' OR details LIKE '%sdoe%' OR details LIKE '%pplant%'`);
    await query(`DELETE FROM audit_logs WHERE user_id IN (SELECT id FROM users WHERE username LIKE 'test_mgmt_%' OR username IN ('jcruz', 'jcruz1') OR username LIKE 'sdoe%' OR username LIKE 'pplant%') OR target_user_id IN (SELECT id FROM users WHERE username LIKE 'test_mgmt_%' OR username IN ('jcruz', 'jcruz1') OR username LIKE 'sdoe%' OR username LIKE 'pplant%')`);
    await query(`DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE username LIKE 'test_mgmt_%' OR username IN ('jcruz', 'jcruz1') OR username LIKE 'sdoe%' OR username LIKE 'pplant%')`);
    await query(`DELETE FROM users WHERE username LIKE 'test_mgmt_%' OR username IN ('jcruz', 'jcruz1') OR username LIKE 'sdoe%' OR username LIKE 'pplant%'`);

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
        phone: '0917-987-6543', // Formatted mobile
        roleId: salesPersonRoleId,
      }),
    });
    assert.equal(createRes2.status, 201);
    const createBody2 = await createRes2.json();
    assert.equal(createBody2.data.user.username, 'jcruz1');
    assert.equal(createBody2.data.user.phone, '+639179876543'); // Standardized to +63...

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

  await t.test('2. Update User Credentials / Reset Temporary Password by Administrator with Password Confirmation', async () => {
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

    // 1) Fails without adminPassword confirmation
    const unconfirmedReset = await fetch(`${baseUrl}/api/users/${targetUserId}/credentials`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: `mg_sid=${adminCookie}` },
      body: JSON.stringify({
        resetPassword: true,
      }),
    });
    assert.equal(unconfirmedReset.status, 401);

    // 2) Fails with wrong adminPassword confirmation
    const wrongPassReset = await fetch(`${baseUrl}/api/users/${targetUserId}/credentials`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: `mg_sid=${adminCookie}` },
      body: JSON.stringify({
        resetPassword: true,
        adminPassword: 'WrongAdminPassword123!',
      }),
    });
    assert.equal(wrongPassReset.status, 401);

    // 3) Admin successfully resets target user's password with valid adminPassword
    const resetRes = await fetch(`${baseUrl}/api/users/${targetUserId}/credentials`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: `mg_sid=${adminCookie}` },
      body: JSON.stringify({
        resetPassword: true,
        username: 'test_mgmt_cred_renamed',
        adminPassword: 'TestPass123!',
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

  await t.test('3. Deactivate / Block User Account with Admin Password Confirmation and Super Admin Protection', async () => {
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

    // 1) Rejects deactivation without adminPassword
    const noPassDeactivate = await fetch(`${baseUrl}/api/users/${targetUserId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: `mg_sid=${adminCookie}` },
      body: JSON.stringify({ isActive: false }),
    });
    assert.equal(noPassDeactivate.status, 401);

    // 2) Rejects deactivation with incorrect adminPassword
    const badPassDeactivate = await fetch(`${baseUrl}/api/users/${targetUserId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: `mg_sid=${adminCookie}` },
      body: JSON.stringify({ isActive: false, adminPassword: 'WrongPassword!' }),
    });
    assert.equal(badPassDeactivate.status, 401);

    // 3) Admin successfully deactivates target user with valid adminPassword
    const deactivateRes = await fetch(`${baseUrl}/api/users/${targetUserId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: `mg_sid=${adminCookie}` },
      body: JSON.stringify({ isActive: false, adminPassword: 'TestPass123!' }),
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

    // 4) Admin reactivates and blocks user with valid adminPassword
    const blockRes = await fetch(`${baseUrl}/api/users/${targetUserId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: `mg_sid=${adminCookie}` },
      body: JSON.stringify({ isActive: true, isBlocked: true, adminPassword: 'TestPass123!' }),
    });
    assert.equal(blockRes.status, 200);

    // Blocked user cannot log in
    const blockedLogin = await fetch(`${baseUrl}/api/users/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: targetUsername, password: targetPassword }),
    });
    assert.equal(blockedLogin.status, 401);

    // 5) Attempting to deactivate or block Super Admin must be rejected (400)
    const superAdminBlock = await fetch(`${baseUrl}/api/users/${testUserId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: `mg_sid=${adminCookie}` },
      body: JSON.stringify({ isBlocked: true, adminPassword: 'TestPass123!' }),
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

  await t.test('5. Change User Role (Admin Operation: PATCH /api/users/:id/role)', async () => {
    const adminLogin = await fetch(`${baseUrl}/api/users/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'test_mgmt_superadmin', password: 'TestPass123!' }),
    });
    const adminCookie = parseCookieHeader(adminLogin);

    const fleetRoleRes = await query(`SELECT id FROM roles WHERE name = 'Fleet Manager'`);
    const fleetRoleId = fleetRoleRes.rows[0].id;

    // 1) Create a user with Sales Person role
    const userPassHash = await bcrypt.hash('TargetPass123!', 10);
    const userRes = await query(
      `INSERT INTO users (username, password_hash, first_name, last_name, phone, role_id, is_active, is_blocked, must_change_password)
       VALUES ($1, $2, $3, $4, $5, $6, TRUE, FALSE, FALSE)
       RETURNING id`,
      ['test_mgmt_target_role', userPassHash, 'Role', 'Target', '+639170000088', salesPersonRoleId]
    );
    const targetUserId = userRes.rows[0].id;

    // Log in as target user to establish active session
    const targetLogin = await fetch(`${baseUrl}/api/users/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'test_mgmt_target_role', password: 'TargetPass123!' }),
    });
    assert.equal(targetLogin.status, 200);
    const targetCookie = parseCookieHeader(targetLogin);

    // 2) Non-admin cannot change roles (403 Forbidden)
    const unauthorizedRoleChange = await fetch(`${baseUrl}/api/users/${targetUserId}/role`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: `mg_sid=${targetCookie}` },
      body: JSON.stringify({ roleId: fleetRoleId, confirmPassword: 'TargetPass123!' }),
    });
    assert.equal(unauthorizedRoleChange.status, 403);

    // 3) Admin role change rejected without password confirmation
    const noPassRoleChange = await fetch(`${baseUrl}/api/users/${targetUserId}/role`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: `mg_sid=${adminCookie}` },
      body: JSON.stringify({ roleId: fleetRoleId }),
    });
    assert.equal(noPassRoleChange.status, 401);
    const noPassJson = await noPassRoleChange.json();
    assert.equal(noPassJson.code, 'PASSWORD_CONFIRMATION_REQUIRED');

    // 4) Admin role change rejected with wrong password confirmation
    const wrongPassRoleChange = await fetch(`${baseUrl}/api/users/${targetUserId}/role`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: `mg_sid=${adminCookie}` },
      body: JSON.stringify({ roleId: fleetRoleId, confirmPassword: 'WrongPassword!' }),
    });
    assert.equal(wrongPassRoleChange.status, 401);
    const wrongPassJson = await wrongPassRoleChange.json();
    assert.equal(wrongPassJson.code, 'INVALID_CONFIRMATION_PASSWORD');

    // 5) Admin successfully changes user's role to Fleet Manager with valid confirmation password
    const adminRoleChange = await fetch(`${baseUrl}/api/users/${targetUserId}/role`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: `mg_sid=${adminCookie}` },
      body: JSON.stringify({ roleId: fleetRoleId, confirmPassword: 'TestPass123!' }),
    });
    assert.equal(adminRoleChange.status, 200);
    const roleChangeBody = await adminRoleChange.json();
    assert.equal(roleChangeBody.status, 'success');
    assert.equal(roleChangeBody.data.user.role, 'Fleet Manager');
    assert.ok(Array.isArray(roleChangeBody.data.user.permissions));
    assert.ok(roleChangeBody.data.user.permissions.includes('fleet.view'));

    // 6) Target user's active session is invalidated immediately
    const checkTargetSession = await fetch(`${baseUrl}/api/users/me`, {
      headers: { Cookie: `mg_sid=${targetCookie}` },
    });
    assert.equal(checkTargetSession.status, 401);

    // 7) Invalid role ID returns 400 Bad Request
    const invalidRoleChange = await fetch(`${baseUrl}/api/users/${targetUserId}/role`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: `mg_sid=${adminCookie}` },
      body: JSON.stringify({ roleId: '00000000-0000-0000-0000-000000000000', confirmPassword: 'TestPass123!' }),
    });
    assert.equal(invalidRoleChange.status, 400);

    // 8) Primary superadmin role cannot be changed
    const superAdminRoleChange = await fetch(`${baseUrl}/api/users/${testUserId}/role`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: `mg_sid=${adminCookie}` },
      body: JSON.stringify({ roleId: salesPersonRoleId, confirmPassword: 'TestPass123!' }),
    });
    assert.equal(superAdminRoleChange.status, 400);
    const superAdminErr = await superAdminRoleChange.json();
    assert.equal(superAdminErr.message, 'Cannot change the role of a Super Admin account');
  });

  // ============================================================
  // Subtest 6: Role Management CRUD & Permissions System Tests
  // ============================================================
  await t.test('6. Role Management CRUD, Permission Selection & Safeguards', async () => {
    const adminLogin = await fetch(`${baseUrl}/api/users/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'test_mgmt_superadmin', password: 'TestPass123!' }),
    });
    const adminCookie = parseCookieHeader(adminLogin);

    // 1. List all permissions (GET /api/users/permissions)
    const permsRes = await fetch(`${baseUrl}/api/users/permissions`, {
      headers: { Cookie: `mg_sid=${adminCookie}` },
    });
    assert.equal(permsRes.status, 200);
    const permsBody = await permsRes.json();
    assert.ok(Array.isArray(permsBody.data.permissions));
    assert.ok(permsBody.data.permissions.some((p) => p.name === 'fleet.view'));
    assert.ok(permsBody.data.permissions.some((p) => p.name === 'sales.view'));

    // 2. List all roles (GET /api/users/roles) - checks presence of all 6 standard roles
    const rolesRes = await fetch(`${baseUrl}/api/users/roles`, {
      headers: { Cookie: `mg_sid=${adminCookie}` },
    });
    assert.equal(rolesRes.status, 200);
    const rolesBody = await rolesRes.json();
    const roles = rolesBody.data.roles;
    assert.ok(Array.isArray(roles));

    const roleNames = roles.map((r) => r.name);
    assert.ok(roleNames.includes('Super Admin'));
    assert.ok(roleNames.includes('Admin'));
    assert.ok(roleNames.includes('Fleet Manager'));
    assert.ok(roleNames.includes('Sales Manager'));
    assert.ok(roleNames.includes('Sales Person'));
    assert.ok(roleNames.includes('Driver'));

    const salesManager = roles.find((r) => r.name === 'Sales Manager');
    assert.ok(salesManager.permissions.includes('inventory.view'));
    assert.ok(salesManager.permissions.includes('sales.view'));

    const driverRole = roles.find((r) => r.name === 'Driver');
    assert.equal(driverRole.permissions.length, 0); // Driver has no login permissions

    // 3. Create a new custom role (POST /api/users/roles)
    const createRoleRes = await fetch(`${baseUrl}/api/users/roles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: `mg_sid=${adminCookie}` },
      body: JSON.stringify({
        name: 'Quality Inspector',
        description: 'Inspects LPG tanks and vehicle maintenance quality',
        permissions: ['fleet.view', 'inventory.view', 'dashboard.view'],
      }),
    });
    assert.equal(createRoleRes.status, 201);
    const createRoleBody = await createRoleRes.json();
    assert.equal(createRoleBody.status, 'success');
    const createdRole = createRoleBody.data.role;
    assert.equal(createdRole.name, 'Quality Inspector');
    assert.equal(createdRole.userCount, 0);
    assert.equal(createdRole.permissions.length, 3);
    assert.ok(createdRole.permissions.includes('inventory.view'));

    // 4. Duplicate role name rejected (400)
    const dupRoleRes = await fetch(`${baseUrl}/api/users/roles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: `mg_sid=${adminCookie}` },
      body: JSON.stringify({
        name: 'Quality Inspector',
        description: 'Duplicate test',
      }),
    });
    assert.equal(dupRoleRes.status, 400);

    // 5. Get role by ID (GET /api/users/roles/:id)
    const getRoleRes = await fetch(`${baseUrl}/api/users/roles/${createdRole.id}`, {
      headers: { Cookie: `mg_sid=${adminCookie}` },
    });
    assert.equal(getRoleRes.status, 200);
    const getRoleBody = await getRoleRes.json();
    assert.equal(getRoleBody.data.role.id, createdRole.id);
    assert.equal(getRoleBody.data.role.name, 'Quality Inspector');

    // 6. Update role details and permissions (PATCH /api/users/roles/:id)
    const updateRoleRes = await fetch(`${baseUrl}/api/users/roles/${createdRole.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: `mg_sid=${adminCookie}` },
      body: JSON.stringify({
        name: 'Lead Quality Inspector',
        description: 'Updated description',
        permissions: ['fleet.view', 'fleet.manage', 'inventory.view', 'inventory.manage'],
      }),
    });
    assert.equal(updateRoleRes.status, 200);
    const updateRoleBody = await updateRoleRes.json();
    assert.equal(updateRoleBody.data.role.name, 'Lead Quality Inspector');
    assert.equal(updateRoleBody.data.role.permissions.length, 4);
    assert.ok(updateRoleBody.data.role.permissions.includes('fleet.manage'));

    // 7. Protected System Roles cannot be deleted (400)
    const delSystemRoleRes = await fetch(`${baseUrl}/api/users/roles/${driverRole.id}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', Cookie: `mg_sid=${adminCookie}` },
      body: JSON.stringify({ confirmPassword: 'TestPass123!' }),
    });
    assert.equal(delSystemRoleRes.status, 400);
    const delSystemRoleJson = await delSystemRoleRes.json();
    assert.ok(delSystemRoleJson.message.includes('Cannot delete system default role'));

    // 8. Role deletion requires password confirmation
    const noPassDel = await fetch(`${baseUrl}/api/users/roles/${createdRole.id}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', Cookie: `mg_sid=${adminCookie}` },
    });
    assert.equal(noPassDel.status, 401);
    const noPassDelJson = await noPassDel.json();
    assert.equal(noPassDelJson.code, 'PASSWORD_CONFIRMATION_REQUIRED');

    const wrongPassDel = await fetch(`${baseUrl}/api/users/roles/${createdRole.id}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', Cookie: `mg_sid=${adminCookie}` },
      body: JSON.stringify({ confirmPassword: 'WrongPassword!' }),
    });
    assert.equal(wrongPassDel.status, 401);
    const wrongPassDelJson = await wrongPassDel.json();
    assert.equal(wrongPassDelJson.code, 'INVALID_CONFIRMATION_PASSWORD');

    // 9. Successfully delete custom role with valid password confirmation (200)
    const successDel = await fetch(`${baseUrl}/api/users/roles/${createdRole.id}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', Cookie: `mg_sid=${adminCookie}` },
      body: JSON.stringify({ confirmPassword: 'TestPass123!' }),
    });
    assert.equal(successDel.status, 200);

    // Verify role is deleted (404)
    const verifyDel = await fetch(`${baseUrl}/api/users/roles/${createdRole.id}`, {
      headers: { Cookie: `mg_sid=${adminCookie}` },
    });
    assert.equal(verifyDel.status, 404);
  });

  await t.test('7. Multi-Role User Operations & Org Chart Roles Alignment', async () => {
    const adminLogin = await fetch(`${baseUrl}/api/users/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'test_mgmt_superadmin', password: 'TestPass123!' }),
    });
    const adminCookie = parseCookieHeader(adminLogin);

    // Fetch org chart role IDs
    const salesSupRes = await query(`SELECT id FROM roles WHERE name = 'Sales Supervisor'`);
    const salesSupId = salesSupRes.rows[0].id;

    const logisticsSupRes = await query(`SELECT id FROM roles WHERE name = 'Logistics Supervisor'`);
    const logisticsSupId = logisticsSupRes.rows[0].id;

    const plantSupRes = await query(`SELECT id FROM roles WHERE name = 'Plant Supervisor'`);
    const plantSupId = plantSupRes.rows[0].id;

    // 1. Admin creates a multi-role user (Samantha Doe: Sales Supervisor + Logistics Supervisor)
    const createMultiRes = await fetch(`${baseUrl}/api/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: `mg_sid=${adminCookie}` },
      body: JSON.stringify({
        firstName: 'Samantha',
        lastName: 'Doe',
        phone: '+639178889999',
        roleIds: [salesSupId, logisticsSupId],
      }),
    });
    assert.equal(createMultiRes.status, 201);
    const createMultiJson = await createMultiRes.json();
    assert.equal(createMultiJson.status, 'success');
    assert.equal(createMultiJson.data.user.role, 'Sales Supervisor'); // Primary role preserved
    assert.ok(Array.isArray(createMultiJson.data.user.roles));
    assert.equal(createMultiJson.data.user.roles.length, 2);
    assert.ok(createMultiJson.data.user.roleNames.includes('Sales Supervisor'));
    assert.ok(createMultiJson.data.user.roleNames.includes('Logistics Supervisor'));
    const samanthaTempPassword = createMultiJson.data.temporaryPassword;
    const samanthaUserId = createMultiJson.data.user.id;

    // 2. Samantha logs in and changes temporary password
    const samanthaUsername = createMultiJson.data.user.username;
    const samanthaLogin1 = await fetch(`${baseUrl}/api/users/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: samanthaUsername, password: samanthaTempPassword }),
    });
    assert.equal(samanthaLogin1.status, 200);
    const samanthaCookie1 = parseCookieHeader(samanthaLogin1);

    const passChangeRes = await fetch(`${baseUrl}/api/users/change-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: `mg_sid=${samanthaCookie1}` },
      body: JSON.stringify({ newPassword: 'NewSupervisorPass123!' }),
    });
    assert.equal(passChangeRes.status, 200);

    // Re-login with new password
    const samanthaLogin2 = await fetch(`${baseUrl}/api/users/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: samanthaUsername, password: 'NewSupervisorPass123!' }),
    });
    assert.equal(samanthaLogin2.status, 200);
    const samanthaCookie2 = parseCookieHeader(samanthaLogin2);
    const samanthaProfile = await samanthaLogin2.json();

    // 3. Verify union permissions across both Sales and Logistics roles
    const samanthaPerms = samanthaProfile.data.user.permissions;
    assert.ok(samanthaPerms.includes('sales.view'), 'Must have Sales Supervisor permission');
    assert.ok(samanthaPerms.includes('sales.update'), 'Must have Sales Supervisor permission');
    assert.ok(samanthaPerms.includes('fleet.view'), 'Must have Logistics Supervisor permission');
    assert.ok(samanthaPerms.includes('fleet.manage'), 'Must have Logistics Supervisor permission');
    assert.ok(samanthaPerms.includes('route.view'), 'Must have Logistics Supervisor permission');
    assert.ok(!samanthaPerms.includes('users.manage'), 'Must not have User Management permission');

    // Access Sales endpoint -> 200 OK
    const salesAccess = await fetch(`${baseUrl}/api/sales/customers`, {
      headers: { Cookie: `mg_sid=${samanthaCookie2}` },
    });
    assert.equal(salesAccess.status, 200);

    // Access Fleet endpoint -> 200 OK
    const fleetAccess = await fetch(`${baseUrl}/api/fleet/overview`, {
      headers: { Cookie: `mg_sid=${samanthaCookie2}` },
    });
    assert.equal(fleetAccess.status, 200);

    // Access Admin Users endpoint -> 403 Forbidden
    const adminAccess = await fetch(`${baseUrl}/api/users`, {
      headers: { Cookie: `mg_sid=${samanthaCookie2}` },
    });
    assert.equal(adminAccess.status, 403);

    // 4. Plant Supervisor role verification (empty permissions as per requirements)
    const createPlantRes = await fetch(`${baseUrl}/api/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: `mg_sid=${adminCookie}` },
      body: JSON.stringify({
        firstName: 'Pedro',
        lastName: 'Plant',
        phone: '+639177776666',
        roleId: plantSupId,
      }),
    });
    assert.equal(createPlantRes.status, 201);
    const createPlantJson = await createPlantRes.json();
    assert.equal(createPlantJson.data.user.role, 'Plant Supervisor');

    // Plant user login & session verification
    const plantUsername = createPlantJson.data.user.username;
    const plantLogin = await fetch(`${baseUrl}/api/users/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: plantUsername, password: createPlantJson.data.temporaryPassword }),
    });
    assert.equal(plantLogin.status, 200);
    const plantProfile = await plantLogin.json();
    assert.equal(plantProfile.data.user.permissions.length, 0, 'Plant Supervisor must have no permissions assigned yet');

    // 5. Admin updates a user to multi-role via PATCH /api/users/:id/role
    const roleUpdateRes = await fetch(`${baseUrl}/api/users/${samanthaUserId}/role`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: `mg_sid=${adminCookie}` },
      body: JSON.stringify({
        roleIds: [plantSupId, salesSupId],
        primaryRoleId: plantSupId,
        confirmPassword: 'TestPass123!',
      }),
    });
    assert.equal(roleUpdateRes.status, 200);
    const roleUpdateJson = await roleUpdateRes.json();
    assert.equal(roleUpdateJson.data.user.role, 'Plant Supervisor');
    assert.equal(roleUpdateJson.data.user.roles.length, 2);

    // 6. Delete role protection for org chart roles (400 Bad Request)
    for (const protectedRole of ['Plant Supervisor', 'Logistics Supervisor', 'Sales Supervisor']) {
      const pRoleRes = await query(`SELECT id FROM roles WHERE name = $1`, [protectedRole]);
      const delRes = await fetch(`${baseUrl}/api/users/roles/${pRoleRes.rows[0].id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Cookie: `mg_sid=${adminCookie}` },
        body: JSON.stringify({ confirmPassword: 'TestPass123!' }),
      });
      assert.equal(delRes.status, 400);
      const delJson = await delRes.json();
      assert.ok(delJson.message.includes('Cannot delete system default role'));
    }
  });
});
