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
Install command: npm ci
Start command: npm start
```

## Required runtime settings

Set production runtime values in Hostinger environment variables:

```text
NODE_ENV=production
PORT=3000
APP_BASE_URL=https://verify.qrv.network
DATABASE_URL=<postgres connection string>
PGSSLMODE=require
ADMIN_TOKEN=<long random admin token>
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX=100
APP_VERSION=1.0.0
```

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

## Notes

This repository is the dedicated public verification surface. Issuer dashboard/control-plane behavior belongs in `issuer-qrv`.
