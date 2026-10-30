import { useState } from 'react';
import { ArrowDownToLine, Upload, UserPlus } from 'lucide-react';
import type { AdminStudent, Resource } from '../../../shared/schema';
import { downloadFile } from '@/lib/api';
import { useAdminOverview } from '@/lib/queries';
import { HeaderActions, HeaderButton } from '@/layouts/header-actions';
import { Feedback, Loading } from '@/components/common/feedback';
import { CatalogEditor } from '@/components/catalog/catalog-editor';
import { MachineDialog } from '@/components/resource/machine-dialog';
import { StudentImportDialog } from '@/components/students/student-import-dialog';
import { StudentRoster } from '@/components/students/student-roster';

export function StudentsPage() {
  const overview = useAdminOverview();
  const [editing, setEditing] = useState<{ item?: AdminStudent }>(),
    [importing, setImporting] = useState(false),
    [machine, setMachine] = useState<Resource>();
  if (overview.isPending) return <Loading />;
  if (overview.error) return <Feedback error={overview.error.message} />;
  const { students, profiles, networks } = overview.data;
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
        <HeaderButton
          type="button"
          variant="outline"
          icon={<Upload />}
          label="导入名单"
          onClick={() => setImporting(true)}
        />
        <HeaderButton type="button" icon={<UserPlus />} label="添加学生" onClick={() => setEditing({})} />
      </HeaderActions>
      <StudentRoster
        students={students}
        profiles={profiles}
        onEdit={student => setEditing({ item: student })}
        onMachine={student => setMachine(student.resource!)}
      />
      {editing && (
        <CatalogEditor
          key={'students' + (editing.item?.id || 'new')}
          kind="students"
          item={editing.item}
          profiles={profiles}
          networks={networks}
          onClose={() => setEditing(undefined)}
        />
      )}
      <StudentImportDialog open={importing} onClose={() => setImporting(false)} />
      <MachineDialog resource={machine} onClose={() => setMachine(undefined)} />
    </>
  );
}
