const baseUrl = process.env.VERIFY_BASE_URL || 'http://127.0.0.1:3000';

const checks = [
  ['root', '/', 200],
  ['healthz', '/healthz', 200],
  ['readyz', '/readyz', [200, 503]],
  ['version', '/version', 200],
  ['demo-html', '/QRV-PROD-CERT-000001', [200, 404, 503]],
  ['canonical-html', '/verify/QRV-PROD-CERT-000001', [200, 404, 503]],
  ['json-verify', '/api/v1/verify/QRV-PROD-CERT-000001', [200, 404, 503]],
  ['invalid-json', '/api/v1/verify/%20bad%20id%20', 400]
];

function expectedMatches(actual, expected) {
  return Array.isArray(expected) ? expected.includes(actual) : actual === expected;
}

let failures = 0;

for (const [name, path, expected] of checks) {
  const url = new URL(path, baseUrl).toString();
  try {
    const response = await fetch(url, { headers: { 'user-agent': 'qrv-verify-smoke/1.0' } });
    const ok = expectedMatches(response.status, expected);
    console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${response.status} ${url}`);
    if (!ok) failures += 1;
  } catch (error) {
    failures += 1;
    console.error(`FAIL ${name} ${url} ${error.message}`);
  }
}

if (failures > 0) {
  process.exit(1);
}
