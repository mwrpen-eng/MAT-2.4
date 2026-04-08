// @ts-nocheck
import { getAccessToken, initializeEntraAuth, isEntraEnabled, loginWithMicrosoft, logoutFromMicrosoft } from '@/lib/entraAuth';

const isLocalhost = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
const API_BASE = import.meta.env.VITE_APP_API_BASE_URL || (import.meta.env.DEV && isLocalhost ? 'http://127.0.0.1:3001/api' : '/api');

const buildQueryString = (params) => {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      query.set(key, Array.isArray(value) ? value.join(',') : String(value));
    }
  });
  const qs = query.toString();
  return qs ? `?${qs}` : '';
};

const fetchJson = async (url, options = {}) => {
  let authToken = null;

  if (isEntraEnabled) {
    try {
      authToken = await getAccessToken();
    } catch (error) {
      console.warn('Unable to acquire Microsoft Entra token', error);
    }
  }

  const response = await fetch(url, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      ...(options.headers || {}),
    },
    ...options,
  });

  if (!response.ok) {
    let message = `Request failed: ${response.status}`;
    const raw = await response.text();

    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        message = parsed?.error || parsed?.message || raw;
      } catch {
        message = raw;
      }
    }

    const error = new Error(message || `Request failed: ${response.status}`);
    error.status = response.status;
    throw error;
  }

  if (response.status === 204) {
    return null;
  }

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    const raw = await response.text();

    if (contentType.includes('text/html') || /^\s*<!doctype html/i.test(raw) || /^\s*<html/i.test(raw)) {
      throw new Error('Received an HTML login page instead of API JSON. Check VITE_APP_API_PROVIDER and VITE_APP_API_BASE_URL.');
    }

    return raw;
  }

  const data = await response.json();
  return data?.data ?? data;
};

const createRestEntityAdapter = (entityName) => ({
  list: (sort, limit, skip, fields) => fetchJson(`${API_BASE}/app-data/${entityName}${buildQueryString({ sort, limit, skip, fields })}`),
  filter: (query, sort, limit, skip, fields) => fetchJson(`${API_BASE}/app-data/${entityName}${buildQueryString({ q: JSON.stringify(query), sort, limit, skip, fields })}`),
  get: (id) => fetchJson(`${API_BASE}/app-data/${entityName}/${id}`),
  create: (data) => fetchJson(`${API_BASE}/app-data/${entityName}`, { method: 'POST', body: JSON.stringify(data) }),
  update: (id, data) => fetchJson(`${API_BASE}/app-data/${entityName}/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id) => fetchJson(`${API_BASE}/app-data/${entityName}/${id}`, { method: 'DELETE' }),
  bulkCreate: (data) => fetchJson(`${API_BASE}/app-data/${entityName}/bulk`, { method: 'POST', body: JSON.stringify(data) }),
  bulkUpdate: (data) => fetchJson(`${API_BASE}/app-data/${entityName}/bulk`, { method: 'PUT', body: JSON.stringify(data) }),
  updateMany: (query, data) => fetchJson(`${API_BASE}/app-data/${entityName}/update-many`, { method: 'PATCH', body: JSON.stringify({ query, data }) }),
  subscribe: () => () => {},
});

export const restProvider = {
  auth: {
    me: async () => {
      if (isEntraEnabled) {
        await initializeEntraAuth();
      }
      return fetchJson(`${API_BASE}/auth/me`);
    },
    logout: async (fromUrl = window.location.origin) => {
      if (isEntraEnabled) {
        await logoutFromMicrosoft(fromUrl);
        return;
      }
      window.location.href = `${API_BASE}/auth/logout${buildQueryString({ from_url: fromUrl })}`;
    },
    redirectToLogin: async (fromUrl = window.location.href) => {
      if (isEntraEnabled) {
        await loginWithMicrosoft(fromUrl);
        return;
      }
      window.location.href = `${API_BASE}/auth/login${buildQueryString({ from_url: fromUrl })}`;
    },
    loginWithProvider: async (provider, fromUrl = window.location.href) => {
      if (provider === 'microsoft' && isEntraEnabled) {
        await loginWithMicrosoft(fromUrl);
        return;
      }
      window.location.href = `${API_BASE}/auth/${provider}/login${buildQueryString({ from_url: fromUrl })}`;
    },
  },
  entities: {
    ULDFishbox: createRestEntityAdapter('ULDFishbox'),
    Flight: createRestEntityAdapter('Flight'),
  },
  functions: {
    invoke: (name, payload = {}) => fetchJson(`${API_BASE}/functions/${name}`, { method: 'POST', body: JSON.stringify(payload) }),
  },
  integrations: {
    Core: {
      UploadFile: (payload) => fetchJson(`${API_BASE}/integrations/core/upload-file`, { method: 'POST', body: JSON.stringify(payload) }),
      InvokeLLM: (payload) => fetchJson(`${API_BASE}/integrations/core/invoke-llm`, { method: 'POST', body: JSON.stringify(payload) }),
    },
  },
};

export default restProvider;