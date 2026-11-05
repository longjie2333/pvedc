import type { ReactNode } from 'react';
import type { useActivityRecords } from '@/lib/activity';
import { ActivityFilters } from '@/components/activity/activity-filters';
import { Empty, Feedback, Loading } from '@/components/common/feedback';
import { Panel } from '@/components/common/panel';
import { RecordPagination } from '@/components/common/record-pagination';

/** Paged record list: query bar, error, table or empty state, pagination. Filters and table come from the caller. */
export function RecordPanel<T>({
  records,
  filters,
  refresh,
  error,
  emptyTitle,
  children,
}: {
  records: ReturnType<typeof useActivityRecords<T>>;
  filters: ReactNode;
  refresh?: () => void;
  error?: string;
  emptyTitle: string;
  children: (items: T[]) => ReactNode;
}) {
  const { query } = records;
  return (
    <Panel>
      <ActivityFilters {...records} loading={query.isFetching} refresh={refresh || (() => void query.refetch())}>
        {filters}
      </ActivityFilters>
      <Feedback error={query.error?.message || error} />
      {query.isPending ? (
        <Loading />
      ) : query.data?.items.length ? (
        children(query.data.items)
      ) : (
        <Empty title={emptyTitle} />
      )}
      <RecordPagination {...records} total={query.data?.total || 0} loading={query.isFetching} />
    </Panel>
  );
}
