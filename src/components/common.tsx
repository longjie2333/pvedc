import type { ComponentProps, ReactNode } from 'react';
import { AlertCircle, CheckCircle2, Inbox, LoaderCircle } from 'lucide-react';
import { Field, FieldLabel, FieldDescription } from './ui/field';
import { Input } from './ui/input';
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from './ui/select';
import { Badge } from './ui/badge';
import { Dialog, DialogClose, DialogFooter, DialogHeader, DialogPanel, DialogPopup, DialogTitle, DialogDescription } from './ui/dialog';
import { Button } from './ui/button';
import { AlertDialog, AlertDialogClose, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogPopup, AlertDialogTitle } from './ui/alert-dialog';

export function TextField({ label, hint, ...props }: ComponentProps<typeof Input> & { label: string; hint?: string }) {
  return <Field name={props.name}><FieldLabel>{label}</FieldLabel><Input {...props}/>{hint && <FieldDescription>{hint}</FieldDescription>}</Field>;
}
export function Choice({ label, value, onChange, items, name, disabled }: { label: string; value: string; onChange: (value: string) => void; items: { value: string; label: string }[]; name?: string; disabled?: boolean }) {
  return <Field name={name}><FieldLabel>{label}</FieldLabel><Select items={items} name={name} value={value} onValueChange={v => onChange(String(v ?? ''))} disabled={disabled}><SelectTrigger className="w-full"><SelectValue/></SelectTrigger><SelectPopup>{items.map(item => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectPopup></Select></Field>;
}
export function Feedback({ error, message }: { error?: string; message?: string }) {
  if (!error && !message) return null;
  return <div role={error ? 'alert' : 'status'} className={'feedback ' + (error ? 'feedback-error' : '')}>{error ? <AlertCircle aria-hidden="true"/> : <CheckCircle2 aria-hidden="true"/>}{error || message}</div>;
}
export function Loading() { return <div className="empty"><LoaderCircle className="size-6 animate-spin"/><p>正在读取数据…</p></div>; }
export function Empty({ title = '暂无记录', children }: { title?: string; children?: ReactNode }) { return <div className="empty"><Inbox className="size-8" aria-hidden="true"/><h3>{title}</h3>{children && <p>{children}</p>}</div>; }
export const stateNames: Record<string, string> = { ready: '已就绪', reserved: '已预留', creating: '创建中', configuring: '初始化中', rebuilding: '重建中', deleting: '回收中', failed: '失败', running: '运行中', stopped: '已停止', queued: '排队中', succeeded: '已完成', attention: '需要处理', pending: '待应用', paused: '已暂停', unknown: '状态未知', listening: '监听中', closed: '已关闭' };
export function Status({ state }: { state: string }) { return <Badge variant="outline" className={'state state-' + state}><span className="status-dot"/>{stateNames[state] || state}</Badge>; }
export function PageTitle({ eyebrow, title, description, actions }: { eyebrow: string; title: string; description: string; actions?: ReactNode }) {
  return <div className="page-heading"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{description}</p></div>{actions && <div className="flex items-center gap-2">{actions}</div>}</div>;
}
export function Stat({ label, value, detail, icon }: { label: string; value: ReactNode; detail: string; icon?: ReactNode }) { return <div className="stat"><div className="stat-label">{label}{icon}</div><div className="stat-value">{value}</div><div className="stat-detail">{detail}</div></div>; }
export function Modal({ open, onClose, title, description, children, footer, destructive = false }: { open: boolean; onClose: () => void; title: string; description: string; children: ReactNode; footer?: ReactNode; destructive?: boolean }) {
  const Root = destructive ? AlertDialog : Dialog, Popup = destructive ? AlertDialogPopup : DialogPopup;
  const Header = destructive ? AlertDialogHeader : DialogHeader, Title = destructive ? AlertDialogTitle : DialogTitle;
  const Description = destructive ? AlertDialogDescription : DialogDescription, Footer = destructive ? AlertDialogFooter : DialogFooter, Close = destructive ? AlertDialogClose : DialogClose;
  return <Root open={open} onOpenChange={v => !v && onClose()}><Popup className="max-w-2xl"><Header><Title>{title}</Title><Description>{description}</Description></Header>{destructive ? <div className="overflow-y-auto px-6 pb-6">{children}</div> : <DialogPanel>{children}</DialogPanel>}<Footer><Close render={<Button variant="ghost"/>}>取消</Close>{footer}</Footer></Popup></Root>;
}
export function Panel({ title, detail, children, action }: { title: string; detail?: string; children: ReactNode; action?: ReactNode }) { return <section className="panel"><header className="panel-heading"><div><h2>{title}</h2>{detail && <p>{detail}</p>}</div>{action}</header>{children}</section>; }
export const bytes = (n: number) => n >= 1073741824 ? (n / 1073741824).toFixed(1) + ' GiB' : (n / 1048576).toFixed(0) + ' MiB';
export const date = (n: number) => new Date(n * 1000).toLocaleString('zh-CN', { hour12: false });
