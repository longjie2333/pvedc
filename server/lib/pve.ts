import { Agent, fetch } from 'undici';
import { getSettings } from './settings';
import { AppError, ensure } from './errors';
import type { Settings } from '../../shared/schema';
import { meta } from './db';

export interface PveResource { type: string; vmid?: number; node: string; status: string; maxcpu?: number; maxmem?: number; maxdisk?: number; disk?: number; storage?: string; content?: string; template?: number }
export interface GuestConfig { cores?: number; sockets?: number; memory?: number; tags?: string; [key: string]: unknown }
export interface NodeStatus { cpu: number; cpuinfo: { cpus: number }; memory: { total: number; used: number; free: number }; uptime: number }
export interface ContainerStatus { status: string; cpu: number; cpus: number; mem: number; maxmem: number; disk: number; maxdisk: number; netin: number; netout: number; uptime: number }
export interface PveTemplate { template: string; package: string; version: string; os: string; section: string; [key: string]: unknown }
export interface PveNetwork { iface: string; type: string; cidr?: string; address?: string; gateway?: string; active?: number }

let transport: { key: string; agent: Agent } | undefined;
export async function pve<T>(path: string, method = 'GET', params?: Record<string, unknown>, settings: Settings = getSettings()): Promise<T> {
  ensure(settings.pveTokenId && settings.pveTokenSecret, 409, '请先配置 PVE API 凭据');
  ensure(path.startsWith('/') && !path.includes('..'), 400, 'PVE 路径无效');
  const agentKey = settings.pveUrl + settings.pveCa;
  if (transport?.key !== agentKey) {
    void transport?.agent.close();
    transport = { key: agentKey, agent: new Agent({ connect: { ca: settings.pveCa || undefined }, headersTimeout: 15000, bodyTimeout: 15000 }) };
  }
  const url = new URL('/api2/json' + path, settings.pveUrl);
  const form = new URLSearchParams();
  for (const [key, value] of Object.entries(params || {})) if (value !== undefined && value !== null) form.set(key, String(value));
  const queryParams = method === 'GET' || method === 'DELETE';
  if (queryParams) url.search = form.toString();
  let response;
  try {
    response = await fetch(url, { method, dispatcher: transport.agent, signal: AbortSignal.timeout(20000),
      headers: { Authorization: 'PVEAPIToken=' + settings.pveTokenId + '=' + settings.pveTokenSecret, ...(queryParams ? {} : { 'Content-Type': 'application/x-www-form-urlencoded' }) },
      body: queryParams ? undefined : form.toString(),
    });
  } catch { throw new AppError(502, 'PVE 连接失败或超时，请检查地址、证书与节点状态', 'PVE_UNREACHABLE'); }
  if (!response.ok) {
    // Do not relay upstream bodies: PVE validation errors can echo submitted credentials.
    await response.body?.cancel();
    throw new AppError(response.status === 404 ? 404 : 502, 'PVE 操作失败（HTTP ' + response.status + '）', 'PVE_' + response.status);
  }
  let payload: { data: T };
  try { payload = await response.json() as { data: T }; }
  catch { throw new AppError(502, 'PVE 返回格式异常，请核对任务状态', 'PVE_INVALID_RESPONSE'); }
  return payload.data;
}
export const nodePath = () => '/nodes/' + encodeURIComponent(getSettings().pveNode);
export const containerPath = (vmid: number) => nodePath() + '/lxc/' + vmid;
export const ownershipTag = () => 'pvedc-' + meta('instance_id')!.replaceAll('-', '');
export async function guestConfig(vmid: number, type = 'lxc', node = getSettings().pveNode) {
  return pve<GuestConfig>('/nodes/' + encodeURIComponent(node) + '/' + type + '/' + vmid + '/config');
}
export async function taskStatus(upid: string) {
  const result = await pve<{ status: string; exitstatus?: string }>(nodePath() + '/tasks/' + encodeURIComponent(upid) + '/status');
  return { ...result, success: taskSucceeded(result.exitstatus) };
}
export function taskSucceeded(exitstatus?: string) { return !!exitstatus && /^(OK|WARNINGS: [0-9]+)$/.test(exitstatus); }
export async function containerExists(vmid: number) { return (await pve<PveResource[]>('/cluster/resources')).some(r => r.vmid === vmid); }
export function volumeSizeGiB(value: string): number {
  const match = value.match(/(?:^|,)size=(\d+(?:\.\d+)?)([KMGT])?(?:,|$)/);
  if (!match) return 0;
  const factors: Record<string, number> = { K: 1 / 1048576, M: 1 / 1024, G: 1, T: 1024 };
  return Number(match[1]) * (match[2] ? factors[match[2]] : 1 / 1073741824);
}
