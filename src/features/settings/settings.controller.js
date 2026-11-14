const settingsService = require('./settings.service');

/**
 * HTTP Controller for Admin-only Business System Settings.
 */
class SettingsController {
  /**
   * GET /api/settings
   */
  async listSettings(req, res) {
    const { category } = req.query || {};
    const settings = await settingsService.listSettings({ category });

    return res.status(200).json({
      status: 'success',
      data: { settings },
    });
  }

  /**
   * GET /api/settings/:key
   */
  async getSettingByKey(req, res) {
    const setting = await settingsService.getSettingByKey(req.params.key);

    return res.status(200).json({
      status: 'success',
      data: { setting },
    });
  }

  /**
   * PATCH /api/settings/:key
   */
  async updateSetting(req, res) {
    const { value } = req.body || {};
    const setting = await settingsService.updateSetting(req.params.key, value, req.user);

    return res.status(200).json({
      status: 'success',
      message: `System setting '${setting.key}' updated successfully.`,
      data: { setting },
    });
  }
}

module.exports = new SettingsController();
