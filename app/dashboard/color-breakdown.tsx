"use client";

// "Which colours do you actually shoot?" — k-means output, aggregated across a
// whole board.
//
// This is the chart that makes algorithm 3 worth having beyond a single pin's
// palette strip. One photo's palette is a curiosity; the distribution across a
// hundred of them is a fact about the photographer, and it is derived entirely
// from clustering that already ran at upload time.
//
// Deliberately NOT a pie chart. Comparing angles is harder than comparing
// lengths, the labels never fit, and nine slices is well past the handful a pie
// can carry. A sorted horizontal bar answers "which is biggest" and "by how
// much" at a glance.

import { Bar, BarChart, Cell, XAxis, YAxis } from "recharts";

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { FamilySlice } from "@/lib/dashboard";

const config = {
  weight: { label: "Share of your photos" },
} satisfies ChartConfig;

export default function ColorBreakdown({ data }: { data: FamilySlice[] }) {
  const rows = data.map((slice) => ({
    ...slice,
    // Recharts wants a plain number; the percentage formatting happens in the
    // axis and the tooltip so the underlying value stays exact.
    percent: slice.weight * 100,
  }));

  return (
    <ChartContainer config={config} className="h-[240px] w-full">
      <BarChart data={rows} layout="vertical" margin={{ left: 4, right: 24, top: 4, bottom: 4 }}>
        <XAxis type="number" hide />
        <YAxis
          type="category"
          dataKey="label"
          tickLine={false}
          axisLine={false}
          width={64}
          className="text-xs"
        />

        <ChartTooltip
          content={
            <ChartTooltipContent
              hideIndicator
              formatter={(value, _name, item) => (
                <span className="flex items-center gap-2">
                  <span
                    className="size-2.5 rounded-[2px]"
                    style={{ backgroundColor: item.payload.swatch }}
                  />
                  {Number(value).toFixed(1)}% of your photos · {item.payload.pins} pin
                  {item.payload.pins === 1 ? "" : "s"}
                </span>
              )}
            />
          }
        />

        <Bar dataKey="percent" radius={4}>
          {/* Each bar painted in the colour it represents. This is the one place
              in the app where a chart ignores the theme palette on purpose —
              the colour is not decoration here, it is the value being plotted. */}
          {rows.map((row) => (
            <Cell key={row.key} fill={row.swatch} />
          ))}
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}
