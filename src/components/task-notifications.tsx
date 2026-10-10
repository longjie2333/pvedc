import { useEffect, useRef, useState } from 'react';
import { useQueries, useQueryClient } from '@tanstack/react-query';
import type { Task } from '../../shared/schema';
import type { BatchStatus } from '../../shared/batch';
import type { BatchNotice } from '@/lib/feedback';
import { request } from '@/lib/api';
import { taskNames } from '../../shared/activity';
import { toastManager } from './ui/toast';

type WatchedTask = { id: string; scope: 'admin' | 'me' };

export function TaskNotifications() {
  const [tasks, setTasks] = useState<WatchedTask[]>([]);
  const [batches, setBatches] = useState<BatchNotice[]>([]);
  const progress = useRef(new Map<string, string>());
  const cache = useQueryClient();
  useEffect(() => {
    const submitted = (event: Event) => {
      const task = (event as CustomEvent<WatchedTask>).detail;
      setTasks(previous => previous.some(t => t.id === task.id) ? previous : [...previous, task]);
    };
    const submittedBatch = (event: Event) => {
      const batch = (event as CustomEvent<BatchNotice>).detail;
      progress.current.set(batch.id, '0:0');
      setBatches(previous => [...previous.filter(item => item.id !== batch.id), batch]);
    };
    const reset = () => { setTasks([]); setBatches([]); progress.current.clear(); };
    window.addEventListener('pvedc:task-submitted', submitted);
    window.addEventListener('pvedc:logout', reset);
    window.addEventListener('pvedc:batch-submitted', submittedBatch);
    return () => {
      window.removeEventListener('pvedc:task-submitted', submitted);
      window.removeEventListener('pvedc:logout', reset);
      window.removeEventListener('pvedc:batch-submitted', submittedBatch);
    };
  }, []);
  const queries = useQueries({ queries: tasks.map(task => ({
    queryKey: ['submitted-task', task.scope, task.id],
    queryFn: () => request<Task>(task.scope + '/tasks/' + task.id),
    refetchInterval: 3000,
  })) });
  const batchQueries = useQueries({ queries: batches.map(batch => ({ queryKey: ['submitted-batch', batch.id], queryFn: () => request<BatchStatus>('admin/tasks/batch/' + batch.id), refetchInterval: 3000 })) });
  useEffect(() => {
    const finished = new Set<string>();
    batchQueries.forEach((query, index) => {
      const state = query.data, batch = batches[index];
      if (!state || !batch) return;
      const failed = state.failed + state.attention, done = state.succeeded + failed, signature = done + ':' + failed;
      if (progress.current.get(batch.id) === signature) return;
      progress.current.set(batch.id, signature);
      const complete = done === state.total;
      toastManager.add({ id: 'batch:' + batch.id, type: complete ? (failed || batch.rejected ? 'warning' : 'success') : 'info',
        title: batch.label + (complete ? failed || batch.rejected ? '需要处理' : '已完成' : '执行中'),
        description: `完成 ${state.succeeded}/${state.total}，任务失败 ${failed}，未受理 ${batch.rejected}，跳过 ${batch.skipped}。` });
      if (complete) { finished.add(batch.id); progress.current.delete(batch.id); }
    });
    if (finished.size) {
      setBatches(previous => previous.filter(batch => !finished.has(batch.id)));
      void cache.invalidateQueries({ predicate: query => !String(query.queryKey[0]).startsWith('submitted-') });
    }
  }, [batchQueries, batches, cache]);
  useEffect(() => {
    const completed = queries.flatMap(query => query.data && ['succeeded', 'failed', 'attention'].includes(query.data.state) ? [query.data] : []);
    if (!completed.length) return;
    for (const task of completed) {
      toastManager.add({ id: 'task:' + task.id, type: task.state === 'succeeded' ? 'success' : 'error',
        title: (taskNames[task.type] || '任务') + (task.state === 'succeeded' ? '已完成' : '需要处理'),
        description: task.error || undefined });
    }
    const ids = new Set(completed.map(task => task.id));
    setTasks(previous => previous.filter(task => !ids.has(task.id)));
    void cache.invalidateQueries({ predicate: query => query.queryKey[0] !== 'submitted-task' });
  }, [queries, cache]);
  return null;
}
