import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Profile, SafeSettings } from '../../shared/schema';
import { request, useCommand } from '@/lib/api';
import { copyText } from '@/lib/feedback';
import { Choice, Feedback, Loading, Panel, TextField } from '@/components/common';
import { SwitchSetting } from '@/components/switch-setting';
import { OtpInput } from '@/components/otp-input';
import { GostApiEditor } from '@/components/gost-api-editor';
import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form';
import { Field, FieldLabel } from '@/components/ui/field';
import { Textarea } from '@/components/ui/textarea';

type SettingGroup = { title: string; fields: [string, string, string?][] };
const platformGroups: SettingGroup[] = [
  { title: '站点与分配策略', fields: [['title', '平台名称'], ['registrationOpen', '开放学生认领与创建', 'boolean'], ['selfSelection', '允许学生自选配置', 'boolean']] },
  { title: 'PVE 连接', fields: [['pveUrl', 'PVE API 地址'], ['pveNode', '节点名称'], ['pveTokenId', 'API Token ID'], ['pveTokenSecret', 'API Token 密钥', 'password'], ['pveCa', 'PVE CA 证书 PEM', 'textarea']] },
  { title: '容量与编号', fields: [['cpuOvercommit', 'CPU 超分比例', 'number'], ['reserveCpu', '宿主保留 CPU', 'number'], ['reserveMemory', '宿主保留内存 MiB', 'number'], ['reserveDisk', '存储保留空间 GiB', 'number'], ['vmidStart', 'VMID 起始值', 'number'], ['vmidEnd', 'VMID 结束值', 'number']] },
];
const forwardingGroups: SettingGroup[] = [
  { title: '公网 Relay + TLS', fields: [['relayHost', 'Relay 主机'], ['relayPort', 'Relay 端口', 'number'], ['relayUser', 'Relay 用户名'], ['relayPassword', 'Relay 密码', 'password'], ['relayServerName', 'TLS 服务名'], ['relayCa', '自定义 CA 证书 PEM（可选）', 'textarea'], ['publicHost', '学生使用的公网主机名']] },
  { title: '公网端口与 Web 通道', fields: [['portStart', '端口池起始值', 'number'], ['portEnd', '端口池结束值', 'number'], ['reservedPorts', '保留端口（逗号分隔）', 'array'], ['forwardQuota', '每人转发规则上限', 'number'], ['publicOrigin', '公网 HTTPS 地址'], ['webBindHost', 'Relay 上的 Web 绑定地址'], ['webTunnelPort', '公网 Web 通道端口', 'number'], ['webLocalPort', 'PVE 本机 Web 端口', 'number']] },
];

export function SettingsEditor({ profiles = [], section = 'platform' }: { profiles?: Profile[]; section?: 'platform' | 'forwarding' }) {
  const settings = useQuery({ queryKey: ['settings'], queryFn: () => request<SafeSettings>('admin/settings') });
  if (settings.isPending) return <Loading/>;
  if (settings.error) return <Feedback error={settings.error.message}/>;
  return <>{section === 'forwarding' && <GostApiEditor initial={settings.data} revision={settings.dataUpdatedAt}/>}<SettingsForm key={section} section={section} initial={settings.data} profiles={profiles}/>{section === 'platform' && <TotpSettings/>}</>;
}

