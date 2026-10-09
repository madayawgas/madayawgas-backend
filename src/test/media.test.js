const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');
const app = require('../app');
const { query, pool } = require('../../database/connection');
const {
  mediaService,
  mediaStorage,
  ALLOWED_DOMAINS,
  ALLOWED_MIME_TYPES,
  MAX_FILE_SIZE_BYTES,
} = require('../features/media');

const PREFIX = 'test_media_';
let server;
let baseUrl;
let adminCookie;
const createdStorageKeys = new Set();
const originalProduction = process.env.PRODUCTION;

before(async () => {
  process.env.PRODUCTION = 'false';

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

  // Clean created test files from local disk (while in local mode)
  for (const key of createdStorageKeys) {
    try {
      await mediaStorage.deleteFromStorage(key);
    } catch {
      // Ignore cleanup error
    }
  }

  // Clean test uploads directory if empty
  try {
    const uploadDir = path.resolve('./uploads');
    if (fs.existsSync(uploadDir)) {
      fs.rmSync(uploadDir, { recursive: true, force: true });
    }
  } catch {
    // Ignore cleanup error
  }

  process.env.PRODUCTION = originalProduction;

  // Clean test users & sessions
  try {
    await query(`DELETE FROM history_logs WHERE user_id IN (SELECT id FROM users WHERE username LIKE '${PREFIX}%')`);
    await query(`DELETE FROM audit_logs WHERE user_id IN (SELECT id FROM users WHERE username LIKE '${PREFIX}%') OR target_user_id IN (SELECT id FROM users WHERE username LIKE '${PREFIX}%')`);
    await query(`DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE username LIKE '${PREFIX}%')`);
    await query(`DELETE FROM users WHERE username LIKE '${PREFIX}%'`);
  } catch {
    // Ignore db cleanup error during shutdown
  }

  await pool.end();
});

