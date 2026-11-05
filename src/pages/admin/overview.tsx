import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Settings2 } from 'lucide-react';
import type { Resource } from '../../../shared/schema';
import { useAdminOverview, useSettings } from '@/lib/queries';
import { Feedback, Loading } from '@/components/common/feedback';
import { HostMetrics } from '@/components/host/host-metrics';
import { MachineDialog } from '@/components/resource/machine-dialog';
import { ResourceTable } from '@/components/resource/resource-table';
import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

export function OverviewPage() {
  const overview = useAdminOverview(),
    settings = useSettings();
  const [machine, setMachine] = useState<Resource>();
  if (overview.isPending) return <Loading />;
  if (overview.error) return <Feedback error={overview.error.message} />;
  const { students, resources, taskCounts } = overview.data;
  const kpis = [
    { label: '名单学生', value: students.length },
    { label: '已认领', value: students.filter(student => student.claimed).length, of: students.length },
    { label: '已分配实例', value: resources.length },
    { label: '待处理任务', value: taskCounts.attention, warn: taskCounts.attention > 0 },
  ];
  return (
    <>
      {!settings.data?.registrationOpen && (
        <Alert variant="info">
          <Settings2 />
          <AlertTitle>准备好后，再开放学生申请</AlertTitle>
          <AlertDescription>依次完成 PVE 连接、系统模板、网络、默认资源配置。</AlertDescription>
          <AlertAction>
            <Button size="sm" variant="outline" render={<Link to="/admin/settings" />}>
              配置平台 <ArrowUpRight />
            </Button>
          </AlertAction>
        </Alert>
      )}
      <Card className="grid grid-cols-2 md:grid-cols-4 md:divide-x max-md:gap-y-4 max-md:py-4">
        {kpis.map(kpi => (
          <div key={kpi.label} className="px-6 md:py-5">
            <div className="text-muted-foreground text-sm">{kpi.label}</div>
            <div className={'mt-1 font-semibold text-2xl tabular-nums' + (kpi.warn ? ' text-warning-foreground' : '')}>
              {kpi.value}
              {kpi.of !== undefined && (
                <span className="ms-1 font-normal text-base text-muted-foreground">/ {kpi.of}</span>
              )}
            </div>
          </div>
        ))}
      </Card>
      <HostMetrics />
      <ResourceTable resources={resources} students={students} onOpen={setMachine} />
      <MachineDialog resource={machine} onClose={() => setMachine(undefined)} />
    </>
  );
}
