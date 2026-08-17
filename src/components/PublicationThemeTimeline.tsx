import { useMemo, useState } from "react";
import { ChartNoAxesCombined, ExternalLink } from "lucide-react";
import type { Publication } from "@/data/mockData";

type ThemeDefinition = {
  id: string;
  label: string;
  color: string;
  keywords: string[];
};

type ThemeBucket = {
  key: string;
  theme: ThemeDefinition;
  year: number;
  papers: Publication[];
};

const THEMES: ThemeDefinition[] = [
  {
    id: "ai-data",
    label: "AI & Data",
    color: "hsl(var(--publication-ai))",
    keywords: [
      "artificial intelligence", "machine learning", "deep learning", "neural network", "data assimilation",
      "computer vision", "natural language", "foundation model", "diffusion model", "algorithm", "forecasting",
      "data science", "computational", "simulation",
    ],
  },
  {
    id: "climate-environment",
    label: "Climate & Environment",
    color: "hsl(var(--publication-climate))",
    keywords: [
      "climate", "weather", "atmospheric", "pollution", "emission", "environmental", "wildfire", "ocean",
      "precipitation", "meteorolog", "air quality", "carbon", "ecosystem", "biodiversity", "exposure",
    ],
  },
  {
    id: "health-medicine",
    label: "Health & Medicine",
    color: "hsl(var(--publication-health))",
    keywords: [
      "health", "clinical", "patient", "disease", "cancer", "medical", "healthcare", "epidemiolog", "biomedical",
      "hospital", "drug", "diagnosis", "mortality", "genomic", "therapy", "infection",
    ],
  },
  {
    id: "energy-sustainability",
    label: "Energy & Sustainability",
    color: "hsl(var(--publication-energy))",
    keywords: [
      "energy", "sustainable", "sustainability", "renewable", "battery", "hydrogen", "fuel", "net zero",
      "decarbon", "circular economy", "solar", "wind power", "electricity", "biofuel",
    ],
  },
  {
    id: "materials-chemistry",
    label: "Materials & Chemistry",
    color: "hsl(var(--publication-materials))",
    keywords: [
      "material", "chemistry", "chemical", "catalyst", "polymer", "molecular", "nanoparticle", "synthesis",
      "spectroscopy", "electrochem", "membrane", "compound", "crystal", "surface",
    ],
  },
  {
    id: "engineering-systems",
    label: "Engineering & Systems",
    color: "hsl(var(--publication-engineering))",
    keywords: [
      "engineering", "control system", "robot", "sensor", "infrastructure", "transport", "fluid", "mechanics",
      "manufacturing", "optimisation", "optimization", "design", "network", "process", "aerodynamic",
    ],
  },
  {
    id: "policy-society",
    label: "Policy & Society",
    color: "hsl(var(--publication-policy))",
    keywords: [
      "policy", "economics", "economic", "social", "governance", "justice", "behaviour", "behavior", "education",
      "public engagement", "inequality", "community", "political", "regulation", "management",
    ],
  },
  {
    id: "fundamental-science",
    label: "Fundamental Science",
    color: "hsl(var(--publication-science))",
    keywords: [
      "physics", "quantum", "mathematics", "theoretical", "particle", "astronomy", "astrophysic", "cosmolog",
      "geometry", "statistical", "dynamics", "plasma", "relativity",
    ],
  },
  {
    id: "other",
    label: "Other themes",
    color: "hsl(var(--muted-foreground))",
    keywords: [],
  },
];

const CHART_WIDTH = 1120;
const LEFT_MARGIN = 174;
const RIGHT_MARGIN = 34;
const TOP_MARGIN = 98;
const ROW_HEIGHT = 58;
const BOTTOM_MARGIN = 42;

