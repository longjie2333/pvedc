import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

const config = vi.hoisted(() => ({ gostApi: '', gostUser: 'test-user', gostPassword: 'test-password' }));
vi.mock('../server/lib/settings', () => ({ getSettings: () => config }));
import { gost } from '../server/lib/gost';
let server: Server;
beforeAll(async () => {
  server = createServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    if (req.headers.authorization !== 'Basic ' + Buffer.from('test-user:test-password').toString('base64')) { res.writeHead(401); res.end('{}'); return; }
    if (req.url === '/config') res.end(JSON.stringify({ services: [], api: { addr: '127.0.0.1:18080' } }));
    else if (req.url === '/config/services') res.end(JSON.stringify({ data: { count: 1, list: [{ name: 'test-service' }] } }));
    else { res.writeHead(500); res.end(JSON.stringify({ msg: 'private upstream error body', code: 500 })); }
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  config.gostApi = 'http://127.0.0.1:' + (server.address() as AddressInfo).port;
});
afterAll(() => new Promise<void>(resolve => server.close(() => resolve())));
it('reads the raw global config response defined by GOST v3', async () => {
  expect(await gost('/config')).toEqual({ services: [], api: { addr: '127.0.0.1:18080' } });
});
it('unwraps the service list response', async () => {
  expect(await gost('/config/services')).toEqual({ count: 1, list: [{ name: 'test-service' }] });
});
it('does not disclose upstream errors or credentials', async () => {
  await expect(gost('/failure')).rejects.toThrow('HTTP 500');
  await expect(gost('/failure')).rejects.not.toThrow('private upstream');
});
