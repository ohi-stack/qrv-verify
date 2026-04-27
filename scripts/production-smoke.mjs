const baseUrl = process.env.VERIFY_BASE_URL || process.env.APP_BASE_URL || 'https://verify.qrv.network';
const demoQrvid = process.env.QRV_DEMO_QRVID || 'QRV-PROD-CERT-000001';
const timeoutMs = Number(process.env.SMOKE_TIMEOUT_MS || 8000);

const requiredChecks = [
  ['root-html', '/', 200, 'text/html'],
  ['health', '/health', 200, 'application/json'],
  ['version', '/version', 200, 'application/json'],
  ['ready', '/readyz', 200, 'application/json'],
  ['demo-json', `/api/v1/verify/${encodeURIComponent(demoQrvid)}`, 200, 'application/json'],
  ['demo-html', `/${encodeURIComponent(demoQrvid)}`, 200, 'text/html']
];

function timeoutSignal() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return { signal: controller.signal, cancel: () => clearTimeout(timer) };
}

async function request(path) {
  const url = new URL(path, baseUrl).toString();
  const { signal, cancel } = timeoutSignal();
  try {
    const response = await fetch(url, {
      signal,
      headers: { 'user-agent': 'qrv-verify-production-smoke/1.0' }
    });
    const contentType = response.headers.get('content-type') || '';
    const body = await response.text();
    return { url, status: response.status, contentType, body };
  } finally {
    cancel();
  }
}

let failures = 0;

for (const [name, path, expectedStatus, expectedType] of requiredChecks) {
  try {
    const result = await request(path);
    const statusOk = result.status === expectedStatus;
    const typeOk = result.contentType.includes(expectedType);
    const bodyOk = name === 'demo-json'
      ? /"state"\s*:\s*"VERIFIED"|"status"\s*:\s*"VERIFIED"/.test(result.body)
      : true;
    const ok = statusOk && typeOk && bodyOk;
    console.log(`${ok ? 'PASS' : 'FAIL'} ${name} status=${result.status} type=${result.contentType} url=${result.url}`);
    if (!ok) {
      if (!statusOk) console.error(`  expected status ${expectedStatus}`);
      if (!typeOk) console.error(`  expected content-type containing ${expectedType}`);
      if (!bodyOk) console.error('  expected demo JSON verification state/status to be VERIFIED');
      failures += 1;
    }
  } catch (error) {
    failures += 1;
    console.error(`FAIL ${name} ${path} ${error.message}`);
  }
}

if (failures > 0) {
  console.error(`Production smoke failed with ${failures} failure(s).`);
  process.exit(1);
}

console.log('Production smoke passed.');
