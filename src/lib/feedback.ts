import { toastManager } from '@/components/ui/toast';

export async function copyText(value: string, label = '内容') {
  try {
    await navigator.clipboard.writeText(value);
    toastManager.add({ id: 'clipboard', type: 'success', title: label + '已复制' });
  } catch {
    toastManager.add({ id: 'clipboard', type: 'error', title: '复制失败', description: '浏览器未允许访问剪贴板，请手动选择并复制。' });
  }
}

export function commandFeedback(path: string, result: unknown) {
  const data = result as { taskId?: string; count?: number } | null;
  if (data?.taskId) {
    toastManager.add({ id: 'task:' + data.taskId, type: 'info', title: '任务已提交', description: '任务在后台继续执行，可在任务记录查看进度。' });
    window.dispatchEvent(new CustomEvent('pvedc:task-submitted', { detail: { id: data.taskId, scope: path.startsWith('admin/') ? 'admin' : 'me' } }));
    return;
  }
  const title = path === 'auth/logout' ? '已退出登录'
    : path === 'auth/admin' || path === 'auth/student' ? '登录成功'
    : path === 'setup/complete' || path === 'auth/rotate-complete' ? '身份验证器绑定成功'
    : path === 'auth/rotate-begin' ? '请保存新密钥并完成验证'
    : path.endsWith('/import') ? '名单导入完成' : '操作已完成';
  toastManager.add({ type: 'success', title, description: typeof data?.count === 'number' ? '已处理 ' + data.count + ' 条记录。' : undefined });
}
