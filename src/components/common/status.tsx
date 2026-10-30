import { Badge } from '@/components/ui/badge';

export const stateNames: Record<string, string> = {
  ready: '已就绪',
  reserved: '已预留',
  creating: '创建中',
  configuring: '初始化中',
  rebuilding: '重建中',
  deleting: '回收中',
  failed: '失败',
  running: '运行中',
  stopped: '已停止',
  queued: '排队中',
  succeeded: '已完成',
  attention: '需要处理',
  pending: '待应用',
  paused: '已暂停',
  unknown: '状态未知',
  unavailable: '不可用',
  listening: '监听中',
  closed: '已关闭',
};
const stateVariants: Record<string, 'success' | 'info' | 'warning' | 'error'> = {
  ready: 'success',
  running: 'success',
  succeeded: 'success',
  listening: 'success',
  reserved: 'info',
  creating: 'info',
  configuring: 'info',
  rebuilding: 'info',
  deleting: 'info',
  queued: 'info',
  attention: 'warning',
  pending: 'warning',
  paused: 'warning',
  failed: 'error',
  unavailable: 'error',
};

export function Status({ state }: { state: string }) {
  return (
    <Badge variant={stateVariants[state] || 'secondary'} className="whitespace-nowrap">
      <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
      {stateNames[state] || state}
    </Badge>
  );
}
