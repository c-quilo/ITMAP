import { useEffect, useMemo, useState } from "react";
import { Network, UsersRound } from "lucide-react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { CollaborationTimeline as CollaborationTimelineData } from "@/lib/researcherSearch";

type TooltipPayload = {
  color?: string;
  dataKey?: string;
  name?: string;
  value?: number;
  payload?: Record<string, number>;
};

function CollaborationTooltip({
  active,
  label,
  payload,
}: {
  active?: boolean;
  label?: number;
  payload?: TooltipPayload[];
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-border bg-popover px-3 py-2 shadow-lg">
      <p className="mb-1 text-xs font-semibold text-popover-foreground">{label}</p>
      <div className="space-y-1">
        {payload.map(item => {
          const rawKey = item.dataKey === "activeDisplay"
            ? "activeCoauthors"
            : item.dataKey === "otherInstitutionsDisplay"
              ? "otherInstitutions"
              : item.dataKey || "";
          const value = item.payload?.[rawKey] ?? item.value ?? 0;
          return (
            <p key={item.dataKey} className="flex items-center justify-between gap-5 text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />
                {item.name}
              </span>
              <strong className="font-semibold text-foreground">{Number(value).toLocaleString()}</strong>
            </p>
          );
        })}
      </div>
    </div>
  );
}

