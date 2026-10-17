const fuelService = require('./fuel.service');
const { parsePaginationQuery, formatPaginatedEnvelope } = require('../../../utils/pagination');

/**
 * Fuel Controller
 * Handles HTTP requests, parameter parsing, and envelope responses for vehicle fuel logs.
 */
class FuelController {
  /**
   * POST /api/operations/fuel
   */
  async recordFuelEntry(req, res) {
    const data = await fuelService.recordFuelEntry(req.user, req.body || {});
    return res.status(201).json({
      status: 'success',
      message: 'Vehicle fuel intake recorded successfully.',
      data,
    });
  }

  /**
   * GET /api/operations/fuel/summary
   */
  async getFuelSummary(req, res) {
    const { vehicleId, driverId, tripId, fuelType, startDate, endDate, search } = req.query || {};
    const summary = await fuelService.getFuelSummary(
      req.user,
      { vehicleId, driverId, tripId, fuelType, startDate, endDate, search }
    );
    return res.status(200).json({
      status: 'success',
      data: {
        ...summary,
        summary,
      },
    });
  }

  /**
   * GET /api/operations/fuel/:id
   */
  async getFuelLogById(req, res) {
    const data = await fuelService.getFuelLogById(req.params.id, req.user);
    return res.status(200).json({
      status: 'success',
      data,
    });
  }

  /**
   * GET /api/operations/fuel
   */
  async getFuelLogs(req, res) {
    const { vehicleId, driverId, tripId, fuelType, startDate, endDate, search } = req.query || {};

    const pagination = parsePaginationQuery(req.query, {
      defaultLimit: 20,
      maxLimit: 100,
      defaultSort: 'fueledAt',
      defaultOrder: 'DESC',
    });

    if (!pagination.isPaginated) {
      const { items, summary } = await fuelService.getFuelLogs(
        req.user,
        { vehicleId, driverId, tripId, fuelType, startDate, endDate, search },
        null
      );
      return res.status(200).json({
        status: 'success',
        data: {
          count: items.length,
          summary,
          logs: items,
        },
      });
    }

    const { items, meta, summary } = await fuelService.getFuelLogs(
      req.user,
      { vehicleId, driverId, tripId, fuelType, startDate, endDate, search },
      pagination
    );

    const envelope = formatPaginatedEnvelope(items, meta);
    envelope.summary = summary;

    return res.status(200).json(envelope);
  }
}

module.exports = new FuelController();
