const tripsService = require('./trips.service');
const { parsePaginationQuery, formatPaginatedEnvelope } = require('../../utils/pagination');

const ALLOWED_TRIP_SORT_FIELDS = {
  departureTime: 't.departure_time',
  departure_time: 't.departure_time',
  createdAt: 't.created_at',
  created_at: 't.created_at',
  status: 't.status',
  tripNumber: 't.trip_number',
  trip_number: 't.trip_number',
};

/**
 * Trips Controller
 * Handles HTTP requests and envelope formatting for trip operations.
 */
class TripsController {
  /**
   * GET /api/trips
   * List trips with filtering and pagination.
   */
  async getAllTrips(req, res) {
    const { status, truckId, salesUserId, driverId, zoneId, startDate, endDate, search } =
      req.query || {};

    const pagination = parsePaginationQuery(req.query, {
      defaultLimit: 20,
      maxLimit: 100,
      defaultSort: 'departureTime',
      defaultOrder: 'DESC',
      allowedSortFields: ALLOWED_TRIP_SORT_FIELDS,
    });

    if (!pagination.isPaginated) {
      const trips = await tripsService.getAllTrips(req.user, {
        status,
        truckId,
        salesUserId,
        driverId,
        zoneId,
        startDate,
        endDate,
        search,
      });

      return res.status(200).json({
        status: 'success',
        data: {
          count: trips.length,
          trips,
        },
      });
    }

    const { items, meta } = await tripsService.getAllTrips(
      req.user,
      { status, truckId, salesUserId, driverId, zoneId, startDate, endDate, search },
      pagination
    );

    return res.status(200).json(formatPaginatedEnvelope(items, meta));
  }

  /**
   * GET /api/trips/:id
   * Retrieve single trip by UUID with loads and reconciliation.
   */
  async getTripById(req, res) {
    try {
      const trip = await tripsService.getTripById(req.params.id, req.user);
      return res.status(200).json({
        status: 'success',
        data: { trip },
      });
    } catch (err) {
      return res.status(err.statusCode || 400).json({
        status: 'fail',
        message: err.message,
      });
    }
  }

  /**
   * POST /api/trips/dispatch
   * Dispatch a delivery truck trip.
   */
  async dispatchTrip(req, res) {
    try {
      const trip = await tripsService.dispatchTrip(req.user, req.body || {});
      return res.status(201).json({
        status: 'success',
        data: { trip },
      });
    } catch (err) {
      return res.status(err.statusCode || 400).json({
        status: 'fail',
        message: err.message,
      });
    }
  }

  /**
   * PATCH /api/trips/:id/cancel
   * Cancel an active or pending trip.
   */
  async cancelTrip(req, res) {
    try {
      const trip = await tripsService.cancelTrip(req.params.id, req.user, req.body || {});
      return res.status(200).json({
        status: 'success',
        data: { trip },
      });
    } catch (err) {
      return res.status(err.statusCode || 400).json({
        status: 'fail',
        message: err.message,
      });
    }
  }

  /**
   * POST /api/trips/:id/loads
   * Record a load transfer slip (reload or return unload).
   */
  async recordTripLoad(req, res) {
    try {
      const load = await tripsService.recordTripLoad(
        req.params.id,
        req.user,
        req.body || {}
      );
      return res.status(201).json({
        status: 'success',
        data: { load },
      });
    } catch (err) {
      return res.status(err.statusCode || 400).json({
        status: 'fail',
        message: err.message,
      });
    }
  }

  /**
   * GET /api/trips/:id/loads
   * List all loads and line items for a trip.
   */
  async getTripLoads(req, res) {
    try {
      const loads = await tripsService.getTripLoads(req.params.id, req.user);
      return res.status(200).json({
        status: 'success',
        data: {
          count: loads.length,
          loads,
        },
      });
    } catch (err) {
      return res.status(err.statusCode || 400).json({
        status: 'fail',
        message: err.message,
      });
    }
  }

  /**
   * POST /api/trips/:id/complete
   * Check in trip at plant with return odometer reading.
   */
  async completeTrip(req, res) {
    try {
      const result = await tripsService.completeTrip(
        req.params.id,
        req.user,
        req.body || {}
      );
      return res.status(200).json({
        status: 'success',
        data: result,
      });
    } catch (err) {
      return res.status(err.statusCode || 400).json({
        status: 'fail',
        message: err.message,
      });
    }
  }

  /**
   * POST /api/trips/:id/reconcile
   * Settle stock and calculate variance.
   */
  async reconcileTrip(req, res) {
    try {
      const reconciliation = await tripsService.reconcileTrip(
        req.params.id,
        req.user,
        req.body || {}
      );
      return res.status(200).json({
        status: 'success',
        data: { reconciliation },
      });
    } catch (err) {
      return res.status(err.statusCode || 400).json({
        status: 'fail',
        message: err.message,
      });
    }
  }

  /**
   * GET /api/trips/:id/reconciliation
   * Retrieve reconciliation breakdown.
   */
  async getTripReconciliation(req, res) {
    try {
      const reconciliation = await tripsService.getTripReconciliation(
        req.params.id,
        req.user
      );
      return res.status(200).json({
        status: 'success',
        data: { reconciliation },
      });
    } catch (err) {
      return res.status(err.statusCode || 400).json({
        status: 'fail',
        message: err.message,
      });
    }
  }
}

module.exports = new TripsController();
