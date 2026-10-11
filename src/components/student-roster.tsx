import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDownToLine, Search } from 'lucide-react';
import type { AdminStudent, Profile } from '../../shared/schema';
import { batchActions, batchConfirmation, batchNames, type BatchAction, type BatchResult } from '../../shared/batch';
import { downloadFile, useCommand } from '@/lib/api';
import { Choice, Empty, Feedback, Modal, Panel, Status, TextField } from './common';
import { Button } from './ui/button';
import { Checkbox } from './ui/checkbox';
import { Input } from './ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';

export function StudentRoster({ students, profiles, onEdit, onMachine, onImport }: {
  students: AdminStudent[]; profiles: Profile[]; onEdit: (student: AdminStudent) => void; onMachine: (student: AdminStudent) => void; onImport: () => void;
}) {
  const [query, setQuery] = useState(''), [selected, setSelected] = useState<string[]>([]), [assign, setAssign] = useState('');
  const [batch, setBatch] = useState<{ ids: string[]; action: BatchAction }>(), [confirmation, setConfirmation] = useState('');
  const [result, setResult] = useState<BatchResult>(), [resetStudent, setResetStudent] = useState<AdminStudent>();
  const command = useCommand();
  const filtered = useMemo(() => students.filter(student => [student.id, student.name, student.className].some(value => value.includes(query))), [students, query]);
  const all = filtered.length > 0 && filtered.every(student => selected.includes(student.id));
  const expected = batch ? batchConfirmation(batch.action, batch.ids.length) : '';
  useEffect(() => {
    const existing = new Set(filtered.map(student => student.id));
    setSelected(previous => { const current = previous.filter(id => existing.has(id)); return current.length === previous.length ? previous : current; });
  }, [filtered]);
  const chooseBatch = (action: BatchAction, ids = selected) => { setConfirmation(''); setBatch({ action, ids: [...ids] }); };
  return <>
    <Panel title="全体学生" detail={'共 ' + students.length + ' 人'} action={<div className="flex gap-2"><Button type="button" variant="outline" onClick={onImport}>导入名单</Button><Button type="button" variant="outline" onClick={() => downloadFile('admin/students/export', 'students.csv')}><ArrowDownToLine/>导出</Button></div>}>
      {!batch && !resetStudent && <Feedback error={command.error}/>}
      <div className="flex flex-col gap-4 p-5">
        <div className="flex flex-wrap items-center gap-2"><div className="search-box"><Search/><Input type="search" aria-label="搜索学生" placeholder="搜索学号、姓名或班级" value={query} onChange={event => { setQuery(event.target.value); setSelected([]); }}/></div>
          <Button type="button" variant="outline" onClick={() => setSelected(filtered.map(student => student.id))}>全选</Button>
          <Button type="button" variant="outline" onClick={() => setSelected(filtered.filter(student => !selected.includes(student.id)).map(student => student.id))}>反选</Button>
          <Button type="button" variant="ghost" onClick={() => setSelected([])}>清空选择</Button><span className="text-sm text-muted-foreground">已选择 {selected.length} 人</span>
        </div>
        {selected.length > 0 && <div className="flex flex-col gap-3 border-t pt-4">
          <div className="flex flex-wrap items-end gap-2"><Choice label="批量指定配置" value={assign} onChange={setAssign} items={[{ value: '', label: '取消指定' }, ...profiles.map(profile => ({ value: profile.id, label: profile.name }))]}/><Button type="button" loading={command.pending} onClick={() => command.run('admin/students/assign', { ids: selected, profileId: assign || null })}>应用</Button></div>
          <div className="flex flex-wrap gap-2">{batchActions.map(action => <Button key={action} type="button" variant={['reclaim', 'delete'].includes(action) ? 'destructive-outline' : 'outline'} onClick={() => chooseBatch(action)}>{'批量' + batchNames[action]}</Button>)}</div>
        </div>}
      </div>
      {filtered.length ? <Table><TableHeader><TableRow><TableHead><Checkbox aria-label="全选当前结果" checked={all} indeterminate={selected.length > 0 && !all} onCheckedChange={checked => setSelected(checked ? filtered.map(student => student.id) : [])}/></TableHead><TableHead>学生</TableHead><TableHead>班级</TableHead><TableHead>认领密钥</TableHead><TableHead>指定配置</TableHead><TableHead>认领 / 资源</TableHead><TableHead>操作</TableHead></TableRow></TableHeader><TableBody>
        {filtered.map(student => <TableRow key={student.id}>
          <TableCell><Checkbox aria-label={'选择 ' + student.name} checked={selected.includes(student.id)} onCheckedChange={checked => setSelected(previous => checked ? [...previous, student.id] : previous.filter(id => id !== student.id))}/></TableCell>
          <TableCell><strong>{student.name}</strong><small className="mono">{student.id}</small></TableCell><TableCell>{student.className || '—'}</TableCell>
          <TableCell className="mono">{student.claimKey || '—'}</TableCell>
          <TableCell>{profiles.find(profile => profile.id === student.profileId)?.name || '遵循平台规则'}</TableCell>
          <TableCell><Status state={student.deleting ? 'deleting' : student.resource?.state || (student.claimed ? '已认领' : '未认领')}/>{student.resource && <small className="mono">{student.resource.ip}</small>}</TableCell>
          <TableCell><div className="flex gap-1"><Button type="button" size="xs" variant="ghost" disabled={student.deleting} onClick={() => onEdit(student)}>编辑</Button>
            {student.resource ? <Button type="button" size="xs" variant="ghost" onClick={() => onMachine(student)}>机器</Button> : student.claimed && <Button type="button" size="xs" variant="ghost" disabled={student.deleting} onClick={() => setResetStudent(student)}>重置认领</Button>}
            <Button type="button" size="xs" variant="ghost" disabled={student.deleting} onClick={() => chooseBatch('delete', [student.id])}>删除</Button>
          </div></TableCell>
        </TableRow>)}
      </TableBody></Table> : <Empty title="没有匹配的学生">添加学生、导入名单或调整搜索条件。</Empty>}
    </Panel>
    {result && <Panel title="批量操作受理结果" detail="已提交的任务在后台继续执行" action={<Button type="button" variant="outline" render={<Link to="/admin/tasks"/>}>查看任务记录</Button>}>
      <Table><TableHeader><TableRow><TableHead>学号</TableHead><TableHead>结果</TableHead></TableRow></TableHeader><TableBody>{result.items.map(item => <TableRow key={item.studentId}><TableCell>{item.studentId}</TableCell><TableCell>{item.status === 'queued' ? '已提交' : item.status === 'skipped' ? '已跳过' : '未受理'}<small>{item.message}</small></TableCell></TableRow>)}</TableBody></Table>
    </Panel>}
    <Modal destructive={batch?.action === 'delete' || batch?.action === 'reclaim'} open={!!batch} onClose={() => setBatch(undefined)} title={batch ? batchNames[batch.action] : '批量操作'}
      description={batch?.action === 'delete' ? '将停用账号，回收机器及转发，成功后删除名单；机器中的数据会被永久清空。' : batch?.action === 'reclaim' ? '将回收所选学生的机器及转发，系统盘数据会被永久清空。' : '对以下学生的机器提交后台操作，没有机器的学生会被跳过。'}
      footer={<Button type="button" variant={expected ? 'destructive' : 'default'} loading={command.pending} disabled={!!expected && confirmation !== expected} onClick={async () => {
        if (!batch) return;
        const response = await command.run<BatchResult>('admin/students/batch', { ...batch, confirmation });
        if (response) { setResult(response); setSelected([]); setBatch(undefined); }
      }}>确认{batch ? batchNames[batch.action] : ''}</Button>}>
      <div className="flex flex-col gap-4"><p>共 {batch?.ids.length || 0} 名学生，当前有 {students.filter(student => batch?.ids.includes(student.id) && student.resource).length} 台机器。</p>
        <div className="max-h-64 overflow-y-auto"><Table><TableHeader><TableRow><TableHead>学生</TableHead><TableHead>机器 / IP</TableHead></TableRow></TableHeader><TableBody>{students.filter(student => batch?.ids.includes(student.id)).map(student => <TableRow key={student.id}><TableCell>{student.id} · {student.name}</TableCell><TableCell>{student.resource ? student.resource.vmid + ' · ' + student.resource.ip : '未分配'}</TableCell></TableRow>)}</TableBody></Table></div>
        {expected && <TextField label={'请输入“' + expected + '”'} value={confirmation} onChange={event => setConfirmation(event.target.value)}/>}
        <Feedback error={command.error}/>
      </div>
    </Modal>
    <Modal destructive open={!!resetStudent} onClose={() => setResetStudent(undefined)} title="重置学生认领" description="清除平台密码并撤销登录状态，认领密钥保留；此学号可以凭原密钥重新认领。"
      footer={<Button type="button" variant="destructive" loading={command.pending} onClick={async () => { if (resetStudent && await command.run('admin/students/' + resetStudent.id + '/reset')) setResetStudent(undefined); }}>确认重置</Button>}><Feedback error={command.error}/></Modal>
  </>;
}
