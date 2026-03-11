import React, { useState, useEffect, useCallback } from 'react';
import api from '../api';

const CATEGORIES = ['Sourcils', 'Maquillage Permanent', 'Cils'];

const COLOR_PALETTE = [
  '#C9A96E', '#ff9a9e', '#fcb69f', '#a18cd1', '#fbc2eb',
  '#f6d365', '#84fab0', '#8fd3f4', '#d4a373', '#e9c46a',
  '#f4845f', '#f09999', '#b5838d', '#cdb4db', '#ffc8dd',
  '#bde0fe', '#a2d2ff', '#caffbf', '#ffd6a5', '#fdffb6',
];

function formatPrice(cents) {
  if (!cents && cents !== 0) return '';
  return (cents / 100).toFixed(2).replace('.', ',') + ' \u20AC';
}

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

export default function Services() {
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('all');
  const [search, setSearch] = useState('');
  const [editModal, setEditModal] = useState(null); // null | 'new' | service object
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  const fetchServices = useCallback(async () => {
    try {
      const res = await api.get('/admin/services');
      setServices(Array.isArray(res) ? res : res.services || []);
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchServices();
  }, [fetchServices]);

  const filtered = services.filter(s => {
    if (activeTab !== 'all' && s.category !== activeTab) return false;
    if (search && !s.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  }).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));

  const toggleActive = async (service) => {
    try {
      await api.put(`/admin/services/${service.id}`, {
        ...service,
        is_active: !service.is_active,
      });
      fetchServices();
    } catch (err) {
      alert(err.message);
    }
  };

  const deleteService = async (id) => {
    try {
      await api.delete(`/admin/services/${id}`);
      setDeleteConfirm(null);
      fetchServices();
    } catch (err) {
      alert(err.message);
    }
  };

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Services</h1>
        <button className="btn btn-primary" onClick={() => setEditModal('new')}>
          <PlusIcon /> Ajouter
        </button>
      </div>

      <div className="tabs">
        {['all', ...CATEGORIES].map(cat => (
          <button
            key={cat}
            className={`tab ${activeTab === cat ? 'tab--active' : ''}`}
            onClick={() => setActiveTab(cat)}
          >
            {cat === 'all' ? 'Toutes' : cat}
          </button>
        ))}
      </div>

      <div className="search-bar mb-md">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          className="form-input"
          placeholder="Rechercher une prestation..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {loading ? (
        <div className="empty-state">
          <div className="page-loading-spinner" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">~</div>
          <p className="empty-state-text">Aucune prestation trouvee</p>
        </div>
      ) : (
        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr>
                <th>Couleur</th>
                <th>Nom</th>
                <th>Categorie</th>
                <th>Duree</th>
                <th>Prix</th>
                <th>Actif</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(s => (
                <tr key={s.id}>
                  <td>
                    <span
                      className="color-dot"
                      style={{ background: s.color || '#C9A96E', width: 14, height: 14 }}
                    />
                  </td>
                  <td style={{ fontWeight: 600 }}>
                    {s.name}
                    {s.is_popular && (
                      <span className="badge" style={{ marginLeft: 6, background: 'var(--accent-light)', color: 'var(--accent)', fontSize: '0.65rem' }}>
                        Populaire
                      </span>
                    )}
                  </td>
                  <td className="text-secondary">{s.category || '—'}</td>
                  <td>{s.duration} min</td>
                  <td style={{ fontWeight: 600 }}>{formatPrice(s.price)}</td>
                  <td>
                    <label className="toggle">
                      <input
                        type="checkbox"
                        className="toggle-input"
                        checked={s.is_active !== false}
                        onChange={() => toggleActive(s)}
                      />
                      <span className="toggle-slider" />
                    </label>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '0.35rem' }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => setEditModal(s)}>
                        Modifier
                      </button>
                      <button
                        className="btn btn-ghost btn-sm text-danger"
                        onClick={() => setDeleteConfirm(s)}
                      >
                        Supprimer
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Edit / Add Modal */}
      {editModal && (
        <ServiceModal
          service={editModal === 'new' ? null : editModal}
          onClose={() => setEditModal(null)}
          onSaved={() => { setEditModal(null); fetchServices(); }}
        />
      )}

      {/* Delete Confirmation */}
      {deleteConfirm && (
        <div className="modal-overlay" onClick={() => setDeleteConfirm(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Supprimer la prestation</h2>
              <button className="modal-close" onClick={() => setDeleteConfirm(null)}>
                <CloseIcon />
              </button>
            </div>
            <div className="modal-body">
              <p className="confirm-text">
                Supprimer <strong>{deleteConfirm.name}</strong> ? Cette action est irreversible.
              </p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setDeleteConfirm(null)}>Annuler</button>
              <button className="btn btn-danger" onClick={() => deleteService(deleteConfirm.id)}>
                Supprimer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Service Edit/Add Modal ───────────────────── */
function ServiceModal({ service, onClose, onSaved }) {
  const isNew = !service;
  const [form, setForm] = useState({
    name: service?.name || '',
    category: service?.category || CATEGORIES[0],
    description: service?.description || '',
    duration: service?.duration || 60,
    price: service?.price ? (service.price / 100).toFixed(2) : '',
    color: service?.color || COLOR_PALETTE[0],
    is_popular: service?.is_popular || false,
    is_active: service?.is_active !== false,
    sort_order: service?.sort_order || 0,
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (field, value) => {
    setForm(f => ({ ...f, [field]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name || !form.duration || !form.price) {
      setError('Nom, duree et prix sont obligatoires.');
      return;
    }

    const priceInCents = Math.round(parseFloat(form.price.replace(',', '.')) * 100);
    if (isNaN(priceInCents) || priceInCents < 0) {
      setError('Prix invalide.');
      return;
    }

    setSubmitting(true);
    setError('');

    const payload = {
      name: form.name,
      category: form.category,
      description: form.description,
      duration: parseInt(form.duration, 10),
      price: priceInCents,
      color: form.color,
      is_popular: form.is_popular,
      is_active: form.is_active,
      sort_order: parseInt(form.sort_order, 10) || 0,
    };

    try {
      if (isNew) {
        await api.post('/admin/services', payload);
      } else {
        await api.put(`/admin/services/${service.id}`, payload);
      }
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
          <h2 className="modal-title">{isNew ? 'Nouvelle prestation' : 'Modifier la prestation'}</h2>
          <button className="modal-close" onClick={onClose}><CloseIcon /></button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {error && <div className="alert alert-error">{error}</div>}

            <div className="form-group">
              <label className="form-label">Nom *</label>
              <input
                className="form-input"
                value={form.name}
                onChange={e => handleChange('name', e.target.value)}
                placeholder="Nom de la prestation"
              />
            </div>

            <div className="form-group">
              <label className="form-label">Categorie</label>
              <select
                className="form-select"
                value={form.category}
                onChange={e => handleChange('category', e.target.value)}
              >
                {CATEGORIES.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Description</label>
              <textarea
                className="form-textarea"
                value={form.description}
                onChange={e => handleChange('description', e.target.value)}
                placeholder="Description optionnelle"
                rows={2}
              />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Duree (min) *</label>
                <input
                  className="form-input"
                  type="number"
                  min="5"
                  step="5"
                  value={form.duration}
                  onChange={e => handleChange('duration', e.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Prix (EUR) *</label>
                <input
                  className="form-input"
                  value={form.price}
                  onChange={e => handleChange('price', e.target.value)}
                  placeholder="45.00"
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Couleur</label>
              <div className="color-picker-grid">
                {COLOR_PALETTE.map(c => (
                  <div
                    key={c}
                    className={`color-swatch ${form.color === c ? 'color-swatch--selected' : ''}`}
                    style={{ background: c }}
                    onClick={() => handleChange('color', c)}
                  />
                ))}
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="toggle">
                  <input
                    type="checkbox"
                    className="toggle-input"
                    checked={form.is_popular}
                    onChange={e => handleChange('is_popular', e.target.checked)}
                  />
                  <span className="toggle-slider" />
                  <span className="toggle-label">Populaire</span>
                </label>
              </div>
              <div className="form-group">
                <label className="form-label">Ordre d'affichage</label>
                <input
                  className="form-input"
                  type="number"
                  value={form.sort_order}
                  onChange={e => handleChange('sort_order', e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Annuler</button>
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? <span className="spinner-inline" /> : (isNew ? 'Creer' : 'Enregistrer')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
