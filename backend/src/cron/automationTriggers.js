// ============================================
// La Maison du Regard — Cron: Automation Triggers
// Runs every 10 minutes
// Auto-complete bookings, review SMS
// ============================================

const db = require('../config/database');
const config = require('../config/env');
const logger = require('../utils/logger');
const { brevoSMS } = require('../services/notification');

/**
 * Process automation triggers (runs every 10 minutes).
 * - Auto-complete past bookings
 * - Send review SMS after completed bookings
 */
async function processAutomationTriggers() {
  try {
    // Auto-complete past bookings (confirmed + end_time passed today)
    const autoCompleted = await db.query(
      `UPDATE bookings SET status = 'completed'
       WHERE status = 'confirmed'
         AND deleted_at IS NULL
         AND date = (NOW() AT TIME ZONE 'Europe/Paris')::date
         AND end_time::time < (NOW() AT TIME ZONE 'Europe/Paris')::time
       RETURNING id`
    );
    if (autoCompleted.rowCount > 0) {
      logger.info(`Auto-completed ${autoCompleted.rowCount} past bookings`);
    }

    // Fetch all active triggers
    const triggers = await db.query('SELECT * FROM automation_triggers WHERE is_active = true');

    for (const trigger of triggers.rows) {
      try {
        switch (trigger.type) {
          case 'review_sms':
            await processReviewSms(trigger.config);
            break;
        }
      } catch (err) {
        logger.error(`Automation trigger ${trigger.type} failed`, { error: err.message });
      }
    }
  } catch (err) {
    logger.error('Failed to process automation triggers', { error: err.message });
  }
}

/**
 * Review SMS: Send SMS X minutes after a booking is completed.
 * Only once per client lifetime.
 */
async function processReviewSms(triggerConfig) {
  const delayMinutes = triggerConfig.delay_minutes || 60;
  const message = triggerConfig.message || '';
  const googleReviewUrl = triggerConfig.google_review_url || '';

  if (!message) return;

  // Find bookings completed more than delayMinutes ago
  // Only for clients who have NEVER received a review SMS (once per lifetime)
  const result = await db.query(
    `SELECT b.id, b.client_id, b.date, b.start_time,
            c.first_name, c.last_name, c.phone
     FROM bookings b
     JOIN clients c ON b.client_id = c.id
     WHERE b.status = 'completed'
       AND b.deleted_at IS NULL
       AND b.review_sms_sent = false
       AND c.phone IS NOT NULL
       AND c.review_requested = false
       AND b.date = (NOW() AT TIME ZONE 'Europe/Paris')::date
       AND (b.end_time::time + ($1 || ' minutes')::interval) <= (NOW() AT TIME ZONE 'Europe/Paris')::time
       AND NOT EXISTS (
         SELECT 1 FROM notification_queue nq
         WHERE nq.booking_id = b.id AND nq.type = 'review_sms'
       )
     LIMIT 20`,
    [delayMinutes]
  );

  const reviewLink = googleReviewUrl || config.googleReviewUrl || '';

  for (const booking of result.rows) {
    const personalMessage = message
      .replace(/\{prenom\}/gi, booking.first_name || '')
      .replace(/\{nom\}/gi, booking.last_name || '')
      .replace(/\{lien_avis\}/gi, reviewLink);

    try {
      await brevoSMS(booking.phone, personalMessage);
      logger.info('Review SMS sent', { bookingId: booking.id, phone: booking.phone });

      await db.query('UPDATE clients SET review_requested = true WHERE id = $1', [booking.client_id]);
      await db.query('UPDATE bookings SET review_sms_sent = true WHERE id = $1', [booking.id]);

      // Log to notification_queue for SMS history
      await db.query(
        `INSERT INTO notification_queue (booking_id, type, status, channel, phone, recipient_name, message, sent_at, attempts)
         VALUES ($1, 'review_sms', 'sent', 'sms', $2, $3, $4, NOW(), 1)`,
        [booking.id, booking.phone, booking.first_name || '', personalMessage]
      );
    } catch (err) {
      logger.error('Review SMS failed', { bookingId: booking.id, error: err.message });
      try {
        await db.query(
          `INSERT INTO notification_queue (booking_id, type, status, channel, phone, recipient_name, message, last_error, attempts)
           VALUES ($1, 'review_sms', 'failed', 'sms', $2, $3, $4, $5, 1)`,
          [booking.id, booking.phone, booking.first_name || '', personalMessage, err.message]
        );
      } catch (_) { /* silent */ }
    }
  }

  if (result.rows.length > 0) {
    logger.info(`Review SMS: processed ${result.rows.length} bookings`);
  }
}

module.exports = { processAutomationTriggers };
