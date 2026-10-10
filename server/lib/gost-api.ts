import { closeSync, existsSync, fsyncSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { networkInterfaces } from 'node:os';
import { createServer } from 'node:net';
import { randomUUID } from 'node:crypto';
import { setTimeout } from 'node:timers/promises';
import { gostApiChangeSchema, gostApiInputSchema, gostEndpoint, type GostApiSettings } from '../../shared/gost';
import { getDb, dataDir, now, audit } from './db';
import { seal, unseal } from './crypto';
import { AppError, ensure } from './errors';
import { getSettings, saveSettings } from './settings';
import { enqueue } from './provision';
import { gost, gostApiUpdating } from './gost';
import { helper } from './helper';
import { checkpoint, succeed } from './job-state';
import type { FullJobRow } from './records';

interface GostConfig extends Record<string, unknown> {
  api: { addr: string; pathPrefix?: string; auth?: { username: string; password: string }; auther?: string; [key: string]: unknown };
}
interface ApiSnapshot { next: GostApiSettings; previous?: GostApiSettings; config?: GostConfig }
const configPath = () => resolve(dataDir(), 'gost/gost.json');

function readConfig(): GostConfig {
  try {
    const config = JSON.parse(readFileSync(configPath(), 'utf8')) as GostConfig;
    ensure(config?.api?.addr, 409, '本机 gost 未配置 API 监听');
    return config;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(409, '无法读取本机 gost 配置，请检查部署');
  }
}

function writeConfig(config: GostConfig) {
  const path = configPath(), temporary = path + '.' + randomUUID() + '.tmp';
  try {
    const descriptor = openSync(temporary, 'wx', 0o600);
    try { writeFileSync(descriptor, JSON.stringify(config, null, 2) + '\n'); fsyncSync(descriptor); }
    finally { closeSync(descriptor); }
    renameSync(temporary, path);
  } finally { if (existsSync(temporary)) unlinkSync(temporary); }
}

function originalApi(config: GostConfig): GostApiSettings {
  ensure(!config.api.auther && config.api.auth?.username && config.api.auth.password, 409, '本机 gost API 需要使用用户名与密码认证');
  const address = config.api.addr.startsWith(':') ? '0.0.0.0' + config.api.addr : config.api.addr;
  return gostApiInputSchema.parse({ gostApi: 'http://' + address + (config.api.pathPrefix || ''), gostUser: config.api.auth.username, gostPassword: config.api.auth.password });
}

async function checkBinding(next: GostApiSettings, previous: GostApiSettings) {
  const target = gostEndpoint(next.gostApi), old = gostEndpoint(previous.gostApi);
  const addresses = Object.values(networkInterfaces()).flatMap(entries => entries?.map(entry => entry.address) || []);
  ensure(target.hostname === '0.0.0.0' || target.hostname.startsWith('127.') || addresses.includes(target.hostname), 400, 'API 监听地址必须属于 PVE 本机');
  if (target.port === old.port) return;
  await new Promise<void>((accept, reject) => {
    const server = createServer();
    server.once('error', () => reject(new AppError(409, '新 API 端口被占用或当前服务无权监听，配置尚未修改')));
    server.listen({ host: target.hostname, port: target.port, exclusive: true }, () => server.close(error => error ? reject(error) : accept()));
  });
}

async function waitForApi(settings: GostApiSettings) {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const config = await gost<GostConfig>('/config', 'GET', undefined, settings, 1500);
      const target = gostEndpoint(settings.gostApi);
      const observed = config.api?.addr;
      ensure(observed && gostEndpoint('http://' + (observed.startsWith(':') ? '0.0.0.0' : '') + observed).listenAddress === target.listenAddress, 502, 'API 返回的监听地址与配置不一致');
      ensure(config.api?.auth?.username === settings.gostUser, 502, 'API 返回的用户名与配置不一致');
      const anonymous = await fetch(target.connectUrl + '/config', { signal: AbortSignal.timeout(1500) });
      await anonymous.body?.cancel();
      ensure(anonymous.status === 401 || anonymous.status === 403, 502, 'gost API 未启用身份验证');
      return;
    } catch {
      if (attempt === 4) throw new AppError(502, 'gost API 连接或新凭据验证失败');
      await setTimeout(400);
    }
  }
}

