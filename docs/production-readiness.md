# QR-V Verify Production Readiness Checklist

This checklist defines the minimum production gate for `verify.qrv.network`.

## Required environment

- `NODE_ENV=production`
- `PORT` set by Hostinger or the runtime platform
- `DATABASE_URL` connected to the canonical PostgreSQL registry
- `APP_BASE_URL=https://verify.qrv.network`
- `PGSSLMODE=require` unless the runtime uses trusted private networking
- `RATE_LIMIT_WINDOW_MS=60000`
- `RATE_LIMIT_MAX` tuned for expected public traffic
- `ADMIN_TOKEN` set for `/metrics`

## Required endpoints

- `GET /` returns the public verification portal
- `GET /health` returns service liveness
- `GET /healthz` returns service liveness
- `GET /readyz` returns database readiness
- `GET /version` returns service/version metadata
- `GET /api/v1/verify/:qrvid` returns JSON verification state
- `GET /:qrvid` returns public HTML verification result for QRV-prefixed identifiers
- `GET /verify/:qrvid` returns canonical HTML verification result

## Production smoke command

Run after deployment:

```bash
VERIFY_BASE_URL=https://verify.qrv.network \
QRV_DEMO_QRVID=QRV-PROD-CERT-000001 \
npm run smoke:prod
```

A production deployment is not ready unless this command passes.

## Canonical success criteria

- `/readyz` returns HTTP 200.
- The demo QRVID returns HTTP 200.
- JSON verification returns `VERIFIED`.
- HTML verification page renders without a plain `Not found` body.
- The service binds to `0.0.0.0` and respects `process.env.PORT`.

## Failure interpretation

- `503` from `/readyz`: database or production config is not ready.
- `404` from demo QRVID: seed record or migration is missing.
- `503` from public verify route: registry lookup failed or DB connection is unavailable.
- Plain text `Not found`: wrong service/repo is deployed to the domain.
