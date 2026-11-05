import { useState, type FormEvent } from 'react';
import type { Network } from '../../../shared/schema';
import { useCommand } from '@/lib/api';
import { Choice, FormSection, TextField } from '@/components/common/form-fields';
import { BridgeField, useBridgeOptions } from './bridge-options';
import { EditorDialog, withCurrent } from './editor-dialog';

const list = (value: FormDataEntryValue | undefined) =>
  String(value || '')
    .split(/[\s,]+/)
    .filter(Boolean);

export function NetworkEditor({ network, onClose }: { network?: Network; onClose: () => void }) {
  const command = useCommand();
  const [mode, setMode] = useState(network?.mode || 'nat'),
    [bridge, setBridge] = useState(network?.bridge || '');
  const { query: bridges, items: bridgeItems } = useBridgeOptions(mode === 'bridge');
  const vlanAware = mode === 'bridge' && bridges.data?.find(option => option.iface === bridge)?.vlanAware;
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    const body = {
      ...values,
      mode,
      ...(mode === 'bridge' ? { bridge } : {}),
      vlan: values.vlan ? Number(values.vlan) : null,
      dns: list(values.dns),
      excluded: list(values.excluded),
    };
    if (await command.run('admin/networks' + (network ? '/' + network.id : ''), body)) onClose();
  }
  return (
    <EditorDialog
      title={(network ? '编辑' : '添加') + '网络与地址池'}
      description="保存后点击应用网络，验证并配置实际网络。"
      pending={command.pending}
      error={command.error || bridges.error?.message}
      invalid={mode === 'bridge' && !bridgeItems.some(item => item.value === bridge)}
      onSubmit={save}
      onClose={onClose}
    >
      <FormSection legend="网络">
        <div className="form-grid">
          <TextField label="网络名称" name="name" defaultValue={network?.name ?? ''} required />
          <Choice
            label="网络模式"
            value={mode}
            onChange={value => {
              setMode(value as Network['mode']);
              setBridge('');
            }}
            items={[
              { value: 'nat', label: '独立私网 + NAT' },
              { value: 'bridge', label: '桥接现有网络' },
            ]}
          />
          {mode === 'nat' ? (
            <p className="col-span-full text-muted-foreground text-sm">
              VNet{' '}
              <span className="text-foreground">{network?.mode === 'nat' ? network.bridge : '保存后自动生成'}</span>
            </p>
          ) : (
            <BridgeField
              label="现有网桥"
              value={bridge}
              onChange={setBridge}
              items={withCurrent(bridgeItems, bridge)}
            />
          )}
          {vlanAware && (
            <TextField label="VLAN（可留空）" name="vlan" type="number" defaultValue={String(network?.vlan ?? '')} />
          )}
        </div>
      </FormSection>
      <FormSection legend="地址池">
        <div className="form-grid">
          <TextField label="子网 CIDR" name="cidr" defaultValue={network?.cidr ?? '172.20.0.0/24'} required />
          <TextField label="网关" name="gateway" defaultValue={network?.gateway ?? '172.20.0.1'} required />
          <TextField label="起始 IP" name="start" defaultValue={network?.start ?? '172.20.0.10'} required />
          <TextField label="结束 IP" name="end" defaultValue={network?.end ?? '172.20.0.200'} required />
          <TextField
            label="DNS（逗号分隔）"
            name="dns"
            required
            defaultValue={network?.dns.join(', ') || '223.5.5.5, 1.1.1.1'}
          />
          <TextField label="排除 IP（逗号分隔）" name="excluded" defaultValue={network?.excluded.join(', ') || ''} />
        </div>
      </FormSection>
    </EditorDialog>
  );
}
