"use client";

// Two charts, both fed by `dashboardStats()`. Client Components because Recharts
// measures the DOM to lay itself out — there is no server rendering of an SVG
// whose dimensions depend on the container it hasn't been put in yet.
//
// Colour comes from the theme's `--chart-*` tokens rather than literal hex, so
// both charts follow light and dark mode without a second palette. The one
// exception is the colour breakdown, where the bars ARE the data: a swatch that
// rendered in the theme's grey would be showing the wrong colour.

import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { ActivityPoint } from "@/lib/dashboard";

const config = {
  pins: { label: "Photos added", color: "var(--chart-2)" },
} satisfies ChartConfig;

export default function ActivityChart({ data }: { data: ActivityPoint[] }) {
  return (
    <ChartContainer config={config} className="h-[180px] w-full">
      <AreaChart data={data} margin={{ left: -20, right: 8, top: 8, bottom: 0 }}>
        <defs>
          <linearGradient id="pixsift-activity-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-pins)" stopOpacity={0.35} />
            <stop offset="100%" stopColor="var(--color-pins)" stopOpacity={0.02} />
          </linearGradient>
        </defs>

        <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-border" />

        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          // Fourteen date labels will not fit on a phone, and Recharts' default
          // response to that is to overlap them. Showing every third keeps the
          // axis readable at any width, and the tooltip carries the exact day.
          interval={2}
          className="text-xs"
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={40}
          // Photos are whole things; a gridline at 1.5 photos means nothing.
          allowDecimals={false}
          className="text-xs"
        />

        <ChartTooltip content={<ChartTooltipContent indicator="line" />} />

        <Area
          dataKey="pins"
          type="monotone"
          stroke="var(--color-pins)"
          strokeWidth={2}
          fill="url(#pixsift-activity-fill)"
        />
      </AreaChart>
    </ChartContainer>
  );
}
