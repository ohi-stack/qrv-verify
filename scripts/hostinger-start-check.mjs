import fs from 'node:fs';
import { spawn } from 'node:child_process';

const entry = 'server.js';
if (!fs.existsSync(entry)) {
  console.error(`Missing expected Hostinger entry file: ${entry}`);
  process.exit(1);
}

const child = spawn(process.execPath, [entry], {
  env: {
    ...process.env,
    NODE_ENV: 'staging',
    PORT: '3999',
    DATABASE_URL: ''
  },
  stdio: ['ignore', 'pipe', 'pipe']
});

let output = '';
child.stdout.on('data', (chunk) => {
  output += chunk.toString();
});
child.stderr.on('data', (chunk) => {
  output += chunk.toString();
});

const timeout = setTimeout(() => {
  child.kill('SIGTERM');
}, 1500);

child.on('exit', (code, signal) => {
  clearTimeout(timeout);
  if (code && code !== 0) {
    console.error(output);
    console.error(`Hostinger start check failed with exit code ${code}`);
    process.exit(code);
  }
  if (!output.includes('QR-V Verify running')) {
    console.error(output);
    console.error('Hostinger start check did not detect successful server startup.');
    process.exit(1);
  }
  console.log('Hostinger start check passed.');
});
