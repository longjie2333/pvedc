import type { ReactNode } from 'react';
import type { Network, Profile } from '../../../shared/schema';
import { Status } from '@/components/common/status';
import { Card, CardAction, CardDescription, CardFooter, CardHeader, CardPanel, CardTitle } from '@/components/ui/card';

export interface Capacity {
  profileId: string;
  count: number;
  limiting?: string[];
  error?: string;
}
const limitLabels: Record<string, string> = { cpu: 'CPU', memory: '内存', disk: '磁盘', ip: '地址池', vmid: 'VMID' };

/** Resource profile summary with its capacity estimate; actions are composed by the caller. */
export function ProfileCard({
  profile,
  networks,
  capacity,
  isDefault,
  children,
}: {
  profile: Profile;
  networks: Network[];
  capacity?: Capacity;
  isDefault: boolean;
  children: ReactNode;
}) {
  const blocked = capacity && capacity.count === 0 && capacity.limiting?.some(key => key === 'ip' || key === 'vmid');
  return (
    <Card>
      <CardHeader>
        <CardTitle render={<h2 />}>{profile.name}</CardTitle>
        <CardDescription>
          {profile.distro === 'ubuntu' ? 'Ubuntu' : 'Debian'} ·{' '}
          {profile.networkIds.map(id => networks.find(n => n.id === id)?.name || '已删除网络').join(' + ')}
        </CardDescription>
        <CardAction>
          <Status state={isDefault ? '默认配置' : profile.published ? '已发布' : '仅指定'} />
        </CardAction>
      </CardHeader>
      <CardPanel className="flex flex-col gap-4">
        <dl className="grid grid-cols-3 gap-4">
          {(
            [
              ['vCPU', profile.cores],
              ['GiB 内存', profile.memory / 1024],
              ['GiB 磁盘', profile.disk],
            ] as const
          ).map(([label, value]) => (
            <div key={label}>
              <dt className="text-muted-foreground text-xs">{label}</dt>
              <dd className="font-semibold text-2xl tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
        <div className="flex items-baseline justify-between border-t pt-4">
          <span className="text-muted-foreground text-sm">预计还可分配</span>
          <span className="font-semibold text-xl tabular-nums">
            {capacity ? capacity.count : '—'}
            <span className="ms-1 font-normal text-muted-foreground text-sm">台</span>
          </span>
        </div>
        <p className="text-muted-foreground text-xs">
          {capacity?.error ||
            (blocked
              ? '地址池或 VMID 已用尽，已暂停受理'
              : capacity?.limiting?.length
                ? '估算受限：' + capacity.limiting.map(key => limitLabels[key] || key).join('、')
                : '等待容量计算')}
        </p>
      </CardPanel>
      <CardFooter className="flex flex-wrap gap-2">{children}</CardFooter>
    </Card>
  );
}
