import { useState } from 'react';
import type { AdminStudent } from '../../../shared/schema';
import { batchConfirmation, batchNames, type BatchAction, type BatchResult } from '../../../shared/batch';
import { useCommand } from '@/lib/api';
import { Feedback } from '@/components/common/feedback';
import { TextField } from '@/components/common/form-fields';
import { Modal } from '@/components/common/modal';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export interface Batch {
  action: BatchAction;
  ids: string[];
}

const descriptions: Partial<Record<BatchAction, string>> = {
  delete: '将停用账号，回收机器及转发，成功后删除名单；机器中的数据会被永久清空。',
  reclaim: '将回收所选学生的机器及转发，系统盘数据会被永久清空。',
};

/** Confirms one batch; delete and reclaim also require typing the confirmation phrase. */
export function BatchDialog({
  batch,
  students,
  onClose,
  onDone,
}: {
  batch: Batch;
  students: AdminStudent[];
  onClose: () => void;
  onDone: (result: BatchResult) => void;
}) {
  const command = useCommand(),
    [confirmation, setConfirmation] = useState('');
  const expected = batchConfirmation(batch.action, batch.ids.length);
  const targets = students.filter(student => batch.ids.includes(student.id));
  return (
    <Modal
      destructive={!!expected}
      open
      onClose={onClose}
      title={batchNames[batch.action]}
      description={descriptions[batch.action] || '对以下学生的机器提交后台操作，没有机器的学生会被跳过。'}
      footer={
        <Button
          type="button"
          variant={expected ? 'destructive' : 'default'}
          loading={command.pending}
          disabled={!!expected && confirmation !== expected}
          onClick={async () => {
            const response = await command.run<BatchResult>('admin/students/batch', { ...batch, confirmation });
            if (response) onDone(response);
          }}
        >
          确认{batchNames[batch.action]}
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <p>
          共 {batch.ids.length} 名学生，当前有 {targets.filter(student => student.resource).length} 台机器。
        </p>
        <div className="max-h-64 overflow-y-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>学生</TableHead>
                <TableHead>机器 / IP</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {targets.map(student => (
                <TableRow key={student.id}>
                  <TableCell>
                    {student.id} · {student.name}
                  </TableCell>
                  <TableCell>
                    {student.resource ? student.resource.vmid + ' · ' + student.resource.networks[0].ip : '未分配'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        {expected && (
          <TextField
            label={'请输入“' + expected + '”'}
            value={confirmation}
            onChange={event => setConfirmation(event.target.value)}
          />
        )}
        <Feedback error={command.error} />
      </div>
    </Modal>
  );
}
