const attendanceRepository = require('./attendance.repository');
const usersRepository = require('../../users/users.repository');
const { historyService, EVENTS } = require('../../history');
const { calculateOffset, buildPaginationMeta } = require('../../../utils/pagination');

/**
 * Formats duration in minutes into a structured object and human-readable string.
 * @param {number} minutes
 * @returns {{ totalMinutes: number, hours: number, minutes: number, formatted: string }}
 */
function formatDuration(minutes) {
  const total = Math.max(0, Number(minutes) || 0);
  const hours = Math.floor(total / 60);
  const mins = total % 60;
  return {
    totalMinutes: total,
    hours,
    minutes: mins,
    formatted: `${hours}h ${mins}m`,
  };
}

/**
 * Formats raw attendance database row into clean API DTO.
 */
function formatAttendanceRecord(row) {
  if (!row) return null;

  const clockInTime = new Date(row.clock_in_time);
  const clockOutTime = row.clock_out_time ? new Date(row.clock_out_time) : null;

  let durationMinutes = row.duration_minutes;
  if (durationMinutes === null || durationMinutes === undefined) {
    if (clockOutTime) {
      durationMinutes = Math.max(0, Math.round((clockOutTime.getTime() - clockInTime.getTime()) / 60000));
    } else {
      // Live dynamic duration for ongoing active shifts
      durationMinutes = Math.max(0, Math.round((Date.now() - clockInTime.getTime()) / 60000));
    }
  }

  const duration = formatDuration(durationMinutes);

  return {
    id: row.id,
    userId: row.user_id,
    user: {
      id: row.user_id,
      username: row.username,
      firstName: row.first_name,
      lastName: row.last_name,
      fullName: [row.first_name, row.last_name].filter(Boolean).join(' ') || row.username,
      phone: row.phone,
      role: row.role_name,
    },
    clockInTime: row.clock_in_time,
    clockOutTime: row.clock_out_time,
    clockInRecordedBy: row.clock_in_recorded_by,
    clockInRecordedByName: row.clock_in_recorded_by_username || null,
    clockOutRecordedBy: row.clock_out_recorded_by,
    clockOutRecordedByName: row.clock_out_recorded_by_username || null,
    clockInNotes: row.clock_in_notes,
    clockOutNotes: row.clock_out_notes,
    durationMinutes: duration.totalMinutes,
    durationFormatted: duration.formatted,
    duration,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Duty Attendance Service
 * Encapsulates domain invariants, active shift uniqueness, elapsed shift math,
 * and centralized audit event logging.
 */
class AttendanceService {
  /**
   * Records a clock-in event for the authenticated user or an employee on behalf.
   *
   * @param {Object} actorUser - Authenticated user context
   * @param {Object} payload - { userId, clockInTime, notes }
   * @returns {Promise<Object>} Created attendance record DTO
   */
  async clockIn(actorUser, payload = {}) {
    const permissions = actorUser?.permissions || [];
    const hasManage = permissions.includes('attendance.manage') || permissions.includes('users.manage');

    const rawTarget = payload.userId || payload.targetUserId;
    const targetUserId = rawTarget && typeof rawTarget === 'string' && rawTarget.trim().length > 0
      ? rawTarget.trim()
      : actorUser.id;

    if (targetUserId !== actorUser.id && !hasManage) {
      const err = new Error('Access denied: You are not authorized to record attendance on behalf of other personnel');
      err.statusCode = 403;
      throw err;
    }

    // Verify target user exists and is active
    const targetUser = await usersRepository.findUserById(targetUserId);
    if (!targetUser) {
      const err = new Error('User not found');
      err.statusCode = 404;
      throw err;
    }

    if (!targetUser.is_active || targetUser.is_blocked) {
      const err = new Error('Cannot record attendance for an inactive or blocked user account');
      err.statusCode = 400;
      throw err;
    }

    // Enforce Duty Cycle Integrity: User cannot initiate new clock-in if an active cycle is open
    const openCycle = await attendanceRepository.getActiveDutyCycle(targetUserId);
    if (openCycle) {
      const err = new Error('User already has an active open duty cycle. Clock-out is required before initiating a new shift.');
      err.statusCode = 400;
      err.code = 'OPEN_DUTY_CYCLE_EXISTS';
      throw err;
    }

    let parsedClockIn = null;
    if (payload.clockInTime) {
      parsedClockIn = new Date(payload.clockInTime);
      if (isNaN(parsedClockIn.getTime())) {
        const err = new Error('Invalid clock-in timestamp format');
        err.statusCode = 400;
        throw err;
      }
    }

    const created = await attendanceRepository.createClockIn({
      userId: targetUserId,
      clockInTime: parsedClockIn ? parsedClockIn.toISOString() : null,
      clockInRecordedBy: actorUser.id,
      clockInNotes: payload.notes || payload.clockInNotes || null,
    });

    const fullRecord = await attendanceRepository.getAttendanceById(created.id);
    const dto = formatAttendanceRecord(fullRecord);

    await historyService.log(EVENTS.ATTENDANCE_CLOCKED_IN, {
      actorUser,
      targetId: created.id,
      payload: {
        name: dto.user.fullName,
        username: dto.user.username,
      },
      metadata: {
        attendanceId: created.id,
        targetUserId,
        clockInTime: created.clock_in_time,
        onBehalf: targetUserId !== actorUser.id,
      },
    });

    return dto;
  }

  /**
   * Records a clock-out event for an active duty cycle.
   *
   * @param {Object} actorUser - Authenticated user context
   * @param {Object} payload - { userId, attendanceId, clockOutTime, notes }
   * @returns {Promise<Object>} Completed attendance record DTO
   */
  async clockOut(actorUser, payload = {}) {
    const permissions = actorUser?.permissions || [];
    const hasManage = permissions.includes('attendance.manage') || permissions.includes('users.manage');

    let activeCycle = null;

    if (payload.attendanceId && typeof payload.attendanceId === 'string') {
      activeCycle = await attendanceRepository.getAttendanceById(payload.attendanceId.trim());
      if (activeCycle && activeCycle.status !== 'ACTIVE') {
        const err = new Error('Specified duty cycle is already closed or voided');
        err.statusCode = 400;
        throw err;
      }
    } else {
      const rawTarget = payload.userId || payload.targetUserId;
      const targetUserId = rawTarget && typeof rawTarget === 'string' && rawTarget.trim().length > 0
        ? rawTarget.trim()
        : actorUser.id;

      if (targetUserId !== actorUser.id && !hasManage) {
        const err = new Error('Access denied: You are not authorized to clock out on behalf of other personnel');
        err.statusCode = 403;
        throw err;
      }

      activeCycle = await attendanceRepository.getActiveDutyCycle(targetUserId);
    }

    if (!activeCycle) {
      const err = new Error('No active open duty cycle found to clock out.');
      err.statusCode = 400;
      err.code = 'NO_ACTIVE_DUTY_CYCLE';
      throw err;
    }

    if (activeCycle.user_id !== actorUser.id && !hasManage) {
      const err = new Error('Access denied: You are not authorized to clock out this duty cycle');
      err.statusCode = 403;
      throw err;
    }

    const clockInDate = new Date(activeCycle.clock_in_time);
    let clockOutDate = new Date();

    if (payload.clockOutTime) {
      clockOutDate = new Date(payload.clockOutTime);
      if (isNaN(clockOutDate.getTime())) {
        const err = new Error('Invalid clock-out timestamp format');
        err.statusCode = 400;
        throw err;
      }
    }

    if (clockOutDate.getTime() < clockInDate.getTime()) {
      const err = new Error('Clock-out timestamp cannot be earlier than clock-in timestamp');
      err.statusCode = 400;
      throw err;
    }

    const durationMinutes = Math.max(0, Math.round((clockOutDate.getTime() - clockInDate.getTime()) / 60000));

    await attendanceRepository.completeClockOut({
      id: activeCycle.id,
      clockOutTime: clockOutDate.toISOString(),
      clockOutRecordedBy: actorUser.id,
      durationMinutes,
      clockOutNotes: payload.notes || payload.clockOutNotes || null,
    });

    const fullRecord = await attendanceRepository.getAttendanceById(activeCycle.id);
    const dto = formatAttendanceRecord(fullRecord);

    await historyService.log(EVENTS.ATTENDANCE_CLOCKED_OUT, {
      actorUser,
      targetId: activeCycle.id,
      payload: {
        name: dto.user.fullName,
        username: dto.user.username,
        duration: dto.duration.formatted,
        durationMinutes,
      },
      metadata: {
        attendanceId: activeCycle.id,
        targetUserId: activeCycle.user_id,
        durationMinutes,
        onBehalf: activeCycle.user_id !== actorUser.id,
      },
    });

    return dto;
  }

  /**
   * Retrieves the current active duty cycle for a user, or null if off-duty.
   *
   * @param {Object} actorUser - Authenticated user context
   * @param {string|null} [targetUserId=null] - Optional user UUID for supervisors
   * @returns {Promise<Object|null>}
   */
  async getActiveDutyCycle(actorUser, targetUserId = null) {
    const permissions = actorUser?.permissions || [];
    const hasGlobalView = permissions.includes('attendance.view') || permissions.includes('attendance.manage');

    const effectiveUserId = targetUserId && targetUserId.trim().length > 0
      ? targetUserId.trim()
      : actorUser.id;

    if (effectiveUserId !== actorUser.id && !hasGlobalView) {
      const err = new Error('Access denied: You are only authorized to view your own attendance');
      err.statusCode = 403;
      throw err;
    }

    const row = await attendanceRepository.getActiveDutyCycle(effectiveUserId);
    if (!row) return null;

    return formatAttendanceRecord(row);
  }

  /**
   * Retrieves paginated attendance logs with server-side filters.
   * Scopes to actorUser if user lacks global attendance view permissions.
   *
   * @param {Object} actorUser
   * @param {Object} filters - { userId, role, status, startDate, endDate }
   * @param {Object|null} pagination - { page, limit }
   */
  async getAttendanceLogs(actorUser, filters = {}, pagination = null) {
    const permissions = actorUser?.permissions || [];
    const hasGlobalView = permissions.includes('attendance.view') || permissions.includes('attendance.manage');

    const effectiveFilters = { ...filters };

    // Scoped access: if lacking global view, restrict strictly to own user ID
    if (!hasGlobalView) {
      effectiveFilters.userId = actorUser.id;
    }

    if (!pagination || !pagination.isPaginated) {
      const rows = await attendanceRepository.getAttendanceLogs(effectiveFilters, null);
      return rows.map(formatAttendanceRecord);
    }

    const offset = calculateOffset(pagination.page, pagination.limit);
    const { rows, total } = await attendanceRepository.getAttendanceLogs(effectiveFilters, {
      ...pagination,
      offset,
    });

    const items = rows.map(formatAttendanceRecord);
    const meta = buildPaginationMeta(total, pagination.page, pagination.limit);

    return {
      items,
      meta,
    };
  }
}

module.exports = new AttendanceService();
