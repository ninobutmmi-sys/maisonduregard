import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { format, addDays, subDays, addMonths, subMonths, startOfWeek, startOfMonth, endOfMonth, isToday, isSameDay, isSameMonth, isSameWeek, parseISO, getDay } from 'date-fns';
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

/* ── SVG Icons ────────────────────────────────── */
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
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

const CalendarIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
    <line x1="16" y1="2" x2="16" y2="6" />
    <line x1="8" y1="2" x2="8" y2="6" />
    <line x1="3" y1="10" x2="21" y2="10" />
  </svg>
);

const MoneyIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="1" x2="12" y2="23" />
    <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
  </svg>
);

const BlockIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <line x1="9" y1="9" x2="15" y2="15" />
    <line x1="15" y1="9" x2="9" y2="15" />
  </svg>
);

const RefreshIcon = ({ spinning }) => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={spinning ? { animation: 'spin 0.8s linear infinite' } : undefined}>
    <polyline points="23 4 23 10 17 10" />
    <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
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
  const [showBlockModal, setShowBlockModal] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(new Date());
  const [refreshing, setRefreshing] = useState(false);
  const refreshTimer = useRef(null);
  const calendarRef = useRef(null);

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

  // Close calendar on outside click
  useEffect(() => {
    if (!showCalendar) return;
    const handler = (e) => {
      if (calendarRef.current && !calendarRef.current.contains(e.target)) {
        setShowCalendar(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showCalendar]);

  // Sync calendar month when date changes
  useEffect(() => { setCalendarMonth(date); }, [date]);

  /* ── KPI Stats ──────────────────────────────── */
  const stats = useMemo(() => {
    const active = bookings.filter(b => b.status !== 'cancelled');
    return {
      count: active.length,
      revenue: active.reduce((s, b) => s + (b.price || 0), 0),
    };
  }, [bookings]);

  /* ── Navigation ─────────────────────────────── */
  const goToday = () => setDate(new Date());
  const goPrev = () => setDate(d => view === 'week' ? addDays(d, -7) : subDays(d, 1));
  const goNext = () => setDate(d => view === 'week' ? addDays(d, 7) : addDays(d, 1));
  const goPrevMonth = () => setDate(d => subMonths(d, 1));
  const goNextMonth = () => setDate(d => addMonths(d, 1));

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  }, [fetchData]);

  const monthDisplay = useMemo(() => format(date, 'MMMM yyyy', { locale: fr }), [date]);

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
      {/* ── Premium Planning Header ────────────────── */}
      <div className="plan-header">
        <div className="plan-left">
          <div className="plan-title-block">
            <h2 className="plan-title">Planning</h2>
            <div className="plan-kpis">
              <span className="plan-kpi-chip">
                <CalendarIcon />
                RDV <span className="plan-kpi-val">{stats.count}</span>
              </span>
              <span className="plan-kpi-chip">
                <MoneyIcon />
                CA <span className="plan-kpi-val">{formatPrice(stats.revenue)}</span>
              </span>
            </div>
          </div>

          <div className="plan-divider" />

          <div className="plan-month-nav">
            <button className="plan-nav-btn" onClick={goPrevMonth}><ChevronLeft /></button>
            <span className="plan-month-label">{monthDisplay}</span>
            <button className="plan-nav-btn" onClick={goNextMonth}><ChevronRight /></button>
          </div>

          <div className="plan-divider" />

          <div className="planning-view-toggle">
            {['week', 'day'].map(v => (
              <button
                key={v}
                className={`planning-view-btn ${view === v ? 'planning-view-btn--active' : ''}`}
                onClick={() => setView(v)}
              >
                {v === 'week' ? 'Semaine' : 'Jour'}
              </button>
            ))}
          </div>

          <div className="plan-nav" style={{ position: 'relative' }} ref={calendarRef}>
            <button className="plan-nav-btn" onClick={goPrev}><ChevronLeft /></button>
            <button
              className="plan-nav-label plan-nav-label--clickable"
              onClick={() => setShowCalendar(c => !c)}
            >
              {dateLabel}
            </button>
            <button className="plan-nav-btn" onClick={goNext}><ChevronRight /></button>

            {showCalendar && (
              <MiniCalendar
                currentDate={date}
                calendarMonth={calendarMonth}
                onSelectDate={(d) => { setDate(d); setShowCalendar(false); }}
                onPrevMonth={() => setCalendarMonth(m => subMonths(m, 1))}
                onNextMonth={() => setCalendarMonth(m => addMonths(m, 1))}
                view={view}
              />
            )}
          </div>

          <button className="plan-today-btn" onClick={goToday}>Aujourd'hui</button>

          <button className="plan-icon-btn" onClick={handleRefresh} disabled={refreshing} title="Actualiser">
            <RefreshIcon spinning={refreshing} />
          </button>
        </div>

        <div className="plan-controls">
          <button className="plan-block-btn" onClick={() => setShowBlockModal(true)}>
            <BlockIcon /> Bloquer
          </button>
          <button className="plan-create-btn" onClick={() => setShowAddModal(true)}>
            <PlusIcon /> Nouveau RDV
          </button>
        </div>
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

      {showBlockModal && (
        <BlockSlotModal
          initialDate={format(date, 'yyyy-MM-dd')}
          onClose={() => setShowBlockModal(false)}
          onCreated={() => { setShowBlockModal(false); fetchData(); }}
        />
      )}
    </div>
  );
}

