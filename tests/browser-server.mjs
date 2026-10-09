import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { createServer } from 'node:http';

// A read-only PVE fixture lets browser forms exercise real server validation.
const templateNames = ['ubuntu-24.04-standard_24.04-2_amd64.tar.zst', 'debian-13-standard_13.1-1_amd64.tar.zst'];
const pve = createServer((request, response) => {
  const path = new URL(request.url, 'http://localhost').pathname;
  let data;
  if (path.endsWith('/network')) data = [{ iface: 'vmbr0', type: 'bridge', active: 1 }, { iface: 'nic0', type: 'eth', active: 1 }];
  else if (path.endsWith('/storage')) data = [{ storage: 'local', type: 'dir', active: 1, enabled: 1, content: 'vztmpl,iso', avail: 1e10, total: 2e10 }, { storage: 'local-lvm', type: 'lvmthin', active: 1, enabled: 1, content: 'rootdir,images', avail: 1e11, total: 2e11 }];
  else if (path.endsWith('/content')) data = templateNames.map(template => ({ volid: 'local:vztmpl/' + template, size: 1e8 }));
  else if (path.endsWith('/aplinfo')) data = templateNames.map(template => ({ template }));
  else if (path.endsWith('/status')) data = { cpu: 0, cpuinfo: { cpus: 24 }, memory: { total: 128e9, used: 8e9, free: 120e9 }, uptime: 1000 };
  else if (path.endsWith('/resources')) data = [{ type: 'storage', storage: 'local-lvm', node: 'r550', maxdisk: 2e11, disk: 1e10, status: 'available' }];
  else if (path.endsWith('/vnets')) data = [];
  else { response.writeHead(404); response.end('{}'); return; }
  response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify({ data }));
});
await new Promise(resolve => pve.listen(0, '127.0.0.1', resolve));

process.env.PDC_DATA_DIR = mkdtempSync(resolve(tmpdir(), 'pvedc-browser-test-'));
process.env.PDC_TOTP_SECRET = process.argv[2] === 'setup' ? '' : 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';
process.env.PDC_BOOTSTRAP_FILE = '';
process.env.PDC_INITIAL_SETTINGS = JSON.stringify({ pveUrl: 'http://127.0.0.1:' + pve.address().port, pveTokenId: 'browser-fixture', pveTokenSecret: 'browser-fixture' });
process.env.HOST = '127.0.0.1';
process.env.PORT = process.argv[3] || '3110';
await import('../.output/server/index.mjs');
