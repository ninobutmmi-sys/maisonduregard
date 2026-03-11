import React, { useState, useEffect, useCallback } from 'react';
import { format, subDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from 'date-fns';
import { fr } from 'date-fns/locale';
import api from '../api';

function formatPrice(cents) {
  if (!cents && cents !== 0) return '0,00 \u20AC';
  return (cents / 100).toFixed(2).replace('.', ',') + ' \u20AC';
}

export default function Analytics() {
  const [dashboard, setDashboard] = useState(null);
  const [revenue, setRevenue] = useState([]);
  const [popularServices, setPopularServices] = useState([]);
  const [period, setPeriod] = useState('week'); // week | month
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const now = new Date();
      let dateFrom, dateTo;

      if (period === 'week') {
        dateFrom = format(subDays(now, 6), 'yyyy-MM-dd');
        dateTo = format(now, 'yyyy-MM-dd');
      } else {
        dateFrom = format(startOfMonth(now), 'yyyy-MM-dd');
        dateTo = format(endOfMonth(now), 'yyyy-MM-dd');
      }

      const [dashRes, revRes, svcRes] = await Promise.all([
        api.get('/admin/analytics/dashboard').catch(() => null),
        api.get(`/admin/analytics/revenue?date_from=${dateFrom}&date_to=${dateTo}`).catch(() => null),
        api.get('/admin/analytics/services').catch(() => null),
      ]);

      if (dashRes) setDashboard(dashRes);
      if (revRes) setRevenue(Array.isArray(revRes) ? revRes : revRes.revenue || revRes.data || []);
      if (svcRes) setPopularServices(Array.isArray(svcRes) ? svcRes : svcRes.services || svcRes.data || []);
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Compute derived stats from dashboard data
  const todayBookings = dashboard?.today_bookings ?? dashboard?.todayBookings ?? 0;
  const weekRevenue = dashboard?.week_revenue ?? dashboard?.weekRevenue ?? 0;
  const monthRevenue = dashboard?.month_revenue ?? dashboard?.monthRevenue ?? 0;
  const totalClients = dashboard?.total_clients ?? dashboard?.totalClients ?? 0;

  // Revenue chart max
  const revenueMax = Math.max(...revenue.map(r => r.total || r.revenue || 0), 1);

  // Popular services max
  const svcMax = Math.max(...popularServices.map(s => s.count || s.bookings_count || 0), 1);

  if (loading) {
    return (
      <div>
        <div className="page-header">
          <h1 className="page-title">Analytics</h1>
        </div>
        <div className="empty-state">
          <div className="page-loading-spinner" />
          <p>Chargement des statistiques...</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Analytics</h1>
      </div>

      {error && <div className="alert alert-warning">{error}</div>}

      {/* KPI Cards */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-card-label">RDV aujourd'hui</div>
          <div className="stat-card-value">{todayBookings}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">CA cette semaine</div>
          <div className="stat-card-value">{formatPrice(weekRevenue)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">CA ce mois</div>
          <div className="stat-card-value">{formatPrice(monthRevenue)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Clients actifs</div>
          <div className="stat-card-value">{totalClients}</div>
        </div>
      </div>

      {/* Revenue Chart */}
      <div className="card mb-lg">
        <div className="card-header">
          <h2 className="card-title">Chiffre d'affaires</h2>
          <div className="planning-view-toggle">
            <button
              className={`planning-view-btn ${period === 'week' ? 'planning-view-btn--active' : ''}`}
              onClick={() => setPeriod('week')}
            >
              7 jours
            </button>
            <button
              className={`planning-view-btn ${period === 'month' ? 'planning-view-btn--active' : ''}`}
              onClick={() => setPeriod('month')}
            >
              Ce mois
            </button>
          </div>
        </div>

        {revenue.length > 0 ? (
          <div className="vbar-chart">
            {revenue.map((r, i) => {
              const value = r.total || r.revenue || 0;
              const heightPct = (value / revenueMax) * 100;
              const label = r.date
                ? format(new Date(r.date), 'd MMM', { locale: fr })
                : r.label || `J${i + 1}`;

              return (
                <div key={i} className="vbar-col">
                  <div className="vbar-value">{formatPrice(value)}</div>
                  <div className="vbar-fill" style={{ height: `${Math.max(heightPct, 2)}%` }} />
                  <div className="vbar-label">{label}</div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="empty-state" style={{ padding: '2rem 1rem' }}>
            <p className="empty-state-text">Pas de donnees de revenus sur cette periode</p>
          </div>
        )}
      </div>

      {/* Popular Services */}
      <div className="card mb-lg">
        <h2 className="card-title mb-md">Services populaires</h2>

        {popularServices.length > 0 ? (
          <div className="bar-chart">
            {popularServices.slice(0, 10).map((s, i) => {
              const count = s.count || s.bookings_count || 0;
              const widthPct = (count / svcMax) * 100;

              return (
                <div key={i} className="bar-chart-row">
                  <div className="bar-chart-label" title={s.name || s.service_name}>
                    {s.name || s.service_name || `Service ${i + 1}`}
                  </div>
                  <div className="bar-chart-track">
                    <div className="bar-chart-fill" style={{ width: `${Math.max(widthPct, 2)}%` }} />
                  </div>
                  <div className="bar-chart-value">{count} RDV</div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="empty-state" style={{ padding: '2rem 1rem' }}>
            <p className="empty-state-text">Pas de donnees de services</p>
          </div>
        )}
      </div>

      {/* Booking Status Breakdown */}
      {dashboard && (
        <div className="card">
          <h2 className="card-title mb-md">Repartition des statuts (ce mois)</h2>
          <StatusBars dashboard={dashboard} />
        </div>
      )}
    </div>
  );
}

function StatusBars({ dashboard }) {
  const statuses = [
    { key: 'completed', label: 'Termines', color: '#4CAF50' },
    { key: 'confirmed', label: 'Confirmes', color: '#2196F3' },
    { key: 'no_show', label: 'Absents', color: '#FF9800' },
    { key: 'cancelled', label: 'Annules', color: '#f44336' },
  ];

  const values = statuses.map(s => ({
    ...s,
    count: dashboard[`${s.key}_count`] ?? dashboard[`month_${s.key}`] ?? 0,
  }));

  const total = values.reduce((sum, v) => sum + v.count, 0);

  if (total === 0) {
    return (
      <div className="empty-state" style={{ padding: '1rem' }}>
        <p className="empty-state-text">Pas de donnees</p>
      </div>
    );
  }

  return (
    <div>
      {/* Stacked bar */}
      <div style={{
        display: 'flex',
        height: 28,
        borderRadius: 'var(--radius-pill)',
        overflow: 'hidden',
        marginBottom: '1rem',
      }}>
        {values.map(v => {
          const pct = (v.count / total) * 100;
          if (pct === 0) return null;
          return (
            <div
              key={v.key}
              style={{
                width: `${pct}%`,
                background: v.color,
                minWidth: pct > 0 ? '4px' : '0',
              }}
              title={`${v.label}: ${v.count}`}
            />
          );
        })}
      </div>

      {/* Legend */}
      <div className="pill-bars">
        {values.map(v => (
          <div key={v.key} className="pill-bar">
            <div className="pill-bar-color" style={{ background: v.color }} />
            <span className="pill-bar-label">{v.label}</span>
            <span className="pill-bar-value">{v.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
