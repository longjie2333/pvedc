import type { ReactNode } from 'react';
import { AlertCircle, CheckCircle2, Inbox, LoaderCircle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

export function Feedback({ error, message }: { error?: string; message?: string }) {
  if (!error && !message) return null;
  return (
    <Alert variant={error ? 'error' : 'success'} role={error ? 'alert' : 'status'}>
      {error ? <AlertCircle aria-hidden="true" /> : <CheckCircle2 aria-hidden="true" />}
      <AlertDescription className="text-foreground">{error || message}</AlertDescription>
    </Alert>
  );
}

export function Loading() {
  return (
    <div className="empty">
      <LoaderCircle className="size-6 animate-spin" />
      <p>正在读取数据…</p>
    </div>
  );
}

export function Empty({ title = '暂无记录', children }: { title?: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <Inbox className="size-8" aria-hidden="true" />
      <h3>{title}</h3>
      {children && <p>{children}</p>}
    </div>
  );
}
