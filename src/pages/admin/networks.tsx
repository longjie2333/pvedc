import { useState } from 'react';
import { Plus } from 'lucide-react';
import type { Network } from '../../../shared/schema';
import { useCommand } from '@/lib/api';
import { useAdminOverview } from '@/lib/queries';
import { HeaderActions, HeaderButton } from '@/layouts/header-actions';
import { ConfirmAction, type PendingAction } from '@/components/common/confirm-action';
import { Feedback, Loading } from '@/components/common/feedback';
import { CatalogEditor } from '@/components/catalog/catalog-editor';
import { NetworkCard } from '@/components/catalog/network-card';
import { Button } from '@/components/ui/button';

export function NetworksPage() {
  const overview = useAdminOverview(),
    command = useCommand();
  const [editing, setEditing] = useState<{ item?: Network }>(),
    [confirmation, setConfirmation] = useState<PendingAction>();
  if (overview.isPending) return <Loading />;
  if (overview.error) return <Feedback error={overview.error.message} />;
  const { profiles, networks } = overview.data;
  return (
    <>
      <HeaderActions>
        <HeaderButton icon={<Plus />} label="添加配置" onClick={() => setEditing({})} />
      </HeaderActions>
      <Feedback error={command.error} />
      <div className="grid gap-6 md:grid-cols-2">
        {networks.map(network => (
          <NetworkCard key={network.id} network={network}>
            <Button variant="outline" onClick={() => setEditing({ item: network })}>
              编辑
            </Button>
            <Button loading={command.pending} onClick={() => command.run('admin/networks/' + network.id + '/apply')}>
              应用网络
            </Button>
            {network.ready ? (
              <Button
                variant="ghost"
                onClick={() =>
                  setConfirmation({
                    title: '撤销网络',
                    description: '请先回收连接此网络的所有资源。NAT 网络将从 PVE 移除，现有校园网桥保持不变。',
                    path: 'admin/networks/' + network.id + '/remove',
                  })
                }
              >
                撤销网络
              </Button>
            ) : (
              <Button
                variant="ghost"
                onClick={() =>
                  setConfirmation({
                    title: '删除网络配置',
                    description: '配置不能被资源规格或已分配实例引用。',
                    path: 'admin/networks/' + network.id,
                    method: 'DELETE',
                  })
                }
              >
                删除配置
              </Button>
            )}
          </NetworkCard>
        ))}
      </div>
      <ConfirmAction action={confirmation} onClose={() => setConfirmation(undefined)} />
      {editing && (
        <CatalogEditor
          key={'networks' + (editing.item?.id || 'new')}
          kind="networks"
          item={editing.item}
          profiles={profiles}
          networks={networks}
          onClose={() => setEditing(undefined)}
        />
      )}
    </>
  );
}
