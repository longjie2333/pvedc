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
    const claims = decodeJwt(adminCookie.split('; ')[0].split('=')[1]);
    expect(claims.exp! - claims.iat!).toBe(3600);
    expect(result.response.headers.getSetCookie().join('')).toContain('HttpOnly');
    const refreshCookie = result.response.headers.getSetCookie().find(cookie => cookie.startsWith('pvedc_refresh='))!;
    expect(refreshCookie).toContain('Path=/api/auth');
    expect(refreshCookie).toContain('SameSite=Strict');
    const refreshClaims = decodeJwt(refreshCookie.split(';')[0].split('=')[1]);
    expect(refreshClaims.exp! - refreshClaims.iat!).toBe(7 * 86400);
    expect((await call('setup/status')).json.initialized).toBe(true);
    expect((await call('setup/begin', {}, setupCookie)).response.status).toBe(409);
  });
  it('rejects replay of the setup OTP and unauthenticated admin requests', async () => {
    expect((await call('auth/admin', { code: generateSync({ secret }) })).response.status).toBe(401);
    expect((await call('admin/overview')).response.status).toBe(401);
  });
  it('refreshes from an HttpOnly cookie and rejects cross-origin refresh', async () => {
    const before = adminCookie;
    expect((await call('auth/refresh', {}, before, 'https://untrusted.invalid')).response.status).toBe(403);
    const refreshed = await call('auth/refresh', {}, before);
    expect(refreshed.response.status).toBe(200);
    adminCookie = refreshed.cookie;
    expect(adminCookie).not.toBe(before);
    expect((await call('admin/overview', undefined, adminCookie)).response.status).toBe(200);
    const refreshOnly = adminCookie.split('; ').find(cookie => cookie.startsWith('pvedc_refresh='))!;
    expect((await call('auth/session', undefined, refreshOnly)).json.code).toBe('AUTH_REQUIRED');
    expect(JSON.stringify(refreshed.json)).not.toContain(refreshOnly.split('=')[1]);
  });
  it('imports rosters transactionally and preserves leading zeros', async () => {
    const result = await call('admin/students/import', { csv: '学号,姓名,班级\na00001234,测试同学,测试班\na00001235,第二位同学,测试班' }, adminCookie);
    expect(result.response.status).toBe(200); expect(result.json.count).toBe(2);
    const bad = await call('admin/students/import', { csv: '学号,姓名\na00001236,第三位\na00001236,重复' }, adminCookie);
    expect(bad.response.status).toBe(400);
    expect((await call('admin/overview', undefined, adminCookie)).json.students.map((s: { id: string }) => s.id)).toEqual(['a00001234', 'a00001235']);
  });
  it('searches the public roster by name or case-insensitive student ID', async () => {
    const previous = (db.prepare('SELECT value FROM settings').get() as { value: string }).value;
    db.prepare('UPDATE settings SET value=?').run(JSON.stringify({ ...JSON.parse(previous), registrationOpen: true }));
    try {
      const name = await call('public/roster?q=' + encodeURIComponent('第二位'));
      expect(name.json.students.map((s: { id: string }) => s.id)).toEqual(['a00001235']);
      expect((await call('public/roster?q=A00001234')).json.students[0].id).toBe('a00001234');
      expect((await call('public/roster?q=' + encodeURIComponent("' OR 1=1"))).json.students).toEqual([]);
      expect((await call('public/roster?q=' + 'x'.repeat(101))).response.status).toBe(400);
      expect(JSON.stringify(name.json)).not.toContain('password_hash');
    } finally { db.prepare('UPDATE settings SET value=?').run(previous); }
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
    expect((await call('auth/refresh', {}, oldCookie)).response.status).toBe(401);
    expect((await call('admin/overview', undefined, adminCookie)).response.status).toBe(200);
  });
  it('preserves local administration after configuring a public HTTPS origin', async () => {
    expect((await call('admin/settings', { publicOrigin: 'https://compute.example.test' }, adminCookie)).response.status).toBe(200);
    expect((await call('admin/settings', { title: 'Still locally accessible' }, adminCookie)).response.status).toBe(200);
    expect((await call('admin/settings', { title: 'Rejected' }, adminCookie, 'https://untrusted.invalid')).response.status).toBe(403);
  });
  it('accepts wildcard Web binding and generates usable reverse-proxy guidance', async () => {
    expect((await call('admin/settings', { webBindHost: '0.0.0.0' }, adminCookie)).response.status).toBe(200);
    const deployment = await call('admin/deployment', undefined, adminCookie);
    expect(deployment.json.caddy).toContain('reverse_proxy 127.0.0.1:');
    expect(deployment.json.caddy).not.toContain('0.0.0.0:');
    expect(deployment.json.proxy.host).toBeNull();
    expect(deployment.json.notes).toContain('Docker');
    expect((await call('admin/settings', { webBindHost: '224.0.0.1' }, adminCookie)).response.status).toBe(400);
  });
  it('authenticates students without granting administrator access', async () => {
    db.prepare('UPDATE students SET password_hash=? WHERE id=?').run(await argon2.hash('Student-test-password'), 'a00001234');
    const result = await call('auth/student', { studentId: 'a00001234', password: 'Student-test-password' });
    expect(result.response.status).toBe(200); studentCookie = result.cookie;
    expect((await call('admin/overview', undefined, studentCookie)).response.status).toBe(403);
    expect((await call('me/overview', undefined, studentCookie)).json.student.id).toBe('a00001234');
  });
  it('scopes task notifications to the owner and never returns task secrets', async () => {
    const insert = db.prepare("INSERT INTO jobs(id,type,student_id,state,step,payload,secret,created_at,updated_at) VALUES(?,?,?,'succeeded','complete','{}','do-not-return',1,1)");
    insert.run('owned-task', 'start', 'a00001234');
    insert.run('other-task', 'start', 'a00001235');
    const owned = await call('me/tasks/owned-task', undefined, studentCookie);
    expect(owned.response.status).toBe(200);
    expect(owned.json.id).toBe('owned-task');
    expect(JSON.stringify(owned.json)).not.toContain('do-not-return');
    expect((await call('me/tasks/other-task', undefined, studentCookie)).response.status).toBe(404);
    expect((await call('admin/tasks/other-task', undefined, adminCookie)).response.status).toBe(200);
    expect((await call('admin/tasks/other-task')).response.status).toBe(401);
  });
  it('serves paged activities and removes task arrays from overviews', async () => {
    const insert = db.prepare("INSERT INTO jobs(id,type,student_id,state,step,payload,created_at,updated_at) VALUES(?,'start',?,'succeeded','complete','{}',1,1)");
    for (let index = 0; index < 45; index++) insert.run('page-task-' + index, index % 2 ? 'a00001234' : 'a00001235');
    const first = await call('admin/tasks?page=1&pageSize=20', undefined, adminCookie);
    const second = await call('admin/tasks?page=2&pageSize=20', undefined, adminCookie);
    expect(first.json.items).toHaveLength(20); expect(first.json.total).toBe(47);
    expect(second.json.items).toHaveLength(20);
    const own = await call('me/tasks?studentId=a00001235&pageSize=100', undefined, studentCookie);
    expect(own.json.items.every((item: { studentId: string }) => item.studentId === 'a00001234')).toBe(true);
    expect((await call('admin/audit', undefined, studentCookie)).response.status).toBe(403);
    expect((await call('admin/tasks?pageSize=500', undefined, adminCookie)).response.status).toBe(400);
    expect((await call('admin/overview', undefined, adminCookie)).json).not.toHaveProperty('tasks');
    expect((await call('me/overview', undefined, studentCookie)).json).not.toHaveProperty('tasks');
  });
  it('only reveals Basic API credentials through the explicit administrator endpoint', async () => {
    const previous = (db.prepare('SELECT value FROM settings').get() as { value: string }).value;
    const settings = JSON.parse(previous);
    // Reuse the already encrypted fixture credential without introducing plaintext into storage.
    db.prepare('UPDATE settings SET value=?').run(JSON.stringify({ ...settings, gostUser: 'api-test', gostPassword: settings.pveTokenSecret }));
    try {
      const revealed = await call('admin/gost/authorization', undefined, adminCookie);
      expect(revealed.json.authorization).toBe('Basic ' + Buffer.from('api-test:test-sensitive-value').toString('base64'));
      expect(revealed.response.headers.get('cache-control')).toBe('no-store');
      expect((await call('admin/gost/authorization', undefined, studentCookie)).response.status).toBe(403);
      expect((await call('admin/gost/authorization')).response.status).toBe(401);
      expect(JSON.stringify((await call('admin/settings', undefined, adminCookie)).json)).not.toContain(revealed.json.authorization);
      expect(JSON.stringify(db.prepare('SELECT * FROM audit').all())).not.toContain(revealed.json.authorization);
      expect(output).not.toContain(revealed.json.authorization);
    } finally { db.prepare('UPDATE settings SET value=?').run(previous); }
  });
  it('revokes disabled accounts and logout sessions immediately', async () => {
    await call('admin/students', { id: 'a00001234', name: '测试同学', enabled: false }, adminCookie);
    expect((await call('me/overview', undefined, studentCookie)).response.status).toBe(401);
    expect((await call('auth/refresh', {}, studentCookie)).response.status).toBe(401);
    expect((await call('auth/logout', {}, adminCookie)).response.status).toBe(200);
    expect((await call('admin/overview', undefined, adminCookie)).response.status).toBe(401);
    expect((await call('auth/refresh', {}, adminCookie)).response.status).toBe(401);
  });
});
