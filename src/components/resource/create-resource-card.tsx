import { useState } from 'react';
import type { ProfileSummary } from '../../../shared/schema';
import { useCommand } from '@/lib/api';
import { ProfileChoice } from '@/components/catalog/profile-choice';
import { Feedback } from '@/components/common/feedback';
import { TextField } from '@/components/common/form-fields';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardPanel, CardTitle } from '@/components/ui/card';
import { Form } from '@/components/ui/form';

/** Student's first allocation; `profiles` is set only when the student may pick a profile. */
export function CreateResourceCard({ profiles }: { profiles?: ProfileSummary[] }) {
  const command = useCommand(),
    [profile, setProfile] = useState('');
  return (
    <Card>
      <CardHeader>
        <CardTitle render={<h2 />}>创建你的计算环境</CardTitle>
        <CardDescription>输入平台密码开始分配，系统会同步设置 root 密码。</CardDescription>
      </CardHeader>
      <CardPanel>
        <Form
          className="flex max-w-lg flex-col gap-4"
          onSubmit={async event => {
            event.preventDefault();
            await command.run('me/create', {
              password: new FormData(event.currentTarget).get('password'),
              profileId: profile || undefined,
            });
          }}
        >
          <Feedback {...command} />
          {profiles && <ProfileChoice value={profile} onChange={setProfile} items={profiles} />}
          <TextField label="平台密码" name="password" type="password" required minLength={10} />
          <Button type="submit" className="self-start" loading={command.pending}>
            创建资源
          </Button>
        </Form>
      </CardPanel>
    </Card>
  );
}
