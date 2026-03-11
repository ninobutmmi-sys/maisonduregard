// ============================================
// La Maison du Regard — Notification Service
// Brevo email + SMS with circuit breaker
// ============================================

const db = require('../config/database');
const config = require('../config/env');
const logger = require('../utils/logger');
const {
  NOTIFICATION_RETRY_DELAYS,
  NOTIFICATION_BATCH_SIZE,
  BREVO_CIRCUIT_THRESHOLD,
  BREVO_CIRCUIT_COOLDOWN_MS,
  BREVO_REQUEST_TIMEOUT_MS,
} = require('../constants');

// ============================================
// Circuit breaker for Brevo API
// After 3 consecutive failures, short-circuit for 60s
// ============================================
const brevoCircuit = {
  failures: 0,
  threshold: BREVO_CIRCUIT_THRESHOLD,
  cooldownMs: BREVO_CIRCUIT_COOLDOWN_MS,
  openedAt: null,
};

function isCircuitOpen() {
  if (brevoCircuit.failures < brevoCircuit.threshold) return false;
  if (!brevoCircuit.openedAt) return false;
  if (Date.now() - brevoCircuit.openedAt > brevoCircuit.cooldownMs) {
    brevoCircuit.failures = 0;
    brevoCircuit.openedAt = null;
    logger.info('Brevo circuit breaker reset (cooldown elapsed)');
    return false;
  }
  return true;
}

function recordBrevoSuccess() {
  if (brevoCircuit.failures > 0) {
    brevoCircuit.failures = 0;
    brevoCircuit.openedAt = null;
  }
}

function recordBrevoFailure() {
  brevoCircuit.failures++;
  if (brevoCircuit.failures >= brevoCircuit.threshold && !brevoCircuit.openedAt) {
    brevoCircuit.openedAt = Date.now();
    logger.warn(`Brevo circuit breaker OPEN — skipping calls for ${BREVO_CIRCUIT_COOLDOWN_MS / 1000}s`, { failures: brevoCircuit.failures });
  }
}

// ============================================
// Brevo API helpers
// ============================================

