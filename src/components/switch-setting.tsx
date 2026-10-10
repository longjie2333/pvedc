import { useId } from 'react';
import { Label } from './ui/label';
import { Switch } from './ui/switch';

export function SwitchSetting({ label, description, checked, onChange, disabled }: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  const id = useId();
  return <Label htmlFor={id} className="flex w-full items-center justify-between gap-6 rounded-lg border bg-card p-4 has-data-checked:border-primary/40">
    <span className="flex flex-col gap-1">
      <span>{label}</span>
      <span className="text-xs font-normal leading-relaxed text-muted-foreground">{description}</span>
    </span>
    <Switch id={id} checked={checked} onCheckedChange={onChange} disabled={disabled}/>
  </Label>;
}
