import { useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import type { Network, Profile } from '../../../shared/schema';
import type { StorageOption, TemplateOption } from '../../../shared/pve-options';
import { request, useCommand } from '@/lib/api';
import { Choice, FormSection, TextField } from '@/components/common/form-fields';
import { SpecCombobox } from '@/components/common/spec-combobox';
import { SwitchSetting } from '@/components/common/switch-setting';
import { Button } from '@/components/ui/button';
import { EditorDialog, withCurrent } from './editor-dialog';
import { InitialForwardSection, type InitialForwardDraft } from './initial-forward-section';
import { ProfileNicSection } from './profile-nic-section';

export function ProfileEditor({
  profile,
  networks,
  onClose,
}: {
  profile?: Profile;
  networks: Network[];
  onClose: () => void;
}) {
  const command = useCommand();
  const [choice, setChoice] = useState({
    distro: profile?.distro || 'ubuntu',
    template: profile?.template || '',
    storage: profile?.storage || '',
  });
  const [networkIds, setNetworkIds] = useState(profile?.networkIds || (networks[0] ? [networks[0].id] : []));
  const [flags, setFlags] = useState({
    enabled: profile?.enabled !== false,
    published: !!profile?.published,
    nesting: !!profile?.nesting,
  });
  const [forwards, setForwards] = useState<InitialForwardDraft[]>(() =>
    (profile?.initialForwards || []).map(forward => ({
      protocol: forward.protocol,
      targetPort: String(forward.targetPort),
      publicPort: forward.publicPort ? String(forward.publicPort) : '',
      note: forward.note || '',
    })),
  );
  const stores = useQuery({
    queryKey: ['pve-options', 'storages'],
    queryFn: () => request<StorageOption[]>('admin/options/storages'),
  });
  const templates = useQuery({
    queryKey: ['pve-options', 'templates'],
    queryFn: () => request<TemplateOption[]>('admin/options/templates'),
  });
  const templateItems = (templates.data || [])
    .filter(template => template.distro === choice.distro)
    .map(template => ({ value: template.volid, label: template.volid }));
  const storageItems = (stores.data || [])
    .filter(storage => storage.content.includes('rootdir'))
    .map(storage => ({
      value: storage.storage,
      label: storage.storage + ' · ' + (storage.available / 1073741824).toFixed(1) + ' GiB 可用',
    }));
  const valid =
    templateItems.some(item => item.value === choice.template) &&
    storageItems.some(item => item.value === choice.storage) &&
    networkIds.length >= 1 &&
    new Set(networkIds).size === networkIds.length &&
    networkIds.every(id => networks.some(n => n.id === id));
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = {
      ...Object.fromEntries(new FormData(event.currentTarget)),
      ...flags,
      ...choice,
      networkIds,
      initialForwards: forwards.map(forward => ({
        protocol: forward.protocol,
        targetPort: Number(forward.targetPort),
        publicPort: forward.publicPort ? Number(forward.publicPort) : undefined,
        note: forward.note,
      })),
    };
    if (await command.run('admin/profiles' + (profile ? '/' + profile.id : ''), body)) onClose();
  }
  return (
    <EditorDialog
      title={(profile ? '编辑' : '添加') + '资源配置'}
      description="修改仅影响后续分配，已有容器保留创建时的配置。"
      pending={command.pending}
      error={command.error || stores.error?.message || templates.error?.message}
      invalid={!valid}
      onSubmit={save}
      onClose={onClose}
    >
      <FormSection
        legend="系统"
        action={
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label="刷新 PVE 选项"
            title="刷新 PVE 选项"
            loading={templates.isFetching || stores.isFetching}
            onClick={() => {
              void stores.refetch();
              void templates.refetch();
            }}
          >
            <RefreshCw />
          </Button>
        }
      >
        <div className="form-grid">
          <TextField label="配置名称" name="name" defaultValue={profile?.name ?? ''} required />
          <Choice
            label="发行版"
            value={choice.distro}
            onChange={distro => setChoice({ ...choice, distro: distro as Profile['distro'], template: '' })}
            items={[
              { value: 'ubuntu', label: 'Ubuntu' },
              { value: 'debian', label: 'Debian' },
            ]}
          />
          <Choice
            label="模板卷 ID"
            value={choice.template}
            onChange={template => setChoice({ ...choice, template })}
            items={withCurrent(templateItems, choice.template)}
          />
          <Choice
            label="系统盘存储"
            value={choice.storage}
            onChange={storage => setChoice({ ...choice, storage })}
            items={withCurrent(storageItems, choice.storage)}
          />
        </div>
      </FormSection>
      <FormSection legend="规格">
        <div className="form-grid">
          <SpecCombobox
            name="cores"
            label="CPU 核数"
            initial={profile?.cores ?? 2}
            presets={[1, 2, 4, 8, 16]}
            min={1}
            max={128}
          />
          <SpecCombobox
            name="memory"
            label="内存 MiB"
            initial={profile?.memory ?? 2048}
            presets={[512, 1024, 2048, 4096, 8192, 16384]}
            min={256}
            max={1048576}
          />
          <TextField
            label="交换空间 MiB"
            name="swap"
            type="number"
            defaultValue={String(profile?.swap ?? 0)}
            required
          />
          <SpecCombobox
            name="disk"
            label="系统盘 GiB"
            initial={profile?.disk ?? 8}
            presets={[8, 16, 32, 64, 128]}
            min={4}
            max={65536}
          />
        </div>
      </FormSection>
      <ProfileNicSection value={networkIds} onChange={setNetworkIds} networks={networks} />
      <InitialForwardSection value={forwards} onChange={setForwards} />
      <FormSection legend="选项">
        <div className="grid gap-3">
          <SwitchSetting
            label="启用"
            description="允许此规格用于后续资源分配。"
            checked={flags.enabled}
            onChange={enabled => setFlags({ ...flags, enabled })}
          />
          <SwitchSetting
            label="公开发布"
            description="将此规格加入学生可选配置。"
            checked={flags.published}
            onChange={published => setFlags({ ...flags, published })}
          />
          <SwitchSetting
            label="允许容器嵌套"
            description="允许容器内运行 Docker 等嵌套工作负载。"
            checked={flags.nesting}
            onChange={nesting => setFlags({ ...flags, nesting })}
          />
        </div>
      </FormSection>
    </EditorDialog>
  );
}
