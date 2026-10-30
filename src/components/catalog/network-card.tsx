import type { ReactNode } from 'react';
import type { Network } from '../../../shared/schema';
import { Feedback } from '@/components/common/feedback';
import { Status } from '@/components/common/status';
import { Card, CardAction, CardDescription, CardFooter, CardHeader, CardPanel, CardTitle } from '@/components/ui/card';

/** Network and address pool summary; actions are composed by the caller. */
export function NetworkCard({ network, children }: { network: Network; children: ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle render={<h2 />}>{network.name}</CardTitle>
        <CardDescription>{network.mode === 'nat' ? '独立私网 + NAT' : '桥接网络'}</CardDescription>
        <CardAction>
          <Status state={network.ready ? 'ready' : 'pending'} />
        </CardAction>
      </CardHeader>
      <CardPanel className="flex flex-col gap-4">
        <dl className="grid grid-cols-2 gap-4">
          {(
            [
              ['子网', network.cidr],
              ['网关', network.gateway],
              ['网桥', network.bridge],
              ['地址池', network.start + ' — ' + network.end],
            ] as const
          ).map(([label, value]) => (
            <div key={label} className="min-w-0">
              <dt className="text-muted-foreground text-xs">{label}</dt>
              <dd className="truncate font-mono text-sm">{value}</dd>
            </div>
          ))}
        </dl>
        <Feedback error={network.error || undefined} />
      </CardPanel>
      <CardFooter className="flex flex-wrap gap-2">{children}</CardFooter>
    </Card>
  );
}
