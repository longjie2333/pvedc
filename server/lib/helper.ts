import { spawn } from 'node:child_process';
import { AppError } from './errors';
import { meta } from './db';

type HelperRequest = { operation: 'bootstrap' | 'ports'; vmid: number } | { operation: 'password'; vmid: number; password: string } | { operation: 'sdn-lock'; token?: string };
export function helper<T>(request: HelperRequest): Promise<T> {
  return new Promise((resolve, reject) => {
    const child = spawn('sudo', ['-n', '/usr/local/libexec/pvedc-helper'], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    let output = '', settled = false;
    const timeout = setTimeout(() => { child.kill(); finish(new AppError(502, '本机辅助操作超时')); }, request.operation === 'bootstrap' ? 300000 : 30000);
    const finish = (error?: Error) => {
      if (settled) return; settled = true; clearTimeout(timeout);
      if (error) reject(error);
      else { try { resolve(JSON.parse(output)); } catch { reject(new AppError(502, '容器辅助程序返回无效结果')); } }
    };
    child.on('error', () => finish(new AppError(502, '本机辅助程序不可用，请检查部署')));
    child.stdout.on('data', data => { output += data; if (output.length > 1024 * 1024) { child.kill(); finish(new AppError(502, '端口查询结果超过限制')); } });
    child.stderr.resume();
    child.on('close', code => finish(code === 0 ? undefined : new AppError(502, '容器辅助操作失败，请检查容器及系统日志')));
    child.stdin.on('error', () => {});
    child.stdin.end(JSON.stringify({ ...request, instanceId: meta('instance_id') }));
  });
}
