import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
const mocks = vi.hoisted(() => ({ helper: vi.fn() }));
vi.mock('../server/lib/helper', () => ({ helper: mocks.helper }));
import { closeDb, getDb } from '../server/lib/db';
import { queueGostApi } from '../server/lib/gost-api';
import { runJob } from '../server/lib/worker';
import { getSettings, saveSettings } from '../server/lib/settings';
import { configureGost, syncForwards } from '../server/lib/gost';
import { unseal } from '../server/lib/crypto';
import { gostEndpoint } from '../shared/gost';
import type { FullJobRow } from '../server/lib/records';

const directory = mkdtempSync(resolve(tmpdir(), 'pvedc-gost-api-test-'));
const file = resolve(directory, 'gost/gost.json');
let server: Server | undefined, oldPort: number, targetPort: number;
let rejectNewRestart = false, rejectRollback = false, wrongNewCredentials = false;
let original: { api: { addr: string; auth: { username: string; password: string }; pathPrefix?: string }; services: { name: string }[]; chains: { name: string }[] };

async function stopServer() {
  const current = server; server = undefined;
  if (current) await new Promise<void>(resolve => { current.close(() => resolve()); current.closeAllConnections(); });
}
async function startServer(config: typeof original) {
  await stopServer();
  const target = gostEndpoint('http://' + config.api.addr);
  server = createServer((request, response) => {
    const password = wrongNewCredentials && config.api.auth.username === 'new-user' ? 'wrong-password' : config.api.auth.password;
    if (request.headers.authorization !== 'Basic ' + Buffer.from(config.api.auth.username + ':' + password).toString('base64')) {
      response.writeHead(401); response.end('{}'); return;
    }
    response.setHeader('content-type', 'application/json');
    if (request.url !== (config.api.pathPrefix || '') + '/config') { response.writeHead(404); response.end('{}'); return; }
    response.end(JSON.stringify(config));
  });
  await new Promise<void>((accept, reject) => { server!.once('error', reject); server!.listen(target.port, target.hostname, accept); });
}
async function freePort() {
  const socket = createServer();
  await new Promise<void>(accept => socket.listen(0, '127.0.0.1', accept));
  const port = (socket.address() as AddressInfo).port;
  await new Promise<void>(accept => socket.close(() => accept()));
  return port;
}
function row(id: string) { return getDb().prepare('SELECT * FROM jobs WHERE id=?').get(id) as FullJobRow; }
async function advance(id: string) { await runJob(row(id)); return row(id); }
function request(password = 'new-password') {
  return { gostApi: 'http://127.0.0.1:' + targetPort + '/manage', gostUser: 'new-user', gostPassword: password };
}
beforeAll(() => { process.env.PDC_DATA_DIR = directory; mkdirSync(resolve(directory, 'gost')); });
beforeEach(async () => {
  getDb().prepare('DELETE FROM jobs').run(); getDb().prepare('DELETE FROM audit').run();
  rejectNewRestart = false; rejectRollback = false; wrongNewCredentials = false;
  oldPort = await freePort();
  original = { api: { addr: '127.0.0.1:' + oldPort, auth: { username: 'old-user', password: 'old-password' } }, services: [{ name: 'preserved-web' }], chains: [{ name: 'preserved-relay' }] };
  writeFileSync(file, JSON.stringify(original));
  await startServer(original);
  targetPort = await freePort();
  saveSettings({ ...getSettings(), gostApi: 'http://127.0.0.1:' + oldPort, gostUser: 'old-user', gostPassword: 'old-password' });
  mocks.helper.mockReset().mockImplementation(async input => {
    expect(input).toEqual({ operation: 'gost-restart' });
    const config = JSON.parse(readFileSync(file, 'utf8')) as typeof original;
    if (config.api.auth.username === 'new-user' ? rejectNewRestart : rejectRollback) throw new Error('sensitive error old-password');
    await startServer(config);
    return { ok: true };
  });
});
afterEach(stopServer);
afterAll(() => {
  closeDb(); delete process.env.PDC_DATA_DIR;
  if (!directory.startsWith(resolve(tmpdir(), 'pvedc-gost-api-test-'))) throw new Error('Unsafe cleanup');
  rmSync(directory, { recursive: true, force: true });
});

