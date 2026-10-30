import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDownToLine, ChevronDown, Ellipsis, Eye, EyeOff, Search, Upload, UserPlus, X } from 'lucide-react';
import type { AdminStudent, Profile } from '../../../shared/schema';
import { batchConfirmation, batchNames, type BatchAction, type BatchResult } from '../../../shared/batch';
import { downloadFile, useCommand } from '@/lib/api';
import { segmentedControlItemVariants, segmentedControlRootClassName } from '@/lib/segmented-control';
import { Empty, Feedback } from '@/components/common/feedback';
import { Modal } from '@/components/common/modal';
import { Status } from '@/components/common/status';
import { TextField } from '@/components/common/form-fields';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { HeaderActions, HeaderButton } from '@/components/app-shell';
import { Card, CardAction, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';
import { Menu, MenuItem, MenuPopup, MenuSeparator, MenuTrigger } from '@/components/ui/menu';
import { RadioGroupPrimitive, RadioPrimitive } from '@/components/ui/radio-group';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

type Filter = 'all' | 'claimed' | 'unclaimed';
const powerActions: BatchAction[] = ['start', 'shutdown', 'reboot'];
const matchesFilter = (student: AdminStudent, filter: Filter) =>
  filter === 'all' || student.claimed === (filter === 'claimed');

export function StudentRoster({
  students,
  profiles,
  onAdd,
  onEdit,
  onMachine,
  onImport,
}: {
  students: AdminStudent[];
  profiles: Profile[];
  onAdd: () => void;
  onEdit: (student: AdminStudent) => void;
  onMachine: (student: AdminStudent) => void;
  onImport: () => void;
}) {
  const [query, setQuery] = useState(''),
    [filter, setFilter] = useState<Filter>('all'),
    [selected, setSelected] = useState<string[]>([]);
  const [batch, setBatch] = useState<{ ids: string[]; action: BatchAction }>(),
    [confirmation, setConfirmation] = useState('');
  const [result, setResult] = useState<BatchResult>(),
    [resetStudent, setResetStudent] = useState<AdminStudent>();
  const [revealed, setRevealed] = useState<string[]>([]);
  const command = useCommand(),
    assign = useCommand({ toastErrors: true });
  const filtered = useMemo(
    () =>
      students.filter(
        student =>
          matchesFilter(student, filter) &&
          [student.id, student.name, student.className].some(value => value.includes(query)),
      ),
    [students, filter, query],
  );
  const counts = {
    all: students.length,
    claimed: students.filter(student => student.claimed).length,
    unclaimed: students.filter(student => !student.claimed).length,
  };
  const all = filtered.length > 0 && filtered.every(student => selected.includes(student.id));
  const expected = batch ? batchConfirmation(batch.action, batch.ids.length) : '';
  useEffect(() => {
    const existing = new Set(filtered.map(student => student.id));
    setSelected(previous => {
      const current = previous.filter(id => existing.has(id));
      return current.length === previous.length ? previous : current;
    });
  }, [filtered]);
  const chooseBatch = (action: BatchAction, ids = selected) => {
    setConfirmation('');
    setBatch({ action, ids: [...ids] });
  };
  const toggleKey = (id: string) =>
    setRevealed(previous => (previous.includes(id) ? previous.filter(item => item !== id) : [...previous, id]));
  return (
    <>
      <HeaderActions>
        <HeaderButton
          type="button"
          variant="outline"
          icon={<ArrowDownToLine />}
          label="导出"
          onClick={() => downloadFile('admin/students/export', 'students.csv')}
        />
        <HeaderButton type="button" variant="outline" icon={<Upload />} label="导入名单" onClick={onImport} />
        <HeaderButton type="button" icon={<UserPlus />} label="添加学生" onClick={onAdd} />
      </HeaderActions>
      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b px-6 py-4">
          <RadioGroupPrimitive
            aria-label="认领状态"
            value={filter}
            onValueChange={value => {
              setFilter(value as Filter);
              setSelected([]);
            }}
            className={segmentedControlRootClassName}
          >
            {(
              [
                ['all', '全部'],
                ['claimed', '已认领'],
                ['unclaimed', '未认领'],
              ] as const
            ).map(([value, label]) => (
              <RadioPrimitive.Root
                key={value}
                value={value}
                className={segmentedControlItemVariants({ state: 'checked' })}
              >
                {label}
                <span className="tabular-nums opacity-64">{counts[value]}</span>
              </RadioPrimitive.Root>
            ))}
          </RadioGroupPrimitive>
          <InputGroup className="w-full sm:ms-auto sm:w-64">
            <InputGroupInput
              type="search"
              aria-label="搜索学生"
              placeholder="学号、姓名或班级"
              value={query}
              onChange={event => {
                setQuery(event.target.value);
                setSelected([]);
              }}
            />
            <InputGroupAddon>
              <Search />
            </InputGroupAddon>
          </InputGroup>
        </div>
        {!batch && !resetStudent && command.error && (
          <div className="px-6 pt-4">
            <Feedback error={command.error} />
          </div>
        )}
        {filtered.length ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    aria-label="全选当前结果"
                    checked={all}
                    indeterminate={selected.length > 0 && !all}
                    onCheckedChange={checked => setSelected(checked ? filtered.map(student => student.id) : [])}
                  />
                </TableHead>
                <TableHead>学生</TableHead>
                <TableHead>班级</TableHead>
                <TableHead>认领密钥</TableHead>
                <TableHead>指定配置</TableHead>
                <TableHead>状态</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(student => (
                <TableRow key={student.id} data-state={selected.includes(student.id) ? 'selected' : undefined}>
                  <TableCell>
                    <Checkbox
                      aria-label={'选择 ' + student.name}
                      checked={selected.includes(student.id)}
                      onCheckedChange={checked =>
                        setSelected(previous =>
                          checked ? [...previous, student.id] : previous.filter(id => id !== student.id),
                        )
                      }
                    />
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">{student.name}</div>
                    <div className="font-mono text-muted-foreground text-xs">{student.id}</div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{student.className || '—'}</TableCell>
                  <TableCell>
                    {student.claimKey ? (
                      <span className="inline-flex items-center gap-1 font-mono text-xs">
                        {revealed.includes(student.id) ? student.claimKey : '••••••'}
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          aria-label={(revealed.includes(student.id) ? '隐藏' : '显示') + student.name + '的认领密钥'}
                          aria-pressed={revealed.includes(student.id)}
                          onClick={() => toggleKey(student.id)}
                        >
                          {revealed.includes(student.id) ? <EyeOff /> : <Eye />}
                        </Button>
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {profiles.find(profile => profile.id === student.profileId)?.name || '遵循平台规则'}
                  </TableCell>
                  <TableCell>
                    {student.deleting || student.resource ? (
                      <Status state={student.deleting ? 'deleting' : student.resource!.state} />
                    ) : (
                      <Badge variant={student.claimed ? 'outline' : 'secondary'}>
                        {student.claimed ? '已认领' : '未认领'}
                      </Badge>
                    )}
                    {student.resource && (
                      <div className="mt-0.5 font-mono text-muted-foreground text-xs">
                        {student.resource.networks[0].ip}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <Menu>
                      <MenuTrigger
                        render={
                          <Button type="button" variant="ghost" size="icon-sm" aria-label={'操作 ' + student.name} />
                        }
                      >
                        <Ellipsis />
                      </MenuTrigger>
                      <MenuPopup align="end">
                        <MenuItem disabled={student.deleting} onClick={() => onEdit(student)}>
                          编辑
                        </MenuItem>
                        {student.resource && <MenuItem onClick={() => onMachine(student)}>查看机器</MenuItem>}
                        <MenuSeparator />
                        {student.claimed && !student.resource && (
                          <MenuItem
                            variant="destructive"
                            disabled={student.deleting}
                            onClick={() => setResetStudent(student)}
                          >
                            重置认领
                          </MenuItem>
                        )}
                        <MenuItem
                          variant="destructive"
                          disabled={student.deleting}
                          onClick={() => chooseBatch('delete', [student.id])}
                        >
                          删除
                        </MenuItem>
                      </MenuPopup>
                    </Menu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <Empty title="没有匹配的学生" />
        )}
      </Card>
      {selected.length > 0 && (
        <div
          role="toolbar"
          aria-label="批量操作"
          className="sticky bottom-4 z-20 mx-auto flex max-w-full flex-wrap items-center gap-1 rounded-xl border bg-popover p-1.5 ps-4 shadow-lg/5"
        >
          <span className="me-2 text-sm">
            已选择 <span className="font-medium tabular-nums">{selected.length}</span> 人
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() =>
              setSelected(filtered.filter(student => !selected.includes(student.id)).map(student => student.id))
            }
          >
            反选
          </Button>
          <Menu>
            <MenuTrigger render={<Button type="button" variant="ghost" size="sm" loading={assign.pending} />}>
              指定配置
              <ChevronDown />
            </MenuTrigger>
            <MenuPopup align="center" side="top">
              {profiles.map(profile => (
                <MenuItem
                  key={profile.id}
                  onClick={() => assign.run('admin/students/assign', { ids: selected, profileId: profile.id })}
                >
                  {profile.name}
                </MenuItem>
              ))}
              {profiles.length > 0 && <MenuSeparator />}
              <MenuItem onClick={() => assign.run('admin/students/assign', { ids: selected, profileId: null })}>
                取消指定
              </MenuItem>
            </MenuPopup>
          </Menu>
          <Menu>
            <MenuTrigger render={<Button type="button" variant="ghost" size="sm" />}>
              电源
              <ChevronDown />
            </MenuTrigger>
            <MenuPopup align="center" side="top">
              {powerActions.map(action => (
                <MenuItem key={action} onClick={() => chooseBatch(action)}>
                  {batchNames[action]}
                </MenuItem>
              ))}
            </MenuPopup>
          </Menu>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-destructive-foreground"
            onClick={() => chooseBatch('reclaim')}
          >
            {batchNames.reclaim}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-destructive-foreground"
            onClick={() => chooseBatch('delete')}
          >
            {batchNames.delete}
          </Button>
          <Button type="button" variant="ghost" size="icon-sm" aria-label="清空选择" onClick={() => setSelected([])}>
            <X />
          </Button>
        </div>
      )}
      {result && (
        <Card>
          <CardHeader>
            <CardTitle render={<h2 />}>批量操作受理结果</CardTitle>
            <CardDescription>已提交的任务在后台继续执行</CardDescription>
            <CardAction>
              <Button type="button" variant="outline" size="sm" render={<Link to="/admin/tasks" />}>
                查看任务记录
              </Button>
            </CardAction>
          </CardHeader>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>学号</TableHead>
                <TableHead>结果</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.items.map(item => (
                <TableRow key={item.studentId}>
                  <TableCell className="font-mono text-xs">{item.studentId}</TableCell>
                  <TableCell>
                    {item.status === 'queued' ? '已提交' : item.status === 'skipped' ? '已跳过' : '未受理'}
                    {item.message && <div className="text-muted-foreground text-xs">{item.message}</div>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
      <Modal
        destructive={batch?.action === 'delete' || batch?.action === 'reclaim'}
        open={!!batch}
        onClose={() => setBatch(undefined)}
        title={batch ? batchNames[batch.action] : '批量操作'}
        description={
          batch?.action === 'delete'
            ? '将停用账号，回收机器及转发，成功后删除名单；机器中的数据会被永久清空。'
            : batch?.action === 'reclaim'
              ? '将回收所选学生的机器及转发，系统盘数据会被永久清空。'
              : '对以下学生的机器提交后台操作，没有机器的学生会被跳过。'
        }
        footer={
          <Button
            type="button"
            variant={expected ? 'destructive' : 'default'}
            loading={command.pending}
            disabled={!!expected && confirmation !== expected}
            onClick={async () => {
              if (!batch) return;
              const response = await command.run<BatchResult>('admin/students/batch', { ...batch, confirmation });
              if (response) {
                setResult(response);
                setSelected([]);
                setBatch(undefined);
              }
            }}
          >
            确认{batch ? batchNames[batch.action] : ''}
          </Button>
        }
      >
        <div className="flex flex-col gap-4">
          <p>
            共 {batch?.ids.length || 0} 名学生，当前有{' '}
            {students.filter(student => batch?.ids.includes(student.id) && student.resource).length} 台机器。
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
                {students
                  .filter(student => batch?.ids.includes(student.id))
                  .map(student => (
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
      <Modal
        destructive
        open={!!resetStudent}
        onClose={() => setResetStudent(undefined)}
        title="重置学生认领"
        description="清除平台密码并撤销登录状态，认领密钥保留；此学号可以凭原密钥重新认领。"
        footer={
          <Button
            type="button"
            variant="destructive"
            loading={command.pending}
            onClick={async () => {
              if (resetStudent && (await command.run('admin/students/' + resetStudent.id + '/reset')))
                setResetStudent(undefined);
            }}
          >
            确认重置
          </Button>
        }
      >
        <Feedback error={command.error} />
      </Modal>
    </>
  );
}
