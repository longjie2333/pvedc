import { useState } from 'react';
import { Code2, Save, Trash2 } from 'lucide-react';
import type { Guide } from '../../../shared/schema';
import { useCommand } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Feedback } from '@/components/common/feedback';
import { Modal } from '@/components/common/modal';
import { Button } from '@/components/ui/button';
import { Field, FieldLabel } from '@/components/ui/field';
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from '@/components/ui/input-group';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { MilkdownEditor } from './milkdown-editor';

export type GuideDraft = Pick<Guide, 'title' | 'markdown' | 'sortOrder' | 'defaultCollapsed' | 'published'> & {
  id?: string;
};

/** Edits one guide; the caller keys it by guide so switching guides starts from fresh state. */
export function GuideEditor({
  initial,
  source,
  onToggleSource,
  onSaved,
  onDeleted,
}: {
  initial: GuideDraft;
  source: boolean;
  onToggleSource: () => void;
  onSaved: (guide: Guide) => void;
  onDeleted: () => void;
}) {
  const command = useCommand();
  const [draft, setDraft] = useState(initial),
    [deleting, setDeleting] = useState(false);
  async function save() {
    const result = await command.run<Guide>(
      'admin/guides' + (draft.id ? '/' + draft.id : ''),
      draft,
      draft.id ? 'PUT' : 'POST',
    );
    if (result) onSaved(result);
  }
  async function remove() {
    if (draft.id && (await command.run('admin/guides/' + draft.id, {}, 'DELETE'))) {
      setDeleting(false);
      onDeleted();
    }
  }
  return (
    <section className="guide-editor-main">
      <div className="guide-editor-heading">
        <div>
          <InputGroup>
            <InputGroupInput
              aria-label="指导书标题"
              value={draft.title}
              onChange={event => setDraft({ ...draft, title: event.target.value })}
            />
            <InputGroupAddon>
              <InputGroupText>标题</InputGroupText>
            </InputGroupAddon>
          </InputGroup>
        </div>
        <div className="guide-editor-meta">
          <InputGroup>
            <InputGroupInput
              aria-label="排序"
              type="number"
              min={0}
              value={draft.sortOrder}
              onChange={event => setDraft({ ...draft, sortOrder: Number(event.target.value) })}
            />
            <InputGroupAddon>
              <InputGroupText>排序</InputGroupText>
            </InputGroupAddon>
          </InputGroup>
        </div>
      </div>
      <div className={cn('guide-editor-canvas', source ? 'px-4.5 py-6' : 'px-7.5 py-6')}>
        {source ? (
          <Textarea
            className="guide-source bg-inherit !border-0 !ring-0"
            value={draft.markdown}
            onChange={event => setDraft({ ...draft, markdown: event.target.value })}
          />
        ) : (
          <MilkdownEditor
            value={draft.markdown}
            onChange={markdown => setDraft(previous => ({ ...previous, markdown }))}
          />
        )}
      </div>
      {!deleting && command.error && (
        <div className="px-4.5">
          <Feedback error={command.error} />
        </div>
      )}
      <footer className="guide-editor-toolbar">
        <div className="flex gap-1 items-center">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={source ? '打开实时编辑器' : '打开源码视图'}
            onClick={onToggleSource}
          >
            <Code2 />
          </Button>
          <Field className="hover:bg-accent h-8 rounded-lg flex items-center px-3">
            <FieldLabel className="h-full">
              折叠
              <Switch
                checked={draft.defaultCollapsed}
                onCheckedChange={value => setDraft({ ...draft, defaultCollapsed: value })}
              />
            </FieldLabel>
          </Field>
          <Field className="hover:bg-accent h-8 rounded-lg flex items-center px-3">
            <FieldLabel className="h-full">
              公布
              <Switch checked={draft.published} onCheckedChange={value => setDraft({ ...draft, published: value })} />
            </FieldLabel>
          </Field>
        </div>
        <div className="guide-editor-toolbar-right">
          {draft.id && (
            <Button
              type="button"
              variant="destructive-outline"
              size="icon"
              aria-label="删除指导书"
              onClick={() => setDeleting(true)}
            >
              <Trash2 />
            </Button>
          )}
          <Button type="button" onClick={save} loading={command.pending}>
            <Save />
            保存
          </Button>
        </div>
      </footer>
      <Modal
        destructive
        open={deleting}
        onClose={() => setDeleting(false)}
        title="删除指导书"
        description={'「' + draft.title + '」将被永久删除，学生端同步不再显示。'}
        footer={
          <Button type="button" variant="destructive" loading={command.pending} onClick={remove}>
            确认删除
          </Button>
        }
      >
        <Feedback error={command.error} />
      </Modal>
    </section>
  );
}