it('persists a secret snapshot, preserves services and commits only after authenticated verification', async () => {
  const { taskId } = queueGostApi(request());
  expect(row(taskId).payload).not.toContain('new-password');
  expect(row(taskId).secret).not.toContain('new-password');
  expect((await advance(taskId)).step).toBe('api-apply');
  expect(JSON.parse(unseal(row(taskId).secret!)).config).toEqual(original);
  await advance(taskId);
  expect(getSettings().gostUser).toBe('old-user');
  const applied = JSON.parse(readFileSync(file, 'utf8'));
  expect(applied.services).toEqual(original.services); expect(applied.chains).toEqual(original.chains);
  expect(applied.api.pathPrefix).toBe('/manage');
  expect((await advance(taskId)).state).toBe('succeeded');
  expect(getSettings().gostUser).toBe('new-user');
  expect(getSettings().gostApi).toBe(request().gostApi);
  expect(row(taskId).secret).toBeNull();
  expect(JSON.stringify(getDb().prepare('SELECT * FROM audit').all())).not.toMatch(/old-password|new-password/);
});

it('preserves the actual host password when the password input is empty', async () => {
  saveSettings({ ...getSettings(), gostPassword: 'stale-platform-password' });
  const { taskId } = queueGostApi({ ...request(''), gostApi: 'http://0.0.0.0:' + targetPort });
  await advance(taskId); await advance(taskId); await advance(taskId);
  expect(row(taskId).state).toBe('succeeded');
  expect(getSettings().gostPassword).toBe('old-password');
  expect(getSettings().gostApi).toBe('http://0.0.0.0:' + targetPort);
});

it('rejects conflicting ports before modifying the host configuration', async () => {
  const blocker = createServer();
  await new Promise<void>(accept => blocker.listen(targetPort, '127.0.0.1', accept));
  try {
    const { taskId } = queueGostApi(request());
    expect((await advance(taskId)).state).toBe('failed');
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual(original);
    expect(mocks.helper).not.toHaveBeenCalled();
  } finally { await new Promise<void>(accept => blocker.close(() => accept())); }
});

it('rolls back after failed authentication and keeps active platform settings consistent', async () => {
  wrongNewCredentials = true;
  const { taskId } = queueGostApi(request());
  await advance(taskId); await advance(taskId);
  expect((await advance(taskId)).step).toBe('api-rollback');
  expect((await advance(taskId)).state).toBe('failed');
  expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual(original);
  expect(getSettings().gostUser).toBe('old-user');
  expect(JSON.parse(unseal(row(taskId).secret!))).not.toHaveProperty('config');
}, 10000);

it('recovers an interrupted write and verifies before committing', async () => {
  const { taskId } = queueGostApi(request());
  await advance(taskId);
  const snapshot = JSON.parse(unseal(row(taskId).secret!));
  writeFileSync(file, JSON.stringify({ ...original, api: { ...original.api, addr: '127.0.0.1:' + targetPort, auth: { username: snapshot.next.gostUser, password: snapshot.next.gostPassword } } }));
  closeDb();
  await advance(taskId); await advance(taskId);
  expect(row(taskId).state).toBe('succeeded');
  expect(getSettings().gostUser).toBe('new-user');
});

it('retains rollback checkpoints after a restart failure and can resume recovery', async () => {
  rejectNewRestart = true; rejectRollback = true;
  const { taskId } = queueGostApi(request());
  await advance(taskId);
  expect((await advance(taskId)).step).toBe('api-rollback');
  expect((await advance(taskId)).state).toBe('attention');
  expect(row(taskId).error).not.toContain('old-password');
  expect(() => queueGostApi(request())).toThrow('已有 gost API');
  rejectRollback = false;
  closeDb();
  await advance(taskId);
  expect(row(taskId).state).toBe('failed');
  expect(getSettings().gostUser).toBe('old-user');
});

it('serializes API changes against other gost writes and validates local addresses', async () => {
  const { taskId } = queueGostApi({ ...request(), gostApi: 'http://198.51.100.1:18080' });
  expect(() => queueGostApi(request())).toThrow('已有 gost API');
  await expect(configureGost()).rejects.toThrow('正在同步');
  await expect(syncForwards()).rejects.toThrow('正在同步');
  expect((await advance(taskId)).state).toBe('failed');
  expect(mocks.helper).not.toHaveBeenCalled();
  expect(() => queueGostApi({ ...request(), gostApi: 'http://user:pass@127.0.0.1:18080' })).toThrow();
  expect(() => queueGostApi({ ...request(), gostUser: 'invalid:user' })).toThrow();
});
