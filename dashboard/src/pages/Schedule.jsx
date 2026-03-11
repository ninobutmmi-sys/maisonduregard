import React, { useState, useEffect, useCallback } from 'react';
import { format, parseISO, isBefore, startOfToday } from 'date-fns';
import { fr } from 'date-fns/locale';
import api from '../api';

const DAY_NAMES = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];

const CloseIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const PlusIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

const TrashIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  </svg>
);

export default function Schedule() {
  const [schedule, setSchedule] = useState([]);
  const [overrides, setOverrides] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showOverrideModal, setShowOverrideModal] = useState(false);

  const fetchSchedule = useCallback(async () => {
    try {
      const [schedRes, overRes] = await Promise.all([
        api.get('/admin/schedule'),
        api.get('/admin/schedule/overrides'),
      ]);
      // Normalize schedule to 7 days
      const schedData = Array.isArray(schedRes) ? schedRes : schedRes.schedule || [];
      const normalized = DAY_NAMES.map((_, i) => {
        const existing = schedData.find(s => s.day_of_week === i);
        return existing || {
          day_of_week: i,
          is_working: i < 5, // Mon-Fri by default
          start_time: '09:00',
          end_time: '19:00',
        };
      });
      setSchedule(normalized);

      const overData = Array.isArray(overRes) ? overRes : overRes.overrides || [];
      // Filter out past overrides
      const today = startOfToday();
      const upcoming = overData.filter(o => !isBefore(parseISO(o.date), today));
      upcoming.sort((a, b) => a.date.localeCompare(b.date));
      setOverrides(upcoming);

      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSchedule();
  }, [fetchSchedule]);

  const updateDay = (dayIndex, field, value) => {
    setSchedule(prev => prev.map(s =>
      s.day_of_week === dayIndex ? { ...s, [field]: value } : s
    ));
  };

  const saveSchedule = async () => {
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      await api.put('/admin/schedule', { schedule });
      setSuccess('Horaires enregistres avec succes.');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const deleteOverride = async (id) => {
    if (!confirm('Supprimer cette exception ?')) return;
    try {
      await api.delete(`/admin/schedule/overrides/${id}`);
      fetchSchedule();
    } catch (err) {
      alert(err.message);
    }
  };

  if (loading) {
    return (
      <div className="empty-state">
        <div className="page-loading-spinner" />
        <p>Chargement des horaires...</p>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Horaires</h1>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      {/* ── Weekly Schedule ─────────────────────── */}
      <div className="card mb-lg">
        <div className="card-header">
          <h2 className="card-title">Horaires hebdomadaires</h2>
          <button className="btn btn-primary btn-sm" onClick={saveSchedule} disabled={saving}>
            {saving ? <span className="spinner-inline" /> : 'Enregistrer'}
          </button>
        </div>

        <div className="schedule-grid">
          {schedule.map((day, i) => (
            <div key={i} className="schedule-day-card">
              <div className="schedule-day-header">
                <span className="schedule-day-name">{DAY_NAMES[day.day_of_week]}</span>
                <label className="toggle">
                  <input
                    type="checkbox"
                    className="toggle-input"
                    checked={day.is_working}
                    onChange={e => updateDay(day.day_of_week, 'is_working', e.target.checked)}
                  />
                  <span className="toggle-slider" />
                </label>
              </div>

              {day.is_working ? (
                <div className="schedule-day-times">
                  <input
                    type="time"
                    className="form-input"
                    value={day.start_time?.slice(0, 5) || '09:00'}
                    onChange={e => updateDay(day.day_of_week, 'start_time', e.target.value)}
                  />
                  <span className="schedule-day-separator">a</span>
                  <input
                    type="time"
                    className="form-input"
                    value={day.end_time?.slice(0, 5) || '19:00'}
                    onChange={e => updateDay(day.day_of_week, 'end_time', e.target.value)}
                  />
                </div>
              ) : (
                <p className="schedule-day-off">Jour de repos</p>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ── Overrides ──────────────────────────── */}
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Exceptions</h2>
          <button className="btn btn-secondary btn-sm" onClick={() => setShowOverrideModal(true)}>
            <PlusIcon /> Ajouter
          </button>
        </div>

        {overrides.length === 0 ? (
          <div className="empty-state" style={{ padding: '2rem 1rem' }}>
            <p className="empty-state-text">Aucune exception a venir</p>
          </div>
        ) : (
          overrides.map(o => (
            <div
              key={o.id}
              className={`override-card ${o.is_day_off ? 'override-card--dayoff' : 'override-card--modified'}`}
            >
              <div className="override-info">
                <div className="override-date">
                  {format(parseISO(o.date), 'EEEE d MMMM yyyy', { locale: fr })}
                </div>
                <div className="override-detail">
                  {o.is_day_off ? 'Fermee' : `${o.start_time?.slice(0, 5)} — ${o.end_time?.slice(0, 5)}`}
                  {o.reason && ` — ${o.reason}`}
                </div>
              </div>
              <button className="btn btn-ghost btn-icon text-danger" onClick={() => deleteOverride(o.id)}>
                <TrashIcon />
              </button>
            </div>
          ))
        )}
      </div>

      {/* ── Add Override Modal ─────────────────── */}
      {showOverrideModal && (
        <OverrideModal
          onClose={() => setShowOverrideModal(false)}
          onSaved={() => { setShowOverrideModal(false); fetchSchedule(); }}
        />
      )}
    </div>
  );
}

/* ── Override Modal ────────────────────────────── */
function OverrideModal({ onClose, onSaved }) {
  const [form, setForm] = useState({
    date: format(new Date(), 'yyyy-MM-dd'),
    is_day_off: true,
    start_time: '09:00',
    end_time: '19:00',
    reason: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (field, value) => {
    setForm(f => ({ ...f, [field]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.date) {
      setError('Veuillez choisir une date.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await api.post('/admin/schedule/overrides', {
        date: form.date,
        is_day_off: form.is_day_off,
        start_time: form.is_day_off ? null : form.start_time,
        end_time: form.is_day_off ? null : form.end_time,
        reason: form.reason || null,
      });
      onSaved();
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
          <h2 className="modal-title">Nouvelle exception</h2>
          <button className="modal-close" onClick={onClose}><CloseIcon /></button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {error && <div className="alert alert-error">{error}</div>}

            <div className="form-group">
              <label className="form-label">Date *</label>
              <input
                type="date"
                className="form-input"
                value={form.date}
                onChange={e => handleChange('date', e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="toggle">
                <input
                  type="checkbox"
                  className="toggle-input"
                  checked={form.is_day_off}
                  onChange={e => handleChange('is_day_off', e.target.checked)}
                />
                <span className="toggle-slider" />
                <span className="toggle-label">Jour ferme (pas de RDV)</span>
              </label>
            </div>

            {!form.is_day_off && (
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Debut</label>
                  <input
                    type="time"
                    className="form-input"
                    value={form.start_time}
                    onChange={e => handleChange('start_time', e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Fin</label>
                  <input
                    type="time"
                    className="form-input"
                    value={form.end_time}
                    onChange={e => handleChange('end_time', e.target.value)}
                  />
                </div>
              </div>
            )}

            <div className="form-group">
              <label className="form-label">Raison (optionnel)</label>
              <input
                className="form-input"
                value={form.reason}
                onChange={e => handleChange('reason', e.target.value)}
                placeholder="ex: Vacances, formation..."
              />
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Annuler</button>
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? <span className="spinner-inline" /> : 'Ajouter'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
