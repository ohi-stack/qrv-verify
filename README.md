# QR-V Verify

Standalone public verification service for the QR-V™ Global Verification Network.

## Purpose

This service powers `verify.qrv.network` and provides:

- branded public verification portal
- QRVID lookup pages
- canonical HTML verification routes
- JSON verification API
- health, readiness, version, and protected metrics endpoints

## Public routes

```text
GET /
GET /healthz
GET /readyz
GET /version
GET /verify/:id
GET /:qrvid
GET /api/v1/verify/:qrvid
```

## Hostinger deployment

Recommended settings:

```text
Framework: Express
Node: 22.x
Root directory: ./
Package manager: npm
Entry file: server.js
Install command: npm install
Start command: npm start
```

Use `npm install` unless a committed `package-lock.json` exists. `npm ci` requires a lockfile.

## Required runtime settings

Set production runtime values in Hostinger environment variables:

```text
NODE_ENV=production
PORT=3000
APP_BASE_URL=https://verify.qrv.network
DATABASE_URL=<postgres connection string, URL-safe if used>
PGSSLMODE=disable
ADMIN_TOKEN=<long random admin token>
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX=100
APP_VERSION=1.0.0
```

If using separate database fields instead of a connection string, make sure the server supports the component-based connection fields before deployment.

## Smoke checks

After deploy:

```text
https://verify.qrv.network/
https://verify.qrv.network/healthz
https://verify.qrv.network/readyz
https://verify.qrv.network/version
https://verify.qrv.network/QRV-PROD-CERT-000001
https://verify.qrv.network/verify/QRV-PROD-CERT-000001
https://verify.qrv.network/api/v1/verify/QRV-PROD-CERT-000001
```

## Immediate production hardening queue

1. Support component-based PostgreSQL configuration so special characters in database credentials do not break URL parsing.
2. Query `registry_records` with text-safe QRVID comparison so QRV-style IDs do not fail against UUID-backed schemas.
3. Add the modern QR-V navy/cyan UI from the main QR-V brand to `/`, verification result pages, and branded 404.
4. Add `package-lock.json` or keep Hostinger install command as `npm install`.
5. Add optional privacy-safe verification event logging.

## Notes

This repository is the dedicated public verification surface. Issuer dashboard/control-plane behavior belongs in `issuer-qrv`.
