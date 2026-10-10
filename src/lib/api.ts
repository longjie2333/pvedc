import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { commandFeedback } from './feedback';
import { toastManager } from '@/components/ui/toast';

let refreshing: Promise<boolean> | undefined;

export function refreshBrowserSession(): Promise<boolean> {
  refreshing ??= (async () => {
    const response = await fetch('/api/auth/refresh', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    const value = await response.json();
    if (response.ok) {
      window.dispatchEvent(new CustomEvent('pvedc:session-refreshed', { detail: value }));
      return true;
    }
    if (response.status !== 401) throw new Error(value.error || '登录续期暂时不可用');
    window.dispatchEvent(new Event('pvedc:logout'));
    window.dispatchEvent(new Event('pvedc:unauthorized'));
    return false;
  })().finally(() => { refreshing = undefined; });
  return refreshing;
}

export async function request<T>(path: string, body?: unknown, method = body === undefined ? 'GET' : 'POST', format: 'json' | 'blob' = 'json'): Promise<T> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await fetch('/api/' + path, { method, credentials: 'same-origin', headers: body === undefined ? {} : { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    const value = response.ok && format === 'blob' ? await response.blob() : await response.json();
    if (response.ok) return value as T;
    if (!attempt && response.status === 401 && value.code === 'AUTH_REQUIRED') {
      const refreshed = await refreshBrowserSession();
      if (refreshed || path === 'auth/session') continue;
    }
    if (response.status === 401 && ['AUTH_REQUIRED', 'SESSION_EXPIRED'].includes(value.code)) window.dispatchEvent(new Event('pvedc:unauthorized'));
    throw new Error(value.error || '请求失败');
  }
  throw new Error('登录已失效，请重新登录');
}
export async function downloadFile(path: string, filename: string) {
  try {
    const blob = await request<Blob>(path, undefined, 'GET', 'blob');
    const url = URL.createObjectURL(blob), link = document.createElement('a');
    link.href = url; link.download = filename; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toastManager.add({ type: 'success', title: '导出文件已生成' });
  } catch (error) {
    toastManager.add({ type: 'error', title: '导出失败', description: error instanceof Error ? error.message : '请稍后重试' });
  }
}
export function useCommand() {
  const cache = useQueryClient();
  const [pending, setPending] = useState(false), [error, setError] = useState('');
  const running = useRef(false);
  async function run<T = Record<string, unknown>>(path: string, body: unknown = {}, method = 'POST'): Promise<T | undefined> {
    if (running.current) return;
    running.current = true;
    setPending(true); setError('');
    try {
      const result = await request<T>(path, body, method);
      if (path === 'auth/logout') {
        window.dispatchEvent(new Event('pvedc:logout'));
        cache.setQueryData(['session'], (old: Record<string, unknown> | undefined) => old ? { ...old, actor: null } : old);
        cache.removeQueries({ predicate: query => query.queryKey[0] !== 'session' });
      }
      commandFeedback(path, result); await cache.invalidateQueries(); return result;
    }
    catch (error) {
      const message = error instanceof Error ? error.message : '操作失败';
      setError(message);
      toastManager.add({ type: 'error', title: '操作失败', description: message });
    }
    finally { running.current = false; setPending(false); }
  }
  return { run, pending, error };
}
