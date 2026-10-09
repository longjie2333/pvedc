import { getSettings } from './settings';
import { ensure, AppError } from './errors';
import { forwards, resources } from './records';
import { meta, getDb } from './db';
import { dataDir } from './db';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { X509Certificate } from 'node:crypto';

interface GostResponse<T> { code: number; msg?: string; data?: T }
interface Service { name: string; status?: { state: string; events?: { msg: string }[] }; [key: string]: unknown }
export const gostPrefix = () => 'pvedc-' + meta('instance_id')!.slice(0, 8) + '-';
export async function gost<T>(path: string, method = 'GET', data?: unknown): Promise<T> {
  const settings = getSettings();
  ensure(settings.gostPassword, 409, '请先配置 gost API 认证');
  let response;
  try {
    response = await fetch(settings.gostApi.replace(/\/$/, '') + path, { method, signal: AbortSignal.timeout(15000),
      headers: { Authorization: 'Basic ' + Buffer.from(settings.gostUser + ':' + settings.gostPassword).toString('base64'), 'Content-Type': 'application/json' },
      body: data === undefined ? undefined : JSON.stringify(data),
    });
  } catch { throw new AppError(502, 'gost API 连接失败', 'GOST_UNREACHABLE'); }
  if (!response.ok) { await response.body?.cancel(); throw new AppError(502, 'gost 操作失败（HTTP ' + response.status + '）'); }
  let result: GostResponse<T>;
  try { result = await response.json() as GostResponse<T>; }
  catch { throw new AppError(502, 'gost API 返回格式异常'); }
  ensure(response.ok && (!result.code || result.code === 200), 502, 'gost 操作失败（HTTP ' + response.status + '）');
  if (path === '/config' && method === 'GET') return result as T;
  return result.data as T;
}
async function upsert(path: string, name: string, value: unknown, existing: boolean) {
  await gost(existing ? path + '/' + encodeURIComponent(name) : path, existing ? 'PUT' : 'POST', value);
}
export async function configureGost() {
  const s = getSettings(), prefix = gostPrefix(), chain = prefix + 'relay';
  ensure(s.relayHost && s.relayUser && s.relayPassword && s.relayServerName, 400, '请填写 Relay 地址、认证及 TLS 服务名');
  let caFile: string | undefined;
  if (s.relayCa) {
    try { new X509Certificate(s.relayCa); } catch { throw new AppError(400, 'Relay CA 证书格式无效'); }
    caFile = resolve(dataDir(), 'relay-ca.pem');
    writeFileSync(caFile, s.relayCa, { mode: 0o600 });
  }
  const config = await gost<{ chains?: { name: string }[]; services?: Service[] }>('/config');
  await upsert('/config/chains', chain, { name: chain, hops: [{ name: prefix + 'hop', nodes: [{ name: prefix + 'server', addr: s.relayHost + ':' + s.relayPort,
    connector: { type: 'relay', auth: { username: s.relayUser, password: s.relayPassword } },
    dialer: { type: 'tls', tls: { serverName: s.relayServerName, secure: true, caFile } },
  }] }] }, !!config.chains?.some(c => c.name === chain));
  const name = prefix + 'web';
  await upsert('/config/services', name, { name, addr: s.webBindHost + ':' + s.webTunnelPort,
    handler: { type: 'rtcp' }, listener: { type: 'rtcp', chain }, forwarder: { nodes: [{ name: 'web', addr: '127.0.0.1:' + s.webLocalPort }] },
  }, !!config.services?.some(c => c.name === name));
  await gost('/config?format=json', 'POST');
}
export async function syncForwards(resourceId?: string, pause = false) {
  const existing = await gost<{ list: Service[] }>('/config/services');
  const prefix = gostPrefix();
  const rules = forwards().filter(f => !resourceId || f.resourceId === resourceId);
  for (const rule of rules) {
    const name = prefix + rule.id, found = existing.list?.find(s => s.name === name);
    const resource = resources().find(r => r.id === rule.resourceId);
    const active = rule.enabled && !pause && resource?.state === 'ready';
    if (!active) {
      if (found) await gost('/config/services/' + name, 'DELETE');
      getDb().prepare('UPDATE forwards SET state=?,error=NULL WHERE id=?').run('paused', rule.id);
      continue;
    }
    const value = { name, addr: '0.0.0.0:' + rule.publicPort, handler: { type: 'r' + rule.protocol }, listener: { type: 'r' + rule.protocol, chain: prefix + 'relay' },
      forwarder: { nodes: [{ name: 'target', addr: resource.ip + ':' + rule.targetPort }] } };
    const { status: _status, ...current } = found || {} as Service;
    if (!found || current.addr !== value.addr || JSON.stringify(current.forwarder) !== JSON.stringify(value.forwarder)) await upsert('/config/services', name, value, !!found);
    getDb().prepare('UPDATE forwards SET state=?,error=NULL WHERE id=?').run('pending', rule.id);
  }
  if (!resourceId) {
    const names = new Set(forwards().map(f => prefix + f.id));
    for (const service of existing.list || []) if (service.name.startsWith(prefix) && service.name !== prefix + 'web' && !names.has(service.name)) await gost('/config/services/' + service.name, 'DELETE');
  }
  await gost('/config?format=json', 'POST');
}
export async function refreshForwardStatus() {
  const result = await gost<{ list: Service[] }>('/config/services');
  for (const rule of forwards()) {
    const service = result.list?.find(s => s.name === gostPrefix() + rule.id);
    const resource = resources().find(r => r.id === rule.resourceId);
    const state = service?.status?.state || (rule.enabled && resource?.state === 'ready' ? 'pending' : 'paused');
    const error = ['failed', 'closed'].includes(state) ? service?.status?.events?.at(-1)?.msg || null : null;
    getDb().prepare('UPDATE forwards SET state=?,error=? WHERE id=?').run(state, error, rule.id);
  }
}
