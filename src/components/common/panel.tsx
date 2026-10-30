import type { ReactNode } from 'react';
import { Card, CardAction, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export function Panel({
  title,
  detail,
  children,
  action,
}: {
  title?: string;
  detail?: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <Card className="min-w-0 overflow-hidden">
      {title && (
        <CardHeader className="pb-0">
          <CardTitle render={<h2 />}>{title}</CardTitle>
          {detail && <CardDescription className="text-muted-foreground text-xs tabular-nums">{detail}</CardDescription>}
          {action && <CardAction className="self-center">{action}</CardAction>}
        </CardHeader>
      )}
      {children}
    </Card>
  );
}

export function PageTitle({ title, actions }: { title: string; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <h1 className="font-semibold text-xl">{title}</h1>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
