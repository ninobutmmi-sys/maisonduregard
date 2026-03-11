// ============================================
// La Maison du Regard — Admin Blocked Slots Routes
// (single practitioner — no barber_id)
// ============================================

const { Router } = require('express');
const { body, param, query } = require('express-validator');
const { handleValidation } = require('../../middleware/validate');
const { ApiError } = require('../../utils/errors');
const db = require('../../config/database');

const router = Router();
const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ============================================
// GET /api/admin/blocked-slots — List blocked slots
// ============================================
router.get('/',
  [
    query('date').optional().matches(/^\d{4}-\d{2}-\d{2}$/),
    query('view').optional().isIn(['day', 'week']),
  ],
  handleValidation,
  async (req, res, next) => {
    try {
      const { date, view } = req.query;
      const targetDate = date || new Date().toISOString().split('T')[0];
      const viewType = view || 'day';

      let dateCondition;
      const params = [];
      let paramIndex = 1;

      if (viewType === 'week') {
        const d = new Date(targetDate + 'T00:00:00');
        const dayIndex = d.getDay() === 0 ? 6 : d.getDay() - 1; // Monday=0
        const monday = new Date(d);
        monday.setDate(d.getDate() - dayIndex);
        const sunday = new Date(monday);
        sunday.setDate(monday.getDate() + 6);

        dateCondition = `bs.date BETWEEN $${paramIndex} AND $${paramIndex + 1}`;
        params.push(monday.toISOString().split('T')[0], sunday.toISOString().split('T')[0]);
        paramIndex += 2;
      } else {
        dateCondition = `bs.date = $${paramIndex}`;
        params.push(targetDate);
        paramIndex += 1;
      }

      const result = await db.query(
        `SELECT bs.id, bs.date, bs.start_time, bs.end_time,
                bs.reason, bs.type, bs.created_at
         FROM blocked_slots bs
         WHERE ${dateCondition}
         ORDER BY bs.date, bs.start_time`,
        params
      );

      res.json(result.rows);
    } catch (error) {
      next(error);
    }
  }
);

// ============================================
// POST /api/admin/blocked-slots — Create a blocked slot
// ============================================
router.post('/',
  [
    body('date').matches(/^\d{4}-\d{2}-\d{2}$/).withMessage('Date invalide'),
    body('start_time').matches(/^\d{2}:\d{2}$/).withMessage('Heure de début invalide'),
    body('end_time').matches(/^\d{2}:\d{2}$/).withMessage('Heure de fin invalide'),
    body('type').isIn(['break', 'personal', 'closed']).withMessage('Type invalide'),
    body('reason').optional({ values: 'falsy' }).isString().isLength({ max: 255 }),
  ],
  handleValidation,
  async (req, res, next) => {
    try {
      const { date, start_time, end_time, reason, type } = req.body;

      if (start_time >= end_time) {
        throw ApiError.badRequest('L\'heure de fin doit être après l\'heure de début');
      }

      // Auto-delete overlapping blocked slots
      await db.query(
        `DELETE FROM blocked_slots WHERE date = $1 AND start_time < $2 AND end_time > $3`,
        [date, end_time, start_time]
      );

      // Check booking overlap
      const overlap = await db.query(
        `SELECT id FROM bookings
         WHERE date = $1 AND status != 'cancelled' AND deleted_at IS NULL
           AND start_time < $2 AND end_time > $3`,
        [date, end_time, start_time]
      );
      if (overlap.rows.length > 0) {
        throw ApiError.conflict('Ce créneau chevauche un rendez-vous existant');
      }

      const result = await db.query(
        `INSERT INTO blocked_slots (date, start_time, end_time, reason, type)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [date, start_time, end_time, reason || null, type]
      );

      res.status(201).json(result.rows[0]);
    } catch (error) {
      next(error);
    }
  }
);

// ============================================
// DELETE /api/admin/blocked-slots/:id — Remove a blocked slot
// ============================================
router.delete('/:id',
  [param('id').matches(uuidRegex)],
  handleValidation,
  async (req, res, next) => {
    try {
      const result = await db.query(
        'DELETE FROM blocked_slots WHERE id = $1 RETURNING id',
        [req.params.id]
      );

      if (result.rows.length === 0) {
        throw ApiError.notFound('Créneau bloqué introuvable');
      }

      res.json({ message: 'Créneau bloqué supprimé' });
    } catch (error) {
      next(error);
    }
  }
);

module.exports = router;
