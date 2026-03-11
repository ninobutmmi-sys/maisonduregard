// ============================================
// La Maison du Regard — Booking Service
// Atomic booking creation for single practitioner
// ============================================

const crypto = require('crypto');
const db = require('../config/database');
const { ApiError } = require('../utils/errors');
const availability = require('./availability');
const notification = require('./notification');
const logger = require('../utils/logger');
const {
  MAX_BOOKING_ADVANCE_MONTHS,
  CANCELLATION_DEADLINE_HOURS,
  MIN_BOOKING_LEAD_MINUTES,
  SMS_CONFIRMATION_THRESHOLD_HOURS,
} = require('../constants');

/**
 * Create a new booking with atomic transaction
 * Prevents double booking via SELECT ... FOR UPDATE + unique index + advisory lock
 *
 * @param {object} data
 * @param {string} data.service_id - Service UUID
 * @param {string} data.date - YYYY-MM-DD
 * @param {string} data.start_time - HH:MM
 * @param {string} data.first_name
 * @param {string} data.last_name
 * @param {string} data.phone
 * @param {string|null} data.email
 * @param {string} data.source - 'online' or 'manual'
 * @returns {object} Created booking with details
 */
async function createBooking(data) {
  const isAdmin = data.source === 'manual';

  let result;
  try {
    result = await db.transaction(async (client) => {
      // 0. Validate date/time is not in the past and not too far in the future (client bookings only)
      if (!isAdmin) {
        const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Paris' }));
        const today = new Date(now);
        today.setHours(0, 0, 0, 0);
        const requestedDate = new Date(data.date + 'T00:00:00');
        if (requestedDate < today) {
          throw ApiError.badRequest('Impossible de réserver dans le passé');
        }
        const minBookingTime = new Date(now.getTime() + MIN_BOOKING_LEAD_MINUTES * 60 * 1000);
        const requestedDateTime = new Date(`${data.date}T${data.start_time}:00`);
        if (requestedDateTime < minBookingTime) {
          throw ApiError.badRequest(`Impossible de réserver un créneau dans moins de ${MIN_BOOKING_LEAD_MINUTES} minutes`);
        }
        const maxDate = new Date(today);
        maxDate.setMonth(maxDate.getMonth() + MAX_BOOKING_ADVANCE_MONTHS);
        if (requestedDate > maxDate) {
          throw ApiError.badRequest(`Impossible de réserver plus de ${MAX_BOOKING_ADVANCE_MONTHS} mois à l'avance`);
        }
      }

      // 1. Get service details (price, duration)
      const serviceResult = await client.query(
        'SELECT id, name, price, duration FROM services WHERE id = $1 AND is_active = true',
        [data.service_id]
      );
      if (serviceResult.rows.length === 0) {
        throw ApiError.badRequest('Prestation introuvable ou inactive');
      }
      const service = serviceResult.rows[0];
      const effectiveDuration = parseInt(data.duration, 10) || service.duration;

      // 2. Calculate end time
      const endTime = availability.addMinutesToTime(data.start_time, effectiveDuration);

      // 3. Validate schedule (client bookings only — admin can override)
      if (!isAdmin) {
        await availability.validateSlot(client, data.date, data.start_time, endTime);

        // Prevent client double-booking (same phone, overlapping time, same day)
        const clientDoubleCheck = await client.query(
          `SELECT id FROM bookings
           WHERE date = $1 AND status = 'confirmed' AND deleted_at IS NULL
             AND start_time < $2 AND end_time > $3
             AND client_id IN (SELECT id FROM clients WHERE phone = $4 AND deleted_at IS NULL)`,
          [data.date, endTime, data.start_time, data.phone]
        );
        if (clientDoubleCheck.rows.length > 0) {
          throw ApiError.conflict('Vous avez déjà un rendez-vous sur ce créneau');
        }
      }

      // 4. Serialize booking attempts for this date (advisory lock)
      await client.query(
        `SELECT pg_advisory_xact_lock(hashtext($1))`,
        [data.date]
      );

      // Check slot is still free (with row lock) — admin can book over blocked slots
      const slotFree = await availability.isSlotAvailable(
        data.date,
        data.start_time,
        effectiveDuration,
        client,
        { isAdmin }
      );
      if (!slotFree) {
        throw ApiError.conflict('Ce créneau vient d\'être pris. Veuillez en choisir un autre.');
      }

      // 5. Find or create client by phone
      let clientResult = { rows: [] };
      if (data.phone) {
        clientResult = await client.query(
          'SELECT id FROM clients WHERE phone = $1 AND deleted_at IS NULL LIMIT 1',
          [data.phone]
        );
      }

      // If not found by phone, try email
      if (clientResult.rows.length === 0 && data.email) {
        clientResult = await client.query(
          'SELECT id FROM clients WHERE email = $1 AND email IS NOT NULL AND deleted_at IS NULL LIMIT 1',
          [data.email]
        );
      }

      let clientId;
      if (clientResult.rows.length > 0) {
        clientId = clientResult.rows[0].id;
        // Update client info (name, phone, email) — keeps data fresh
        const updateFields = ['first_name = $1'];
        const updateValues = [data.first_name];
        if (data.last_name) { updateFields.push(`last_name = $${updateFields.length + 1}`); updateValues.push(data.last_name); }
        if (data.phone) { updateFields.push(`phone = $${updateFields.length + 1}`); updateValues.push(data.phone); }
        if (data.email) { updateFields.push(`email = $${updateFields.length + 1}`); updateValues.push(data.email); }
        updateValues.push(clientId);
        await client.query(
          `UPDATE clients SET ${updateFields.join(', ')} WHERE id = $${updateValues.length}`,
          updateValues
        );
      } else {
        // Create new client
        const newClient = await client.query(
          `INSERT INTO clients (first_name, last_name, phone, email)
           VALUES ($1, $2, $3, $4) RETURNING id`,
          [data.first_name, data.last_name || null, data.phone || null, data.email || null]
        );
        clientId = newClient.rows[0].id;
      }

      // 6. Generate cancel token
      const cancelToken = crypto.randomBytes(32).toString('hex');

      // 7. Insert the booking
      const bookingResult = await client.query(
        `INSERT INTO bookings (client_id, service_id, date, start_time, end_time, duration, price, cancel_token, source)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING *`,
        [clientId, data.service_id, data.date, data.start_time, endTime, effectiveDuration, service.price, cancelToken, data.source || 'online']
      );

      const booking = bookingResult.rows[0];

      logger.info('Booking created', {
        bookingId: booking.id,
        date: data.date,
        time: data.start_time,
        source: data.source || 'online',
      });

      // Check if client has an account (for "claim account" prompt on frontend)
      const accountCheck = await client.query(
        'SELECT has_account FROM clients WHERE id = $1',
        [clientId]
      );
      const hasAccount = accountCheck.rows[0]?.has_account || false;

      return {
        id: booking.id,
        client_id: clientId,
        service_id: data.service_id,
        service_name: service.name,
        date: booking.date,
        start_time: booking.start_time,
        end_time: booking.end_time,
        duration: effectiveDuration,
        price: booking.price,
        status: booking.status,
        cancel_token: booking.cancel_token,
        source: booking.source,
        created_at: booking.created_at,
        has_account: hasAccount,
      };
    });
  } catch (err) {
    // Unique constraint violation
    if (err.code === '23505') {
      if (err.constraint && err.constraint.includes('client')) {
        throw ApiError.conflict('Un compte client existe déjà avec ce numéro ou cet email.');
      }
      throw ApiError.conflict('Ce créneau vient d\'être pris. Veuillez en choisir un autre.');
    }
    throw err;
  }

  // Send notifications DIRECTLY after transaction commit
  let bookingDetails;
  try {
    bookingDetails = await getBookingDetails(result.id);
  } catch (err) {
    logger.error('Failed to fetch booking details for notifications', { bookingId: result.id, error: err.message });
  }

  if (bookingDetails) {
    // 1. Confirmation email
    if (bookingDetails.client_email) {
      try {
        await notification.sendConfirmationEmail({
          booking_id: result.id,
          cancel_token: result.cancel_token,
          email: bookingDetails.client_email,
          first_name: bookingDetails.client_first_name,
          service_name: bookingDetails.service_name,
          date: bookingDetails.date,
          start_time: bookingDetails.start_time,
          duration: bookingDetails.service_duration,
          price: bookingDetails.price,
        });
        logger.info('Confirmation email sent directly', { bookingId: result.id });
      } catch (err) {
        logger.error('Direct confirmation email failed', { bookingId: result.id, error: err.message });
      }
    }

    // 2. SMS reminder if booking is within 24h
    const smsNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Paris' }));
    const [smsY, smsM, smsD] = result.date.split('-').map(Number);
    const [smsH, smsMn] = result.start_time.slice(0, 5).split(':').map(Number);
    const smsBookingDateTime = new Date(smsY, smsM - 1, smsD, smsH, smsMn, 0);
    const hoursUntilBooking = (smsBookingDateTime - smsNow) / (1000 * 60 * 60);

    if (hoursUntilBooking > 0 && hoursUntilBooking <= SMS_CONFIRMATION_THRESHOLD_HOURS && bookingDetails.client_phone) {
      try {
        await notification.sendReminderSMSDirect({
          booking_id: result.id,
          cancel_token: result.cancel_token,
          phone: bookingDetails.client_phone,
          service_name: bookingDetails.service_name,
          date: bookingDetails.date,
          start_time: bookingDetails.start_time,
        });
        await db.query('UPDATE bookings SET reminder_sent = true WHERE id = $1', [result.id]);
        logger.info('Reminder SMS sent (booking within 24h)', { bookingId: result.id });
      } catch (err) {
        logger.error('Reminder SMS failed', { bookingId: result.id, error: err.message });
      }
    }
  }

  return result;
}