export default function CollaborationTimeline({ timeline }: { timeline: CollaborationTimelineData }) {
  const availableYears = timeline.years;
  const initialYear = useMemo(() => {
    const withDepartmentLinks = [...availableYears].reverse().find(point => point.topCrossDepartment.length > 0);
    return withDepartmentLinks?.year || availableYears.at(-1)?.year || 0;
  }, [availableYears]);
  const [selectedYear, setSelectedYear] = useState(initialYear);

  useEffect(() => {
    setSelectedYear(initialYear);
  }, [initialYear]);

  if (availableYears.length === 0) return null;

  const selected = availableYears.find(point => point.year === selectedYear) || availableYears[availableYears.length - 1];
  const peak = availableYears.reduce((best, point) => point.activeCoauthors > best.activeCoauthors ? point : best, availableYears[0]);
  const startYear = availableYears[0].year;
  const endYear = availableYears[availableYears.length - 1].year;
  const chartData = availableYears.map(point => ({
    ...point,
    activeDisplay: Math.sqrt(point.activeCoauthors),
    otherInstitutionsDisplay: Math.sqrt(point.otherInstitutions),
  }));

  return (
    <section className="xl:col-span-2 overflow-hidden rounded-lg border border-border bg-card">
      <div className="flex flex-col gap-3 border-b border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10">
            <Network className="h-4 w-4 text-primary" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">Collaboration reach</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              How the researcher&apos;s active co-author network changes from year to year
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span><strong className="font-semibold text-foreground">{timeline.totalCoauthors.toLocaleString()}</strong> collaborators</span>
          <span><strong className="font-semibold text-foreground">{startYear}-{endYear}</strong></span>
          <span>Peak <strong className="font-semibold text-foreground">{peak.activeCoauthors}</strong> in {peak.year}</span>
        </div>
      </div>

      <div className="grid gap-3 px-3 py-3 sm:gap-4 sm:px-4 sm:py-4 xl:grid-cols-[minmax(0,1fr),280px]">
        <div className="min-w-0">
          <div className="mb-3 flex flex-wrap gap-x-4 gap-y-2 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-primary" />Active co-authors</span>
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-[hsl(var(--publication-energy))]" />Other departments</span>
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-[hsl(var(--publication-engineering))]" />Other faculties</span>
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-[hsl(var(--publication-health))]" />Other institutions</span>
          </div>
          <div className="h-[250px] w-full sm:h-[290px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 12, right: 4, bottom: 2, left: -14 }}>
                <defs>
                  <linearGradient id="collaboration-active-fill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.42} />
                    <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="hsl(var(--border))" strokeOpacity={0.6} vertical={false} />
                <XAxis dataKey="year" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} tickLine={false} axisLine={false} minTickGap={24} />
                <YAxis
                  yAxisId="network"
                  allowDecimals={false}
                  tickFormatter={value => Math.round(Number(value) ** 2).toLocaleString()}
                  tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis yAxisId="imperial" orientation="right" width={28} allowDecimals={false} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} tickLine={false} axisLine={false} />
                <Tooltip content={<CollaborationTooltip />} />
                <ReferenceLine
                  yAxisId="network"
                  x={selected.year}
                  stroke="hsl(var(--primary))"
                  strokeOpacity={0.35}
                />
                <Area
                  yAxisId="network"
                  type="monotone"
                  dataKey="activeDisplay"
                  name="Active co-authors"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2.4}
                  fill="url(#collaboration-active-fill)"
                  dot={{ r: 2.7, fill: "hsl(var(--card))", strokeWidth: 1.8 }}
                  activeDot={{ r: 5, strokeWidth: 2 }}
                />
                <Line yAxisId="imperial" type="monotone" dataKey="crossDepartment" name="Other departments" stroke="hsl(var(--publication-energy))" strokeWidth={2.2} dot={{ r: 2.2, fill: "hsl(var(--card))", strokeWidth: 1.5 }} activeDot={{ r: 4.5 }} />
                <Line yAxisId="imperial" type="monotone" dataKey="crossFaculty" name="Other faculties" stroke="hsl(var(--publication-engineering))" strokeWidth={2.2} dot={{ r: 2.2, fill: "hsl(var(--card))", strokeWidth: 1.5 }} activeDot={{ r: 4.5 }} />
                <Line yAxisId="network" type="monotone" dataKey="otherInstitutionsDisplay" name="Other institutions" stroke="hsl(var(--publication-health))" strokeWidth={1.9} dot={false} activeDot={{ r: 4 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        <aside className="rounded-md border border-border bg-background/55 p-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Explore a year</p>
              <p className="mt-1 text-sm font-semibold text-foreground">{selected.year} network</p>
            </div>
            <select
              value={selected.year}
              onChange={event => setSelectedYear(Number(event.target.value))}
              className="h-10 rounded-md border border-border bg-card px-2 text-xs text-foreground outline-none focus:border-primary sm:h-8"
              aria-label="Select collaboration year"
            >
              {[...availableYears].reverse().map(point => <option key={point.year} value={point.year}>{point.year}</option>)}
            </select>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2">
            {[
              ["Active", selected.activeCoauthors],
              ["New", selected.newCoauthors],
              ["Other dept.", selected.crossDepartment],
              ["Other faculty", selected.crossFaculty],
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-md border border-border bg-card px-2.5 py-2 shadow-sm">
                <p className="text-[10px] text-muted-foreground">{label}</p>
                <p className="mt-0.5 text-lg font-semibold leading-none text-foreground">{Number(value).toLocaleString()}</p>
              </div>
            ))}
          </div>

          {selected.topCrossDepartment.length > 0 ? (
            <div className="mt-4">
              <p className="flex items-center gap-1.5 text-[11px] font-semibold text-foreground">
                <UsersRound className="h-3.5 w-3.5 text-primary" />
                Cross-department collaborators
              </p>
              <div className="mt-2 space-y-2">
                {selected.topCrossDepartment.slice(0, 4).map(collaborator => (
                  <div key={collaborator.openalexId} className="rounded-sm border-l-2 border-primary/55 bg-card/70 py-1 pl-2 pr-1">
                    <p className="text-xs font-medium leading-tight text-foreground">{collaborator.name}</p>
                    <p className="mt-0.5 break-words text-[10px] leading-snug text-muted-foreground">{collaborator.department || collaborator.faculty}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="mt-4 text-[11px] leading-relaxed text-muted-foreground">
              No cross-department co-author could be matched to an ITMAP profile for this year.
            </p>
          )}
        </aside>
      </div>

      <p className="border-t border-border px-4 py-3 text-[10px] leading-relaxed text-muted-foreground">
        Active co-authors are unique people on papers published that year. The left axis uses a square-root scale so very large consortium papers do not hide the rest of the career; all labels and tooltips show exact counts. Department and faculty lines use the right-hand scale and co-authors matched to current Imperial researcher profiles.
      </p>
    </section>
  );
}