async function brevoEmail(to, subject, htmlContent, meta = {}) {
  if (config.nodeEnv === 'test') {
    logger.debug('Brevo email skipped (test mode)', { to, subject });
    return;
  }
  if (isCircuitOpen()) {
    throw new Error('Brevo circuit breaker open — skipping email');
  }
  if (!config.brevo.apiKey) {
    logger.warn('Brevo API key not configured, skipping email');
    return;
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), BREVO_REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': config.brevo.apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sender: { email: config.brevo.senderEmail, name: config.brevo.senderName },
        to: [{ email: to }],
        subject,
        htmlContent,
        textContent: htmlToText(htmlContent),
        headers: {
          'X-Mailin-Tag': meta.type || 'transactional',
        },
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorBody = await response.text();
      recordBrevoFailure();
      // Log failed email to notification_queue
      try {
        await db.query(
          `INSERT INTO notification_queue (booking_id, type, status, channel, recipient, recipient_name, subject, created_at, last_error)
           VALUES ($1, $2, 'failed', 'email', $3, $4, $5, NOW(), $6)`,
          [meta.bookingId || null, meta.type || 'email', to, meta.recipientName || null, subject, `${response.status}: ${errorBody.slice(0, 200)}`]
        );
      } catch (_) { /* silent */ }
      throw new Error(`Brevo email API error ${response.status}: ${errorBody}`);
    }
    recordBrevoSuccess();
    // Log successful email
    try {
      await db.query(
        `INSERT INTO notification_queue (booking_id, type, status, channel, recipient, recipient_name, subject, created_at, sent_at)
         VALUES ($1, $2, 'sent', 'email', $3, $4, $5, NOW(), NOW())`,
        [meta.bookingId || null, meta.type || 'email', to, meta.recipientName || null, subject]
      );
    } catch (_) { /* silent */ }
  } catch (err) {
    if (err.name === 'AbortError') recordBrevoFailure();
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

async function brevoSMS(phone, content) {
  if (config.nodeEnv === 'test') {
    logger.debug('Brevo SMS skipped (test mode)', { phone });
    return;
  }
  if (isCircuitOpen()) {
    throw new Error('Brevo circuit breaker open — skipping SMS');
  }
  if (!config.brevo.apiKey) {
    logger.warn('Brevo API key not configured, skipping SMS');
    return;
  }
  const recipient = formatPhoneInternational(phone);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), BREVO_REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch('https://api.brevo.com/v3/transactionalSMS/send', {
      method: 'POST',
      headers: {
        'api-key': config.brevo.apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sender: config.brevo.smsSender,
        recipient,
        content,
        type: 'transactional',
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorBody = await response.text();
      recordBrevoFailure();
      throw new Error(`Brevo SMS API error ${response.status}: ${errorBody}`);
    }
    recordBrevoSuccess();
  } catch (err) {
    if (err.name === 'AbortError') recordBrevoFailure();
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

// ============================================
// Queue management
// ============================================

async function queueNotification(bookingId, type) {
  await db.query(
    `INSERT INTO notification_queue (booking_id, type, status, channel, recipient, next_retry_at)
     VALUES ($1, $2, 'pending', $3, '', NOW())`,
    [bookingId, type, type.includes('sms') ? 'sms' : 'email']
  );
  logger.info('Notification queued', { bookingId, type });
}

async function processPendingNotifications() {
  const claimed = await db.query(
    `UPDATE notification_queue
     SET status = 'processing'
     WHERE id IN (
       SELECT nq.id FROM notification_queue nq
       WHERE nq.status = 'pending'
         AND nq.next_retry_at <= NOW()
         AND nq.attempts < nq.max_attempts
       ORDER BY nq.created_at
       LIMIT $1
       FOR UPDATE SKIP LOCKED
     )
     RETURNING id`,
    [NOTIFICATION_BATCH_SIZE]
  );

  if (claimed.rows.length === 0) return;

  const claimedIds = claimed.rows.map(r => r.id);

  const result = await db.query(
    `SELECT nq.*, b.date, b.start_time, b.end_time, b.price, b.cancel_token,
            s.name as service_name,
            c.first_name, c.last_name, c.phone, c.email
     FROM notification_queue nq
     JOIN bookings b ON nq.booking_id = b.id
     JOIN services s ON b.service_id = s.id
     JOIN clients c ON b.client_id = c.id
     WHERE nq.id = ANY($1)`,
    [claimedIds]
  );

  for (const notif of result.rows) {
    try {
      switch (notif.type) {
        case 'confirmation_email':
          await sendConfirmationEmail(notif);
          break;
        case 'reminder_sms':
          await sendReminderSMSDirect(notif);
          break;
        default:
          throw new Error(`Unknown notification type: ${notif.type}`);
      }
      await db.query(
        `UPDATE notification_queue SET status = 'sent', sent_at = NOW() WHERE id = $1`,
        [notif.id]
      );
    } catch (error) {
      const attempts = notif.attempts + 1;
      const nextRetry = getNextRetryTime(attempts);
      await db.query(
        `UPDATE notification_queue
         SET attempts = $1, last_error = $2, next_retry_at = $3,
             status = CASE WHEN $1 >= max_attempts THEN 'failed' ELSE 'pending' END
         WHERE id = $4`,
        [attempts, error.message, nextRetry, notif.id]
      );
      logger.error('Notification failed', { id: notif.id, type: notif.type, attempt: attempts, error: error.message });
    }
  }
}

// ============================================
// Email sending functions
// ============================================

async function sendConfirmationEmail(data) {
  if (!data.email) {
    logger.info('No client email, skipping confirmation email', { bookingId: data.booking_id });
    return;
  }

  const cancelUrl = `${config.siteUrl}${config.salon.bookingPath}/mon-rdv.html?id=${data.booking_id}&token=${data.cancel_token}`;
  const dateFormatted = formatDateFR(data.date);
  const timeFormatted = formatTime(data.start_time);
  const priceFormatted = (data.price / 100).toFixed(2).replace('.', ',');

  const html = buildConfirmationEmailHTML({
    firstName: data.first_name,
    serviceName: data.service_name,
    date: dateFormatted,
    time: timeFormatted,
    price: priceFormatted,
    duration: data.duration,
    cancelUrl,
  });

  await brevoEmail(data.email, `Confirmation RDV - ${escapeHtml(data.service_name)} le ${dateFormatted}`, html, {
    bookingId: data.booking_id, type: 'confirmation_email', recipientName: data.first_name,
  });
}

async function sendCancellationEmail({ email, first_name, service_name, date, start_time, price }) {
  if (!email) {
    logger.warn('No email, skipping cancellation email');
    return;
  }

  const dateFormatted = escapeHtml(formatDateFR(date));
  const timeFormatted = escapeHtml(formatTime(start_time));
  const priceFormatted = escapeHtml((price / 100).toFixed(2).replace('.', ','));
  service_name = escapeHtml(service_name);

  const bookAgainUrl = `${config.siteUrl}${config.salon.bookingPath}/reserver.html`;

  const html = emailShell(`
      <div style="text-align:center;margin-bottom:32px;">
        <h2 style="font-size:24px;font-weight:700;margin:0;color:${TEXT_PRIMARY};letter-spacing:-0.3px;">Rendez-vous annul&eacute;</h2>
        <p style="color:${TEXT_SECONDARY};font-size:14px;margin:8px 0 0;">
          Votre r&eacute;servation a bien &eacute;t&eacute; annul&eacute;e.
        </p>
      </div>

      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${CARD_BG};border:1px solid ${CARD_BORDER};border-radius:16px;margin-bottom:28px;">
        <tr><td style="height:3px;background:linear-gradient(90deg, ${ACCENT_DIM}, ${ACCENT}, ${ACCENT_DIM});font-size:0;line-height:0;">&nbsp;</td></tr>
        <tr>
          <td style="padding:24px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
              <tr>
                <td style="padding:10px 0;color:${TEXT_MUTED};font-size:12px;text-transform:uppercase;letter-spacing:1px;vertical-align:middle;width:100px;">Prestation</td>
                <td style="padding:10px 0;color:${TEXT_MUTED};font-size:15px;text-align:right;text-decoration:line-through;">${service_name}</td>
              </tr>
              <tr><td colspan="2" style="padding:0;border-top:1px solid ${CARD_BORDER};"></td></tr>
              <tr>
                <td style="padding:10px 0;color:${TEXT_MUTED};font-size:12px;text-transform:uppercase;letter-spacing:1px;vertical-align:middle;">Date</td>
                <td style="padding:10px 0;color:${TEXT_MUTED};font-size:14px;text-align:right;text-decoration:line-through;">${dateFormatted} &agrave; ${timeFormatted}</td>
              </tr>
              <tr><td colspan="2" style="padding:0;border-top:1px solid ${CARD_BORDER};"></td></tr>
              <tr>
                <td style="padding:12px 0 4px;color:${TEXT_MUTED};font-size:12px;text-transform:uppercase;letter-spacing:1px;vertical-align:middle;">Prix</td>
                <td style="padding:12px 0 4px;color:${TEXT_MUTED};font-size:18px;font-weight:700;text-align:right;text-decoration:line-through;">${priceFormatted}<span style="font-size:13px;font-weight:400;"> &euro;</span></td>
              </tr>
            </table>
          </td>
        </tr>
      </table>

      <div style="text-align:center;margin-bottom:20px;">
        <p style="color:${TEXT_SECONDARY};font-size:13px;margin:0 0 20px;">N'h&eacute;sitez pas &agrave; reprendre rendez-vous en ligne.</p>
        <a href="${bookAgainUrl}" style="display:inline-block;background:${ACCENT};color:#FFFFFF;padding:16px 40px;border-radius:12px;text-decoration:none;font-weight:700;font-size:14px;letter-spacing:0.3px;">
          Reprendre rendez-vous
        </a>
      </div>`, { showHero: false });

  await brevoEmail(email, `RDV annulé - ${service_name} le ${dateFormatted}`, html, {
    type: 'cancellation_email', recipientName: first_name,
  });
  logger.info('Cancellation email sent', { email });
}

async function sendRescheduleEmail({ email, first_name, service_name, old_date, old_time, new_date, new_time, price, cancel_token, booking_id }) {
  if (!email) {
    logger.warn('No email, skipping reschedule email');
    return;
  }

  const oldDateFormatted = escapeHtml(formatDateFR(old_date));
  const oldTimeFormatted = escapeHtml(formatTime(old_time));
  const newDateFormatted = escapeHtml(formatDateFR(new_date));
  const newTimeFormatted = escapeHtml(formatTime(new_time));
  const priceFormatted = escapeHtml((price / 100).toFixed(2).replace('.', ','));
  service_name = escapeHtml(service_name);

  const manageUrl = cancel_token && booking_id
    ? `${config.siteUrl}${config.salon.bookingPath}/mon-rdv.html?id=${booking_id}&token=${cancel_token}`
    : null;

  const html = emailShell(`
      <div style="text-align:center;margin-bottom:32px;">
        <h2 style="font-size:24px;font-weight:700;margin:0;color:${TEXT_PRIMARY};letter-spacing:-0.3px;">Rendez-vous d&eacute;plac&eacute;</h2>
        <p style="color:${TEXT_SECONDARY};font-size:14px;margin:8px 0 0;">
          Votre cr&eacute;neau a &eacute;t&eacute; modifi&eacute; avec succ&egrave;s.
        </p>
      </div>

      <!-- Ancien creneau -->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${CARD_BG};border:1px solid ${CARD_BORDER};border-radius:16px;margin-bottom:16px;opacity:0.6;">
        <tr>
          <td style="padding:16px 20px;border-radius:16px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
              <tr>
                <td style="padding:4px 0;color:${TEXT_MUTED};font-size:11px;text-transform:uppercase;letter-spacing:1.5px;">Ancien cr&eacute;neau</td>
                <td style="padding:4px 0;color:${TEXT_MUTED};font-size:14px;text-align:right;text-decoration:line-through;">
                  ${oldDateFormatted} &agrave; ${oldTimeFormatted}
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>

      <!-- Nouveau creneau -->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${CARD_BG};border:1px solid ${CARD_BORDER};border-radius:16px;margin-bottom:28px;">
        <tr><td style="height:3px;background:linear-gradient(90deg, ${ACCENT_DIM}, ${ACCENT}, ${ACCENT_DIM});font-size:0;line-height:0;">&nbsp;</td></tr>
        <tr>
          <td style="padding:24px;">
            <p style="margin:0 0 16px;color:${ACCENT};font-size:11px;text-transform:uppercase;letter-spacing:2px;font-weight:600;">Nouveau cr&eacute;neau</p>

            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${BG};border:1px solid ${CARD_BORDER};border-radius:12px;margin-bottom:20px;">
              <tr>
                <td style="text-align:center;padding:16px;border-radius:12px;">
                  <p style="margin:0;color:${ACCENT};font-size:32px;font-weight:800;letter-spacing:1px;">${newTimeFormatted}</p>
                  <p style="margin:4px 0 0;color:${TEXT_SECONDARY};font-size:14px;">${newDateFormatted}</p>
                </td>
              </tr>
            </table>

            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
              <tr>
                <td style="padding:10px 0;color:${TEXT_MUTED};font-size:12px;text-transform:uppercase;letter-spacing:1px;vertical-align:middle;width:100px;">Prestation</td>
                <td style="padding:10px 0;color:${TEXT_PRIMARY};font-size:15px;font-weight:600;text-align:right;">${service_name}</td>
              </tr>
              <tr><td colspan="2" style="padding:0;border-top:1px solid ${CARD_BORDER};"></td></tr>
              <tr>
                <td style="padding:10px 0;color:${TEXT_MUTED};font-size:12px;text-transform:uppercase;letter-spacing:1px;vertical-align:middle;">Adresse</td>
                <td style="padding:10px 0;color:${TEXT_SECONDARY};font-size:13px;text-align:right;">${escapeHtml(config.salon.address)}</td>
              </tr>
              <tr><td colspan="2" style="padding:0;border-top:1px solid ${CARD_BORDER};"></td></tr>
              <tr>
                <td style="padding:12px 0 4px;color:${TEXT_MUTED};font-size:12px;text-transform:uppercase;letter-spacing:1px;vertical-align:middle;">Prix</td>
                <td style="padding:12px 0 4px;color:${ACCENT};font-size:22px;font-weight:800;text-align:right;">${priceFormatted}<span style="font-size:14px;font-weight:400;color:${TEXT_MUTED};"> &euro;</span></td>
              </tr>
            </table>
          </td>
        </tr>
      </table>

      ${manageUrl ? `<div style="text-align:center;margin-bottom:20px;">
        <a href="${manageUrl}" style="display:inline-block;background:${ACCENT};color:#FFFFFF;padding:16px 40px;border-radius:12px;text-decoration:none;font-weight:700;font-size:14px;letter-spacing:0.3px;">
          G&eacute;rer mon rendez-vous
        </a>
      </div>
      <p style="text-align:center;color:${TEXT_MUTED};font-size:11px;margin:0;">
        Modification ou annulation gratuite jusqu'&agrave; 24h avant
      </p>` : ''}`, { showHero: false });

  await brevoEmail(email, `RDV déplacé - ${service_name} le ${newDateFormatted} à ${newTimeFormatted}`, html, {
    bookingId: booking_id, type: 'reschedule_email', recipientName: first_name,
  });
  logger.info('Reschedule email sent', { email });
}

async function sendResetPasswordEmail({ email, first_name, resetUrl }) {
  if (!config.brevo.apiKey) {
    logger.warn('Brevo API key not configured, logging reset URL instead');
    logger.info('Password reset URL', { email, resetUrl });
    return;
  }

  first_name = escapeHtml(first_name);

  const html = emailShell(`
      <div style="text-align:center;margin-bottom:32px;">
        <h2 style="font-size:24px;font-weight:700;margin:0;color:${TEXT_PRIMARY};letter-spacing:-0.3px;">R&eacute;initialiser votre mot de passe</h2>
      </div>

      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${CARD_BG};border:1px solid ${CARD_BORDER};border-radius:16px;margin-bottom:28px;">
        <tr><td style="height:3px;background:linear-gradient(90deg, ${ACCENT_DIM}, ${ACCENT}, ${ACCENT_DIM});font-size:0;line-height:0;">&nbsp;</td></tr>
        <tr>
          <td style="padding:28px 24px;">
            <p style="margin:0 0 24px;color:${TEXT_SECONDARY};font-size:14px;line-height:1.7;">
              Bonjour${first_name ? ` ${first_name}` : ''},<br><br>
              Vous avez demand&eacute; la r&eacute;initialisation de votre mot de passe. Cliquez sur le bouton ci-dessous pour en choisir un nouveau.
            </p>
            <div style="text-align:center;">
              <a href="${resetUrl}" style="display:inline-block;background:${ACCENT};color:#FFFFFF;padding:16px 40px;border-radius:12px;text-decoration:none;font-weight:700;font-size:14px;letter-spacing:0.3px;">
                Nouveau mot de passe
              </a>
            </div>
          </td>
        </tr>
      </table>

      <div style="text-align:center;color:${TEXT_MUTED};font-size:11px;line-height:1.6;">
        <p style="margin:0 0 4px;">Ce lien expire dans 1 heure.</p>
        <p style="margin:0;">Si vous n'avez pas fait cette demande, ignorez cet email.</p>
      </div>`, { showHero: false });

  await brevoEmail(email, 'Réinitialisation de votre mot de passe — La Maison du Regard', html, {
    type: 'reset_password_email',
  });
  logger.info('Reset password email sent', { email });
}

/**
 * Send SMS reminder directly (without DB update — caller handles it)
 */
async function sendReminderSMSDirect(data) {
  const rdvUrl = `${config.apiUrl}/r/rdv/${data.booking_id}/${data.cancel_token}`;
  const timeFormatted = formatTime(data.start_time);
  const dateFR = formatDateFR(typeof data.date === 'string' ? data.date.slice(0, 10) : data.date);

  const message = `La Maison du Regard - Rappel\n\nVotre RDV ${data.service_name || ''} le ${dateFR} a ${timeFormatted}.\n\n${config.salon.address}\n\nGerer votre RDV : ${rdvUrl}`;

  await brevoSMS(data.phone, message);
}

// ============================================
// Email HTML templates — PEACH/GOLD branding
// ============================================

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function htmlToText(html) {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/tr>/gi, '\n')
    .replace(/<\/h[1-6]>/gi, '\n\n')
    .replace(/<a[^>]+href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, '$2 ($1)')
    .replace(/&eacute;/g, 'é').replace(/&agrave;/g, 'à').replace(/&euro;/g, '€')
    .replace(/&laquo;/g, '«').replace(/&raquo;/g, '»').replace(/&mdash;/g, '—')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Design tokens — Peach/Gold luxury
const BG = '#FFF5F0';
const CARD_BG = '#FFFFFF';
const CARD_BORDER = '#F0E0D6';
const TEXT_PRIMARY = '#3D2C2E';
const TEXT_SECONDARY = '#6B5558';
const TEXT_MUTED = '#9A8285';
const ACCENT = '#C9A96E';
const ACCENT_DIM = '#D4B98A';

function emailShell(content, { showHero = true, marketing = false } = {}) {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;600;700;800&display=swap" rel="stylesheet">
</head>
<body style="margin:0;padding:0;background-color:${BG};font-family:'Montserrat','Helvetica Neue',Arial,sans-serif;-webkit-font-smoothing:antialiased;" bgcolor="${BG}">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${BG}" style="background-color:${BG};">
    <tr>
      <td align="center" style="padding:20px 0;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" bgcolor="${CARD_BG}" style="max-width:600px;width:100%;background-color:${CARD_BG};border:1px solid ${CARD_BORDER};border-radius:20px;overflow:hidden;">

    ${showHero ? `
          <!-- HERO -->
          <tr>
            <td bgcolor="${CARD_BG}" style="background-color:${CARD_BG};text-align:center;padding:40px 24px 24px;">
              <h1 style="margin:0;color:${TEXT_PRIMARY};font-size:26px;font-weight:800;letter-spacing:1px;">La Maison du Regard</h1>
              <p style="margin:8px 0 0;color:${TEXT_MUTED};font-size:11px;letter-spacing:3px;text-transform:uppercase;font-weight:600;">Beauté du regard</p>
            </td>
          </tr>
          <tr>
            <td style="height:2px;background:linear-gradient(90deg, transparent 0%, ${ACCENT_DIM} 30%, ${ACCENT} 50%, ${ACCENT_DIM} 70%, transparent 100%);font-size:0;line-height:0;">&nbsp;</td>
          </tr>
    ` : `
          <!-- Compact header -->
          <tr>
            <td bgcolor="${CARD_BG}" style="background-color:${CARD_BG};text-align:center;padding:28px 24px 16px;border-bottom:1px solid ${CARD_BORDER};">
              <h1 style="margin:0;color:${TEXT_PRIMARY};font-size:20px;font-weight:800;letter-spacing:1px;">La Maison du Regard</h1>
            </td>
          </tr>
    `}

          <!-- CONTENT -->
          <tr>
            <td bgcolor="${CARD_BG}" style="background-color:${CARD_BG};padding:36px 32px 40px;color:${TEXT_PRIMARY};">
              ${content}
            </td>
          </tr>

          <!-- FOOTER -->
          <tr>
            <td bgcolor="${CARD_BG}" style="background-color:${CARD_BG};border-top:1px solid ${CARD_BORDER};padding:24px 32px 28px;text-align:center;">
              <p style="margin:0 0 4px;color:${TEXT_MUTED};font-size:11px;letter-spacing:0.3px;">${escapeHtml(config.salon.name)} &mdash; ${escapeHtml(config.salon.address)}</p>
              <p style="margin:0;color:${TEXT_MUTED};font-size:10px;opacity:0.6;">Paiement sur place uniquement</p>
              ${marketing ? `<p style="margin:8px 0 0;color:${TEXT_MUTED};font-size:10px;opacity:0.5;">Si vous ne souhaitez plus recevoir ces emails, r&eacute;pondez &laquo;&nbsp;STOP&nbsp;&raquo; &agrave; cet email.</p>` : ''}
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function buildConfirmationEmailHTML({ firstName, serviceName, date, time, price, duration, cancelUrl }) {
  firstName = escapeHtml(firstName);
  serviceName = escapeHtml(serviceName);
  date = escapeHtml(date);
  time = escapeHtml(time);
  price = escapeHtml(price);

  const durationStr = duration ? `${duration} min` : '';

  const content = `
      <div style="text-align:center;margin-bottom:32px;">
        <h2 style="font-size:24px;font-weight:700;margin:0;color:${TEXT_PRIMARY};letter-spacing:-0.3px;">Rendez-vous confirm&eacute;</h2>
        <p style="color:${TEXT_SECONDARY};font-size:14px;margin:8px 0 0;">
          ${firstName ? `${firstName}, votre` : 'Votre'} r&eacute;servation est enregistr&eacute;e.
        </p>
      </div>

      <!-- Time highlight -->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${BG};border:1px solid ${CARD_BORDER};border-radius:16px;margin-bottom:28px;">
        <tr>
          <td style="text-align:center;padding:20px;border-radius:16px;">
            <p style="margin:0 0 4px;color:${TEXT_MUTED};font-size:11px;text-transform:uppercase;letter-spacing:2px;">Votre rendez-vous</p>
            <p style="margin:0;color:${ACCENT};font-size:32px;font-weight:800;letter-spacing:1px;">${time}</p>
            <p style="margin:4px 0 0;color:${TEXT_SECONDARY};font-size:14px;">${date}</p>
          </td>
        </tr>
      </table>

      <!-- Detail card -->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${BG};border:1px solid ${CARD_BORDER};border-radius:16px;margin-bottom:28px;">
        <tr>
          <td style="height:3px;background:linear-gradient(90deg, ${ACCENT_DIM}, ${ACCENT}, ${ACCENT_DIM});font-size:0;line-height:0;">&nbsp;</td>
        </tr>
        <tr>
          <td style="padding:24px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
              <tr>
                <td style="padding:10px 0;color:${TEXT_MUTED};font-size:12px;text-transform:uppercase;letter-spacing:1px;vertical-align:middle;width:100px;">Prestation</td>
                <td style="padding:10px 0;color:${TEXT_PRIMARY};font-size:15px;font-weight:600;text-align:right;">${serviceName}</td>
              </tr>
              <tr><td colspan="2" style="padding:0;border-top:1px solid ${CARD_BORDER};"></td></tr>
              ${durationStr ? `
              <tr>
                <td style="padding:10px 0;color:${TEXT_MUTED};font-size:12px;text-transform:uppercase;letter-spacing:1px;vertical-align:middle;">Dur&eacute;e</td>
                <td style="padding:10px 0;color:${TEXT_SECONDARY};font-size:14px;text-align:right;">${durationStr}</td>
              </tr>
              <tr><td colspan="2" style="padding:0;border-top:1px solid ${CARD_BORDER};"></td></tr>
              ` : ''}
              <tr>
                <td style="padding:10px 0;color:${TEXT_MUTED};font-size:12px;text-transform:uppercase;letter-spacing:1px;vertical-align:middle;">Adresse</td>
                <td style="padding:10px 0;color:${TEXT_SECONDARY};font-size:13px;text-align:right;"><a href="${config.salon.mapsUrl}" style="color:${TEXT_SECONDARY};text-decoration:underline;">${escapeHtml(config.salon.address)}</a></td>
              </tr>
              <tr><td colspan="2" style="padding:0;border-top:1px solid ${CARD_BORDER};"></td></tr>
              <tr>
                <td style="padding:12px 0 4px;color:${TEXT_MUTED};font-size:12px;text-transform:uppercase;letter-spacing:1px;vertical-align:middle;">Prix</td>
                <td style="padding:12px 0 4px;color:${ACCENT};font-size:22px;font-weight:800;text-align:right;">${price}<span style="font-size:14px;font-weight:400;color:${TEXT_MUTED};"> &euro;</span></td>
              </tr>
            </table>
          </td>
        </tr>
      </table>

      <!-- CTA -->
      <div style="text-align:center;margin-bottom:20px;">
        <a href="${cancelUrl}" style="display:inline-block;background-color:${ACCENT};color:#FFFFFF;padding:16px 40px;border-radius:12px;text-decoration:none;font-weight:700;font-size:14px;letter-spacing:0.3px;">
          G&eacute;rer mon rendez-vous
        </a>
      </div>
      <p style="text-align:center;color:${TEXT_MUTED};font-size:11px;margin:0;">
        Modification ou annulation gratuite jusqu'&agrave; 24h avant
      </p>`;

  return emailShell(content);
}

// ============================================
// Helpers
// ============================================

function formatDateFR(dateStr) {
  const days = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
  const months = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin',
    'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

  const d = new Date(dateStr + 'T00:00:00');
  return `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

function formatTime(timeStr) {
  if (!timeStr) return '';
  const str = typeof timeStr === 'string' ? timeStr : timeStr.toString();
  return str.substring(0, 5); // HH:MM
}

function formatPhoneInternational(phone) {
  let cleaned = phone.replace(/[\s.-]/g, '');
  if (cleaned.startsWith('0')) {
    cleaned = '+33' + cleaned.substring(1);
  }
  if (!cleaned.startsWith('+')) {
    cleaned = '+33' + cleaned;
  }
  return cleaned;
}

function getNextRetryTime(attempts) {
  const delayMinutes = NOTIFICATION_RETRY_DELAYS[Math.min(attempts - 1, NOTIFICATION_RETRY_DELAYS.length - 1)];
  const next = new Date();
  next.setMinutes(next.getMinutes() + delayMinutes);
  return next;
}

module.exports = {
  queueNotification,
  processPendingNotifications,
  sendConfirmationEmail,
  sendCancellationEmail,
  sendRescheduleEmail,
  sendResetPasswordEmail,
  sendReminderSMSDirect,
  brevoSMS,
  brevoEmail,
  formatDateFR,
  formatTime,
  formatPhoneInternational,
  escapeHtml,
  emailShell,
  isCircuitOpen,
};
