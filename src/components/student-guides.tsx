import { useQuery } from '@tanstack/react-query';
import { request } from '@/lib/api';
import { Feedback } from '@/components/common';
import { Accordion, AccordionItem, AccordionPanel, AccordionTrigger } from '@/components/ui/accordion';
import { Card, CardHeader, CardPanel, CardTitle } from '@/components/ui/card';

interface GuideView { id: string; title: string; html: string; defaultCollapsed: boolean; sortOrder: number }

export function StudentGuides() {
  const query = useQuery({ queryKey: ['student-guides'], queryFn: () => request<{ guides: GuideView[] }>('me/guides'), staleTime: 30000 });
  if (query.error) return <Feedback error={query.error.message}/>;
  const guides = query.data?.guides ?? [];
  if (!guides.length) return null;
  return <Card render={<section aria-labelledby="student-guides-title"/>}>
    <CardHeader><CardTitle render={<h2 id="student-guides-title"/>}>指导书</CardTitle></CardHeader>
    <CardPanel>
      <Accordion multiple defaultValue={guides.filter(guide => !guide.defaultCollapsed).map(guide => guide.id)}>
        {guides.map(guide => <AccordionItem key={guide.id} value={guide.id}>
          <AccordionTrigger>{guide.title}</AccordionTrigger>
          <AccordionPanel><div className="guide-content" dangerouslySetInnerHTML={{ __html: guide.html }}/></AccordionPanel>
        </AccordionItem>)}
      </Accordion>
    </CardPanel>
  </Card>;
}
