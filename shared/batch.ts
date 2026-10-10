import { z } from 'zod';

export const batchActions = ['start', 'shutdown', 'reboot', 'reclaim', 'delete'] as const;
export type BatchAction = typeof batchActions[number];
export const batchNames: Record<BatchAction, string> = { start: '启动机器', shutdown: '关闭机器', reboot: '重启机器', reclaim: '回收资源', delete: '删除学生' };
export const batchSchema = z.object({ ids: z.array(z.string().trim().min(1).max(100)).min(1).max(5000).transform(ids => [...new Set(ids)]), action: z.enum(batchActions), confirmation: z.string().optional() });
export const batchConfirmation = (action: BatchAction, count: number) => action === 'delete' ? '删除 ' + count + ' 名学生' : action === 'reclaim' ? '回收 ' + count + ' 名学生的资源' : '';
export interface BatchResult { batchId: string; action: BatchAction; items: { studentId: string; status: 'queued' | 'skipped' | 'failed'; taskId?: string; message?: string }[] }
export interface BatchStatus { total: number; succeeded: number; failed: number; attention: number; queued: number; running: number }
