import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { access, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { createRemoteJWKSet, jwtVerify } from 'jose';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.join(__dirname, '..');
const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(__dirname, 'data');
const DIST_DIR = path.join(ROOT_DIR, 'dist');
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');
const DB_PATH = process.env.DB_PATH
  ? path.resolve(process.env.DB_PATH)
  : path.join(DATA_DIR, 'app.db');
const PORT = Number(process.env.PORT || 3001);
const HOST = process.env.HOST || '0.0.0.0';
const APP_ALLOWED_ORIGIN = process.env.APP_ALLOWED_ORIGIN || '';
const AUTH_MODE = process.env.AUTH_MODE || (process.env.AZURE_TENANT_ID && process.env.AZURE_CLIENT_ID ? 'entra' : 'local');
const AZURE_TENANT_ID = process.env.AZURE_TENANT_ID || '';
const AZURE_CLIENT_ID = process.env.AZURE_CLIENT_ID || '';
const AZURE_ALLOWED_EMAIL_DOMAINS = (process.env.AZURE_ALLOWED_EMAIL_DOMAINS || '')
  .split(',')
  .map((item) => item.trim().toLowerCase())
  .filter(Boolean);
const AZURE_ALLOWED_GROUPS = (process.env.AZURE_ALLOWED_GROUPS || '')
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean);
const ENTRA_ISSUER = AZURE_TENANT_ID ? `https://login.microsoftonline.com/${AZURE_TENANT_ID}/v2.0` : '';
const ENTRA_JWKS = AZURE_TENANT_ID
  ? createRemoteJWKSet(new URL(`https://login.microsoftonline.com/${AZURE_TENANT_ID}/discovery/v2.0/keys`))
  : null;
const ENTITY_FILES = {
  ULDFishbox: 'ULDFishbox.json',
  Flight: 'Flight.json',
};
const ENTITY_NAMES = Object.keys(ENTITY_FILES);
const STATIC_CONTENT_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.webp': 'image/webp',
};

const db = new DatabaseSync(DB_PATH);

const isAllowedDevOrigin = (origin) => {
  try {
    const parsed = new URL(origin);
    if (!['http:', 'https:'].includes(parsed.protocol)) return false;
    return parsed.hostname === 'localhost'
      || parsed.hostname === '127.0.0.1'
      || parsed.hostname === '::1'
      || /^192\.168\.\d+\.\d+$/.test(parsed.hostname)
      || /^10\.\d+\.\d+\.\d+$/.test(parsed.hostname)
      || /^172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+$/.test(parsed.hostname);
  } catch {
    return false;
  }
};

const getAllowedOrigin = (origin) => {
  if (APP_ALLOWED_ORIGIN) return APP_ALLOWED_ORIGIN;
  if (!origin) return 'http://127.0.0.1:5173';
  if (isAllowedDevOrigin(origin)) {
    return origin;
  }
  return 'http://127.0.0.1:5173';
};

const sendJson = (req, res, statusCode, payload) => {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': getAllowedOrigin(req.headers.origin || ''),
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  });
  res.end(JSON.stringify(payload, null, 2));
};

const sendRedirect = (res, to) => {
  res.writeHead(302, { Location: to || '/' });
  res.end();
};

const buildLocalUser = () => ({
  id: 'local-user',
  name: 'Local Dev User',
  email: 'local@example.com',
  provider: 'rest-sqlite-local',
});

