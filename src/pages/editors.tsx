import { useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Network, Profile, SafeSettings, Student } from '../../shared/schema';
import { request, useCommand } from '@/lib/api';
import { Choice, Feedback, Loading, Modal, Panel, TextField } from '@/components/common';
import { Form } from '@/components/ui/form';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Field, FieldLabel } from '@/components/ui/field';

export function CatalogEditor({ kind, item, profiles, networks, onClose }: { kind: 'students' | 'profiles' | 'networks'; item?: Student | Profile | Network; profiles: Profile[]; networks: Network[]; onClose: () => void }) {
  const command = useCommand();
  const initial = item as unknown as Record<string, unknown> | undefined;
  const [choice, setChoice] = useState({ profileId: String(initial?.profileId || ''), networkId: String(initial?.networkId || networks[0]?.id || ''), mode: String(initial?.mode || 'nat'), distro: String(initial?.distro || 'ubuntu') });
  const [flags, setFlags] = useState({ enabled: initial?.enabled !== false, published: !!initial?.published, nesting: !!initial?.nesting });
  const fields = (name: string, label: string, fallback = '', type = 'text', required = true) => <TextField key={name} label={label} name={name} type={type} defaultValue={String(initial?.[name] ?? fallback)} required={required} disabled={kind === 'students' && name === 'id' && !!item}/>;
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values: Record<string, unknown> = Object.fromEntries(new FormData(event.currentTarget));
    if (kind === 'students') { values.id = item?.id || values.id; values.profileId = choice.profileId || null; values.enabled = flags.enabled; }
    if (kind === 'profiles') Object.assign(values, { ...flags, networkId: choice.networkId, distro: choice.distro });
    if (kind === 'networks') {
      values.mode = choice.mode; values.vlan = values.vlan ? Number(values.vlan) : null;
      values.dns = String(values.dns).split(/[\s,]+/).filter(Boolean); values.excluded = String(values.excluded || '').split(/[\s,]+/).filter(Boolean);
    }
    if (await command.run('admin/' + kind + (item && kind !== 'students' ? '/' + item.id : ''), values)) onClose();
  }
  const name = { students: '学生', profiles: '资源配置', networks: '网络与地址池' }[kind];
  return <Modal open onClose={onClose} title={(item ? '编辑' : '添加') + name} description={kind === 'profiles' ? '修改仅影响后续分配，已有容器保留创建时的配置。' : kind === 'networks' ? '保存后点击应用网络，验证并配置实际网络。' : '名单指定的配置优先于默认及学生自选配置。'} footer={<Button form="catalog-editor" type="submit" loading={command.pending}>保存</Button>}><Form id="catalog-editor" className="form-grid" onSubmit={save}><div className="col-span-full"><Feedback error={command.error}/></div>
  {kind === 'students' && <>{fields('id', '学号')}{fields('name', '姓名')}{fields('className', '班级', '', 'text', false)}<Choice label="指定配置" value={choice.profileId} onChange={v => setChoice({ ...choice, profileId: v })} items={[{ value: '', label: '不指定，遵循平台分配规则' }, ...profiles.map(p => ({ value: p.id, label: p.name }))]}/></>}
  {kind === 'profiles' && <>{fields('name', '配置名称')}<Choice label="发行版" value={choice.distro} onChange={v => setChoice({ ...choice, distro: v })} items={[{ value: 'ubuntu', label: 'Ubuntu' }, { value: 'debian', label: 'Debian' }]}/>{fields('template', '模板卷 ID', 'local:vztmpl/ubuntu-24.04-standard_24.04-2_amd64.tar.zst')}{fields('storage', '系统盘存储', 'local-lvm')}{fields('cores', 'CPU 核数', '2', 'number')}{fields('memory', '内存 MiB', '2048', 'number')}{fields('swap', '交换空间 MiB', '0', 'number')}{fields('disk', '系统盘 GiB', '8', 'number')}<Choice label="网络配置" value={choice.networkId} onChange={v => setChoice({ ...choice, networkId: v })} items={networks.map(n => ({ value: n.id, label: n.name + (n.ready ? '' : '（待应用）') }))}/><label className="switch-label"><Switch checked={flags.published} onCheckedChange={v => setFlags({ ...flags, published: v })}/>公开发布</label><label className="switch-label"><Switch checked={flags.nesting} onCheckedChange={v => setFlags({ ...flags, nesting: v })}/>允许容器嵌套</label></>}
  {kind === 'networks' && <>{fields('name', '网络名称')}<Choice label="网络模式" value={choice.mode} onChange={v => setChoice({ ...choice, mode: v })} items={[{ value: 'nat', label: '独立私网 + NAT' }, { value: 'bridge', label: '桥接现有网络' }]}/>{fields('bridge', choice.mode === 'nat' ? '新建 VNet 名称' : '现有网桥名称', choice.mode === 'nat' ? 'dcnet' : 'vmbr0')}{fields('cidr', '子网 CIDR', '172.20.0.0/24')}{fields('gateway', '网关', '172.20.0.1')}{fields('start', '起始 IP', '172.20.0.10')}{fields('end', '结束 IP', '172.20.0.200')}<TextField label="DNS（逗号分隔）" name="dns" required defaultValue={(initial?.dns as string[] | undefined)?.join(', ') || '223.5.5.5, 1.1.1.1'}/><TextField label="排除 IP（逗号分隔）" name="excluded" defaultValue={(initial?.excluded as string[] | undefined)?.join(', ') || ''}/>{choice.mode === 'bridge' && fields('vlan', 'VLAN（可留空）', '', 'number', false)}</>}
  {kind !== 'networks' && <label className="switch-label"><Switch checked={flags.enabled} onCheckedChange={v => setFlags({ ...flags, enabled: v })}/>启用</label>}
  </Form></Modal>;
}