beforeEach(async () => {
  // Ensure clean test environment for test_media_ users
  await query(`DELETE FROM history_logs WHERE user_id IN (SELECT id FROM users WHERE username LIKE '${PREFIX}%')`);
  await query(`DELETE FROM audit_logs WHERE user_id IN (SELECT id FROM users WHERE username LIKE '${PREFIX}%') OR target_user_id IN (SELECT id FROM users WHERE username LIKE '${PREFIX}%')`);
  await query(`DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE username LIKE '${PREFIX}%')`);
  await query(`DELETE FROM users WHERE username LIKE '${PREFIX}%'`);

  // Get Super Admin role
  const roleRes = await query(`SELECT id FROM roles WHERE name = 'Super Admin'`);
  const adminRoleId = roleRes.rows[0].id;

  // Insert superadmin
  const passwordHash = await bcrypt.hash('TestPass123!', 10);
  await query(
    `INSERT INTO users (username, password_hash, first_name, last_name, phone, role_id, is_active, is_blocked, must_change_password)
     VALUES ($1, $2, $3, $4, $5, $6, TRUE, FALSE, FALSE)`,
    [`${PREFIX}admin`, passwordHash, 'Media', 'Admin', '+639170000077', adminRoleId]
  );

  // Authenticate and obtain session cookie
  const loginRes = await fetch(`${baseUrl}/api/users/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: `${PREFIX}admin`,
      password: 'TestPass123!',
    }),
  });

  const setCookie = loginRes.headers.get('set-cookie');
  const match = setCookie ? setCookie.match(/mg_sid=([^;]+)/) : null;
  adminCookie = match ? `mg_sid=${match[1]}` : null;
});

test('Media Subsystem Integration Tests', async (t) => {
  await t.test('1. Authentication Guard - Unauthenticated Requests are Rejected (401)', async () => {
    // Attempt upload without cookie
    const formData = new FormData();
    formData.append('domain', 'maintenance/receipts');
    formData.append('file', new Blob([Buffer.from('dummy')], { type: 'image/jpeg' }), 'rec.jpg');

    const unauthUploadRes = await fetch(`${baseUrl}/api/media/upload`, {
      method: 'POST',
      body: formData,
    });
    assert.equal(unauthUploadRes.status, 401);
    const unauthUploadBody = await unauthUploadRes.json();
    assert.equal(unauthUploadBody.status, 'fail');

    // Attempt resolve without cookie
    const unauthResolveRes = await fetch(`${baseUrl}/api/media/resolve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ storageKey: 'maintenance/receipts/test.jpg' }),
    });
    assert.equal(unauthResolveRes.status, 401);
  });

  await t.test('2. Input Validation - Missing File or Missing Domain Rejection (400)', async () => {
    // Missing file
    const noFileForm = new FormData();
    noFileForm.append('domain', 'maintenance/receipts');

    const noFileRes = await fetch(`${baseUrl}/api/media/upload`, {
      method: 'POST',
      headers: { Cookie: adminCookie },
      body: noFileForm,
    });
    assert.equal(noFileRes.status, 400);
    const noFileBody = await noFileRes.json();
    assert.equal(noFileBody.code, 'FILE_REQUIRED');

    // Missing domain
    const noDomainForm = new FormData();
    noDomainForm.append('file', new Blob([Buffer.from('dummy')], { type: 'image/jpeg' }), 'rec.jpg');

    const noDomainRes = await fetch(`${baseUrl}/api/media/upload`, {
      method: 'POST',
      headers: { Cookie: adminCookie },
      body: noDomainForm,
    });
    assert.equal(noDomainRes.status, 400);
    const noDomainBody = await noDomainRes.json();
    assert.equal(noDomainBody.code, 'DOMAIN_REQUIRED');
  });

  await t.test('3. MIME Whitelist Enforcement - Rejects Unapproved File Types (400)', async () => {
    // Attempt plain text upload
    const txtForm = new FormData();
    txtForm.append('domain', 'maintenance/receipts');
    txtForm.append('file', new Blob(['console.log("hello")'], { type: 'text/plain' }), 'script.txt');

    const txtRes = await fetch(`${baseUrl}/api/media/upload`, {
      method: 'POST',
      headers: { Cookie: adminCookie },
      body: txtForm,
    });
    assert.equal(txtRes.status, 400);
    const txtBody = await txtRes.json();
    assert.equal(txtBody.code, 'UNSUPPORTED_MEDIA_TYPE');

    // Attempt executable upload
    const exeForm = new FormData();
    exeForm.append('domain', 'maintenance/receipts');
    exeForm.append('file', new Blob([Buffer.from('MZ0000')], { type: 'application/x-msdownload' }), 'malware.exe');

    const exeRes = await fetch(`${baseUrl}/api/media/upload`, {
      method: 'POST',
      headers: { Cookie: adminCookie },
      body: exeForm,
    });
    assert.equal(exeRes.status, 400);
    const exeBody = await exeRes.json();
    assert.equal(exeBody.code, 'UNSUPPORTED_MEDIA_TYPE');
  });

  await t.test('4. Payload Size Limit - Rejects Payloads Exceeding 5 MB (413 / FILE_TOO_LARGE)', async () => {
    // Create oversized buffer (5 MB + 256 bytes)
    const oversizedBuffer = Buffer.alloc(MAX_FILE_SIZE_BYTES + 256, 0);

    const oversizedForm = new FormData();
    oversizedForm.append('domain', 'maintenance/receipts');
    oversizedForm.append('file', new Blob([oversizedBuffer], { type: 'image/jpeg' }), 'huge.jpg');

    const oversizedRes = await fetch(`${baseUrl}/api/media/upload`, {
      method: 'POST',
      headers: { Cookie: adminCookie },
      body: oversizedForm,
    });

    assert.equal(oversizedRes.status, 413);
    const oversizedBody = await oversizedRes.json();
    assert.equal(oversizedBody.code, 'FILE_TOO_LARGE');
  });

  await t.test('5. Domain Whitelist & Path Traversal Guard - Rejects Non-Whitelisted Domains (400)', async () => {
    const invalidDomains = [
      '../../secrets',
      'system/root',
      'passwords',
      '../uploads',
      'maintenance',
      'something/random',
    ];

    for (const invalidDomain of invalidDomains) {
      const form = new FormData();
      form.append('domain', invalidDomain);
      form.append('file', new Blob([Buffer.from('data')], { type: 'image/jpeg' }), 'pic.jpg');

      const res = await fetch(`${baseUrl}/api/media/upload`, {
        method: 'POST',
        headers: { Cookie: adminCookie },
        body: form,
      });

      assert.equal(res.status, 400, `Expected 400 for domain '${invalidDomain}'`);
      const body = await res.json();
      assert.equal(body.code, 'INVALID_MEDIA_DOMAIN');
    }
  });

  await t.test('6. Successful Upload & Static File Delivery in Local Mode (201 Created)', async () => {
    const testBuffer = Buffer.from('TEST_IMAGE_BINARY_CONTENT_2026');

    for (const domain of ALLOWED_DOMAINS) {
      const form = new FormData();
      form.append('domain', domain);
      form.append('file', new Blob([testBuffer], { type: 'image/jpeg' }), 'invoice-101.jpeg');

      const uploadRes = await fetch(`${baseUrl}/api/media/upload`, {
        method: 'POST',
        headers: { Cookie: adminCookie },
        body: form,
      });

      assert.equal(uploadRes.status, 201, `Failed to upload to domain ${domain}`);
      const uploadBody = await uploadRes.json();
      assert.equal(uploadBody.status, 'success');

      const { storageKey, url, mimeType, sizeBytes, originalName } = uploadBody.data;
      assert.ok(storageKey, 'Storage key must be returned');
      assert.ok(storageKey.startsWith(`${domain}/`), `Storage key must start with domain ${domain}`);
      assert.match(
        storageKey,
        new RegExp(`^${domain}/\\d+-[a-f0-9]{12}\\.jpg$`),
        'Storage key must match canonical pattern {domain}/{timestamp}-{hex}.jpg'
      );
      assert.equal(mimeType, 'image/jpeg');
      assert.equal(sizeBytes, testBuffer.length);
      assert.equal(originalName, 'invoice-101.jpeg');
      assert.ok(url.includes(`/media/${storageKey}`), 'URL must contain /media/{storageKey}');

      createdStorageKeys.add(storageKey);

      // Verify file exists on local filesystem
      const localFilePath = path.resolve('./uploads', storageKey);
      assert.ok(fs.existsSync(localFilePath), 'Uploaded file must exist in ./uploads directory');
      const fileData = fs.readFileSync(localFilePath);
      assert.equal(fileData.toString(), testBuffer.toString());

      // Verify Express serves file statically at GET /media/{storageKey}
      const staticGetRes = await fetch(`${baseUrl}/media/${storageKey}`);
      assert.equal(staticGetRes.status, 200);
      const retrievedBytes = await staticGetRes.arrayBuffer();
      assert.equal(Buffer.from(retrievedBytes).toString(), testBuffer.toString());
    }
  });

  await t.test('7. Supported MIME Types - PNG, WebP, and PDF Uploads', async () => {
    const typesToTest = [
      { mime: 'image/png', ext: '.png', name: 'photo.png' },
      { mime: 'image/webp', ext: '.webp', name: 'banner.webp' },
      { mime: 'application/pdf', ext: '.pdf', name: 'contract.pdf' },
    ];

    for (const { mime, ext, name } of typesToTest) {
      const form = new FormData();
      form.append('domain', 'maintenance/inspections');
      form.append('file', new Blob([Buffer.from(`CONTENT_FOR_${mime}`)], { type: mime }), name);

      const res = await fetch(`${baseUrl}/api/media/upload`, {
        method: 'POST',
        headers: { Cookie: adminCookie },
        body: form,
      });

      assert.equal(res.status, 201);
      const body = await res.json();
      assert.equal(body.data.mimeType, mime);
      assert.ok(body.data.storageKey.endsWith(ext), `Expected storage key to end with ${ext}`);
      createdStorageKeys.add(body.data.storageKey);
    }
  });

  await t.test('8. Canonical Storage Key Resolution (/api/media/resolve & Service Logic)', async () => {
    const key = 'fleet/vehicles/1775731200000-4b2a8f9c1d0e.jpg';

    // POST /api/media/resolve endpoint
    const resolveRes = await fetch(`${baseUrl}/api/media/resolve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: adminCookie,
      },
      body: JSON.stringify({ storageKey: key }),
    });

    assert.equal(resolveRes.status, 200);
    const resolveBody = await resolveRes.json();
    assert.equal(resolveBody.status, 'success');
    assert.equal(resolveBody.data.storageKey, key);
    assert.ok(
      resolveBody.data.url.endsWith(`/media/${key}`),
      'Resolved URL must end with /media/{key}'
    );

    // Test resolveMedia with missing key
    const missingKeyRes = await fetch(`${baseUrl}/api/media/resolve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: adminCookie,
      },
      body: JSON.stringify({ storageKey: '' }),
    });
    assert.equal(missingKeyRes.status, 400);

    // Unit test URL resolution in local and production simulation
    const originalProd = process.env.PRODUCTION;
    const originalSupabaseUrl = process.env.SUPABASE_URL;

    try {
      // Local mode
      process.env.PRODUCTION = 'false';
      const localUrl = mediaStorage.resolveMediaUrl(key);
      assert.ok(localUrl.includes(`/media/${key}`));

      // Production mode
      process.env.PRODUCTION = 'true';
      process.env.SUPABASE_URL = 'https://test-project.supabase.co';
      process.env.SUPABASE_MEDIA_BUCKET = 'madayawgas-media';
      const prodUrl = mediaStorage.resolveMediaUrl(key);
      assert.equal(
        prodUrl,
        `https://test-project.supabase.co/storage/v1/object/public/madayawgas-media/${key}`
      );

      // Already absolute URL is preserved
      const absoluteUrl = 'https://external-cdn.com/assets/receipt.jpg';
      assert.equal(mediaStorage.resolveMediaUrl(absoluteUrl), absoluteUrl);

      // Null or empty returns null
      assert.equal(mediaStorage.resolveMediaUrl(null), null);
      assert.equal(mediaStorage.resolveMediaUrl(''), null);
    } finally {
      process.env.PRODUCTION = originalProd;
      process.env.SUPABASE_URL = originalSupabaseUrl;
    }
  });

  await t.test('9. Storage Deletion Lifecycle (media.service.deleteMedia)', async () => {
    // Upload a test file
    const form = new FormData();
    form.append('domain', 'sales/receipts');
    form.append('file', new Blob([Buffer.from('TO_BE_DELETED')], { type: 'image/jpeg' }), 'delete-me.jpg');

    const res = await fetch(`${baseUrl}/api/media/upload`, {
      method: 'POST',
      headers: { Cookie: adminCookie },
      body: form,
    });

    assert.equal(res.status, 201);
    const body = await res.json();
    const key = body.data.storageKey;
    const localPath = path.resolve('./uploads', key);

    assert.ok(fs.existsSync(localPath), 'File should exist prior to deletion');

    // Delete
    const deleteResult = await mediaService.deleteMedia(key);
    assert.equal(deleteResult.success, true);
    assert.equal(fs.existsSync(localPath), false, 'File must be unlinked after deletion');

    // Deleting nonexistent returns false without error
    const repeatDelete = await mediaService.deleteMedia(key);
    assert.equal(repeatDelete.success, false);
  });
});
