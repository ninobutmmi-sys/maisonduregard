import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import api from '../api';

const SORT_OPTIONS = [
  { value: 'last_name', label: 'Nom' },
  { value: 'last_visit', label: 'Derniere visite' },
  { value: 'bookings_count', label: 'Nombre de RDV' },
];

const PER_PAGE = 20;

export default function Clients() {
  const [clients, setClients] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('last_name');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const searchTimer = useRef(null);
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // Debounce search
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(searchTimer.current);
  }, [search]);

  const fetchClients = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(PER_PAGE),
        sort,
      });
      if (debouncedSearch) params.set('search', debouncedSearch);

      const res = await api.get(`/admin/clients?${params}`);
      setClients(Array.isArray(res) ? res : res.clients || []);
      setTotal(res.total || (Array.isArray(res) ? res.length : 0));
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch, sort]);

  useEffect(() => {
    fetchClients();
  }, [fetchClients]);

  const totalPages = Math.ceil(total / PER_PAGE) || 1;

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Clients</h1>
        <span className="text-sm text-muted">{total} client{total !== 1 ? 's' : ''}</span>
      </div>

      <div className="filters-row">
        <div className="search-bar" style={{ flex: 1, maxWidth: 360 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            className="form-input"
            placeholder="Rechercher par nom, telephone, email..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        <select
          className="form-select"
          value={sort}
          onChange={e => setSort(e.target.value)}
          style={{ width: 180 }}
        >
          {SORT_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {loading ? (
        <div className="empty-state">
          <div className="page-loading-spinner" />
        </div>
      ) : clients.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">?</div>
          <p className="empty-state-text">Aucun client trouve</p>
        </div>
      ) : (
        <>
          <div className="table-wrapper">
            <table className="table table-clickable">
              <thead>
                <tr>
                  <th>Nom</th>
                  <th>Telephone</th>
                  <th className="hide-mobile">Email</th>
                  <th>RDV</th>
                  <th className="hide-mobile">Derniere visite</th>
                  <th>Compte</th>
                </tr>
              </thead>
              <tbody>
                {clients.map(c => (
                  <tr key={c.id} onClick={() => navigate(`/clients/${c.id}`)}>
                    <td style={{ fontWeight: 600 }}>
                      {c.first_name || ''} {c.last_name || ''}
                      {!c.first_name && !c.last_name && <span className="text-muted">Sans nom</span>}
                    </td>
                    <td>{c.phone || '—'}</td>
                    <td className="hide-mobile text-secondary">{c.email || '—'}</td>
                    <td>{c.bookings_count ?? 0}</td>
                    <td className="hide-mobile text-secondary">
                      {c.last_visit
                        ? format(parseISO(c.last_visit), 'd MMM yyyy', { locale: fr })
                        : '—'}
                    </td>
                    <td>
                      {c.has_account ? (
                        <span className="badge badge-active">Inscrit</span>
                      ) : (
                        <span className="badge badge-inactive">Invite</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="pagination">
              <button
                className="pagination-btn"
                disabled={page <= 1}
                onClick={() => setPage(p => p - 1)}
              >
                &lt;
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter(p => p === 1 || p === totalPages || Math.abs(p - page) <= 2)
                .map((p, idx, arr) => (
                  <React.Fragment key={p}>
                    {idx > 0 && arr[idx - 1] !== p - 1 && (
                      <span className="pagination-info">...</span>
                    )}
                    <button
                      className={`pagination-btn ${p === page ? 'pagination-btn--active' : ''}`}
                      onClick={() => setPage(p)}
                    >
                      {p}
                    </button>
                  </React.Fragment>
                ))}
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
