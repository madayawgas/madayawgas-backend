const dashboardService = require('./dashboard.service');

/**
 * Dashboard Controller
 */
class DashboardController {
  /**
   * GET /api/dashboard/overview
   */
  async getOverview(req, res) {
    const data = await dashboardService.getOverview();
    return res.status(200).json({
      status: 'success',
      data,
    });
  }
}

module.exports = new DashboardController();
