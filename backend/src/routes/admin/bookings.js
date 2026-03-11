// ============================================
// La Maison du Regard — Admin Booking Routes
// ============================================

const { Router } = require('express');
const { body, param, query } = require('express-validator');
const { handleValidation } = require('../../middleware/validate');
const bookingService = require('../../services/booking');
const { sendCancellationEmail, sendRescheduleEmail } = require('../../services/notification');
const config = require('../../config/env');
const { ApiError } = require('../../utils/errors');
const logger = require('../../utils/logger');
const db = require('../../config/database');

const router = Router();
const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ============================================
// GET /api/admin/bookings — Planning view
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
      let params = [];
      let paramIndex = 1;

      if (viewType === 'week') {
        const d = new Date(targetDate + 'T00:00:00');
        const dayIndex = d.getDay() === 0 ? 6 : d.getDay() - 1;
        const monday = new Date(d);
        monday.setDate(d.getDate() - dayIndex);
        const sunday = new Date(monday);
        sunday.setDate(monday.getDate() + 6);

        dateCondition = `b.date BETWEEN $${paramIndex} AND $${paramIndex + 1}`;
        params.push(monday.toISOString().split('T')[0], sunday.toISOString().split('T')[0]);
        paramIndex += 2;
      } else {
        dateCondition = `b.date = $${paramIndex}`;
        params.push(targetDate);
        paramIndex += 1;
      }

      const result = await db.query(
        `SELECT b.id, b.date, b.start_time, b.end_time, b.status, b.price, b.source,
                b.created_at, b.service_id, b.duration, b.notes,
                s.name as service_name, s.duration as service_duration, s.color as service_color, s.category,
                c.id as client_id, c.first_name as client_first_name,
                c.last_name as client_last_name, c.phone as client_phone,
                c.email as client_email, c.notes as client_notes
         FROM bookings b
         JOIN services s ON b.service_id = s.id
         JOIN clients c ON b.client_id = c.id
         WHERE ${dateCondition}
           AND b.status != 'cancelled' AND b.deleted_at IS NULL
         ORDER BY b.start_time`,
        params
      );

      res.json(result.rows);
    } catch (error) {
      next(error);
    }
  }
);

