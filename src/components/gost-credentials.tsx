import { useState } from 'react';
import { request } from '@/lib/api';
import { copyText } from '@/lib/feedback';
import { Button } from './ui/button';
import { toastManager } from './ui/toast';
import { TextField } from './common';

export function GostCredentials() {
  const [authorization, setAuthorization] = useState(''), [pending, setPending] = useState(false);
  async function read(copy = false) {
    setPending(true);
    try {
      const result = await request<{ authorization: string }>('admin/gost/authorization');
      const header = 'Authorization: ' + result.authorization;
      if (copy) await copyText(header, 'API 调用凭据');
      else setAuthorization(header);
    } catch (error) {
      toastManager.add({ type: 'error', title: '读取调用凭据失败', description: error instanceof Error ? error.message : '请稍后重试' });
    } finally { setPending(false); }
  }
  return <section className="flex flex-col gap-3 border-t p-6" aria-label="API 调用凭据">
    <p className="text-sm text-muted-foreground">使用当前生效的用户名和密码生成 Authorization 请求头。Basic Auth 是 Base64 编码。</p>
    <div className="flex flex-wrap gap-2">
      <Button type="button" variant="outline" loading={pending} onClick={() => void read()}>显示调用凭据</Button>
      <Button type="button" variant="outline" loading={pending} onClick={() => void read(true)}>复制调用凭据</Button>
      {authorization && <Button type="button" variant="ghost" onClick={() => setAuthorization('')}>隐藏凭据</Button>}
    </div>
    {authorization && <TextField label="Authorization 请求头" readOnly value={authorization} className="mono text-xs"/>}
  </section>;
}
