// ============================================
// La Maison du Regard — Cron: SMS Reminders
// Runs daily at 18:00, sends reminders for tomorrow
// ============================================

const db = require('../config/database');
const notification = require('../services/notification');
const logger = require('../utils/logger');

/**
 * Send SMS reminders for tomorrow's bookings.
 * Sends directly via Brevo (queue fallback if direct fails).
 */
async function queueReminders() {
  try {
    // Calculate tomorrow in Paris timezone
    const nowParis = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Paris' }));
    const tomorrow = new Date(nowParis);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;

    const result = await db.query(
      `SELECT b.id, b.date, b.start_time, b.cancel_token,
              c.phone,
              s.name as service_name
       FROM bookings b
       JOIN clients c ON b.client_id = c.id
       LEFT JOIN services s ON b.service_id = s.id
       WHERE b.date = $1
         AND b.status = 'confirmed'
         AND b.reminder_sent = false
         AND b.deleted_at IS NULL
         AND c.phone IS NOT NULL`,
      [tomorrowStr]
    );

    if (result.rows.length === 0) {
      logger.info('No reminders to send for tomorrow');
      return;
    }

    let sent = 0;
    let failed = 0;

    for (const booking of result.rows) {
      try {
        await notification.sendReminderSMSDirect({
          booking_id: booking.id,
          cancel_token: booking.cancel_token,
          phone: booking.phone,
          date: booking.date,
          start_time: booking.start_time,
          service_name: booking.service_name,
        });

        await db.query('UPDATE bookings SET reminder_sent = true WHERE id = $1', [booking.id]);

        // Log to notification_queue for SMS history
        await db.query(
          `INSERT INTO notification_queue (booking_id, type, status, channel, phone, sent_at, attempts)
           VALUES ($1, 'reminder_sms', 'sent', 'sms', $2, NOW(), 1)`,
          [booking.id, booking.phone]
        );
        sent++;
      } catch (err) {
        logger.error('Direct reminder SMS failed, queueing for retry', {
          bookingId: booking.id,
          error: err.message,
        });
        try {
          await notification.queueNotification(booking.id, 'reminder_sms');
        } catch (qErr) {
          logger.error('Failed to queue reminder SMS fallback', {
            bookingId: booking.id,
            error: qErr.message,
          });
        }
        failed++;
      }
    }

    logger.info(`SMS reminders for ${tomorrowStr}: ${sent} sent, ${failed} failed`);
  } catch (error) {
    logger.error('Failed to send reminders', { error: error.message });
  }
}

module.exports = { queueReminders };
