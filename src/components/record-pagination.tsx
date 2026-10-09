import { Fragment } from 'react';
import { Choice } from './common';
import { Button } from './ui/button';
import { Pagination, PaginationContent, PaginationEllipsis, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from './ui/pagination';

export function RecordPagination({ page, pageSize, total, setPage, setPageSize, loading }: {
  page: number; pageSize: number; total: number; setPage: (page: number) => void; setPageSize: (size: number) => void; loading: boolean;
}) {
  const last = Math.max(1, Math.ceil(total / pageSize));
  const pages = [...new Set([1, page - 1, page, page + 1, last])].filter(n => n > 0 && n <= last).sort((a, b) => a - b);
  return <div className="flex flex-wrap items-center justify-between gap-4 border-t p-5">
    <div className="flex items-end gap-4"><Choice label="每页条数" value={String(pageSize)} onChange={value => setPageSize(Number(value))} items={[20, 50, 100].map(value => ({ value: String(value), label: String(value) }))}/><span className="pb-2 text-sm text-muted-foreground">共 {total} 条 · 第 {page} / {last} 页</span></div>
    <Pagination aria-label="记录分页" className="m-0 w-auto"><PaginationContent>
      <PaginationItem><PaginationPrevious aria-label="上一页" render={<Button type="button" variant="outline" size="sm" disabled={loading || page <= 1} onClick={() => setPage(page - 1)}/>}/></PaginationItem>
      {pages.map((number, index) => <Fragment key={number}>
        {index > 0 && number - pages[index - 1] > 1 && <PaginationItem><PaginationEllipsis/></PaginationItem>}
        <PaginationItem><PaginationLink isActive={number === page} aria-label={'第 ' + number + ' 页'} render={<Button type="button" size="icon-sm" variant={number === page ? 'outline' : 'ghost'} disabled={loading} onClick={() => setPage(number)}/>}>{number}</PaginationLink></PaginationItem>
      </Fragment>)}
      <PaginationItem><PaginationNext aria-label="下一页" render={<Button type="button" variant="outline" size="sm" disabled={loading || page >= last} onClick={() => setPage(page + 1)}/>}/></PaginationItem>
    </PaginationContent></Pagination>
  </div>;
}
