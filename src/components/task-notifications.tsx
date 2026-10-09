import { useEffect, useState } from 'react';
import { useQueries, useQueryClient } from '@tanstack/react-query';
import type { Task } from '../../shared/schema';
import { request } from '@/lib/api';
import { taskNames } from '../../shared/activity';
import { toastManager } from './ui/toast';

type WatchedTask = { id: string; scope: 'admin' | 'me' };

export function TaskNotifications() {
  const [tasks, setTasks] = useState<WatchedTask[]>([]);
  const cache = useQueryClient();
  useEffect(() => {
    const submitted = (event: Event) => {
      const task = (event as CustomEvent<WatchedTask>).detail;
      setTasks(previous => previous.some(t => t.id === task.id) ? previous : [...previous, task]);
    };
    const reset = () => setTasks([]);
    window.addEventListener('pvedc:task-submitted', submitted);
    window.addEventListener('pvedc:logout', reset);
    return () => {
      window.removeEventListener('pvedc:task-submitted', submitted);
      window.removeEventListener('pvedc:logout', reset);
    };
  }, []);
  const queries = useQueries({ queries: tasks.map(task => ({
    queryKey: ['submitted-task', task.scope, task.id],
    queryFn: () => request<Task>(task.scope + '/tasks/' + task.id),
    refetchInterval: 3000,
  })) });
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
