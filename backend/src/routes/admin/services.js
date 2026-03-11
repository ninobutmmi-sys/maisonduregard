// ============================================
// La Maison du Regard — Admin Service Routes
// ============================================

const { Router } = require('express');
const { body, param } = require('express-validator');
const { handleValidation } = require('../../middleware/validate');
const { ApiError } = require('../../utils/errors');
const db = require('../../config/database');

const router = Router();
const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ============================================
// GET /api/admin/services — All services (including inactive)
// ============================================
router.get('/', async (req, res, next) => {
  try {
    const result = await db.query(
      `SELECT id, name, category, description, price, duration, is_active,
              is_popular, sort_order, color, created_at
       FROM services
       WHERE deleted_at IS NULL
       ORDER BY sort_order`
    );
    res.json(result.rows);
  } catch (error) {
    next(error);
  }
});

// ============================================
// POST /api/admin/services — Add a service
// ============================================
router.post('/',
  [
    body('name').trim().notEmpty().withMessage('Nom requis').isLength({ max: 200 }),
    body('category').isIn(['sourcils', 'maquillage_permanent', 'cils']).withMessage('Catégorie invalide'),
    body('description').optional({ values: 'falsy' }).trim().isLength({ max: 1000 }),
    body('price').isInt({ min: 0 }).withMessage('Prix invalide (en centimes)'),
    body('duration').isInt({ min: 5, max: 480 }).withMessage('Durée invalide (5-480 minutes)'),
    body('color').optional().matches(/^#[0-9a-fA-F]{6}$/).withMessage('Couleur invalide (format #RRGGBB)'),
    body('is_popular').optional().isBoolean(),
  ],
  handleValidation,
  async (req, res, next) => {
    try {
      const { name, category, description, price, duration, color, is_popular } = req.body;

      // Get max sort order
      const maxOrder = await db.query(
        'SELECT COALESCE(MAX(sort_order), 0) + 1 as next FROM services WHERE deleted_at IS NULL'
      );

      const result = await db.query(
        `INSERT INTO services (name, category, description, price, duration, sort_order, color, is_popular)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
        [name, category, description || null, price, duration, maxOrder.rows[0].next, color || '#C9A96E', is_popular || false]
      );

      res.status(201).json(result.rows[0]);
    } catch (error) {
      next(error);
    }
  }
);

// ============================================
// PUT /api/admin/services/:id — Update a service
// ============================================
router.put('/:id',
  [
    param('id').matches(uuidRegex),
    body('name').optional().trim().notEmpty().isLength({ max: 200 }),
    body('category').optional().isIn(['sourcils', 'maquillage_permanent', 'cils']),
    body('description').optional({ values: 'falsy' }).trim().isLength({ max: 1000 }),
    body('price').optional().isInt({ min: 0 }),
    body('duration').optional().isInt({ min: 5, max: 480 }),
    body('is_active').optional().isBoolean(),
    body('is_popular').optional().isBoolean(),
    body('sort_order').optional().isInt({ min: 0 }),
    body('color').optional().matches(/^#[0-9a-fA-F]{6}$/).withMessage('Couleur invalide (format #RRGGBB)'),
  ],
  handleValidation,
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const { name, category, description, price, duration, is_active, is_popular, sort_order, color } = req.body;

      const fields = [];
      const values = [];
      let paramIndex = 1;

      if (name !== undefined) { fields.push(`name = $${paramIndex++}`); values.push(name); }
      if (category !== undefined) { fields.push(`category = $${paramIndex++}`); values.push(category); }
      if (description !== undefined) { fields.push(`description = $${paramIndex++}`); values.push(description || null); }
      if (price !== undefined) { fields.push(`price = $${paramIndex++}`); values.push(price); }
      if (duration !== undefined) { fields.push(`duration = $${paramIndex++}`); values.push(duration); }
      if (is_active !== undefined) { fields.push(`is_active = $${paramIndex++}`); values.push(is_active); }
      if (is_popular !== undefined) { fields.push(`is_popular = $${paramIndex++}`); values.push(is_popular); }
      if (sort_order !== undefined) { fields.push(`sort_order = $${paramIndex++}`); values.push(sort_order); }
      if (color !== undefined) { fields.push(`color = $${paramIndex++}`); values.push(color); }

      if (fields.length === 0) {
        throw ApiError.badRequest('Aucune donnée à mettre à jour');
      }

      values.push(id);
      const result = await db.query(
        `UPDATE services SET ${fields.join(', ')}
         WHERE id = $${paramIndex} AND deleted_at IS NULL
         RETURNING *`,
        values
      );

      if (result.rows.length === 0) {
        throw ApiError.notFound('Prestation introuvable');
      }

      res.json(result.rows[0]);
    } catch (error) {
      next(error);
    }
  }
);

// ============================================
// DELETE /api/admin/services/:id — Soft delete
// ============================================
router.delete('/:id',
  [param('id').matches(uuidRegex)],
  handleValidation,
  async (req, res, next) => {
    try {
      const result = await db.query(
        'UPDATE services SET deleted_at = NOW(), is_active = false WHERE id = $1 AND deleted_at IS NULL RETURNING id',
        [req.params.id]
      );

      if (result.rows.length === 0) {
        throw ApiError.notFound('Prestation introuvable');
      }

      res.json({ message: 'Prestation supprimée' });
    } catch (error) {
      next(error);
    }
  }
);

module.exports = router;
