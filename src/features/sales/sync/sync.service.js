const crypto = require('crypto');
const { pool } = require('../../../../database/connection');
const { historyService } = require('../../history');
const { EVENTS } = require('../../history/history.events');
const { safeEmitSocketEvent } = require('../../../socket');
const { extractStorageKey } = require('../../media');

// ============================================================
// Standardized Sync Error Code Classifier
// ============================================================

/**
 * Maps a raw database or validation error to a standardized errorCode
 * and a clean, human-readable errorMessage for the mobile client.
 * @param {Error} err - The caught error
 * @param {string} context - A human-readable hint about where the error occurred
 * @returns {{ errorCode: string, errorMessage: string, details: string }}
 */
function classifySyncError(err, context = '') {
  const msg = err.message || '';
  const detail = context ? `${context}: ${msg}` : msg;

  // Deterministic validation failures (no point retrying)
  if (msg.includes('Transaction number is required') || msg.includes('Customer ID is required') || msg.includes('invalid input syntax for type uuid')) {
    return {
      errorCode: 'INVALID_TRANSACTION_HEADER',
      errorMessage: msg,
      details: detail,
    };
  }

  if (msg.includes('violates foreign key constraint') && msg.includes('customer')) {
    return {
      errorCode: 'INVALID_CUSTOMER_ID',
      errorMessage: 'Customer UUID does not exist in the master customer database',
      details: detail,
    };
  }

  if (msg.includes('Product ID is required')) {
    return {
      errorCode: 'INVALID_ITEM_PAYLOAD',
      errorMessage: msg,
      details: detail,
    };
  }

  if (msg.includes('violates foreign key constraint') && msg.includes('product')) {
    return {
      errorCode: 'INVALID_ITEM_PAYLOAD',
      errorMessage: 'Product UUID does not exist in the product catalog',
      details: detail,
    };
  }

  if (msg.includes('violates check constraint') && msg.includes('payment_method')) {
    return {
      errorCode: 'INVALID_INVOICE_PAYLOAD',
      errorMessage: 'Payment method must be CASH or GCASH',
      details: detail,
    };
  }

  if (msg.includes('violates check constraint') && (msg.includes('quantity') || msg.includes('amount'))) {
    return {
      errorCode: 'INVALID_ITEM_PAYLOAD',
      errorMessage: 'Line item quantity or amount violates constraints (must be >= 0)',
      details: detail,
    };
  }

  if (msg.includes('CHK_canister_ledger_net_balance') || msg.includes('canister_ledger')) {
    return {
      errorCode: 'CANISTER_LEDGER_ERROR',
      errorMessage: 'Canister ledger arithmetic check failed — recalculate net balance on device',
      details: detail,
    };
  }

  if (msg.includes('duplicate key') && (msg.includes('transaction_no') || msg.includes('invoice_number'))) {
    return {
      errorCode: 'DUPLICATE_ORDER_CONFLICT',
      errorMessage: 'A transaction or invoice with this number already exists under a different UUID',
      details: detail,
    };
  }

  // Transient / unexpected DB failures — client should retry up to threshold
  return {
    errorCode: 'DB_CONSTRAINT_ERROR',
    errorMessage: msg,
    details: detail,
  };
}

/**
 * Sync Service
 * Encapsulates the store-and-forward batch sync engine for offline mobile registers:
 * - Optional offline customer pre-ingestion before transaction processing
 * - Itemized per-order transaction isolation (eliminates Head-of-Line blocking)
 * - Idempotent transaction ingestion (ON CONFLICT (id) DO NOTHING) with full acknowledgment
 * - Automatic canister debt calculation and append-only ledger rows
 * - Permissive ingestion (never rejecting offline sales due to negative vehicle inventory)
 * - Dual-clock recording (transacted_at vs synced_at)
 * - Structured partial-acknowledgment response with per-item error codes
 */
