const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const app = require('../app');
const { query, pool } = require('../../database/connection');
const {
  getTripNetCustomerDebtCreated,
  getTripTotalNetCustomerDebtCreated,
  getTripTotalSoldFull,
} = require('../features/sales');

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
  // Cleanup lingering records
  await query(`DELETE FROM canister_ledger WHERE trip_id IN (SELECT id FROM trips WHERE trip_number LIKE 'TEST-TXSYNC-%') OR customer_id IN (SELECT id FROM customers WHERE contact_person LIKE 'TEST-TXSYNC-%' OR business_name LIKE 'TEST-TXSYNC-%')`);
  await query(`DELETE FROM sales_invoices WHERE invoice_number LIKE 'INV-TEST-TXSYNC-%' OR invoice_number LIKE 'CD-TEST-TXSYNC-%'`);
  await query(`DELETE FROM sales_transaction_items WHERE transaction_id IN (SELECT id FROM sales_transactions WHERE transaction_no LIKE 'TEST-TXSYNC-%')`);
  await query(`DELETE FROM sales_transactions WHERE transaction_no LIKE 'TEST-TXSYNC-%'`);
  await query(`DELETE FROM trips WHERE trip_number LIKE 'TEST-TXSYNC-%'`);
  await query(`DELETE FROM customers WHERE contact_person LIKE 'TEST-TXSYNC-%' OR business_name LIKE 'TEST-TXSYNC-%'`);
  await query(`DELETE FROM vehicles WHERE plate_number LIKE 'TEST-TXSYNC-%'`);
  await query(`DELETE FROM service_zones WHERE code LIKE 'TEST-TXSYNC-%'`);
  await query(`DELETE FROM history_logs WHERE user_id IN (SELECT id FROM users WHERE username LIKE 'test_sales_tx_%') OR details LIKE '%TEST-TXSYNC-%'`);
  await query(`DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE username LIKE 'test_sales_tx_%')`);
  await query(`DELETE FROM users WHERE username LIKE 'test_sales_tx_%'`);
  await pool.end();
});

function parseCookieHeader(res) {
  const setCookie = res.headers.get('set-cookie');
  if (!setCookie) return null;
  const match = setCookie.match(/mg_sid=([^;]+)/);
  return match ? match[1] : null;
}

