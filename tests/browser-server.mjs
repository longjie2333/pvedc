import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

process.env.PDC_DATA_DIR = mkdtempSync(resolve(tmpdir(), 'pvedc-browser-test-'));
process.env.PDC_TOTP_SECRET = process.argv[2] === 'setup' ? '' : 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';
process.env.PDC_BOOTSTRAP_FILE = '';
process.env.PDC_INITIAL_SETTINGS = '';
process.env.HOST = '127.0.0.1';
process.env.PORT = process.argv[3] || '3110';
await import('../.output/server/index.mjs');
