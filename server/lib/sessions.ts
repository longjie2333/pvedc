import { randomUUID } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import type { Actor } from '../../shared/schema';
import { audit, getDb, now } from './db';
import { signingKey } from './crypto';
import { ensure } from './errors';

const ACCESS_SECONDS = 3600;
const SESSION_SECONDS = 7 * 86400;
const CONCURRENT_REFRESH_SECONDS = 10;
interface SessionRow { id: string; role: Actor['role']; subject: string; expires_at: number }
interface RefreshRow { current_id: string; previous_id: string | null; issued_at: number; previous_valid_until: number }
export interface SessionTokens {
  token: string; refreshToken: string; expiresAt: number; refreshExpiresAt: number; actor: Actor;
}

function sessionRow(id: string) {
  const row = getDb().prepare('SELECT * FROM sessions WHERE id=? AND expires_at>?').get(id, now()) as SessionRow | undefined;
  if (row?.role === 'student') {
    const student = getDb().prepare('SELECT enabled FROM students WHERE id=?').get(row.subject) as { enabled: number } | undefined;
    if (!student?.enabled) return undefined;
  }
  return row;
}

async function signTokens(session: SessionRow, refresh: RefreshRow): Promise<SessionTokens> {
  const expiresAt = Math.min(refresh.issued_at + ACCESS_SECONDS, session.expires_at);
  const actor: Actor = { role: session.role, sub: session.subject, sessionId: session.id };
  const [token, refreshToken] = await Promise.all([
    new SignJWT({ role: session.role, kind: 'access' }).setProtectedHeader({ alg: 'HS256' })
      .setIssuer('pvedc').setAudience('pvedc-web').setSubject(session.subject).setJti(session.id)
      .setIssuedAt(refresh.issued_at).setExpirationTime(expiresAt).sign(signingKey()),
    new SignJWT({ role: session.role, kind: 'refresh', sid: session.id }).setProtectedHeader({ alg: 'HS256' })
      .setIssuer('pvedc').setAudience('pvedc-refresh').setSubject(session.subject).setJti(refresh.current_id)
      .setIssuedAt(refresh.issued_at).setExpirationTime(session.expires_at).sign(signingKey()),
  ]);
  return { token, refreshToken, expiresAt, refreshExpiresAt: session.expires_at, actor };
}

export async function issueSession(role: Actor['role'], subject: string) {
  const session: SessionRow = { id: randomUUID(), role, subject, expires_at: now() + SESSION_SECONDS };
  const refresh: RefreshRow = { current_id: randomUUID(), previous_id: null, issued_at: now(), previous_valid_until: 0 };
  getDb().transaction(() => {
    getDb().prepare('DELETE FROM sessions WHERE expires_at<=?').run(now());
    getDb().prepare('INSERT INTO sessions(id,role,subject,expires_at) VALUES(?,?,?,?)').run(session.id, role, subject, session.expires_at);
    getDb().prepare('INSERT INTO refresh_sessions(session_id,current_id,previous_id,issued_at,previous_valid_until) VALUES(?,?,?,?,?)')
      .run(session.id, refresh.current_id, null, refresh.issued_at, 0);
  }).immediate();
  return signTokens(session, refresh);
}

export async function authenticateAccess(token?: string) {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, signingKey(), { algorithms: ['HS256'], issuer: 'pvedc', audience: 'pvedc-web' });
    if (payload.kind !== 'access' || !payload.jti || !payload.exp) return null;
    const row = sessionRow(payload.jti);
    if (!row || row.role !== payload.role || row.subject !== payload.sub) return null;
    return { actor: { role: row.role, sub: row.subject, sessionId: row.id } as Actor, expiresAt: payload.exp, refreshExpiresAt: row.expires_at };
  } catch { return null; }
}

export async function refreshSession(token?: string): Promise<SessionTokens> {
  ensure(token, 401, '登录已失效，请重新登录', 'SESSION_EXPIRED');
  let payload;
  try { ({ payload } = await jwtVerify(token, signingKey(), { algorithms: ['HS256'], issuer: 'pvedc', audience: 'pvedc-refresh' })); }
  catch { ensure(false, 401, '登录已失效，请重新登录', 'SESSION_EXPIRED'); }
  ensure(payload.kind === 'refresh' && typeof payload.sid === 'string' && payload.jti, 401, '登录已失效，请重新登录', 'SESSION_EXPIRED');
  const result = getDb().transaction(() => {
    const session = sessionRow(payload.sid as string);
    if (!session || session.subject !== payload.sub || session.role !== payload.role) return null;
    const refresh = getDb().prepare('SELECT * FROM refresh_sessions WHERE session_id=?').get(session.id) as RefreshRow | undefined;
    if (!refresh) return null;
    if (refresh.current_id === payload.jti) {
      refresh.previous_id = refresh.current_id;
      refresh.current_id = randomUUID();
      refresh.issued_at = now();
      refresh.previous_valid_until = now() + CONCURRENT_REFRESH_SECONDS;
      getDb().prepare('UPDATE refresh_sessions SET current_id=?,previous_id=?,issued_at=?,previous_valid_until=? WHERE session_id=?')
        .run(refresh.current_id, refresh.previous_id, refresh.issued_at, refresh.previous_valid_until, session.id);
    } else if (refresh.previous_id !== payload.jti || refresh.previous_valid_until < now()) {
      getDb().prepare('DELETE FROM sessions WHERE id=?').run(session.id);
      audit(session.subject, 'session.refresh-reuse', session.id);
      return null;
    }
    return { session, refresh };
  }).immediate();
  ensure(result, 401, '登录已失效，请重新登录', 'SESSION_EXPIRED');
  return signTokens(result.session, result.refresh);
}

export async function logoutSession(accessToken?: string, refreshToken?: string) {
  for (const [token, audience, kind] of [[accessToken, 'pvedc-web', 'access'], [refreshToken, 'pvedc-refresh', 'refresh']] as const) {
    if (!token) continue;
    try {
      const { payload } = await jwtVerify(token, signingKey(), { algorithms: ['HS256'], issuer: 'pvedc', audience });
      if (payload.kind !== kind) continue;
      const id = kind === 'refresh' ? payload.sid : payload.jti;
      if (typeof id === 'string') getDb().prepare('DELETE FROM sessions WHERE id=?').run(id);
    } catch { /* Expired credentials still permit clearing the browser's cookies. */ }
  }
}

export function revokeSubject(subject: string) {
  getDb().prepare('DELETE FROM sessions WHERE subject=? AND role=?').run(subject, 'student');
}
