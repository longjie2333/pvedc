import type { ReactNode } from 'react';
import { Form } from './ui/form';
import { Button } from './ui/button';
import { TextField } from './common';

export function ActivityFilters({ draft, setFilter, search, reset, refresh, loading, children }: {
  draft: Record<string, string>; setFilter: (key: string, value: string) => void;
  search: () => void; reset: () => void; refresh: () => void; loading: boolean; children?: ReactNode;
}) {
  return <Form onSubmit={event => { event.preventDefault(); search(); }} className="grid gap-4 border-b p-5 sm:grid-cols-2 lg:grid-cols-3">
    <TextField label="关键词" placeholder="搜索记录" value={draft.q || ''} onChange={event => setFilter('q', event.target.value)}/>
    {children}
    <TextField label="开始日期" type="date" value={draft.from || ''} onChange={event => setFilter('from', event.target.value)}/>
    <TextField label="结束日期" type="date" value={draft.to || ''} onChange={event => setFilter('to', event.target.value)}/>
    <div className="flex items-end gap-2"><Button type="submit" loading={loading}>查询</Button><Button type="button" variant="outline" onClick={reset}>重置</Button><Button type="button" variant="ghost" loading={loading} onClick={refresh}>刷新</Button></div>
  </Form>;
}