class SyncService {
  /**
   * Process a batch of offline mobile sales transactions with itemized isolation.
   * Each transaction is committed in its own independent BEGIN…COMMIT block so that
   * one malformed order never rolls back the surrounding valid orders.
   *
   * @param {Object} actorUser - Authenticated user context
   * @param {Object} syncPayload - { tripId, customers?: [...], transactions: [...] }
   * @returns {Promise<Object>} Structured partial-acknowledgment summary
   */
  async processBatchSync(actorUser, syncPayload = {}) {
    const { tripId, trip_id, transactions, batches, items: rootItems, customers: offlineCustomers } = syncPayload;
    const resolvedTripId = tripId || trip_id;
    const rawList = Array.isArray(transactions)
      ? transactions
      : (Array.isArray(batches) ? batches : (Array.isArray(rootItems) ? rootItems : null));

    // ── Batch-level validation (fatal: return 400/404 immediately) ──
    if (!resolvedTripId || typeof resolvedTripId !== 'string') {
      const err = new Error('Trip ID is required');
      err.statusCode = 400;
      throw err;
    }

    if (!Array.isArray(rawList)) {
      const err = new Error('Transactions must be an array');
      err.statusCode = 400;
      throw err;
    }

    // ── Check trip existence before acquiring a long-lived client ──
    const tripCheck = await pool.query(
      `SELECT id, trip_number FROM trips WHERE id = $1`,
      [resolvedTripId]
    );
    if (tripCheck.rows.length === 0) {
      const err = new Error('Trip not found');
      err.statusCode = 404;
      throw err;
    }
    const trip = tripCheck.rows[0];

    // ── Acquire a single pooled client for the entire batch lifecycle ──
    const client = await pool.connect();

    // Itemized result accumulators
    const syncedTransactionIds = [];
    const ignoredTransactionIds = [];
    const failedTransactions = [];
    const syncedCustomerIds = [];
    const failedCustomers = [];
    let processedCount = 0;
    let ignoredCount = 0;

    try {
      // ──────────────────────────────────────────────────────────────
      // Phase 1: Optional Offline Customer Pre-Ingestion
      // Registers new customer profiles created on the device before
      // processing transactions that reference them. Each customer
      // gets its own isolated transaction so a bad customer record
      // never blocks valid customer inserts.
      // ──────────────────────────────────────────────────────────────
      if (Array.isArray(offlineCustomers) && offlineCustomers.length > 0) {
        for (const cust of offlineCustomers) {
          const custId = cust.id || crypto.randomUUID();

          try {
            await client.query('BEGIN');

            const insertCustomerSql = `
              INSERT INTO customers (
                id,
                customer_type,
                business_name,
                contact_person,
                contact_number,
                alternate_contact_number,
                tin,
                delivery_address,
                zone_id,
                created_by,
                is_active
              )
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, TRUE)
              ON CONFLICT (id) DO NOTHING
              RETURNING id;
            `;

            const customerType = (cust.customerType || cust.customer_type || 'COMMERCIAL').toUpperCase();
            const businessName = cust.businessName || cust.business_name || null;
            const contactPerson = cust.contactPerson || cust.contact_person || businessName || 'Customer';
            const contactNumber = cust.contactNumber || cust.contact_number || null;
            const altContact = cust.alternateContactNumber || cust.alternate_contact_number || null;
            const tin = cust.tin || null;
            const deliveryAddress = cust.deliveryAddress || cust.delivery_address || cust.address || '';
            const zoneId = cust.zoneId || cust.zone_id || null;
            const createdBy = actorUser?.id || null;

            await client.query(insertCustomerSql, [
              custId,
              customerType,
              businessName,
              contactPerson,
              contactNumber,
              altContact,
              tin,
              deliveryAddress,
              zoneId,
              createdBy,
            ]);

            await client.query('COMMIT');
            syncedCustomerIds.push(custId);
          } catch (custErr) {
            await client.query('ROLLBACK');
            const classified = classifySyncError(custErr, `Customer ID ${custId}`);
            failedCustomers.push({
              id: custId,
              ...classified,
            });
          }
        }
      }

      // ──────────────────────────────────────────────────────────────
      // Phase 2: Itemized Transaction Ingestion
      // Each order gets its own BEGIN…COMMIT block. Errors in one
      // order roll back only that order; all previously committed
      // orders remain in the database.
      // ──────────────────────────────────────────────────────────────
      for (const entry of rawList) {
        const tx = entry.payload || entry;
        const txId = tx.id || crypto.randomUUID();
        const txNo = tx.transactionNo || tx.transaction_no || tx.order_number || tx.orderNumber;
        const customerId = tx.customerId || tx.customer_id;

        // ── Itemized validation: if header is fundamentally broken, fail
        //    this item without touching the DB at all ──
        if (!txNo) {
          failedTransactions.push({
            id: txId,
            transactionNo: null,
            errorCode: 'INVALID_TRANSACTION_HEADER',
            errorMessage: 'Transaction number is required for each transaction',
            details: `Entry at index ${rawList.indexOf(entry)} has no transactionNo`,
          });
          continue;
        }

        if (!customerId) {
          failedTransactions.push({
            id: txId,
            transactionNo: txNo,
            errorCode: 'INVALID_TRANSACTION_HEADER',
            errorMessage: `Customer ID is required for transaction #${txNo}`,
            details: `Transaction #${txNo} is missing customerId`,
          });
          continue;
        }

        // ── Idempotency pre-check (outside transaction — fast path) ──
        const existingTxRes = await client.query(
          `SELECT id FROM sales_transactions WHERE id = $1 OR transaction_no = $2`,
          [txId, txNo]
        );

        if (existingTxRes.rows.length > 0) {
          // Transaction already exists — acknowledge it idempotently so the
          // mobile SQLite queue can safely remove it from the outbound buffer.
          const existingId = existingTxRes.rows[0].id;
          ignoredCount++;
          syncedTransactionIds.push(existingId);
          ignoredTransactionIds.push(existingId);
          continue;
        }

        // ── Per-order transaction isolation ──
        try {
          await client.query('BEGIN');

          const transactedAt = tx.transactedAt || tx.transacted_at || tx.ordered_at || tx.created_at || new Date().toISOString();

          // 1. Insert sales transaction header
          const insertTxSql = `
            INSERT INTO sales_transactions (
              id,
              transaction_no,
              trip_id,
              customer_id,
              recorded_by,
              status,
              transacted_at,
              synced_at,
              created_at,
              updated_at
            )
            VALUES ($1, $2, $3, $4, $5, 'COMPLETED', $6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            ON CONFLICT (id) DO NOTHING
            RETURNING id;
          `;

          const txInsertRes = await client.query(insertTxSql, [
            txId,
            txNo,
            resolvedTripId,
            customerId,
            actorUser?.id || null,
            transactedAt,
          ]);

          if (txInsertRes.rows.length === 0) {
            // Race: another worker committed the same UUID between our pre-check and BEGIN.
            // Count as idempotently acknowledged.
            await client.query('COMMIT');
            ignoredCount++;
            syncedTransactionIds.push(txId);
            ignoredTransactionIds.push(txId);
            continue;
          }

          // 2. Insert transaction line items & evaluate canister receivables deltas
          const items = Array.isArray(tx.items)
            ? tx.items
            : (Array.isArray(tx.order_items) ? tx.order_items : (Array.isArray(tx.line_items) ? tx.line_items : []));

          for (const item of items) {
            const itemId = item.id || crypto.randomUUID();
            const productId = item.productId || item.product_id;
            const quantitySold = parseInt(
              item.quantitySold !== undefined ? item.quantitySold : (item.quantity_sold !== undefined ? item.quantity_sold : (item.quantity !== undefined ? item.quantity : item.qty)),
              10
            ) || 0;
            const emptiesReturned = parseInt(
              item.emptiesReturned !== undefined ? item.emptiesReturned : (item.empties_returned !== undefined ? item.empties_returned : (item.emptiesReturnedCount !== undefined ? item.emptiesReturnedCount : item.empties_returned_count)),
              10
            ) || 0;
            const emptiesDefective = parseInt(
              item.emptiesDefective !== undefined ? item.emptiesDefective : (item.empties_defective !== undefined ? item.empties_defective : 0),
              10
            ) || 0;
            const unitPrice = Number(
              item.unitPriceAtSale !== undefined ? item.unitPriceAtSale : (item.unit_price_at_sale !== undefined ? item.unit_price_at_sale : (item.unitPrice !== undefined ? item.unitPrice : item.unit_price))
            ) || 0;
            const subtotal = Number(
              item.subtotalAmount !== undefined ? item.subtotalAmount : (item.subtotal_amount !== undefined ? item.subtotal_amount : (item.totalPrice !== undefined ? item.totalPrice : item.total_price))
            ) || (quantitySold * unitPrice);

            if (!productId) {
              throw new Error(`Product ID is required for line item in transaction #${txNo}`);
            }

            // Insert line item
            const insertItemSql = `
              INSERT INTO sales_transaction_items (
                id,
                transaction_id,
                product_id,
                quantity_sold,
                empties_returned,
                empties_defective,
                unit_price_at_sale,
                subtotal_amount,
                created_at
              )
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP)
              ON CONFLICT (id) DO NOTHING;
            `;

            await client.query(insertItemSql, [
              itemId,
              txId,
              productId,
              quantitySold,
              emptiesReturned,
              emptiesDefective,
              unitPrice,
              subtotal,
            ]);

            // Append-only canister receivables ledger
            const quantityLoaned = Math.max(0, quantitySold - emptiesReturned);
            const quantityReturned = Math.max(0, emptiesReturned - quantitySold);
            const netBalanceChange = quantityLoaned - quantityReturned;

            if (quantityLoaned > 0 || quantityReturned > 0) {
              const ledgerId = item.canisterLedgerId || item.canister_ledger_id || crypto.randomUUID();

              const insertLedgerSql = `
                INSERT INTO canister_ledger (
                  id,
                  customer_id,
                  product_id,
                  trip_id,
                  transaction_id,
                  quantity_loaned,
                  quantity_returned,
                  net_balance_change,
                  transacted_at,
                  synced_at,
                  created_at
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                ON CONFLICT (id) DO NOTHING;
              `;

              await client.query(insertLedgerSql, [
                ledgerId,
                customerId,
                productId,
                resolvedTripId,
                txId,
                quantityLoaned,
                quantityReturned,
                netBalanceChange,
                transactedAt,
              ]);
            }
          }

          // 3. Insert sales invoice if provided
          const inv = tx.invoice;
          if (inv) {
            const invId = inv.id || crypto.randomUUID();
            const invoiceNumber = inv.invoiceNumber || inv.invoice_number || `INV-${txNo}`;
            const declarationNumber = inv.declarationNumber || inv.declaration_number || `CD-${txNo}`;
            const totalAmount = Number(
              inv.totalAmount !== undefined ? inv.totalAmount : inv.total_amount
            ) || 0;
            const paymentMethod = (inv.paymentMethod || inv.payment_method || 'CASH').toUpperCase();
            const paymentStatus = (inv.paymentStatus || inv.payment_status || 'PAID_UNVERIFIED').toUpperCase();
            const paymentRef = inv.paymentReferenceNumber || inv.payment_reference_number || null;
            const rawProof = inv.paymentProofKey || inv.payment_proof_key || null;
            const paymentProof = rawProof ? (extractStorageKey(rawProof) || rawProof) : null;

            const insertInvoiceSql = `
              INSERT INTO sales_invoices (
                id,
                transaction_id,
                invoice_number,
                declaration_number,
                total_amount,
                payment_method,
                payment_status,
                payment_reference_number,
                payment_proof_key,
                transacted_at,
                synced_at,
                created_at,
                updated_at
              )
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
              ON CONFLICT (id) DO NOTHING;
            `;

            await client.query(insertInvoiceSql, [
              invId,
              txId,
              invoiceNumber,
              declarationNumber,
              totalAmount,
              paymentMethod,
              paymentStatus,
              paymentRef,
              paymentProof,
              transactedAt,
            ]);
          }

          await client.query('COMMIT');

          processedCount++;
          syncedTransactionIds.push(txId);

        } catch (itemErr) {
          // Roll back only this order — all previously committed orders survive
          await client.query('ROLLBACK');

          const classified = classifySyncError(itemErr, `Transaction #${txNo}`);
          failedTransactions.push({
            id: txId,
            transactionNo: txNo,
            ...classified,
          });
        }
      }
    } finally {
      client.release();
    }

    // ── Phase 3: Audit History & Real-Time WebSocket Broadcast ──
    const failedCount = failedTransactions.length;
    const totalSubmitted = rawList.length;
    const totalTransactions = processedCount + ignoredCount;

    if (processedCount > 0 || ignoredCount > 0) {
      safeEmitSocketEvent('SALES_BATCH_SYNCED', {
        tripId: resolvedTripId,
        tripNumber: trip.trip_number,
        processedCount,
        ignoredCount,
        failedCount,
        syncedAt: new Date().toISOString(),
      }, 'room:sales');

      await historyService.log(EVENTS.SALES_BATCH_SYNCED, {
        actorUser,
        targetId: resolvedTripId,
        payload: {
          tripId: resolvedTripId,
          tripNumber: trip.trip_number,
          count: processedCount,
          processedCount,
          failedCount,
        },
        metadata: {
          tripId: resolvedTripId,
          processedCount,
          ignoredCount,
          failedCount,
          totalSubmitted,
        },
      });
    }

    // ── Determine top-level status for controller ──
    let syncStatus;
    if (failedCount === 0) {
      syncStatus = 'success';
    } else if (processedCount > 0 || ignoredCount > 0) {
      syncStatus = 'partial_success';
    } else {
      syncStatus = 'fail';
    }

    return {
      syncStatus,
      tripId: resolvedTripId,
      summary: {
        totalSubmitted,
        processed: processedCount,
        ignored: ignoredCount,
        failed: failedCount,
      },
      // Legacy-compatible flat fields
      processedCount,
      ignoredCount,
      failedCount,
      totalTransactions,
      // Itemized acknowledgment arrays for mobile sync queue binding
      transactionIds: syncedTransactionIds.filter((id) => !ignoredTransactionIds.includes(id)),
      syncedTransactionIds,
      ignoredTransactionIds,
      syncedCustomerIds,
      failedTransactions,
      failedCustomers,
    };
  }
}

module.exports = new SyncService();
