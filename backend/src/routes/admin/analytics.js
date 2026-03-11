// ============================================
// La Maison du Regard — Admin Analytics Routes
// (single practitioner, no salon_id filter)
// ============================================

const { Router } = require('express');
const { query } = require('express-validator');
const { handleValidation } = require('../../middleware/validate');
const db = require('../../config/database');

const router = Router();

// ============================================
// GET /api/admin/analytics/dashboard — KPIs overview
// ============================================
router.get('/dashboard', async (req, res, next) => {
  try {
    const todayResult = await db.query(`SELECT (NOW() AT TIME ZONE 'Europe/Paris')::date AS today`);
    const today = todayResult.rows[0].today;
    const firstOfMonth = today.substring(0, 8) + '01';

    // Today's stats
    const todayStats = await db.query(
      `SELECT
         COUNT(*) FILTER (WHERE status IN ('confirmed', 'completed')) as bookings_today,
         COALESCE(SUM(price) FILTER (WHERE status IN ('confirmed', 'completed')), 0) as revenue_today,
         COUNT(*) FILTER (WHERE status = 'cancelled') as cancelled_today
       FROM bookings
       WHERE date = $1 AND deleted_at IS NULL`,
      [today]
    );

    // Monthly stats
    const monthStats = await db.query(
      `SELECT
         COUNT(*) FILTER (WHERE status IN ('confirmed', 'completed')) as bookings_month,
         COALESCE(SUM(price) FILTER (WHERE status IN ('confirmed', 'completed')), 0) as revenue_month
       FROM bookings
       WHERE date >= $1 AND date <= $2 AND deleted_at IS NULL`,
      [firstOfMonth, today]
    );

    // New clients this month
    const newClients = await db.query(
      `SELECT COUNT(DISTINCT c.id) as count FROM clients c
       JOIN bookings b ON c.id = b.client_id
       WHERE c.created_at >= $1 AND c.deleted_at IS NULL`,
      [firstOfMonth]
    );

    // Next bookings today
    const nextBookings = await db.query(
      `SELECT b.id, b.start_time, b.end_time,
              s.name as service_name,
              c.first_name || ' ' || COALESCE(c.last_name, '') as client_name
       FROM bookings b
       JOIN services s ON b.service_id = s.id
       JOIN clients c ON b.client_id = c.id
       WHERE b.date = $1 AND b.status = 'confirmed' AND b.deleted_at IS NULL
         AND b.start_time >= (NOW() AT TIME ZONE 'Europe/Paris')::time
       ORDER BY b.start_time
       LIMIT 5`,
      [today]
    );

    const t = todayStats.rows[0];
    const m = monthStats.rows[0];

    res.json({
      today: {
        bookings: parseInt(t.bookings_today),
        revenue: parseInt(t.revenue_today),
        cancelled: parseInt(t.cancelled_today),
      },
      month: {
        bookings: parseInt(m.bookings_month),
        revenue: parseInt(m.revenue_month),
        new_clients: parseInt(newClients.rows[0].count),
        average_basket: parseInt(m.bookings_month) > 0
          ? Math.round(parseInt(m.revenue_month) / parseInt(m.bookings_month))
          : 0,
      },
      next_bookings: nextBookings.rows,
    });
  } catch (error) {
    next(error);
  }
});

// ============================================
// GET /api/admin/analytics/revenue — Revenue over time
// ============================================
router.get('/revenue',
  [
    query('period').optional().isIn(['day', 'week', 'month']),
    query('from').optional().matches(/^\d{4}-\d{2}-\d{2}$/),
    query('to').optional().matches(/^\d{4}-\d{2}-\d{2}$/),
  ],
  handleValidation,
  async (req, res, next) => {
    try {
      const { period = 'day', from, to } = req.query;
      const toDate = to || getParisTodayISO();
      const fromDate = from || getDefaultFrom(period);

      let groupBy, dateExpr;
      if (period === 'month') {
        dateExpr = "TO_CHAR(date, 'YYYY-MM')";
        groupBy = dateExpr;
      } else if (period === 'week') {
        dateExpr = "TO_CHAR(DATE_TRUNC('week', date), 'YYYY-MM-DD')";
        groupBy = "DATE_TRUNC('week', date)";
      } else {
        dateExpr = "TO_CHAR(date, 'YYYY-MM-DD')";
        groupBy = 'date';
      }

      const result = await db.query(
        `SELECT ${dateExpr} as period,
                COUNT(*) as booking_count,
                COALESCE(SUM(price), 0) as revenue
         FROM bookings
         WHERE date >= $1 AND date <= $2
           AND status IN ('confirmed', 'completed')
           AND deleted_at IS NULL
         GROUP BY ${groupBy}
         ORDER BY ${groupBy}`,
        [fromDate, toDate]
      );

      res.json(result.rows);
    } catch (error) {
      next(error);
    }
  }
);

