import { useLocation, useNavigate } from 'react-router-dom';
import { useCommand } from '@/lib/api';
import { AuthHeading } from '@/layouts/auth-layout';
import { OtpInput } from '@/components/common/otp-input';
import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form';

export function AdminLoginPage() {
  const command = useCommand();
  const navigate = useNavigate(),
    { state } = useLocation();
  return (
    <>
      <AuthHeading title="管理员验证" intro="输入身份验证器中的六位动态验证码。" />
      <Form
        onSubmit={async event => {
          event.preventDefault();
          await command.run('auth/admin', { code: new FormData(event.currentTarget).get('code') });
        }}
        className="flex flex-col gap-4"
      >
        <OtpInput disabled={command.pending} error={command.error} />
        <Button type="submit" loading={command.pending} className="w-full">
          登录
        </Button>
      </Form>
      <Button
        type="button"
        variant="link"
        className="self-center text-muted-foreground"
        onClick={() => navigate('/login', { replace: true, state })}
      >
        返回学生登录
      </Button>
    </>
  );
}
