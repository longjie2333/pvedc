import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import type { AdminStudent, Profile } from '../../../shared/schema';
import type { BatchAction, BatchResult } from '../../../shared/batch';
import { segmentedControlItemVariants, segmentedControlRootClassName } from '@/lib/segmented-control';
import { ConfirmAction, type PendingAction } from '@/components/common/confirm-action';
import { Card } from '@/components/ui/card';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';
import { MenuItem, MenuSeparator } from '@/components/ui/menu';
import { RadioGroupPrimitive, RadioPrimitive } from '@/components/ui/radio-group';
import { BatchDialog, type Batch } from './batch-dialog';
import { BatchResultCard } from './batch-result';
import { BatchToolbar } from './batch-toolbar';
import { StudentTable } from './student-table';

type Filter = 'all' | 'claimed' | 'unclaimed';
const filters = [
  ['all', '全部'],
  ['claimed', '已认领'],
  ['unclaimed', '未认领'],
] as const;
const matchesFilter = (student: AdminStudent, filter: Filter) =>
  filter === 'all' || student.claimed === (filter === 'claimed');

/** Searchable roster with selection and batch actions; editing and machine views belong to the page. */
export function StudentRoster({
  students,
  profiles,
  onEdit,
  onMachine,
}: {
  students: AdminStudent[];
  profiles: Profile[];
  onEdit: (student: AdminStudent) => void;
  onMachine: (student: AdminStudent) => void;
}) {
  const [query, setQuery] = useState(''),
    [filter, setFilter] = useState<Filter>('all'),
    [picked, setPicked] = useState<string[]>([]);
  const [batch, setBatch] = useState<Batch>(),
    [result, setResult] = useState<BatchResult>(),
    [reset, setReset] = useState<PendingAction>();
  const filtered = useMemo(
    () =>
      students.filter(
        student =>
          matchesFilter(student, filter) &&
          [student.id, student.name, student.className].some(value => value.includes(query)),
      ),
    [students, filter, query],
  );
  const visible = filtered.map(student => student.id);
  // Selection only ever covers the current results; students that leave them drop out.
  const selected = picked.filter(id => visible.includes(id));
  const counts = {
    all: students.length,
    claimed: students.filter(student => student.claimed).length,
    unclaimed: students.filter(student => !student.claimed).length,
  };
  const chooseBatch = (action: BatchAction, ids = selected) => setBatch({ action, ids });
  return (
    <>
      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b px-6 py-4">
          <RadioGroupPrimitive
            aria-label="认领状态"
            value={filter}
            onValueChange={value => {
              setFilter(value as Filter);
              setPicked([]);
            }}
            className={segmentedControlRootClassName}
          >
            {filters.map(([value, label]) => (
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
                setPicked([]);
              }}
            />
            <InputGroupAddon>
              <Search />
            </InputGroupAddon>
          </InputGroup>
        </div>
        <StudentTable
          students={filtered}
          profiles={profiles}
          selected={selected}
          onSelectedChange={setPicked}
          menu={student => (
            <>
              <MenuItem disabled={student.deleting} onClick={() => onEdit(student)}>
                编辑
              </MenuItem>
              {student.resource && <MenuItem onClick={() => onMachine(student)}>查看机器</MenuItem>}
              <MenuSeparator />
              {student.claimed && !student.resource && (
                <MenuItem
                  variant="destructive"
                  disabled={student.deleting}
                  onClick={() =>
                    setReset({
                      title: '重置学生认领',
                      description: '清除平台密码并撤销登录状态，认领密钥保留；此学号可以凭原密钥重新认领。',
                      path: 'admin/students/' + student.id + '/reset',
                    })
                  }
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
            </>
          )}
        />
      </Card>
      {selected.length > 0 && (
        <BatchToolbar
          selected={selected}
          visible={visible}
          profiles={profiles}
          onSelectedChange={setPicked}
          onBatch={chooseBatch}
        />
      )}
      {result && <BatchResultCard result={result} />}
      {batch && (
        <BatchDialog
          batch={batch}
          students={students}
          onClose={() => setBatch(undefined)}
          onDone={response => {
            setResult(response);
            setPicked([]);
            setBatch(undefined);
          }}
        />
      )}
      <ConfirmAction action={reset} onClose={() => setReset(undefined)} confirmLabel="确认重置" />
    </>
  );
}
