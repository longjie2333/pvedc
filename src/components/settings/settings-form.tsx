import { useState, type ReactNode } from 'react';
import type { Profile, SafeSettings } from '../../../shared/schema';
import { useCommand } from '@/lib/api';
import { Feedback } from '@/components/common/feedback';
import { Choice, TextField } from '@/components/common/form-fields';
import { Panel } from '@/components/common/panel';
import { SwitchSetting } from '@/components/common/switch-setting';
import { Button } from '@/components/ui/button';
import { Field, FieldLabel } from '@/components/ui/field';
import { Form } from '@/components/ui/form';
import { Textarea } from '@/components/ui/textarea';

type FieldType = 'text' | 'number' | 'password' | 'textarea' | 'array' | 'boolean' | 'profile';
export interface SettingGroup {
  title: string;
  detail?: string;
  fields: { key: string; label: string; type?: FieldType; description?: string }[];
}

/** Saves only the keys declared in `groups`; empty secret fields keep the stored credential. */
export function SettingsForm({
  initial,
  groups,
  profiles = [],
  submitLabel,
  actions,
  error,
}: {
  initial: SafeSettings;
  groups: SettingGroup[];
  profiles?: Profile[];
  submitLabel: string;
  actions?: ReactNode;
  error?: string;
}) {
  const [values, setValues] = useState<Record<string, unknown>>({ ...initial });
  const command = useCommand();
  const keys = groups.flatMap(group => group.fields.map(field => field.key));
  const set = (key: string, value: unknown) => setValues({ ...values, [key]: value });
  return (
    <Form
      onSubmit={async event => {
        event.preventDefault();
        const payload = Object.fromEntries(
          keys.filter(key => values[key] !== undefined).map(key => [key, values[key]]),
        );
        for (const key of ['pveTokenSecret', 'gostPassword', 'relayPassword'])
          if (payload[key] === '') delete payload[key];
        const saved = await command.run<SafeSettings>('admin/settings', payload, 'PUT');
        if (saved) setValues({ ...saved });
      }}
      className="flex flex-col gap-6"
    >
      <Feedback error={command.error || error} />
      {groups.map(group => {
        const switches = group.fields.filter(field => field.type === 'boolean');
        return (
          <Panel key={group.title} title={group.title} detail={group.detail}>
            <div className="form-grid p-6">
              {group.fields
                .filter(field => field.type !== 'boolean')
                .map(({ key, label, type = 'text' }) =>
                  type === 'profile' ? (
                    <Choice
                      key={key}
                      label={label}
                      value={String(values[key] || '')}
                      onChange={value => set(key, value || null)}
                      items={[
                        { value: '', label: '请选择默认配置' },
                        ...profiles
                          .filter(profile => profile.enabled && profile.published)
                          .map(profile => ({ value: profile.id, label: profile.name })),
                      ]}
                    />
                  ) : type === 'textarea' ? (
                    <Field key={key} className="col-span-full">
                      <FieldLabel>{label}</FieldLabel>
                      <Textarea
                        rows={4}
                        className="font-mono text-xs"
                        value={String(values[key] || '')}
                        onChange={event => set(key, event.target.value)}
                      />
                    </Field>
                  ) : (
                    <TextField
                      key={key}
                      label={label}
                      type={type === 'password' || type === 'number' ? type : 'text'}
                      value={type === 'array' ? (values[key] as number[]).join(', ') : String(values[key] ?? '')}
                      hint={
                        type === 'password' && initial.secrets[key as keyof SafeSettings['secrets']]
                          ? '已配置；留空保留现有凭据'
                          : undefined
                      }
                      onChange={event =>
                        set(
                          key,
                          type === 'number'
                            ? Number(event.target.value)
                            : type === 'array'
                              ? event.target.value
                                  .split(/[\s,]+/)
                                  .filter(Boolean)
                                  .map(Number)
                              : event.target.value,
                        )
                      }
                    />
                  ),
                )}
            </div>
            {switches.length > 0 && (
              <section aria-label="开关设置" className="grid gap-5 lg:grid-cols-2 p-6 pt-0">
                {switches.map(({ key, label, description = '' }) => (
                  <SwitchSetting
                    key={key}
                    label={label}
                    description={description}
                    checked={!!values[key]}
                    onChange={value => set(key, value)}
                  />
                ))}
              </section>
            )}
          </Panel>
        );
      })}
      <div className="sticky-actions gap-2">
        {actions}
        <Button type="submit" loading={command.pending}>
          {submitLabel}
        </Button>
      </div>
    </Form>
  );
}
