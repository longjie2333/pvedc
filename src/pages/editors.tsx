import { useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Network, Profile, Student } from '../../shared/schema';
import { useCommand } from '@/lib/api';
import { Choice, Feedback, Modal, TextField } from '@/components/common';
import { Form } from '@/components/ui/form';
import { Button } from '@/components/ui/button';
import { SwitchSetting } from '@/components/switch-setting';

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
  return <Modal open onClose={onClose} title={(item ? '编辑' : '添加') + name} description={kind === 'profiles' ? '修改仅影响后续分配，已有容器保留创建时的配置。' : kind === 'networks' ? '保存后点击应用网络，验证并配置实际网络。' : '名单指定的配置优先于默认及学生自选配置。'} footer={<Button form="catalog-editor" type="submit" loading={command.pending}>保存</Button>}><Form id="catalog-editor" className="flex flex-col gap-5" onSubmit={save}><Feedback error={command.error}/><div className="form-grid">
  {kind === 'students' && <>{fields('id', '学号')}{fields('name', '姓名')}{fields('className', '班级', '', 'text', false)}<Choice label="指定配置" value={choice.profileId} onChange={v => setChoice({ ...choice, profileId: v })} items={[{ value: '', label: '不指定，遵循平台分配规则' }, ...profiles.map(p => ({ value: p.id, label: p.name }))]}/></>}
  {kind === 'profiles' && <>{fields('name', '配置名称')}<Choice label="发行版" value={choice.distro} onChange={v => setChoice({ ...choice, distro: v })} items={[{ value: 'ubuntu', label: 'Ubuntu' }, { value: 'debian', label: 'Debian' }]}/>{fields('template', '模板卷 ID', 'local:vztmpl/ubuntu-24.04-standard_24.04-2_amd64.tar.zst')}{fields('storage', '系统盘存储', 'local-lvm')}{fields('cores', 'CPU 核数', '2', 'number')}{fields('memory', '内存 MiB', '2048', 'number')}{fields('swap', '交换空间 MiB', '0', 'number')}{fields('disk', '系统盘 GiB', '8', 'number')}<Choice label="网络配置" value={choice.networkId} onChange={v => setChoice({ ...choice, networkId: v })} items={networks.map(n => ({ value: n.id, label: n.name + (n.ready ? '' : '（待应用）') }))}/></>}
  {kind === 'networks' && <>{fields('name', '网络名称')}<Choice label="网络模式" value={choice.mode} onChange={v => setChoice({ ...choice, mode: v })} items={[{ value: 'nat', label: '独立私网 + NAT' }, { value: 'bridge', label: '桥接现有网络' }]}/>{fields('bridge', choice.mode === 'nat' ? '新建 VNet 名称' : '现有网桥名称', choice.mode === 'nat' ? 'dcnet' : 'vmbr0')}{fields('cidr', '子网 CIDR', '172.20.0.0/24')}{fields('gateway', '网关', '172.20.0.1')}{fields('start', '起始 IP', '172.20.0.10')}{fields('end', '结束 IP', '172.20.0.200')}<TextField label="DNS（逗号分隔）" name="dns" required defaultValue={(initial?.dns as string[] | undefined)?.join(', ') || '223.5.5.5, 1.1.1.1'}/><TextField label="排除 IP（逗号分隔）" name="excluded" defaultValue={(initial?.excluded as string[] | undefined)?.join(', ') || ''}/>{choice.mode === 'bridge' && fields('vlan', 'VLAN（可留空）', '', 'number', false)}</>}
  </div>{kind !== 'networks' && <section aria-label="开关设置" className="grid gap-3"><SwitchSetting label="启用" description={kind === 'students' ? '允许此学生登录和认领资源。' : '允许此规格用于后续资源分配。'} checked={flags.enabled} onChange={v => setFlags({ ...flags, enabled: v })}/>{kind === 'profiles' && <><SwitchSetting label="公开发布" description="将此规格加入学生可选配置。" checked={flags.published} onChange={v => setFlags({ ...flags, published: v })}/><SwitchSetting label="允许容器嵌套" description="允许容器内运行 Docker 等嵌套工作负载。" checked={flags.nesting} onChange={v => setFlags({ ...flags, nesting: v })}/></>}</section>}
  </Form></Modal>;
}
