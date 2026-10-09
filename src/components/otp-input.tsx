import { useEffect, useRef, useState } from 'react';
import { Field, FieldError, FieldLabel } from './ui/field';
import { OTPField, OTPFieldInput } from './ui/otp-field';

export function OtpInput({ label = '动态验证码', disabled = false, error }: {
  label?: string; disabled?: boolean; error?: string;
}) {
  const [value, setValue] = useState('');
  const [validationError, setValidationError] = useState(error);
  const first = useRef<HTMLInputElement>(null);
  useEffect(() => {
    setValidationError(error);
    if (error) { setValue(''); first.current?.focus(); }
  }, [error]);
  return <Field name="code" invalid={!!validationError}>
    <FieldLabel>{label}</FieldLabel>
    <OTPField name="code" length={6} required autoSubmit disabled={disabled} value={value} onValueChange={next => { setValue(next); if (next) setValidationError(undefined); }}>
      {Array.from({ length: 6 }, (_, index) => <OTPFieldInput key={index} ref={index === 0 ? first : undefined} aria-label={index ? '第 ' + (index + 1) + ' 位验证码' : undefined}/>)}
    </OTPField>
    {validationError && <FieldError>{validationError}</FieldError>}
  </Field>;
}
