import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BookOpen, Code2, FilePlus2, Save, Trash2 } from 'lucide-react';
import { Editor, rootCtx, defaultValueCtx } from '@milkdown/core';
import { commonmark } from '@milkdown/preset-commonmark';
import { Milkdown, MilkdownProvider, useEditor } from '@milkdown/react';
import { listener, listenerCtx } from '@milkdown/plugin-listener';
import type { Guide } from '../../shared/schema';
import { request, useCommand } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Field, FieldLabel } from '@/components/ui/field';
import { Feedback, Loading } from '@/components/common';
import { SwitchSetting } from '@/components/switch-setting';

type Draft = Pick<Guide, 'title' | 'markdown' | 'sortOrder' | 'defaultCollapsed' | 'published'> & { id?: string };
const blank: Draft = { title: '新指导书', markdown: '# 新指导书\n\n在这里编写内容。\n\n可用占位符：`{{machine.ip}}`、`{{forward:22}}`。', sortOrder: 0, defaultCollapsed: true, published: false };

function MilkdownEditor({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  useEditor(root => Editor.make().config(ctx => {
    ctx.set(rootCtx, root);
    ctx.set(defaultValueCtx, value);
    ctx.get(listenerCtx).markdownUpdated((_ctx, markdown) => onChange(markdown));
  }).use(commonmark).use(listener), []);
  return <Milkdown/>;
}

export function GuidesPage() {
  const guides = useQueryGuides();
  const command = useCommand();
  const [selectedId, setSelectedId] = useState<string>();
  const [draft, setDraft] = useState<Draft>(blank);
  const [source, setSource] = useState(false);
  const [editorKey, setEditorKey] = useState(0);
  const selected = useMemo(() => guides.data?.find(guide => guide.id === selectedId), [guides.data, selectedId]);
  useEffect(() => {
    if (selectedId && selected) return;
    const next = guides.data?.[0];
    setSelectedId(next?.id);
    setDraft(next ? { id: next.id, title: next.title, markdown: next.markdown, sortOrder: next.sortOrder, defaultCollapsed: next.defaultCollapsed, published: next.published } : blank);
  }, [guides.data, selected, selectedId]);
  function selectGuide(guide: Guide) {
    setSelectedId(guide.id); setDraft({ id: guide.id, title: guide.title, markdown: guide.markdown, sortOrder: guide.sortOrder, defaultCollapsed: guide.defaultCollapsed, published: guide.published }); setSource(false); setEditorKey(value => value + 1);
  }
  function createGuide() { setSelectedId(undefined); setDraft({ ...blank, title: '新指导书' }); setSource(true); setEditorKey(value => value + 1); }
  async function save() {
    const result = await command.run<Guide>('admin/guides' + (draft.id ? '/' + draft.id : ''), draft, draft.id ? 'PUT' : 'POST');
    if (result) { await guides.refetch(); selectGuide(result); setSource(false); }
  }
  async function remove() {
    if (!draft.id || !window.confirm('确定删除这篇指导书吗？')) return;
    if (await command.run('admin/guides/' + draft.id, {}, 'DELETE')) { setSelectedId(undefined); setDraft(blank); await guides.refetch(); }
  }
  if (guides.isPending) return <Loading/>;
  if (guides.error) return <Feedback error={guides.error.message}/>;
  return <div className="guide-editor-shell">
    <aside className="guide-editor-sidebar"><div className="guide-editor-sidebar-heading"><div><div className="eyebrow">KNOWLEDGE BASE</div><h2>指导书</h2></div><Button size="icon-sm" variant="outline" aria-label="新建指导书" onClick={createGuide}><FilePlus2/></Button></div><div className="guide-list">{guides.data?.map(guide => <button type="button" key={guide.id} className={'guide-list-item ' + (guide.id === draft.id ? 'active' : '')} onClick={() => selectGuide(guide)}><BookOpen/><span>{guide.title}<small>{guide.published ? '已公布' : '草稿'}</small></span></button>)}</div></aside>
    <section className="guide-editor-main"><div className="guide-editor-heading"><div><Field><FieldLabel>指导书标题</FieldLabel><Input value={draft.title} onChange={event => setDraft({ ...draft, title: event.target.value })}/></Field></div><div className="guide-editor-meta"><Field><FieldLabel>排序</FieldLabel><Input type="number" min={0} value={draft.sortOrder} onChange={event => setDraft({ ...draft, sortOrder: Number(event.target.value) })}/></Field></div></div><div className="guide-editor-canvas">{source ? <Textarea className="guide-source" value={draft.markdown} onChange={event => setDraft({ ...draft, markdown: event.target.value })}/> : <MilkdownProvider><MilkdownEditor key={editorKey} value={draft.markdown} onChange={markdown => setDraft(previous => ({ ...previous, markdown }))}/></MilkdownProvider>}</div><Feedback error={command.error}/><footer className="guide-editor-toolbar"><Button type="button" variant="ghost" size="icon" aria-label={source ? '打开实时编辑器' : '打开源码视图'} onClick={() => { setSource(!source); setEditorKey(value => value + 1); }}><Code2/></Button><div className="guide-editor-toolbar-right"><SwitchSetting label="默认折叠" description="学生打开指南时默认收起内容" checked={draft.defaultCollapsed} onChange={value => setDraft({ ...draft, defaultCollapsed: value })}/><SwitchSetting label="公布" description="公布后学生可以查看" checked={draft.published} onChange={value => setDraft({ ...draft, published: value })}/>{draft.id && <Button type="button" variant="destructive-outline" size="icon" aria-label="删除指导书" onClick={remove}><Trash2/></Button>}<Button type="button" onClick={save} loading={command.pending}><Save/>保存</Button></div></footer></section>
  </div>;
}

function useQueryGuides() {
  return useQuery({ queryKey: ['admin-guides'], queryFn: () => request<Guide[]>('admin/guides') });
}
