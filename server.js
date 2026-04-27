const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const crypto = require('crypto');

const NODE_ENV = process.env.NODE_ENV || 'development';
const PORT = Number(process.env.PORT || 3000);
const DATABASE_URL = process.env.DATABASE_URL || '';
const APP_BASE_URL = process.env.APP_BASE_URL || 'https://verify.qrv.network';
const REGISTRY_BASE_URL = process.env.REGISTRY_BASE_URL || 'https://registry.qrv.network';
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';
const RATE_LIMIT_WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS || 60_000);
const RATE_LIMIT_MAX = Number(process.env.RATE_LIMIT_MAX || 100);
const VERSION = process.env.APP_VERSION || process.env.npm_package_version || '1.1.0';
const QRVID_FORMAT = /^QRV-[A-Z0-9][A-Z0-9-]{2,127}$/;

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(cors());
app.use(express.json({ limit: '1mb' }));

const pool = DATABASE_URL
  ? new Pool({
      connectionString: DATABASE_URL,
      ssl: process.env.PGSSLMODE === 'disable' ? false : { rejectUnauthorized: false },
      connectionTimeoutMillis: Number(process.env.PG_CONNECTION_TIMEOUT_MS || 3000),
      idleTimeoutMillis: Number(process.env.PG_IDLE_TIMEOUT_MS || 10000)
    })
  : null;

if (pool) {
  pool.on('error', (error) => {
    console.error('PostgreSQL pool error:', error.message);
  });
}

const metrics = { requestsTotal: 0, routes: {} };
const rateLimitStore = new Map();

function getConfigIssues() {
  const issues = [];
  if (!REGISTRY_BASE_URL) issues.push('REGISTRY_BASE_URL is not configured');
  return issues;
}

function incrementRouteMetric(routeKey) {
  metrics.routes[routeKey] = (metrics.routes[routeKey] || 0) + 1;
}

app.use((req, _res, next) => {
  metrics.requestsTotal += 1;
  incrementRouteMetric(`${req.method} ${req.path}`);
  next();
});

function getClientId(req) {
  return req.headers['x-forwarded-for']?.toString().split(',')[0].trim() || req.ip || 'unknown';
}

function rateLimit(req, res, next) {
  const clientId = getClientId(req);
  const now = Date.now();
  const existing = rateLimitStore.get(clientId) || { count: 0, windowStart: now };
  if (now - existing.windowStart > RATE_LIMIT_WINDOW_MS) {
    existing.count = 0;
    existing.windowStart = now;
  }
  existing.count += 1;
  rateLimitStore.set(clientId, existing);
  if (existing.count > RATE_LIMIT_MAX) {
    return res.status(429).json({ error: 'Rate limit exceeded' });
  }
  return next();
}

app.use(rateLimit);

