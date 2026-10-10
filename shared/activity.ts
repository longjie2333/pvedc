import { z } from 'zod';

export const taskNames: Record<string, string> = {
  create: '创建容器', rebuild: '重建容器', reclaim: '回收资源', password: '修改密码',
  start: '启动', shutdown: '关机', reboot: '重启', 'template-download': '下载模板',
  'forward-sync': '应用转发', 'gost-configure': '应用 gost 配置',
  'gost-api-update': '同步 gost API',
  'student-delete': '删除学生',
  'network-apply': '应用网络', 'network-remove': '移除网络',
};
export const taskStates = ['queued', 'running', 'succeeded', 'failed', 'attention'] as const;
export const activityQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(1000000).default(1),
  pageSize: z.coerce.number().refine(n => [20, 50, 100].includes(n), '每页数量只能为 20、50 或 100').default(20),
  q: z.string().trim().max(100).default(''),
  type: z.string().max(50).optional(), state: z.enum(taskStates).optional(),
  studentId: z.string().max(100).optional(), actor: z.string().max(100).optional(), action: z.string().max(100).optional(),
  from: z.coerce.number().int().min(0).optional(), to: z.coerce.number().int().min(0).optional(),
}).refine(q => q.from === undefined || q.to === undefined || q.from <= q.to, '开始时间不能晚于结束时间');
export type ActivityQuery = z.infer<typeof activityQuerySchema>;
export interface PageResult<T> { items: T[]; total: number; page: number; pageSize: number }
export interface AuditRecord { id: number; actor: string; action: string; target: string | null; detail: string | null; created_at: number }
