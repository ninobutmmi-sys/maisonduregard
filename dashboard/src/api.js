/**
 * Centralized API client for La Maison du Regard dashboard.
 * Auto-injects auth header, handles 401 refresh, provides get/post/put/patch/delete.
 */

const API_URL = window.location.hostname === 'localhost'
  ? 'http://localhost:3000/api'
  : 'https://api.lamaisonduregard.fr/api';

let isRefreshing = false;
let refreshQueue = [];

function getToken() {
  return localStorage.getItem('mdr_access_token');
}

function clearAuth() {
  localStorage.removeItem('mdr_access_token');
  localStorage.removeItem('mdr_user');
  window.location.hash = '#/';
}

async function refreshToken() {
  const res = await fetch(`${API_URL}/auth/refresh`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error('Refresh failed');
  const data = await res.json();
  const token = data.accessToken || data.access_token;
  if (token) {
    localStorage.setItem('mdr_access_token', token);
  }
  return data;
}

async function request(method, path, body) {
  const token = getToken();
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const opts = { method, headers };
  if (body && method !== 'GET') {
    opts.body = JSON.stringify(body);
  }

  let res = await fetch(`${API_URL}${path}`, opts);

  // On 401, attempt token refresh then retry once
  if (res.status === 401 && token) {
    if (!isRefreshing) {
      isRefreshing = true;
      try {
        await refreshToken();
        isRefreshing = false;
        // Process queued requests
        refreshQueue.forEach(cb => cb());
        refreshQueue = [];
      } catch {
        isRefreshing = false;
        refreshQueue = [];
        clearAuth();
        throw new Error('Session expirée');
      }
    } else {
      // Wait for refresh in progress
      await new Promise(resolve => { refreshQueue.push(resolve); });
    }

    // Retry with new token
    const newToken = getToken();
    if (newToken) {
      headers['Authorization'] = `Bearer ${newToken}`;
      opts.headers = headers;
      res = await fetch(`${API_URL}${path}`, opts);
    } else {
      clearAuth();
      throw new Error('Session expirée');
    }
  }

  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: `Erreur ${res.status}` }));
    throw new Error(error.message || `Erreur ${res.status}`);
  }

  // Handle 204 No Content
  if (res.status === 204) return null;

  return res.json();
}

const api = {
  get: (path) => request('GET', path),
  post: (path, body) => request('POST', path, body),
  put: (path, body) => request('PUT', path, body),
  patch: (path, body) => request('PATCH', path, body),
  delete: (path) => request('DELETE', path),
  API_URL,
};

export default api;
