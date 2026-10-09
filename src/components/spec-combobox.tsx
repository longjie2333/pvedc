import { useState } from 'react';
import { Field, FieldError, FieldLabel } from './ui/field';
import { Combobox, ComboboxInput, ComboboxItem, ComboboxList, ComboboxPopup } from './ui/combobox';

export function SpecCombobox({ name, label, initial, presets, min, max }: {
  name: string; label: string; initial: number; presets: number[]; min: number; max: number;
}) {
  const [input, setInput] = useState(String(initial));
  const number = Number(input), valid = /^\d+$/.test(input) && Number.isSafeInteger(number) && number >= min && number <= max;
  const items = valid && !presets.includes(number) ? [...presets, number] : presets;
  return <Field name={name} invalid={!valid}>
    <FieldLabel>{label}</FieldLabel>
    <Combobox name={name} required items={items} filter={null} value={valid ? number : null} inputValue={input}
      itemToStringLabel={value => String(value)} itemToStringValue={value => String(value)}
      onValueChange={value => setInput(value === null ? '' : String(value))}
      onInputValueChange={(value, details) => { if (details.reason === 'input-change' || details.reason === 'input-clear') setInput(value); }}>
      <ComboboxInput inputMode="numeric" placeholder="选择或输入规格" onBlur={() => { if (valid) setInput(String(number)); }} triggerProps={{ 'aria-label': '选择' + label }}/>
      <ComboboxPopup><ComboboxList>{(value: number) => <ComboboxItem key={value} value={value}>{value}{presets.includes(value) ? '' : '（自定义）'}</ComboboxItem>}</ComboboxList></ComboboxPopup>
    </Combobox>
    {!valid && <FieldError>请输入 {min}–{max} 之间的整数</FieldError>}
  </Field>;
}
