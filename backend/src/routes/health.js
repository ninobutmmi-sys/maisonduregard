// ============================================
// La Maison du Regard — Health Routes
// ============================================

const { Router } = require('express');
const db = require('../config/database');

const router = Router();

/**
 * GET /api/health
 */
router.get('/', async (req, res) => {
  const dbHealth = await db.healthCheck();
  const status = dbHealth.ok ? 200 : 503;

  res.status(status).json({
    status: dbHealth.ok ? 'ok' : 'degraded',
    timestamp: new Date().toISOString(),
    database: dbHealth.ok ? 'connected' : 'disconnected',
    uptime: Math.floor(process.uptime()),
  });
});

/**
 * GET /api/health/ping
 */
router.get('/ping', (req, res) => {
  res.send('pong');
});

module.exports = router;
