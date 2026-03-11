import React, { useState, useEffect, useCallback } from 'react';
import { format, parseISO, subDays } from 'date-fns';
import { fr } from 'date-fns/locale';
import api from '../api';

const STATUS_OPTIONS = [
  { value: '', label: 'Tous les statuts' },
  { value: 'confirmed', label: 'Confirme' },
  { value: 'completed', label: 'Termine' },
  { value: 'no_show', label: 'Absent' },
  { value: 'cancelled', label: 'Annule' },
];

const STATUS_LABELS = {
  confirmed: 'Confirme',
  completed: 'Termine',
  no_show: 'Absent',
  cancelled: 'Annule',
};

const PER_PAGE = 25;

function formatPrice(cents) {
  if (!cents && cents !== 0) return '—';
  return (cents / 100).toFixed(2).replace('.', ',') + ' \u20AC';
}

export default function History() {
  const [bookings, setBookings] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [filters, setFilters] = useState({
    status: '',
    dateFrom: format(subDays(new Date(), 30), 'yyyy-MM-dd'),
    dateTo: format(new Date(), 'yyyy-MM-dd'),
  });

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(PER_PAGE),
      });
      if (filters.status) params.set('status', filters.status);
      if (filters.dateFrom) params.set('date_from', filters.dateFrom);
      if (filters.dateTo) params.set('date_to', filters.dateTo);

      const res = await api.get(`/admin/bookings/history?${params}`);
      setBookings(Array.isArray(res) ? res : res.bookings || []);
      setTotal(res.total || (Array.isArray(res) ? res.length : 0));
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [page, filters]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const updateFilter = (field, value) => {
    setFilters(f => ({ ...f, [field]: value }));
    setPage(1);
  };

  const totalPages = Math.ceil(total / PER_PAGE) || 1;

  // Summary stats
  const completedCount = bookings.filter(b => b.status === 'completed').length;
  const cancelledCount = bookings.filter(b => b.status === 'cancelled').length;
  const noShowCount = bookings.filter(b => b.status === 'no_show').length;
  const totalRevenue = bookings
    .filter(b => b.status === 'completed')
    .reduce((sum, b) => sum + (b.price || 0), 0);

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Historique</h1>
        <span className="text-sm text-muted">{total} rendez-vous</span>
      </div>

      {/* Summary stats */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-card-label">Termines</div>
          <div className="stat-card-value text-success">{completedCount}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Annules</div>
          <div className="stat-card-value text-danger">{cancelledCount}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Absents</div>
          <div className="stat-card-value" style={{ color: 'var(--warning)' }}>{noShowCount}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Chiffre d'affaires</div>
          <div className="stat-card-value">{formatPrice(totalRevenue)}</div>
        </div>
      </div>

      {/* Filters */}
      <div className="filters-row">
        <div className="form-group" style={{ marginBottom: 0 }}>
          <input
            type="date"
            className="form-input"
            value={filters.dateFrom}
            onChange={e => updateFilter('dateFrom', e.target.value)}
          />
        </div>
        <span className="text-muted">a</span>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <input
            type="date"
            className="form-input"
            value={filters.dateTo}
            onChange={e => updateFilter('dateTo', e.target.value)}
          />
        </div>
        <select
          className="form-select"
          value={filters.status}
          onChange={e => updateFilter('status', e.target.value)}
          style={{ width: 180 }}
        >
          {STATUS_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {loading ? (
        <div className="empty-state">
          <div className="page-loading-spinner" />
        </div>
      ) : bookings.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">~</div>
          <p className="empty-state-text">Aucun rendez-vous sur cette periode</p>
        </div>
      ) : (
        <>
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Heure</th>
                  <th>Client</th>
                  <th className="hide-mobile">Service</th>
                  <th className="hide-mobile">Duree</th>
                  <th>Prix</th>
                  <th>Statut</th>
                </tr>
              </thead>
              <tbody>
                {bookings.map(b => (
                  <tr key={b.id}>
                    <td>
                      {b.date ? format(parseISO(b.date), 'd MMM yyyy', { locale: fr }) : '—'}
                    </td>
                    <td>{b.start_time?.slice(0, 5) || '—'}</td>
                    <td style={{ fontWeight: 500 }}>
                      {b.client_first_name || b.client_name || '—'}
                    </td>
                    <td className="hide-mobile text-secondary">{b.service_name || '—'}</td>
                    <td className="hide-mobile">{b.duration ? `${b.duration}min` : '—'}</td>
                    <td>{formatPrice(b.price)}</td>
                    <td>
                      <span className={`badge badge-${b.status}`}>
                        {STATUS_LABELS[b.status] || b.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="pagination">
              <button
                className="pagination-btn"
                disabled={page <= 1}
                onClick={() => setPage(p => p - 1)}
              >
                &lt;
              </button>
              <span className="pagination-info">
                Page {page} / {totalPages}
              </span>
              <button
                className="pagination-btn"
                disabled={page >= totalPages}
                onClick={() => setPage(p => p + 1)}
              >
                &gt;
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