/**
 * Cancel a booking by cancel_token
 * Enforces 24-hour minimum cancellation window
 */
async function cancelBooking(bookingId, cancelToken) {
  const booking = await db.transaction(async (client) => {
    // 1. Lock the booking row
    const result = await client.query(
      `SELECT b.*, s.name as service_name,
              c.first_name, c.email as client_email
       FROM bookings b
       JOIN services s ON b.service_id = s.id
       JOIN clients c ON b.client_id = c.id
       WHERE b.id = $1 AND b.cancel_token = $2 AND b.deleted_at IS NULL
       FOR UPDATE OF b`,
      [bookingId, cancelToken]
    );

    if (result.rows.length === 0) {
      throw ApiError.notFound('Rendez-vous introuvable');
    }

    const bk = result.rows[0];

    if (bk.status === 'cancelled') {
      throw ApiError.badRequest('Ce rendez-vous a déjà été annulé');
    }

    if (bk.status !== 'confirmed') {
      throw ApiError.badRequest('Ce rendez-vous ne peut plus être annulé');
    }

    // 2. Check cancellation deadline (Paris timezone)
    const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Paris' }));
    const [bkY, bkM, bkD] = bk.date.split('-').map(Number);
    const [bkH, bkMn] = bk.start_time.slice(0, 5).split(':').map(Number);
    const bookingDateTime = new Date(bkY, bkM - 1, bkD, bkH, bkMn, 0);
    const hoursUntil = (bookingDateTime - now) / (1000 * 60 * 60);

    if (hoursUntil < CANCELLATION_DEADLINE_HOURS) {
      throw ApiError.badRequest(
        `Les annulations doivent être effectuées au moins ${CANCELLATION_DEADLINE_HOURS} heures avant le rendez-vous`
      );
    }

    // 3. Cancel it
    await client.query(
      `UPDATE bookings SET status = 'cancelled', cancelled_at = NOW(), cancelled_by = 'client'
       WHERE id = $1`,
      [bookingId]
    );

    return bk;
  });

  logger.info('Booking cancelled', { bookingId, date: booking.date, time: booking.start_time });

  // Send cancellation email
  if (booking.client_email) {
    try {
      await notification.sendCancellationEmail({
        email: booking.client_email,
        first_name: booking.first_name,
        service_name: booking.service_name,
        date: booking.date,
        start_time: booking.start_time,
        price: booking.price,
      });
    } catch (err) {
      logger.error('Cancellation email failed', { bookingId, error: err.message });
    }
  }

  return {
    ...booking,
    status: 'cancelled',
    cancelled_at: new Date(),
  };
}

