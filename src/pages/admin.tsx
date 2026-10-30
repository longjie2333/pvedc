import type { StorageOption } from '../../shared/pve-options';
import { copyText } from '@/lib/feedback';
import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Plus, RefreshCw } from 'lucide-react';
import type { AdminStudent, Forward, Network, Profile, Resource, SafeSettings } from '../../shared/schema';
import { request, useCommand } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Form } from '@/components/ui/form';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Choice } from '@/components/common/form-fields';
import { Empty, Feedback, Loading } from '@/components/common/feedback';
import { Modal } from '@/components/common/modal';
import { Panel } from '@/components/common/panel';
import { Status } from '@/components/common/status';
import { HeaderActions, HeaderButton } from '@/components/app-shell';
import { Card, CardAction, CardDescription, CardFooter, CardHeader, CardPanel, CardTitle } from '@/components/ui/card';
import { ForwardPanel } from '@/components/forward/forward-panel';
import { MachineDetail } from '@/components/resource/machine-detail';
import { ResourceAdjust } from '@/components/resource/resource-adjust';
import { CatalogEditor } from '@/components/catalog/catalog-editor';
import { SettingsEditor } from '@/pages/settings';
import { StudentRoster } from '@/components/students/student-roster';
import { AdminOverview } from '@/components/admin-overview';
import { ActivityPage } from '@/pages/activity';
import { GuidesPage } from '@/pages/guides';

