import { useState, type FormEvent } from 'react';
import type { AdminStudent, Profile } from '../../../shared/schema';
import { useCommand } from '@/lib/api';
import { Choice, FormSection, TextField } from '@/components/common/form-fields';
import { SwitchSetting } from '@/components/common/switch-setting';
import { EditorDialog } from './editor-dialog';

export function StudentEditor({
  student,
  profiles,
  onClose,
}: {
  student?: AdminStudent;
  profiles: Profile[];
  onClose: () => void;
}) {
  const command = useCommand();
  const [profileId, setProfileId] = useState(student?.profileId || ''),
    [enabled, setEnabled] = useState(student?.enabled !== false);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    // The id input is disabled while editing, so it is not part of the form data.
    const body = { ...values, id: student?.id || values.id, profileId: profileId || null, enabled };
    if (await command.run('admin/students', body)) onClose();
  }
  return (
    <EditorDialog
      title={(student ? '编辑' : '添加') + '学生'}
      description="名单指定的配置优先于默认及学生自选配置。"
      pending={command.pending}
      error={command.error}
      onSubmit={save}
      onClose={onClose}
    >
      <div className="form-grid">
        <TextField label="学号" name="id" defaultValue={student?.id ?? ''} required disabled={!!student} />
        <TextField label="姓名" name="name" defaultValue={student?.name ?? ''} required />
        <TextField label="班级" name="className" defaultValue={student?.className ?? ''} />
        <TextField
          label="认领密钥"
          name="claimKey"
          defaultValue={student?.claimKey ?? ''}
          maxLength={64}
          autoComplete="off"
          hint="留空表示认领时无需填写密钥。"
        />
        <Choice
          label="指定配置"
          value={profileId}
          onChange={setProfileId}
          items={[
            { value: '', label: '不指定，遵循平台分配规则' },
            ...profiles.map(profile => ({ value: profile.id, label: profile.name })),
          ]}
        />
      </div>
      <FormSection legend="选项">
        <div className="grid gap-3">
          <SwitchSetting
            label="启用"
            description="允许此学生登录和认领资源。"
            checked={enabled}
            onChange={setEnabled}
          />
        </div>
      </FormSection>
    </EditorDialog>
  );
}