// ============================================
// GET /api/admin/analytics/peak-hours — Peak hours heatmap
// ============================================
router.get('/peak-hours',
  [
    query('from').optional().matches(/^\d{4}-\d{2}-\d{2}$/),
    query('to').optional().matches(/^\d{4}-\d{2}-\d{2}$/),
  ],
  handleValidation,
  async (req, res, next) => {
    try {
      const toDate = req.query.to || getParisTodayISO();
      const fromDate = req.query.from || getDefaultFrom('month');

      const result = await db.query(
        `SELECT
           EXTRACT(DOW FROM date) as day_of_week,
           EXTRACT(HOUR FROM start_time) as hour,
           COUNT(*) as count
         FROM bookings
         WHERE date >= $1 AND date <= $2
           AND status IN ('confirmed', 'completed')
           AND deleted_at IS NULL
         GROUP BY EXTRACT(DOW FROM date), EXTRACT(HOUR FROM start_time)
         ORDER BY day_of_week, hour`,
        [fromDate, toDate]
      );

      const bestDays = await db.query(
        `SELECT
           EXTRACT(DOW FROM date) as day_of_week,
           COUNT(*) as booking_count,
           COALESCE(SUM(price), 0) as revenue
         FROM bookings
         WHERE date >= $1 AND date <= $2
           AND status IN ('confirmed', 'completed')
           AND deleted_at IS NULL
         GROUP BY EXTRACT(DOW FROM date)
         ORDER BY revenue DESC`,
        [fromDate, toDate]
      );

      res.json({
        heatmap: result.rows,
        best_days: bestDays.rows,
      });
    } catch (error) {
      next(error);
    }
  }
);

// ============================================
// GET /api/admin/analytics/occupancy — Occupancy rate
// ============================================
router.get('/occupancy',
  [
    query('from').optional().matches(/^\d{4}-\d{2}-\d{2}$/),
    query('to').optional().matches(/^\d{4}-\d{2}-\d{2}$/),
  ],
  handleValidation,
  async (req, res, next) => {
    try {
      const toDate = req.query.to || getParisTodayISO();
      const fromDate = req.query.from || getDefaultFrom('month');

      // Single practitioner: 9h-19h = 10h = 600min, 15min slots = ~40 slots/day
      const slotsPerDay = 40;

      const daysResult = await db.query(
        `SELECT COUNT(DISTINCT date) as days
         FROM bookings
         WHERE date >= $1 AND date <= $2 AND deleted_at IS NULL`,
        [fromDate, toDate]
      );
      const workingDays = Math.max(parseInt(daysResult.rows[0].days), 1);

      const bookingsResult = await db.query(
        `SELECT COUNT(*) as count
         FROM bookings
         WHERE date >= $1 AND date <= $2
           AND status IN ('confirmed', 'completed')
           AND deleted_at IS NULL`,
        [fromDate, toDate]
      );

      const totalBookings = parseInt(bookingsResult.rows[0].count);
      const totalSlots = workingDays * slotsPerDay;
      const occupancyRate = totalSlots > 0 ? Math.round((totalBookings / totalSlots) * 100) : 0;

      res.json({
        occupancy_rate: occupancyRate,
        total_bookings: totalBookings,
        total_available_slots: totalSlots,
        working_days: workingDays,
        period: { from: fromDate, to: toDate },
      });
    } catch (error) {
      next(error);
    }
  }
);

