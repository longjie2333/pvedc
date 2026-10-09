import { z } from 'zod';

export const gostApiInputSchema = z.object({
  gostApi: z.url().refine(value => {
    try {
      const url = new URL(value), port = Number(url.port || 80);
      return url.protocol === 'http:' && !url.username && !url.password && !url.search && !url.hash && port >= 1 && port <= 65535
        && (url.hostname === 'localhost' || z.ipv4().safeParse(url.hostname).success)
        && /^(\/[A-Za-z0-9_-]+)*\/?$/.test(url.pathname);
    } catch { return false; }
  }, '请输入本机 IPv4 HTTP API 地址，可包含路径前缀'),
  gostUser: z.string().trim().min(1).max(100).refine(value => !/[:\r\n\0]/.test(value), '用户名不能包含冒号或控制字符'),
  gostPassword: z.string().min(1).max(512).refine(value => !/[\r\n\0]/.test(value), '密码不能包含控制字符'),
});
export type GostApiSettings = z.infer<typeof gostApiInputSchema>;
export const gostApiChangeSchema = gostApiInputSchema.extend({ gostPassword: z.union([gostApiInputSchema.shape.gostPassword, z.literal('')]).optional() }).strict();

export function gostEndpoint(address: string) {
  const url = new URL(address);
  const hostname = url.hostname === 'localhost' ? '127.0.0.1' : url.hostname;
  const port = Number(url.port || 80), pathPrefix = url.pathname.replace(/\/$/, '');
  return { hostname, port, pathPrefix, listenAddress: hostname + ':' + port,
    address: 'http://' + hostname + ':' + port + pathPrefix,
    connectUrl: 'http://' + (hostname === '0.0.0.0' ? '127.0.0.1' : hostname) + ':' + port + pathPrefix };
}
