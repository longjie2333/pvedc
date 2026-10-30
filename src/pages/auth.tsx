import { copyText } from '@/lib/feedback';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Check, Server } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form';
import { Checkbox } from '@/components/ui/checkbox';
import { Field, FieldLabel } from '@/components/ui/field';
import { Tabs, TabsList, TabsPanel, TabsTab } from '@/components/ui/tabs';
import {
  Combobox,
  ComboboxInput,
  ComboboxPopup,
  ComboboxEmpty,
  ComboboxList,
  ComboboxItem,
} from '@/components/ui/combobox';
import { OtpInput } from '@/components/otp-input';
import { Feedback, ProfileChoice, TextField } from '@/components/common';
import { request, useCommand } from '@/lib/api';

const features = ['独立的 Linux 环境', '资源状态一目了然', '公网服务轻松访问'];
// Concentric rings carried over from the original auth-story background.
const rings = 'shadow-[0_0_0_55px_#ffffff03,0_0_0_110px_#ffffff02]';

interface Roster {
  open: boolean;
  selfSelection: boolean;
  students: { id: string; name: string; className: string; assigned: boolean; keyRequired: boolean }[];
  profiles: { id: string; name: string; cores: number; memory: number; disk: number; distro: 'ubuntu' | 'debian' }[];
  defaultProfileId: string;
}
export function AuthPage({ initialized, title }: { initialized: boolean; title: string }) {
  const [savedKey, setSavedKey] = useState(false);
  const [mode, setMode] = useState<'student' | 'admin' | 'claim'>('student');
  const [setup, setSetup] = useState<{ secret: string; qr: string; expiresAt: number }>();
  const [setupLoading, setSetupLoading] = useState(false),
    [setupError, setSetupError] = useState('');
  const setupStarted = useRef(false);
  const generateSetup = useCallback(async () => {
    setSetupLoading(true);
    setSetupError('');
    try {
      setSetup(await request('setup/begin', {}));
    } catch (error) {
      setSetupError(error instanceof Error ? error.message : '生成密钥失败');
    } finally {
      setSetupLoading(false);
    }
  }, []);
  useEffect(() => {
    if (!initialized && !setupStarted.current) {
      setupStarted.current = true;
      void generateSetup();
    }
  }, [initialized, generateSetup]);
  const [query, setQuery] = useState(''),
    [search, setSearch] = useState('');
  const [student, setStudent] = useState<Roster['students'][number] | null>(null),
    [profile, setProfile] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), 250);
    return () => clearTimeout(timer);
  }, [search]);
  const command = useCommand();
  const roster = useQuery({
    queryKey: ['roster', query],
    queryFn: () => request<Roster>('public/roster?q=' + encodeURIComponent(query)),
    enabled: initialized && mode === 'claim',
  });
  const chosen = student;
  const searching = roster.isFetching || search.trim() !== query;
  const matches = roster.data?.students || [];
  const options = student && !matches.some(item => item.id === student.id) ? [student, ...matches] : matches;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    if (!initialized) await command.run('setup/complete', { code: data.code });
    else if (mode === 'admin') await command.run('auth/admin', { code: data.code });
    else if (mode === 'claim')
      await command.run('public/claim', {
        studentId: student?.id,
        password: data.password,
        profileId: profile || undefined,
        claimKey: data.claimKey || undefined,
      });
    else await command.run('auth/student', { studentId: data.studentId, password: data.password });
  }
  const tabbed = initialized && mode !== 'admin';
  const content = (
    <>
      {tabbed && <Feedback {...command} />}
      <Feedback error={setupError || roster.error?.message} />
      {!initialized && !setup ? (
        <Button loading={setupLoading} className="w-full" onClick={generateSetup}>
          生成验证密钥 <ArrowRight />
        </Button>
      ) : (
        <Form onSubmit={submit} className="flex flex-col gap-4">
          {setup && (
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
          )}
          {!initialized || mode === 'admin' ? (
            <OtpInput
              key={initialized ? mode : 'setup'}
              disabled={command.pending || (!initialized && !savedKey)}
              error={command.error}
            />
          ) : (
            <>
              {mode === 'claim' ? (
                <>
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
                          {(item: Roster['students'][number]) => (
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
                  {chosen?.keyRequired && (
                    <TextField
                      key={chosen.id}
                      label="认领密钥"
                      name="claimKey"
                      required
                      maxLength={64}
                      autoComplete="off"
                      hint="请输入管理员提供的认领密钥，区分大小写。"
                      placeholder="输入认领密钥"
                    />
                  )}
                  {chosen?.assigned ? (
                    <div className="subtle-note">管理员已为你指定资源配置。</div>
                  ) : (
                    roster.data?.selfSelection && (
                      <ProfileChoice value={profile} onChange={setProfile} items={roster.data.profiles} />
                    )
                  )}
                </>
              ) : (
                <TextField label="学号" name="studentId" autoComplete="username" required placeholder="输入你的学号" />
              )}
              <TextField
                label={mode === 'claim' ? '设置密码' : '密码'}
                name="password"
                type="password"
                minLength={10}
                maxLength={128}
                autoComplete={mode === 'claim' ? 'new-password' : 'current-password'}
                required
                hint={mode === 'claim' ? '至少 10 位；此密码也用于 LXC 的 root 登录。' : undefined}
                placeholder="输入密码"
              />
            </>
          )}
          <Button
            type="submit"
            loading={command.pending}
            disabled={(!initialized && !savedKey) || (mode === 'claim' && (!student || !roster.data?.open))}
            className="w-full"
          >
            {!initialized
              ? '完成绑定，进入管理后台'
              : mode === 'claim'
                ? roster.data && !roster.data.open
                  ? '管理员尚未开放资源申请'
                  : '认领并创建资源'
                : '登录'}
          </Button>
        </Form>
      )}
    </>
  );
  const heading = !initialized
    ? '设置管理员身份'
    : mode === 'admin'
      ? '管理员验证'
      : mode === 'claim'
        ? '认领我的计算资源'
        : '登录学生工作台';
  const intro = !initialized
    ? '保存验证密钥，并使用身份验证器完成首次绑定。'
    : mode === 'admin'
      ? '输入身份验证器中的六位动态验证码。'
      : mode === 'claim'
        ? '从名单中选择自己，设置密码后开始创建。'
        : '使用学号和密码，继续你的项目。';
  return (
    <div className="grid min-h-svh lg:grid-cols-[48%_52%]">
      <aside className="relative flex flex-col gap-8 overflow-hidden bg-[#123d2c] px-[10%] py-8 text-[#f2f6ef] lg:gap-0 lg:px-[11%] lg:py-12">
        <div
          aria-hidden="true"
          className={
            'pointer-events-none absolute -right-[220px] -bottom-[50px] size-[450px] rounded-full border border-[#ffffff0b] ' +
            rings
          }
        />
        <div className="relative flex items-center gap-2.5 whitespace-nowrap font-semibold text-sm lg:gap-3 lg:font-[650] lg:text-[17px]">
          <span className="grid size-7 place-items-center rounded-lg border border-[#ffffff2a] bg-[#ffffff0d] lg:size-[37px] lg:rounded-[10px]">
            <Server className="size-4 lg:size-[23px]" />
          </span>
          {title}
        </div>
        <div className="relative flex flex-col gap-4 lg:my-auto lg:block lg:py-[75px]">
          <h1 className="font-medium text-3xl leading-tight tracking-tight lg:text-[clamp(38px,4vw,63px)] lg:leading-[1.4] lg:tracking-[-2px]">
            你的项目，
            <br />
            有了自己的
            <br />
            <span className="text-[#c3d6a7]">计算空间。</span>
          </h1>
          <p className="text-[#a2baa8] text-sm leading-7 lg:mt-[27px] lg:leading-loose">
            认领你的专属 Linux 环境。
            <br />
            从毕业设计的第一行代码，到最后一次演示。
          </p>
          <ul className="flex flex-col gap-3 text-[#c4d5c7] text-xs/[1.6] max-lg:hidden lg:mt-[35px]">
            {features.map(feature => (
              <li key={feature} className="flex min-h-6 items-center gap-3">
                <Check aria-hidden="true" className="size-[15px] text-[#b6ce9c]" />
                {feature}
              </li>
            ))}
          </ul>
        </div>
      </aside>
      <main className="grid place-items-center bg-sidebar px-4 py-8 lg:py-12">
        <div className="flex w-full max-w-sm flex-col gap-5">
          <div className="pb-2.5">
            <h2 className="font-[620] text-[25px] tracking-[-1px] sm:text-[27px]">{heading}</h2>
            <p className="mt-3 text-[13px] text-muted-foreground">{intro}</p>
          </div>
          {tabbed ? (
            <Tabs value={mode} onValueChange={value => setMode(value as 'student' | 'claim')} className="gap-5">
              <TabsList className="w-full *:flex-1">
                <TabsTab value="student">登录</TabsTab>
                <TabsTab value="claim">首次认领</TabsTab>
              </TabsList>
              <TabsPanel value="student" className="flex flex-col gap-4">
                {content}
              </TabsPanel>
              <TabsPanel value="claim" className="flex flex-col gap-4">
                {content}
              </TabsPanel>
            </Tabs>
          ) : (
            content
          )}
          {initialized && (
            <Button
              type="button"
              variant="link"
              className="self-center text-muted-foreground"
              onClick={() => setMode(mode === 'admin' ? 'student' : 'admin')}
            >
              {mode === 'admin' ? '返回学生登录' : '管理员登录'}
            </Button>
          )}
        </div>
      </main>
    </div>
  );
}
