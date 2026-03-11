// ============================================
// La Maison du Regard — Availability Service
// Single practitioner — no barber_id logic
// ============================================

const db = require('../config/database');
const {
  SLOT_INTERVAL_PUBLIC,
  SLOT_INTERVAL_ADMIN,
  SCHEDULE_END,
  MIN_BOOKING_LEAD_MINUTES,
} = require('../constants');

/**
 * Get available time slots for a specific date
 * @param {string} serviceId - Service UUID (to know duration)
 * @param {string} date - Date string YYYY-MM-DD
 * @param {object} options - { adminMode: boolean }
 * @returns {Array} Available slots: [{ time: "09:00" }, { time: "09:15" }, ...]
 */
async function getAvailableSlots(serviceId, date, options = {}) {
  // 1. Get service duration
  const serviceResult = await db.query(
    'SELECT duration FROM services WHERE id = $1 AND is_active = true',
    [serviceId]
  );
  if (serviceResult.rows.length === 0) {
    return [];
  }
  const duration = serviceResult.rows[0].duration;

  // 2. Get day of week (convert JS: 0=Sunday → our convention: 0=Monday)
  const dateObj = new Date(date + 'T00:00:00');
  const jsDay = dateObj.getDay(); // 0=Sunday
  const dayOfWeek = jsDay === 0 ? 6 : jsDay - 1; // Convert to 0=Monday

  // 3. Check schedule override first
  const overrideResult = await db.query(
    'SELECT start_time, end_time, is_day_off FROM schedule_overrides WHERE date = $1',
    [date]
  );

  let startTime, endTime;

  if (overrideResult.rows.length > 0) {
    const override = overrideResult.rows[0];
    if (override.is_day_off) return []; // Day off
    startTime = override.start_time;
    endTime = override.end_time;
  } else {
    // Use default schedule
    const scheduleResult = await db.query(
      'SELECT start_time, end_time, is_working FROM schedules WHERE day_of_week = $1',
      [dayOfWeek]
    );

    if (scheduleResult.rows.length === 0 || !scheduleResult.rows[0].is_working) {
      return []; // Not working this day
    }

    startTime = scheduleResult.rows[0].start_time;
    endTime = scheduleResult.rows[0].end_time;
  }

  // Admin can book up to SCHEDULE_END even if schedule ends earlier
  if (options.adminMode) {
    const endMin = timeToMinutes(endTime);
    if (endMin < timeToMinutes(SCHEDULE_END)) {
      endTime = SCHEDULE_END;
    }
  }

  // 4. Get existing bookings for this date
  const bookingsResult = await db.query(
    `SELECT start_time, end_time FROM bookings
     WHERE date = $1
       AND status != 'cancelled' AND deleted_at IS NULL
     ORDER BY start_time`,
    [date]
  );

  const existingBookings = bookingsResult.rows.map((b) => ({
    start: timeToMinutes(b.start_time),
    end: timeToMinutes(b.end_time),
  }));

  // 5. Get blocked slots for this date
  const blockedResult = await db.query(
    'SELECT start_time, end_time FROM blocked_slots WHERE date = $1 ORDER BY start_time',
    [date]
  );

  const blockedSlots = blockedResult.rows.map((b) => ({
    start: timeToMinutes(b.start_time),
    end: timeToMinutes(b.end_time),
  }));

  // 6. Generate all possible slots
  const startMin = timeToMinutes(startTime);
  const endMin = timeToMinutes(endTime);
  const slots = [];

  // For today: skip slots starting within MIN_BOOKING_LEAD_MINUTES (public only)
  let minSlotStart = 0;
  if (!options.adminMode) {
    const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Paris' }));
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    if (date === todayStr) {
      minSlotStart = now.getHours() * 60 + now.getMinutes() + MIN_BOOKING_LEAD_MINUTES;
    }
  }

  const step = options.adminMode ? SLOT_INTERVAL_ADMIN : SLOT_INTERVAL_PUBLIC;
  for (let slotStart = startMin; slotStart + duration <= endMin; slotStart += step) {
    const slotEnd = slotStart + duration;

    // Check if slot overlaps with any existing booking or blocked slot
    const overlapsBooking = existingBookings.some(
      (booking) => slotStart < booking.end && slotEnd > booking.start
    );
    const overlapsBlocked = blockedSlots.some(
      (blocked) => slotStart < blocked.end && slotEnd > blocked.start
    );

    if (!overlapsBooking && !overlapsBlocked && slotStart >= minSlotStart) {
      slots.push({
        time: minutesToTime(slotStart),
      });
    }
  }

  return slots;
}

