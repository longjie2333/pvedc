import { createHash } from 'node:crypto';
import { generateSecret, generateURI, generateSync, verifySync } from 'otplib';
import QRCode from 'qrcode';
import argon2 from 'argon2';
import { audit, getDb, meta, now, setMeta } from './db';
import { seal, unseal } from './crypto';
import { ensure } from './errors';

export const hashPassword = (password: string) => argon2.hash(password, { type: argon2.argon2id, memoryCost: 65536, timeCost: 3, parallelism: 1 });
export const verifyPassword = (hash: string, password: string) => argon2.verify(hash, password);
const fingerprint = (value: string) => createHash('sha256').update(value).digest('hex');

export function initializeAuth() {
  if (meta('auth_env_checked')) return;
  getDb().transaction(() => {
    if (!meta('totp_secret') && process.env.PDC_TOTP_SECRET) {
      const secret = process.env.PDC_TOTP_SECRET.trim().toUpperCase();
      generateSync({ secret });
      setMeta('totp_secret', seal(secret));
    }
    setMeta('auth_env_checked', '1');
  }).immediate();
}
export const initialized = () => { initializeAuth(); return !!meta('totp_secret'); };

export function rateLimit(key: string, limit = 8, seconds = 300) {
  getDb().transaction(() => {
    getDb().prepare('DELETE FROM rate_limits WHERE expires_at<=?').run(now());
    const row = getDb().prepare('SELECT count FROM rate_limits WHERE key=?').get(key) as { count: number } | undefined;
    ensure(!row || row.count < limit, 429, '尝试过于频繁，请稍后再试');
    getDb().prepare('INSERT INTO rate_limits(key,count,expires_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1').run(key, now() + seconds);
  }).immediate();
}

interface PendingSecret { owner: string; secret: string; expires: number }
export async function beginSetup(owner: string, rotation = false) {
  ensure(rotation || !initialized(), 409, '管理员已经初始化');
  const name = rotation ? 'totp_rotation' : 'totp_pending';
  const pending = getDb().transaction(() => {
    const stored = meta(name);
    const current = stored ? JSON.parse(stored) as PendingSecret : null;
    if (current && current.expires > now()) {
      ensure(current.owner === fingerprint(owner), 409, '另一会话正在设置，请等待十分钟或返回原浏览器');
      return current;
    }
    const next: PendingSecret = { owner: fingerprint(owner), secret: seal(generateSecret()), expires: now() + 600 };
    setMeta(name, JSON.stringify(next));
    return next;
  }).immediate();
  const secret = unseal(pending.secret);
  const uri = generateURI({ secret, issuer: 'PVE Distribution Center', label: 'Administrator' });
  return { secret, qr: await QRCode.toDataURL(uri, { width: 256, margin: 2 }), expiresAt: pending.expires };
}

export function finishSetup(owner: string, code: string, rotation = false) {
  getDb().transaction(() => {
    ensure(rotation || !initialized(), 409, '管理员已经初始化');
    const key = rotation ? 'totp_rotation' : 'totp_pending';
    const pending = JSON.parse(meta(key) || 'null') as PendingSecret | null;
    ensure(pending && pending.owner === fingerprint(owner) && pending.expires > now(), 400, '设置会话已失效');
    const result = verifySync({ secret: unseal(pending.secret), token: code, epochTolerance: 30 });
    ensure(result.valid, 401, '验证码错误或已过期');
    setMeta('totp_secret', pending.secret);
    setMeta('totp_last_step', String('timeStep' in result ? result.timeStep : Math.floor(now() / 30)));
    getDb().prepare('DELETE FROM meta WHERE key IN (?,?)').run('totp_pending', 'totp_rotation');
    getDb().prepare('DELETE FROM sessions WHERE role=?').run('admin');
    audit('admin', rotation ? 'totp.rotate' : 'setup.complete');
  }).immediate();
}

export function checkAdminOtp(code: string) {
  getDb().transaction(() => {
    const secret = meta('totp_secret');
    ensure(secret, 403, '请先初始化管理员');
    const previous = meta('totp_last_step');
    const result = verifySync({ secret: unseal(secret), token: code, epochTolerance: 30, afterTimeStep: previous === undefined ? undefined : Number(previous) });
    ensure(result.valid, 401, '验证码错误、已使用或已过期');
    setMeta('totp_last_step', String('timeStep' in result ? result.timeStep : Math.floor(now() / 30)));
  }).immediate();
}