// ============================================
// GET /api/admin/bookings/history — Full history with filters & pagination
// ============================================
router.get('/history',
  [
    query('from').optional().matches(/^\d{4}-\d{2}-\d{2}$/),
    query('to').optional().matches(/^\d{4}-\d{2}-\d{2}$/),
    query('status').optional().isIn(['confirmed', 'completed', 'no_show', 'cancelled']),
    query('search').optional().isString().trim(),
    query('limit').optional().isInt({ min: 1, max: 200 }).toInt(),
    query('offset').optional().isInt({ min: 0 }).toInt(),
    query('sort').optional().isIn(['date', 'created_at', 'price', 'client_last_name', 'status']),
    query('order').optional().isIn(['asc', 'desc']),
  ],
  handleValidation,
  async (req, res, next) => {
    try {
      const {
        from, to, status, search,
        limit = 50, offset = 0,
        sort = 'date', order = 'desc',
      } = req.query;

      const conditions = ['b.deleted_at IS NULL'];
      const params = [];
      let paramIndex = 1;

      if (from) {
        conditions.push(`b.date >= $${paramIndex}`);
        params.push(from);
        paramIndex++;
      }
      if (to) {
        conditions.push(`b.date <= $${paramIndex}`);
        params.push(to);
        paramIndex++;
      }
      if (status) {
        conditions.push(`b.status = $${paramIndex}`);
        params.push(status);
        paramIndex++;
      }
      if (search) {
        conditions.push(
          `(LOWER(c.first_name) LIKE $${paramIndex}
            OR LOWER(c.last_name) LIKE $${paramIndex}
            OR c.phone LIKE $${paramIndex})`
        );
        params.push(`%${search.toLowerCase()}%`);
        paramIndex++;
      }

      const whereClause = 'WHERE ' + conditions.join(' AND ');

      const sortMap = {
        date: 'b.date, b.start_time',
        created_at: 'b.created_at',
        price: 'b.price',
        client_last_name: 'c.last_name',
        status: 'b.status',
      };
      const sortCol = sortMap[sort] || 'b.date, b.start_time';
      const sortOrder = order === 'asc' ? 'ASC' : 'DESC';

      const countResult = await db.query(
        `SELECT COUNT(*) as total
         FROM bookings b
         JOIN clients c ON b.client_id = c.id
         JOIN services s ON b.service_id = s.id
         ${whereClause}`,
        params
      );

      const dataResult = await db.query(
        `SELECT b.id, b.date, b.start_time, b.end_time, b.status, b.price, b.source,
                b.created_at,
                s.id as service_id, s.name as service_name, s.duration as service_duration, s.category,
                c.id as client_id, c.first_name as client_first_name,
                c.last_name as client_last_name, c.phone as client_phone,
                c.email as client_email
         FROM bookings b
         JOIN services s ON b.service_id = s.id
         JOIN clients c ON b.client_id = c.id
         ${whereClause}
         ORDER BY ${sortCol} ${sortOrder}
         LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
        [...params, limit, offset]
      );

      res.json({
        bookings: dataResult.rows,
        total: parseInt(countResult.rows[0].total, 10),
        limit,
        offset,
      });
    } catch (error) {
      next(error);
    }
  }
);

// ============================================
// POST /api/admin/bookings — Add booking manually
// ============================================
router.post('/',
  [
    body('service_id').matches(uuidRegex).withMessage('Service requis'),
    body('date').matches(/^\d{4}-\d{2}-\d{2}$/).withMessage('Date invalide'),
    body('start_time').matches(/^\d{2}:\d{2}$/).withMessage('Heure invalide'),
    body('first_name').trim().notEmpty().withMessage('Prénom requis').isLength({ max: 100 }),
    body('last_name').optional({ values: 'falsy' }).trim().isLength({ max: 100 }),
    body('phone').optional({ values: 'falsy' }).trim()
      .customSanitizer(v => v ? v.replace(/\s/g, '') : '')
      .custom(v => !v || /^(\+33|0)[1-9]\d{8}$/.test(v)).withMessage('Numéro invalide'),
    body('email').optional({ values: 'falsy' }).isEmail().normalizeEmail(),
    body('duration').optional().isInt({ min: 5, max: 720 }).toInt(),
  ],
  handleValidation,
  async (req, res, next) => {
    try {
      const booking = await bookingService.createBooking({
        ...req.body,
        source: 'manual',
      });
      res.status(201).json(booking);
    } catch (error) {
      next(error);
    }
  }
);

// ============================================
// PUT /api/admin/bookings/:id — Modify a booking
// ============================================
router.put('/:id',
  [
    param('id').matches(uuidRegex),
    body('date').optional().matches(/^\d{4}-\d{2}-\d{2}$/),
    body('start_time').optional().matches(/^\d{2}:\d{2}$/),
    body('end_time').optional().matches(/^\d{2}:\d{2}$/),
    body('service_id').optional().matches(uuidRegex),
    body('notes').optional({ values: 'falsy' }).trim(),
    body('notify_client').optional().isBoolean(),
  ],
  handleValidation,
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const { date, start_time, end_time, service_id, notes, notify_client } = req.body;

      const { addMinutesToTime } = require('../../services/availability');

      const txResult = await db.transaction(async (client) => {
        const current = await client.query(
          `SELECT b.*, c.first_name, c.last_name, c.email, c.phone,
                  s.name as service_name
           FROM bookings b
           JOIN clients c ON b.client_id = c.id
           JOIN services s ON b.service_id = s.id
           WHERE b.id = $1 AND b.deleted_at IS NULL
           FOR UPDATE OF b`,
          [id]
        );
        if (current.rows.length === 0) {
          throw ApiError.notFound('RDV introuvable');
        }

        const booking = current.rows[0];
        const oldDate = typeof booking.date === 'string' ? booking.date.slice(0, 10) : booking.date;
        const oldTime = booking.start_time;

        const newDate = date || oldDate;
        const newStartTime = start_time || booking.start_time;
        const newServiceId = service_id || booking.service_id;

        // Get service duration
        const serviceResult = await client.query('SELECT duration, price, name FROM services WHERE id = $1', [newServiceId]);
        if (serviceResult.rows.length === 0) throw ApiError.badRequest('Service introuvable');

        const { duration, price } = serviceResult.rows[0];
        const newEndTime = end_time || addMinutesToTime(newStartTime, duration);

        // Check for conflicts (excluding current booking)
        const conflictCheck = await client.query(
          `SELECT id FROM bookings
           WHERE date = $1
             AND status != 'cancelled' AND deleted_at IS NULL
             AND id != $2
             AND start_time < $3 AND end_time > $4
           FOR UPDATE`,
          [newDate, id, newEndTime, newStartTime]
        );

        if (conflictCheck.rows.length > 0) {
          throw ApiError.conflict('Ce créneau est déjà pris');
        }

        const updateFields = ['date = $1', 'start_time = $2', 'end_time = $3', 'service_id = $4', 'price = $5'];
        const updateValues = [newDate, newStartTime, newEndTime, newServiceId, price];
        let pi = 6;

        if (notes !== undefined) {
          updateFields.push(`notes = $${pi}`);
          updateValues.push(notes);
          pi++;
        }

        updateValues.push(id);
        const result = await client.query(
          `UPDATE bookings SET ${updateFields.join(', ')} WHERE id = $${pi} RETURNING *`,
          updateValues
        );

        return { row: result.rows[0], booking, oldDate, oldTime, newDate, newStartTime, price, serviceName: serviceResult.rows[0].name };
      });

      // Send reschedule email if date/time changed
      const dateChanged = txResult.newDate !== txResult.oldDate;
      const timeChanged = txResult.newStartTime.slice(0, 5) !== txResult.oldTime.slice(0, 5);
      if (notify_client && (dateChanged || timeChanged) && txResult.booking.email) {
        sendRescheduleEmail({
          email: txResult.booking.email,
          first_name: txResult.booking.first_name,
          service_name: txResult.serviceName,
          old_date: txResult.oldDate,
          old_time: txResult.oldTime,
          new_date: txResult.newDate,
          new_time: txResult.newStartTime,
          price: txResult.price,
          cancel_token: txResult.booking.cancel_token,
          booking_id: txResult.booking.id,
        }).catch((err) => logger.error('Email notification failed', { error: err.message }));
      }

      res.json(txResult.row);
    } catch (error) {
      next(error);
    }
  }
);

// ============================================
// POST /api/admin/bookings/:id/reschedule — Admin reschedule (no 24h limit)
// ============================================
router.post('/:id/reschedule',
  [
    param('id').matches(uuidRegex),
    body('date').matches(/^\d{4}-\d{2}-\d{2}$/).withMessage('Date invalide'),
    body('start_time').matches(/^\d{2}:\d{2}$/).withMessage('Heure invalide'),
    body('notify_client').optional().isBoolean(),
  ],
  handleValidation,
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const { date, start_time, notify_client } = req.body;

      const { addMinutesToTime } = require('../../services/availability');

      const txResult = await db.transaction(async (client) => {
        const bookingResult = await client.query(
          `SELECT b.*, s.duration as service_duration, s.name as service_name, s.price as service_price,
                  c.first_name, c.email
           FROM bookings b
           JOIN services s ON b.service_id = s.id
           JOIN clients c ON b.client_id = c.id
           WHERE b.id = $1 AND b.deleted_at IS NULL
           FOR UPDATE OF b`,
          [id]
        );

        if (bookingResult.rows.length === 0) {
          throw ApiError.notFound('RDV introuvable');
        }

        const booking = bookingResult.rows[0];
        const newEndTime = addMinutesToTime(start_time, booking.service_duration);

        // Check conflicts
        const conflictCheck = await client.query(
          `SELECT id FROM bookings
           WHERE date = $1
             AND status != 'cancelled' AND deleted_at IS NULL
             AND id != $2
             AND start_time < $3 AND end_time > $4
           FOR UPDATE`,
          [date, id, newEndTime, start_time]
        );
        if (conflictCheck.rows.length > 0) {
          throw ApiError.conflict('Ce créneau est déjà pris');
        }

        const result = await client.query(
          `UPDATE bookings SET date = $1, start_time = $2, end_time = $3, rescheduled = true
           WHERE id = $4 RETURNING *`,
          [date, start_time, newEndTime, id]
        );

        return { row: result.rows[0], booking };
      });

      if (notify_client && txResult.booking.email) {
        sendRescheduleEmail({
          email: txResult.booking.email,
          first_name: txResult.booking.first_name,
          service_name: txResult.booking.service_name,
          old_date: txResult.booking.date,
          old_time: txResult.booking.start_time,
          new_date: date,
          new_time: start_time,
          price: txResult.booking.service_price,
          cancel_token: txResult.booking.cancel_token,
          booking_id: id,
        }).catch((err) => logger.error('Reschedule email failed', { error: err.message }));
      }

      res.json(txResult.row);
    } catch (error) {
      next(error);
    }
  }
);

// ============================================
// POST /api/admin/bookings/:id/cancel — Admin cancel (no 24h limit)
// ============================================
router.post('/:id/cancel',
  [
    param('id').matches(uuidRegex),
    body('notify_client').optional().isBoolean(),
  ],
  handleValidation,
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const notify = req.body.notify_client;

      const infoResult = await db.query(
        `SELECT b.*, s.name as service_name, c.first_name, c.email as client_email
         FROM bookings b
         JOIN services s ON b.service_id = s.id
         JOIN clients c ON b.client_id = c.id
         WHERE b.id = $1 AND b.deleted_at IS NULL`,
        [id]
      );

      if (infoResult.rows.length === 0) {
        throw ApiError.notFound('RDV introuvable');
      }

      const bookingInfo = infoResult.rows[0];

      await db.query(
        `UPDATE bookings SET status = 'cancelled', cancelled_at = NOW(), cancelled_by = 'admin'
         WHERE id = $1`,
        [id]
      );

      if (notify && bookingInfo.client_email) {
        sendCancellationEmail({
          email: bookingInfo.client_email,
          first_name: bookingInfo.first_name,
          service_name: bookingInfo.service_name,
          date: bookingInfo.date,
          start_time: bookingInfo.start_time,
          price: bookingInfo.price,
        }).catch((err) => logger.error('Cancellation email failed', { error: err.message }));
      }

      logger.info('Booking cancelled by admin', { bookingId: id });
      res.json({ message: 'RDV annulé' });
    } catch (error) {
      next(error);
    }
  }
);

// ============================================
// PATCH /api/admin/bookings/:id/status — Mark completed/no_show
// ============================================
router.patch('/:id/status',
  [
    param('id').matches(uuidRegex),
    body('status').isIn(['confirmed', 'completed', 'no_show']).withMessage('Statut invalide'),
  ],
  handleValidation,
  async (req, res, next) => {
    try {
      const result = await bookingService.updateBookingStatus(req.params.id, req.body.status);
      res.json(result);
    } catch (error) {
      next(error);
    }
  }
);

module.exports = router;
