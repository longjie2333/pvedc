import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { dataDir } from './db';

let master: Buffer | undefined;
function key() {
  if (master) return master;
  mkdirSync(dataDir(), { recursive: true, mode: 0o700 });
  const path = resolve(dataDir(), 'master.key');
  if (!existsSync(path)) {
    const bytes = process.env.PDC_MASTER_KEY ? Buffer.from(process.env.PDC_MASTER_KEY, 'base64') : randomBytes(32);
    if (bytes.length !== 32) throw new Error('PDC_MASTER_KEY 必须为 Base64 编码的 32 字节密钥');
    try { writeFileSync(path, bytes, { flag: 'wx', mode: 0o600 }); }
    catch (e) { if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e; }
  }
  master = readFileSync(path);
  if (master.length !== 32) throw new Error('主密钥文件无效');
  return master;
}
export function signingKey() { return new Uint8Array(hkdfSync('sha256', key(), '', 'pvedc-jwt-v1', 32)); }
export function seal(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const data = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), data]).toString('base64');
}
export function unseal(value: string) {
  const data = Buffer.from(value, 'base64');
  const decipher = createDecipheriv('aes-256-gcm', key(), data.subarray(0, 12));
  decipher.setAuthTag(data.subarray(12, 28));
  return Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]).toString('utf8');
}