// ============================================
// GET /api/admin/analytics/services — Stats by service
// ============================================
router.get('/services',
  [
    query('from').optional().matches(/^\d{4}-\d{2}-\d{2}$/),
    query('to').optional().matches(/^\d{4}-\d{2}-\d{2}$/),
  ],
  handleValidation,
  async (req, res, next) => {
    try {
      const toDate = req.query.to || getParisTodayISO();
      const fromDate = req.query.from || getDefaultFrom('month');

      const result = await db.query(
        `SELECT s.name, s.category,
                COUNT(b.id) as booking_count,
                COALESCE(SUM(b.price), 0) as revenue,
                ROUND(AVG(b.price)) as avg_price
         FROM services s
         LEFT JOIN bookings b ON s.id = b.service_id
           AND b.date >= $1 AND b.date <= $2
           AND b.status IN ('confirmed', 'completed')
           AND b.deleted_at IS NULL
         WHERE s.deleted_at IS NULL
         GROUP BY s.id, s.name, s.category
         ORDER BY booking_count DESC`,
        [fromDate, toDate]
      );

      // Trend per category (monthly)
      const trendResult = await db.query(
        `SELECT s.category, TO_CHAR(b.date, 'YYYY-MM') as month, COUNT(*) as count
         FROM bookings b
         JOIN services s ON b.service_id = s.id
         WHERE b.date >= $1 AND b.date <= $2
           AND b.status IN ('confirmed', 'completed')
           AND b.deleted_at IS NULL
         GROUP BY s.category, TO_CHAR(b.date, 'YYYY-MM')
         ORDER BY s.category, month`,
        [fromDate, toDate]
      );

      res.json({
        services: result.rows,
        trends: trendResult.rows,
      });
    } catch (error) {
      next(error);
    }
  }
);

// ============================================
// GET /api/admin/analytics/clients — Client stats
// ============================================
router.get('/clients', async (req, res, next) => {
  try {
    // New vs returning clients per month
    const newVsReturning = await db.query(
      `WITH first_visits AS (
         SELECT client_id, MIN(date) as first_date
         FROM bookings
         WHERE status IN ('confirmed', 'completed') AND deleted_at IS NULL
         GROUP BY client_id
       )
       SELECT TO_CHAR(b.date, 'YYYY-MM') as month,
              COUNT(DISTINCT b.client_id) FILTER (
                WHERE b.client_id IN (
                  SELECT fv.client_id FROM first_visits fv
                  WHERE TO_CHAR(fv.first_date, 'YYYY-MM') = TO_CHAR(b.date, 'YYYY-MM')
                )
              ) as new_clients,
              COUNT(DISTINCT b.client_id) as total_clients
       FROM bookings b
       WHERE b.status IN ('confirmed', 'completed') AND b.deleted_at IS NULL
         AND b.date >= CURRENT_DATE - INTERVAL '12 months'
       GROUP BY TO_CHAR(b.date, 'YYYY-MM')
       ORDER BY month`
    );

    // Top 10 clients by revenue
    const topClients = await db.query(
      `SELECT c.id, c.first_name, c.last_name, c.phone,
              COUNT(b.id) as visit_count,
              COALESCE(SUM(b.price), 0) as total_spent,
              MAX(b.date) as last_visit
       FROM clients c
       JOIN bookings b ON c.id = b.client_id
       WHERE b.status IN ('confirmed', 'completed') AND b.deleted_at IS NULL
         AND c.deleted_at IS NULL
       GROUP BY c.id
       ORDER BY total_spent DESC
       LIMIT 10`
    );

    // Average visit frequency
    const avgFrequency = await db.query(
      `WITH client_visits AS (
         SELECT client_id, date,
                LAG(date) OVER (PARTITION BY client_id ORDER BY date) as prev_date
         FROM bookings
         WHERE status IN ('confirmed', 'completed') AND deleted_at IS NULL
       )
       SELECT ROUND(AVG(date - prev_date)) as avg_days_between_visits
       FROM client_visits
       WHERE prev_date IS NOT NULL`
    );

    // Total active clients (last 3 months)
    const totalActive = await db.query(
      `SELECT COUNT(DISTINCT client_id) as count
       FROM bookings
       WHERE status IN ('confirmed', 'completed') AND deleted_at IS NULL
         AND date >= CURRENT_DATE - INTERVAL '3 months'`
    );

    res.json({
      new_vs_returning: newVsReturning.rows,
      top_clients: topClients.rows,
      avg_days_between_visits: parseInt(avgFrequency.rows[0]?.avg_days_between_visits || 0),
      active_clients_3_months: parseInt(totalActive.rows[0].count),
    });
  } catch (error) {
    next(error);
  }
});

// ============================================
// Helpers
// ============================================
function getParisNow() {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Paris' }));
}

function getParisTodayISO() {
  const now = getParisNow();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getDefaultFrom(period) {
  const now = getParisNow();
  if (period === 'month') {
    now.setMonth(now.getMonth() - 12);
  } else if (period === 'week') {
    now.setMonth(now.getMonth() - 3);
  } else {
    now.setDate(now.getDate() - 30);
  }
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

module.exports = router;
