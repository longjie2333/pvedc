import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import type { Profile } from '../../../shared/schema';
import { request, useCommand } from '@/lib/api';
import { useAdminOverview, useSettings } from '@/lib/queries';
import { HeaderActions, HeaderButton } from '@/layouts/header-actions';
import { ConfirmAction, type PendingAction } from '@/components/common/confirm-action';
import { Empty, Feedback, Loading } from '@/components/common/feedback';
import { CatalogEditor } from '@/components/catalog/catalog-editor';
import { ProfileCard, type Capacity } from '@/components/catalog/profile-card';
import { Button } from '@/components/ui/button';
import { Card, CardPanel } from '@/components/ui/card';

export function ProfilesPage() {
  const overview = useAdminOverview(),
    settings = useSettings(),
    command = useCommand();
  const capacities = useQuery({
    queryKey: ['capacities'],
    queryFn: () => request<Capacity[]>('admin/capacities'),
    refetchInterval: 30000,
  });
  const [editing, setEditing] = useState<{ item?: Profile }>(),
    [confirmation, setConfirmation] = useState<PendingAction>();
  if (overview.isPending) return <Loading />;
  if (overview.error) return <Feedback error={overview.error.message} />;
  const { profiles, networks } = overview.data;
  const defaultProfileId = settings.data?.defaultProfileId;
  return (
    <>
      <HeaderActions>
        <HeaderButton icon={<Plus />} label="添加配置" onClick={() => setEditing({})} />
      </HeaderActions>
      <Feedback error={command.error} />
      <Feedback error={capacities.error?.message} />
      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {profiles.map(profile => (
          <ProfileCard
            key={profile.id}
            profile={profile}
            networks={networks}
            capacity={capacities.data?.find(capacity => capacity.profileId === profile.id)}
            isDefault={defaultProfileId === profile.id}
          >
            <Button variant="outline" onClick={() => setEditing({ item: profile })}>
              编辑配置
            </Button>
            {profile.published && profile.enabled && (
              <Button
                variant="ghost"
                onClick={() => command.run('admin/settings', { defaultProfileId: profile.id }, 'PUT')}
              >
                设为默认
              </Button>
            )}
            {defaultProfileId !== profile.id && (
              <Button
                variant="ghost"
                onClick={() =>
                  setConfirmation({
                    title: '删除资源配置',
                    description: '仅未被学生或资源引用的配置可以删除。',
                    path: 'admin/profiles/' + profile.id,
                    method: 'DELETE',
                  })
                }
              >
                删除
              </Button>
            )}
          </ProfileCard>
        ))}
      </div>
      {!profiles.length && (
        <Card>
          <CardPanel>
            <Empty title="创建第一套资源配置">先准备模板和网络，再填写 CPU、内存及磁盘规格。</Empty>
          </CardPanel>
        </Card>
      )}
      <p className="text-muted-foreground text-sm">
        数量为估算参考、不会阻止创建；仅地址池或 VMID 用尽时暂停受理。各配置共享宿主资源，估算数量不能相加。
      </p>
      <ConfirmAction action={confirmation} onClose={() => setConfirmation(undefined)} />
      {editing && (
        <CatalogEditor
          key={'profiles' + (editing.item?.id || 'new')}
          kind="profiles"
          item={editing.item}
          profiles={profiles}
          networks={networks}
          onClose={() => setEditing(undefined)}
        />
      )}
    </>
  );
}