/**
 * Check if a specific slot is still available (used right before booking)
 * @param {string} date
 * @param {string} startTime - HH:MM
 * @param {number} duration - minutes
 * @param {object} client - Database client (for transactions)
 * @param {object} options - { isAdmin, excludeBookingId }
 * @returns {boolean}
 */
async function isSlotAvailable(date, startTime, duration, client = null, options = {}) {
  const queryFn = client ? client.query.bind(client) : db.query;

  const endTime = addMinutesToTime(startTime, duration);

  // Use FOR UPDATE to lock rows and prevent race conditions
  const lockQuery = client
    ? `SELECT id FROM bookings
       WHERE date = $1
         AND status != 'cancelled' AND deleted_at IS NULL
         AND start_time < $2 AND end_time > $3
         ${options.excludeBookingId ? 'AND id != $4' : ''}
       FOR UPDATE`
    : `SELECT id FROM bookings
       WHERE date = $1
         AND status != 'cancelled' AND deleted_at IS NULL
         AND start_time < $2 AND end_time > $3
         ${options.excludeBookingId ? 'AND id != $4' : ''}`;

  const params = options.excludeBookingId
    ? [date, endTime, startTime, options.excludeBookingId]
    : [date, endTime, startTime];

  const result = await queryFn(lockQuery, params);
  if (result.rows.length > 0) return false;

  // Admin can book over blocked slots
  if (!options.isAdmin) {
    const blockedCheck = await queryFn(
      `SELECT id FROM blocked_slots
       WHERE date = $1
         AND start_time < $2 AND end_time > $3`,
      [date, endTime, startTime]
    );
    if (blockedCheck.rows.length > 0) return false;
  }

  return true;
}

/**
 * Validate that the practitioner can accept a booking at the given date/time.
 * Checks: schedule overrides, default schedule, blocked slots.
 */
async function validateSlot(dbClient, date, startTime, endTime) {
  const dateObj = new Date(date + 'T00:00:00');
  const jsDay = dateObj.getDay();
  const dayOfWeek = jsDay === 0 ? 6 : jsDay - 1; // 0=Monday

  // Check schedule override
  const overrideCheck = await dbClient.query(
    'SELECT is_day_off, start_time, end_time FROM schedule_overrides WHERE date = $1',
    [date]
  );

  if (overrideCheck.rows.length > 0) {
    const ov = overrideCheck.rows[0];
    if (ov.is_day_off) {
      throw require('../utils/errors').ApiError.badRequest('Jour de repos — pas de rendez-vous ce jour');
    }
    if (startTime < ov.start_time.slice(0, 5) || endTime > ov.end_time.slice(0, 5)) {
      throw require('../utils/errors').ApiError.badRequest('Horaire en dehors des heures de travail');
    }
  } else {
    const scheduleCheck = await dbClient.query(
      'SELECT is_working, start_time, end_time FROM schedules WHERE day_of_week = $1',
      [dayOfWeek]
    );
    if (scheduleCheck.rows.length === 0 || !scheduleCheck.rows[0].is_working) {
      throw require('../utils/errors').ApiError.badRequest('Jour de repos — pas de rendez-vous ce jour');
    }
    const sched = scheduleCheck.rows[0];
    if (startTime < sched.start_time.slice(0, 5) || endTime > sched.end_time.slice(0, 5)) {
      throw require('../utils/errors').ApiError.badRequest('Horaire en dehors des heures de travail');
    }
  }

  // Check blocked slots
  const blockedCheck = await dbClient.query(
    `SELECT id FROM blocked_slots
     WHERE date = $1
       AND start_time < $2 AND end_time > $3`,
    [date, endTime, startTime]
  );
  if (blockedCheck.rows.length > 0) {
    throw require('../utils/errors').ApiError.badRequest('Ce créneau est bloqué');
  }
}

// ============================================
// Time helpers
// ============================================

function timeToMinutes(timeStr) {
  if (!timeStr) return 0;
  const str = typeof timeStr === 'string' ? timeStr : timeStr.toString();
  const [hours, minutes] = str.split(':').map(Number);
  return hours * 60 + minutes;
}

function minutesToTime(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function addMinutesToTime(timeStr, minutesToAdd) {
  const totalMinutes = timeToMinutes(timeStr) + minutesToAdd;
  return minutesToTime(totalMinutes);
}

module.exports = {
  getAvailableSlots,
  isSlotAvailable,
  validateSlot,
  addMinutesToTime,
  timeToMinutes,
  minutesToTime,
};
