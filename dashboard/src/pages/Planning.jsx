import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { format, addDays, subDays, startOfWeek, isToday, isSameDay, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import api from '../api';

const HOURS = Array.from({ length: 13 }, (_, i) => i + 8); // 8..20
const PX_PER_HOUR = 60;
const STATUS_LABELS = {
  confirmed: 'Confirme',
  completed: 'Termine',
  no_show: 'Absent',
  cancelled: 'Annule',
};
const STATUS_COLORS = {
  confirmed: '#2196F3',
  completed: '#4CAF50',
  no_show: '#FF9800',
  cancelled: '#f44336',
};

function timeToMinutes(t) {
  if (!t) return 0;
  const [h, m] = t.slice(0, 5).split(':').map(Number);
  return h * 60 + m;
}

function minutesToTime(m) {
  const h = String(Math.floor(m / 60)).padStart(2, '0');
  const min = String(m % 60).padStart(2, '0');
  return `${h}:${min}`;
}

function formatPrice(cents) {
  if (!cents && cents !== 0) return '';
  return (cents / 100).toFixed(2).replace('.', ',') + ' \u20AC';
}

/* ── Close icon SVG ───────────────────────────── */
const CloseIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const ChevronLeft = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="15 18 9 12 15 6" />
  </svg>
);

const ChevronRight = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="9 18 15 12 9 6" />
  </svg>
);

const PlusIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

/* ═══════════════════════════════════════════════
   Planning Page
   ═══════════════════════════════════════════════ */
