import { useState } from 'react';
import type { SafeSettings } from '../../shared/schema';
import { useCommand } from '@/lib/api';
import { Feedback, Panel, TextField } from './common';
import { Form } from './ui/form';
import { Button } from './ui/button';
import { GostCredentials } from './gost-credentials';

export function GostApiEditor({ initial, revision }: { initial: SafeSettings; revision: number }) {
  const [values, setValues] = useState({ gostApi: initial.gostApi, gostUser: initial.gostUser, gostPassword: '' });
  const command = useCommand();
  return <Panel title="本机 gost API" detail="同步会重启 gost，连接验证通过后更新平台配置；失败时恢复原接口。">
    <Form className="flex flex-col gap-4 p-6" onSubmit={async event => {
      event.preventDefault();
      if (await command.run('admin/gost/api', values)) setValues(previous => ({ ...previous, gostPassword: '' }));
    }}>
      <p className="text-sm text-muted-foreground">当前生效地址：{initial.gostApi} · 用户：{initial.gostUser}</p>
      <div className="form-grid">
        <TextField label="API 地址" required value={values.gostApi} onChange={event => setValues({ ...values, gostApi: event.target.value })}/>
        <TextField label="API 用户名" required value={values.gostUser} onChange={event => setValues({ ...values, gostUser: event.target.value })}/>
        <TextField label="API 密码" type="password" autoComplete="new-password" hint="留空保留宿主机当前 API 密码" value={values.gostPassword} onChange={event => setValues({ ...values, gostPassword: event.target.value })}/>
      </div>
      <Feedback error={command.error}/>
      <div><Button type="submit" loading={command.pending}>保存并同步到宿主机</Button></div>
    </Form>
    <GostCredentials key={revision}/>
  </Panel>;
}