const groups: { title: string; fields: [string, string, string?][] }[] = [
  { title: '站点与分配策略', fields: [['title', '平台名称'], ['publicOrigin', '公网 HTTPS 地址'], ['registrationOpen', '开放学生认领与创建', 'boolean'], ['selfSelection', '允许学生自选配置', 'boolean']] },
  { title: 'PVE 连接', fields: [['pveUrl', 'PVE API 地址'], ['pveNode', '节点名称'], ['pveTokenId', 'API Token ID'], ['pveTokenSecret', 'API Token 密钥', 'password'], ['pveCa', 'PVE CA 证书 PEM', 'textarea']] },
  { title: '容量与编号', fields: [['cpuOvercommit', 'CPU 超分比例', 'number'], ['reserveCpu', '宿主保留 CPU', 'number'], ['reserveMemory', '宿主保留内存 MiB', 'number'], ['reserveDisk', '存储保留空间 GiB', 'number'], ['vmidStart', 'VMID 起始值', 'number'], ['vmidEnd', 'VMID 结束值', 'number']] },
  { title: '本机 gost API', fields: [['gostApi', 'API 地址'], ['gostUser', 'API 用户名'], ['gostPassword', 'API 密码', 'password']] },
  { title: '公网 Relay + TLS', fields: [['relayHost', 'Relay 主机'], ['relayPort', 'Relay 端口', 'number'], ['relayUser', 'Relay 用户名'], ['relayPassword', 'Relay 密码', 'password'], ['relayServerName', 'TLS 服务名'], ['relayCa', '自定义 CA 证书 PEM（可选）', 'textarea'], ['publicHost', '学生使用的公网主机名']] },
  { title: '公网端口与 Web 通道', fields: [['portStart', '端口池起始值', 'number'], ['portEnd', '端口池结束值', 'number'], ['reservedPorts', '保留端口（逗号分隔）', 'array'], ['forwardQuota', '每人转发规则上限', 'number'], ['webBindHost', '公网 Web 绑定地址（反代在 Docker 中时填网关地址）'], ['webTunnelPort', '公网 Web 通道端口', 'number'], ['webLocalPort', 'PVE 本机 Web 端口', 'number']] },
];
export function SettingsEditor({ profiles }: { profiles: Profile[] }) {
  const settings = useQuery({ queryKey: ['settings'], queryFn: () => request<SafeSettings>('admin/settings') });
  if (settings.isPending) return <Loading/>;
  if (settings.error) return <Feedback error={settings.error.message}/>;
  return <SettingsForm key={settings.dataUpdatedAt} initial={settings.data} profiles={profiles}/>;
}
function SettingsForm({ initial, profiles }: { initial: SafeSettings; profiles: Profile[] }) {
  const [values, setValues] = useState<Record<string, unknown>>({ ...initial });
  const [rotation, setRotation] = useState<{ secret: string; qr: string }>();
  const command = useCommand();
  return <><Form id="settings-form" onSubmit={async event => { event.preventDefault(); const payload = { ...values }; delete payload.secrets; for (const key of ['pveTokenSecret', 'gostPassword', 'relayPassword']) if (payload[key] === '') delete payload[key]; await command.run('admin/settings', payload, 'PUT'); }} className="flex flex-col gap-5"><Feedback {...command}/>{groups.map((group, index) => <Panel key={group.title} title={group.title}><div className="form-grid p-6">{index === 0 && <Choice label="默认资源配置（必须）" value={String(values.defaultProfileId || '')} onChange={v => setValues({ ...values, defaultProfileId: v || null })} items={[{ value: '', label: '请选择默认配置' }, ...profiles.filter(p => p.enabled && p.published).map(p => ({ value: p.id, label: p.name }))]}/>} {group.fields.map(([key, label, type]) => type === 'boolean' ? <label key={key} className="switch-label"><Switch checked={!!values[key]} onCheckedChange={v => setValues({ ...values, [key]: v })}/>{label}</label> : type === 'textarea' ? <Field key={key} className="col-span-full"><FieldLabel>{label}</FieldLabel><Textarea rows={4} className="mono text-xs" value={String(values[key] || '')} onChange={e => setValues({ ...values, [key]: e.target.value })}/></Field> : <TextField key={key} label={label} type={type === 'password' ? 'password' : type === 'number' ? 'number' : 'text'} value={type === 'array' ? (values[key] as number[]).join(', ') : String(values[key] ?? '')} hint={type === 'password' && initial.secrets[key as keyof SafeSettings['secrets']] ? '已配置；留空保留现有凭据' : undefined} onChange={e => setValues({ ...values, [key]: type === 'number' ? Number(e.target.value) : type === 'array' ? e.target.value.split(/[\s,]+/).filter(Boolean).map(Number) : e.target.value })}/>)}</div></Panel>)}<div className="sticky-actions"><span>配置保存在本机数据库中</span><Button type="submit" loading={command.pending}>保存平台设置</Button></div></Form><Panel title="管理员身份验证" detail="重新绑定会撤销已有管理员会话；请保存新密钥。"><Form className="flex flex-col gap-4 p-6 max-w-lg" onSubmit={async e => { e.preventDefault(); const code = new FormData(e.currentTarget).get('code'); if (rotation) { if (await command.run('auth/rotate-complete', { code })) setRotation(undefined); } else { const result = await command.run<{ secret: string; qr: string }>('auth/rotate-begin', { code }); if (result) setRotation(result); } }}>
  {rotation && <div className="setup-secret"><img src={rotation.qr} alt="新的 TOTP 二维码"/><code>{rotation.secret}</code></div>}<TextField name="code" label={rotation ? '新密钥验证码' : '当前验证码'} pattern="[0-9]{6}" required inputMode="numeric"/><Button type="submit" loading={command.pending}>{rotation ? '确认新密钥' : '重新绑定 TOTP'}</Button></Form></Panel></>;
}
