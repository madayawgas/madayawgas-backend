const crypto = require('crypto');
const { pool } = require('../../../../database/connection');
const { historyService } = require('../../history');
const { EVENTS } = require('../../history/history.events');
const { safeEmitSocketEvent } = require('../../../socket');

/**
 * Sync Service
 * Encapsulates the store-and-forward batch sync engine for offline mobile registers:
 * - Idempotent transaction ingestion (ON CONFLICT (id) DO NOTHING)
 * - Automatic canister debt calculation and append-only ledger rows
 * - Permissive ingestion (never rejecting offline sales due to negative vehicle inventory)
 * - Dual-clock recording (transacted_at vs synced_at)
 */
class SyncService {
  /**
   * Process a batch of offline mobile sales transactions.
   * @param {Object} actorUser - Authenticated user context
   * @param {Object} syncPayload - { tripId, transactions: [...] }
   * @returns {Promise<Object>} Ingestion summary with processed IDs and status
   */
  async processBatchSync(actorUser, syncPayload = {}) {
    const { tripId, trip_id, transactions, batches, items: rootItems } = syncPayload;
    const resolvedTripId = tripId || trip_id;
    const rawList = Array.isArray(transactions)
      ? transactions
      : (Array.isArray(batches) ? batches : (Array.isArray(rootItems) ? rootItems : null));

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

    const client = await pool.connect();

    try {
      // 1. Verify trip existence
      const tripRes = await client.query(
        `SELECT id, trip_number FROM trips WHERE id = $1`,
        [resolvedTripId]
      );

      if (tripRes.rows.length === 0) {
        const err = new Error('Trip not found');
        err.statusCode = 404;
        throw err;
      }

      const trip = tripRes.rows[0];

      await client.query('BEGIN');

      let processedCount = 0;
      let ignoredCount = 0;
      const transactionIds = [];

      for (const entry of rawList) {
        const tx = entry.payload || entry;
        const txId = tx.id || crypto.randomUUID();
        const txNo = tx.transactionNo || tx.transaction_no || tx.order_number || tx.orderNumber;
        const customerId = tx.customerId || tx.customer_id;

        if (!txNo) {
          throw new Error('Transaction number is required for each transaction');
        }

        if (!customerId) {
          throw new Error(`Customer ID is required for transaction #${txNo}`);
        }

        // Idempotency check: see if transaction already exists
        const existingTxRes = await client.query(
          `SELECT id FROM sales_transactions WHERE id = $1 OR transaction_no = $2`,
          [txId, txNo]
        );

        if (existingTxRes.rows.length > 0) {
          ignoredCount++;
          continue;
        }

        const transactedAt = tx.transactedAt || tx.transacted_at || tx.ordered_at || tx.created_at || new Date().toISOString();

        // 2. Insert sales transaction header
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
          ignoredCount++;
          continue;
        }

        // 3. Insert transaction line items & evaluate canister receivables deltas
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

        // 4. Insert sales invoice if provided
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
          const paymentProof = inv.paymentProofKey || inv.payment_proof_key || null;

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

        processedCount++;
        transactionIds.push(txId);
      }

      await client.query('COMMIT');

      // 5. Centralized Audit History & Real-Time WebSocket Broadcast
      if (processedCount > 0) {
        safeEmitSocketEvent('SALES_BATCH_SYNCED', {
          tripId: resolvedTripId,
          tripNumber: trip.trip_number,
          processedCount,
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
          },
          metadata: {
            tripId: resolvedTripId,
            processedCount,
            ignoredCount,
            totalSubmitted: transactions.length,
          },
        });
      }

      return {
        tripId: resolvedTripId,
        processedCount,
        ignoredCount,
        totalTransactions: processedCount + ignoredCount,
        transactionIds,
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}

module.exports = new SyncService();
