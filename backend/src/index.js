// ============================================
// La Maison du Regard API — Main Server
// ============================================

const config = require('./config/env');
const db = require('./config/database');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const cron = require('node-cron');
const logger = require('./utils/logger');
const { ApiError } = require('./utils/errors');
const { publicLimiter, adminLimiter } = require('./middleware/rateLimiter');
const { requireAuth, requirePractitioner } = require('./middleware/auth');
const { GRACEFUL_SHUTDOWN_TIMEOUT_MS } = require('./constants');

// Route imports
const healthRoutes = require('./routes/health');
const authRoutes = require('./routes/auth');
const bookingRoutes = require('./routes/bookings');
const clientRoutes = require('./routes/client');
const adminBookingRoutes = require('./routes/admin/bookings');
const adminServiceRoutes = require('./routes/admin/services');
const adminScheduleRoutes = require('./routes/admin/schedule');
const adminClientRoutes = require('./routes/admin/clients');
const adminAnalyticsRoutes = require('./routes/admin/analytics');
const blockedSlotsRoutes = require('./routes/admin/blockedSlots');
const smsRoutes = require('./routes/admin/sms');
const notificationRoutes = require('./routes/admin/notifications');
const automationRoutes = require('./routes/admin/automation');
const systemHealthRoutes = require('./routes/admin/systemHealth');

// Cron job imports
const { queueReminders } = require('./cron/reminders');
const { processQueue, cleanupOldNotifications, cleanupExpiredTokens } = require('./cron/retryNotifications');
const { processAutomationTriggers } = require('./cron/automationTriggers');

// ============================================
// Cron job tracking (in-memory)
// ============================================
const cronStatus = {
  processQueue:         { label: 'File notifications', schedule: '*/2 * * * *', lastRun: null, status: 'idle', error: null },
  queueReminders:       { label: 'SMS rappels J-1',    schedule: '0 18 * * *',  lastRun: null, status: 'idle', error: null },
  cleanupNotifications: { label: 'Cleanup notifs 30j', schedule: '0 3 * * *',   lastRun: null, status: 'idle', error: null },
  cleanupExpiredTokens: { label: 'Cleanup tokens',     schedule: '30 3 * * *',  lastRun: null, status: 'idle', error: null },
  automationTriggers:   { label: 'Triggers auto',      schedule: '*/10 * * * *', lastRun: null, status: 'idle', error: null },
};

// Advisory lock IDs — unique per cron to prevent concurrent execution
const CRON_LOCK_IDS = {
  processQueue: 200001,
  queueReminders: 200002,
  cleanupNotifications: 200004,
  cleanupExpiredTokens: 200005,
  automationTriggers: 200006,
};

/**
 * Wrap a cron function with advisory lock + status tracking.
 * Prevents concurrent execution across multiple instances.
 */
function trackCron(key, fn) {
  return async () => {
    const { getClient } = require('./config/database');
    const lockId = CRON_LOCK_IDS[key];

    const client = await getClient();
    try {
      const lockResult = await client.query('SELECT pg_try_advisory_lock($1) AS acquired', [lockId]);
      if (!lockResult.rows[0].acquired) {
        logger.debug(`Cron ${key} skipped — already running on another instance`);
        return;
      }

      cronStatus[key].status = 'running';
      cronStatus[key].error = null;
      try {
        await fn();
        cronStatus[key].status = 'ok';
        cronStatus[key].lastRun = new Date().toISOString();
      } catch (err) {
        cronStatus[key].status = 'error';
        cronStatus[key].error = err.message;
        cronStatus[key].lastRun = new Date().toISOString();
        logger.error(`Cron ${key} failed`, { error: err.message });
      } finally {
        await client.query('SELECT pg_advisory_unlock($1)', [lockId]);
      }
    } finally {
      client.release();
    }
  };
}

// ============================================
// Express app setup
// ============================================
const app = express();
app.cronStatus = cronStatus;

// Trust Railway's reverse proxy
app.set('trust proxy', 1);

// Security headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'"],
    },
  },
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

// CORS
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no Origin header (direct browser navigation, .ics download)
    if (!origin) {
      return callback(null, true);
    }
    if (config.corsOrigins.includes(origin)) {
      callback(null, true);
    } else {
      logger.warn('CORS blocked request from origin', { origin });
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Cookie parsing (for httpOnly refresh token cookie)
app.use(cookieParser());

// Body parsing
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: false }));