/* ═══ Mini Calendar Picker ════════════════════════ */
function MiniCalendar({ currentDate, calendarMonth, onSelectDate, onPrevMonth, onNextMonth, view }) {
  const monthStart = startOfMonth(calendarMonth);
  const monthEnd = endOfMonth(calendarMonth);
  const dayNames = ['lu', 'ma', 'me', 'je', 've', 'sa', 'di'];

  // Build grid: start from Monday of the week containing monthStart
  const startDay = getDay(monthStart); // 0=Sun
  const offset = startDay === 0 ? 6 : startDay - 1; // Monday-based offset
  const gridStart = addDays(monthStart, -offset);

  const days = [];
  for (let i = 0; i < 42; i++) {
    days.push(addDays(gridStart, i));
  }

  // Only show 5 or 6 rows as needed
  const rows = [];
  for (let r = 0; r < 6; r++) {
    const week = days.slice(r * 7, r * 7 + 7);
    // Skip row if all days are next month and it's row 5+
    if (r >= 5 && !week.some(d => isSameMonth(d, calendarMonth))) break;
    rows.push(week);
  }

  // Determine current week range for highlighting
  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
  const weekEnd = addDays(weekStart, 6);

  return (
    <div className="mini-cal">
      <div className="mini-cal-header">
        <button className="mini-cal-nav" onClick={onPrevMonth}>
          <ChevronLeft />
        </button>
        <span className="mini-cal-month">
          {format(calendarMonth, 'MMMM yyyy', { locale: fr })}
        </span>
        <button className="mini-cal-nav" onClick={onNextMonth}>
          <ChevronRight />
        </button>
      </div>

      <div className="mini-cal-grid">
        {dayNames.map(d => (
          <div key={d} className="mini-cal-dayname">{d}</div>
        ))}
        {rows.flat().map((day, i) => {
          const inMonth = isSameMonth(day, calendarMonth);
          const today = isToday(day);
          const isSelected = isSameDay(day, currentDate);
          const inCurrentWeek = view === 'week' && day >= weekStart && day <= weekEnd;

          return (
            <button
              key={i}
              className={[
                'mini-cal-day',
                !inMonth && 'mini-cal-day--outside',
                today && 'mini-cal-day--today',
                isSelected && 'mini-cal-day--selected',
                inCurrentWeek && 'mini-cal-day--week',
              ].filter(Boolean).join(' ')}
              onClick={() => onSelectDate(day)}
            >
              {format(day, 'd')}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ═══ Block Slot Modal Component ══════════════════ */
function BlockSlotModal({ initialDate, onClose, onCreated }) {
  const [date, setDate] = useState(initialDate || format(new Date(), 'yyyy-MM-dd'));
  const [startTime, setStartTime] = useState('12:00');
  const [endTime, setEndTime] = useState('14:00');
  const [type, setType] = useState('personal');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const typeLabels = {
    break: 'Pause dejeuner',
    personal: 'Perso / RDV',
    closed: 'Ferme',
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!date || !startTime || !endTime) {
      setError('Veuillez remplir tous les champs obligatoires.');
      return;
    }
    if (startTime >= endTime) {
      setError('L\'heure de fin doit etre apres l\'heure de debut.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await api.post('/admin/blocked-slots', {
        date,
        start_time: startTime,
        end_time: endTime,
        type,
        reason: reason || typeLabels[type],
      });
      onCreated();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">Bloquer un creneau</h2>
          <button className="modal-close" onClick={onClose}>
            <CloseIcon />
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {error && <div className="alert alert-error">{error}</div>}

            <div className="form-group">
              <label className="form-label">Type</label>
              <select
                className="form-select"
                value={type}
                onChange={e => setType(e.target.value)}
              >
                <option value="break">Pause dejeuner</option>
                <option value="personal">Perso / RDV</option>
                <option value="closed">Ferme</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Date</label>
              <input
                className="form-input"
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
              />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Debut</label>
                <input
                  className="form-input"
                  type="time"
                  value={startTime}
                  onChange={e => setStartTime(e.target.value)}
                  min="08:00"
                  max="20:30"
                  step="300"
                />
              </div>
              <div className="form-group">
                <label className="form-label">Fin</label>
                <input
                  className="form-input"
                  type="time"
                  value={endTime}
                  onChange={e => setEndTime(e.target.value)}
                  min="08:00"
                  max="21:00"
                  step="300"
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Motif (optionnel)</label>
              <input
                className="form-input"
                value={reason}
                onChange={e => setReason(e.target.value)}
                placeholder="Ex: RDV medical, courses..."
              />
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Annuler</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? <span className="spinner-inline" /> : 'Bloquer'}
            </button>
          </div>
        </form>
      </div>
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
