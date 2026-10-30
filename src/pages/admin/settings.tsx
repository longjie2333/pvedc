import { useAdminOverview, useSettings } from '@/lib/queries';
import { Feedback, Loading } from '@/components/common/feedback';
import { SettingsForm, type SettingGroup } from '@/components/settings/settings-form';
import { TotpSettings } from '@/components/settings/totp-settings';

const groups: SettingGroup[] = [
  {
    title: '站点与分配策略',
    fields: [
      { key: 'defaultProfileId', label: '默认资源配置（必须）', type: 'profile' },
      { key: 'title', label: '平台名称' },
      {
        key: 'registrationOpen',
        label: '开放学生认领与创建',
        type: 'boolean',
        description: '开放后，名单内学生可以认领并创建计算资源。',
      },
      {
        key: 'selfSelection',
        label: '允许学生自选配置',
        type: 'boolean',
        description: '未被指定配置的学生可以自行选择已发布的规格。',
      },
    ],
  },
  {
    title: 'PVE 连接',
    fields: [
      { key: 'pveUrl', label: 'PVE API 地址' },
      { key: 'pveNode', label: '节点名称' },
      { key: 'pveTokenId', label: 'API Token ID' },
      { key: 'pveTokenSecret', label: 'API Token 密钥', type: 'password' },
      { key: 'pveCa', label: 'PVE CA 证书 PEM', type: 'textarea' },
    ],
  },
  {
    title: '容量估算与编号',
    detail: '保留值与超分比例用于生成「预计还可分配」估算，不限制创建数量；编号范围仍决定可用 VMID。',
    fields: [
      { key: 'cpuOvercommit', label: 'CPU 超分比例', type: 'number' },
      { key: 'reserveCpu', label: '宿主保留 CPU', type: 'number' },
      { key: 'reserveMemory', label: '宿主保留内存 MiB', type: 'number' },
      { key: 'reserveDisk', label: '存储保留空间 GiB', type: 'number' },
      { key: 'vmidStart', label: 'VMID 起始值', type: 'number' },
      { key: 'vmidEnd', label: 'VMID 结束值', type: 'number' },
    ],
  },
];

export function SettingsPage() {
  const overview = useAdminOverview(),
    settings = useSettings();
  if (overview.isPending || settings.isPending) return <Loading />;
  if (overview.error || settings.error) return <Feedback error={(overview.error || settings.error)?.message} />;
  return (
    <>
      <SettingsForm
        initial={settings.data}
        groups={groups}
        profiles={overview.data.profiles}
        submitLabel="保存平台设置"
      />
      <TotpSettings />
    </>
  );
}
