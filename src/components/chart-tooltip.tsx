interface Entry { value?: unknown; name?: unknown; color?: string; dataKey?: unknown; payload?: { time?: number } }

/** Popover-styled recharts tooltip: sample time on top, one row per series. */
export function ChartTooltip({ active, payload, format }: { active?: boolean; payload?: ReadonlyArray<Entry>; format: (value: number) => string }) {
  if (!active || !payload?.length) return null;
  const time = Number(payload[0].payload?.time);
  return <div className="rounded-lg border bg-popover px-2.5 py-1.5 text-xs shadow-lg/5">
    <div className="text-muted-foreground tabular-nums">{new Date(time * 1000).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</div>
    {payload.map(item => <div key={String(item.dataKey)} className="flex items-center gap-1.5 whitespace-nowrap">
      <span aria-hidden="true" className="size-2 rounded-full" style={{ background: item.color }}/>
      {payload.length > 1 && <span className="text-muted-foreground">{String(item.name)}</span>}
      <span className="font-medium tabular-nums">{typeof item.value === 'number' ? format(item.value) : '—'}</span>
    </div>)}
  </div>;
}