function normalizeQrvid(rawValue) {
  try {
    return decodeURIComponent(String(rawValue || '').trim()).toUpperCase().replace(/\s+/g, '');
  } catch (_error) {
    return '';
  }
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function stateMessage(state) {
  return {
    VERIFIED: 'This QR-V record is active and registry verified.',
    REVOKED: 'This QR-V record has been revoked by the issuer and should not be accepted as valid.',
    EXPIRED: 'This QR-V record has expired and should not be accepted as currently valid.',
    NOT_FOUND: 'No registry record was found for this QRVID.',
    INVALID_FORMAT: 'QRVID format is invalid.',
    UNAVAILABLE: 'The registry is temporarily unavailable. Try again later.'
  }[state] || 'Verification state unavailable.';
}

function renderLayout({ title, body }) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <style>
    :root { color-scheme: dark; --bg:#050a17; --panel:#111a33; --line:#2e427a; --muted:#c7d2f3; --gold:#f2d06b; --blue:#58b7ff; --green:#22c55e; --red:#ef4444; --orange:#f59e0b; }
    * { box-sizing: border-box; }
    body { font-family: Inter, Arial, sans-serif; margin: 0; background: radial-gradient(circle at top, #14346f 0%, #071126 55%, var(--bg) 100%); color: #e6e9f5; min-height: 100vh; }
    .wrap { max-width: 1040px; margin: 0 auto; padding: 42px 20px; }
    .card { background: rgba(18, 26, 51, 0.92); border: 1px solid var(--line); border-radius: 24px; padding: 30px; box-shadow: 0 18px 60px rgba(0,0,0,.25); }
    .eyebrow { color: var(--gold); text-transform: uppercase; letter-spacing: .14em; font-weight: 900; font-size: 13px; }
    h1 { margin: 10px 0 0; color: #fff; font-size: clamp(36px, 7vw, 68px); line-height: 1.02; letter-spacing: -.04em; }
    h2 { margin: 0 0 12px; }
    p, li { line-height: 1.6; font-size: 18px; }
    .muted { color: var(--muted); }
    .row { display: flex; gap: 12px; flex-wrap: wrap; margin-top: 24px; }
    input[type=text] { flex: 1 1 300px; padding: 15px; border-radius: 14px; border: 1px solid #40508b; background: #0f1730; color: #fff; font-size: 16px; }
    button, .btn { padding: 14px 18px; border: 0; border-radius: 999px; background: var(--gold); color: #091124; text-decoration: none; cursor: pointer; font-weight: 900; display: inline-block; }
    .links { margin-top: 22px; }
    .links a { color: #9ec1ff; margin-right: 16px; }
    .status { font-weight: 900; padding: 8px 12px; border-radius: 999px; display: inline-block; letter-spacing:.06em; }
    .VERIFIED { background: rgba(34,197,94,.16); color: #d8ffe8; border:1px solid rgba(34,197,94,.28); }
    .REVOKED { background: rgba(239,68,68,.16); color: #ffe3e3; border:1px solid rgba(239,68,68,.28); }
    .EXPIRED { background: rgba(245,158,11,.16); color: #fff0d0; border:1px solid rgba(245,158,11,.28); }
    .NOT_FOUND, .INVALID_FORMAT, .UNAVAILABLE { background: rgba(127,47,47,.22); color: #ffe3e3; border:1px solid rgba(239,68,68,.22); }
    code { background: #0c1227; padding: 3px 7px; border-radius: 7px; }
    .grid { display:grid; grid-template-columns: 1fr 1fr; gap:16px; margin-top:18px; }
    .kv { background: rgba(255,255,255,.035); border:1px solid rgba(255,255,255,.08); padding:16px; border-radius:18px; }
    .k { color:#93a9ca; text-transform:uppercase; letter-spacing:.08em; font-weight:900; font-size:12px; }
    .v { margin-top:6px; word-break:break-word; }
    @media(max-width:760px){.grid{grid-template-columns:1fr}.card{padding:22px}}
  </style>
</head>
<body><div class="wrap">${body}</div></body>
</html>`;
}

function renderPortalHome() {
  return renderLayout({
    title: 'QR-V™ Public Verification',
    body: `<section class="card">
      <div class="eyebrow">QR-V™ Public Verification</div>
      <h1>Verify registry-backed QR-V™ records.</h1>
      <p class="muted">Authenticate certificates, credentials, products, and registry-backed records by QRVID. Results resolve through the QR-V registry authority node.</p>
      <form class="row" action="/verify" method="get" onsubmit="event.preventDefault();const v=document.getElementById('qrvid').value.trim();if(v){window.location='/' + encodeURIComponent(v);}">
        <input id="qrvid" name="qrvid" type="text" required placeholder="Enter QRVID, e.g. QRV-DEMO-001" />
        <button type="submit">Verify QRVID</button>
      </form>
      <p><a class="btn" href="/QRV-DEMO-001">Try verified demo</a> <a class="btn" href="/QRV-DEMO-REVOKED">Try revoked demo</a> <a class="btn" href="/QRV-DEMO-EXPIRED">Try expired demo</a></p>
      <div class="links"><a href="/healthz">Health</a><a href="/readyz">Readiness</a><a href="/version">Version</a></div>
    </section>`
  });
}

async function registryVerify(qrvid) {
  const response = await fetch(`${REGISTRY_BASE_URL}/verify/${encodeURIComponent(qrvid)}`, {
    headers: { accept: 'application/json' }
  });
  const body = await response.json().catch(() => ({}));
  return { response, body };
}

async function readRecordById(qrvid) {
  const { response, body } = await registryVerify(qrvid);
  if (!response.ok && !['REVOKED', 'EXPIRED', 'NOT_FOUND', 'INVALID_FORMAT'].includes(body.state || body.status)) {
    throw new Error(`Registry returned HTTP ${response.status}`);
  }
  return body;
}

async function getVerificationState(qrvid) {
  if (!QRVID_FORMAT.test(qrvid)) return { state: 'INVALID_FORMAT', message: stateMessage('INVALID_FORMAT') };
  try {
    const record = await readRecordById(qrvid);
    const state = String(record.state || record.status || 'UNAVAILABLE').toUpperCase();
    return { state, message: record.message || stateMessage(state), record };
  } catch (error) {
    console.error('Registry verification lookup failed:', error.message);
    return { state: 'UNAVAILABLE', message: stateMessage('UNAVAILABLE') };
  }
}

async function resolveVerification(qrvidRaw) {
  const qrvid = normalizeQrvid(qrvidRaw);
  const payload = await getVerificationState(qrvid);
  const statusCodeByState = { VERIFIED: 200, REVOKED: 200, EXPIRED: 200, INVALID_FORMAT: 400, NOT_FOUND: 404, UNAVAILABLE: 200 };
  return {
    qrvid,
    payload,
    statusCode: statusCodeByState[payload.state] || 500,
    body: { ok: payload.state === 'VERIFIED', qrvid, state: payload.state, status: payload.state, message: payload.message, verifiedAt: new Date().toISOString(), canonicalUrl: `${APP_BASE_URL}/${encodeURIComponent(qrvid)}`, registryBaseUrl: REGISTRY_BASE_URL }
  };
}

function renderVerificationPage(qrvid, payload) {
  const { state, message, record } = payload;
  const safeState = escapeHtml(state);
  const fields = record ? [
    ['QRVID', record.qrvid || qrvid],
    ['Record Type', record.recordType || record.type || 'N/A'],
    ['Title', record.title || 'N/A'],
    ['Subject', record.subject || 'N/A'],
    ['Issuer', record.issuer || 'N/A'],
    ['Issued', record.issuedAt || 'N/A'],
    ['Expires', record.expiresAt || 'N/A'],
    ['Hash', record.hash || 'N/A'],
    ['Checked', record.checkedAt || new Date().toISOString()]
  ] : [['QRVID', qrvid], ['Checked', new Date().toISOString()]];
  return renderLayout({
    title: `QR-V Verify • ${state} • ${qrvid}`,
    body: `<section class="card"><div class="eyebrow">Verification Result</div><h1>${safeState === 'VERIFIED' ? 'Verified QR-V™ Record' : 'QR-V™ Verification Result'}</h1><p><span class="status ${safeState}">${safeState}</span></p><p>${escapeHtml(message)}</p><div class="grid">${fields.map(([key, value]) => `<div class="kv"><div class="k">${escapeHtml(key)}</div><div class="v">${escapeHtml(value)}</div></div>`).join('')}</div><p class="links"><a href="/">Back to portal</a><a href="${APP_BASE_URL}/${encodeURIComponent(qrvid)}">Canonical verify URL</a><a href="${REGISTRY_BASE_URL}/verify/${encodeURIComponent(qrvid)}" target="_blank" rel="noopener">Registry JSON</a></p></section>`
  });
}

app.get('/healthz', (_req, res) => res.json({ status: 'ok', service: 'qrv-verify', uptime: process.uptime(), environment: NODE_ENV }));
app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'qrv-verify', uptime: process.uptime(), environment: NODE_ENV }));
app.get('/version', (_req, res) => res.json({ version: VERSION, service: 'qrv-verify', environment: NODE_ENV, registryBaseUrl: REGISTRY_BASE_URL }));
app.get('/readyz', async (_req, res) => {
  try {
    const response = await fetch(`${REGISTRY_BASE_URL}/ready`, { headers: { accept: 'application/json' } });
    const registry = await response.json().catch(() => ({}));
    return res.status(response.ok ? 200 : 503).json({ ready: response.ok, registry, issues: getConfigIssues() });
  } catch (error) {
    console.error('Readiness check failed:', error.message);
    return res.status(200).json({ ready: false, registry: 'unavailable', issues: [error.message] });
  }
});

app.get('/metrics', (req, res) => {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '').trim() || '';
  const expected = ADMIN_TOKEN;
  const valid = expected && token.length === expected.length && crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected));
  if (!valid) return res.status(401).json({ error: 'Unauthorized' });
  res.type('text/plain').send([`requests_total ${metrics.requestsTotal}`, ...Object.entries(metrics.routes).map(([key, count]) => `route_hits{route="${key}"} ${count}`)].join('\n'));
});

app.get('/api/v1/verify/:qrvid', async (req, res) => {
  const { body, statusCode } = await resolveVerification(req.params.qrvid);
  return res.status(statusCode).json(body);
});

app.get('/verify/:id', async (req, res) => {
  const { qrvid, payload, statusCode } = await resolveVerification(req.params.id);
  return res.status(statusCode).type('html').send(renderVerificationPage(qrvid, payload));
});

app.get('/', (_req, res) => res.type('html').send(renderPortalHome()));

app.get('/:qrvid', async (req, res, next) => {
  const staticRoutes = new Set(['healthz', 'readyz', 'health', 'version', 'metrics', 'api', 'verify']);
  if (staticRoutes.has(req.params.qrvid)) return next();
  if (!String(req.params.qrvid).toUpperCase().startsWith('QRV-')) return next();
  const { qrvid, payload, statusCode } = await resolveVerification(req.params.qrvid);
  return res.status(statusCode).type('html').send(renderVerificationPage(qrvid, payload));
});

app.use((req, res) => {
  res.status(404).type('html').send(renderLayout({ title: 'QR-V™ Verification Portal • Not Found', body: `<section class="card"><h1>QR-V™ Verification Portal</h1><p><span class="status NOT_FOUND">NOT_FOUND</span></p><p>The route <code>${escapeHtml(req.path)}</code> does not exist.</p><p><a class="btn" href="/">Go to portal home</a></p></section>` }));
});

app.use((error, _req, res, _next) => {
  console.error('Unhandled request error:', error);
  res.status(200).json({ ok: false, state: 'UNAVAILABLE', message: stateMessage('UNAVAILABLE') });
});

async function start() {
  const issues = getConfigIssues();
  if (issues.length) {
    console.warn(`QR-V Verify starting in degraded mode: ${issues.join('; ')}`);
  }
  const server = app.listen(PORT, '0.0.0.0', () => console.log(`QR-V Verify running on 0.0.0.0:${PORT}`));
  server.on('error', (error) => {
    console.error('HTTP server error:', error);
    process.exit(1);
  });
}

process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason);
});

if (require.main === module) {
  start().catch((error) => {
    console.error('Startup failed:', error);
    process.exit(1);
  });
}

module.exports = { app, start, normalizeQrvid, resolveVerification };
