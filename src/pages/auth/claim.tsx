import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { request, useCommand } from '@/lib/api';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { AuthHeading } from '@/layouts/auth-layout';
import { StudentAuthTabs } from '@/components/auth/student-auth-tabs';
import { ProfileChoice } from '@/components/catalog/profile-choice';
import { Feedback } from '@/components/common/feedback';
import { TextField } from '@/components/common/form-fields';
import { Button } from '@/components/ui/button';
import {
  Combobox,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxPopup,
} from '@/components/ui/combobox';
import { Field, FieldLabel } from '@/components/ui/field';
import { Form } from '@/components/ui/form';

interface Roster {
  open: boolean;
  selfSelection: boolean;
  students: RosterStudent[];
  profiles: { id: string; name: string; cores: number; memory: number; disk: number; distro: 'ubuntu' | 'debian' }[];
  defaultProfileId: string;
}
type RosterStudent = { id: string; name: string; className: string; assigned: boolean; keyRequired: boolean };

export function ClaimPage() {
  const command = useCommand();
  const [search, setSearch] = useState(''),
    query = useDebouncedValue(search.trim(), 250);
  const [student, setStudent] = useState<RosterStudent | null>(null),
    [profile, setProfile] = useState('');
  const roster = useQuery({
    queryKey: ['roster', query],
    queryFn: () => request<Roster>('public/roster?q=' + encodeURIComponent(query)),
  });
  const searching = roster.isFetching || search.trim() !== query;
  const matches = roster.data?.students || [];
  // Keep the chosen student selectable while a new search narrows the list.
  const options = student && !matches.some(item => item.id === student.id) ? [student, ...matches] : matches;
  const closed = roster.data && !roster.data.open;
  return (
    <>
      <AuthHeading title="认领我的计算资源" intro="从名单中选择自己，设置密码后开始创建。" />
      <StudentAuthTabs>
        <Feedback {...command} />
        <Feedback error={roster.error?.message} />
        <Form
          onSubmit={async event => {
            event.preventDefault();
            const data = Object.fromEntries(new FormData(event.currentTarget));
            await command.run('public/claim', {
              studentId: student?.id,
              password: data.password,
              profileId: profile || undefined,
              claimKey: data.claimKey || undefined,
            });
          }}
          className="flex flex-col gap-4"
        >
          <Field name="studentId">
            <FieldLabel>我的学号</FieldLabel>
            <Combobox
              items={options}
              filteredItems={searching ? options : matches}
              value={student}
              onValueChange={setStudent}
              required
              itemToStringLabel={item => item.id + ' · ' + item.name}
              itemToStringValue={item => item.id}
              isItemEqualToValue={(a, b) => a.id === b.id}
              onInputValueChange={(value, details) => {
                if (['input-change', 'input-clear', 'clear-press'].includes(details.reason)) {
                  setSearch(value);
                  setStudent(null);
                }
              }}
            >
              <ComboboxInput
                type="text"
                placeholder="输入学号或姓名搜索"
                showClear
                clearProps={{ 'aria-label': '清除学号' }}
                triggerProps={{ 'aria-label': '选择学号' }}
              />
              <ComboboxPopup>
                <ComboboxEmpty>
                  {searching ? '正在查找学生…' : roster.error ? '名单加载失败，请重试' : '没有匹配的未认领学生'}
                </ComboboxEmpty>
                <ComboboxList className="claim-options-list">
                  {(item: RosterStudent) => (
                    <ComboboxItem key={item.id} value={item}>
                      <span>
                        {item.id} · {item.name}
                        <small>{item.className || '未填写班级'}</small>
                      </span>
                    </ComboboxItem>
                  )}
                </ComboboxList>
              </ComboboxPopup>
            </Combobox>
          </Field>
          {student?.keyRequired && (
            <TextField
              key={student.id}
              label="认领密钥"
              name="claimKey"
              required
              maxLength={64}
              autoComplete="off"
              hint="请输入管理员提供的认领密钥，区分大小写。"
              placeholder="输入认领密钥"
            />
          )}
          {student?.assigned ? (
            <div className="subtle-note">管理员已为你指定资源配置。</div>
          ) : (
            roster.data?.selfSelection && (
              <ProfileChoice value={profile} onChange={setProfile} items={roster.data.profiles} />
            )
          )}
          <TextField
            label="设置密码"
            name="password"
            type="password"
            minLength={10}
            maxLength={128}
            autoComplete="new-password"
            required
            hint="至少 10 位；此密码也用于 LXC 的 root 登录。"
            placeholder="输入密码"
          />
          <Button type="submit" loading={command.pending} disabled={!student || !roster.data?.open} className="w-full">
            {closed ? '管理员尚未开放资源申请' : '认领并创建资源'}
          </Button>
        </Form>
      </StudentAuthTabs>
    </>
  );
}
