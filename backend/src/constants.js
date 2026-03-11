// ============================================
// La Maison du Regard — Business Constants
// ============================================

module.exports = {
  // Auth
  BCRYPT_ROUNDS: 12,
  MAX_LOGIN_ATTEMPTS: 5,
  LOCKOUT_MINUTES: 15,
  RESET_TOKEN_EXPIRY_MS: 3600000, // 1 hour

  // Booking rules
  MAX_BOOKING_ADVANCE_MONTHS: 6,
  CANCELLATION_DEADLINE_HOURS: 24, // 24h (longer services than barbershop)
  MIN_BOOKING_LEAD_MINUTES: 5,
  SMS_CONFIRMATION_THRESHOLD_HOURS: 24,

  // Slot intervals
  SLOT_INTERVAL_PUBLIC: 15, // 15min intervals for clients
  SLOT_INTERVAL_ADMIN: 5,  // 5min intervals for admin

  // Schedule
  SCHEDULE_END: '20:00',

  // Notifications
  NOTIFICATION_RETRY_DELAYS: [5, 15, 60], // minutes
  NOTIFICATION_BATCH_SIZE: 10,
  NOTIFICATION_CLEANUP_DAYS: 30,

  // Brevo circuit breaker
  BREVO_CIRCUIT_THRESHOLD: 3,
  BREVO_CIRCUIT_COOLDOWN_MS: 60000, // 60s
  BREVO_REQUEST_TIMEOUT_MS: 15000,

  // Rate limiting
  RATE_LIMIT_PUBLIC_WINDOW_MS: 60 * 1000, // 1 min
  RATE_LIMIT_PUBLIC_MAX: 60,
  RATE_LIMIT_AUTH_WINDOW_MS: 15 * 60 * 1000, // 15 min
  RATE_LIMIT_AUTH_MAX: 10,
  RATE_LIMIT_ADMIN_WINDOW_MS: 60 * 1000, // 1 min
  RATE_LIMIT_ADMIN_MAX: 200,

  // Graceful shutdown
  GRACEFUL_SHUTDOWN_TIMEOUT_MS: 10000,
};
