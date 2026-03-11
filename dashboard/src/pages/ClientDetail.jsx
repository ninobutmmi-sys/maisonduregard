import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import api from '../api';

const STATUS_LABELS = {
  confirmed: 'Confirme',
  completed: 'Termine',
  no_show: 'Absent',
  cancelled: 'Annule',
};

function formatPrice(cents) {
  if (!cents && cents !== 0) return '—';
  return (cents / 100).toFixed(2).replace('.', ',') + ' \u20AC';
}

const CloseIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const BackIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />
  </svg>
);

export default function ClientDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [client, setClient] = useState(null);
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notes, setNotes] = useState('');
  const [notesSaving, setNotesSaving] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const fetchClient = useCallback(async () => {
    try {
      const res = await api.get(`/admin/clients/${id}`);
      const clientData = res.client || res;
      setClient(clientData);
      setNotes(clientData.notes || '');
      setBookings(res.bookings || clientData.bookings || []);
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchClient();
  }, [fetchClient]);

  const saveNotes = async () => {
    setNotesSaving(true);
    try {
      await api.put(`/admin/clients/${id}`, { notes });
    } catch (err) {
      alert(err.message);
    } finally {
      setNotesSaving(false);
    }
  };

  const deleteClient = async () => {
    try {
      await api.delete(`/admin/clients/${id}`);
      navigate('/clients');
    } catch (err) {
      alert(err.message);
    }
  };

  if (loading) {
    return (
      <div className="empty-state">
        <div className="page-loading-spinner" />
        <p>Chargement...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <div className="alert alert-error">{error}</div>
        <button className="btn btn-ghost" onClick={() => navigate('/clients')}>
          <BackIcon /> Retour aux clients
        </button>
      </div>
    );
  }

  if (!client) return null;

  // Compute stats
  const completedBookings = bookings.filter(b => b.status === 'completed');
  const totalSpent = completedBookings.reduce((sum, b) => sum + (b.price || 0), 0);
  const firstVisit = completedBookings.length > 0
    ? completedBookings.reduce((min, b) => b.date < min ? b.date : min, completedBookings[0].date)
    : null;
  const lastVisit = completedBookings.length > 0
    ? completedBookings.reduce((max, b) => b.date > max ? b.date : max, completedBookings[0].date)
    : null;

  // Favorite service
  const serviceCounts = {};
  completedBookings.forEach(b => {
    const name = b.service_name || 'Inconnu';
    serviceCounts[name] = (serviceCounts[name] || 0) + 1;
  });
  const favoriteService = Object.entries(serviceCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || '—';

  return (
    <div>
      <button className="btn btn-ghost mb-md" onClick={() => navigate('/clients')}>
        <BackIcon /> Retour
      </button>

      {/* Header */}
      <div className="detail-header">
        <div className="detail-info">
          <h1 className="detail-name">
            {client.first_name || ''} {client.last_name || ''}
            {!client.first_name && !client.last_name && 'Client sans nom'}
          </h1>
          <div className="detail-meta">
            {client.phone && <span>{client.phone}</span>}
            {client.phone && client.email && <span> &middot; </span>}
            {client.email && <span>{client.email}</span>}
          </div>
          <div style={{ marginTop: '0.35rem' }}>
            {client.has_account ? (
              <span className="badge badge-active">Compte inscrit</span>
            ) : (
              <span className="badge badge-inactive">Invite</span>
            )}
          </div>
        </div>

        <button className="btn btn-danger btn-sm" onClick={() => setShowDeleteModal(true)}>
          Supprimer (RGPD)
        </button>
      </div>

      {/* Stats */}
      <div className="detail-stats">
        <div className="stat-card">
          <div className="stat-card-label">Total RDV</div>
          <div className="stat-card-value">{bookings.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Termines</div>
          <div className="stat-card-value">{completedBookings.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Total depense</div>
          <div className="stat-card-value">{formatPrice(totalSpent)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Service favori</div>
          <div className="stat-card-value" style={{ fontSize: '1rem' }}>{favoriteService}</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1.5rem' }}>
        <div className="stat-card">
          <div className="stat-card-label">Premiere visite</div>
          <div className="stat-card-value" style={{ fontSize: '1rem' }}>
            {firstVisit ? format(parseISO(firstVisit), 'd MMM yyyy', { locale: fr }) : '—'}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Derniere visite</div>
          <div className="stat-card-value" style={{ fontSize: '1rem' }}>
            {lastVisit ? format(parseISO(lastVisit), 'd MMM yyyy', { locale: fr }) : '—'}
          </div>
        </div>
      </div>

      {/* Notes */}
      <div className="card mb-lg">
        <div className="card-header">
          <h2 className="card-title">Notes</h2>
          {notesSaving && <span className="text-sm text-muted">Enregistrement...</span>}
        </div>
        <textarea
          className="form-textarea"
          value={notes}
          onChange={e => setNotes(e.target.value)}
          onBlur={saveNotes}
          placeholder="Ajouter des notes sur ce client..."
          rows={3}
        />
      </div>

      {/* Booking History */}
      <div className="card">
        <h2 className="card-title mb-md">Historique des rendez-vous</h2>
        {bookings.length === 0 ? (
          <div className="empty-state" style={{ padding: '1.5rem' }}>
            <p className="empty-state-text">Aucun rendez-vous</p>
          </div>
        ) : (
          <div className="table-wrapper" style={{ border: 'none' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Service</th>
                  <th>Statut</th>
                  <th className="text-right">Prix</th>
                </tr>
              </thead>
              <tbody>
                {bookings
                  .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
                  .map(b => (
                    <tr key={b.id}>
                      <td>
                        {b.date ? format(parseISO(b.date), 'd MMM yyyy', { locale: fr }) : '—'}
                        <div className="text-sm text-muted">{b.start_time?.slice(0, 5) || ''}</div>
                      </td>
                      <td>{b.service_name || '—'}</td>
                      <td>
                        <span className={`badge badge-${b.status}`}>
                          {STATUS_LABELS[b.status] || b.status}
                        </span>
                      </td>
                      <td className="text-right">{formatPrice(b.price)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Delete Modal */}
      {showDeleteModal && (
        <div className="modal-overlay" onClick={() => setShowDeleteModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Supprimer le client</h2>
              <button className="modal-close" onClick={() => setShowDeleteModal(false)}>
                <CloseIcon />
              </button>
            </div>
            <div className="modal-body">
              <p className="confirm-text">
                Supprimer <strong>{client.first_name} {client.last_name}</strong> et toutes ses donnees ?
              </p>
              <p className="confirm-warning">
                Cette action est irreversible (suppression RGPD).
              </p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowDeleteModal(false)}>Annuler</button>
              <button className="btn btn-danger" onClick={deleteClient}>
                Confirmer la suppression
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
