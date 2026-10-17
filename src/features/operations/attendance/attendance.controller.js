const attendanceService = require('./attendance.service');
const { parsePaginationQuery, formatPaginatedEnvelope } = require('../../../utils/pagination');

/**
 * Attendance Controller
 * Handles HTTP requests, parameter parsing, and JSON envelope formatting for duty attendance.
 */
class AttendanceController {
  /**
   * POST /api/operations/attendance/clock-in & POST /api/attendance/clock-in
   */
  async clockIn(req, res) {
    const data = await attendanceService.clockIn(req.user, req.body || {});
    return res.status(201).json({
      status: 'success',
      message: 'Clock-in recorded successfully.',
      data,
    });
  }

  /**
   * POST /api/operations/attendance/clock-out & POST /api/attendance/clock-out
   */
  async clockOut(req, res) {
    const data = await attendanceService.clockOut(req.user, req.body || {});
    return res.status(200).json({
      status: 'success',
      message: 'Clock-out recorded successfully.',
      data,
    });
  }

  /**
   * GET /api/operations/attendance/active & GET /api/attendance/active
   */
  async getActiveDutyCycle(req, res) {
    const data = await attendanceService.getActiveDutyCycle(req.user, req.query?.userId);
    return res.status(200).json({
      status: 'success',
      data,
    });
  }

  /**
   * GET /api/operations/attendance & GET /api/attendance
   */
  async getAttendanceLogs(req, res) {
    const { userId, role, status, startDate, endDate } = req.query || {};

    const pagination = parsePaginationQuery(req.query, {
      defaultLimit: 20,
      maxLimit: 100,
      defaultSort: 'clockInTime',
      defaultOrder: 'DESC',
    });

    if (!pagination.isPaginated) {
      const records = await attendanceService.getAttendanceLogs(
        req.user,
        { userId, role, status, startDate, endDate },
        null
      );
      return res.status(200).json({
        status: 'success',
        data: {
          count: records.length,
          records,
        },
      });
    }

    const { items, meta } = await attendanceService.getAttendanceLogs(
      req.user,
      { userId, role, status, startDate, endDate },
      pagination
    );

    return res.status(200).json(formatPaginatedEnvelope(items, meta));
  }
}

module.exports = new AttendanceController();
