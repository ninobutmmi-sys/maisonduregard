// ============================================
// La Maison du Regard — Public Booking Routes
// ============================================

const { Router } = require('express');
const { body, param, query } = require('express-validator');
const { handleValidation } = require('../middleware/validate');
const { publicLimiter } = require('../middleware/rateLimiter');
const { optionalAuth } = require('../middleware/auth');
const bookingService = require('../services/booking');
const availabilityService = require('../services/availability');
const { generateICS } = require('../utils/ics');
const { ApiError } = require('../utils/errors');
const db = require('../config/database');
const { MAX_BOOKING_ADVANCE_MONTHS } = require('../constants');

const router = Router();

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ============================================
// GET /api/services — List active services
// ============================================
router.get('/services', publicLimiter,
  [
    query('category').optional().isIn(['sourcils', 'maquillage_permanent', 'cils']).withMessage('Catégorie invalide'),
  ],
  handleValidation,
  async (req, res, next) => {
    try {
      const { category } = req.query;

      let queryText = `
        SELECT id, name, category, description, price, duration, color, is_popular
        FROM services
        WHERE is_active = true`;
      const params = [];

      if (category) {
        queryText += ' AND category = $1';
        params.push(category);
      }

      queryText += ' ORDER BY sort_order';

      const result = await db.query(queryText, params);
      res.json(result.rows);
    } catch (error) {
      next(error);
    }
  }
);

// ============================================
// GET /api/availability — Available time slots
// ============================================
router.get('/availability',
  publicLimiter,
  [
    query('service_id').matches(uuidRegex).withMessage('Service ID invalide'),
    query('date').matches(/^\d{4}-\d{2}-\d{2}$/).withMessage('Date invalide (format: YYYY-MM-DD)')
      .custom((val) => !isNaN(new Date(val + 'T00:00:00').getTime())).withMessage('Date invalide'),
  ],
  handleValidation,
  async (req, res, next) => {
    try {
      const { service_id, date } = req.query;

      // Validate date is not in the past
      const requestedDate = new Date(date + 'T00:00:00');
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      if (requestedDate < today) {
        throw new ApiError(400, 'La date doit être aujourd\'hui ou dans le futur');
      }

      const maxDate = new Date(today);
      maxDate.setMonth(maxDate.getMonth() + MAX_BOOKING_ADVANCE_MONTHS);
      if (requestedDate > maxDate) {
        throw new ApiError(400, `Réservation possible jusqu'à ${MAX_BOOKING_ADVANCE_MONTHS} mois à l'avance maximum`);
      }

      const slots = await availabilityService.getAvailableSlots(service_id, date);

      res.json(slots);
    } catch (error) {
      next(error);
    }
  }
);

// ============================================
// POST /api/bookings — Create a booking
// ============================================
router.post('/bookings',
  publicLimiter,
  optionalAuth,
  [
    body('service_id').matches(uuidRegex).withMessage('Service ID invalide'),
    body('date').matches(/^\d{4}-\d{2}-\d{2}$/).withMessage('Date invalide')
      .custom((val) => !isNaN(new Date(val + 'T00:00:00').getTime())).withMessage('Date invalide'),
    body('start_time').matches(/^([01]\d|2[0-3]):[0-5]\d$/).withMessage('Heure invalide (format: HH:MM)'),
    body('first_name').optional({ values: 'falsy' }).trim().isLength({ max: 100 }),
    body('last_name').optional({ values: 'falsy' }).trim().isLength({ max: 100 }),
    body('phone').optional({ values: 'falsy' }).trim()
      .matches(/^(\+33|0)[1-9]\d{8}$/).withMessage('Numéro de téléphone français invalide'),
    body('email').optional({ values: 'falsy' }).trim().isEmail().withMessage('Email invalide'),
  ],
  handleValidation,
  async (req, res, next) => {
    try {
      let bookingData = { ...req.body, source: 'online' };

      if (req.user && req.user.type === 'client') {
        // Authenticated client: get info from database
        const clientResult = await db.query(
          'SELECT id, first_name, last_name, phone, email FROM clients WHERE id = $1 AND deleted_at IS NULL',
          [req.user.id]
        );
        if (clientResult.rows.length === 0) {
          throw ApiError.notFound('Client introuvable');
        }
        const client = clientResult.rows[0];
        bookingData.first_name = client.first_name;
        bookingData.last_name = client.last_name;
        bookingData.phone = client.phone;
        bookingData.email = client.email;
      } else {
        // Guest booking: require client info
        if (!bookingData.first_name || !bookingData.phone) {
          throw ApiError.badRequest('Prénom et téléphone sont requis pour une réservation');
        }
      }

      const booking = await bookingService.createBooking(bookingData);

      res.status(201).json(booking);
    } catch (error) {
      next(error);
    }
  }
);

