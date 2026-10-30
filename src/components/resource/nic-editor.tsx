import type { ReactNode } from 'react';
import type { Network } from '../../../shared/schema';
import type { MacMode, NicDraft } from '@/lib/machine-adjust';
import { BridgeField, useBridgeOptions } from '@/components/catalog/bridge-options';
import { Choice, TextField } from '@/components/common/form-fields';
import { Badge } from '@/components/ui/badge';

/** One NIC of the adjust dialog. `actions` holds the caller's reorder and remove buttons. */
export function NicEditor({
  draft,
  primary,
  networks,
  onChange,
  actions,
}: {
  draft: NicDraft;
  primary: boolean;
  networks: Network[];
  onChange: (patch: Partial<NicDraft>) => void;
  actions: ReactNode;
}) {
  const { items } = useBridgeOptions(draft.source === 'custom');
  const networkName = networks.find(network => network.id === draft.networkId)?.name || '已删除网络';
  return (
    <section aria-label={'网卡 ' + draft.iface} className="rounded-xl border">
      <header className="flex items-center gap-2 border-b px-4 py-2">
        <span className="font-mono font-medium text-sm">{draft.iface}</span>
        {primary && <Badge variant="secondary">主网卡</Badge>}
        <span className="ms-2 min-w-0 flex-1 truncate text-muted-foreground text-xs">
          {draft.source === 'custom'
            ? '不占用地址池'
            : draft.networkId
              ? '使用 ' + networkName + ' 的地址池，未移动的网卡保留当前地址'
              : ''}
        </span>
        {actions}
      </header>
      <div className="form-grid p-4">
        <Choice
          label="配置模式"
          value={draft.source}
          onChange={value => onChange({ source: value as NicDraft['source'] })}
          items={[
            { value: 'existing', label: '使用已有网络配置' },
            { value: 'custom', label: '自定义配置' },
          ]}
        />
        {draft.source === 'existing' ? (
          <Choice
            label="网络配置"
            value={draft.networkId}
            onChange={networkId => onChange({ networkId })}
            items={[
              { value: '', label: '请选择' },
              ...networks.map(network => ({
                value: network.id,
                label: network.name + (network.ready ? '' : '（待应用）'),
              })),
            ]}
          />
        ) : (
          <>
            <BridgeField
              label="网桥 / VNet"
              value={draft.bridge}
              onChange={bridge => onChange({ bridge })}
              items={[{ value: '', label: '请选择' }, ...items]}
            />
            <TextField
              label="子网 CIDR"
              value={draft.cidr}
              onChange={event => onChange({ cidr: event.target.value })}
              placeholder="192.168.10.0/24"
              required
            />
            <TextField
              label="IP 地址"
              value={draft.ip}
              onChange={event => onChange({ ip: event.target.value })}
              placeholder="192.168.10.20"
              required
            />
            {primary && (
              <>
                <TextField
                  label="网关"
                  value={draft.gateway}
                  onChange={event => onChange({ gateway: event.target.value })}
                  placeholder="192.168.10.1"
                />
                <TextField
                  label="DNS（逗号分隔）"
                  value={draft.dns}
                  onChange={event => onChange({ dns: event.target.value })}
                  placeholder="223.5.5.5"
                />
              </>
            )}
            <TextField
              label="VLAN（可留空）"
              type="number"
              value={draft.vlan}
              onChange={event => onChange({ vlan: event.target.value })}
            />
          </>
        )}
        <Choice
          label="MAC 地址"
          value={draft.macMode}
          onChange={value => onChange({ macMode: value as MacMode })}
          items={[
            { value: 'keep', label: '保持当前 MAC' },
            { value: 'set', label: '指定新 MAC' },
            { value: 'auto', label: '留空由 PVE 自动分配' },
          ]}
        />
        {draft.macMode === 'set' && (
          <TextField
            label="新 MAC 地址"
            value={draft.mac}
            onChange={event => onChange({ mac: event.target.value })}
            placeholder="AA:BB:CC:DD:EE:FF"
            required
          />
        )}
      </div>
    </section>
  );
}