const getAuthenticatedUser = async (req) => {
  if (AUTH_MODE !== 'entra') {
    return buildLocalUser();
  }

  if (!AZURE_TENANT_ID || !AZURE_CLIENT_ID || !ENTRA_JWKS) {
    const error = new Error('Microsoft Entra ID is not fully configured on the server.');
    error.statusCode = 500;
    throw error;
  }

  const authHeader = req.headers.authorization || '';
  if (!authHeader.toLowerCase().startsWith('bearer ')) {
    const error = new Error('Microsoft sign-in required.');
    error.statusCode = 401;
    throw error;
  }

  const token = authHeader.slice(7).trim();

  try {
    const { payload } = await jwtVerify(token, ENTRA_JWKS, {
      issuer: ENTRA_ISSUER,
      audience: [AZURE_CLIENT_ID, `api://${AZURE_CLIENT_ID}`],
    });

    const email = String(payload.preferred_username || payload.email || '').toLowerCase();
    if (AZURE_ALLOWED_EMAIL_DOMAINS.length > 0 && !AZURE_ALLOWED_EMAIL_DOMAINS.some((domain) => email.endsWith(`@${domain}`))) {
      const error = new Error('Your Microsoft account is not allowed to use this application.');
      error.statusCode = 403;
      throw error;
    }

    if (AZURE_ALLOWED_GROUPS.length > 0) {
      const groups = Array.isArray(payload.groups) ? payload.groups : [];
      const inAllowedGroup = groups.some((groupId) => AZURE_ALLOWED_GROUPS.includes(String(groupId)));
      if (!inAllowedGroup) {
        const error = new Error('Your Microsoft account is missing the required MOWI access group.');
        error.statusCode = 403;
        throw error;
      }
    }

    return {
      id: payload.oid || payload.sub,
      name: payload.name || payload.preferred_username || 'Microsoft User',
      email: payload.preferred_username || payload.email || null,
      provider: 'microsoft-entra',
      roles: payload.roles || [],
      groups: Array.isArray(payload.groups) ? payload.groups : [],
    };
  } catch (error) {
    if (error?.statusCode) {
      throw error;
    }

    const authError = new Error(error?.code === 'ERR_JWT_EXPIRED'
      ? 'Your Microsoft session has expired. Please sign in again.'
      : 'Invalid Microsoft access token.');
    authError.statusCode = 401;
    throw authError;
  }
};

const requireAuth = async (req, res) => {
  try {
    return await getAuthenticatedUser(req);
  } catch (error) {
    sendJson(req, res, error.statusCode || 401, {
      error: error.message || 'Unauthorized',
      authMode: AUTH_MODE,
    });
    return null;
  }
};

const serializeRecord = (record) => {
  const { id, created_date, updated_date, ...payload } = record;
  return { id, created_date, updated_date, payload: JSON.stringify(payload) };
};

const hydrateRow = (row) => ({
  ...JSON.parse(row.payload || '{}'),
  id: row.id,
  created_date: row.created_date,
  updated_date: row.updated_date,
});

