const syncService = require('./sync.service');

/**
 * Sync Controller
 * Handles HTTP requests, parameter extraction, and status formatting for batch synchronization.
 */
class SyncController {
  async syncBatch(req, res) {
    try {
      const result = await syncService.processBatchSync(req.user, req.body || {});
      return res.status(200).json({
        status: 'success',
        data: result,
      });
    } catch (err) {
      const isNotFound = err.message === 'Trip not found' || err.message === 'Customer not found';
      return res.status(err.statusCode || (isNotFound ? 404 : 400)).json({
        status: 'fail',
        message: err.message,
      });
    }
  }
}

module.exports = new SyncController();
