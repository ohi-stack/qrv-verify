const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const crypto = require('crypto');

const NODE_ENV = process.env.NODE_ENV || 'development';
const PORT = Number(process.env.PORT || 3000);
const DATABASE_URL = process.env.DATABASE_URL || '';
const APP_BASE_URL = process.env.APP_BASE_URL || 'https://verify.qrv.network';
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';
const RATE_LIMIT_WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS || 60_000);
const RATE_LIMIT_MAX = Number(process.env.RATE_LIMIT_MAX || 100);
const VERSION = process.env.APP_VERSION || process.env.npm_package_version || '1.0.0';
const QRVID_FORMAT = /^[A-Z0-9][A-Z0-9-]{5,127}$/;

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
  if (!DATABASE_URL) issues.push('DATABASE_URL is not configured');
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

function renderLayout({ title, body }) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <style>
    :root { color-scheme: dark; }
    body { font-family: Inter, Arial, sans-serif; margin: 0; background: radial-gradient(circle at top, #14346f 0%, #071126 55%, #050a17 100%); color: #e6e9f5; min-height: 100vh; }
    .wrap { max-width: 920px; margin: 0 auto; padding: 48px 20px; }
    .card { background: rgba(18, 26, 51, 0.92); border: 1px solid #2e427a; border-radius: 18px; padding: 28px; box-shadow: 0 18px 60px rgba(0,0,0,.25); }
    .eyebrow { color: #f2d06b; text-transform: uppercase; letter-spacing: .14em; font-weight: 800; font-size: 13px; }
    h1 { margin-top: 0; color: #fff; font-size: clamp(34px, 7vw, 64px); line-height: 1.03; }
    p, li { line-height: 1.55; font-size: 18px; }
    .muted { color: #c7d2f3; }
    .row { display: flex; gap: 12px; flex-wrap: wrap; margin-top: 24px; }
    input[type=text] { flex: 1 1 300px; padding: 14px; border-radius: 10px; border: 1px solid #40508b; background: #0f1730; color: #fff; font-size: 16px; }
    button, .btn { padding: 14px 18px; border: 0; border-radius: 999px; background: #f2d06b; color: #091124; text-decoration: none; cursor: pointer; font-weight: 800; display: inline-block; }
    .links { margin-top: 22px; }
    .links a { color: #9ec1ff; margin-right: 16px; }
    .status { font-weight: 800; padding: 6px 10px; border-radius: 999px; display: inline-block; }
    .VERIFIED { background: #1e7f4f; color: #d8ffe8; }
    .REVOKED, .EXPIRED, .NOT_FOUND, .INVALID_FORMAT, .UNAVAILABLE { background: #7f2f2f; color: #ffe3e3; }
    code { background: #0c1227; padding: 3px 6px; border-radius: 5px; }
  </style>
</head>
<body><div class="wrap">${body}</div></body>
</html>`;
}

function renderPortalHome() {
  return renderLayout({
    title: 'QR-V™ Public Verification',
    body: `<section class="card">
      <div class="eyebrow">QRV Public Verification</div>
      <h1>Trust every credential before you rely on it.</h1>
      <p class="muted">Authenticate certificates, credentials, products, and registry-backed records by QRVID.</p>
      <form class="row" action="/verify" method="get" onsubmit="event.preventDefault();const v=document.getElementById('qrvid').value.trim();if(v){window.location='/' + encodeURIComponent(v);}">
        <input id="qrvid" name="qrvid" type="text" required placeholder="Enter QRVID, e.g. QRV-PROD-CERT-000001" />
        <button type="submit">Verify QRVID</button>
      </form>
      <p><a class="btn" href="/QRV-PROD-CERT-000001">Try demo route</a></p>
      <div class="links"><a href="/healthz">Health</a><a href="/readyz">Readiness</a><a href="/version">Version</a></div>
    </section>`
  });
}

async function readRecordById(qrvid) {
  if (!pool) return null;
  const result = await pool.query('SELECT * FROM registry_records WHERE qrvid = $1', [qrvid]);
  return result.rows[0] || null;
}

async function getVerificationState(qrvid) {
  if (!QRVID_FORMAT.test(qrvid)) return { state: 'INVALID_FORMAT', message: 'QRVID format is invalid' };
  try {
    const record = await readRecordById(qrvid);
    if (!record) return { state: 'NOT_FOUND', message: 'No registry record was found for this QRVID.' };
    const status = String(record.status || '').toLowerCase();
    if (status === 'revoked') return { state: 'REVOKED', message: 'This record has been revoked by the issuer.', record };
    if (status === 'expired') return { state: 'EXPIRED', message: 'This record has expired and is no longer valid.', record };
    return { state: 'VERIFIED', message: 'This record is valid and currently active.', record };
  } catch (error) {
    console.error('Verification lookup failed:', error.message);
    return { state: 'UNAVAILABLE', message: 'Verification service is temporarily unavailable.' };
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
    body: { ok: payload.state === 'VERIFIED', qrvid, state: payload.state, message: payload.message, verifiedAt: new Date().toISOString(), canonicalUrl: `${APP_BASE_URL}/${encodeURIComponent(qrvid)}` }
  };
}

function renderVerificationPage(qrvid, payload) {
  const { state, message, record } = payload;
  const metadata = record ? `<ul><li><strong>Title:</strong> ${escapeHtml(record.title || 'N/A')}</li><li><strong>Subject:</strong> ${escapeHtml(record.subject || 'N/A')}</li><li><strong>Issuer:</strong> ${escapeHtml(record.issuer || 'N/A')}</li></ul>` : '<p class="muted">No additional record metadata available.</p>';
  return renderLayout({
    title: `QR-V Verify • ${state} • ${qrvid}`,
    body: `<section class="card"><div class="eyebrow">Verification Result</div><h1>QR-V™ Verification Result</h1><p><span class="status ${state}">${state}</span></p><p>${escapeHtml(message)}</p><p><strong>QRVID:</strong> <code>${escapeHtml(qrvid)}</code></p>${metadata}<p class="links"><a href="/">Back to portal</a><a href="/verify/${encodeURIComponent(qrvid)}">Canonical verify URL</a></p></section>`
  });
}

app.get('/healthz', (_req, res) => res.json({ status: 'ok', service: 'qrv-verify', uptime: process.uptime(), environment: NODE_ENV }));
app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'qrv-verify', uptime: process.uptime(), environment: NODE_ENV }));
app.get('/version', (_req, res) => res.json({ version: VERSION, service: 'qrv-verify', environment: NODE_ENV }));
app.get('/readyz', async (_req, res) => {
  try {
    if (pool) await pool.query('SELECT 1');
    return res.json({ ready: true, database: pool ? 'ok' : 'not_configured', issues: getConfigIssues() });
  } catch (error) {
    console.error('Readiness check failed:', error.message);
    return res.status(200).json({ ready: false, database: 'unavailable', issues: [error.message] });
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
  res.status(200).json({ ok: false, state: 'UNAVAILABLE', message: 'Verification service is temporarily unavailable.' });
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