const ensureDataStore = async () => {
  await mkdir(DATA_DIR, { recursive: true });

  ENTITY_NAMES.forEach((entityName) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS ${entityName} (
        id TEXT PRIMARY KEY,
        payload TEXT NOT NULL,
        created_date TEXT NOT NULL,
        updated_date TEXT NOT NULL
      )
    `);
  });

  for (const [entityName, fileName] of Object.entries(ENTITY_FILES)) {
    const countRow = db.prepare(`SELECT COUNT(*) as count FROM ${entityName}`).get();
    if ((countRow?.count || 0) > 0) continue;

    try {
      const filePath = path.join(DATA_DIR, fileName);
      const raw = await readFile(filePath, 'utf8');
      const parsed = JSON.parse(raw || '[]');
      if (Array.isArray(parsed) && parsed.length > 0) {
        const insert = db.prepare(`
          INSERT OR REPLACE INTO ${entityName} (id, payload, created_date, updated_date)
          VALUES (?, ?, ?, ?)
        `);
        parsed.forEach((record) => {
          const serialized = serializeRecord(record);
          insert.run(serialized.id, serialized.payload, serialized.created_date, serialized.updated_date);
        });
      }
    } catch {
      // No legacy JSON seed available; start with an empty SQL table.
    }
  }
};

const readEntity = (entityName) => {
  if (!ENTITY_NAMES.includes(entityName)) {
    throw new Error(`Unsupported entity: ${entityName}`);
  }
  const rows = db.prepare(`SELECT id, payload, created_date, updated_date FROM ${entityName}`).all();
  return rows.map(hydrateRow);
};

const writeEntity = (entityName, records) => {
  if (!ENTITY_NAMES.includes(entityName)) {
    throw new Error(`Unsupported entity: ${entityName}`);
  }

  const upsert = db.prepare(`
    INSERT INTO ${entityName} (id, payload, created_date, updated_date)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      payload = excluded.payload,
      created_date = excluded.created_date,
      updated_date = excluded.updated_date
  `);

  records.forEach((record) => {
    const serialized = serializeRecord(record);
    upsert.run(serialized.id, serialized.payload, serialized.created_date, serialized.updated_date);
  });
};

const deleteEntityRecord = (entityName, id) => {
  db.prepare(`DELETE FROM ${entityName} WHERE id = ?`).run(String(id));
};

const parseBody = async (req) => {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  if (!chunks.length) {
    return {};
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
};

const matchesQuery = (record, query = {}) => Object.entries(query).every(([key, value]) => {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    if (Array.isArray(value.$in)) {
      return value.$in.includes(record[key]);
    }
    return true;
  }
  return String(record[key] ?? '') === String(value ?? '');
});

const applySort = (records, sort) => {
  if (!sort) return [...records];
  const descending = String(sort).startsWith('-');
  const field = String(sort).replace(/^-/, '');
  const direction = descending ? -1 : 1;

  return [...records].sort((a, b) => {
    const av = a?.[field];
    const bv = b?.[field];
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;

    const aTime = Date.parse(av);
    const bTime = Date.parse(bv);
    if (!Number.isNaN(aTime) && !Number.isNaN(bTime)) {
      return (aTime - bTime) * direction;
    }

    if (av > bv) return 1 * direction;
    if (av < bv) return -1 * direction;
    return 0;
  });
};

const applyFields = (records, fields) => {
  if (!fields) return records;
  const wanted = String(fields).split(',').map((field) => field.trim()).filter(Boolean);
  if (!wanted.length) return records;
  return records.map((record) => Object.fromEntries(wanted.map((field) => [field, record[field]])));
};

const withMeta = (payload, existing = null) => {
  const now = new Date().toISOString();
  return {
    ...(existing || {}),
    ...payload,
    id: existing?.id || payload.id || randomUUID(),
    created_date: existing?.created_date || payload.created_date || now,
    updated_date: now,
  };
};

const handleEntityRequest = async (req, res, pathname, searchParams) => {
  const parts = pathname.split('/').filter(Boolean);
  const entityName = parts[2];
  const extra = parts.slice(3);

  if (!ENTITY_NAMES.includes(entityName)) {
    sendJson(req, res, 404, { error: 'Unknown entity' });
    return;
  }

  const records = readEntity(entityName);

  if (req.method === 'GET' && extra.length === 0) {
    const query = searchParams.get('q');
    let result = query ? records.filter((record) => matchesQuery(record, JSON.parse(query))) : [...records];
    result = applySort(result, searchParams.get('sort'));

    const skip = Number(searchParams.get('skip') || 0);
    const limit = Number(searchParams.get('limit') || result.length || 0);
    if (skip > 0 || limit > 0) {
      result = result.slice(skip, limit > 0 ? skip + limit : undefined);
    }

    result = applyFields(result, searchParams.get('fields'));
    sendJson(req, res, 200, result);
    return;
  }

  if (req.method === 'GET' && extra.length === 1) {
    const record = records.find((item) => String(item.id) === String(extra[0]));
    if (!record) {
      sendJson(req, res, 404, { error: 'Record not found' });
      return;
    }
    sendJson(req, res, 200, record);
    return;
  }

  if (req.method === 'POST' && extra[0] === 'bulk') {
    const body = await parseBody(req);
    const items = Array.isArray(body) ? body : Array.isArray(body.items) ? body.items : [];
    const created = items.map((item) => withMeta(item));
    writeEntity(entityName, created);
    sendJson(req, res, 201, created);
    return;
  }

  if (req.method === 'PUT' && extra[0] === 'bulk') {
    const body = await parseBody(req);
    const items = Array.isArray(body) ? body : Array.isArray(body.items) ? body.items : [];
    const updated = records.map((record) => {
      const patch = items.find((item) => String(item.id) === String(record.id));
      return patch ? withMeta(patch, record) : record;
    });
    writeEntity(entityName, updated);
    sendJson(req, res, 200, updated);
    return;
  }

  if (req.method === 'PATCH' && extra[0] === 'update-many') {
    const body = await parseBody(req);
    const updated = records.map((record) => matchesQuery(record, body.query || {}) ? withMeta(body.data || {}, record) : record);
    writeEntity(entityName, updated);
    sendJson(req, res, 200, updated.filter((record) => matchesQuery(record, body.query || {})));
    return;
  }

  if (req.method === 'POST' && extra.length === 0) {
    const body = await parseBody(req);
    const created = withMeta(body);
    writeEntity(entityName, [created]);
    sendJson(req, res, 201, created);
    return;
  }

  if ((req.method === 'PUT' || req.method === 'PATCH') && extra.length === 1) {
    const body = await parseBody(req);
    const existing = records.find((record) => String(record.id) === String(extra[0]));
    if (!existing) {
      sendJson(req, res, 404, { error: 'Record not found' });
      return;
    }

    const updatedRecord = withMeta(body, existing);
    writeEntity(entityName, [updatedRecord]);
    sendJson(req, res, 200, updatedRecord);
    return;
  }

  if (req.method === 'DELETE' && extra.length === 1) {
    deleteEntityRecord(entityName, extra[0]);
    sendJson(req, res, 200, { success: true, id: extra[0] });
    return;
  }

  sendJson(req, res, 405, { error: 'Method not allowed' });
};

const fileExists = async (filePath) => {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
};

const sendStaticFile = async (res, filePath, isHeadRequest = false) => {
  const ext = path.extname(filePath).toLowerCase();
  res.writeHead(200, {
    'Content-Type': STATIC_CONTENT_TYPES[ext] || 'application/octet-stream',
    'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=86400',
  });

  if (isHeadRequest) {
    res.end();
    return;
  }

  createReadStream(filePath).pipe(res);
};

const serveFrontendAsset = async (req, res, pathname) => {
  if (!['GET', 'HEAD'].includes(req.method || 'GET') || pathname.startsWith('/api/')) {
    return false;
  }

  const decodedPath = (() => {
    try {
      return decodeURIComponent(pathname || '/');
    } catch {
      return '/';
    }
  })();

  const normalizedPath = path.normalize(decodedPath).replace(/^([.][.][/\\])+/, '').replace(/^[/\\]+/, '');
  const requestedPath = normalizedPath && normalizedPath !== '.' ? normalizedPath : 'index.html';
  const directCandidates = [
    path.join(DIST_DIR, requestedPath),
    path.join(PUBLIC_DIR, requestedPath),
  ];

  for (const candidate of directCandidates) {
    if (await fileExists(candidate)) {
      await sendStaticFile(res, candidate, req.method === 'HEAD');
      return true;
    }
  }

  const spaEntry = path.join(DIST_DIR, 'index.html');
  if (await fileExists(spaEntry)) {
    await sendStaticFile(res, spaEntry, req.method === 'HEAD');
    return true;
  }

  return false;
};

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'OPTIONS') {
      sendJson(req, res, 200, { ok: true });
      return;
    }

    const url = new URL(req.url, `http://${req.headers.host}`);
    const { pathname, searchParams } = url;

    if (pathname === '/api/health') {
      sendJson(req, res, 200, { ok: true, provider: 'rest-sqlite', database: DB_PATH, port: PORT, host: HOST, authMode: AUTH_MODE });
      return;
    }

    if (pathname === '/api/auth/me') {
      const user = await requireAuth(req, res);
      if (!user) return;
      sendJson(req, res, 200, user);
      return;
    }

    if (pathname === '/api/auth/login' || pathname === '/api/auth/logout' || /^\/api\/auth\/[^/]+\/login$/.test(pathname)) {
      sendRedirect(res, searchParams.get('from_url') || '/');
      return;
    }

    if (pathname.startsWith('/api/functions/') && req.method === 'POST') {
      const user = await requireAuth(req, res);
      if (!user) return;

      const functionName = pathname.split('/').pop();
      const payload = await parseBody(req);
      sendJson(req, res, 200, {
        ok: false,
        provider: 'rest-sqlite',
        function: functionName,
        message: 'Function execution is not implemented in the SQL backend yet.',
        payload,
        user,
      });
      return;
    }

    if (pathname === '/api/integrations/core/upload-file' && req.method === 'POST') {
      const user = await requireAuth(req, res);
      if (!user) return;

      sendJson(req, res, 200, {
        file_url: null,
        message: 'File upload is not implemented in the SQL backend yet.',
        user,
      });
      return;
    }

    if (pathname === '/api/integrations/core/invoke-llm' && req.method === 'POST') {
      const user = await requireAuth(req, res);
      if (!user) return;

      sendJson(req, res, 200, {
        result: 'SQLite backend stub: InvokeLLM is not implemented yet.',
        user,
      });
      return;
    }

    if (pathname.startsWith('/api/app-data/')) {
      const user = await requireAuth(req, res);
      if (!user) return;

      await handleEntityRequest(req, res, pathname, searchParams);
      return;
    }

    if (await serveFrontendAsset(req, res, pathname)) {
      return;
    }

    sendJson(req, res, 404, { error: 'Not found' });
  } catch (error) {
    console.error('[local-api]', error);
    sendJson(req, res, 500, { error: error.message || 'Internal server error' });
  }
});

await ensureDataStore();
server.listen(PORT, HOST, () => {
  console.log(`[local-api] SQLite backend running at http://${HOST}:${PORT}/api`);
  console.log(`[local-api] Database file: ${DB_PATH}`);
  console.log(`[local-api] Auth mode: ${AUTH_MODE}`);
});
