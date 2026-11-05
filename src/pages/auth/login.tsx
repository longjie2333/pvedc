import { useCommand } from '@/lib/api';
import { AuthHeading } from '@/layouts/auth-layout';
import { StudentAuthTabs } from '@/components/auth/student-auth-tabs';
import { Feedback } from '@/components/common/feedback';
import { TextField } from '@/components/common/form-fields';
import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form';

export function LoginPage() {
  const command = useCommand();
  return (
    <>
      <AuthHeading title="登录学生工作台" intro="使用学号和密码，继续你的项目。" />
      <StudentAuthTabs>
        <Feedback {...command} />
        <Form
          onSubmit={async event => {
            event.preventDefault();
            const data = Object.fromEntries(new FormData(event.currentTarget));
            await command.run('auth/student', { studentId: data.studentId, password: data.password });
          }}
          className="flex flex-col gap-4"
        >
          <TextField label="学号" name="studentId" autoComplete="username" required placeholder="输入你的学号" />
          <TextField
            label="密码"
            name="password"
            type="password"
            minLength={10}
            maxLength={128}
            autoComplete="current-password"
            required
            placeholder="输入密码"
          />
          <Button type="submit" loading={command.pending} className="w-full">
            登录
          </Button>
        </Form>
      </StudentAuthTabs>
    </>
  );
}