/**
 * Reschedule a booking by cancel_token (public, no auth needed)
 * Atomic: validates new slot, updates booking
 */
async function rescheduleBooking(bookingId, cancelToken, newDate, newStartTime) {
  const result = await db.transaction(async (client) => {
    // 1. Fetch booking with lock
    const bookingResult = await client.query(
      `SELECT b.*, s.name as service_name, s.duration as service_duration, s.price as service_price,
              c.first_name, c.last_name, c.phone, c.email
       FROM bookings b
       JOIN services s ON b.service_id = s.id
       JOIN clients c ON b.client_id = c.id
       WHERE b.id = $1 AND b.cancel_token = $2 AND b.deleted_at IS NULL
       FOR UPDATE OF b`,
      [bookingId, cancelToken]
    );

    if (bookingResult.rows.length === 0) {
      throw ApiError.notFound('Rendez-vous introuvable');
    }

    const booking = bookingResult.rows[0];

    if (booking.status !== 'confirmed') {
      throw ApiError.badRequest('Ce rendez-vous ne peut plus être modifié');
    }

    // Check if already rescheduled (limit: 1 reschedule per booking)
    if (booking.rescheduled) {
      throw ApiError.badRequest('Ce rendez-vous a déjà été décalé une fois. Vous pouvez toujours l\'annuler.');
    }

    // 2. Check reschedule deadline
    const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Paris' }));
    const [rsY, rsM, rsD] = booking.date.split('-').map(Number);
    const [rsH, rsMn] = booking.start_time.slice(0, 5).split(':').map(Number);
    const bookingDateTime = new Date(rsY, rsM - 1, rsD, rsH, rsMn, 0);
    const hoursUntil = (bookingDateTime - now) / (1000 * 60 * 60);

    if (hoursUntil < CANCELLATION_DEADLINE_HOURS) {
      throw ApiError.badRequest(
        `Les modifications doivent être effectuées au moins ${CANCELLATION_DEADLINE_HOURS} heures avant le rendez-vous`
      );
    }

    // 3. Validate new date
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    const requestedDate = new Date(newDate + 'T00:00:00');
    if (requestedDate < today) {
      throw ApiError.badRequest('Impossible de déplacer dans le passé');
    }
    const minBookingTime = new Date(now.getTime() + MIN_BOOKING_LEAD_MINUTES * 60 * 1000);
    const newDateTime = new Date(`${newDate}T${newStartTime}:00`);
    if (newDateTime < minBookingTime) {
      throw ApiError.badRequest(`Impossible de déplacer sur un créneau dans moins de ${MIN_BOOKING_LEAD_MINUTES} minutes`);
    }
    const maxDate = new Date(today);
    maxDate.setMonth(maxDate.getMonth() + MAX_BOOKING_ADVANCE_MONTHS);
    if (requestedDate > maxDate) {
      throw ApiError.badRequest(`Impossible de réserver plus de ${MAX_BOOKING_ADVANCE_MONTHS} mois à l'avance`);
    }

    // 4. Calculate new end time
    const newEndTime = availability.addMinutesToTime(newStartTime, booking.service_duration);

    // 5. Validate schedule + blocked slots for new date
    await availability.validateSlot(client, newDate, newStartTime, newEndTime);

    // 6. Check new slot is available (excluding current booking)
    const conflictCheck = await client.query(
      `SELECT id FROM bookings
       WHERE date = $1
         AND status != 'cancelled' AND deleted_at IS NULL
         AND start_time < $2 AND end_time > $3
         AND id != $4
       FOR UPDATE`,
      [newDate, newEndTime, newStartTime, bookingId]
    );
    if (conflictCheck.rows.length > 0) {
      throw ApiError.conflict('Ce créneau est déjà pris');
    }

    // 7. Update booking (keep same cancel_token)
    const updateResult = await client.query(
      `UPDATE bookings
       SET date = $1, start_time = $2, end_time = $3, rescheduled = true
       WHERE id = $4
       RETURNING *`,
      [newDate, newStartTime, newEndTime, bookingId]
    );

    logger.info('Booking rescheduled', {
      bookingId,
      oldDate: booking.date,
      oldTime: booking.start_time.slice(0, 5),
      newDate,
      newTime: newStartTime,
    });

    return {
      booking: updateResult.rows[0],
      oldDate: booking.date,
      oldTime: booking.start_time,
      service_name: booking.service_name,
      email: booking.email,
      first_name: booking.first_name,
      price: booking.service_price,
      cancelToken: booking.cancel_token,
    };
  });

  // Send reschedule email after transaction commit
  if (result.email) {
    try {
      await notification.sendRescheduleEmail({
        email: result.email,
        first_name: result.first_name,
        service_name: result.service_name,
        old_date: result.oldDate,
        old_time: result.oldTime,
        new_date: newDate,
        new_time: newStartTime,
        price: result.price,
        cancel_token: result.cancelToken,
        booking_id: bookingId,
      });
    } catch (err) {
      logger.error('Reschedule email failed', { bookingId, error: err.message });
    }
  }

  return {
    id: bookingId,
    date: newDate,
    start_time: newStartTime,
    end_time: result.booking.end_time,
    status: result.booking.status,
    cancel_token: result.cancelToken,
    service_name: result.service_name,
    price: result.price,
  };
}

