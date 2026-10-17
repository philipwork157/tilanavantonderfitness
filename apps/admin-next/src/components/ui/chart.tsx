'use client';

/**
 * shadcn/ui chart (Recharts). Tilana: written out by hand from the shadcn
 * "chart" component (the registry was unreachable), trimmed to what the
 * admin uses: ChartContainer, ChartTooltip, ChartTooltipContent.
 */
import * as React from 'react';
import * as RechartsPrimitive from 'recharts';
import { cn } from '@/lib/utils';

const THEMES = { light: '', dark: '.dark' } as const;

export type ChartConfig = {
  [key: string]: {
    label?: React.ReactNode;
    icon?: React.ComponentType;
  } & ({ color?: string; theme?: never } | { color?: never; theme: Record<keyof typeof THEMES, string> });
};

const ChartContext = React.createContext<{ config: ChartConfig } | null>(null);

function useChart() {
  const context = React.useContext(ChartContext);
  if (!context) throw new Error('useChart must be used within a <ChartContainer />');
  return context;
}

function ChartContainer({ id, className, children, config, ...props }: React.ComponentProps<'div'> & {
  config: ChartConfig;
  children: React.ComponentProps<typeof RechartsPrimitive.ResponsiveContainer>['children'];
}) {
  const uniqueId = React.useId();
  const chartId = `chart-${id || uniqueId.replace(/:/g, '')}`;
  return (
    <ChartContext.Provider value={{ config }}>
      <div
        data-slot="chart"
        data-chart={chartId}
        className={cn(
          "flex aspect-video justify-center text-xs [&_.recharts-cartesian-axis-tick_text]:fill-muted-foreground [&_.recharts-cartesian-grid_line[stroke='#ccc']]:stroke-border/50 [&_.recharts-curve.recharts-tooltip-cursor]:stroke-border [&_.recharts-rectangle.recharts-tooltip-cursor]:fill-muted [&_.recharts-layer]:outline-hidden [&_.recharts-surface]:outline-hidden",
          className,
        )}
        {...props}
      >
        <ChartStyle id={chartId} config={config} />
        <RechartsPrimitive.ResponsiveContainer>{children}</RechartsPrimitive.ResponsiveContainer>
      </div>
    </ChartContext.Provider>
  );
}

function ChartStyle({ id, config }: { id: string; config: ChartConfig }) {
  const colorConfig = Object.entries(config).filter(([, item]) => item.theme || item.color);
  if (!colorConfig.length) return null;
  return (
    <style
      dangerouslySetInnerHTML={{
        __html: Object.entries(THEMES)
          .map(([theme, prefix]) => `
${prefix} [data-chart=${id}] {
${colorConfig
  .map(([key, item]) => {
    const color = item.theme?.[theme as keyof typeof item.theme] || item.color;
    return color ? `  --color-${key}: ${color};` : null;
  })
  .join('\n')}
}
`)
          .join('\n'),
      }}
    />
  );
}

const ChartTooltip = RechartsPrimitive.Tooltip;

type TooltipItem = { name?: string | number; value?: number | string; dataKey?: string | number; color?: string; payload?: Record<string, unknown> };

function ChartTooltipContent({ active, payload, label, className, labelFormatter, valueFormatter }: {
  active?: boolean;
  payload?: TooltipItem[];
  label?: string | number;
  className?: string;
  labelFormatter?: (label: string | number | undefined) => React.ReactNode;
  valueFormatter?: (value: number, key: string) => React.ReactNode;
}) {
  const { config } = useChart();
  if (!active || !payload?.length) return null;
  return (
    <div className={cn('grid min-w-32 items-start gap-1.5 rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl', className)}>
      <div className="font-medium">{labelFormatter ? labelFormatter(label) : label}</div>
      <div className="grid gap-1.5">
        {payload.map((item) => {
          const key = String(item.dataKey ?? item.name ?? 'value');
          const itemConfig = config[key];
          return (
            <div key={key} className="flex w-full items-center gap-2">
              <span className="size-2.5 shrink-0 rounded-[2px]" style={{ background: item.color ?? `var(--color-${key})` }} aria-hidden />
              <span className="flex-1 text-muted-foreground">{itemConfig?.label ?? item.name}</span>
              <span className="font-mono font-medium text-foreground tabular-nums">
                {valueFormatter ? valueFormatter(Number(item.value), key) : item.value}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export { ChartContainer, ChartStyle, ChartTooltip, ChartTooltipContent };
