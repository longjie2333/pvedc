import type { ComponentProps, ReactNode } from 'react';
import { Field, FieldLabel, FieldDescription, FieldError } from '@/components/ui/field';
import { Fieldset, FieldsetLegend } from '@/components/ui/fieldset';
import { Input } from '@/components/ui/input';
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from '@/components/ui/select';

export function TextField({
  label,
  hint,
  hideLabel,
  type = 'text',
  ...props
}: ComponentProps<typeof Input> & { label: string; hint?: string; hideLabel?: boolean }) {
  return (
    <Field name={props.name}>
      <FieldLabel className={hideLabel ? 'sr-only' : undefined}>{label}</FieldLabel>
      <Input type={type} {...props} />
      {hint && <FieldDescription>{hint}</FieldDescription>}
      <FieldError />
    </Field>
  );
}

export function Choice({
  label,
  value,
  onChange,
  items,
  name,
  disabled,
  hideLabel,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  items: { value: string; label: string; disabled?: boolean }[];
  name?: string;
  disabled?: boolean;
  hideLabel?: boolean;
}) {
  return (
    <Field name={name}>
      <FieldLabel className={hideLabel ? 'sr-only' : undefined}>{label}</FieldLabel>
      <Select
        items={items}
        name={name}
        value={value}
        onValueChange={v => onChange(String(v ?? ''))}
        disabled={disabled}
      >
        <SelectTrigger className="w-full min-w-0">
          <SelectValue />
        </SelectTrigger>
        <SelectPopup>
          {items.map(item => (
            <SelectItem key={item.value} value={item.value} disabled={item.disabled}>
              {item.label}
            </SelectItem>
          ))}
        </SelectPopup>
      </Select>
    </Field>
  );
}

/** A titled group of related form controls; sections stack with dividers inside editor dialogs. */
export function FormSection({
  legend,
  description,
  action,
  children,
}: {
  legend: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Fieldset className="flex min-w-0 flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <FieldsetLegend className="text-sm">{legend}</FieldsetLegend>
          {description && <p className="text-muted-foreground text-xs">{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </Fieldset>
  );
}