export function queueGostApi(input: unknown) {
  const requested = gostApiChangeSchema.parse(input);
  const next: GostApiSettings = { ...requested, gostApi: gostEndpoint(requested.gostApi).address, gostPassword: requested.gostPassword || '' };
  return getDb().transaction(() => {
    ensure(!gostApiUpdating(), 409, '已有 gost API 同步或恢复任务，请先完成该任务');
    const job = enqueue('gost-api-update', null, null, { address: next.gostApi, username: next.gostUser }, JSON.stringify({ next }));
    audit('admin', 'gost.api.request', job.taskId, next.gostApi);
    return job;
  }).immediate();
}

export async function updateGostApi(job: FullJobRow) {
  ensure(job.secret, 409, 'API 同步任务缺少配置，请重新提交');
  const snapshot = JSON.parse(unseal(job.secret)) as ApiSnapshot;
  try {
    if (job.step === 'pending') {
      snapshot.config = readConfig();
      snapshot.previous = originalApi(snapshot.config);
      snapshot.next = gostApiInputSchema.parse({ ...snapshot.next, gostPassword: snapshot.next.gostPassword || snapshot.previous.gostPassword });
      await checkBinding(snapshot.next, snapshot.previous);
      const secret = seal(JSON.stringify(snapshot));
      getDb().prepare("UPDATE jobs SET secret=?,step='api-apply',updated_at=? WHERE id=?").run(secret, now(), job.id);
      return;
    }
    ensure(snapshot.config && snapshot.previous, 409, 'API 配置恢复快照缺失');
    if (job.step === 'api-apply') {
      const config = readConfig(), target = gostEndpoint(snapshot.next.gostApi);
      config.api = { ...config.api, addr: target.listenAddress, pathPrefix: target.pathPrefix, auth: { username: snapshot.next.gostUser, password: snapshot.next.gostPassword } };
      delete config.api.auther;
      writeConfig(config);
      await helper({ operation: 'gost-restart' });
      checkpoint(job, 'api-verify');
      return;
    }
    if (job.step === 'api-verify') {
      await waitForApi(snapshot.next);
      getDb().transaction(() => {
        saveSettings({ ...getSettings(), ...snapshot.next });
        audit('admin', 'gost.api.updated', job.id, snapshot.next.gostApi);
        succeed(job);
      }).immediate();
      return;
    }
    if (job.step === 'api-rollback') {
      writeConfig(snapshot.config);
      await helper({ operation: 'gost-restart' });
      await waitForApi(snapshot.previous);
      getDb().transaction(() => {
        saveSettings({ ...getSettings(), ...snapshot.previous! });
        getDb().prepare("UPDATE jobs SET state='failed',step='pending',secret=?,error=?,updated_at=? WHERE id=?")
          .run(seal(JSON.stringify({ next: snapshot.next })), 'API 修改未生效，已恢复原接口。请检查地址与凭据后重试。', now(), job.id);
        audit('admin', 'gost.api.rollback', job.id);
      }).immediate();
      return;
    }
    throw new AppError(409, 'API 同步任务阶段无效');
  } catch (error) {
    const message = error instanceof AppError ? error.message : 'gost API 配置操作失败，请检查宿主机服务';
    if (job.step === 'pending') {
      getDb().prepare("UPDATE jobs SET state='failed',error=?,updated_at=? WHERE id=?").run(message, now(), job.id);
      audit('system', 'gost.api.failed', job.id, message);
    } else if (job.step === 'api-rollback') {
      getDb().prepare("UPDATE jobs SET state='attention',error=?,updated_at=? WHERE id=?").run('原接口恢复失败，请重试恢复。' + message, now(), job.id);
      audit('system', 'gost.api.recovery-required', job.id);
    } else {
      getDb().prepare("UPDATE jobs SET step='api-rollback',error=?,updated_at=? WHERE id=?").run(message, now(), job.id);
    }
  }
}
