import { Editor, rootCtx, defaultValueCtx } from '@milkdown/core';
import { commonmark } from '@milkdown/preset-commonmark';
import { Milkdown, MilkdownProvider, useEditor } from '@milkdown/react';
import { listener, listenerCtx } from '@milkdown/plugin-listener';

function Instance({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  useEditor(
    root =>
      Editor.make()
        .config(ctx => {
          ctx.set(rootCtx, root);
          ctx.set(defaultValueCtx, value);
          ctx.get(listenerCtx).markdownUpdated((_ctx, markdown) => onChange(markdown));
        })
        .use(commonmark)
        .use(listener),
    [],
  );
  return <Milkdown />;
}

/** WYSIWYG markdown editor; reads `value` once on mount, so remount it to load other content. */
export function MilkdownEditor(props: { value: string; onChange: (value: string) => void }) {
  return (
    <MilkdownProvider>
      <Instance {...props} />
    </MilkdownProvider>
  );
}