function normalise(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function paperTheme(paper: Publication) {
  const text = normalise(`${paper.title} ${paper.abstract || ""}`);
  let bestTheme = THEMES[THEMES.length - 1];
  let bestScore = 0;

  for (const theme of THEMES.slice(0, -1)) {
    const score = theme.keywords.reduce((total, keyword) => {
      if (!text.includes(keyword)) return total;
      return total + (keyword.includes(" ") ? 2 : 1);
    }, 0);
    if (score > bestScore) {
      bestScore = score;
      bestTheme = theme;
    }
  }

  return bestTheme;
}

function paperUrl(paper: Publication) {
  if (paper.doiUrl) return paper.doiUrl;
  if (!paper.openalexWorkId) return "";
  const id = paper.openalexWorkId.replace(/^https?:\/\/openalex.org\//, "");
  return `https://openalex.org/${id}`;
}

function yearTicks(minYear: number, maxYear: number) {
  if (minYear === maxYear) return [minYear];
  const span = maxYear - minYear;
  const step = Math.max(1, Math.ceil(span / 8));
  const ticks = [minYear];
  for (let year = Math.ceil(minYear / step) * step; year < maxYear; year += step) {
    if (year > minYear) ticks.push(year);
  }
  ticks.push(maxYear);
  return [...new Set(ticks)];
}

export default function PublicationThemeTimeline({ papers }: { papers: Publication[] }) {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const timeline = useMemo(() => {
    const datedPapers = papers.filter(paper => Number.isFinite(paper.year) && paper.year >= 1900 && paper.year <= new Date().getFullYear() + 1);
    if (datedPapers.length === 0) return null;

    const minYear = Math.min(...datedPapers.map(paper => paper.year));
    const maxYear = Math.max(...datedPapers.map(paper => paper.year));
    const byYear = new Map<number, number>();
    const bucketMap = new Map<string, ThemeBucket>();
    const themeTotals = new Map<string, number>();

    datedPapers.forEach(paper => {
      const theme = paperTheme(paper);
      const key = `${theme.id}:${paper.year}`;
      const bucket = bucketMap.get(key) || { key, theme, year: paper.year, papers: [] };
      bucket.papers.push(paper);
      bucketMap.set(key, bucket);
      byYear.set(paper.year, (byYear.get(paper.year) || 0) + 1);
      themeTotals.set(theme.id, (themeTotals.get(theme.id) || 0) + 1);
    });

    const activeThemes = THEMES
      .filter(theme => (themeTotals.get(theme.id) || 0) > 0)
      .sort((a, b) => (themeTotals.get(b.id) || 0) - (themeTotals.get(a.id) || 0));
    const buckets = [...bucketMap.values()].sort((a, b) => a.year - b.year);
    const largestBucket = [...buckets].sort((a, b) => b.papers.length - a.papers.length)[0];

    return {
      datedPapers,
      minYear,
      maxYear,
      byYear,
      themeTotals,
      activeThemes,
      buckets,
      largestBucket,
      ticks: yearTicks(minYear, maxYear),
      maxYearCount: Math.max(...byYear.values()),
      maxBucketCount: Math.max(...buckets.map(bucket => bucket.papers.length)),
    };
  }, [papers]);

  if (!timeline) return null;

  const plotWidth = CHART_WIDTH - LEFT_MARGIN - RIGHT_MARGIN;
  const chartHeight = TOP_MARGIN + timeline.activeThemes.length * ROW_HEIGHT + BOTTOM_MARGIN;
  const yearSpan = Math.max(1, timeline.maxYear - timeline.minYear);
  const xForYear = (year: number) => LEFT_MARGIN + ((year - timeline.minYear) / yearSpan) * plotWidth;
  const barWidth = Math.max(5, Math.min(20, (plotWidth / (yearSpan + 1)) * 0.66));
  const selectedBucket = timeline.buckets.find(bucket => bucket.key === selectedKey) || timeline.largestBucket;
  const selectedPapers = [...selectedBucket.papers].sort((a, b) => b.citations - a.citations);

  return (
    <section className="xl:col-span-2 overflow-hidden rounded-lg border border-border bg-card">
      <div className="flex flex-col gap-3 border-b border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10">
            <ChartNoAxesCombined className="h-4 w-4 text-primary" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">Publication landscape</p>
            <p className="mt-1 text-xs text-muted-foreground">Publication volume and inferred research themes over time</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span><strong className="font-semibold text-foreground">{timeline.datedPapers.length.toLocaleString()}</strong> dated papers</span>
          <span><strong className="font-semibold text-foreground">{timeline.activeThemes.length}</strong> themes</span>
          <span><strong className="font-semibold text-foreground">{timeline.minYear}-{timeline.maxYear}</strong></span>
        </div>
      </div>

      <div className="overflow-x-auto px-3 pt-3">
        <svg
          viewBox={`0 0 ${CHART_WIDTH} ${chartHeight}`}
          className="h-auto min-w-[760px] w-full"
          role="img"
          aria-label={`Publication timeline from ${timeline.minYear} to ${timeline.maxYear}, grouped into ${timeline.activeThemes.length} themes`}
        >
          <text x={LEFT_MARGIN - 14} y={22} textAnchor="end" className="fill-muted-foreground text-[11px] font-medium">
            Papers per year
          </text>

          {[...timeline.byYear.entries()].map(([year, count]) => {
            const height = 8 + (count / timeline.maxYearCount) * 42;
            const x = xForYear(year);
            return (
              <g key={`total-${year}`}>
                <rect
                  x={x - barWidth / 2}
                  y={74 - height}
                  width={barWidth}
                  height={height}
                  rx="3"
                  className="fill-primary/65 transition-opacity hover:opacity-100"
                />
                <title>{year}: {count} publication{count === 1 ? "" : "s"}</title>
              </g>
            );
          })}

          {timeline.activeThemes.map((theme, themeIndex) => {
            const y = TOP_MARGIN + themeIndex * ROW_HEIGHT + ROW_HEIGHT / 2;
            return (
              <g key={theme.id}>
                {themeIndex % 2 === 0 && (
                  <rect
                    x={LEFT_MARGIN}
                    y={y - ROW_HEIGHT / 2 + 1}
                    width={plotWidth}
                    height={ROW_HEIGHT - 2}
                    rx="8"
                    className="fill-secondary/35"
                  />
                )}
                <line x1={LEFT_MARGIN} x2={CHART_WIDTH - RIGHT_MARGIN} y1={y} y2={y} className="stroke-border" strokeWidth="1" />
                <circle cx={18} cy={y - 1} r={5.5} fill={theme.color} />
                <text x={31} y={y + 3} className="fill-foreground text-[11px] font-medium">
                  {theme.label}
                </text>
                <text x={LEFT_MARGIN - 14} y={y + 3} textAnchor="end" className="fill-muted-foreground text-[10px]">
                  {(timeline.themeTotals.get(theme.id) || 0).toLocaleString()}
                </text>
              </g>
            );
          })}

          {timeline.ticks.map(year => {
            const x = xForYear(year);
            return (
              <g key={`tick-${year}`}>
                <line x1={x} x2={x} y1={TOP_MARGIN - 8} y2={chartHeight - BOTTOM_MARGIN + 5} className="stroke-border/50" strokeWidth="1" />
                <text x={x} y={chartHeight - 12} textAnchor="middle" className="fill-muted-foreground text-[10px]">
                  {year}
                </text>
              </g>
            );
          })}

          {timeline.activeThemes.map((theme, themeIndex) => {
            const themeBuckets = timeline.buckets.filter(bucket => bucket.theme.id === theme.id);
            if (themeBuckets.length < 2) return null;
            const y = TOP_MARGIN + themeIndex * ROW_HEIGHT + ROW_HEIGHT / 2;
            const path = themeBuckets
              .map((bucket, index) => `${index === 0 ? "M" : "L"} ${xForYear(bucket.year)} ${y}`)
              .join(" ");
            return (
              <path
                key={`trail-${theme.id}`}
                d={path}
                fill="none"
                stroke={theme.color}
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity="0.24"
              />
            );
          })}

          {timeline.buckets.map(bucket => {
            const themeIndex = timeline.activeThemes.findIndex(theme => theme.id === bucket.theme.id);
            const x = xForYear(bucket.year);
            const y = TOP_MARGIN + themeIndex * ROW_HEIGHT + ROW_HEIGHT / 2;
            const radius = 6 + Math.sqrt(bucket.papers.length / timeline.maxBucketCount) * 15;
            const selected = selectedBucket.key === bucket.key;
            return (
              <g
                key={bucket.key}
                role="button"
                tabIndex={0}
                aria-label={`${bucket.theme.label}, ${bucket.year}: ${bucket.papers.length} publications`}
                className="cursor-pointer outline-none"
                onClick={() => setSelectedKey(bucket.key)}
                onKeyDown={event => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setSelectedKey(bucket.key);
                  }
                }}
              >
                <circle cx={x} cy={y} r={radius + 4} fill={bucket.theme.color} opacity={selected ? 0.2 : 0.08} />
                {selected && <circle cx={x} cy={y} r={radius + 5} fill="none" className="stroke-foreground" strokeWidth="2" opacity="0.78" />}
                <circle cx={x} cy={y} r={radius} fill={bucket.theme.color} opacity={selected ? 1 : 0.84} className="transition-opacity hover:opacity-100">
                  <title>{bucket.theme.label}, {bucket.year}: {bucket.papers.length} publication{bucket.papers.length === 1 ? "" : "s"}</title>
                </circle>
                <text x={x} y={y + 3.5} textAnchor="middle" className="pointer-events-none fill-white text-[9px] font-semibold">
                  {bucket.papers.length}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      <div className="border-t border-border bg-background/45 px-4 py-3">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
          <p className="text-sm font-semibold text-foreground">
            {selectedBucket.theme.label} in {selectedBucket.year}
          </p>
          <p className="text-xs text-muted-foreground">
            {selectedBucket.papers.length} publication{selectedBucket.papers.length === 1 ? "" : "s"}
          </p>
        </div>
        <div className="mt-2 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {selectedPapers.slice(0, 6).map((paper, index) => {
            const url = paperUrl(paper);
            const content = (
              <>
                <span className="line-clamp-2 text-xs font-medium leading-relaxed text-foreground">{paper.title}</span>
                <span className="mt-1 flex flex-wrap gap-x-2 text-[10px] text-muted-foreground">
                  {paper.journal && <span>{paper.journal}</span>}
                  {paper.citations > 0 && <span>{paper.citations.toLocaleString()} citations</span>}
                </span>
              </>
            );
            return url ? (
              <a
                key={`${paper.openalexWorkId || paper.doi || paper.title}-${index}`}
                href={url}
                target="_blank"
                rel="noreferrer"
                className="group rounded-md border border-border border-l-2 bg-card px-3 py-2 transition-colors hover:bg-secondary"
                style={{ borderLeftColor: selectedBucket.theme.color }}
              >
                <span className="flex items-start justify-between gap-2">
                  <span className="min-w-0">{content}</span>
                  <ExternalLink className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground group-hover:text-primary" />
                </span>
              </a>
            ) : (
              <div
                key={`${paper.title}-${index}`}
                className="rounded-md border border-border border-l-2 bg-card px-3 py-2"
                style={{ borderLeftColor: selectedBucket.theme.color }}
              >
                {content}
              </div>
            );
          })}
        </div>
        {selectedPapers.length > 6 && (
          <p className="mt-2 text-[10px] text-muted-foreground">Showing the six most cited papers in this theme and year.</p>
        )}
        <p className="mt-3 text-[10px] leading-relaxed text-muted-foreground">
          Themes are inferred from publication titles and abstracts. Bubble size and labels show the number of papers in each theme-year group.
        </p>
      </div>
    </section>
  );
}
