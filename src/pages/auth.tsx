import { copyText } from '@/lib/feedback';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Check, Command, Server, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form';
import { Checkbox } from '@/components/ui/checkbox';
import { Field, FieldLabel } from '@/components/ui/field';
import { Combobox, ComboboxInput, ComboboxPopup, ComboboxEmpty, ComboboxList, ComboboxItem } from '@/components/ui/combobox';
import { OtpInput } from '@/components/otp-input';
import { Choice, Feedback, TextField } from '@/components/common';
import { request, useCommand } from '@/lib/api';

interface Roster { open: boolean; selfSelection: boolean; students: { id: string; name: string; className: string; assigned: boolean }[]; profiles: { id: string; name: string; cores: number; memory: number; disk: number }[]; defaultProfileId: string }
export function AuthPage({ initialized, title }: { initialized: boolean; title: string }) {
  const [savedKey, setSavedKey] = useState(false);
  const [mode, setMode] = useState<'student' | 'admin' | 'claim'>('student');
  const [setup, setSetup] = useState<{ secret: string; qr: string; expiresAt: number }>();
  const [setupLoading, setSetupLoading] = useState(false), [setupError, setSetupError] = useState('');
  const setupStarted = useRef(false);
  const generateSetup = useCallback(async () => {
    setSetupLoading(true); setSetupError('');
    try { setSetup(await request('setup/begin', {})); }
    catch (error) { setSetupError(error instanceof Error ? error.message : '生成密钥失败'); }
    finally { setSetupLoading(false); }
  }, []);
  useEffect(() => { if (!initialized && !setupStarted.current) { setupStarted.current = true; void generateSetup(); } }, [initialized, generateSetup]);
  const [query, setQuery] = useState(''), [search, setSearch] = useState('');
  const [student, setStudent] = useState<Roster['students'][number] | null>(null), [profile, setProfile] = useState('');
  useEffect(() => { const timer = setTimeout(() => setQuery(search.trim()), 250); return () => clearTimeout(timer); }, [search]);
  const command = useCommand();
  const roster = useQuery({ queryKey: ['roster', query], queryFn: () => request<Roster>('public/roster?q=' + encodeURIComponent(query)), enabled: initialized && mode === 'claim' });
  const chosen = student;
  const searching = roster.isFetching || search.trim() !== query;
  const matches = roster.data?.students || [];
  const options = student && !matches.some(item => item.id === student.id) ? [student, ...matches] : matches;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const data = Object.fromEntries(new FormData(event.currentTarget));
    if (!initialized) await command.run('setup/complete', { code: data.code });
    else if (mode === 'admin') await command.run('auth/admin', { code: data.code });
    else if (mode === 'claim') await command.run('public/claim', { studentId: student?.id, password: data.password, profileId: profile || undefined });
    else await command.run('auth/student', { studentId: data.studentId, password: data.password });
  }
  return <div className="auth-layout"><aside className="auth-story"><div className="brand"><span className="brand-symbol"><Command/></span><span>{title}<small>COMPUTE FOR YOUR NEXT IDEA</small></span></div><div className="auth-copy"><div className="eyebrow">从想法，到运行</div><h1>你的项目，<br/>有了自己的<br/><em>计算空间。</em></h1><p>认领你的专属 Linux 环境。<br/>从毕业设计的第一行代码，到最后一次演示。</p><div className="auth-features"><span><Check/>独立的 Linux 环境</span><span><Check/>资源状态一目了然</span><span><Check/>公网服务轻松访问</span></div></div><div className="auth-footer"><span className="status-dot"/> PVE DISTRIBUTION CENTER <span>校园计算资源</span></div></aside>
    <main className="auth-main"><div className="auth-card"><div className="auth-icon">{!initialized || mode === 'admin' ? <ShieldCheck/> : <Server/>}</div><div className="eyebrow">{!initialized ? 'WELCOME, ADMINISTRATOR' : mode === 'claim' ? 'YOUR FIRST INSTANCE' : 'WELCOME BACK'}</div><h2>{!initialized ? '设置管理员身份' : mode === 'admin' ? '管理员验证' : mode === 'claim' ? '认领我的计算资源' : '登录学生工作台'}</h2><p className="intro">{!initialized ? '保存验证密钥，并使用身份验证器完成首次绑定。' : mode === 'admin' ? '输入身份验证器中的六位动态验证码。' : mode === 'claim' ? '从名单中选择自己，设置密码后开始创建。' : '使用学号和密码，继续你的项目。'}</p><Feedback {...command}/><Feedback error={setupError || roster.error?.message}/>
    {!initialized && !setup ? <Button size="lg" loading={setupLoading} className="w-full" onClick={generateSetup}>生成验证密钥 <ArrowRight/></Button> : <Form onSubmit={submit} className="flex flex-col gap-5">
      {setup && <div className="setup-secret"><img src={setup.qr} alt="管理员 TOTP 绑定二维码"/><p>用身份验证器扫描二维码，并离线保存密钥。</p><code>{setup.secret}</code><Button variant="outline" onClick={() => copyText(setup.secret)}>复制密钥</Button><label className="flex items-center gap-2 text-sm"><Checkbox required checked={savedKey} onCheckedChange={setSavedKey}/>我已安全保存验证密钥</label></div>}
      {!initialized || mode === 'admin' ? <OtpInput key={initialized ? mode : 'setup'} disabled={command.pending || (!initialized && !savedKey)} error={command.error}/> : <>
      {mode === 'claim' ? <><Field name="studentId"><FieldLabel>我的学号</FieldLabel>
        <Combobox items={options} filteredItems={searching ? [] : matches} value={student} onValueChange={setStudent} required
          itemToStringLabel={item => item.id + ' · ' + item.name} itemToStringValue={item => item.id} isItemEqualToValue={(a, b) => a.id === b.id}
          onInputValueChange={(value, details) => { if (['input-change', 'input-clear', 'clear-press'].includes(details.reason)) { setSearch(value); setStudent(null); } }}>
          <ComboboxInput placeholder="输入学号或姓名搜索" showClear clearProps={{ 'aria-label': '清除学号' }} triggerProps={{ 'aria-label': '选择学号' }}/>
          <ComboboxPopup><ComboboxEmpty>{searching ? '正在查找学生…' : roster.error ? '名单加载失败，请重试' : '没有匹配的未认领学生'}</ComboboxEmpty>
            <ComboboxList>{(item: Roster['students'][number]) => <ComboboxItem key={item.id} value={item}><span>{item.id} · {item.name}<small>{item.className || '未填写班级'}</small></span></ComboboxItem>}</ComboboxList>
          </ComboboxPopup>
        </Combobox>
      </Field>{chosen?.assigned ? <div className="subtle-note">管理员已为你指定资源配置。</div> : roster.data?.selfSelection && <Choice label="资源配置" value={profile} onChange={setProfile} items={[{ value: '', label: '使用默认配置' }, ...roster.data.profiles.map(p => ({ value: p.id, label: p.name + ' · ' + p.cores + ' CPU / ' + p.memory + ' MiB' }))]}/>}</> : <TextField label="学号" name="studentId" autoComplete="username" required placeholder="输入你的学号"/>}
      <TextField label={mode === 'claim' ? '设置密码' : '密码'} name="password" type="password" minLength={10} maxLength={128} autoComplete={mode === 'claim' ? 'new-password' : 'current-password'} required hint={mode === 'claim' ? '至少 10 位；此密码也用于 LXC 的 root 登录。' : undefined} placeholder="输入密码"/></>}
      <Button size="lg" type="submit" loading={command.pending} disabled={(!initialized && !savedKey) || (mode === 'claim' && (!student || !roster.data?.open))} className="w-full">{!initialized ? '完成绑定，进入管理后台' : mode === 'claim' ? '认领并创建资源' : '登录'}<ArrowRight/></Button>
    </Form>}
    {initialized && <div className="auth-links">{mode === 'student' ? <><Button type="button" variant="link" onClick={() => setMode('claim')}>首次使用？认领资源</Button><Button type="button" variant="link" onClick={() => setMode('admin')}>管理员入口</Button></> : <Button type="button" variant="link" onClick={() => setMode('student')}>返回学生登录</Button>}</div>}<p className="auth-hint">{mode === 'claim' && roster.data && !roster.data.open ? '管理员尚未开放资源申请。' : '验证状态有效期为一小时。'}</p></div></main></div>;
}