interface Overview {
  students: AdminStudent[];
  resources: Resource[];
  profiles: Profile[];
  networks: Network[];
  taskCounts: { attention: number };
  forwards: Forward[];
}
const limitLabels: Record<string, string> = { cpu: 'CPU', memory: '内存', disk: '磁盘', ip: '地址池', vmid: 'VMID' };
export function AdminPage() {
  const page = useParams().page || 'overview',
    command = useCommand();
  const [csv, setCsv] = useState(''),
    [fileError, setFileError] = useState('');
  const [editor, setEditor] = useState<{
      kind: 'students' | 'profiles' | 'networks';
      item?: AdminStudent | Profile | Network;
    }>(),
    [importing, setImporting] = useState(false),
    [machine, setMachine] = useState<Resource>(),
    [adjusting, setAdjusting] = useState<Resource>();
  const [confirmation, setConfirmation] = useState<{
    title: string;
    description: string;
    path: string;
    method?: string;
  }>();
  const overview = useQuery({
    queryKey: ['admin-overview'],
    queryFn: () => request<Overview>('admin/overview'),
    refetchInterval: 5000,
  });
  const settings = useQuery({ queryKey: ['settings'], queryFn: () => request<SafeSettings>('admin/settings') });
  const capacities = useQuery({
    queryKey: ['capacities'],
    queryFn: () =>
      request<{ profileId: string; count: number; limiting?: string[]; error?: string }[]>('admin/capacities'),
    enabled: page === 'profiles',
    refetchInterval: 30000,
  });
  if (overview.isPending) return <Loading />;
  if (overview.error) return <Feedback error={overview.error.message} />;
  const d = overview.data;
  return (
    <>
      {['profiles', 'networks'].includes(page) && (
        <HeaderActions>
          <HeaderButton
            icon={<Plus />}
            label="添加配置"
            onClick={() => setEditor({ kind: page as 'profiles' | 'networks' })}
          />
        </HeaderActions>
      )}
      {!confirmation && !importing && <Feedback {...command} />}
      {page === 'overview' && (
        <AdminOverview
          students={d.students}
          resources={d.resources}
          attention={d.taskCounts.attention}
          registrationOpen={!!settings.data?.registrationOpen}
          onMachine={setMachine}
        />
      )}
      {page === 'students' && (
        <StudentRoster
          students={d.students}
          profiles={d.profiles}
          onAdd={() => setEditor({ kind: 'students' })}
          onEdit={student => setEditor({ kind: 'students', item: student })}
          onMachine={student => setMachine(student.resource!)}
          onImport={() => setImporting(true)}
        />
      )}
      {page === 'profiles' && (
        <>
          <Feedback error={capacities.error?.message} />
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {d.profiles.map(p => {
              const c = capacities.data?.find(c => c.profileId === p.id),
                blocked = c && c.count === 0 && c.limiting?.some(key => key === 'ip' || key === 'vmid');
              return (
                <Card key={p.id}>
                  <CardHeader>
                    <CardTitle render={<h2 />}>{p.name}</CardTitle>
                    <CardDescription>
                      {p.distro === 'ubuntu' ? 'Ubuntu' : 'Debian'} ·{' '}
                      {p.networkIds.map(id => d.networks.find(n => n.id === id)?.name || '已删除网络').join(' + ')}
                    </CardDescription>
                    <CardAction>
                      <Status
                        state={
                          settings.data?.defaultProfileId === p.id ? '默认配置' : p.published ? '已发布' : '仅指定'
                        }
                      />
                    </CardAction>
                  </CardHeader>
                  <CardPanel className="flex flex-col gap-4">
                    <dl className="grid grid-cols-3 gap-4">
                      {(
                        [
                          ['vCPU', p.cores],
                          ['GiB 内存', p.memory / 1024],
                          ['GiB 磁盘', p.disk],
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
                        {c ? c.count : '—'}
                        <span className="ms-1 font-normal text-muted-foreground text-sm">台</span>
                      </span>
                    </div>
                    <p className="text-muted-foreground text-xs">
                      {c?.error ||
                        (blocked
                          ? '地址池或 VMID 已用尽，已暂停受理'
                          : c?.limiting?.length
                            ? '估算受限：' + c.limiting.map(key => limitLabels[key] || key).join('、')
                            : '等待容量计算')}
                    </p>
                  </CardPanel>
                  <CardFooter className="flex flex-wrap gap-2">
                    <Button variant="outline" onClick={() => setEditor({ kind: 'profiles', item: p })}>
                      编辑配置
                    </Button>
                    {p.published && p.enabled && (
                      <Button
                        variant="ghost"
                        onClick={() => command.run('admin/settings', { defaultProfileId: p.id }, 'PUT')}
                      >
                        设为默认
                      </Button>
                    )}
                    {settings.data?.defaultProfileId !== p.id && (
                      <Button
                        variant="ghost"
                        onClick={() =>
                          setConfirmation({
                            title: '删除资源配置',
                            description: '仅未被学生或资源引用的配置可以删除。',
                            path: 'admin/profiles/' + p.id,
                            method: 'DELETE',
                          })
                        }
                      >
                        删除
                      </Button>
                    )}
                  </CardFooter>
                </Card>
              );
            })}
          </div>
          {!d.profiles.length && (
            <Card>
              <CardPanel>
                <Empty title="创建第一套资源配置">先准备模板和网络，再填写 CPU、内存及磁盘规格。</Empty>
              </CardPanel>
            </Card>
          )}
          <p className="text-muted-foreground text-sm">
            数量为估算参考、不会阻止创建；仅地址池或 VMID 用尽时暂停受理。各配置共享宿主资源，估算数量不能相加。
          </p>
        </>
      )}
      {page === 'networks' && (
        <div className="grid gap-6 md:grid-cols-2">
          {d.networks.map(n => (
            <Card key={n.id}>
              <CardHeader>
                <CardTitle render={<h2 />}>{n.name}</CardTitle>
                <CardDescription>{n.mode === 'nat' ? '独立私网 + NAT' : '桥接网络'}</CardDescription>
                <CardAction>
                  <Status state={n.ready ? 'ready' : 'pending'} />
                </CardAction>
              </CardHeader>
              <CardPanel className="flex flex-col gap-4">
                <dl className="grid grid-cols-2 gap-4">
                  {(
                    [
                      ['子网', n.cidr],
                      ['网关', n.gateway],
                      ['网桥', n.bridge],
                      ['地址池', n.start + ' — ' + n.end],
                    ] as const
                  ).map(([label, value]) => (
                    <div key={label} className="min-w-0">
                      <dt className="text-muted-foreground text-xs">{label}</dt>
                      <dd className="truncate font-mono text-sm">{value}</dd>
                    </div>
                  ))}
                </dl>
                <Feedback error={n.error || undefined} />
              </CardPanel>
              <CardFooter className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => setEditor({ kind: 'networks', item: n })}>
                  编辑
                </Button>
                <Button loading={command.pending} onClick={() => command.run('admin/networks/' + n.id + '/apply')}>
                  应用网络
                </Button>
                {n.ready ? (
                  <Button
                    variant="ghost"
                    onClick={() =>
                      setConfirmation({
                        title: '撤销网络',
                        description: '请先回收连接此网络的所有资源。NAT 网络将从 PVE 移除，现有校园网桥保持不变。',
                        path: 'admin/networks/' + n.id + '/remove',
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
                        path: 'admin/networks/' + n.id,
                        method: 'DELETE',
                      })
                    }
                  >
                    删除配置
                  </Button>
                )}
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
      {page === 'templates' && <Templates />}
      {page === 'forwarding' && (
        <>
          <SettingsEditor section="forwarding" />
          <ForwardPanel admin rules={d.forwards} publicHost={settings.data?.publicHost || ''} />
        </>
      )}
      {page === 'tasks' && <ActivityPage />}
      {page === 'guides' && <GuidesPage />}
      {page === 'settings' && <SettingsEditor profiles={d.profiles} />}
      <Modal
        destructive
        open={!!confirmation}
        onClose={() => setConfirmation(undefined)}
        title={confirmation?.title || '确认操作'}
        description={confirmation?.description || ''}
        footer={
          <Button
            variant="destructive"
            loading={command.pending}
            onClick={async () => {
              if (confirmation && (await command.run(confirmation.path, {}, confirmation.method || 'POST')))
                setConfirmation(undefined);
            }}
          >
            确认
          </Button>
        }
      >
        <Feedback error={command.error} />
      </Modal>
      {editor && (
        <CatalogEditor
          key={editor.kind + (editor.item?.id || 'new')}
          {...editor}
          profiles={d.profiles}
          networks={d.networks}
          onClose={() => setEditor(undefined)}
        />
      )}
      <Modal
        open={importing}
        onClose={() => setImporting(false)}
        title="批量导入学生"
        description="支持粘贴 CSV 或从表格复制的内容。相同学号更新姓名、班级和指定配置，保留认领状态；包含「认领密钥」列时同步更新密钥，留空则清除，缺列保持原值。"
        footer={
          <Button form="import-form" type="submit" loading={command.pending}>
            导入
          </Button>
        }
      >
        <Form
          id="import-form"
          onSubmit={async e => {
            e.preventDefault();
            if (await command.run('admin/students/import', { csv: new FormData(e.currentTarget).get('csv') }))
              setImporting(false);
          }}
        >
          <Feedback error={fileError || command.error} />
          <label className="flex flex-col gap-2 mb-4 text-sm">
            选择 UTF-8 CSV 文件
            <Input
              nativeInput
              type="file"
              accept=".csv,.tsv,text/csv"
              onChange={async e => {
                const file = e.target.files?.[0];
                if (!file) return;
                if (file.size > 1500000) {
                  setFileError('文件过大，请分批导入');
                  return;
                }
                setFileError('');
                setCsv(await file.text());
              }}
            />
          </label>
          <Textarea
            name="csv"
            value={csv}
            onChange={e => setCsv(e.target.value)}
            required
            rows={10}
            aria-label="学生名单 CSV"
            placeholder={'学号,姓名,班级,认领密钥\n20260001,张同学,软件工程一班,K7f2m9'}
          />
        </Form>
      </Modal>
      <Modal
        open={!!machine}
        onClose={() => setMachine(undefined)}
        title="学生计算资源"
        description={machine?.studentId || ''}
      >
        {machine && (
          <div className="grid gap-6">
            <MachineDetail
              admin
              resource={machine}
              forwards={d.forwards.filter(f => f.resourceId === machine.id)}
              publicHost={settings.data?.publicHost || ''}
              onAdjust={() => {
                setAdjusting(machine);
                setMachine(undefined);
              }}
            />
            <ForwardPanel
              admin
              resource={machine}
              rules={d.forwards.filter(f => f.resourceId === machine.id)}
              publicHost={settings.data?.publicHost || ''}
            />
          </div>
        )}
      </Modal>
      {adjusting && (
        <ResourceAdjust
          key={adjusting.id + adjusting.state}
          resource={adjusting}
          networks={d.networks}
          onClose={() => setAdjusting(undefined)}
        />
      )}
    </>
  );
}
function Templates() {
  const command = useCommand(),
    [selectedStorage, setStorage] = useState('');
  const stores = useQuery({
    queryKey: ['pve-options', 'storages'],
    queryFn: () => request<StorageOption[]>('admin/options/storages'),
  });
  const available = (stores.data || []).filter(store => store.content.includes('vztmpl'));
  const storage = selectedStorage || available[0]?.storage || '';
  const data = useQuery({
    queryKey: ['templates', storage],
    queryFn: () =>
      request<{ catalog: { template: string }[]; downloaded: { volid: string }[] }>(
        'admin/templates?storage=' + encodeURIComponent(storage),
      ),
    enabled: !!storage,
  });
  return (
    <Panel>
      <div className={data.data ? 'border-b px-6 py-4' : 'px-6 py-4'}>
        <div className="inline-field-action">
          <Choice
            label="模板存储"
            value={storage}
            onChange={setStorage}
            items={available.map(store => ({ value: store.storage, label: store.storage }))}
          />
          <Button
            type="button"
            size="icon"
            variant="outline"
            aria-label="刷新模板存储"
            title="刷新模板存储"
            loading={stores.isFetching}
            onClick={() => void stores.refetch()}
          >
            <RefreshCw />
          </Button>
        </div>
        <Feedback error={stores.error?.message} />
        <Feedback {...command} />
        <Feedback error={data.error?.message} />
      </div>
      {data.data && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>模板</TableHead>
              <TableHead>状态</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.data.catalog.map(t => {
              const downloaded = data.data.downloaded.some(d => d.volid.endsWith('/' + t.template));
              return (
                <TableRow key={t.template}>
                  <TableCell className="font-mono text-xs">{t.template}</TableCell>
                  <TableCell>
                    <Status state={downloaded ? '已下载' : '可下载'} />
                  </TableCell>
                  <TableCell>
                    {downloaded ? (
                      <Button size="xs" variant="outline" onClick={() => copyText(storage + ':vztmpl/' + t.template)}>
                        复制卷 ID
                      </Button>
                    ) : (
                      <Button
                        size="xs"
                        loading={command.pending}
                        onClick={() => command.run('admin/templates/download', { storage, template: t.template })}
                      >
                        下载
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </Panel>
  );
}
