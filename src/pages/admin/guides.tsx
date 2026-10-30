import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Guide } from '../../../shared/schema';
import { request } from '@/lib/api';
import { Feedback, Loading } from '@/components/common/feedback';
import { GuideEditor, type GuideDraft } from '@/components/guides/guide-editor';
import { GuideList } from '@/components/guides/guide-list';

const blank: GuideDraft = {
  title: '新指导书',
  markdown: '# 新指导书\n\n在这里编写内容。\n\n可用占位符：`{{machine.ip}}`、`{{forward:22}}`。',
  sortOrder: 0,
  defaultCollapsed: true,
  published: false,
};
const draftOf = ({ id, title, markdown, sortOrder, defaultCollapsed, published }: Guide): GuideDraft => ({
  id,
  title,
  markdown,
  sortOrder,
  defaultCollapsed,
  published,
});

export function GuidesPage() {
  const guides = useQuery({ queryKey: ['admin-guides'], queryFn: () => request<Guide[]>('admin/guides') });
  const [selectedId, setSelectedId] = useState<string>(),
    [creating, setCreating] = useState(false);
  const [source, setSource] = useState(false),
    [revision, setRevision] = useState(0);
  if (guides.isPending) return <Loading />;
  if (guides.error) return <Feedback error={guides.error.message} />;
  // Without an explicit (still existing) selection the first guide is shown.
  const current = creating ? undefined : guides.data.find(guide => guide.id === selectedId) || guides.data[0];
  const select = (guide: Guide) => {
    setCreating(false);
    setSelectedId(guide.id);
    setRevision(value => value + 1);
  };
  return (
    <div className="guide-editor-shell">
      <GuideList
        guides={guides.data}
        currentId={current?.id}
        onSelect={select}
        onCreate={() => {
          setCreating(true);
          setSelectedId(undefined);
          setRevision(value => value + 1);
        }}
      />
      <GuideEditor
        key={(current?.id || 'new') + ':' + revision}
        initial={current ? draftOf(current) : blank}
        source={source}
        onToggleSource={() => setSource(!source)}
        onSaved={async guide => {
          await guides.refetch();
          select(guide);
        }}
        onDeleted={async () => {
          setSelectedId(undefined);
          await guides.refetch();
        }}
      />
    </div>
  );
}
