import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

export async function request<T>(path: string, body?: unknown, method = body === undefined ? 'GET' : 'POST'): Promise<T> {
  const response = await fetch('/api/' + path, { method, credentials: 'same-origin', headers: body === undefined ? {} : { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const value = await response.json();
  if (!response.ok) { if (response.status === 401) window.dispatchEvent(new Event('pvedc:unauthorized')); throw new Error(value.error || '请求失败'); }
  return value as T;
}
export function useCommand() {
  const cache = useQueryClient();
  const [pending, setPending] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('');
  async function run<T = Record<string, unknown>>(path: string, body: unknown = {}, method = 'POST'): Promise<T | undefined> {
    setPending(true); setError(''); setMessage('');
    try {
      const result = await request<T>(path, body, method);
      if (path === 'auth/logout') {
        cache.setQueryData(['session'], (old: Record<string, unknown> | undefined) => old ? { ...old, actor: null } : old);
        cache.removeQueries({ predicate: query => query.queryKey[0] !== 'session' });
      }
      setMessage('操作已提交'); await cache.invalidateQueries(); return result;
    }
    catch (error) { setError(error instanceof Error ? error.message : '操作失败'); }
    finally { setPending(false); }
  }
  return { run, pending, error, message };
}
