import { z } from 'zod';
import ipaddr from 'ipaddr.js';

const text = z.string().trim().min(1).max(100);
const port = z.coerce.number().int().min(1).max(65535);
export const studentId = z.string().trim().regex(/^[A-Za-z][0-9]{2,31}$/, '学号需为首字母 + 2–32 位数字');
export const password = z.string().min(10, '密码至少 10 位').max(128).refine(v => !/[\r\n\0:]/.test(v), '密码不能包含冒号、换行或空字符');
export const otp = z.string().regex(/^\d{6}$/, '请输入六位验证码');

export const studentSchema = z.object({
  id: studentId, name: text, className: z.string().trim().max(100).default(''),
  profileId: z.string().nullable().default(null), enabled: z.boolean().default(true),
});
export type StudentInput = z.infer<typeof studentSchema>;

export const networkSchema = z.object({
  name: text, mode: z.enum(['nat', 'bridge']), bridge: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_-]{0,14}$/),
  cidr: z.string().trim(), gateway: z.ipv4(), start: z.ipv4(), end: z.ipv4(),
  dns: z.array(z.ipv4()).min(1).max(3), excluded: z.array(z.ipv4()).default([]),
  vlan: z.number().int().min(1).max(4094).nullable().default(null),
});
export type NetworkSpec = z.infer<typeof networkSchema>;

export const profileSchema = z.object({
  name: text, published: z.boolean().default(false), enabled: z.boolean().default(true),
  template: z.string().regex(/^[a-zA-Z0-9_-]+:vztmpl\/[a-zA-Z0-9_.-]+$/),
  distro: z.enum(['ubuntu', 'debian']), storage: z.string().regex(/^[a-zA-Z0-9_-]+$/),
  cores: z.coerce.number().int().min(1).max(128),
  memory: z.coerce.number().int().min(256).max(1048576),
  swap: z.coerce.number().int().min(0).max(1048576).default(0),
  disk: z.coerce.number().int().min(4).max(65536),
  networkId: text, nesting: z.boolean().default(false),
});
export type ProfileSpec = z.infer<typeof profileSchema>;

export const settingsSchema = z.object({
  title: text.default('学生计算中心'), publicOrigin: z.union([z.url(), z.literal('')]).default(''),
  selfSelection: z.boolean().default(false), defaultProfileId: z.string().nullable().default(null),
  registrationOpen: z.boolean().default(false),
  cpuOvercommit: z.coerce.number().min(1).max(16).default(1),
  reserveCpu: z.coerce.number().min(0).max(128).default(2),
  reserveMemory: z.coerce.number().int().min(0).default(4096),
  reserveDisk: z.coerce.number().int().min(0).default(10),
  vmidStart: z.coerce.number().int().min(100).max(999999999).default(1000),
  vmidEnd: z.coerce.number().int().min(100).max(999999999).default(9999),
  pveUrl: z.url().default('https://r550:8006'), pveNode: z.string().regex(/^[a-zA-Z0-9_-]+$/).default('r550'),
  pveTokenId: z.string().default(''), pveTokenSecret: z.string().default(''), pveCa: z.string().default(''),
  gostApi: z.url().default('http://127.0.0.1:18080'), gostUser: z.string().default('pvedc'), gostPassword: z.string().default(''),
  relayHost: z.string().trim().max(253).default(''), relayPort: port.default(8443),
  relayUser: z.string().default(''), relayPassword: z.string().default(''),
  relayServerName: z.string().trim().default(''), relayCa: z.string().default(''),
  publicHost: z.string().trim().max(253).default(''),
  portStart: port.default(20000), portEnd: port.default(29999),
  reservedPorts: z.array(port).default([]), forwardQuota: z.coerce.number().int().min(0).max(100).default(5),
  webBindHost: z.ipv4().refine(v => v === '0.0.0.0' || ['private', 'loopback'].includes(ipaddr.IPv4.parse(v).range()), 'Web 通道需绑定 0.0.0.0、回环或私网地址').default('127.0.0.1'), webTunnelPort: port.default(18081), webLocalPort: port.default(3000),
}).refine(s => s.vmidStart <= s.vmidEnd, 'VMID 范围不正确')
  .refine(s => s.portStart <= s.portEnd, '公网端口范围不正确')
  .refine(s => !s.publicOrigin || new URL(s.publicOrigin).pathname === '/', '公网地址不能包含路径');
export type Settings = z.infer<typeof settingsSchema>;
export const secretKeys = ['pveTokenSecret', 'gostPassword', 'relayPassword'] as const;
export type SafeSettings = Omit<Settings, typeof secretKeys[number]> & { secrets: Record<typeof secretKeys[number], boolean> };
export const initialConfigSchema = z.object({
  settings: z.record(z.string(), z.unknown()).default({}),
  networks: z.array(networkSchema.extend({ id: text })).default([]),
  profiles: z.array(profileSchema.extend({ id: text })).default([]),
  students: z.array(studentSchema).default([]),
});

export const forwardSchema = z.object({
  protocol: z.enum(['tcp', 'udp']), targetPort: port, publicPort: port.optional(),
  note: z.string().trim().max(100).default(''),
});
export type ForwardInput = z.infer<typeof forwardSchema>;
export type Actor = { role: 'admin' | 'student'; sub: string; sessionId: string };
export type TaskState = 'queued' | 'running' | 'failed' | 'succeeded' | 'attention';
export type ResourceState = 'reserved' | 'creating' | 'configuring' | 'ready' | 'rebuilding' | 'deleting' | 'failed';
export interface Student extends StudentInput { claimed: boolean; deleting: boolean; createdAt: number; resource: Resource | null }
export interface Profile extends ProfileSpec { id: string }
export interface Network extends NetworkSpec { id: string; ready: boolean; error: string | null }
export interface Resource {
  id: string; studentId: string; vmid: number; profileId: string; networkId: string;
  ip: string; spec: ProfileSpec; network: NetworkSpec; state: ResourceState; createdAt: number;
}
export interface Task {
  id: string; type: string; studentId: string | null; resourceId: string | null;
  state: TaskState; step: string; error: string | null; createdAt: number; updatedAt: number;
}
export interface Forward {
  id: string; studentId: string; resourceId: string; protocol: 'tcp' | 'udp'; targetPort: number;
  publicPort: number; note: string; enabled: boolean; state: string; error: string | null;
}
export interface ListeningPort { protocol: 'tcp' | 'udp'; address: string; port: number; processes: { name: string; pid: number }[] }
export interface Capacity { count: number; limits: { cpu: number; memory: number; disk: number; ip: number; vmid: number }; limiting: string[] }
