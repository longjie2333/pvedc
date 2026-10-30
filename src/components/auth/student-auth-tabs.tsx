import type { ReactNode } from 'react';
import { useLocation, useMatch, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsPanel, TabsTab } from '@/components/ui/tabs';

const routes = { student: '/login', claim: '/claim' } as const;

/** Login / first-claim switch: the URL selects the tab, the active page supplies the panel. */
export function StudentAuthTabs({ children }: { children: ReactNode }) {
  const tab = useMatch('/claim') ? 'claim' : 'student';
  const navigate = useNavigate(),
    { state } = useLocation();
  return (
    <>
      <Tabs
        value={tab}
        onValueChange={value => navigate(routes[value as keyof typeof routes], { replace: true, state })}
        className="gap-5"
      >
        <TabsList className="w-full *:flex-1">
          <TabsTab value="student">登录</TabsTab>
          <TabsTab value="claim">首次认领</TabsTab>
        </TabsList>
        <TabsPanel value={tab} className="flex flex-col gap-4">
          {children}
        </TabsPanel>
      </Tabs>
      <Button
        type="button"
        variant="link"
        className="self-center text-muted-foreground"
        onClick={() => navigate('/login/admin', { replace: true, state })}
      >
        管理员登录
      </Button>
    </>
  );
}
