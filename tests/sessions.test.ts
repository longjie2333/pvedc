import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { decodeJwt, SignJWT } from 'jose';
import { authenticateAccess, issueSession, logoutSession, refreshSession, revokeSubject } from '../server/lib/sessions';
import { closeDb, getDb } from '../server/lib/db';
import { signingKey } from '../server/lib/crypto';

const directory = mkdtempSync(resolve(tmpdir(), 'pvedc-sessions-test-'));
const start = new Date('2026-10-10T00:00:00Z');
beforeAll(() => { process.env.PDC_DATA_DIR = directory; });
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(start);
  getDb().prepare('DELETE FROM sessions').run();
  getDb().prepare('DELETE FROM students').run();
});
afterEach(() => vi.useRealTimers());
afterAll(() => {
  closeDb(); delete process.env.PDC_DATA_DIR;
  if (!directory.startsWith(resolve(tmpdir(), 'pvedc-sessions-test-'))) throw new Error('Unsafe cleanup path');
  rmSync(directory, { recursive: true, force: true });
});

describe('rotating sessions', () => {
  it('issues separate one-hour access and seven-day refresh JWTs', async () => {
    const session = await issueSession('admin', 'admin');
    const access = decodeJwt(session.token), refresh = decodeJwt(session.refreshToken);
    expect(access.exp! - access.iat!).toBe(3600);
    expect(refresh.exp! - refresh.iat!).toBe(7 * 86400);
    expect(access.aud).not.toBe(refresh.aud);
    expect((await authenticateAccess(session.token))?.actor).toEqual(session.actor);
    expect(await authenticateAccess(session.refreshToken)).toBeNull();
    await expect(refreshSession(session.token)).rejects.toMatchObject({ status: 401 });
    const legacy = await new SignJWT({ role: 'admin' }).setProtectedHeader({ alg: 'HS256' }).setIssuer('pvedc').setAudience('pvedc-web')
      .setJti(session.actor.sessionId).setSubject('admin').setExpirationTime(access.exp!).sign(signingKey());
    expect(await authenticateAccess(legacy)).toBeNull();
  });
  it('refreshes expired access without extending the absolute login deadline', async () => {
    const first = await issueSession('admin', 'admin');
    vi.setSystemTime(new Date(start.getTime() + 3601_000));
    expect(await authenticateAccess(first.token)).toBeNull();
    const next = await refreshSession(first.refreshToken);
    expect(next.refreshExpiresAt).toBe(first.refreshExpiresAt);
    expect(next.expiresAt - Math.floor(Date.now() / 1000)).toBe(3600);
    expect(await authenticateAccess(next.token)).not.toBeNull();
    vi.setSystemTime(new Date(start.getTime() + (7 * 86400 - 30) * 1000));
    const last = await refreshSession(next.refreshToken);
    expect(last.expiresAt).toBe(first.refreshExpiresAt);
    vi.setSystemTime(new Date(start.getTime() + 7 * 86400_000));
    expect(await authenticateAccess(last.token)).toBeNull();
    await expect(refreshSession(last.refreshToken)).rejects.toMatchObject({ status: 401 });
  });
  it('returns identical tokens to concurrent refresh requests and revokes a later replay', async () => {
    const first = await issueSession('admin', 'admin');
    const results = await Promise.all(Array.from({ length: 8 }, () => refreshSession(first.refreshToken)));
    expect(new Set(results.map(result => result.refreshToken)).size).toBe(1);
    expect(new Set(results.map(result => result.token)).size).toBe(1);
    vi.setSystemTime(new Date(start.getTime() + 11_000));
    await expect(refreshSession(first.refreshToken)).rejects.toMatchObject({ status: 401 });
    expect(await authenticateAccess(results[0].token)).toBeNull();
    expect(getDb().prepare('SELECT * FROM refresh_sessions').all()).toEqual([]);
  });
  it('revokes both tokens when a student is disabled or the subject is revoked', async () => {
    getDb().prepare('INSERT INTO students(id,name,created_at) VALUES(?,?,0)').run('a001', 'Student');
    const session = await issueSession('student', 'a001');
    getDb().prepare('UPDATE students SET enabled=0').run();
    expect(await authenticateAccess(session.token)).toBeNull();
    await expect(refreshSession(session.refreshToken)).rejects.toMatchObject({ status: 401 });
    getDb().prepare('UPDATE students SET enabled=1').run();
    revokeSubject('a001');
    expect(await authenticateAccess(session.token)).toBeNull();
    await expect(refreshSession(session.refreshToken)).rejects.toMatchObject({ status: 401 });
  });
  it('logs out using the refresh cookie after access has expired', async () => {
    const session = await issueSession('admin', 'admin');
    vi.setSystemTime(new Date(start.getTime() + 3601_000));
    await logoutSession(session.token, session.refreshToken);
    await expect(refreshSession(session.refreshToken)).rejects.toMatchObject({ status: 401 });
  });
});