test('Sales & Delivery Subsystem - Batch Sync, Invoicing & Receivables (Phase 4 & 5)', async (t) => {
  let superAdminCookie;
  let salesSupervisorCookie;
  let salesPersonCookie;
  let driverCookie;

  let superAdminUser;
  let salesSupervisorUser;
  let salesPersonUser;

  let testZoneId;
  let testVehicleId;
  let testTripId;
  let butaneProductId;
  let lpg11kgProductId;
  let testCustomerId1;
  let testCustomerId2;

  beforeEach(async () => {
    // 1. Clean test records with isolation prefix test_sales_tx_ and TEST-TXSYNC-
    await query(`DELETE FROM canister_ledger WHERE trip_id IN (SELECT id FROM trips WHERE trip_number LIKE 'TEST-TXSYNC-%') OR customer_id IN (SELECT id FROM customers WHERE contact_person LIKE 'TEST-TXSYNC-%' OR business_name LIKE 'TEST-TXSYNC-%')`);
    await query(`DELETE FROM sales_invoices WHERE invoice_number LIKE 'INV-TEST-TXSYNC-%' OR invoice_number LIKE 'CD-TEST-TXSYNC-%'`);
    await query(`DELETE FROM sales_transaction_items WHERE transaction_id IN (SELECT id FROM sales_transactions WHERE transaction_no LIKE 'TEST-TXSYNC-%')`);
    await query(`DELETE FROM sales_transactions WHERE transaction_no LIKE 'TEST-TXSYNC-%'`);
    await query(`DELETE FROM trips WHERE trip_number LIKE 'TEST-TXSYNC-%'`);
    await query(`DELETE FROM customers WHERE contact_person LIKE 'TEST-TXSYNC-%' OR business_name LIKE 'TEST-TXSYNC-%'`);
    await query(`DELETE FROM vehicles WHERE plate_number LIKE 'TEST-TXSYNC-%'`);
    await query(`DELETE FROM service_zones WHERE code LIKE 'TEST-TXSYNC-%'`);
    await query(`DELETE FROM history_logs WHERE user_id IN (SELECT id FROM users WHERE username LIKE 'test_sales_tx_%') OR details LIKE '%TEST-TXSYNC-%'`);
    await query(`DELETE FROM audit_logs WHERE user_id IN (SELECT id FROM users WHERE username LIKE 'test_sales_tx_%') OR target_user_id IN (SELECT id FROM users WHERE username LIKE 'test_sales_tx_%')`);
    await query(`DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE username LIKE 'test_sales_tx_%')`);
    await query(`DELETE FROM users WHERE username LIKE 'test_sales_tx_%'`);

    // 2. Fetch role IDs
    const superAdminRole = (await query(`SELECT id FROM roles WHERE name = 'Super Admin'`)).rows[0].id;
    const salesSupervisorRole = (await query(`SELECT id FROM roles WHERE name = 'Sales Supervisor'`)).rows[0].id;
    const salesPersonRole = (await query(`SELECT id FROM roles WHERE name = 'Sales Person'`)).rows[0].id;
    const driverRole = (await query(`SELECT id FROM roles WHERE name = 'Driver'`)).rows[0].id;

    // 3. Create test users
    const passwordHash = await bcrypt.hash('TxSalesPass123!', 10);

    const saRes = await query(
      `INSERT INTO users (username, password_hash, first_name, last_name, phone, role_id, is_active, is_blocked, must_change_password)
       VALUES ($1, $2, $3, $4, $5, $6, TRUE, FALSE, FALSE) RETURNING id, username`,
      ['test_sales_tx_superadmin', passwordHash, 'Super', 'Admin', '+639175000001', superAdminRole]
    );
    superAdminUser = saRes.rows[0];

    const ssRes = await query(
      `INSERT INTO users (username, password_hash, first_name, last_name, phone, role_id, is_active, is_blocked, must_change_password)
       VALUES ($1, $2, $3, $4, $5, $6, TRUE, FALSE, FALSE) RETURNING id, username`,
      ['test_sales_tx_supervisor', passwordHash, 'Sales', 'Supervisor', '+639175000002', salesSupervisorRole]
    );
    salesSupervisorUser = ssRes.rows[0];

    const spRes = await query(
      `INSERT INTO users (username, password_hash, first_name, last_name, phone, role_id, is_active, is_blocked, must_change_password)
       VALUES ($1, $2, $3, $4, $5, $6, TRUE, FALSE, FALSE) RETURNING id, username`,
      ['test_sales_tx_salesrep', passwordHash, 'Sales', 'Rep', '+639175000003', salesPersonRole]
    );
    salesPersonUser = spRes.rows[0];

    await query(
      `INSERT INTO users (username, password_hash, first_name, last_name, phone, role_id, is_active, is_blocked, must_change_password)
       VALUES ($1, $2, $3, $4, $5, $6, TRUE, FALSE, FALSE)`,
      ['test_sales_tx_driver', passwordHash, 'Delivery', 'Driver', '+639175000004', driverRole]
    );

    // 4. Authenticate users
    const saLogin = await fetch(`${baseUrl}/api/users/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'test_sales_tx_superadmin', password: 'TxSalesPass123!' }),
    });
    superAdminCookie = parseCookieHeader(saLogin);

    const ssLogin = await fetch(`${baseUrl}/api/users/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'test_sales_tx_supervisor', password: 'TxSalesPass123!' }),
    });
    salesSupervisorCookie = parseCookieHeader(ssLogin);

    const spLogin = await fetch(`${baseUrl}/api/users/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'test_sales_tx_salesrep', password: 'TxSalesPass123!' }),
    });
    salesPersonCookie = parseCookieHeader(spLogin);

    const driverLogin = await fetch(`${baseUrl}/api/users/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'test_sales_tx_driver', password: 'TxSalesPass123!' }),
    });
    driverCookie = parseCookieHeader(driverLogin);

    // 5. Create service zone & vehicle & active trip
    const zoneRes = await query(
      `INSERT INTO service_zones (code, name, description, is_active)
       VALUES ('TEST-TXSYNC-ZONE', 'Test Route Zone', 'Zone for sales testing', TRUE) RETURNING id`
    );
    testZoneId = zoneRes.rows[0].id;

    const vehRes = await query(
      `INSERT INTO vehicles (plate_number, model, year_model, status)
       VALUES ('TEST-TXSYNC-TRK', 'Isuzu Elf', 2023, 'ACTIVE') RETURNING id`
    );
    testVehicleId = vehRes.rows[0].id;

    const tripRes = await query(
      `INSERT INTO trips (truck_id, driver_id, sales_user_id, zone_id, trip_number, status)
       VALUES ($1, $2, $3, $4, 'TEST-TXSYNC-TRIP-01', 'IN_PROGRESS') RETURNING id`,
      [testVehicleId, salesPersonUser.id, salesPersonUser.id, testZoneId]
    );
    testTripId = tripRes.rows[0].id;

    // 6. Fetch products
    const butaneRow = (await query(`SELECT id FROM products WHERE name = 'Butane Canister 170g'`)).rows[0];
    butaneProductId = butaneRow ? butaneRow.id : (await query(
      `INSERT INTO products (name, category, container_type, net_weight_kg, is_active)
       VALUES ('Butane Canister 170g', 'Canister', 'CANISTER', 0.170, TRUE) RETURNING id`
    )).rows[0].id;

    const lpgRow = (await query(`SELECT id FROM products WHERE name = '11kg LPG Cylinder'`)).rows[0];
    lpg11kgProductId = lpgRow ? lpgRow.id : (await query(
      `INSERT INTO products (name, category, container_type, net_weight_kg, is_active)
       VALUES ('11kg LPG Cylinder', 'LPG Cylinder', 'CYLINDER', 11.000, TRUE) RETURNING id`
    )).rows[0].id;

    // 7. Create test customers
    const cust1Res = await query(
      `INSERT INTO customers (business_name, contact_person, contact_number, delivery_address, zone_id, customer_type, is_active)
       VALUES ('TEST-TXSYNC- Commercial Diner', 'TEST-TXSYNC- Maria Chef', '+639176000001', 'Matina, Davao', $1, 'COMMERCIAL', TRUE)
       RETURNING id`,
      [testZoneId]
    );
    testCustomerId1 = cust1Res.rows[0].id;

    const cust2Res = await query(
      `INSERT INTO customers (business_name, contact_person, contact_number, delivery_address, zone_id, customer_type, is_active)
       VALUES ('TEST-TXSYNC- Corner Retailer', 'TEST-TXSYNC- Juan Tindero', '+639176000002', 'Toril, Davao', $1, 'RETAILER', TRUE)
       RETURNING id`,
      [testZoneId]
    );
    testCustomerId2 = cust2Res.rows[0].id;
  });

  // ============================================================
  // Subtest 1: Store-and-Forward Ingestion Engine (POST /api/sales/sync-batch)
  // ============================================================
  await t.test('1. Store-and-Forward Sync - Dual Timestamps, Client UUIDs & Price Freezing', async () => {
    // 1. Unauthenticated -> 401
    const unauthRes = await fetch(`${baseUrl}/api/sales/sync-batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tripId: testTripId, transactions: [] }),
    });
    assert.equal(unauthRes.status, 401);

    // 2. Unauthorized role (Driver lacks sales.create) -> 403
    const driverRes = await fetch(`${baseUrl}/api/sales/sync-batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: `mg_sid=${driverCookie}` },
      body: JSON.stringify({ tripId: testTripId, transactions: [] }),
    });
    assert.equal(driverRes.status, 403);

    // 3. Valid batch submission by Sales Person
    const clientTxId = crypto.randomUUID();
    const clientItemId1 = crypto.randomUUID();
    const clientItemId2 = crypto.randomUUID();
    const clientInvoiceId = crypto.randomUUID();
    const deviceTime = '2026-10-15T08:30:00.000Z';

    const syncRes = await fetch(`${baseUrl}/api/sales/sync-batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: `mg_sid=${salesPersonCookie}` },
      body: JSON.stringify({
        tripId: testTripId,
        transactions: [
          {
            id: clientTxId,
            transactionNo: 'TEST-TXSYNC-001',
            customerId: testCustomerId1,
            transactedAt: deviceTime,
            items: [
              {
                id: clientItemId1,
                productId: butaneProductId,
                quantitySold: 10,
                emptiesReturned: 6,
                emptiesDefective: 0,
                unitPriceAtSale: 125.00,
                subtotalAmount: 1250.00,
              },
              {
                id: clientItemId2,
                productId: lpg11kgProductId,
                quantitySold: 2,
                emptiesReturned: 0,
                emptiesDefective: 0,
                unitPriceAtSale: 950.00,
                subtotalAmount: 1900.00,
              },
            ],
            invoice: {
              id: clientInvoiceId,
              invoiceNumber: 'INV-TEST-TXSYNC-001',
              declarationNumber: 'CD-TEST-TXSYNC-001',
              totalAmount: 3150.00,
              paymentMethod: 'CASH',
              paymentStatus: 'PAID_UNVERIFIED',
            },
          },
        ],
      }),
    });

    assert.equal(syncRes.status, 200);
    const syncJson = await syncRes.json();
    assert.equal(syncJson.status, 'success');
    assert.equal(syncJson.data.processedCount, 1);
    assert.equal(syncJson.data.ignoredCount, 0);
    assert.ok(syncJson.data.transactionIds.includes(clientTxId));

    // 4. Verify DB records reflect client UUIDs, dual timestamps & frozen prices
    const txRow = (await query(`SELECT * FROM sales_transactions WHERE id = $1`, [clientTxId])).rows[0];
    assert.ok(txRow, 'Transaction record should exist');
    assert.equal(txRow.transaction_no, 'TEST-TXSYNC-001');
    assert.equal(txRow.status, 'COMPLETED');
    assert.equal(new Date(txRow.transacted_at).toISOString(), deviceTime);
    assert.ok(txRow.synced_at, 'Server synced_at should be populated');

    const itemsRows = (await query(
      `SELECT * FROM sales_transaction_items WHERE transaction_id = $1 ORDER BY unit_price_at_sale ASC`,
      [clientTxId]
    )).rows;
    assert.equal(itemsRows.length, 2);
    assert.equal(itemsRows[0].id, clientItemId1);
    assert.equal(Number(itemsRows[0].unit_price_at_sale), 125.00);
    assert.equal(Number(itemsRows[0].subtotal_amount), 1250.00);
    assert.equal(itemsRows[1].id, clientItemId2);
    assert.equal(Number(itemsRows[1].unit_price_at_sale), 950.00);
    assert.equal(Number(itemsRows[1].subtotal_amount), 1900.00);

    const invRow = (await query(`SELECT * FROM sales_invoices WHERE id = $1`, [clientInvoiceId])).rows[0];
    assert.ok(invRow, 'Invoice record should exist');
    assert.equal(invRow.invoice_number, 'INV-TEST-TXSYNC-001');
    assert.equal(Number(invRow.total_amount), 3150.00);
    assert.equal(invRow.payment_method, 'CASH');
    assert.equal(invRow.payment_status, 'PAID_UNVERIFIED');
  });

  // ============================================================
  // Subtest 2: Batch Idempotency & Fringe Cellular Resubmission
  // ============================================================
  await t.test('2. Idempotency - Resubmission of Identical Batch (ON CONFLICT DO NOTHING)', async () => {
    const fixedTxId = crypto.randomUUID();
    const fixedItemId = crypto.randomUUID();
    const fixedInvId = crypto.randomUUID();

    const payload = {
      tripId: testTripId,
      transactions: [
        {
          id: fixedTxId,
          transactionNo: 'TEST-TXSYNC-IDEMP',
          customerId: testCustomerId2,
          transactedAt: '2026-10-15T09:00:00.000Z',
          items: [
            {
              id: fixedItemId,
              productId: butaneProductId,
              quantitySold: 4,
              emptiesReturned: 4,
              unitPriceAtSale: 120.00,
              subtotalAmount: 480.00,
            },
          ],
          invoice: {
            id: fixedInvId,
            invoiceNumber: 'INV-TEST-TXSYNC-IDEMP',
            declarationNumber: 'CD-TEST-TXSYNC-IDEMP',
            totalAmount: 480.00,
            paymentMethod: 'CASH',
          },
        },
      ],
    };

    // First push -> processed
    const firstRes = await fetch(`${baseUrl}/api/sales/sync-batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: `mg_sid=${salesPersonCookie}` },
      body: JSON.stringify(payload),
    });
    assert.equal(firstRes.status, 200);
    const firstJson = await firstRes.json();
    assert.equal(firstJson.data.processedCount, 1);
    assert.equal(firstJson.data.ignoredCount, 0);

    // Second push (simulating fringe connection network retry) -> ignored idempotently
    const retryRes = await fetch(`${baseUrl}/api/sales/sync-batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: `mg_sid=${salesPersonCookie}` },
      body: JSON.stringify(payload),
    });
    assert.equal(retryRes.status, 200);
    const retryJson = await retryRes.json();
    assert.equal(retryJson.data.processedCount, 0);
    assert.equal(retryJson.data.ignoredCount, 1);

    // Verify exactly 1 transaction and 1 item exist in the database
    const txCount = (await query(
      `SELECT COUNT(*)::int AS count FROM sales_transactions WHERE transaction_no = 'TEST-TXSYNC-IDEMP'`
    )).rows[0].count;
    assert.equal(txCount, 1);

    const invCount = (await query(
      `SELECT COUNT(*)::int AS count FROM sales_invoices WHERE invoice_number = 'INV-TEST-TXSYNC-IDEMP'`
    )).rows[0].count;
    assert.equal(invCount, 1);
  });

  // ============================================================
  // Subtest 3: Deterministic Append-Only Canister Debt Accounting
  // ============================================================
  await t.test('3. Canister Receivables - Signed Deltas & Zero-Sale Pickup Stops', async () => {
    // A. Stop 1: Standard Sale with Loan & Return
    // Butane: 10 sold, 6 returned -> loaned = 4, returned = 0, delta = +4
    // 11kg LPG: 2 sold, 0 returned -> loaned = 2, returned = 0, delta = +2
    const tx1Id = crypto.randomUUID();
    await fetch(`${baseUrl}/api/sales/sync-batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: `mg_sid=${salesPersonCookie}` },
      body: JSON.stringify({
        tripId: testTripId,
        transactions: [
          {
            id: tx1Id,
            transactionNo: 'TEST-TXSYNC-SWAP-1',
            customerId: testCustomerId1,
            transactedAt: '2026-10-15T10:00:00.000Z',
            items: [
              {
                productId: butaneProductId,
                quantitySold: 10,
                emptiesReturned: 6,
                unitPriceAtSale: 120.00,
                subtotalAmount: 1200.00,
              },
              {
                productId: lpg11kgProductId,
                quantitySold: 2,
                emptiesReturned: 0,
                unitPriceAtSale: 900.00,
                subtotalAmount: 1800.00,
              },
            ],
            invoice: {
              invoiceNumber: 'INV-TEST-TXSYNC-SWAP-1',
              declarationNumber: 'CD-TEST-TXSYNC-SWAP-1',
              totalAmount: 3000.00,
              paymentMethod: 'CASH',
            },
          },
        ],
      }),
    });

    // B. Stop 2: Zero-Sale Stop (Pick up loaned empties without sales)
    // 0 sold, 3 returned empty Butane -> loaned = 0, returned = 3, delta = -3
    const tx2Id = crypto.randomUUID();
    await fetch(`${baseUrl}/api/sales/sync-batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: `mg_sid=${salesPersonCookie}` },
      body: JSON.stringify({
        tripId: testTripId,
        transactions: [
          {
            id: tx2Id,
            transactionNo: 'TEST-TXSYNC-PICKUP-2',
            customerId: testCustomerId1,
            transactedAt: '2026-10-15T11:00:00.000Z',
            items: [
              {
                productId: butaneProductId,
                quantitySold: 0,
                emptiesReturned: 3,
                unitPriceAtSale: 0,
                subtotalAmount: 0,
              },
            ],
            invoice: {
              invoiceNumber: 'CD-TEST-TXSYNC-PICKUP-2',
              declarationNumber: 'CD-TEST-TXSYNC-PICKUP-2',
              totalAmount: 0.00,
              paymentMethod: 'CASH',
            },
          },
        ],
      }),
    });

    // C. Verify canister ledger entries for Stop 1
    const ledgerTx1 = (await query(
      `SELECT * FROM canister_ledger WHERE transaction_id = $1 ORDER BY quantity_loaned DESC`,
      [tx1Id]
    )).rows;
    assert.equal(ledgerTx1.length, 2);

    const butaneLedger1 = ledgerTx1.find((l) => l.product_id === butaneProductId);
    assert.equal(butaneLedger1.quantity_loaned, 4);
    assert.equal(butaneLedger1.quantity_returned, 0);
    assert.equal(butaneLedger1.net_balance_change, 4);

    const lpgLedger1 = ledgerTx1.find((l) => l.product_id === lpg11kgProductId);
    assert.equal(lpgLedger1.quantity_loaned, 2);
    assert.equal(lpgLedger1.quantity_returned, 0);
    assert.equal(lpgLedger1.net_balance_change, 2);

    // D. Verify canister ledger entry for Zero-Sale Pickup Stop 2
    const ledgerTx2 = (await query(
      `SELECT * FROM canister_ledger WHERE transaction_id = $1`,
      [tx2Id]
    )).rows;
    assert.equal(ledgerTx2.length, 1);
    assert.equal(ledgerTx2[0].quantity_loaned, 0);
    assert.equal(ledgerTx2[0].quantity_returned, 3);
    assert.equal(ledgerTx2[0].net_balance_change, -3);

    // E. Verify customer profile dynamically computes net balance:
    // Butane: +4 - 3 = +1 net debt
    // 11kg LPG: +2 net debt
    // Total net debt = 3
    const custRes = await fetch(`${baseUrl}/api/sales/customers/${testCustomerId1}`, {
      headers: { Cookie: `mg_sid=${salesPersonCookie}` },
    });
    const custJson = await custRes.json();
    assert.equal(custJson.data.customer.totalNetCanisterDebt, 3);
  });

  // ============================================================
  // Subtest 4: Supervisor GCash Verification (PATCH /api/sales/invoices/:id/verify)
  // ============================================================
  await t.test('4. Supervisor Verification - GCash Settlement & Proof Invariants', async () => {
    // 1. Ingest transaction with GCash payment (PAID_UNVERIFIED)
    const gcashTxId = crypto.randomUUID();
    const gcashInvId = crypto.randomUUID();

    await fetch(`${baseUrl}/api/sales/sync-batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: `mg_sid=${salesPersonCookie}` },
      body: JSON.stringify({
        tripId: testTripId,
        transactions: [
          {
            id: gcashTxId,
            transactionNo: 'TEST-TXSYNC-GCASH-1',
            customerId: testCustomerId2,
            transactedAt: '2026-10-15T12:00:00.000Z',
            items: [
              {
                productId: butaneProductId,
                quantitySold: 2,
                emptiesReturned: 2,
                unitPriceAtSale: 120.00,
                subtotalAmount: 240.00,
              },
            ],
            invoice: {
              id: gcashInvId,
              invoiceNumber: 'INV-TEST-TXSYNC-GCASH-1',
              declarationNumber: 'CD-TEST-TXSYNC-GCASH-1',
              totalAmount: 240.00,
              paymentMethod: 'GCASH',
              paymentStatus: 'PAID_UNVERIFIED',
              paymentReferenceNumber: 'GCASH-REF-889900',
              paymentProofKey: 'proofs/gcash-889900.png',
            },
          },
        ],
      }),
    });

    // 2. Frontline sales person cannot verify payment (lacks global sales.view)
    const unauthVerify = await fetch(`${baseUrl}/api/sales/invoices/${gcashInvId}/verify`, {
      method: 'PATCH',
      headers: { Cookie: `mg_sid=${salesPersonCookie}` },
    });
    assert.equal(unauthVerify.status, 403);

    // 3. Supervisor verifies invoice payment
    const verifyRes = await fetch(`${baseUrl}/api/sales/invoices/${gcashInvId}/verify`, {
      method: 'PATCH',
      headers: { Cookie: `mg_sid=${salesSupervisorCookie}` },
    });
    assert.equal(verifyRes.status, 200);
    const verifyJson = await verifyRes.json();
    assert.equal(verifyJson.status, 'success');
    assert.equal(verifyJson.message, 'Invoice payment successfully verified');

    const inv = verifyJson.data.invoice;
    assert.equal(inv.payment_status, 'VERIFIED');
    assert.equal(inv.verified_by, salesSupervisorUser.id);
    assert.ok(inv.verified_at);
    assert.equal(inv.payment_proof_key, 'proofs/gcash-889900.png');
    assert.ok(inv.payment_proof_url.includes('proofs/gcash-889900.png'));
    assert.ok(inv.paymentProofUrl.includes('proofs/gcash-889900.png'));

    // 4. Re-verification should fail with 400 (already verified)
    const repeatVerify = await fetch(`${baseUrl}/api/sales/invoices/${gcashInvId}/verify`, {
      method: 'PATCH',
      headers: { Cookie: `mg_sid=${salesSupervisorCookie}` },
    });
    assert.equal(repeatVerify.status, 400);
    const repeatJson = await repeatVerify.json();
    assert.match(repeatJson.message, /already verified/i);
  });

  // ============================================================
  // Subtest 5: Shift Closeout Remittance Aggregation (GET /api/sales/trips/:tripId/shift-summary)
  // ============================================================
  await t.test('5. Shift Closeout - Cash, GCash References & Empties Aggregation', async () => {
    // 1. Seed transactions for closeout
    await fetch(`${baseUrl}/api/sales/sync-batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: `mg_sid=${salesPersonCookie}` },
      body: JSON.stringify({
        tripId: testTripId,
        transactions: [
          {
            transactionNo: 'TEST-TXSYNC-SUM-1',
            customerId: testCustomerId1,
            transactedAt: '2026-10-15T09:00:00.000Z',
            items: [
              {
                productId: butaneProductId,
                quantitySold: 5,
                emptiesReturned: 3,
                unitPriceAtSale: 120.00,
                subtotalAmount: 600.00,
              },
            ],
            invoice: {
              invoiceNumber: 'INV-TEST-TXSYNC-SUM-1',
              declarationNumber: 'CD-TEST-TXSYNC-SUM-1',
              totalAmount: 600.00,
              paymentMethod: 'CASH',
            },
          },
          {
            transactionNo: 'TEST-TXSYNC-SUM-2',
            customerId: testCustomerId2,
            transactedAt: '2026-10-15T10:00:00.000Z',
            items: [
              {
                productId: lpg11kgProductId,
                quantitySold: 2,
                emptiesReturned: 1,
                unitPriceAtSale: 900.00,
                subtotalAmount: 1800.00,
              },
            ],
            invoice: {
              invoiceNumber: 'INV-TEST-TXSYNC-SUM-2',
              declarationNumber: 'CD-TEST-TXSYNC-SUM-2',
              totalAmount: 1800.00,
              paymentMethod: 'GCASH',
              paymentStatus: 'PAID_UNVERIFIED',
              paymentReferenceNumber: 'GCASH-REF-554433',
              paymentProofKey: 'proofs/gcash-554433.jpg',
            },
          },
        ],
      }),
    });

    const summaryRes = await fetch(`${baseUrl}/api/sales/trips/${testTripId}/shift-summary`, {
      headers: { Cookie: `mg_sid=${salesSupervisorCookie}` },
    });
    assert.equal(summaryRes.status, 200);
    const summaryJson = await summaryRes.json();
    assert.equal(summaryJson.status, 'success');

    const summary = summaryJson.data;
    assert.equal(summary.tripId, testTripId);
    assert.equal(summary.totalTransactions, 2);
    assert.equal(summary.completedTransactions, 2);
    assert.equal(summary.cancelledTransactions, 0);

    // Revenue breakdown
    assert.equal(summary.revenue.cash.totalAmount, 600.00);
    assert.equal(summary.revenue.cash.transactionCount, 1);
    assert.equal(summary.revenue.gcash.totalAmount, 1800.00);
    assert.equal(summary.revenue.gcash.transactionCount, 1);
    assert.equal(summary.revenue.gcash.unverifiedCount, 1);
    assert.equal(summary.revenue.totalRevenue, 2400.00);

    // GCash payment slip items
    assert.ok(Array.isArray(summary.revenue.gcash.payments));
    assert.equal(summary.revenue.gcash.payments.length, 1);
    assert.equal(summary.revenue.gcash.payments[0].paymentReferenceNumber, 'GCASH-REF-554433');
    assert.equal(summary.revenue.gcash.payments[0].paymentProofKey, 'proofs/gcash-554433.jpg');
    assert.ok(summary.revenue.gcash.payments[0].paymentProofUrl.includes('proofs/gcash-554433.jpg'));
    assert.ok(summary.revenue.gcash.payments[0].payment_proof_url.includes('proofs/gcash-554433.jpg'));

    // Empties returned breakdown
    assert.equal(summary.empties.totalEmptiesCount, 4); // 3 butane + 1 lpg
    assert.ok(Array.isArray(summary.empties.breakdown));
    assert.equal(summary.empties.breakdown.length, 2);

    // Net debt created: (5-3) + (2-1) = 2 + 1 = 3
    assert.equal(summary.netCustomerDebtCreated, 3);
  });

  // ============================================================
  // Subtest 6: Transaction Cancellation & Canister Debt Reversal
  // ============================================================
  await t.test('6. Transaction Voiding - Status Cancellation & Canister Ledger Cleanup', async () => {
    // 1. Ingest a transaction creating canister debt
    const cancelTxId = crypto.randomUUID();
    await fetch(`${baseUrl}/api/sales/sync-batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: `mg_sid=${salesPersonCookie}` },
      body: JSON.stringify({
        tripId: testTripId,
        transactions: [
          {
            id: cancelTxId,
            transactionNo: 'TEST-TXSYNC-TO-CANCEL',
            customerId: testCustomerId2,
            transactedAt: '2026-10-15T13:00:00.000Z',
            items: [
              {
                productId: butaneProductId,
                quantitySold: 8,
                emptiesReturned: 0, // Creates +8 debt
                unitPriceAtSale: 120.00,
                subtotalAmount: 960.00,
              },
            ],
            invoice: {
              invoiceNumber: 'INV-TEST-TXSYNC-CANCEL',
              declarationNumber: 'CD-TEST-TXSYNC-CANCEL',
              totalAmount: 960.00,
              paymentMethod: 'CASH',
            },
          },
        ],
      }),
    });

    // Verify 8 canisters loaned
    const debtBefore = (await query(
      `SELECT COUNT(*)::int AS count FROM canister_ledger WHERE transaction_id = $1`,
      [cancelTxId]
    )).rows[0].count;
    assert.equal(debtBefore, 1);

    // 2. Frontline sales rep cannot cancel (lacks sales.delete)
    const unauthCancel = await fetch(`${baseUrl}/api/sales/transactions/${cancelTxId}/cancel`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: `mg_sid=${salesPersonCookie}` },
      body: JSON.stringify({ reason: 'Customer rejected cylinders' }),
    });
    assert.equal(unauthCancel.status, 403);

    // 3. Supervisor cancels transaction with reason
    const cancelRes = await fetch(`${baseUrl}/api/sales/transactions/${cancelTxId}/cancel`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: `mg_sid=${salesSupervisorCookie}` },
      body: JSON.stringify({ reason: 'Customer rejected cylinders due to valve damage' }),
    });
    assert.equal(cancelRes.status, 200);
    const cancelJson = await cancelRes.json();
    assert.equal(cancelJson.status, 'success');
    assert.equal(cancelJson.message, 'Transaction successfully cancelled');
    assert.equal(cancelJson.data.transaction.status, 'CANCELLED');
    assert.equal(cancelJson.data.transaction.cancellation_reason, 'Customer rejected cylinders due to valve damage');
    assert.equal(cancelJson.data.transaction.cancelled_by, salesSupervisorUser.id);

    // 4. Verify canister ledger entries for this transaction were cleanly removed
    const debtAfter = (await query(
      `SELECT COUNT(*)::int AS count FROM canister_ledger WHERE transaction_id = $1`,
      [cancelTxId]
    )).rows[0].count;
    assert.equal(debtAfter, 0, 'Canister ledger entries should be removed upon transaction cancellation');
  });

  // ============================================================
  // Subtest 7: Cross-Subsystem Inventory Reconciliation Hooks
  // ============================================================
  await t.test('7. Reconciliation Hooks - Automated Net Debt & Sold Counts Calculation', async () => {
    // 1. Ingest transactions on trip
    await fetch(`${baseUrl}/api/sales/sync-batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: `mg_sid=${salesPersonCookie}` },
      body: JSON.stringify({
        tripId: testTripId,
        transactions: [
          {
            transactionNo: 'TEST-TXSYNC-RECON-1',
            customerId: testCustomerId1,
            transactedAt: '2026-10-15T14:00:00.000Z',
            items: [
              {
                productId: butaneProductId,
                quantitySold: 10,
                emptiesReturned: 6, // Net debt +4
                unitPriceAtSale: 120.00,
                subtotalAmount: 1200.00,
              },
              {
                productId: lpg11kgProductId,
                quantitySold: 2,
                emptiesReturned: 0, // Net debt +2
                unitPriceAtSale: 900.00,
                subtotalAmount: 1800.00,
              },
            ],
          },
        ],
      }),
    });

    // 2. Test getTripNetCustomerDebtCreated
    const debtBySku = await getTripNetCustomerDebtCreated(testTripId);
    assert.equal(debtBySku.length, 2);

    const butaneDebt = debtBySku.find((d) => d.product_id === butaneProductId);
    assert.equal(butaneDebt.net_customer_debt_created, 4);

    const lpgDebt = debtBySku.find((d) => d.product_id === lpg11kgProductId);
    assert.equal(lpgDebt.net_customer_debt_created, 2);

    // 3. Test getTripTotalNetCustomerDebtCreated
    const totalDebt = await getTripTotalNetCustomerDebtCreated(testTripId);
    assert.equal(totalDebt, 6);

    // 4. Test getTripTotalSoldFull
    const totalSold = await getTripTotalSoldFull(testTripId);
    assert.equal(totalSold, 12); // 10 butane + 2 lpg
  });

  // ============================================================
  // Subtest 8: Centralized Audit Trail Verification
  // ============================================================
  await t.test('8. Audit Trail - Event History Logging & Resolvers', async () => {
    // 1. Perform sync, invoice verify, and cancel to trigger audit logs
    const auditTxId = crypto.randomUUID();
    const auditInvId = crypto.randomUUID();

    await fetch(`${baseUrl}/api/sales/sync-batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: `mg_sid=${salesPersonCookie}` },
      body: JSON.stringify({
        tripId: testTripId,
        transactions: [
          {
            id: auditTxId,
            transactionNo: 'TEST-TXSYNC-AUDIT-1',
            customerId: testCustomerId1,
            transactedAt: '2026-10-15T15:00:00.000Z',
            items: [
              {
                productId: butaneProductId,
                quantitySold: 1,
                emptiesReturned: 1,
                unitPriceAtSale: 120.00,
                subtotalAmount: 120.00,
              },
            ],
            invoice: {
              id: auditInvId,
              invoiceNumber: 'INV-TEST-TXSYNC-AUDIT-1',
              declarationNumber: 'CD-TEST-TXSYNC-AUDIT-1',
              totalAmount: 120.00,
              paymentMethod: 'GCASH',
              paymentStatus: 'PAID_UNVERIFIED',
              paymentReferenceNumber: 'GCASH-AUDIT-9988',
            },
          },
        ],
      }),
    });

    await fetch(`${baseUrl}/api/sales/invoices/${auditInvId}/verify`, {
      method: 'PATCH',
      headers: { Cookie: `mg_sid=${salesSupervisorCookie}` },
    });

    await fetch(`${baseUrl}/api/sales/transactions/${auditTxId}/cancel`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: `mg_sid=${salesSupervisorCookie}` },
      body: JSON.stringify({ reason: 'Audit cancellation test' }),
    });

    // 2. Query history_logs for target transaction
    const logsRes = await query(
      `SELECT module, action_type, details FROM history_logs
       WHERE details LIKE '%TEST-TXSYNC-%' OR details LIKE '%INV-TEST-TXSYNC-%'
       ORDER BY created_at ASC`
    );

    assert.ok(logsRes.rows.length >= 3, 'Should record audit entries for sync, cancel, and verify');

    // Verify SALES_BATCH_SYNCED
    const syncLog = logsRes.rows.find((l) => l.details.includes('Synchronized batch of'));
    assert.ok(syncLog, 'SALES_BATCH_SYNCED log should exist');
    assert.equal(syncLog.module, 'Sales & Delivery');

    // Verify SALES_INVOICE_VERIFIED
    const verifyLog = logsRes.rows.find((l) => l.details.includes('Verified payment for invoice'));
    assert.ok(verifyLog, 'SALES_INVOICE_VERIFIED log should exist');
    assert.equal(verifyLog.module, 'Sales & Delivery');

    // Verify SALES_TRANSACTION_CANCELLED
    const cancelLog = logsRes.rows.find((l) => l.details.includes('Cancelled sales transaction'));
    assert.ok(cancelLog, 'SALES_TRANSACTION_CANCELLED log should exist');
    assert.equal(cancelLog.module, 'Sales & Delivery');
  });

  // ============================================================
  // Subtest 9: Partial Batch Resilience — HoL Blocking Elimination
  // ============================================================
  await t.test('9. Partial Batch Resilience - Valid Orders Survive One Bad Item', async () => {
    const goodTxId1 = crypto.randomUUID();
    const goodTxId2 = crypto.randomUUID();
    const badTxId = crypto.randomUUID();
    const goodItemId1 = crypto.randomUUID();
    const goodItemId2 = crypto.randomUUID();
    const fakeProdId = '00000000-dead-4000-beef-000000000000';

    const partialRes = await fetch(`${baseUrl}/api/sales/sync-batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: `mg_sid=${salesPersonCookie}` },
      body: JSON.stringify({
        tripId: testTripId,
        transactions: [
          // Transaction 1 — valid
          {
            id: goodTxId1,
            transactionNo: 'TEST-TXSYNC-PARTIAL-GOOD-1',
            customerId: testCustomerId1,
            transactedAt: '2026-10-19T08:00:00.000Z',
            items: [
              {
                id: goodItemId1,
                productId: butaneProductId,
                quantitySold: 3,
                emptiesReturned: 1,
                unitPriceAtSale: 120.00,
                subtotalAmount: 360.00,
              },
            ],
            invoice: {
              invoiceNumber: 'INV-TEST-TXSYNC-PARTIAL-GOOD-1',
              declarationNumber: 'CD-TEST-TXSYNC-PARTIAL-GOOD-1',
              totalAmount: 360.00,
              paymentMethod: 'CASH',
            },
          },
          // Transaction 2 — bad productId (non-existent UUID → FK violation)
          {
            id: badTxId,
            transactionNo: 'TEST-TXSYNC-PARTIAL-BAD',
            customerId: testCustomerId1,
            transactedAt: '2026-10-19T08:05:00.000Z',
            items: [
              {
                productId: fakeProdId,
                quantitySold: 5,
                emptiesReturned: 0,
                unitPriceAtSale: 950.00,
                subtotalAmount: 4750.00,
              },
            ],
          },
          // Transaction 3 — valid
          {
            id: goodTxId2,
            transactionNo: 'TEST-TXSYNC-PARTIAL-GOOD-2',
            customerId: testCustomerId2,
            transactedAt: '2026-10-19T08:10:00.000Z',
            items: [
              {
                id: goodItemId2,
                productId: lpg11kgProductId,
                quantitySold: 1,
                emptiesReturned: 1,
                unitPriceAtSale: 900.00,
                subtotalAmount: 900.00,
              },
            ],
            invoice: {
              invoiceNumber: 'INV-TEST-TXSYNC-PARTIAL-GOOD-2',
              declarationNumber: 'CD-TEST-TXSYNC-PARTIAL-GOOD-2',
              totalAmount: 900.00,
              paymentMethod: 'CASH',
            },
          },
        ],
      }),
    });

    assert.equal(partialRes.status, 200);
    const partialJson = await partialRes.json();

    // Top-level status should be partial_success
    assert.equal(partialJson.status, 'partial_success');

    const d = partialJson.data;
    assert.equal(d.processedCount, 2);
    assert.equal(d.ignoredCount, 0);
    assert.equal(d.failedCount, 1);
    assert.equal(d.summary.totalSubmitted, 3);
    assert.equal(d.summary.processed, 2);
    assert.equal(d.summary.failed, 1);

    // Both good orders must be acknowledged
    assert.ok(d.syncedTransactionIds.includes(goodTxId1), 'Good TX 1 must be in syncedTransactionIds');
    assert.ok(d.syncedTransactionIds.includes(goodTxId2), 'Good TX 2 must be in syncedTransactionIds');
    assert.ok(!d.syncedTransactionIds.includes(badTxId), 'Bad TX must NOT be in syncedTransactionIds');

    // Failed item must be in failedTransactions with correct errorCode
    assert.equal(d.failedTransactions.length, 1);
    assert.equal(d.failedTransactions[0].id, badTxId);
    assert.equal(d.failedTransactions[0].transactionNo, 'TEST-TXSYNC-PARTIAL-BAD');
    assert.ok(
      d.failedTransactions[0].errorCode === 'INVALID_ITEM_PAYLOAD' ||
      d.failedTransactions[0].errorCode === 'DB_CONSTRAINT_ERROR',
      `Unexpected errorCode: ${d.failedTransactions[0].errorCode}`
    );
    assert.ok(d.failedTransactions[0].errorMessage, 'errorMessage should be present');
    assert.ok(d.failedTransactions[0].details, 'details should be present');

    // Verify the two good orders are actually in the database
    const good1Row = (await query(`SELECT id FROM sales_transactions WHERE id = $1`, [goodTxId1])).rows[0];
    assert.ok(good1Row, 'Good TX 1 must exist in sales_transactions');

    const good2Row = (await query(`SELECT id FROM sales_transactions WHERE id = $1`, [goodTxId2])).rows[0];
    assert.ok(good2Row, 'Good TX 2 must exist in sales_transactions');

    // The bad order must NOT exist in the database
    const badRow = (await query(`SELECT id FROM sales_transactions WHERE id = $1`, [badTxId])).rows[0];
    assert.ok(!badRow, 'Bad TX must NOT exist in sales_transactions');
  });

  // ============================================================
  // Subtest 10: Idempotency Completeness — syncedTransactionIds Includes Ignored Items
  // ============================================================
  await t.test('10. Idempotency Completeness - syncedTransactionIds Covers Ignored Items on Re-Submission', async () => {
    const fixedTxId = crypto.randomUUID();

    const originalPayload = {
      tripId: testTripId,
      transactions: [
        {
          id: fixedTxId,
          transactionNo: 'TEST-TXSYNC-IDEMP2',
          customerId: testCustomerId1,
          transactedAt: '2026-10-19T09:00:00.000Z',
          items: [
            {
              productId: butaneProductId,
              quantitySold: 2,
              emptiesReturned: 2,
              unitPriceAtSale: 120.00,
              subtotalAmount: 240.00,
            },
          ],
          invoice: {
            invoiceNumber: 'INV-TEST-TXSYNC-IDEMP2',
            declarationNumber: 'CD-TEST-TXSYNC-IDEMP2',
            totalAmount: 240.00,
            paymentMethod: 'CASH',
          },
        },
      ],
    };

    // First push — should process
    const firstRes = await fetch(`${baseUrl}/api/sales/sync-batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: `mg_sid=${salesPersonCookie}` },
      body: JSON.stringify(originalPayload),
    });
    const firstJson = await firstRes.json();
    assert.equal(firstRes.status, 200);
    assert.equal(firstJson.data.processedCount, 1);
    assert.equal(firstJson.data.ignoredCount, 0);
    assert.ok(firstJson.data.syncedTransactionIds.includes(fixedTxId));

    // Re-submit identical payload (simulating network retry after ambiguous response)
    const retryRes = await fetch(`${baseUrl}/api/sales/sync-batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: `mg_sid=${salesPersonCookie}` },
      body: JSON.stringify(originalPayload),
    });
    const retryJson = await retryRes.json();
    assert.equal(retryRes.status, 200);
    assert.equal(retryJson.status, 'success');
    assert.equal(retryJson.data.processedCount, 0);
    assert.equal(retryJson.data.ignoredCount, 1);

    // Critical: The re-submitted ID MUST appear in syncedTransactionIds so the
    // mobile client can safely mark it SYNCED and remove it from the queue.
    assert.ok(
      retryJson.data.syncedTransactionIds.includes(fixedTxId),
      'Re-submitted transaction UUID must appear in syncedTransactionIds even when ignored'
    );
    assert.ok(
      retryJson.data.ignoredTransactionIds.includes(fixedTxId),
      'Re-submitted transaction UUID must appear in ignoredTransactionIds'
    );

    // Confirm still exactly one record in DB
    const count = (await query(
      `SELECT COUNT(*)::int AS c FROM sales_transactions WHERE transaction_no = 'TEST-TXSYNC-IDEMP2'`
    )).rows[0].c;
    assert.equal(count, 1, 'Only one record should exist after idempotent re-submission');
  });

  // ============================================================
  // Subtest 11: Duplicate Transaction Number Isolation
  // ============================================================
  await t.test('11. Duplicate Transaction Number Conflict - First Commits, Second Idempotently Handled', async () => {
    const tx1Id = crypto.randomUUID();
    const tx2Id = crypto.randomUUID(); // Different UUID, same transactionNo as tx1Id

    const batchRes = await fetch(`${baseUrl}/api/sales/sync-batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: `mg_sid=${salesPersonCookie}` },
      body: JSON.stringify({
        tripId: testTripId,
        transactions: [
          {
            id: tx1Id,
            transactionNo: 'TEST-TXSYNC-DUP-NO',
            customerId: testCustomerId1,
            transactedAt: '2026-10-19T10:00:00.000Z',
            items: [
              {
                productId: butaneProductId,
                quantitySold: 2,
                emptiesReturned: 0,
                unitPriceAtSale: 120.00,
                subtotalAmount: 240.00,
              },
            ],
          },
          {
            id: tx2Id,
            transactionNo: 'TEST-TXSYNC-DUP-NO', // Same transactionNo — caught by idempotency pre-check
            customerId: testCustomerId2,
            transactedAt: '2026-10-19T10:05:00.000Z',
            items: [
              {
                productId: lpg11kgProductId,
                quantitySold: 1,
                emptiesReturned: 0,
                unitPriceAtSale: 900.00,
                subtotalAmount: 900.00,
              },
            ],
          },
        ],
      }),
    });

    assert.equal(batchRes.status, 200);
    const batchJson = await batchRes.json();

    // The idempotency pre-check catches the duplicate transactionNo before any DB transaction
    // is opened for the second entry. tx2 is resolved to the existing tx1Id row and counted
    // as ignoredCount=1. No failures. Total result: 1 processed + 1 ignored = 'success'.
    assert.equal(batchJson.status, 'success');
    assert.equal(batchJson.data.processedCount, 1);
    assert.equal(batchJson.data.ignoredCount, 1);
    assert.equal(batchJson.data.failedCount, 0);

    // tx1Id must be in syncedTransactionIds (committed normally)
    assert.ok(batchJson.data.syncedTransactionIds.includes(tx1Id), 'First TX must be in syncedTransactionIds');
    // The first tx1Id should also appear in ignoredTransactionIds because the second entry
    // resolved to it via transactionNo match
    assert.ok(batchJson.data.ignoredTransactionIds.includes(tx1Id), 'Duplicate-no resolution should appear in ignoredTransactionIds');

    // DB: only one record with this transactionNo (the first one)
    const dbCount = (await query(
      `SELECT COUNT(*)::int AS c FROM sales_transactions WHERE transaction_no = 'TEST-TXSYNC-DUP-NO'`
    )).rows[0].c;
    assert.equal(dbCount, 1, 'Only one transaction should be persisted for a duplicate transactionNo batch');

    // Verify it is the first submitted transaction (tx1Id) that was committed
    const committedRow = (await query(
      `SELECT id FROM sales_transactions WHERE transaction_no = 'TEST-TXSYNC-DUP-NO'`
    )).rows[0];
    assert.equal(committedRow.id, tx1Id, 'Only the first transaction UUID should be in the DB');
  });

  // ============================================================
  // Subtest 12: Optional Offline Customer Pre-Ingestion
  // ============================================================
  await t.test('12. Offline Customer Pre-Ingestion - New Customers Created Before Referencing Transactions', async () => {
    // Customer created offline on mobile with a device-generated UUID
    const offlineCustId = crypto.randomUUID();
    const offlineTxId = crypto.randomUUID();

    const preIngestRes = await fetch(`${baseUrl}/api/sales/sync-batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: `mg_sid=${salesPersonCookie}` },
      body: JSON.stringify({
        tripId: testTripId,
        customers: [
          {
            id: offlineCustId,
            businessName: 'TEST-TXSYNC- Offline Sari Sari Store',
            contactPerson: 'TEST-TXSYNC- Pedro Offline',
            contactNumber: '+639171239999',
            deliveryAddress: 'Talomo District, Davao City',
            customerType: 'RETAILER',
          },
        ],
        transactions: [
          {
            id: offlineTxId,
            transactionNo: 'TEST-TXSYNC-OFFLINE-CUST-1',
            customerId: offlineCustId, // References the newly created offline customer
            transactedAt: '2026-10-19T11:00:00.000Z',
            items: [
              {
                productId: butaneProductId,
                quantitySold: 4,
                emptiesReturned: 0,
                unitPriceAtSale: 125.00,
                subtotalAmount: 500.00,
              },
            ],
            invoice: {
              invoiceNumber: 'INV-TEST-TXSYNC-OFFLINE-CUST-1',
              declarationNumber: 'CD-TEST-TXSYNC-OFFLINE-CUST-1',
              totalAmount: 500.00,
              paymentMethod: 'CASH',
            },
          },
        ],
      }),
    });

    assert.equal(preIngestRes.status, 200);
    const preIngestJson = await preIngestRes.json();

    // Should be full success — customer pre-ingested then transaction committed
    assert.equal(preIngestJson.status, 'success');
    assert.equal(preIngestJson.data.processedCount, 1);
    assert.equal(preIngestJson.data.failedCount, 0);
    assert.ok(preIngestJson.data.syncedTransactionIds.includes(offlineTxId));
    assert.ok(preIngestJson.data.syncedCustomerIds.includes(offlineCustId));
    assert.equal(preIngestJson.data.failedCustomers.length, 0);

    // Verify customer exists in DB with correct data
    const custRow = (await query(`SELECT * FROM customers WHERE id = $1`, [offlineCustId])).rows[0];
    assert.ok(custRow, 'Offline customer must exist in customers table');
    assert.equal(custRow.contact_number, '+639171239999');

    // Verify the transaction referencing the offline customer is also persisted
    const txRow = (await query(`SELECT id, customer_id FROM sales_transactions WHERE id = $1`, [offlineTxId])).rows[0];
    assert.ok(txRow, 'Transaction referencing offline customer must exist');
    assert.equal(txRow.customer_id, offlineCustId);

    // Re-submit same payload — customer pre-ingestion must be idempotent (ON CONFLICT DO NOTHING)
    const resubmitRes = await fetch(`${baseUrl}/api/sales/sync-batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: `mg_sid=${salesPersonCookie}` },
      body: JSON.stringify({
        tripId: testTripId,
        customers: [
          {
            id: offlineCustId,
            businessName: 'TEST-TXSYNC- Offline Sari Sari Store',
            contactPerson: 'TEST-TXSYNC- Pedro Offline',
            contactNumber: '+639171239999',
            deliveryAddress: 'Talomo District, Davao City',
            customerType: 'RETAILER',
          },
        ],
        transactions: [
          {
            id: offlineTxId,
            transactionNo: 'TEST-TXSYNC-OFFLINE-CUST-1',
            customerId: offlineCustId,
            transactedAt: '2026-10-19T11:00:00.000Z',
            items: [
              {
                productId: butaneProductId,
                quantitySold: 4,
                emptiesReturned: 0,
                unitPriceAtSale: 125.00,
                subtotalAmount: 500.00,
              },
            ],
          },
        ],
      }),
    });

    assert.equal(resubmitRes.status, 200);
    const resubmitJson = await resubmitRes.json();
    assert.equal(resubmitJson.status, 'success');
    assert.equal(resubmitJson.data.processedCount, 0);
    assert.equal(resubmitJson.data.ignoredCount, 1);
    // The idempotently ignored transaction must still be acknowledged to the mobile client
    assert.ok(resubmitJson.data.syncedTransactionIds.includes(offlineTxId));

    // DB count still = 1 customer
    const custCount = (await query(
      `SELECT COUNT(*)::int AS c FROM customers WHERE id = $1`, [offlineCustId]
    )).rows[0].c;
    assert.equal(custCount, 1, 'Idempotent re-submission must not create duplicate customer');
  });
});
