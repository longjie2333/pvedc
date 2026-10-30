import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import type { StorageOption } from '../../../shared/pve-options';
import { request, useCommand } from '@/lib/api';
import { copyText } from '@/lib/feedback';
import { Feedback } from '@/components/common/feedback';
import { Choice } from '@/components/common/form-fields';
import { Panel } from '@/components/common/panel';
import { Status } from '@/components/common/status';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export function TemplatesPage() {
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
