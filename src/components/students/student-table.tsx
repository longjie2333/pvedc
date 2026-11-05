import { useState, type ReactNode } from 'react';
import { Ellipsis, Eye, EyeOff } from 'lucide-react';
import type { AdminStudent, Profile } from '../../../shared/schema';
import { Empty } from '@/components/common/feedback';
import { Status } from '@/components/common/status';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Menu, MenuPopup, MenuTrigger } from '@/components/ui/menu';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

/** Roster rows with selection checkboxes; `menu` renders each row's menu items. */
export function StudentTable({
  students,
  profiles,
  selected,
  onSelectedChange,
  menu,
}: {
  students: AdminStudent[];
  profiles: Profile[];
  selected: string[];
  onSelectedChange: (ids: string[]) => void;
  menu: (student: AdminStudent) => ReactNode;
}) {
  const [revealed, setRevealed] = useState<string[]>([]);
  if (!students.length) return <Empty title="没有匹配的学生" />;
  const all = students.every(student => selected.includes(student.id));
  const toggleKey = (id: string) =>
    setRevealed(previous => (previous.includes(id) ? previous.filter(item => item !== id) : [...previous, id]));
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-10">
            <Checkbox
              aria-label="全选当前结果"
              checked={all}
              indeterminate={selected.length > 0 && !all}
              onCheckedChange={checked => onSelectedChange(checked ? students.map(student => student.id) : [])}
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
        {students.map(student => {
          const shown = revealed.includes(student.id);
          return (
            <TableRow key={student.id} data-state={selected.includes(student.id) ? 'selected' : undefined}>
              <TableCell>
                <Checkbox
                  aria-label={'选择 ' + student.name}
                  checked={selected.includes(student.id)}
                  onCheckedChange={checked =>
                    onSelectedChange(checked ? [...selected, student.id] : selected.filter(id => id !== student.id))
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
                    {shown ? student.claimKey : '••••••'}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      aria-label={(shown ? '隐藏' : '显示') + student.name + '的认领密钥'}
                      aria-pressed={shown}
                      onClick={() => toggleKey(student.id)}
                    >
                      {shown ? <EyeOff /> : <Eye />}
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
                    render={<Button type="button" variant="ghost" size="icon-sm" aria-label={'操作 ' + student.name} />}
                  >
                    <Ellipsis />
                  </MenuTrigger>
                  <MenuPopup align="end">{menu(student)}</MenuPopup>
                </Menu>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
