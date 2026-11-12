const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');
const app = require('../app');
const { query, pool } = require('../../database/connection');
const { mediaStorage } = require('../features/media');

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

test('User Profile Avatar Upload & Storage Lifecycle Tests', async (t) => {
  let superAdminId;
  let superAdminCookie;
  let regularUserId;
  let regularUserCookie;
  let secondUserId;
  let secondUserCookie;

  beforeEach(async () => {
    // Clean test_avatar records
    await query(`DELETE FROM history_logs WHERE user_id IN (SELECT id FROM users WHERE username LIKE 'test_avatar_%')`);
    await query(`DELETE FROM audit_logs WHERE user_id IN (SELECT id FROM users WHERE username LIKE 'test_avatar_%') OR target_user_id IN (SELECT id FROM users WHERE username LIKE 'test_avatar_%')`);
    await query(`DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE username LIKE 'test_avatar_%')`);
    await query(`DELETE FROM users WHERE username LIKE 'test_avatar_%'`);

    const superAdminRoleRes = await query(`SELECT id FROM roles WHERE name = 'Super Admin'`);
    const superAdminRoleId = superAdminRoleRes.rows[0].id;

    const salesRoleRes = await query(`SELECT id FROM roles WHERE name = 'Sales Person'`);
    const salesPersonRoleId = salesRoleRes.rows[0].id;

    const passwordHash = await bcrypt.hash('TestPass123!', 10);

    // 1. Create Super Admin
    const adminRes = await query(
      `INSERT INTO users (username, password_hash, first_name, last_name, phone, role_id, is_active, is_blocked, must_change_password)
       VALUES ($1, $2, $3, $4, $5, $6, TRUE, FALSE, FALSE)
       RETURNING id`,
      ['test_avatar_admin', passwordHash, 'Admin', 'User', '+639170001111', superAdminRoleId]
    );
    superAdminId = adminRes.rows[0].id;

    // 2. Create Regular User 1
    const regRes = await query(
      `INSERT INTO users (username, password_hash, first_name, last_name, phone, role_id, is_active, is_blocked, must_change_password)
       VALUES ($1, $2, $3, $4, $5, $6, TRUE, FALSE, FALSE)
       RETURNING id`,
      ['test_avatar_regular1', passwordHash, 'Regular', 'One', '+639170002222', salesPersonRoleId]
    );
    regularUserId = regRes.rows[0].id;

    // 3. Create Regular User 2
    const reg2Res = await query(
      `INSERT INTO users (username, password_hash, first_name, last_name, phone, role_id, is_active, is_blocked, must_change_password)
       VALUES ($1, $2, $3, $4, $5, $6, TRUE, FALSE, FALSE)
       RETURNING id`,
      ['test_avatar_regular2', passwordHash, 'Regular', 'Two', '+639170003333', salesPersonRoleId]
    );
    secondUserId = reg2Res.rows[0].id;

    // Log in all 3 users
    const adminLogin = await fetch(`${baseUrl}/api/users/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'test_avatar_admin', password: 'TestPass123!' }),
    });
    superAdminCookie = parseCookieHeader(adminLogin);

    const regLogin = await fetch(`${baseUrl}/api/users/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'test_avatar_regular1', password: 'TestPass123!' }),
    });
    regularUserCookie = parseCookieHeader(regLogin);

    const reg2Login = await fetch(`${baseUrl}/api/users/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'test_avatar_regular2', password: 'TestPass123!' }),
    });
    secondUserCookie = parseCookieHeader(reg2Login);
  });

  await t.test('1. Upload Avatar (Self) - Returns 200 and saves file to storage', async () => {
    const avatarBuffer = Buffer.from('TEST_AVATAR_INITIAL_PHOTO_BYTES_123');
    const form = new FormData();
    form.append('avatar', new Blob([avatarBuffer], { type: 'image/jpeg' }), 'avatar1.jpg');

    const res = await fetch(`${baseUrl}/api/users/me/avatar`, {
      method: 'POST',
      headers: { Cookie: `mg_sid=${regularUserCookie}` },
      body: form,
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, 'success');
    assert.ok(body.data.avatarMediaKey.startsWith('users/avatars/'));
    assert.ok(body.data.avatarUrl.includes('/media/users/avatars/'));
    assert.equal(body.data.user.avatarMediaKey, body.data.avatarMediaKey);

    // Verify DB
    const dbRes = await query('SELECT avatar_media_key FROM users WHERE id = $1', [regularUserId]);
    assert.equal(dbRes.rows[0].avatar_media_key, body.data.avatarMediaKey);

    // Verify local storage file exists
    const localDir = mediaStorage.getLocalMediaPath();
    const filePath = path.join(localDir, body.data.avatarMediaKey);
    assert.ok(fs.existsSync(filePath), `Expected avatar file ${filePath} to exist on disk`);
  });

  await t.test('2. Old Photo Deletion on Replacement - Purges previous asset from disk to save space', async () => {
    // Step 1: Upload initial avatar A
    const bufferA = Buffer.from('TEST_AVATAR_PHOTO_A_UNIQUE_111');
    const formA = new FormData();
    formA.append('avatar', new Blob([bufferA], { type: 'image/jpeg' }), 'photoA.jpg');

    const resA = await fetch(`${baseUrl}/api/users/me/avatar`, {
      method: 'POST',
      headers: { Cookie: `mg_sid=${regularUserCookie}` },
      body: formA,
    });
    const bodyA = await resA.json();
    const keyA = bodyA.data.avatarMediaKey;
    const localDir = mediaStorage.getLocalMediaPath();
    const pathA = path.join(localDir, keyA);
    assert.ok(fs.existsSync(pathA), 'File A must exist after initial upload');

    // Step 2: Upload new avatar B
    const bufferB = Buffer.from('TEST_AVATAR_PHOTO_B_UNIQUE_222');
    const formB = new FormData();
    formB.append('avatar', new Blob([bufferB], { type: 'image/png' }), 'photoB.png');

    const resB = await fetch(`${baseUrl}/api/users/me/avatar`, {
      method: 'POST',
      headers: { Cookie: `mg_sid=${regularUserCookie}` },
      body: formB,
    });
    assert.equal(resB.status, 200);
    const bodyB = await resB.json();
    const keyB = bodyB.data.avatarMediaKey;
    const pathB = path.join(localDir, keyB);

    assert.notEqual(keyA, keyB, 'Keys must be different for distinct content');
    assert.ok(fs.existsSync(pathB), 'File B must exist on disk');

    // Invariant: Old photo A must have been physically deleted
    assert.equal(fs.existsSync(pathA), false, 'Old avatar file A must be purged from disk after update');
  });

  await t.test('3. Remove Avatar (DELETE /me/avatar) - Purges file and sets column to NULL', async () => {
    // Upload avatar
    const buffer = Buffer.from('TEST_AVATAR_TO_BE_REMOVED_333');
    const form = new FormData();
    form.append('avatar', new Blob([buffer], { type: 'image/jpeg' }), 'temp.jpg');

    const uploadRes = await fetch(`${baseUrl}/api/users/me/avatar`, {
      method: 'POST',
      headers: { Cookie: `mg_sid=${regularUserCookie}` },
      body: form,
    });
    const uploadBody = await uploadRes.json();
    const key = uploadBody.data.avatarMediaKey;
    const localDir = mediaStorage.getLocalMediaPath();
    const filePath = path.join(localDir, key);
    assert.ok(fs.existsSync(filePath));

    // Call DELETE /me/avatar
    const deleteRes = await fetch(`${baseUrl}/api/users/me/avatar`, {
      method: 'DELETE',
      headers: { Cookie: `mg_sid=${regularUserCookie}` },
    });
    assert.equal(deleteRes.status, 200);
    const deleteBody = await deleteRes.json();
    assert.equal(deleteBody.status, 'success');
    assert.equal(deleteBody.data.user.avatarMediaKey, null);
    assert.equal(deleteBody.data.user.avatarUrl, null);

    // Verify DB column is NULL
    const dbRes = await query('SELECT avatar_media_key FROM users WHERE id = $1', [regularUserId]);
    assert.equal(dbRes.rows[0].avatar_media_key, null);

    // Verify physical file was unlinked
    assert.equal(fs.existsSync(filePath), false, 'Avatar file must be purged from disk upon deletion');
  });

  await t.test('4. Validation Rejections - Rejects non-images (PDF, text), missing files, and oversized files', async () => {
    // Missing file
    const emptyForm = new FormData();
    emptyForm.append('domain', 'users/avatars');
    const missingRes = await fetch(`${baseUrl}/api/users/me/avatar`, {
      method: 'POST',
      headers: { Cookie: `mg_sid=${regularUserCookie}` },
      body: emptyForm,
    });
    assert.equal(missingRes.status, 400);
    const missingBody = await missingRes.json();
    assert.equal(missingBody.code, 'FILE_REQUIRED');

    // Unsupported MIME: application/pdf
    const pdfForm = new FormData();
    pdfForm.append('avatar', new Blob([Buffer.from('%PDF-1.4 test')], { type: 'application/pdf' }), 'doc.pdf');
    const pdfRes = await fetch(`${baseUrl}/api/users/me/avatar`, {
      method: 'POST',
      headers: { Cookie: `mg_sid=${regularUserCookie}` },
      body: pdfForm,
    });
    assert.equal(pdfRes.status, 400);
    const pdfBody = await pdfRes.json();
    assert.equal(pdfBody.code, 'UNSUPPORTED_MEDIA_TYPE');

    // Unsupported MIME: text/plain
    const txtForm = new FormData();
    txtForm.append('avatar', new Blob([Buffer.from('hello')], { type: 'text/plain' }), 'note.txt');
    const txtRes = await fetch(`${baseUrl}/api/users/me/avatar`, {
      method: 'POST',
      headers: { Cookie: `mg_sid=${regularUserCookie}` },
      body: txtForm,
    });
    assert.equal(txtRes.status, 400);
    const txtBody = await txtRes.json();
    assert.equal(txtBody.code, 'UNSUPPORTED_MEDIA_TYPE');

    // Oversized file (> 5 MB)
    const hugeBuffer = Buffer.alloc(5 * 1024 * 1024 + 1024);
    const hugeForm = new FormData();
    hugeForm.append('avatar', new Blob([hugeBuffer], { type: 'image/jpeg' }), 'huge.jpg');
    const hugeRes = await fetch(`${baseUrl}/api/users/me/avatar`, {
      method: 'POST',
      headers: { Cookie: `mg_sid=${regularUserCookie}` },
      body: hugeForm,
    });
    assert.equal(hugeRes.status, 413);
    const hugeBody = await hugeRes.json();
    assert.equal(hugeBody.code, 'FILE_TOO_LARGE');
  });

  await t.test('5. Admin Avatar Management & RBAC Scoping', async () => {
    // Non-admin attempting to upload avatar for another user -> 403 Forbidden
    const formForOther = new FormData();
    formForOther.append('avatar', new Blob([Buffer.from('FORBIDDEN_ATTEMPT')], { type: 'image/jpeg' }), 'other.jpg');
    const forbiddenRes = await fetch(`${baseUrl}/api/users/${secondUserId}/avatar`, {
      method: 'POST',
      headers: { Cookie: `mg_sid=${regularUserCookie}` },
      body: formForOther,
    });
    assert.equal(forbiddenRes.status, 403);

    // Non-admin attempting to delete avatar for another user -> 403 Forbidden
    const forbiddenDelRes = await fetch(`${baseUrl}/api/users/${secondUserId}/avatar`, {
      method: 'DELETE',
      headers: { Cookie: `mg_sid=${regularUserCookie}` },
    });
    assert.equal(forbiddenDelRes.status, 403);

    // Super Admin successfully uploads avatar for target user
    const adminUploadForm = new FormData();
    adminUploadForm.append('avatar', new Blob([Buffer.from('ADMIN_UPLOADED_FOR_TARGET')], { type: 'image/jpeg' }), 'admin_set.jpg');
    const adminUploadRes = await fetch(`${baseUrl}/api/users/${secondUserId}/avatar`, {
      method: 'POST',
      headers: { Cookie: `mg_sid=${superAdminCookie}` },
      body: adminUploadForm,
    });
    assert.equal(adminUploadRes.status, 200);
    const adminUploadBody = await adminUploadRes.json();
    assert.equal(adminUploadBody.data.user.id, secondUserId);
    assert.ok(adminUploadBody.data.user.avatarMediaKey);

    // Super Admin successfully deletes avatar for target user
    const adminDelRes = await fetch(`${baseUrl}/api/users/${secondUserId}/avatar`, {
      method: 'DELETE',
      headers: { Cookie: `mg_sid=${superAdminCookie}` },
    });
    assert.equal(adminDelRes.status, 200);
    const adminDelBody = await adminDelRes.json();
    assert.equal(adminDelBody.data.user.avatarMediaKey, null);
  });

  await t.test('6. Deduplication Safety - Does NOT delete physical file if shared by another user', async () => {
    const identicalBuffer = Buffer.from('SHARED_IDENTICAL_AVATAR_IMAGE_BYTES');

    // User 1 uploads image
    const form1 = new FormData();
    form1.append('avatar', new Blob([identicalBuffer], { type: 'image/jpeg' }), 'shared1.jpg');
    const res1 = await fetch(`${baseUrl}/api/users/me/avatar`, {
      method: 'POST',
      headers: { Cookie: `mg_sid=${regularUserCookie}` },
      body: form1,
    });
    const body1 = await res1.json();
    const key1 = body1.data.avatarMediaKey;

    // User 2 uploads exact same image
    const form2 = new FormData();
    form2.append('avatar', new Blob([identicalBuffer], { type: 'image/jpeg' }), 'shared2.jpg');
    const res2 = await fetch(`${baseUrl}/api/users/me/avatar`, {
      method: 'POST',
      headers: { Cookie: `mg_sid=${secondUserCookie}` },
      body: form2,
    });
    const body2 = await res2.json();
    const key2 = body2.data.avatarMediaKey;

    // Content-addressed keys must match
    assert.equal(key1, key2);

    const localDir = mediaStorage.getLocalMediaPath();
    const sharedPath = path.join(localDir, key1);
    assert.ok(fs.existsSync(sharedPath));

    // User 1 deletes their avatar
    const del1 = await fetch(`${baseUrl}/api/users/me/avatar`, {
      method: 'DELETE',
      headers: { Cookie: `mg_sid=${regularUserCookie}` },
    });
    assert.equal(del1.status, 200);

    // Invariant: User 1 has no avatar, User 2 still has the avatar, and the file is NOT deleted!
    const dbUser1 = await query('SELECT avatar_media_key FROM users WHERE id = $1', [regularUserId]);
    const dbUser2 = await query('SELECT avatar_media_key FROM users WHERE id = $1', [secondUserId]);
    assert.equal(dbUser1.rows[0].avatar_media_key, null);
    assert.equal(dbUser2.rows[0].avatar_media_key, key1);
    assert.ok(fs.existsSync(sharedPath), 'Shared avatar file must not be deleted while User 2 still references it');
  });

  await t.test('7. Profile JSON Update & Endpoint Propagation (/me, /:id, /)', async () => {
    // Upload avatar for regular user
    const buffer = Buffer.from('TEST_AVATAR_FOR_PROPAGATION');
    const form = new FormData();
    form.append('avatar', new Blob([buffer], { type: 'image/jpeg' }), 'prop.jpg');
    const uploadRes = await fetch(`${baseUrl}/api/users/me/avatar`, {
      method: 'POST',
      headers: { Cookie: `mg_sid=${regularUserCookie}` },
      body: form,
    });
    const uploadBody = await uploadRes.json();
    const key = uploadBody.data.avatarMediaKey;

    // 1) Verify GET /api/users/me returns avatarUrl and avatarMediaKey
    const meRes = await fetch(`${baseUrl}/api/users/me`, {
      headers: { Cookie: `mg_sid=${regularUserCookie}` },
    });
    assert.equal(meRes.status, 200);
    const meBody = await meRes.json();
    assert.equal(meBody.data.user.avatarMediaKey, key);
    assert.ok(meBody.data.user.avatarUrl.includes(key));

    // 2) Verify GET /api/users/:id returns avatarUrl and avatarMediaKey
    const userRes = await fetch(`${baseUrl}/api/users/${regularUserId}`, {
      headers: { Cookie: `mg_sid=${superAdminCookie}` },
    });
    assert.equal(userRes.status, 200);
    const userBody = await userRes.json();
    assert.equal(userBody.data.user.avatarMediaKey, key);
    assert.ok(userBody.data.user.avatarUrl.includes(key));

    // 3) Verify GET /api/users returns avatarUrl and avatarMediaKey in list
    const listRes = await fetch(`${baseUrl}/api/users?search=test_avatar_regular1`, {
      headers: { Cookie: `mg_sid=${superAdminCookie}` },
    });
    assert.equal(listRes.status, 200);
    const listBody = await listRes.json();
    const foundUser = listBody.data.users.find((u) => u.id === regularUserId);
    assert.ok(foundUser);
    assert.equal(foundUser.avatarMediaKey, key);
    assert.ok(foundUser.avatarUrl.includes(key));

    // 4) Verify PATCH /api/users/me with avatarMediaKey: null clears avatar
    const patchRes = await fetch(`${baseUrl}/api/users/me`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `mg_sid=${regularUserCookie}`,
      },
      body: JSON.stringify({ avatarMediaKey: null }),
    });
    assert.equal(patchRes.status, 200);
    const patchBody = await patchRes.json();
    assert.equal(patchBody.data.user.avatarMediaKey, null);
    assert.equal(patchBody.data.user.avatarUrl, null);
  });
});
