const { test, describe, before, after, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const ioClient = require('socket.io-client');
const bcrypt = require('bcrypt');
const {
  initializeSocket,
  getIO,
  emitSocketEvent,
  safeEmitSocketEvent,
  isSocketInitialized,
  closeSocket,
} = require('../socket');
const corsOptions = require('../config/cors');
const { query } = require('../../database/connection');
const authService = require('../features/users/auth.service');
const alertsNotifier = require('../features/operations/alerts/alerts.notifier');

describe('Socket.IO Foundation & Authentication Integration Tests', () => {
  let server;
  let port;
  let socketUrl;
  const TEST_PREFIX = 'test_sock_';

  async function cleanupTestData() {
    await query(`DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE username LIKE '${TEST_PREFIX}%')`);
    await query(`DELETE FROM users WHERE username LIKE '${TEST_PREFIX}%'`);
  }

  async function createTestUser(username, roleName = 'Logistics Supervisor') {
    const roleRes = await query('SELECT id FROM roles WHERE name = $1', [roleName]);
    if (!roleRes.rows[0]) {
      throw new Error(`Role ${roleName} not found in database`);
    }
    const roleId = roleRes.rows[0].id;
    const passwordHash = await bcrypt.hash('TestPass123!', 10);
    const userRes = await query(
      `INSERT INTO users (username, password_hash, first_name, last_name, phone, role_id, is_active, is_blocked, must_change_password)
       VALUES ($1, $2, $3, $4, $5, $6, TRUE, FALSE, FALSE)
       RETURNING id, username`,
      [username, passwordHash, 'Test', 'SocketUser', '+639179999999', roleId]
    );
    return userRes.rows[0];
  }

  beforeEach(async () => {
    // Ensure clean state before each test
    await closeSocket();
    await cleanupTestData();
  });

  afterEach(async () => {
    // Clean up socket and server after each test
    await closeSocket();
    if (server && server.listening) {
      await new Promise((resolve) => server.close(resolve));
    }
    await cleanupTestData();
  });

  after(async () => {
    await cleanupTestData();
  });

  test('1. getIO() throws descriptive error before initialization', () => {
    assert.throws(
      () => getIO(),
      /Socket\.IO has not been initialized\. Call initializeSocket\(httpServer\) first\./
    );
  });

  test('2. initializeSocket throws if httpServer is omitted', () => {
    assert.throws(
      () => initializeSocket(null),
      /initializeSocket requires an HTTP server instance/
    );
  });

  test('3. initializeSocket initializes Socket.IO successfully and getIO() returns it', () => {
    server = http.createServer();
    const ioInstance = initializeSocket(server, { skipAuth: true });

    assert.ok(ioInstance, 'Expected ioInstance to be defined');
    assert.strictEqual(getIO(), ioInstance, 'getIO() should return the initialized instance');
  });

  test('4. Repeated initializeSocket() calls idempotently return the existing instance', () => {
    server = http.createServer();
    const firstInstance = initializeSocket(server, { skipAuth: true });
    const secondInstance = initializeSocket(server, { skipAuth: true });

    assert.strictEqual(
      firstInstance,
      secondInstance,
      'Subsequent initializeSocket calls should return the existing instance'
    );
  });

  test('5. closeSocket() resets singleton and subsequent getIO() throws', async () => {
    server = http.createServer();
    initializeSocket(server, { skipAuth: true });

    assert.ok(getIO());
    await closeSocket();

    assert.throws(
      () => getIO(),
      /Socket\.IO has not been initialized/
    );
  });

  test('6. emitSocketEvent validates eventName', () => {
    server = http.createServer();
    initializeSocket(server, { skipAuth: true });

    assert.throws(() => emitSocketEvent(''), /emitSocketEvent requires a valid string eventName/);
    assert.throws(() => emitSocketEvent(null), /emitSocketEvent requires a valid string eventName/);
    assert.throws(() => emitSocketEvent(123), /emitSocketEvent requires a valid string eventName/);
  });

  test('7. emitSocketEvent constructs standardized event envelope', () => {
    server = http.createServer();
    initializeSocket(server, { skipAuth: true });

    const eventName = 'TEST_ENVELOPE';
    const eventData = { truckId: 'TRK-001', status: 'available' };

    const beforeTimestamp = new Date(Date.now() - 1000).toISOString();
    const envelope = emitSocketEvent(eventName, eventData);
    const afterTimestamp = new Date(Date.now() + 1000).toISOString();

    assert.strictEqual(envelope.event, eventName);
    assert.deepStrictEqual(envelope.data, eventData);
    assert.strictEqual(envelope.meta.version, '1.0');
    assert.ok(envelope.meta.timestamp >= beforeTimestamp && envelope.meta.timestamp <= afterTimestamp);

    // Verify null/undefined data fallback to empty object
    const nullEnvelope = emitSocketEvent('NULL_DATA_TEST', null);
    assert.deepStrictEqual(nullEnvelope.data, {});

    const undefinedEnvelope = emitSocketEvent('UNDEF_DATA_TEST');
    assert.deepStrictEqual(undefinedEnvelope.data, {});
  });

  test('8. Client connects, receives global broadcast envelope, and disconnects cleanly', async () => {
    server = http.createServer();
    initializeSocket(server, { skipAuth: true });

    await new Promise((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        port = server.address().port;
        socketUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });

    const client = ioClient(socketUrl, {
      transports: ['websocket', 'polling'],
      forceNew: true,
    });

    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Connection timed out')), 5000);
      client.on('connect', () => {
        clearTimeout(timer);
        resolve();
      });
      client.on('connect_error', reject);
    });

    assert.ok(client.connected, 'Client should be connected');

    // Test receiving globally broadcast event
    const receivedPromise = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Event reception timed out')), 5000);
      client.on('SYSTEM_NOTIFICATION', (payload) => {
        clearTimeout(timer);
        resolve(payload);
      });
    });

    const emittedPayload = emitSocketEvent('SYSTEM_NOTIFICATION', { message: 'Real-time test active' });
    const receivedPayload = await receivedPromise;

    assert.deepStrictEqual(receivedPayload, emittedPayload);
    assert.strictEqual(receivedPayload.event, 'SYSTEM_NOTIFICATION');
    assert.strictEqual(receivedPayload.data.message, 'Real-time test active');
    assert.strictEqual(receivedPayload.meta.version, '1.0');

    client.disconnect();
    assert.strictEqual(client.connected, false);
  });

  test('9. Room-targeted emission delivers event only to clients inside that room', async () => {
    server = http.createServer();
    const ioInstance = initializeSocket(server, { skipAuth: true });

    await new Promise((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        port = server.address().port;
        socketUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });

    const clientInRoom = ioClient(socketUrl, { transports: ['websocket', 'polling'], forceNew: true });
    const clientOutsideRoom = ioClient(socketUrl, { transports: ['websocket', 'polling'], forceNew: true });

    await Promise.all([
      new Promise((resolve) => clientInRoom.on('connect', resolve)),
      new Promise((resolve) => clientOutsideRoom.on('connect', resolve)),
    ]);

    // Server-side join clientInRoom into 'zone-davao-central'
    const serverSockets = await ioInstance.fetchSockets();
    const targetSocket = serverSockets.find((s) => s.id === clientInRoom.id);
    assert.ok(targetSocket, 'Target socket should exist on server');
    await targetSocket.join('zone-davao-central');

    let clientInRoomReceived = null;
    let clientOutsideReceived = null;

    clientInRoom.on('ZONE_UPDATE', (payload) => {
      clientInRoomReceived = payload;
    });

    clientOutsideRoom.on('ZONE_UPDATE', (payload) => {
      clientOutsideReceived = payload;
    });

    emitSocketEvent('ZONE_UPDATE', { zone: 'davao-central', active: true }, 'zone-davao-central');

    // Wait a brief period for event delivery
    await new Promise((resolve) => setTimeout(resolve, 300));

    assert.ok(clientInRoomReceived, 'Client in room should have received event');
    assert.strictEqual(clientInRoomReceived.event, 'ZONE_UPDATE');
    assert.strictEqual(clientInRoomReceived.data.zone, 'davao-central');
    assert.strictEqual(clientOutsideReceived, null, 'Client outside room must NOT receive event');

    clientInRoom.disconnect();
    clientOutsideRoom.disconnect();
  });

  test('10. CORS validation: Allowed origins permitted, disallowed origins rejected', async () => {
    server = http.createServer();
    initializeSocket(server, { skipAuth: true });

    await new Promise((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        port = server.address().port;
        socketUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });

    // 1. Whitelisted origin
    const allowedClient = ioClient(socketUrl, {
      transports: ['polling'],
      extraHeaders: {
        Origin: 'https://madayawgas.vercel.app',
      },
      forceNew: true,
    });

    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Allowed client connection timed out')), 5000);
      allowedClient.on('connect', () => {
        clearTimeout(timer);
        resolve();
      });
      allowedClient.on('connect_error', reject);
    });

    assert.ok(allowedClient.connected, 'Whitelisted origin should connect successfully');
    allowedClient.disconnect();

    // 2. Disallowed external origin
    const disallowedClient = ioClient(socketUrl, {
      transports: ['polling'],
      extraHeaders: {
        Origin: 'https://malicious-external-site.com',
      },
      forceNew: true,
    });

    const connectError = await new Promise((resolve) => {
      disallowedClient.on('connect_error', (err) => resolve(err));
      disallowedClient.on('connect', () => resolve(null));
    });

    assert.ok(connectError, 'Disallowed origin should be rejected by CORS');
    disallowedClient.disconnect();
  });

  test('11. safeEmitSocketEvent and isSocketInitialized guard uninitialized state', () => {
    assert.strictEqual(isSocketInitialized(), false);
    const safeResult = safeEmitSocketEvent('TEST_UNINITIALIZED', { data: 123 });
    assert.strictEqual(safeResult, null, 'safeEmitSocketEvent should return null without throwing when uninitialized');
  });

  test('12. Handshake authentication rejects connection when token is missing', async () => {
    server = http.createServer();
    initializeSocket(server); // Auth enabled by default

    await new Promise((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        port = server.address().port;
        socketUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });

    const unauthClient = ioClient(socketUrl, {
      transports: ['websocket', 'polling'],
      forceNew: true,
    });

    const connectErr = await new Promise((resolve) => {
      unauthClient.on('connect_error', (err) => resolve(err));
      unauthClient.on('connect', () => resolve(null));
    });

    assert.ok(connectErr, 'Expected handshake rejection without token');
    assert.match(connectErr.message, /Authentication error: Unauthorized/);
    unauthClient.disconnect();
  });

  test('13. Handshake authentication rejects connection when token is invalid', async () => {
    server = http.createServer();
    initializeSocket(server); // Auth enabled by default

    await new Promise((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        port = server.address().port;
        socketUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });

    const invalidClient = ioClient(socketUrl, {
      transports: ['websocket', 'polling'],
      forceNew: true,
      auth: { token: 'invalid_dummy_token_9999999999999999' },
    });

    const connectErr = await new Promise((resolve) => {
      invalidClient.on('connect_error', (err) => resolve(err));
      invalidClient.on('connect', () => resolve(null));
    });

    assert.ok(connectErr, 'Expected handshake rejection with invalid token');
    assert.match(connectErr.message, /Authentication error: Unauthorized/);
    invalidClient.disconnect();
  });

  test('14. Handshake authentication succeeds with valid session cookie (mg_sid)', async () => {
    const testUser = await createTestUser(`${TEST_PREFIX}cookie_user`);
    const sessionResult = await authService.createSession(testUser.id);

    server = http.createServer();
    initializeSocket(server);

    await new Promise((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        port = server.address().port;
        socketUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });

    const authenticatedClient = ioClient(socketUrl, {
      transports: ['websocket', 'polling'],
      forceNew: true,
      extraHeaders: {
        Cookie: `mg_sid=${sessionResult.token}`,
      },
    });

    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Connection timed out')), 5000);
      authenticatedClient.on('connect', () => {
        clearTimeout(timer);
        resolve();
      });
      authenticatedClient.on('connect_error', reject);
    });

    assert.ok(authenticatedClient.connected, 'Client with valid cookie should connect');
    authenticatedClient.disconnect();
  });

  test('15. Handshake authentication succeeds with auth.token payload', async () => {
    const testUser = await createTestUser(`${TEST_PREFIX}token_user`);
    const sessionResult = await authService.createSession(testUser.id);

    server = http.createServer();
    initializeSocket(server);

    await new Promise((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        port = server.address().port;
        socketUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });

    const tokenClient = ioClient(socketUrl, {
      transports: ['websocket', 'polling'],
      forceNew: true,
      auth: {
        token: sessionResult.token,
      },
    });

    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Connection timed out')), 5000);
      tokenClient.on('connect', () => {
        clearTimeout(timer);
        resolve();
      });
      tokenClient.on('connect_error', reject);
    });

    assert.ok(tokenClient.connected, 'Client with valid auth.token should connect');
    tokenClient.disconnect();
  });

  test('16. Server automatically joins authenticated clients into authorized rooms based on RBAC permissions', async () => {
    // 1. Create a Logistics Supervisor (has alerts.view, fleet.view, etc.)
    const supervisorUser = await createTestUser(`${TEST_PREFIX}supervisor`, 'Logistics Supervisor');
    const supervisorSession = await authService.createSession(supervisorUser.id);

    // 2. Create a Driver (frontline mobile user lacking alerts.view and inventory.view)
    const driverUser = await createTestUser(`${TEST_PREFIX}driver`, 'Driver');
    const driverSession = await authService.createSession(driverUser.id);

    server = http.createServer();
    initializeSocket(server);

    await new Promise((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        port = server.address().port;
        socketUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });

    const supervisorClient = ioClient(socketUrl, {
      transports: ['websocket', 'polling'],
      forceNew: true,
      auth: { token: supervisorSession.token },
    });

    const driverClient = ioClient(socketUrl, {
      transports: ['websocket', 'polling'],
      forceNew: true,
      auth: { token: driverSession.token },
    });

    await Promise.all([
      new Promise((res) => supervisorClient.on('connect', res)),
      new Promise((res) => driverClient.on('connect', res)),
    ]);

    let supervisorReceivedAlert = null;
    let driverReceivedAlert = null;

    supervisorClient.on('EMERGENCY_ALERT_TRIGGERED', (payload) => {
      supervisorReceivedAlert = payload;
    });

    driverClient.on('EMERGENCY_ALERT_TRIGGERED', (payload) => {
      driverReceivedAlert = payload;
    });

    // Emit event to room:alerts
    emitSocketEvent('EMERGENCY_ALERT_TRIGGERED', {
      alertId: 'alert-001',
      emergencyType: 'ACCIDENT',
      description: 'Accident reported near Panacan',
    }, 'room:alerts');

    await new Promise((res) => setTimeout(res, 300));

    // Assert: Supervisor received the alert because they have alerts.view
    assert.ok(supervisorReceivedAlert, 'Supervisor in room:alerts should have received event');
    assert.strictEqual(supervisorReceivedAlert.data.alertId, 'alert-001');

    // Assert: Driver did NOT receive the alert because they are not in room:alerts
    assert.strictEqual(driverReceivedAlert, null, 'Driver lacking alerts.view must not receive event from room:alerts');

    supervisorClient.disconnect();
    driverClient.disconnect();
  });

  test('17. alertsNotifier automatically delivers EMERGENCY_ALERT_TRIGGERED and EMERGENCY_ALERT_STATUS_UPDATED to room:alerts', async () => {
    const supervisorUser = await createTestUser(`${TEST_PREFIX}sup_notifier`, 'Super Admin');
    const sessionResult = await authService.createSession(supervisorUser.id);

    server = http.createServer();
    initializeSocket(server);

    await new Promise((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        port = server.address().port;
        socketUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });

    const client = ioClient(socketUrl, {
      transports: ['websocket', 'polling'],
      forceNew: true,
      auth: { token: sessionResult.token },
    });

    await new Promise((res) => client.on('connect', res));

    let triggeredPayload = null;
    let statusUpdatedPayload = null;

    client.on('EMERGENCY_ALERT_TRIGGERED', (payload) => {
      triggeredPayload = payload;
    });

    client.on('EMERGENCY_ALERT_STATUS_UPDATED', (payload) => {
      statusUpdatedPayload = payload;
    });

    // 1. Dispatch Emergency Alert
    alertsNotifier.dispatchEmergencyAlert({
      id: 'alert-notifier-01',
      emergencyType: 'SECURITY',
      description: 'Suspicious individual near truck',
    });

    // 2. Dispatch Status Update
    alertsNotifier.dispatchStatusUpdate({
      id: 'alert-notifier-01',
      status: 'ACKNOWLEDGED',
      acknowledgedByName: 'Supervisor Bob',
    });

    await new Promise((res) => setTimeout(res, 300));

    assert.ok(triggeredPayload, 'Expected EMERGENCY_ALERT_TRIGGERED event');
    assert.strictEqual(triggeredPayload.data.id, 'alert-notifier-01');
    assert.strictEqual(triggeredPayload.data.emergencyType, 'SECURITY');

    assert.ok(statusUpdatedPayload, 'Expected EMERGENCY_ALERT_STATUS_UPDATED event');
    assert.strictEqual(statusUpdatedPayload.data.id, 'alert-notifier-01');
    assert.strictEqual(statusUpdatedPayload.data.status, 'ACKNOWLEDGED');

    client.disconnect();
  });

  test('18. Array-based multi-room emission delivers event to all targeted rooms and users', async () => {
    server = http.createServer();
    const ioInstance = initializeSocket(server, { skipAuth: true });

    await new Promise((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        port = server.address().port;
        socketUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });

    const clientA = ioClient(socketUrl, { transports: ['websocket'], forceNew: true });
    const clientB = ioClient(socketUrl, { transports: ['websocket'], forceNew: true });
    const clientC = ioClient(socketUrl, { transports: ['websocket'], forceNew: true });

    await Promise.all([
      new Promise((res) => clientA.on('connect', res)),
      new Promise((res) => clientB.on('connect', res)),
      new Promise((res) => clientC.on('connect', res)),
    ]);

    const serverSockets = await ioInstance.fetchSockets();
    const socketA = serverSockets.find((s) => s.id === clientA.id);
    const socketB = serverSockets.find((s) => s.id === clientB.id);
    await socketA.join('room:alpha');
    await socketB.join('room:beta');

    let payloadA = null;
    let payloadB = null;
    let payloadC = null;

    clientA.on('MULTI_TARGET_EVENT', (p) => { payloadA = p; });
    clientB.on('MULTI_TARGET_EVENT', (p) => { payloadB = p; });
    clientC.on('MULTI_TARGET_EVENT', (p) => { payloadC = p; });

    emitSocketEvent('MULTI_TARGET_EVENT', { message: 'Multi-room delivery active' }, ['room:alpha', 'room:beta']);

    await new Promise((res) => setTimeout(res, 300));

    assert.ok(payloadA, 'Client A in room:alpha should receive event');
    assert.strictEqual(payloadA.data.message, 'Multi-room delivery active');
    assert.ok(payloadB, 'Client B in room:beta should receive event');
    assert.strictEqual(payloadB.data.message, 'Multi-room delivery active');
    assert.strictEqual(payloadC, null, 'Client C in neither room must not receive event');

    clientA.disconnect();
    clientB.disconnect();
    clientC.disconnect();
  });

  test('19. Server automatically joins clients into room:trips, room:schedules, and room:operations based on RBAC', async () => {
    const supervisorUser = await createTestUser(`${TEST_PREFIX}sup_ops`, 'Logistics Supervisor');
    const supervisorSession = await authService.createSession(supervisorUser.id);

    const driverUser = await createTestUser(`${TEST_PREFIX}drv_ops`, 'Driver');
    const driverSession = await authService.createSession(driverUser.id);

    server = http.createServer();
    initializeSocket(server);

    await new Promise((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        port = server.address().port;
        socketUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });

    const supClient = ioClient(socketUrl, {
      transports: ['websocket'],
      forceNew: true,
      auth: { token: supervisorSession.token },
    });

    const drvClient = ioClient(socketUrl, {
      transports: ['websocket'],
      forceNew: true,
      auth: { token: driverSession.token },
    });

    await Promise.all([
      new Promise((res) => supClient.on('connect', res)),
      new Promise((res) => drvClient.on('connect', res)),
    ]);

    let supTripPayload = null;
    let drvTripPayload = null;
    let supOpsPayload = null;
    let drvOpsPayload = null;

    supClient.on('TRIP_EVENT', (p) => { supTripPayload = p; });
    drvClient.on('TRIP_EVENT', (p) => { drvTripPayload = p; });
    supClient.on('OPS_EVENT', (p) => { supOpsPayload = p; });
    drvClient.on('OPS_EVENT', (p) => { drvOpsPayload = p; });

    // Emit to room:trips
    emitSocketEvent('TRIP_EVENT', { route: 'Davao-Tagum' }, 'room:trips');
    // Emit to room:operations
    emitSocketEvent('OPS_EVENT', { dutyNotice: 'Shift roster updated' }, 'room:operations');

    await new Promise((res) => setTimeout(res, 300));

    assert.ok(supTripPayload, 'Logistics Supervisor should receive event from room:trips');
    assert.strictEqual(drvTripPayload, null, 'Driver lacking route.view must NOT receive event from room:trips');
    assert.ok(supOpsPayload, 'Logistics Supervisor should receive event from room:operations');
    assert.strictEqual(drvOpsPayload, null, 'Driver lacking attendance.view must NOT receive event from room:operations');

    supClient.disconnect();
    drvClient.disconnect();
  });

  test('20. Targeted trip assignment delivers TRIP_DISPATCHED to room:trips and assigned driver private room', async () => {
    const supervisorUser = await createTestUser(`${TEST_PREFIX}sup_trip`, 'Logistics Supervisor');
    const supervisorSession = await authService.createSession(supervisorUser.id);

    const assignedDriver = await createTestUser(`${TEST_PREFIX}assigned_drv`, 'Driver');
    const assignedSession = await authService.createSession(assignedDriver.id);

    const otherDriver = await createTestUser(`${TEST_PREFIX}other_drv`, 'Driver');
    const otherSession = await authService.createSession(otherDriver.id);

    server = http.createServer();
    initializeSocket(server);

    await new Promise((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        port = server.address().port;
        socketUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });

    const supClient = ioClient(socketUrl, { transports: ['websocket'], forceNew: true, auth: { token: supervisorSession.token } });
    const assignedClient = ioClient(socketUrl, { transports: ['websocket'], forceNew: true, auth: { token: assignedSession.token } });
    const otherClient = ioClient(socketUrl, { transports: ['websocket'], forceNew: true, auth: { token: otherSession.token } });

    await Promise.all([
      new Promise((res) => supClient.on('connect', res)),
      new Promise((res) => assignedClient.on('connect', res)),
      new Promise((res) => otherClient.on('connect', res)),
    ]);

    let supReceived = null;
    let assignedReceived = null;
    let otherReceived = null;

    supClient.on('TRIP_DISPATCHED', (p) => { supReceived = p; });
    assignedClient.on('TRIP_DISPATCHED', (p) => { assignedReceived = p; });
    otherClient.on('TRIP_DISPATCHED', (p) => { otherReceived = p; });

    // Target room:trips, room:schedules, and user:${assignedDriver.id}
    emitSocketEvent('TRIP_DISPATCHED', {
      tripNumber: 'TRIP-20261019-TEST',
      truckPlateNumber: 'ABC-1234',
      status: 'IN_PROGRESS',
    }, ['room:trips', `user:${assignedDriver.id}`]);

    await new Promise((res) => setTimeout(res, 300));

    assert.ok(supReceived, 'Supervisor should receive TRIP_DISPATCHED from room:trips');
    assert.ok(assignedReceived, 'Assigned driver should receive TRIP_DISPATCHED via private user room');
    assert.strictEqual(assignedReceived.data.tripNumber, 'TRIP-20261019-TEST');
    assert.strictEqual(otherReceived, null, 'Unassigned driver must NOT receive TRIP_DISPATCHED');

    supClient.disconnect();
    assignedClient.disconnect();
    otherClient.disconnect();
  });

  test('21. Driver vehicle assignment delivers VEHICLE_DRIVER_ASSIGNED to room:fleet and driver private room', async () => {
    const supervisorUser = await createTestUser(`${TEST_PREFIX}sup_flt`, 'Logistics Supervisor');
    const supervisorSession = await authService.createSession(supervisorUser.id);

    const driverUser = await createTestUser(`${TEST_PREFIX}drv_flt`, 'Driver');
    const driverSession = await authService.createSession(driverUser.id);

    server = http.createServer();
    initializeSocket(server);

    await new Promise((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        port = server.address().port;
        socketUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });

    const supClient = ioClient(socketUrl, { transports: ['websocket'], forceNew: true, auth: { token: supervisorSession.token } });
    const drvClient = ioClient(socketUrl, { transports: ['websocket'], forceNew: true, auth: { token: driverSession.token } });

    await Promise.all([
      new Promise((res) => supClient.on('connect', res)),
      new Promise((res) => drvClient.on('connect', res)),
    ]);

    let supReceived = null;
    let drvReceived = null;

    supClient.on('VEHICLE_DRIVER_ASSIGNED', (p) => { supReceived = p; });
    drvClient.on('VEHICLE_DRIVER_ASSIGNED', (p) => { drvReceived = p; });

    safeEmitSocketEvent('VEHICLE_DRIVER_ASSIGNED', {
      vehicleId: 'veh-123',
      plateNumber: 'LPG-888',
      driverId: driverUser.id,
      driverName: 'Test Driver',
    }, ['room:fleet', `user:${driverUser.id}`]);

    await new Promise((res) => setTimeout(res, 300));

    assert.ok(supReceived, 'Supervisor should receive VEHICLE_DRIVER_ASSIGNED via room:fleet');
    assert.ok(drvReceived, 'Driver should receive VEHICLE_DRIVER_ASSIGNED via private user room');
    assert.strictEqual(drvReceived.data.plateNumber, 'LPG-888');

    supClient.disconnect();
    drvClient.disconnect();
  });

  test('22. Attendance duty update delivers ATTENDANCE_DUTY_UPDATED to room:operations and user private room', async () => {
    const supervisorUser = await createTestUser(`${TEST_PREFIX}sup_att`, 'Logistics Supervisor');
    const supervisorSession = await authService.createSession(supervisorUser.id);

    const driverUser = await createTestUser(`${TEST_PREFIX}drv_att`, 'Driver');
    const driverSession = await authService.createSession(driverUser.id);

    server = http.createServer();
    initializeSocket(server);

    await new Promise((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        port = server.address().port;
        socketUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });

    const supClient = ioClient(socketUrl, { transports: ['websocket'], forceNew: true, auth: { token: supervisorSession.token } });
    const drvClient = ioClient(socketUrl, { transports: ['websocket'], forceNew: true, auth: { token: driverSession.token } });

    await Promise.all([
      new Promise((res) => supClient.on('connect', res)),
      new Promise((res) => drvClient.on('connect', res)),
    ]);

    let supReceived = null;
    let drvReceived = null;

    supClient.on('ATTENDANCE_DUTY_UPDATED', (p) => { supReceived = p; });
    drvClient.on('ATTENDANCE_DUTY_UPDATED', (p) => { drvReceived = p; });

    safeEmitSocketEvent('ATTENDANCE_DUTY_UPDATED', {
      userId: driverUser.id,
      status: 'ON_DUTY',
      clockInTime: new Date().toISOString(),
    }, ['room:operations', `user:${driverUser.id}`]);

    await new Promise((res) => setTimeout(res, 300));

    assert.ok(supReceived, 'Supervisor should receive ATTENDANCE_DUTY_UPDATED via room:operations');
    assert.ok(drvReceived, 'Driver should receive ATTENDANCE_DUTY_UPDATED via private user room');
    assert.strictEqual(drvReceived.data.status, 'ON_DUTY');

    supClient.disconnect();
    drvClient.disconnect();
  });

  test('23. authService.revokeAllUserSessions delivers AUTH_SESSION_REVOKED to target user private room', async () => {
    const targetUser = await createTestUser(`${TEST_PREFIX}target_rev`, 'Driver');
    const targetSession = await authService.createSession(targetUser.id);

    const unrelatedUser = await createTestUser(`${TEST_PREFIX}unrel_rev`, 'Driver');
    const unrelatedSession = await authService.createSession(unrelatedUser.id);

    server = http.createServer();
    initializeSocket(server);

    await new Promise((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        port = server.address().port;
        socketUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });

    const targetClient = ioClient(socketUrl, { transports: ['websocket'], forceNew: true, auth: { token: targetSession.token } });
    const unrelatedClient = ioClient(socketUrl, { transports: ['websocket'], forceNew: true, auth: { token: unrelatedSession.token } });

    await Promise.all([
      new Promise((res) => targetClient.on('connect', res)),
      new Promise((res) => unrelatedClient.on('connect', res)),
    ]);

    let targetReceivedRevoke = null;
    let unrelatedReceivedRevoke = null;

    targetClient.on('AUTH_SESSION_REVOKED', (p) => { targetReceivedRevoke = p; });
    unrelatedClient.on('AUTH_SESSION_REVOKED', (p) => { unrelatedReceivedRevoke = p; });

    // Revoke all sessions for targetUser
    await authService.revokeAllUserSessions(targetUser.id);

    await new Promise((res) => setTimeout(res, 300));

    assert.ok(targetReceivedRevoke, 'Target user should receive AUTH_SESSION_REVOKED');
    assert.strictEqual(targetReceivedRevoke.data.userId, targetUser.id);
    assert.strictEqual(unrelatedReceivedRevoke, null, 'Unrelated user must NOT receive session revocation');

    targetClient.disconnect();
    unrelatedClient.disconnect();
  });
});