/**
 * Update booking status (completed / no_show) — admin only
 */
async function updateBookingStatus(bookingId, newStatus) {
  const validStatuses = ['completed', 'no_show', 'confirmed'];
  if (!validStatuses.includes(newStatus)) {
    throw ApiError.badRequest(`Statut invalide. Valeurs possibles : ${validStatuses.join(', ')}`);
  }

  const result = await db.query(
    `UPDATE bookings SET status = $1
     WHERE id = $2 AND deleted_at IS NULL
     RETURNING *`,
    [newStatus, bookingId]
  );

  if (result.rows.length === 0) {
    throw ApiError.notFound('Rendez-vous introuvable');
  }

  logger.info('Booking status updated', { bookingId, newStatus });
  return result.rows[0];
}

/**
 * Get booking details by ID (with related data)
 */
async function getBookingDetails(bookingId) {
  const result = await db.query(
    `SELECT b.*,
            s.name as service_name, s.duration as service_duration,
            c.first_name as client_first_name, c.last_name as client_last_name,
            c.phone as client_phone, c.email as client_email
     FROM bookings b
     JOIN services s ON b.service_id = s.id
     JOIN clients c ON b.client_id = c.id
     WHERE b.id = $1 AND b.deleted_at IS NULL`,
    [bookingId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return result.rows[0];
}

module.exports = {
  createBooking,
  cancelBooking,
  rescheduleBooking,
  updateBookingStatus,
  getBookingDetails,
};