function SettingsForm({ initial, profiles, section }: { initial: SafeSettings; profiles: Profile[]; section: 'platform' | 'forwarding' }) {
  const groups = section === 'platform' ? platformGroups : forwardingGroups;
  const fields = [...groups.flatMap(group => group.fields.map(([key]) => key)), ...(section === 'platform' ? ['defaultProfileId'] : [])];
  const [values, setValues] = useState<Record<string, unknown>>({ ...initial });
  const command = useCommand();
  return <Form onSubmit={async event => {
    event.preventDefault();
    const payload = Object.fromEntries(fields.filter(key => values[key] !== undefined).map(key => [key, values[key]]));
    for (const key of ['pveTokenSecret', 'gostPassword', 'relayPassword']) if (payload[key] === '') delete payload[key];
    const saved = await command.run<SafeSettings>('admin/settings', payload, 'PUT');
    if (saved) setValues({ ...saved });
  }} className="flex flex-col gap-5">
    <Feedback error={command.error}/>
    {groups.map((group, index) => <Panel key={group.title} title={group.title}>
      <div className="form-grid p-6">
        {section === 'platform' && index === 0 && <Choice label="默认资源配置（必须）" value={String(values.defaultProfileId || '')} onChange={value => setValues({ ...values, defaultProfileId: value || null })} items={[{ value: '', label: '请选择默认配置' }, ...profiles.filter(profile => profile.enabled && profile.published).map(profile => ({ value: profile.id, label: profile.name }))]}/>}
        {group.fields.filter(([, , type]) => type !== 'boolean').map(([key, label, type]) => type === 'textarea'
          ? <Field key={key} className="col-span-full"><FieldLabel>{label}</FieldLabel><Textarea rows={4} className="mono text-xs" value={String(values[key] || '')} onChange={event => setValues({ ...values, [key]: event.target.value })}/></Field>
          : <TextField key={key} label={label} type={type === 'password' ? 'password' : type === 'number' ? 'number' : 'text'}
              value={type === 'array' ? (values[key] as number[]).join(', ') : String(values[key] ?? '')}
              hint={type === 'password' && initial.secrets[key as keyof SafeSettings['secrets']] ? '已配置；留空保留现有凭据' : undefined}
              onChange={event => setValues({ ...values, [key]: type === 'number' ? Number(event.target.value) : type === 'array' ? event.target.value.split(/[\s,]+/).filter(Boolean).map(Number) : event.target.value })}/>) }
      </div>
      {group.fields.some(([, , type]) => type === 'boolean') && <section aria-label="开关设置" className="grid gap-3 border-t p-6">
        {group.fields.filter(([, , type]) => type === 'boolean').map(([key, label]) => <SwitchSetting key={key} label={label}
          description={key === 'registrationOpen' ? '开放后，名单内学生可以认领并创建计算资源。' : '未被指定配置的学生可以自行选择已发布的规格。'}
          checked={!!values[key]} onChange={value => setValues({ ...values, [key]: value })}/>)}
      </section>}
    </Panel>)}
    <div className="sticky-actions"><span>配置保存在本机数据库中</span><Button type="submit" loading={command.pending}>{section === 'platform' ? '保存平台设置' : '保存公网配置'}</Button></div>
  </Form>;
}

function TotpSettings() {
  const [rotation, setRotation] = useState<{ secret: string; qr: string }>();
  const command = useCommand();
  return <Panel title="管理员身份验证" detail="重新绑定会撤销已有管理员会话；请保存新密钥。">
    <Form className="flex max-w-lg flex-col gap-4 p-6" onSubmit={async event => {
      event.preventDefault();
      const code = new FormData(event.currentTarget).get('code');
      if (rotation) { if (await command.run('auth/rotate-complete', { code })) setRotation(undefined); }
      else { const result = await command.run<{ secret: string; qr: string }>('auth/rotate-begin', { code }); if (result) setRotation(result); }
    }}>
      {rotation && <div className="setup-secret"><img src={rotation.qr} alt="新的 TOTP 二维码"/><code>{rotation.secret}</code><Button type="button" variant="outline" onClick={() => copyText(rotation.secret, '新密钥')}>复制新密钥</Button></div>}
      <OtpInput key={rotation ? 'new' : 'current'} label={rotation ? '新密钥验证码' : '当前验证码'} disabled={command.pending} error={command.error}/>
      <Button type="submit" loading={command.pending}>{rotation ? '确认新密钥' : '重新绑定 TOTP'}</Button>
    </Form>
  </Panel>;
}
