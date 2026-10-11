import { useQuery } from '@tanstack/react-query';
import { request } from '@/lib/api';
import { Feedback, Loading } from '@/components/common';
import { Accordion, AccordionItem, AccordionPanel, AccordionTrigger } from '@/components/ui/accordion';

interface GuideView { id: string; title: string; html: string; defaultCollapsed: boolean; sortOrder: number }

export function StudentGuides() {
  const query = useQuery({ queryKey: ['student-guides'], queryFn: () => request<{ guides: GuideView[] }>('me/guides'), staleTime: 30000 });
  return <>{
    query.isPending ? <div className="rounded-[10px] bg-white border-1"><Loading/></div>
      : query.error ? <Feedback error={query.error.message}/>
        : !!query.data?.guides.length && <div className="flex flex-col gap-1.5">{query.data.guides.map(guide => <div className="rounded-[10px] bg-white border-1"><Accordion {...(!guide.defaultCollapsed && { defaultValue: [guide.id] })} className="px-6"><AccordionItem key={guide.id} value={guide.id}><AccordionTrigger>{guide.title}</AccordionTrigger><AccordionPanel><div className="guide-content" dangerouslySetInnerHTML={{ __html: guide.html }}/></AccordionPanel></AccordionItem></Accordion></div>)}</div>
  }</>;
}
