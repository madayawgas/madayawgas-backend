const syncService = require('./sync.service');

/**
 * Sync Controller
 * Handles HTTP requests, parameter extraction, and status formatting for batch synchronization.
 * Returns HTTP 200 for all valid payload structures, with top-level `status` field reflecting
 * the itemized ingestion outcome:
 *   - "success"        → All transactions committed (failedCount === 0)
 *   - "partial_success"→ Some committed, some quarantined (failedCount > 0 && processedCount/ignoredCount > 0)
 *   - "fail"           → All transactions failed (failedCount > 0 && processedCount + ignoredCount === 0)
 *
 * HTTP 400 / 404 is reserved for batch-level fatal errors (missing tripId, non-array payload, trip not found).
 */
class SyncController {
  async syncBatch(req, res) {
    try {
      const result = await syncService.processBatchSync(req.user, req.body || {});
      return res.status(200).json({
        status: result.syncStatus,
        data: result,
      });
    } catch (err) {
      const statusCode = err.statusCode || (err.message === 'Trip not found' ? 404 : 400);
      return res.status(statusCode).json({
        status: 'fail',
        message: err.message,
      });
    }
  }
}

module.exports = new SyncController();
