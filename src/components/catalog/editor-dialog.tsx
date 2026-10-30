import type { FormEvent, ReactNode } from 'react';
import { Feedback } from '@/components/common/feedback';
import { Modal } from '@/components/common/modal';
import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form';

/** Dialog shell shared by the catalog editors: sections stack with dividers, one save action. */
export function EditorDialog({
  title,
  description,
  pending,
  error,
  invalid = false,
  onSubmit,
  onClose,
  children,
}: {
  title: string;
  description: string;
  pending: boolean;
  error?: string;
  invalid?: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <Modal
      open
      onClose={onClose}
      title={title}
      description={description}
      footer={
        <Button form="catalog-editor" type="submit" loading={pending} disabled={invalid}>
          保存
        </Button>
      }
    >
      <Form id="catalog-editor" className="flex flex-col gap-5" onSubmit={onSubmit}>
        <Feedback error={error} />
        <div className="flex flex-col divide-y [&>*]:py-5 [&>*:first-child]:pt-0 [&>*:last-child]:pb-0">{children}</div>
      </Form>
    </Modal>
  );
}

/** Select items with a placeholder, keeping a saved value that is no longer offered visible but disabled. */
export const withCurrent = (items: { value: string; label: string }[], value: string) => [
  { value: '', label: '请选择' },
  ...items,
  ...(value && !items.some(item => item.value === value)
    ? [{ value, label: value + '（当前不可用）', disabled: true }]
    : []),
];
