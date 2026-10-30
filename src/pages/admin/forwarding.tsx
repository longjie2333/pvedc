import { useCommand } from '@/lib/api';
import { useAdminOverview, useSettings } from '@/lib/queries';
import { Feedback, Loading } from '@/components/common/feedback';
import { ForwardPanel } from '@/components/forward/forward-panel';
import { GostApiEditor } from '@/components/gost/gost-api-editor';
import { SettingsForm, type SettingGroup } from '@/components/settings/settings-form';
import { Button } from '@/components/ui/button';

const groups: SettingGroup[] = [
  {
    title: '公网 Relay + TLS',
    fields: [
      { key: 'relayHost', label: 'Relay 主机' },
      { key: 'relayPort', label: 'Relay 端口', type: 'number' },
      { key: 'relayUser', label: 'Relay 用户名' },
      { key: 'relayPassword', label: 'Relay 密码', type: 'password' },
      { key: 'relayServerName', label: 'TLS 服务名' },
      { key: 'relayCa', label: '自定义 CA 证书 PEM（可选）', type: 'textarea' },
      { key: 'publicHost', label: '学生使用的公网主机名' },
    ],
  },
  {
    title: '公网端口与 Web 通道',
    fields: [
      { key: 'portStart', label: '端口池起始值', type: 'number' },
      { key: 'portEnd', label: '端口池结束值', type: 'number' },
      { key: 'reservedPorts', label: '保留端口（逗号分隔）', type: 'array' },
      { key: 'forwardQuota', label: '每人转发规则上限', type: 'number' },
      { key: 'publicOrigin', label: '公网 HTTPS 地址' },
      { key: 'webBindHost', label: 'Relay 上的 Web 绑定地址' },
      { key: 'webTunnelPort', label: '公网 Web 通道端口', type: 'number' },
      { key: 'webLocalPort', label: 'PVE 本机 Web 端口', type: 'number' },
    ],
  },
];

export function ForwardingPage() {
  const overview = useAdminOverview(),
    settings = useSettings(),
    apply = useCommand();
  if (overview.isPending || settings.isPending) return <Loading />;
  if (overview.error || settings.error) return <Feedback error={(overview.error || settings.error)?.message} />;
  return (
    <>
      <GostApiEditor initial={settings.data} revision={settings.dataUpdatedAt} />
      <SettingsForm
        initial={settings.data}
        groups={groups}
        submitLabel="保存公网配置"
        error={apply.error}
        actions={
          <Button loading={apply.pending} onClick={() => apply.run('admin/gost/apply')} variant="outline">
            应用 gost 配置
          </Button>
        }
      />
      <ForwardPanel admin rules={overview.data.forwards} publicHost={settings.data.publicHost || ''} />
    </>
  );
}
