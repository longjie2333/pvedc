import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { request, useCommand } from '@/lib/api';
import { copyText } from '@/lib/feedback';
import { AuthHeading } from '@/layouts/auth-layout';
import { Feedback } from '@/components/common/feedback';
import { OtpInput } from '@/components/common/otp-input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Form } from '@/components/ui/form';

/** First-run administrator TOTP binding; the key is generated as soon as the page opens. */
export function SetupPage() {
  const command = useCommand();
  const [setup, setSetup] = useState<{ secret: string; qr: string; expiresAt: number }>();
  const [savedKey, setSavedKey] = useState(false),
    [loading, setLoading] = useState(false),
    [error, setError] = useState('');
  const generate = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setSetup(await request('setup/begin', {}));
    } catch (error) {
      setError(error instanceof Error ? error.message : '生成密钥失败');
    } finally {
      setLoading(false);
    }
  }, []);
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void generate();
  }, [generate]);
  return (
    <>
      <AuthHeading title="设置管理员身份" intro="保存验证密钥，并使用身份验证器完成首次绑定。" />
      <Feedback error={error} />
      {setup ? (
        <Form
          onSubmit={async event => {
            event.preventDefault();
            await command.run('setup/complete', { code: new FormData(event.currentTarget).get('code') });
          }}
          className="flex flex-col gap-4"
        >
          <div className="setup-secret">
            <img src={setup.qr} alt="管理员 TOTP 绑定二维码" />
            <p>用身份验证器扫描二维码，并离线保存密钥。</p>
            <code>{setup.secret}</code>
            <Button variant="outline" onClick={() => copyText(setup.secret)}>
              复制密钥
            </Button>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox required checked={savedKey} onCheckedChange={setSavedKey} />
              我已安全保存验证密钥
            </label>
          </div>
          <OtpInput disabled={command.pending || !savedKey} error={command.error} />
          <Button type="submit" loading={command.pending} disabled={!savedKey} className="w-full">
            完成绑定，进入管理后台
          </Button>
        </Form>
      ) : (
        <Button loading={loading} className="w-full" onClick={generate}>
          生成验证密钥 <ArrowRight />
        </Button>
      )}
    </>
  );
}
