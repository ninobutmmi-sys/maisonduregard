// ============================================
// La Maison du Regard — Admin Schedule Routes
// (replaces barbers.js — single practitioner)
// ============================================

const { Router } = require('express');
const { body, param } = require('express-validator');
const { handleValidation } = require('../../middleware/validate');
const { ApiError } = require('../../utils/errors');
const db = require('../../config/database');

const router = Router();
const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ============================================
// GET /api/admin/schedule — Get weekly schedule + overrides
// ============================================
router.get('/', async (req, res, next) => {
  try {
    const schedules = await db.query(
      'SELECT * FROM schedules ORDER BY day_of_week'
    );

    const overrides = await db.query(
      `SELECT * FROM schedule_overrides
       WHERE date >= CURRENT_DATE
       ORDER BY date`
    );

    res.json({
      weekly: schedules.rows,
      overrides: overrides.rows,
    });
  } catch (error) {
    next(error);
  }
});

// ============================================
// PUT /api/admin/schedule — Update weekly schedule
// ============================================
router.put('/',
  [
    body('schedules').isArray().withMessage('Tableau d\'horaires requis'),
    body('schedules.*.day_of_week').isInt({ min: 0, max: 6 }),
    body('schedules.*.is_working').isBoolean(),
  ],
  handleValidation,
  async (req, res, next) => {
    try {
      const { schedules } = req.body;

      const client = await db.pool.connect();
      try {
        await client.query('BEGIN');

        await client.query('DELETE FROM schedules');

        for (const schedule of schedules) {
          const startTime = schedule.is_working ? (schedule.start_time || '09:00').slice(0, 5) : '09:00';
          const endTime = schedule.is_working ? (schedule.end_time || '19:00').slice(0, 5) : '19:00';
          const breakStart = schedule.is_working && schedule.break_start ? schedule.break_start.slice(0, 5) : null;
          const breakEnd = schedule.is_working && schedule.break_end ? schedule.break_end.slice(0, 5) : null;

          await client.query(
            `INSERT INTO schedules (day_of_week, start_time, end_time, is_working, break_start, break_end)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [schedule.day_of_week, startTime, endTime, schedule.is_working, breakStart, breakEnd]
          );
        }

        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }

      const result = await db.query(
        'SELECT * FROM schedules ORDER BY day_of_week'
      );

      res.json(result.rows);
    } catch (error) {
      next(error);
    }
  }
);

// ============================================
// POST /api/admin/schedule/overrides — Add schedule override
// ============================================
router.post('/overrides',
  [
    body('date').matches(/^\d{4}-\d{2}-\d{2}$/).withMessage('Date invalide'),
    body('is_day_off').isBoolean(),
    body('start_time').optional().matches(/^\d{2}:\d{2}$/),
    body('end_time').optional().matches(/^\d{2}:\d{2}$/),
    body('reason').optional().trim().isLength({ max: 500 }),
    body('end_time').custom((value, { req: r }) => {
      if (r.body.is_day_off === false || r.body.is_day_off === 'false') {
        if (r.body.start_time && value && value <= r.body.start_time) {
          throw new Error('L\'heure de fin doit être après l\'heure de début');
        }
      }
      return true;
    }),
  ],
  handleValidation,
  async (req, res, next) => {
    try {
      const { date, is_day_off, start_time, end_time, reason } = req.body;

      const result = await db.query(
        `INSERT INTO schedule_overrides (date, is_day_off, start_time, end_time, reason)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (date) DO UPDATE SET
           is_day_off = $2, start_time = $3, end_time = $4, reason = $5
         RETURNING *`,
        [date, is_day_off, is_day_off ? null : start_time, is_day_off ? null : end_time, reason]
      );

      res.status(201).json(result.rows[0]);
    } catch (error) {
      next(error);
    }
  }
);

// ============================================
// DELETE /api/admin/schedule/overrides/:id — Remove an override
// ============================================
router.delete('/overrides/:id',
  [param('id').matches(uuidRegex)],
  handleValidation,
  async (req, res, next) => {
    try {
      const result = await db.query(
        'DELETE FROM schedule_overrides WHERE id = $1 RETURNING id',
        [req.params.id]
      );

      if (result.rows.length === 0) {
        throw ApiError.notFound('Exception introuvable');
      }

      res.json({ message: 'Exception supprimée' });
    } catch (error) {
      next(error);
    }
  }
);

// ============================================
// GET /api/admin/schedule/practitioner — Get practitioner info
// ============================================
router.get('/practitioner', async (req, res, next) => {
  try {
    const result = await db.query(
      `SELECT id, name, email, role, photo_url, is_active, created_at
       FROM practitioner
       WHERE deleted_at IS NULL
       LIMIT 1`
    );

    if (result.rows.length === 0) {
      throw ApiError.notFound('Praticienne introuvable');
    }

    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

// ============================================
// PUT /api/admin/schedule/practitioner — Update practitioner info
// ============================================
router.put('/practitioner',
  [
    body('name').optional().trim().notEmpty().isLength({ max: 100 }),
    body('role').optional().trim().isLength({ max: 200 }),
    body('photo_url').optional().trim(),
  ],
  handleValidation,
  async (req, res, next) => {
    try {
      const { name, role, photo_url } = req.body;

      const fields = [];
      const values = [];
      let paramIndex = 1;

      if (name !== undefined) { fields.push(`name = $${paramIndex++}`); values.push(name); }
      if (role !== undefined) { fields.push(`role = $${paramIndex++}`); values.push(role); }
      if (photo_url !== undefined) { fields.push(`photo_url = $${paramIndex++}`); values.push(photo_url); }

      if (fields.length === 0) {
        throw ApiError.badRequest('Aucune donnée à mettre à jour');
      }

      const result = await db.query(
        `UPDATE practitioner SET ${fields.join(', ')}
         WHERE deleted_at IS NULL
         RETURNING id, name, role, photo_url, email, is_active`,
        values
      );

      if (result.rows.length === 0) {
        throw ApiError.notFound('Praticienne introuvable');
      }

      res.json(result.rows[0]);
    } catch (error) {
      next(error);
    }
  }
);

module.exports = router;
