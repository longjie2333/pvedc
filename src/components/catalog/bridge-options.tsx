import { useQuery } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import type { BridgeOption } from '../../../shared/pve-options';
import { request } from '@/lib/api';
import { Choice } from '@/components/common/form-fields';
import { Button } from '@/components/ui/button';

/** Active PVE bridges and VNets as select items; every caller shares one cached request. */
export function useBridgeOptions(enabled: boolean) {
  const query = useQuery({
    queryKey: ['pve-options', 'networks'],
    queryFn: () => request<BridgeOption[]>('admin/options/networks'),
    enabled,
  });
  const items = (query.data || []).map(bridge => ({
    value: bridge.iface,
    label: bridge.iface + ' · ' + bridge.type + (bridge.address ? ' · ' + bridge.address : ''),
  }));
  return { query, items };
}

/** Bridge select with a refresh button; `items` lets the caller decide how to present unavailable values. */
export function BridgeField({
  label,
  value,
  onChange,
  items,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  items: { value: string; label: string; disabled?: boolean }[];
}) {
  const { query } = useBridgeOptions(true);
  return (
    <div className="inline-field-action">
      <Choice label={label} value={value} onChange={onChange} items={items} />
      <Button
        type="button"
        size="icon"
        variant="outline"
        aria-label="刷新网桥选项"
        title="刷新网桥选项"
        loading={query.isFetching}
        onClick={() => void query.refetch()}
      >
        <RefreshCw />
      </Button>
    </div>
  );
}
