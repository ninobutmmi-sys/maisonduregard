import React, { useState, useEffect, useCallback } from 'react';
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import api from '../api';

const SMS_MAX_LENGTH = 160;
const SMS_CONCAT_LENGTH = 153; // Per segment after first

const STATUS_LABELS = {
  pending: 'En attente',
  sent: 'Envoye',
  failed: 'Echoue',
};

export default function Messages() {
  const [activeTab, setActiveTab] = useState('sms');

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Messages</h1>
      </div>

      <div className="tabs">
        <button
          className={`tab ${activeTab === 'sms' ? 'tab--active' : ''}`}
          onClick={() => setActiveTab('sms')}
        >
          SMS
        </button>
        <button
          className={`tab ${activeTab === 'notifications' ? 'tab--active' : ''}`}
          onClick={() => setActiveTab('notifications')}
        >
          Notifications
        </button>
        <button
          className={`tab ${activeTab === 'automation' ? 'tab--active' : ''}`}
          onClick={() => setActiveTab('automation')}
        >
          Automation
        </button>
      </div>

      {activeTab === 'sms' && <SmsTab />}
      {activeTab === 'notifications' && <NotificationsTab />}
      {activeTab === 'automation' && <AutomationTab />}
    </div>
  );
}

/* ═══ SMS Tab ═════════════════════════════════════ */
function SmsTab() {
  const [message, setMessage] = useState('');
  const [recipients, setRecipients] = useState('all');
  const [manualPhones, setManualPhones] = useState('');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const charCount = message.length;
  const smsCount = charCount <= SMS_MAX_LENGTH ? 1 : Math.ceil(charCount / SMS_CONCAT_LENGTH);

  const getCharCountClass = () => {
    if (charCount > SMS_MAX_LENGTH * 3) return 'char-count--danger';
    if (charCount > SMS_MAX_LENGTH) return 'char-count--warning';
    return '';
  };

  const handleSend = async () => {
    if (!message.trim()) {
      setError('Le message ne peut pas etre vide.');
      return;
    }

    if (!confirm(`Envoyer ce SMS (${smsCount} segment${smsCount > 1 ? 's' : ''}) ?`)) return;

    setSending(true);
    setError('');
    setResult(null);

    try {
      const payload = {
        message: message.trim(),
        recipients: recipients === 'manual'
          ? manualPhones.split(/[\n,;]+/).map(p => p.trim()).filter(Boolean)
          : recipients,
      };
      const res = await api.post('/admin/sms/send', payload);
      setResult(res);
      setMessage('');
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <div>
      <div className="card mb-lg">
        <h3 className="card-title mb-md">Envoyer un SMS</h3>

        <div className="form-group">
          <label className="form-label">Destinataires</label>
          <select
            className="form-select"
            value={recipients}
            onChange={e => setRecipients(e.target.value)}
          >
            <option value="all">Tous les clients</option>
            <option value="manual">Numeros manuels</option>
          </select>
        </div>

        {recipients === 'manual' && (
          <div className="form-group">
            <label className="form-label">Numeros de telephone</label>
            <textarea
              className="form-textarea"
              value={manualPhones}
              onChange={e => setManualPhones(e.target.value)}
              placeholder="Un numero par ligne, ou separes par des virgules"
              rows={3}
            />
          </div>
        )}

        <div className="form-group">
          <label className="form-label">Message</label>
          <textarea
            className="form-textarea"
            value={message}
            onChange={e => setMessage(e.target.value)}
            placeholder="Votre message SMS..."
            rows={4}
          />
          <div className={`char-count ${getCharCountClass()}`}>
            {charCount} caractere{charCount !== 1 ? 's' : ''} — {smsCount} SMS
          </div>
        </div>

        {error && <div className="alert alert-error">{error}</div>}
        {result && (
          <div className="alert alert-success">
            SMS envoye avec succes ! {result.sent || ''} message{(result.sent || 0) > 1 ? 's' : ''} envoye{(result.sent || 0) > 1 ? 's' : ''}.
          </div>
        )}

        <button
          className="btn btn-primary"
          onClick={handleSend}
          disabled={sending || !message.trim()}
        >
          {sending ? <span className="spinner-inline" /> : 'Envoyer'}
        </button>
      </div>
    </div>
  );
}

/* ═══ Notifications Tab ═══════════════════════════ */
function NotificationsTab() {
  const [logs, setLogs] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [channelFilter, setChannelFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const fetchData = useCallback(async () => {
    try {
      const [logsRes, statsRes] = await Promise.all([
        api.get('/admin/notifications/logs'),
        api.get('/admin/notifications/stats'),
      ]);
      setLogs(Array.isArray(logsRes) ? logsRes : logsRes.logs || []);
      setStats(statsRes);
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const filtered = logs.filter(l => {
    if (channelFilter && l.channel !== channelFilter) return false;
    if (statusFilter && l.status !== statusFilter) return false;
    return true;
  });

  return (
    <div>
      {/* Stats cards */}
      {stats && (
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-card-label">Envoyes</div>
            <div className="stat-card-value text-success">{stats.sent || 0}</div>
          </div>
          <div className="stat-card">
            <div className="stat-card-label">En attente</div>
            <div className="stat-card-value" style={{ color: 'var(--warning)' }}>{stats.pending || 0}</div>
          </div>
          <div className="stat-card">
            <div className="stat-card-label">Echoues</div>
            <div className="stat-card-value text-danger">{stats.failed || 0}</div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="filters-row">
        <select
          className="form-select"
          value={channelFilter}
          onChange={e => setChannelFilter(e.target.value)}
          style={{ width: 150 }}
        >
          <option value="">Tous les canaux</option>
          <option value="email">Email</option>
          <option value="sms">SMS</option>
        </select>
        <select
          className="form-select"
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          style={{ width: 150 }}
        >
          <option value="">Tous les statuts</option>
          <option value="sent">Envoye</option>
          <option value="pending">En attente</option>
          <option value="failed">Echoue</option>
        </select>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {loading ? (
        <div className="empty-state">
          <div className="page-loading-spinner" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <p className="empty-state-text">Aucune notification</p>
        </div>
      ) : (
        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Type</th>
                <th>Canal</th>
                <th className="hide-mobile">Destinataire</th>
                <th>Statut</th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, 100).map(l => (
                <tr key={l.id}>
                  <td className="text-sm">
                    {l.created_at
                      ? format(parseISO(l.created_at), 'd MMM HH:mm', { locale: fr })
                      : '—'}
                  </td>
                  <td>{l.type || '—'}</td>
                  <td>
                    <span className={`badge ${l.channel === 'sms' ? 'badge-confirmed' : 'badge-pending'}`}>
                      {l.channel || '—'}
                    </span>
                  </td>
                  <td className="hide-mobile text-secondary truncate" style={{ maxWidth: 200 }}>
                    {l.recipient || '—'}
                  </td>
                  <td>
                    <span className={`badge badge-${l.status}`}>
                      {STATUS_LABELS[l.status] || l.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ═══ Automation Tab ══════════════════════════════ */
function AutomationTab() {
  const [triggers, setTriggers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchTriggers = useCallback(async () => {
    try {
      const res = await api.get('/admin/automation');
      setTriggers(Array.isArray(res) ? res : res.triggers || []);
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTriggers();
  }, [fetchTriggers]);

  const toggleTrigger = async (trigger) => {
    try {
      await api.put(`/admin/automation/${trigger.type}`, {
        is_active: !trigger.is_active,
        config: trigger.config,
      });
      fetchTriggers();
    } catch (err) {
      alert(err.message);
    }
  };

  const updateConfig = async (trigger, key, value) => {
    try {
      const newConfig = { ...trigger.config, [key]: value };
      await api.put(`/admin/automation/${trigger.type}`, {
        is_active: trigger.is_active,
        config: newConfig,
      });
      fetchTriggers();
    } catch (err) {
      alert(err.message);
    }
  };

  const TRIGGER_DESCRIPTIONS = {
    review_sms: 'Envoie automatiquement un SMS pour demander un avis Google apres un rendez-vous termine. Envoye une seule fois par client.',
    waitlist_notify: 'Notifie les clients en liste d\'attente quand un creneau se libere.',
  };

  const TRIGGER_LABELS = {
    review_sms: 'SMS avis Google',
    waitlist_notify: 'Notification liste d\'attente',
  };

  if (loading) {
    return (
      <div className="empty-state">
        <div className="page-loading-spinner" />
      </div>
    );
  }

  return (
    <div>
      {error && <div className="alert alert-error">{error}</div>}

      {triggers.length === 0 ? (
        <div className="empty-state">
          <p className="empty-state-text">Aucune automation configuree</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {triggers.map(t => (
            <div key={t.type} className="automation-card">
              <div className="automation-info">
                <h3>{TRIGGER_LABELS[t.type] || t.type}</h3>
                <p className="automation-desc">
                  {TRIGGER_DESCRIPTIONS[t.type] || 'Automation personnalisee'}
                </p>

                {t.type === 'review_sms' && t.config && (
                  <div className="automation-config">
                    <span className="automation-config-label">Delai :</span>
                    <input
                      type="number"
                      className="form-input"
                      value={t.config.delay_minutes || 60}
                      onChange={e => updateConfig(t, 'delay_minutes', parseInt(e.target.value, 10))}
                      min={10}
                      max={1440}
                    />
                    <span className="automation-config-label">minutes apres le RDV</span>
                  </div>
                )}
              </div>

              <label className="toggle">
                <input
                  type="checkbox"
                  className="toggle-input"
                  checked={t.is_active}
                  onChange={() => toggleTrigger(t)}
                />
                <span className="toggle-slider" />
              </label>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