export default function Planning() {
  const [date, setDate] = useState(new Date());
  const [view, setView] = useState('day'); // day | week
  const [bookings, setBookings] = useState([]);
  const [blockedSlots, setBlockedSlots] = useState([]);
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedBooking, setSelectedBooking] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const refreshTimer = useRef(null);

  /* ── Fetch data ─────────────────────────────── */
  const fetchData = useCallback(async () => {
    try {
      const dateStr = format(date, 'yyyy-MM-dd');
      const params = view === 'week'
        ? `?date=${dateStr}&view=week`
        : `?date=${dateStr}&view=day`;

      const [bookingsRes, blockedRes] = await Promise.all([
        api.get(`/admin/bookings${params}`),
        api.get(`/admin/blocked-slots?date=${dateStr}`),
      ]);

      setBookings(Array.isArray(bookingsRes) ? bookingsRes : bookingsRes.bookings || []);
      setBlockedSlots(Array.isArray(blockedRes) ? blockedRes : blockedRes.blockedSlots || []);
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [date, view]);

  const fetchServices = useCallback(async () => {
    try {
      const res = await api.get('/admin/services');
      setServices(Array.isArray(res) ? res : res.services || []);
    } catch {
      // Silent fail for services
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    fetchServices();
  }, [fetchServices]);

  // Auto-refresh every 30s
  useEffect(() => {
    refreshTimer.current = setInterval(fetchData, 30000);
    return () => clearInterval(refreshTimer.current);
  }, [fetchData]);

  /* ── Navigation ─────────────────────────────── */
  const goToday = () => setDate(new Date());
  const goPrev = () => setDate(d => view === 'week' ? addDays(d, -7) : subDays(d, 1));
  const goNext = () => setDate(d => view === 'week' ? addDays(d, 7) : addDays(d, 1));

  const dateLabel = useMemo(() => {
    if (view === 'week') {
      const start = startOfWeek(date, { weekStartsOn: 1 });
      const end = addDays(start, 6);
      return `${format(start, 'd MMM', { locale: fr })} — ${format(end, 'd MMM yyyy', { locale: fr })}`;
    }
    return format(date, 'EEEE d MMMM yyyy', { locale: fr });
  }, [date, view]);

  /* ── Status actions ─────────────────────────── */
  const updateStatus = async (id, status) => {
    try {
      await api.patch(`/admin/bookings/${id}/status`, { status });
      setSelectedBooking(null);
      fetchData();
    } catch (err) {
      alert(err.message);
    }
  };

  const cancelBooking = async (id) => {
    if (!confirm('Annuler ce rendez-vous ?')) return;
    try {
      await api.post(`/admin/bookings/${id}/cancel`);
      setSelectedBooking(null);
      fetchData();
    } catch (err) {
      alert(err.message);
    }
  };

  /* ── Now indicator position ─────────────────── */
  const nowMinutes = useMemo(() => {
    const now = new Date();
    return now.getHours() * 60 + now.getMinutes();
  }, []);

  const showNow = isToday(date) && nowMinutes >= 480 && nowMinutes <= 1200;
  const nowTop = ((nowMinutes - 480) / 60) * PX_PER_HOUR;

  /* ═══ Day View ══════════════════════════════════ */
  const renderDayView = () => {
    const dayBookings = bookings.filter(b =>
      b.date === format(date, 'yyyy-MM-dd') && b.status !== 'cancelled'
    );
    const dayBlocked = blockedSlots.filter(b =>
      b.date === format(date, 'yyyy-MM-dd')
    );

    return (
      <div className="time-grid" style={{ position: 'relative' }}>
        {/* Now indicator */}
        {showNow && (
          <div className="now-indicator" style={{ top: `${nowTop}px` }} />
        )}

        {HOURS.map(hour => {
          return (
            <div key={hour} className="time-grid-row" style={{ height: PX_PER_HOUR }}>
              <div className="time-grid-label">{String(hour).padStart(2, '0')}:00</div>
              <div className="time-grid-content">
                <div className="time-grid-half" style={{ top: 0 }} />
                <div className="time-grid-half" />
              </div>
            </div>
          );
        })}

        {/* Booking blocks */}
        {dayBookings.map(b => {
          const startMin = timeToMinutes(b.start_time);
          const duration = b.duration || 60;
          const top = ((startMin - 480) / 60) * PX_PER_HOUR;
          const height = (duration / 60) * PX_PER_HOUR;
          const color = b.service_color || b.color || '#C9A96E';

          return (
            <div
              key={b.id}
              className="booking-block"
              style={{
                top: `${top}px`,
                height: `${Math.max(height, 24)}px`,
                left: `64px`,
                right: `4px`,
                background: `${color}18`,
                borderLeftColor: color,
                color: '#3D2C2E',
              }}
              onClick={() => setSelectedBooking(b)}
            >
              <div className="booking-block-time">
                {b.start_time?.slice(0, 5)} - {minutesToTime(startMin + duration)}
              </div>
              <div className="booking-block-client">
                {b.client_first_name || b.client_name || 'Client'}
              </div>
              <div className="booking-block-service">
                {b.service_name} {b.price ? `• ${formatPrice(b.price)}` : ''}
              </div>
            </div>
          );
        })}

        {/* Blocked slots */}
        {dayBlocked.map(b => {
          const startMin = timeToMinutes(b.start_time || '08:00');
          const endMin = timeToMinutes(b.end_time || '20:00');
          const top = ((startMin - 480) / 60) * PX_PER_HOUR;
          const height = ((endMin - startMin) / 60) * PX_PER_HOUR;

          return (
            <div
              key={b.id}
              className="blocked-block"
              style={{
                top: `${top}px`,
                height: `${Math.max(height, 20)}px`,
                left: '64px',
                right: '4px',
              }}
            >
              {b.reason || 'Indisponible'}
            </div>
          );
        })}
      </div>
    );
  };

  /* ═══ Week View ═════════════════════════════════ */
  const renderWeekView = () => {
    const weekStart = startOfWeek(date, { weekStartsOn: 1 });
    const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

    return (
      <div className="week-grid">
        {/* Header row */}
        <div className="week-header" />
        {days.map(d => (
          <div
            key={d.toISOString()}
            className={`week-header ${isToday(d) ? 'week-header--today' : ''}`}
            onClick={() => { setDate(d); setView('day'); }}
            style={{ cursor: 'pointer' }}
          >
            {format(d, 'EEE d', { locale: fr })}
          </div>
        ))}

        {/* Time rows */}
        {HOURS.map(hour => (
          <React.Fragment key={hour}>
            <div className="week-time-label">{String(hour).padStart(2, '0')}:00</div>
            {days.map(d => {
              const dateStr = format(d, 'yyyy-MM-dd');
              const hourBookings = bookings.filter(b =>
                b.date === dateStr &&
                b.status !== 'cancelled' &&
                timeToMinutes(b.start_time) >= hour * 60 &&
                timeToMinutes(b.start_time) < (hour + 1) * 60
              );

              return (
                <div key={`${hour}-${dateStr}`} className="week-cell">
                  {hourBookings.map(b => {
                    const color = b.service_color || b.color || '#C9A96E';
                    return (
                      <div
                        key={b.id}
                        className="week-booking"
                        style={{
                          background: `${color}20`,
                          borderLeftColor: color,
                          color: '#3D2C2E',
                        }}
                        onClick={() => setSelectedBooking(b)}
                        title={`${b.start_time?.slice(0, 5)} ${b.client_first_name || b.client_name || ''} — ${b.service_name || ''}`}
                      >
                        {b.start_time?.slice(0, 5)} {b.client_first_name || b.client_name || ''}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </React.Fragment>
        ))}
      </div>
    );
  };

  /* ═══ Booking Detail Modal ══════════════════════ */
  const renderDetailModal = () => {
    if (!selectedBooking) return null;
    const b = selectedBooking;
    const statusColor = STATUS_COLORS[b.status] || '#999';

    return (
      <div className="modal-overlay" onClick={() => setSelectedBooking(null)}>
        <div className="modal" onClick={e => e.stopPropagation()}>
          <div className="modal-header">
            <h2 className="modal-title">Details du rendez-vous</h2>
            <button className="modal-close" onClick={() => setSelectedBooking(null)}>
              <CloseIcon />
            </button>
          </div>
          <div className="modal-body">
            <div style={{ marginBottom: '1rem' }}>
              <span className="badge" style={{
                background: `${statusColor}18`,
                color: statusColor,
              }}>
                {STATUS_LABELS[b.status] || b.status}
              </span>
            </div>

            <div style={{ display: 'grid', gap: '0.75rem' }}>
              <div>
                <div className="text-sm text-muted">Client</div>
                <div style={{ fontWeight: 600 }}>
                  {b.client_first_name || b.client_name || 'Non renseigne'}
                </div>
              </div>
              {b.client_phone && (
                <div>
                  <div className="text-sm text-muted">Telephone</div>
                  <div>{b.client_phone}</div>
                </div>
              )}
              {b.client_email && (
                <div>
                  <div className="text-sm text-muted">Email</div>
                  <div>{b.client_email}</div>
                </div>
              )}
              <div>
                <div className="text-sm text-muted">Prestation</div>
                <div>{b.service_name || '—'}</div>
              </div>
              <div className="form-row">
                <div>
                  <div className="text-sm text-muted">Date</div>
                  <div>{b.date ? format(parseISO(b.date), 'd MMMM yyyy', { locale: fr }) : '—'}</div>
                </div>
                <div>
                  <div className="text-sm text-muted">Heure</div>
                  <div>{b.start_time?.slice(0, 5) || '—'}</div>
                </div>
              </div>
              <div className="form-row">
                <div>
                  <div className="text-sm text-muted">Duree</div>
                  <div>{b.duration ? `${b.duration} min` : '—'}</div>
                </div>
                <div>
                  <div className="text-sm text-muted">Prix</div>
                  <div>{b.price ? formatPrice(b.price) : '—'}</div>
                </div>
              </div>
            </div>
          </div>

          {b.status !== 'cancelled' && (
            <div className="modal-footer" style={{ flexWrap: 'wrap' }}>
              {b.status === 'confirmed' && (
                <>
                  <button
                    className="btn btn-sm"
                    style={{ background: '#4CAF50', color: '#fff' }}
                    onClick={() => updateStatus(b.id, 'completed')}
                  >
                    Termine
                  </button>
                  <button
                    className="btn btn-sm"
                    style={{ background: '#FF9800', color: '#fff' }}
                    onClick={() => updateStatus(b.id, 'no_show')}
                  >
                    Absent
                  </button>
                </>
              )}
              {b.status === 'no_show' && (
                <button
                  className="btn btn-sm btn-secondary"
                  onClick={() => updateStatus(b.id, 'confirmed')}
                >
                  Remettre confirme
                </button>
              )}
              {b.status === 'completed' && (
                <button
                  className="btn btn-sm btn-secondary"
                  onClick={() => updateStatus(b.id, 'confirmed')}
                >
                  Remettre confirme
                </button>
              )}
              <button
                className="btn btn-sm btn-danger"
                onClick={() => cancelBooking(b.id)}
              >
                Annuler le RDV
              </button>
            </div>
          )}
        </div>
      </div>
    );
  };

  /* ═══ Add Booking Modal ═════════════════════════ */
  const renderAddModal = () => {
    if (!showAddModal) return null;
    return <AddBookingModal
      date={date}
      services={services}
      onClose={() => setShowAddModal(false)}
      onCreated={() => { setShowAddModal(false); fetchData(); }}
    />;
  };

  /* ═══ Render ════════════════════════════════════ */
  return (
    <div>
      <div className="planning-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <h1 className="page-title">Planning</h1>
          <div className="planning-view-toggle">
            <button
              className={`planning-view-btn ${view === 'day' ? 'planning-view-btn--active' : ''}`}
              onClick={() => setView('day')}
            >
              Jour
            </button>
            <button
              className={`planning-view-btn ${view === 'week' ? 'planning-view-btn--active' : ''}`}
              onClick={() => setView('week')}
            >
              Semaine
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <button className="btn btn-primary btn-sm" onClick={() => setShowAddModal(true)}>
            <PlusIcon /> Nouveau RDV
          </button>
        </div>
      </div>

      <div className="planning-nav" style={{ marginBottom: '1rem' }}>
        <button className="btn btn-ghost btn-icon" onClick={goPrev}><ChevronLeft /></button>
        <button className="btn btn-ghost btn-sm" onClick={goToday}>Aujourd'hui</button>
        <span className="planning-date" style={{ textTransform: 'capitalize' }}>{dateLabel}</span>
        <button className="btn btn-ghost btn-icon" onClick={goNext}><ChevronRight /></button>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {loading ? (
        <div className="empty-state">
          <div className="page-loading-spinner" />
          <p>Chargement du planning...</p>
        </div>
      ) : (
        view === 'day' ? renderDayView() : renderWeekView()
      )}

      {renderDetailModal()}
      {renderAddModal()}
    </div>
  );
}

/* ═══ Add Booking Modal Component ═════════════════ */
function AddBookingModal({ date, services, onClose, onCreated }) {
  const [form, setForm] = useState({
    client_first_name: '',
    client_phone: '',
    client_email: '',
    service_id: '',
    date: format(date, 'yyyy-MM-dd'),
    start_time: '09:00',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const selectedService = services.find(s => s.id === form.service_id);

  const handleChange = (field, value) => {
    setForm(f => ({ ...f, [field]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.client_first_name || !form.client_phone || !form.service_id) {
      setError('Veuillez remplir les champs obligatoires.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await api.post('/admin/bookings', {
        ...form,
        price: selectedService?.price,
        duration: selectedService?.duration,
      });
      onCreated();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">Nouveau rendez-vous</h2>
          <button className="modal-close" onClick={onClose}>
            <CloseIcon />
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {error && <div className="alert alert-error">{error}</div>}

            <div className="form-group">
              <label className="form-label">Prenom du client *</label>
              <input
                className="form-input"
                value={form.client_first_name}
                onChange={e => handleChange('client_first_name', e.target.value)}
                placeholder="Prenom"
              />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Telephone *</label>
                <input
                  className="form-input"
                  value={form.client_phone}
                  onChange={e => handleChange('client_phone', e.target.value)}
                  placeholder="06..."
                  type="tel"
                />
              </div>
              <div className="form-group">
                <label className="form-label">Email</label>
                <input
                  className="form-input"
                  value={form.client_email}
                  onChange={e => handleChange('client_email', e.target.value)}
                  placeholder="email@exemple.fr"
                  type="email"
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Prestation *</label>
              <select
                className="form-select"
                value={form.service_id}
                onChange={e => handleChange('service_id', e.target.value)}
              >
                <option value="">Choisir une prestation</option>
                {services.filter(s => s.is_active !== false).map(s => (
                  <option key={s.id} value={s.id}>
                    {s.name} — {s.duration}min — {formatPrice(s.price)}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Date</label>
                <input
                  className="form-input"
                  type="date"
                  value={form.date}
                  onChange={e => handleChange('date', e.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Heure</label>
                <input
                  className="form-input"
                  type="time"
                  value={form.start_time}
                  onChange={e => handleChange('start_time', e.target.value)}
                  step="300"
                />
              </div>
            </div>

            {selectedService && (
              <div className="alert alert-info" style={{ marginTop: '0.5rem' }}>
                Duree: {selectedService.duration} min — Prix: {formatPrice(selectedService.price)}
              </div>
            )}
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Annuler</button>
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? <span className="spinner-inline" /> : 'Creer le RDV'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
