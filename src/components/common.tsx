import type { ComponentProps, ReactNode } from 'react';
import { AlertCircle, CheckCircle2, Inbox, LoaderCircle } from 'lucide-react';
import { Field, FieldLabel, FieldDescription, FieldError } from './ui/field';
import { Input } from './ui/input';
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from './ui/select';
import { Badge } from './ui/badge';
import { Dialog, DialogClose, DialogFooter, DialogHeader, DialogPanel, DialogPopup, DialogTitle, DialogDescription } from './ui/dialog';
import { Button } from './ui/button';
import { Alert, AlertDescription } from './ui/alert';
import { Card, CardAction, CardDescription, CardHeader, CardTitle } from './ui/card';
import { AlertDialog, AlertDialogClose, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogPopup, AlertDialogTitle } from './ui/alert-dialog';
import type { ProfileSummary } from '../../shared/schema';

export function TextField({ label, hint, type = 'text', ...props }: ComponentProps<typeof Input> & { label: string; hint?: string }) {
  return <Field name={props.name}><FieldLabel>{label}</FieldLabel><Input type={type} {...props}/>{hint && <FieldDescription>{hint}</FieldDescription>}<FieldError/></Field>;
}
export function Choice({ label, value, onChange, items, name, disabled }: { label: string; value: string; onChange: (value: string) => void; items: { value: string; label: string; disabled?: boolean }[]; name?: string; disabled?: boolean }) {
  return <Field name={name}><FieldLabel>{label}</FieldLabel><Select items={items} name={name} value={value} onValueChange={v => onChange(String(v ?? ''))} disabled={disabled}><SelectTrigger className="w-full"><SelectValue/></SelectTrigger><SelectPopup>{items.map(item => <SelectItem key={item.value} value={item.value} disabled={item.disabled}>{item.label}</SelectItem>)}</SelectPopup></Select></Field>;
}
export function ProfileChoice({ value, onChange, items }: { value: string; onChange: (value: string) => void; items: ProfileSummary[] }) {
  const options = [{ value: { id: '', name: '使用默认配置', cores: 0, memory: 0, disk: 0, distro: 'debian' as const }, label: '使用默认配置' }, ...items.map(item => ({ value: item, label: item.name }))];
  const selected = options.find(item => item.value.id === value) || options[0];
  const detail = (item: ProfileSummary) => item.id ? `${item.distro.toUpperCase()} · ${item.cores} CPU / ${item.memory} MiB / ${item.disk} GiB` : '由平台默认配置决定';
  return <Field><FieldLabel>资源配置</FieldLabel><Select items={options} value={selected} itemToStringValue={item => item.value.id} onValueChange={item => onChange(item?.value.id || '')}><SelectTrigger className="h-auto min-h-10 py-2"><SelectValue>{(item: typeof selected | null) => item ? <span className="flex flex-col text-left"><span>{item.value.name}</span><span className="text-xs text-muted-foreground">{detail(item.value)}</span></span> : '选择资源配置'}</SelectValue></SelectTrigger><SelectPopup>{options.map(item => <SelectItem key={item.value.id || 'default'} value={item}><span className="flex flex-col"><span>{item.value.name}</span><span className="text-xs text-muted-foreground">{detail(item.value)}</span></span></SelectItem>)}</SelectPopup></Select></Field>;
}
export function Feedback({ error, message }: { error?: string; message?: string }) {
  if (!error && !message) return null;
  return <Alert variant={error ? 'error' : 'success'} role={error ? 'alert' : 'status'}>{error ? <AlertCircle aria-hidden="true"/> : <CheckCircle2 aria-hidden="true"/>}<AlertDescription className="text-foreground">{error || message}</AlertDescription></Alert>;
}
export function Loading() { return <div className="empty"><LoaderCircle className="size-6 animate-spin"/><p>正在读取数据…</p></div>; }
export function Empty({ title = '暂无记录', children }: { title?: string; children?: ReactNode }) { return <div className="empty"><Inbox className="size-8" aria-hidden="true"/><h3>{title}</h3>{children && <p>{children}</p>}</div>; }
export const stateNames: Record<string, string> = { ready: '已就绪', reserved: '已预留', creating: '创建中', configuring: '初始化中', rebuilding: '重建中', deleting: '回收中', failed: '失败', running: '运行中', stopped: '已停止', queued: '排队中', succeeded: '已完成', attention: '需要处理', pending: '待应用', paused: '已暂停', unknown: '状态未知', unavailable: '不可用', listening: '监听中', closed: '已关闭' };
const stateVariants: Record<string, 'success' | 'info' | 'warning' | 'error'> = { ready: 'success', running: 'success', succeeded: 'success', listening: 'success', reserved: 'info', creating: 'info', configuring: 'info', rebuilding: 'info', deleting: 'info', queued: 'info', attention: 'warning', pending: 'warning', paused: 'warning', failed: 'error', unavailable: 'error' };
export function Status({ state }: { state: string }) { return <Badge variant={stateVariants[state] || 'secondary'} className="whitespace-nowrap"><span aria-hidden="true" className="size-1.5 rounded-full bg-current"/>{stateNames[state] || state}</Badge>; }
export function PageTitle({ title, actions }: { title: string; actions?: ReactNode }) {
  return <div className="flex flex-wrap items-center justify-between gap-4"><h1 className="font-semibold text-xl">{title}</h1>{actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}</div>;
}
export function Modal({ open, onClose, title, description, children, footer, destructive = false }: { open: boolean; onClose: () => void; title: string; description: string; children: ReactNode; footer?: ReactNode; destructive?: boolean }) {
  const Root = destructive ? AlertDialog : Dialog, Popup = destructive ? AlertDialogPopup : DialogPopup;
  const Header = destructive ? AlertDialogHeader : DialogHeader, Title = destructive ? AlertDialogTitle : DialogTitle;
  const Description = destructive ? AlertDialogDescription : DialogDescription, Footer = destructive ? AlertDialogFooter : DialogFooter, Close = destructive ? AlertDialogClose : DialogClose;
  return <Root open={open} onOpenChange={v => !v && onClose()}><Popup className="max-w-2xl"><Header><Title>{title}</Title><Description>{description}</Description></Header>{destructive ? <div className="overflow-y-auto px-6 pb-6">{children}</div> : <DialogPanel>{children}</DialogPanel>}<Footer><Close render={<Button variant="ghost"/>}>取消</Close>{footer}</Footer></Popup></Root>;
}
export function Panel({ title, detail, children, action }: { title?: string; detail?: string; children: ReactNode; action?: ReactNode }) {
  return <Card className="min-w-0 overflow-hidden">{title && <CardHeader className="border-b py-4"><CardTitle render={<h2/>} className="text-base">{title}</CardTitle>{detail && <CardDescription>{detail}</CardDescription>}{action && <CardAction className="self-center">{action}</CardAction>}</CardHeader>}{children}</Card>;
}
export const bytes = (n: number) => n >= 1073741824 ? (n / 1073741824).toFixed(1) + ' GiB' : (n / 1048576).toFixed(0) + ' MiB';
export const date = (n: number) => new Date(n * 1000).toLocaleString('zh-CN', { hour12: false });
