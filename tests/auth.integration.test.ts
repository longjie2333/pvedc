import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { generateSync } from 'otplib';
import { decodeJwt } from 'jose';
import Database from 'better-sqlite3';
import argon2 from 'argon2';
import { request as httpRequest } from 'undici';

const dir = mkdtempSync(resolve(tmpdir(), 'pvedc-api-test-'));
const origin = 'http://127.0.0.1:3108';
let server: ChildProcess, db: Database.Database, output = '';
let setupCookie = '', adminCookie = '', studentCookie = '', secret = '';
async function call(path: string, body?: unknown, cookie = '', requestOrigin = origin) {
  const response = await fetch(origin + '/api/' + path, { method: body === undefined ? 'GET' : 'POST', headers: { Cookie: cookie, Origin: requestOrigin, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const json = await response.json();
  return { response, json, cookie: response.headers.getSetCookie().map(c => c.split(';')[0]).join('; ') };
}
beforeAll(async () => {
  server = spawn(process.execPath, ['.output/server/index.mjs'], { env: { ...process.env, PDC_DATA_DIR: dir, PDC_TOTP_SECRET: '', PDC_INITIAL_SETTINGS: '', PORT: '3108', HOST: '127.0.0.1' }, windowsHide: true, stdio: 'pipe' });
  server.stdout?.on('data', b => { output += b; }); server.stderr?.on('data', b => { output += b; });
  const start = Date.now();
  while (true) { try { await fetch(origin + '/api/setup/status'); break; } catch { if (Date.now() - start > 15000) throw new Error('Test server failed: ' + output); await new Promise(r => setTimeout(r, 100)); } }
  db = new Database(resolve(dir, 'pvedc.sqlite'));
}, 20000);
afterAll(async () => {
  db?.close();
  if (server && server.exitCode === null) { const closed = new Promise(resolve => server.once('exit', resolve)); server.kill(); await closed; }
  if (!dir.startsWith(resolve(tmpdir(), 'pvedc-api-test-'))) throw new Error('Unsafe test cleanup path');
  rmSync(dir, { recursive: true, force: true });
});

describe('real HTTP authentication and authorization', () => {
  it('starts without an administrator and rejects cross-origin initialization', async () => {
    expect((await call('setup/status')).json.initialized).toBe(false);
    expect((await call('setup/begin', {}, '', 'https://untrusted.invalid')).response.status).toBe(403);
  });
  it('binds pending setup to a single browser session', async () => {
    const response = await httpRequest(origin + '/api/setup/begin', { method: 'POST', headers: { host: 'setup.example.test', origin: 'https://setup.example.test', 'x-forwarded-proto': 'https', 'content-type': 'application/json' }, body: '{}' });
    const cookies = [response.headers['set-cookie'] || []].flat();
    const first = { response: { status: response.statusCode }, json: await response.body.json() as { secret: string; qr: string }, cookie: cookies.map(c => c.split(';')[0]).join('; ') }; expect(first.response.status).toBe(200);
    expect(cookies.join('')).toContain('Secure');
    secret = first.json.secret; setupCookie = first.cookie;
    expect(first.json.qr).toMatch(/^data:image\/png;base64,/);
    expect((await call('setup/begin', {})).response.status).toBe(409);
    expect((await call('setup/begin', {}, setupCookie)).json.secret).toBe(secret);
  });
  it('requires a valid TOTP, closes setup and issues a one-hour JWT', async () => {
    expect((await call('setup/complete', { code: '000000' }, setupCookie)).response.status).toBe(401);
    const result = await call('setup/complete', { code: generateSync({ secret }) }, setupCookie);
    expect(result.response.status).toBe(200); adminCookie = result.cookie;
    const claims = decodeJwt(adminCookie.split('=')[1]);
    expect(claims.exp! - claims.iat!).toBe(3600);
    expect(result.response.headers.getSetCookie().join('')).toContain('HttpOnly');
    expect((await call('setup/status')).json.initialized).toBe(true);
    expect((await call('setup/begin', {}, setupCookie)).response.status).toBe(409);
  });
  it('rejects replay of the setup OTP and unauthenticated admin requests', async () => {
    expect((await call('auth/admin', { code: generateSync({ secret }) })).response.status).toBe(401);
    expect((await call('admin/overview')).response.status).toBe(401);
  });
  it('imports rosters transactionally and preserves leading zeros', async () => {
    const result = await call('admin/students/import', { csv: '学号,姓名,班级\n00001234,测试同学,测试班\n00001235,第二位同学,测试班' }, adminCookie);
    expect(result.response.status).toBe(200); expect(result.json.count).toBe(2);
    const bad = await call('admin/students/import', { csv: '学号,姓名\n00001236,第三位\n00001236,重复' }, adminCookie);
    expect(bad.response.status).toBe(400);
    expect((await call('admin/overview', undefined, adminCookie)).json.students.map((s: { id: string }) => s.id)).toEqual(['00001234', '00001235']);
  });
  it('does not expose credentials through settings or store them as plaintext', async () => {
    const result = await call('admin/settings', { pveTokenSecret: 'test-sensitive-value' }, adminCookie);
    expect(result.response.status).toBe(200); expect(JSON.stringify(result.json)).not.toContain('test-sensitive-value');
    const row = db.prepare('SELECT value FROM settings').get() as { value: string };
    expect(row.value).not.toContain('test-sensitive-value');
  });
  it('rotates TOTP only after verifying old and new secrets, revoking old sessions', async () => {
    const begin = await call('auth/rotate-begin', { code: generateSync({ secret, epoch: Math.floor(Date.now() / 1000) + 30 }) }, adminCookie);
    expect(begin.response.status).toBe(200);
    const oldCookie = adminCookie;
    const complete = await call('auth/rotate-complete', { code: generateSync({ secret: begin.json.secret }) }, adminCookie);
    expect(complete.response.status).toBe(200);
    adminCookie = complete.cookie; secret = begin.json.secret;
    expect((await call('admin/overview', undefined, oldCookie)).response.status).toBe(401);
    expect((await call('admin/overview', undefined, adminCookie)).response.status).toBe(200);
  });
  it('preserves local administration after configuring a public HTTPS origin', async () => {
    expect((await call('admin/settings', { publicOrigin: 'https://compute.example.test' }, adminCookie)).response.status).toBe(200);
    expect((await call('admin/settings', { title: 'Still locally accessible' }, adminCookie)).response.status).toBe(200);
    expect((await call('admin/settings', { title: 'Rejected' }, adminCookie, 'https://untrusted.invalid')).response.status).toBe(403);
  });
  it('authenticates students without granting administrator access', async () => {
    db.prepare('UPDATE students SET password_hash=? WHERE id=?').run(await argon2.hash('Student-test-password'), '00001234');
    const result = await call('auth/student', { studentId: '00001234', password: 'Student-test-password' });
    expect(result.response.status).toBe(200); studentCookie = result.cookie;
    expect((await call('admin/overview', undefined, studentCookie)).response.status).toBe(403);
    expect((await call('me/overview', undefined, studentCookie)).json.student.id).toBe('00001234');
  });
  it('revokes disabled accounts and logout sessions immediately', async () => {
    await call('admin/students', { id: '00001234', name: '测试同学', enabled: false }, adminCookie);
    expect((await call('me/overview', undefined, studentCookie)).response.status).toBe(401);
    expect((await call('auth/logout', {}, adminCookie)).response.status).toBe(200);
    expect((await call('admin/overview', undefined, adminCookie)).response.status).toBe(401);
  });
});
