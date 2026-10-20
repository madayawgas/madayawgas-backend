const express = require('express');
const router = express.Router();
const attendanceController = require('./attendance.controller');
const { authenticate, requirePermission } = require('../../../middleware/auth.middleware');
const asyncHandler = require('../../../utils/asyncHandler');

// ============================================================
// Duty Attendance Routes
// Base Path (when mounted): /api/operations/attendance or /api/attendance
// ============================================================

/**
 * POST /clock-in
 * Records clock-in event for authenticated user (or on behalf if attendance.manage).
 */
router.post(
  '/clock-in',
  authenticate,
  requirePermission('attendance.record'),
  asyncHandler(attendanceController.clockIn.bind(attendanceController))
);

/**
 * POST /clock-out
 * Closes an active duty cycle and computes elapsed shift duration.
 */
router.post(
  '/clock-out',
  authenticate,
  requirePermission('attendance.record'),
  asyncHandler(attendanceController.clockOut.bind(attendanceController))
);

/**
 * GET /active
 * Returns current open duty shift with live elapsed minutes.
 */
router.get(
  '/active',
  authenticate,
  requirePermission(['attendance.view', 'attendance.view_own', 'attendance.record']),
  asyncHandler(attendanceController.getActiveDutyCycle.bind(attendanceController))
);

/**
 * GET /
 * Retrieves paginated attendance shift logs with server-side filters.
 */
router.get(
  '/',
  authenticate,
  requirePermission(['attendance.view', 'attendance.view_own']),
  asyncHandler(attendanceController.getAttendanceLogs.bind(attendanceController))
);

module.exports = router;
