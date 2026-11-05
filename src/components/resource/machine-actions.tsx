import { useState, type FormEvent, type ReactNode } from 'react';
import { ArrowDownToLine, Ellipsis, KeyRound, Power, PowerOff, RotateCw, Trash2 } from 'lucide-react';
import type { Resource } from '../../../shared/schema';
import { useCommand } from '@/lib/api';
import { Feedback } from '@/components/common/feedback';
import { TextField } from '@/components/common/form-fields';
import { Modal } from '@/components/common/modal';
import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form';
import { Group, GroupSeparator } from '@/components/ui/group';
import { Menu, MenuItem, MenuPopup, MenuSeparator, MenuTrigger } from '@/components/ui/menu';

/** Inputs an operation asks for before it is submitted. */
export type Credential = 'confirmation' | 'password' | 'newPassword';
/** Menu operations the caller offers and the inputs each requires; power operations need none. */
export type MachineOperations = Partial<Record<'password' | 'rebuild' | 'reclaim', Credential[]>>;

const names: Record<string, string> = {
  start: '启动',
  shutdown: '关机',
  reboot: '重启',
  password: '修改密码',
  rebuild: '重建',
  reclaim: '回收',
};
const destructive = ['rebuild', 'reclaim'];

/** Power group, `children` (extra header actions), the operation menu and its confirmation dialog. */
export function MachineActions({
  resource,
  status,
  endpoint,
  operations,
  children,
}: {
  resource: Resource;
  status?: string;
  endpoint: (action: string) => string;
  operations: MachineOperations;
  children?: ReactNode;
}) {
  const command = useCommand(),
    [action, setAction] = useState('');
  const power =
    status === 'running' ? ['shutdown', 'reboot'] : status === 'stopped' ? ['start'] : ['start', 'shutdown', 'reboot'];
  const fields = operations[action as keyof MachineOperations] || [];
  async function perform(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (await command.run(endpoint(action), Object.fromEntries(new FormData(event.currentTarget)))) setAction('');
  }
  return (
    <>
      <Group aria-label="电源">
        {power.map((key, index) => [
          index > 0 && <GroupSeparator key={key + '-separator'} />,
          <Button key={key} variant="outline" onClick={() => setAction(key)}>
            {key === 'start' ? <Power /> : key === 'shutdown' ? <PowerOff /> : <RotateCw />}
            {names[key]}
          </Button>,
        ])}
      </Group>
      {children}
      <Menu>
        <MenuTrigger render={<Button variant="outline" size="icon" aria-label="更多操作" />}>
          <Ellipsis />
        </MenuTrigger>
        <MenuPopup align="end">
          {operations.password && (
            <MenuItem onClick={() => setAction('password')}>
              <KeyRound />
              {names.password}
            </MenuItem>
          )}
          <MenuSeparator />
          {operations.rebuild && (
            <MenuItem variant="destructive" onClick={() => setAction('rebuild')}>
              <Trash2 />
              {names.rebuild}
            </MenuItem>
          )}
          {operations.reclaim && (
            <MenuItem variant="destructive" onClick={() => setAction('reclaim')}>
              <ArrowDownToLine />
              {names.reclaim}
            </MenuItem>
          )}
        </MenuPopup>
      </Menu>
      <Modal
        destructive={destructive.includes(action)}
        open={!!action}
        onClose={() => setAction('')}
        title={(names[action] || '') + '容器'}
        description={
          destructive.includes(action)
            ? '此操作将永久清空系统盘数据。重建保留规格、IP 和转发规则；回收则释放资源。'
            : '操作将以后台任务执行，可在任务列表查看结果。'
        }
        footer={
          <Button
            type="submit"
            form="resource-action"
            loading={command.pending}
            variant={destructive.includes(action) ? 'destructive' : 'default'}
          >
            确认{names[action]}
          </Button>
        }
      >
        <Form id="resource-action" className="flex flex-col gap-4" onSubmit={perform}>
          <Feedback error={command.error} />
          {fields.includes('confirmation') && (
            <TextField label={'输入学号 ' + resource.studentId + ' 以确认'} name="confirmation" required />
          )}
          {fields.includes('password') && (
            <TextField label="当前平台密码" name="password" type="password" required minLength={10} />
          )}
          {fields.includes('newPassword') && (
            <TextField label="新的平台和 root 密码" name="newPassword" type="password" required minLength={10} />
          )}
        </Form>
      </Modal>
    </>
  );
}
