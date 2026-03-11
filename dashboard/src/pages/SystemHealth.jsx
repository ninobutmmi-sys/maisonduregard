import React, { useState, useEffect, useCallback } from 'react';
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import api from '../api';

export default function SystemHealth() {
  const [status, setStatus] = useState(null);
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lastCheck, setLastCheck] = useState(null);

  const fetchHealth = useCallback(async () => {
    try {
      const [healthRes, statusRes] = await Promise.all([
        api.get('/health').catch(() => null),
        api.get('/admin/system/health').catch(() => null),
      ]);

      setHealth(healthRes);
      setStatus(statusRes);
      setLastCheck(new Date());
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHealth();
  }, [fetchHealth]);

  const isApiUp = health && (health.status === 'ok' || health.status === 'healthy');
  const isDbUp = health?.database === 'connected' || health?.db === 'ok' || health?.database?.status === 'ok';

  // Cron jobs from system status
  const crons = status?.crons || status?.cronStatus || {};
  const rawMem = status?.memory || {};
  const memory = {
    rss: rawMem.rssMB ? rawMem.rssMB * 1024 * 1024 : rawMem.rss,
    heapUsed: rawMem.heapUsedMB ? rawMem.heapUsedMB * 1024 * 1024 : rawMem.heapUsed,
    heapTotal: rawMem.heapTotalMB ? rawMem.heapTotalMB * 1024 * 1024 : rawMem.heapTotal,
    external: rawMem.external,
  };
  const notifications = status?.notifications || {};
  const circuitBreaker = status?.circuitBreaker || status?.brevo || {};

  if (loading) {
    return (
      <div>
        <div className="page-header">
          <h1 className="page-title">Systeme</h1>
        </div>
        <div className="empty-state">
          <div className="page-loading-spinner" />
          <p>Verification du systeme...</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Systeme</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {lastCheck && (
            <span className="text-sm text-muted">
              Derniere verif: {format(lastCheck, 'HH:mm:ss', { locale: fr })}
            </span>
          )}
          <button className="btn btn-secondary btn-sm" onClick={() => { setLoading(true); fetchHealth(); }}>
            Rafraichir
          </button>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {/* Health Status */}
      <div className="health-grid mb-lg">
        <div className="health-item">
          <div className={`health-dot ${isApiUp ? 'health-dot--ok' : 'health-dot--error'}`} />
          <div className="health-info">
            <div className="health-label">API Backend</div>
            <div className="health-value">
              {isApiUp ? 'En ligne' : 'Hors ligne'}
            </div>
          </div>
        </div>

        <div className="health-item">
          <div className={`health-dot ${isDbUp ? 'health-dot--ok' : 'health-dot--error'}`} />
          <div className="health-info">
            <div className="health-label">Base de donnees</div>
            <div className="health-value">
              {isDbUp ? 'Connectee' : 'Deconnectee'}
            </div>
          </div>
        </div>

        <div className="health-item">
          <div className={`health-dot ${
            circuitBreaker.state === 'closed' || !circuitBreaker.state
              ? 'health-dot--ok'
              : circuitBreaker.state === 'half-open'
                ? 'health-dot--warning'
                : 'health-dot--error'
          }`} />
          <div className="health-info">
            <div className="health-label">Brevo (Email/SMS)</div>
            <div className="health-value">
              {circuitBreaker.state === 'open' ? 'Circuit ouvert (en pause)'
                : circuitBreaker.state === 'half-open' ? 'Test en cours'
                : 'Operationnel'}
            </div>
          </div>
        </div>

        <div className="health-item">
          <div className={`health-dot ${
            (notifications.pending || 0) > 10 ? 'health-dot--warning' : 'health-dot--ok'
          }`} />
          <div className="health-info">
            <div className="health-label">File de notifications</div>
            <div className="health-value">
              {notifications.pending || 0} en attente, {notifications.email_failed || notifications.failed || 0} echouee{(notifications.email_failed || notifications.failed || 0) > 1 ? 's' : ''}
            </div>
          </div>
        </div>
      </div>

      {/* Memory */}
      {(memory.rss || memory.heapUsed) && (
        <div className="card mb-lg">
          <h2 className="card-title mb-md">Memoire</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
            {memory.rss && (
              <div>
                <div className="text-sm text-muted">RSS</div>
                <div style={{ fontWeight: 600 }}>{formatBytes(memory.rss)}</div>
              </div>
            )}
            {memory.heapUsed && (
              <div>
                <div className="text-sm text-muted">Heap utilise</div>
                <div style={{ fontWeight: 600 }}>{formatBytes(memory.heapUsed)}</div>
              </div>
            )}
            {memory.heapTotal && (
              <div>
                <div className="text-sm text-muted">Heap total</div>
                <div style={{ fontWeight: 600 }}>{formatBytes(memory.heapTotal)}</div>
              </div>
            )}
            {memory.external && (
              <div>
                <div className="text-sm text-muted">External</div>
                <div style={{ fontWeight: 600 }}>{formatBytes(memory.external)}</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Cron Jobs */}
      <div className="card">
        <h2 className="card-title mb-md">Taches planifiees (cron)</h2>

        {Object.keys(crons).length === 0 ? (
          <div className="empty-state" style={{ padding: '1.5rem' }}>
            <p className="empty-state-text">
              Aucune donnee de cron disponible.
              {health?.environment === 'development' && ' Les crons sont desactives en dev.'}
            </p>
          </div>
        ) : (
          <div className="table-wrapper" style={{ border: 'none' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Job</th>
                  <th>Dernier run</th>
                  <th>Statut</th>
                  <th>Duree</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(crons).map(([name, info]) => {
                  const cronInfo = typeof info === 'object' ? info : {};
                  const lastRun = cronInfo.lastRun || cronInfo.last_run;
                  const lastStatus = cronInfo.status || cronInfo.lastStatus || 'unknown';
                  const duration = cronInfo.duration || cronInfo.lastDuration;

                  return (
                    <tr key={name}>
                      <td style={{ fontWeight: 600 }}>{formatCronName(name)}</td>
                      <td className="text-sm text-secondary">
                        {lastRun
                          ? format(new Date(lastRun), 'd MMM HH:mm', { locale: fr })
                          : '—'}
                      </td>
                      <td>
                        <span className={`badge ${
                          lastStatus === 'success' || lastStatus === 'ok'
                            ? 'badge-completed'
                            : lastStatus === 'running'
                              ? 'badge-confirmed'
                              : lastStatus === 'error' || lastStatus === 'failed'
                                ? 'badge-failed'
                                : 'badge-pending'
                        }`}>
                          {lastStatus}
                        </span>
                      </td>
                      <td className="text-sm text-muted">
                        {duration ? `${duration}ms` : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const num = typeof bytes === 'string' ? parseInt(bytes, 10) : bytes;
  if (num < 1024) return `${num} B`;
  if (num < 1024 * 1024) return `${(num / 1024).toFixed(1)} KB`;
  return `${(num / (1024 * 1024)).toFixed(1)} MB`;
}

function formatCronName(name) {
  return name
    .replace(/([A-Z])/g, ' $1')
    .replace(/_/g, ' ')
    .replace(/^\w/, c => c.toUpperCase())
    .trim();
}