// Request logging
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
    logger[level](`${req.method} ${req.originalUrl}`, {
      status: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip,
    });
  });
  next();
});

// ============================================
// Routes
// ============================================

// Public routes
app.use('/api/health', healthRoutes);
app.use('/api/auth', authRoutes);
app.use('/api', bookingRoutes); // publicLimiter already applied per-route

// Client routes (authenticated)
app.use('/api/client', clientRoutes);

// Admin/practitioner routes (authenticated)
const adminRouter = express.Router();
adminRouter.use(requireAuth, requirePractitioner, adminLimiter);
adminRouter.use('/bookings', adminBookingRoutes);
adminRouter.use('/services', adminServiceRoutes);
adminRouter.use('/schedule', adminScheduleRoutes);
adminRouter.use('/clients', adminClientRoutes);
adminRouter.use('/analytics', adminAnalyticsRoutes);
adminRouter.use('/blocked-slots', blockedSlotsRoutes);
adminRouter.use('/sms', smsRoutes);
adminRouter.use('/notifications', notificationRoutes);
adminRouter.use('/automation', automationRoutes);
adminRouter.use('/system', systemHealthRoutes);
app.use('/api/admin', adminRouter);

// ============================================
// Short redirect URLs (for SMS links)
// ============================================
app.get('/r/avis', publicLimiter, (req, res) => {
  res.redirect(302, config.googleReviewUrl || config.siteUrl);
});

app.get('/r/rdv/:id/:token', publicLimiter, (req, res) => {
  const bookingPath = config.salon.bookingPath || '/pages';
  res.redirect(302, `${config.siteUrl}${bookingPath}/mon-rdv.html?id=${req.params.id}&token=${req.params.token}`);
});

// ============================================
// 404 handler
// ============================================
app.use((req, res) => {
  res.status(404).json({
    error: 'Route introuvable',
    path: req.originalUrl,
  });
});

// ============================================
// Global error handler
// ============================================
app.use((err, req, res, next) => {
  // Handle known API errors
  if (err instanceof ApiError) {
    return res.status(err.statusCode).json({
      error: err.message,
      details: err.details || undefined,
    });
  }

  // Handle CORS errors
  if (err.message === 'Not allowed by CORS') {
    return res.status(403).json({ error: 'Origine non autorisée' });
  }

  // Handle JSON parse errors
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'JSON invalide' });
  }

  // Unknown errors
  logger.error('Unhandled error', {
    error: err.message,
    stack: err.stack,
    path: req.originalUrl,
    method: req.method,
  });

  res.status(500).json({
    error: 'Erreur serveur, réessayez dans quelques instants',
  });
});

// ============================================
// Cron jobs (production only)
// ============================================
if (config.nodeEnv === 'production') {
  cron.schedule('*/2 * * * *',  trackCron('processQueue', processQueue));
  cron.schedule('0 18 * * *',   trackCron('queueReminders', queueReminders));
  cron.schedule('0 3 * * *',    trackCron('cleanupNotifications', cleanupOldNotifications));
  cron.schedule('30 3 * * *',   trackCron('cleanupExpiredTokens', cleanupExpiredTokens));
  cron.schedule('*/10 * * * *', trackCron('automationTriggers', processAutomationTriggers));
  logger.info('Cron jobs enabled (production)');
} else {
  logger.info('Cron jobs disabled (development)');
}

// ============================================
// Start server
// ============================================
const { pool, ensureConnection } = require('./config/database');

if (config.nodeEnv !== 'test') {
  const PORT = config.port;

  ensureConnection().then(() => {
    const server = app.listen(PORT, () => {
      logger.info(`La Maison du Regard API running on port ${PORT}`, {
        env: config.nodeEnv,
        cors: config.corsOrigins,
      });
    });

    // Graceful shutdown
    const gracefulShutdown = (signal) => {
      logger.info(`${signal} received, shutting down gracefully`);
      server.close(() => {
        pool.end().then(() => process.exit(0));
      });
      setTimeout(() => process.exit(1), GRACEFUL_SHUTDOWN_TIMEOUT_MS);
    };
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  });

  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled promise rejection', { reason: reason?.message || reason });
  });

  process.on('uncaughtException', (err) => {
    logger.error('Uncaught exception — process will exit', { error: err.message, stack: err.stack });
    process.exit(1);
  });
}

module.exports = app;
