import { useQuery } from '@tanstack/react-query';
import { BookOpen } from 'lucide-react';
import { request } from '@/lib/api';
import { Empty, Feedback, Loading, Panel } from '@/components/common';
import { Accordion, AccordionHeader, AccordionItem, AccordionPanel, AccordionTrigger } from '@/components/ui/accordion';

interface GuideView { id: string; title: string; html: string; defaultCollapsed: boolean; sortOrder: number }

export function StudentGuides() {
  const query = useQuery({ queryKey: ['student-guides'], queryFn: () => request<{ guides: GuideView[] }>('me/guides'), staleTime: 30000 });
  return <Panel title="使用指南" detail="针对当前计算环境的常见操作和配置说明" action={<BookOpen className="size-4 text-muted-foreground"/>}>
    {query.isPending ? <Loading/> : query.error ? <Feedback error={query.error.message}/> : !query.data?.guides.length ? <Empty title="暂无可用指南"/> : <Accordion multiple defaultValue={query.data.guides.filter(guide => !guide.defaultCollapsed).map(guide => guide.id)} className="px-6">{query.data.guides.map(guide => <AccordionItem key={guide.id} value={guide.id}><AccordionHeader><AccordionTrigger>{guide.title}</AccordionTrigger></AccordionHeader><AccordionPanel><div className="guide-content" dangerouslySetInnerHTML={{ __html: guide.html }}/></AccordionPanel></AccordionItem>)}</Accordion>}
  </Panel>;
}
