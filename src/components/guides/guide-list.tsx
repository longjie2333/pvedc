import { BookOpen, FilePlus2 } from 'lucide-react';
import type { Guide } from '../../../shared/schema';
import { Button } from '@/components/ui/button';

export function GuideList({
  guides,
  currentId,
  onSelect,
  onCreate,
}: {
  guides: Guide[];
  currentId?: string;
  onSelect: (guide: Guide) => void;
  onCreate: () => void;
}) {
  return (
    <aside className="guide-editor-sidebar">
      <div className="guide-editor-sidebar-heading">
        <Button variant="outline" aria-label="新建指导书" onClick={onCreate}>
          <FilePlus2 /> 新建指导书
        </Button>
      </div>
      <div className="guide-list">
        {guides.map(guide => (
          <button
            type="button"
            key={guide.id}
            aria-current={guide.id === currentId ? 'true' : undefined}
            className="guide-list-item"
            onClick={() => onSelect(guide)}
          >
            <BookOpen aria-hidden="true" />
            <span className="flex min-w-0 flex-col">
              <span className="truncate">{guide.title}</span>
              <span className="text-muted-foreground text-xs">{guide.published ? '已公布' : '草稿'}</span>
            </span>
          </button>
        ))}
      </div>
    </aside>
  );
}
