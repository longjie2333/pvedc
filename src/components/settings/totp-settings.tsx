import { useState } from 'react';
import { useCommand } from '@/lib/api';
import { copyText } from '@/lib/feedback';
import { OtpInput } from '@/components/common/otp-input';
import { Panel } from '@/components/common/panel';
import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form';

export function TotpSettings() {
  const [rotation, setRotation] = useState<{ secret: string; qr: string }>();
  const command = useCommand();
  return (
    <Panel title="管理员身份验证" detail="重新绑定会撤销已有管理员会话；请保存新密钥。">
      <Form
        className="flex max-w-lg flex-col gap-4 p-6"
        onSubmit={async event => {
          event.preventDefault();
          const code = new FormData(event.currentTarget).get('code');
          if (rotation) {
            if (await command.run('auth/rotate-complete', { code })) setRotation(undefined);
          } else {
            const result = await command.run<{ secret: string; qr: string }>('auth/rotate-begin', { code });
            if (result) setRotation(result);
          }
        }}
      >
        {rotation && (
          <div className="setup-secret">
            <img src={rotation.qr} alt="新的 TOTP 二维码" />
            <code>{rotation.secret}</code>
            <Button type="button" variant="outline" onClick={() => copyText(rotation.secret, '新密钥')}>
              复制新密钥
            </Button>
          </div>
        )}
        <OtpInput
          key={rotation ? 'new' : 'current'}
          label={rotation ? '新密钥验证码' : '当前验证码'}
          disabled={command.pending}
          error={command.error}
        />
        <Button type="submit" loading={command.pending}>
          {rotation ? '确认新密钥' : '重新绑定 TOTP'}
        </Button>
      </Form>
    </Panel>
  );
}