// ============================================
// GET /api/bookings/:id — Get booking details (via cancel token)
// ============================================
router.get('/bookings/:id',
  publicLimiter,
  [
    param('id').matches(uuidRegex).withMessage('ID invalide'),
    query('token').notEmpty().withMessage('Token requis'),
  ],
  handleValidation,
  async (req, res, next) => {
    try {
      const result = await db.query(
        `SELECT b.id, b.date, b.start_time, b.end_time, b.status, b.price, b.cancel_token,
                b.service_id, b.rescheduled, b.duration,
                s.name as service_name, s.duration as service_duration, s.category
         FROM bookings b
         JOIN services s ON b.service_id = s.id
         WHERE b.id = $1 AND b.cancel_token = $2 AND b.deleted_at IS NULL`,
        [req.params.id, req.query.token]
      );

      if (result.rows.length === 0) {
        throw ApiError.notFound('Rendez-vous introuvable');
      }

      res.json(result.rows[0]);
    } catch (error) {
      next(error);
    }
  }
);

// ============================================
// POST /api/bookings/:id/cancel — Cancel a booking
// ============================================
router.post('/bookings/:id/cancel',
  publicLimiter,
  [
    param('id').matches(uuidRegex).withMessage('ID invalide'),
    body('token').notEmpty().withMessage('Token requis'),
  ],
  handleValidation,
  async (req, res, next) => {
    try {
      const result = await bookingService.cancelBooking(req.params.id, req.body.token);
      res.json({ message: 'Rendez-vous annulé avec succès', booking: result });
    } catch (error) {
      next(error);
    }
  }
);

// ============================================
// POST /api/bookings/:id/reschedule — Reschedule a booking
// ============================================
router.post('/bookings/:id/reschedule',
  publicLimiter,
  [
    param('id').matches(uuidRegex).withMessage('ID invalide'),
    body('token').notEmpty().withMessage('Token requis'),
    body('date').matches(/^\d{4}-\d{2}-\d{2}$/).withMessage('Date invalide (format: YYYY-MM-DD)')
      .custom((val) => !isNaN(new Date(val + 'T00:00:00').getTime())).withMessage('Date invalide'),
    body('start_time').matches(/^([01]\d|2[0-3]):[0-5]\d$/).withMessage('Heure invalide (format: HH:MM)'),
  ],
  handleValidation,
  async (req, res, next) => {
    try {
      const result = await bookingService.rescheduleBooking(
        req.params.id,
        req.body.token,
        req.body.date,
        req.body.start_time
      );
      res.json({ message: 'Rendez-vous déplacé avec succès', booking: result });
    } catch (error) {
      next(error);
    }
  }
);

// ============================================
// GET /api/bookings/:id/ics — Download ICS calendar file
// ============================================
router.get('/bookings/:id/ics',
  publicLimiter,
  [
    param('id').matches(uuidRegex).withMessage('ID invalide'),
    query('token').notEmpty().withMessage('Token requis'),
  ],
  handleValidation,
  async (req, res, next) => {
    try {
      const result = await db.query(
        `SELECT b.id, b.date, b.start_time, b.end_time,
                s.name as service_name
         FROM bookings b
         JOIN services s ON b.service_id = s.id
         WHERE b.id = $1 AND b.cancel_token = $2 AND b.deleted_at IS NULL`,
        [req.params.id, req.query.token]
      );

      if (result.rows.length === 0) {
        throw ApiError.notFound('Rendez-vous introuvable');
      }

      const icsContent = generateICS(result.rows[0]);

      res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="maison-du-regard-rdv.ics"');
      res.send(icsContent);
    } catch (error) {
      next(error);
    }
  }
);

module.exports = router;
