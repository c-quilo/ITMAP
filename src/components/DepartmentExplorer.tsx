import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  Building2,
  CalendarRange,
  ChevronDown,
  ChevronUp,
  Loader2,
  Info,
  Search,
  Sparkles,
  TrendingDown,
  TrendingUp,
  UsersRound,
  X,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip as ChartTooltip,
  XAxis,
  YAxis,
} from "recharts";
import DepartmentCollaborationGraph from "@/components/DepartmentCollaborationGraph";
import DepartmentReachGraph from "@/components/DepartmentReachGraph";
import {
  getOrganizationConnectionNetworks,
  getOrganizationProfile,
  listOrganizations,
  suggestOrganizations,
  type OrganizationKind,
  type OrganizationProfile,
  type OrganizationSuggestion,
  type OrganizationTheme,
  type ResearcherSuggestion,
} from "@/lib/researcherSearch";

const QUICK_ORGANIZATIONS = [
  "Grantham Institute for Climate Change",
  "Department of Mechanical Engineering",
];

const DIRECTORY_KINDS: Array<{ value: OrganizationKind | "all"; label: string }> = [
  { value: "all", label: "All" },
  { value: "department", label: "Departments" },
  { value: "institute", label: "Institutes" },
  { value: "school", label: "Schools" },
  { value: "faculty", label: "Faculties" },
  { value: "centre", label: "Centres" },
  { value: "laboratory", label: "Labs" },
];

const numberFormatter = new Intl.NumberFormat("en-GB");

function normalized(value: string) {
  return value.toLocaleLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function trendStyle(trend: OrganizationTheme["trend"]) {
  if (trend === "emerging") {
    return {
      label: "Emerging",
      chip: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
      bar: "bg-emerald-500",
      Icon: TrendingUp,
    };
  }
  if (trend === "declining") {
    return {
      label: "Cooling",
      chip: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
      bar: "bg-amber-500",
      Icon: TrendingDown,
    };
  }
  return {
    label: "Established",
    chip: "bg-primary/10 text-primary",
    bar: "bg-primary",
    Icon: CalendarRange,
  };
}

function OrganizationSearch({
  onSelect,
  isLoading,
  activeName,
  showDirectory,
  onToggleDirectory,
}: {
  onSelect: (name: string) => void;
  isLoading: boolean;
  activeName?: string;
  showDirectory: boolean;
  onToggleDirectory: () => void;
}) {
  const [query, setQuery] = useState(activeName || "");
  const [suggestions, setSuggestions] = useState<OrganizationSuggestion[]>([]);
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [suggestionError, setSuggestionError] = useState("");
  const selectedNameRef = useRef(activeName || "");

  useEffect(() => {
    if (activeName) {
      selectedNameRef.current = activeName;
      setQuery(activeName);
      setSuggestions([]);
    }
  }, [activeName]);

  useEffect(() => {
    const trimmedQuery = query.trim();
    if (
      trimmedQuery.length < 2
      || normalized(trimmedQuery) === normalized(selectedNameRef.current)
    ) {
      setSuggestions([]);
      setIsSuggesting(false);
      return;
    }

    let cancelled = false;
    setIsSuggesting(true);
    setSuggestionError("");
    const timer = window.setTimeout(async () => {
      try {
        const nextSuggestions = await suggestOrganizations(trimmedQuery);
        if (!cancelled) setSuggestions(nextSuggestions);
      } catch (error) {
        if (!cancelled) {
          setSuggestions([]);
          setSuggestionError(error instanceof Error ? error.message : "Could not load suggestions.");
        }
      } finally {
        if (!cancelled) setIsSuggesting(false);
      }
    }, 220);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query]);

  const select = (name: string) => {
    selectedNameRef.current = name;
    setQuery(name);
    setSuggestions([]);
    setSuggestionError("");
    onSelect(name);
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (activeName && normalized(query) === normalized(activeName)) {
      onToggleDirectory();
      return;
    }
    const name = suggestions[0]?.name || query.trim();
    if (name) select(name);
  };

  const hasActiveSelection = Boolean(activeName && normalized(query) === normalized(activeName));

  const showDropdown = query.trim().length >= 2
    && normalized(query) !== normalized(selectedNameRef.current)
    && (isSuggesting || suggestions.length > 0 || Boolean(suggestionError));

  return (
    <div className="relative w-full max-w-3xl">
      <form onSubmit={submit} className="relative">
        <Search className="pointer-events-none absolute left-4 top-3.5 h-4 w-4 text-muted-foreground" />
        <input
          value={query}
          onChange={event => {
            const value = event.target.value;
            setQuery(value);
            if (normalized(value) !== normalized(selectedNameRef.current)) {
              selectedNameRef.current = "";
            }
          }}
          placeholder="Find a department, institute, school, faculty, centre, or lab..."
          aria-label="Find a department or institute"
          className="h-11 w-full rounded-lg border border-border bg-background pl-10 pr-28 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20"
        />
        <button
          type={hasActiveSelection ? "button" : "submit"}
          onClick={hasActiveSelection ? onToggleDirectory : undefined}
          disabled={isLoading || (!hasActiveSelection && !query.trim())}
          title={hasActiveSelection ? (showDirectory ? "Hide organisation directory" : "Choose another organisation") : "Explore organisation"}
          className="absolute right-1.5 top-1.5 inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isLoading
            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
            : hasActiveSelection
              ? showDirectory ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />
              : <ArrowRight className="h-3.5 w-3.5" />}
          {hasActiveSelection ? "Change" : "Explore"}
        </button>
      </form>

      {showDropdown && (
        <div className="absolute inset-x-0 top-[calc(100%+6px)] z-40 max-h-80 overflow-y-auto rounded-lg border border-border bg-popover p-1 shadow-xl">
          {isSuggesting ? (
            <div className="flex items-center gap-2 px-3 py-3 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              Finding Imperial units...
            </div>
          ) : suggestionError ? (
            <p className="px-3 py-3 text-sm text-destructive">{suggestionError}</p>
          ) : suggestions.map(suggestion => (
            <button
              key={suggestion.name}
              type="button"
              onClick={() => select(suggestion.name)}
              className="flex w-full items-center justify-between gap-4 rounded-md px-3 py-2.5 text-left transition-colors hover:bg-secondary"
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-foreground">{suggestion.name}</span>
                <span className="mt-0.5 block text-xs capitalize text-muted-foreground">{suggestion.kind}</span>
              </span>
              <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                {numberFormatter.format(suggestion.researcherCount)} researchers
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ThemeTimeline({
  themes,
  firstYear,
  latestYear,
  selectedTheme,
  onSelectTheme,
}: {
  themes: OrganizationTheme[];
  firstYear?: number | null;
  latestYear?: number | null;
  selectedTheme: string;
  onSelectTheme: (theme: string) => void;
}) {
  const datedThemes = themes
    .filter(theme => theme.firstYear && theme.latestYear)
    .slice(0, 12);
  const minYear = firstYear || Math.min(...datedThemes.map(theme => Number(theme.firstYear)));
  const maxYear = latestYear || Math.max(...datedThemes.map(theme => Number(theme.latestYear)));
  const yearRange = Math.max(1, maxYear - minYear);
  const axisYears = [...new Set([0, 0.25, 0.5, 0.75, 1].map(position =>
    Math.round(minYear + yearRange * position)
  ))];

  if (datedThemes.length === 0) {
    return <p className="py-8 text-sm text-muted-foreground">No dated topic profiles are available for this unit yet.</p>;
  }

  return (
    <div className="mt-5 space-y-4">
      <div className="grid grid-cols-[minmax(130px,0.8fr)_minmax(180px,1.5fr)] gap-4 sm:grid-cols-[minmax(190px,0.8fr)_minmax(320px,1.7fr)]">
        <div />
        <div className="flex justify-between text-[10px] tabular-nums text-muted-foreground">
          {axisYears.map(year => <span key={year}>{year}</span>)}
        </div>
      </div>
      {datedThemes.map(theme => {
        const themeKey = theme.openalexTopicId || theme.label;
        const start = ((Number(theme.firstYear) - minYear) / yearRange) * 100;
        const width = Math.max(2.5, ((Number(theme.latestYear) - Number(theme.firstYear)) / yearRange) * 100);
        const style = trendStyle(theme.trend);
        const TrendIcon = style.Icon;
        return (
          <button
            key={themeKey}
            type="button"
            onClick={() => onSelectTheme(selectedTheme === themeKey ? "" : themeKey)}
            className={`grid w-full grid-cols-[minmax(130px,0.8fr)_minmax(180px,1.5fr)] items-center gap-4 rounded-md px-2 py-1.5 text-left transition-colors sm:grid-cols-[minmax(190px,0.8fr)_minmax(320px,1.7fr)] ${
              selectedTheme === themeKey ? "bg-primary/10" : "hover:bg-secondary/70"
            }`}
          >
            <span className="min-w-0">
              <span className="block truncate text-xs font-semibold text-foreground">{theme.label}</span>
              <span className="mt-0.5 flex items-center gap-1 text-[10px] text-muted-foreground">
                <TrendIcon className="h-3 w-3" />
                {theme.firstYear}-{theme.latestYear} · {theme.researcherCount} researchers
              </span>
            </span>
            <span className="relative h-7 rounded-sm bg-secondary">
              <span
                className={`absolute top-2 h-3 rounded-full ${style.bar}`}
                style={{ left: `${Math.max(0, start)}%`, width: `${Math.min(100 - Math.max(0, start), width)}%` }}
              />
            </span>
          </button>
        );
      })}
    </div>
  );
}

const THEME_LINE_COLORS = [
  "hsl(var(--publication-ai))",
  "hsl(var(--publication-climate))",
  "hsl(var(--publication-health))",
  "hsl(var(--publication-energy))",
  "hsl(var(--publication-materials))",
  "hsl(var(--publication-engineering))",
  "hsl(var(--publication-policy))",
  "hsl(var(--publication-science))",
];

function ThemePaperTimeline({ themes }: { themes: OrganizationTheme[] }) {
  const topics = themes.filter(theme => theme.yearCounts.length > 0).slice(0, 8);
  if (topics.length === 0) {
    return (
      <p className="py-8 text-sm text-muted-foreground">
        Yearly paper-topic counts are not available for this selection yet.
      </p>
    );
  }

  const currentYear = new Date().getFullYear();
  const firstYear = Math.min(...topics.flatMap(theme => theme.yearCounts.map(item => item.year)));
  const latestYear = Math.max(currentYear, ...topics.flatMap(theme => theme.yearCounts.map(item => item.year)));
  const countsByTopic = topics.map(theme => new Map(theme.yearCounts.map(item => [item.year, item.count])));
  const data = Array.from({ length: latestYear - firstYear + 1 }, (_, offset) => {
    const year = firstYear + offset;
    return Object.fromEntries([
      ["year", year],
      ...topics.flatMap((_, index) => {
        const count = countsByTopic[index].get(year) || 0;
        return year === currentYear
          ? [[`topic_${index}`, null], [`topic_${index}_partial`, count]]
          : [[`topic_${index}`, count], [`topic_${index}_partial`, null]];
      }),
    ]);
  });

  return (
    <div className="mt-5">
      <div className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-secondary px-2.5 py-1 text-[10px] font-medium text-muted-foreground">
        <Info className="h-3 w-3" />
        {currentYear} is incomplete and shown as detached points
      </div>
      <div className="overflow-x-auto pb-2">
        <div className="h-[360px] min-w-[700px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 12, right: 14, bottom: 8, left: 4 }}>
            <CartesianGrid stroke="hsl(var(--border))" strokeOpacity={0.6} vertical={false} />
            <XAxis
              dataKey="year"
              minTickGap={28}
              tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={year => Number(year) === currentYear ? `${year}*` : String(year)}
            />
            <YAxis
              allowDecimals={false}
              width={54}
              tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              label={{ value: "Papers", angle: -90, position: "insideLeft", fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
            />
            <ChartTooltip
              formatter={(value, name) => [numberFormatter.format(Number(value)), String(name)]}
              labelFormatter={label => `Year ${label}`}
              contentStyle={{
                background: "hsl(var(--popover))",
                border: "1px solid hsl(var(--border))",
                borderRadius: 6,
                color: "hsl(var(--popover-foreground))",
                fontSize: 12,
              }}
            />
            <Legend wrapperStyle={{ fontSize: 10, paddingTop: 8 }} />
            {topics.map((theme, index) => (
              <Line
                key={theme.openalexTopicId || theme.label}
                type="monotone"
                dataKey={`topic_${index}`}
                name={theme.label}
                stroke={THEME_LINE_COLORS[index % THEME_LINE_COLORS.length]}
                strokeWidth={2.2}
                dot={false}
                activeDot={{ r: 4 }}
              />
            ))}
            {topics.map((theme, index) => (
              <Line
                key={`${theme.openalexTopicId || theme.label}-partial`}
                type="linear"
                dataKey={`topic_${index}_partial`}
                name={`${theme.label} (${currentYear} partial)`}
                legendType="none"
                stroke="none"
                connectNulls={false}
                dot={{
                  r: 3.5,
                  fill: THEME_LINE_COLORS[index % THEME_LINE_COLORS.length],
                  stroke: "hsl(var(--background))",
                  strokeWidth: 1.5,
                }}
                activeDot={{ r: 5 }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

export default function DepartmentExplorer({
  initialOrganizationName,
  onOpenProfile,
}: {
  initialOrganizationName?: string;
  onOpenProfile?: (researcher: ResearcherSuggestion) => void;
}) {
  const [profile, setProfile] = useState<OrganizationProfile | null>(null);
  const [showDirectory, setShowDirectory] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedTheme, setSelectedTheme] = useState("");
  const [researcherQuery, setResearcherQuery] = useState("");
  const [researcherLimit, setResearcherLimit] = useState(36);
  const [organizationDirectory, setOrganizationDirectory] = useState<OrganizationSuggestion[]>([]);
  const [isLoadingDirectory, setIsLoadingDirectory] = useState(true);
  const [directoryError, setDirectoryError] = useState("");
  const [directoryQuery, setDirectoryQuery] = useState("");
  const [directoryKind, setDirectoryKind] = useState<OrganizationKind | "all">("all");
  const [themeChartView, setThemeChartView] = useState<"span" | "volume">("span");
  const [chartTopicFilter, setChartTopicFilter] = useState("");
  const [activeView, setActiveView] = useState<"overview" | "connections">("overview");
  const [connectionView, setConnectionView] = useState<"researchers" | "departments">("researchers");
  const [isLoadingNetwork, setIsLoadingNetwork] = useState(false);
  const [networkError, setNetworkError] = useState("");
  const organizationRequestRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    setIsLoadingDirectory(true);
    listOrganizations()
      .then(organizations => {
        if (!cancelled) setOrganizationDirectory(organizations);
      })
      .catch(loadError => {
        if (!cancelled) {
          setDirectoryError(loadError instanceof Error ? loadError.message : "Could not load the unit directory.");
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoadingDirectory(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const loadOrganizationNetwork = useCallback(async (
    organizationProfile: OrganizationProfile,
    requestId: number,
  ) => {
    const researcherIds = organizationProfile.researchers.map(researcher => researcher.researcherId);
    setIsLoadingNetwork(true);
    setNetworkError("");
    try {
      const connections = await getOrganizationConnectionNetworks(researcherIds);
      if (organizationRequestRef.current !== requestId) return;
      setProfile(currentProfile => (
        currentProfile?.organization.name === organizationProfile.organization.name
          ? {
            ...currentProfile,
            network: connections.network,
            departmentReach: connections.departmentReach,
          }
          : currentProfile
      ));
    } catch (loadError) {
      if (organizationRequestRef.current !== requestId) return;
      setNetworkError(loadError instanceof Error ? loadError.message : "Could not load department connections.");
    } finally {
      if (organizationRequestRef.current === requestId) setIsLoadingNetwork(false);
    }
  }, []);

  const loadOrganization = useCallback(async (name: string) => {
    const requestId = organizationRequestRef.current + 1;
    organizationRequestRef.current = requestId;
    setShowDirectory(false);
    setIsLoading(true);
    setIsLoadingNetwork(false);
    setError("");
    setNetworkError("");
    setSelectedTheme("");
    setResearcherQuery("");
    setResearcherLimit(36);
    setChartTopicFilter("");
    setActiveView("overview");
    setConnectionView("researchers");
    try {
      const nextProfile = await getOrganizationProfile(name);
      if (organizationRequestRef.current !== requestId) return;
      setProfile(nextProfile);
      setIsLoading(false);
      void loadOrganizationNetwork(nextProfile, requestId);
    } catch (loadError) {
      if (organizationRequestRef.current !== requestId) return;
      setError(loadError instanceof Error ? loadError.message : "Could not load this Imperial unit.");
      setIsLoading(false);
    }
  }, [loadOrganizationNetwork]);

  useEffect(() => {
    const name = initialOrganizationName?.trim();
    if (!name) return;
    void loadOrganization(name);
  }, [initialOrganizationName, loadOrganization]);

  const filteredResearchers = useMemo(() => {
    if (!profile) return [];
    const query = normalized(researcherQuery);
    return profile.researchers
      .filter(researcher => {
        const matchesTheme = !selectedTheme || researcher.themes.some(theme =>
          (theme.openalexTopicId || theme.label) === selectedTheme
        );
        if (!matchesTheme) return false;
        if (!query) return true;
        return normalized([
          researcher.name,
          researcher.title,
          researcher.department,
          researcher.faculty,
          researcher.fieldsOfResearch,
          researcher.themes.map(theme => theme.label).join(" "),
        ].join(" ")).includes(query);
      })
      .sort((first, second) => second.paperCount - first.paperCount || first.name.localeCompare(second.name));
  }, [profile, researcherQuery, selectedTheme]);

  const filteredOrganizations = useMemo(() => {
    const query = normalized(directoryQuery);
    return organizationDirectory.filter(organization => {
      const matchesKind = directoryKind === "all" || organization.kind === directoryKind;
      const matchesQuery = !query || normalized(organization.name).includes(query);
      return matchesKind && matchesQuery;
    });
  }, [directoryKind, directoryQuery, organizationDirectory]);

  const chartThemes = useMemo(() => {
    if (!profile) return [];
    if (!chartTopicFilter) return profile.themes.slice(0, themeChartView === "volume" ? 5 : 12);
    return profile.themes.filter(theme =>
      (theme.openalexTopicId || theme.label) === chartTopicFilter
    );
  }, [chartTopicFilter, profile, themeChartView]);

  const selectedThemeLabel = profile?.themes.find(theme =>
    (theme.openalexTopicId || theme.label) === selectedTheme
  )?.label;

  return (
    <main className="min-h-0 flex-1 overflow-y-auto bg-background">
      <section className="border-b border-border bg-card px-3 py-5 sm:px-6 sm:py-7">
        <div className="mx-auto max-w-7xl">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary/10">
              <Building2 className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-foreground sm:text-2xl">Departments &amp; Institutes</h2>
              <p className="mt-1 max-w-3xl text-sm leading-relaxed text-muted-foreground">
                Explore an Imperial unit as a whole: its people, strongest research themes, and topics showing recent momentum.
              </p>
            </div>
          </div>

          <div className="mt-5">
            <OrganizationSearch
              onSelect={loadOrganization}
              isLoading={isLoading}
              activeName={profile?.organization.name}
              showDirectory={showDirectory}
              onToggleDirectory={() => setShowDirectory(value => !value)}
            />
            {!profile && !isLoading && (
              <div className="mt-3 flex flex-wrap gap-2">
                {QUICK_ORGANIZATIONS.map(name => (
                  <button
                    key={name}
                    type="button"
                    onClick={() => loadOrganization(name)}
                    className="rounded-full border border-border bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
                  >
                    {name}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      {isLoading ? (
        <div className="flex min-h-[54vh] items-center justify-center p-6">
          <div className="text-center">
            <Loader2 className="mx-auto h-7 w-7 animate-spin text-primary" />
            <p className="mt-4 text-sm font-semibold text-foreground">Building the department view</p>
            <p className="mt-1 text-xs text-muted-foreground">Combining researchers, OpenAlex topics, papers, and time periods...</p>
          </div>
        </div>
      ) : error ? (
        <div className="mx-auto max-w-3xl p-6">
          <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">{error}</div>
        </div>
      ) : showDirectory || !profile ? (
        <section className="mx-auto w-full max-w-7xl px-3 py-5 sm:px-6 sm:py-7">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h3 className="text-base font-semibold text-foreground">Browse Imperial units</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                {isLoadingDirectory
                  ? "Loading the directory..."
                  : `${numberFormatter.format(filteredOrganizations.length)} organisations`}
              </p>
            </div>
            <div className="relative w-full sm:max-w-sm">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <input
                value={directoryQuery}
                onChange={event => setDirectoryQuery(event.target.value)}
                placeholder="Filter organisation names..."
                aria-label="Filter organisation directory"
                className="h-9 w-full rounded-md border border-border bg-card pl-9 pr-3 text-xs text-foreground outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </div>
          </div>

          <div className="mt-4 flex gap-1 overflow-x-auto rounded-lg bg-secondary p-1">
            {DIRECTORY_KINDS.map(kind => (
              <button
                key={kind.value}
                type="button"
                onClick={() => setDirectoryKind(kind.value)}
                className={`h-8 shrink-0 rounded-md px-3 text-xs font-medium transition-colors ${
                  directoryKind === kind.value
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {kind.label}
              </button>
            ))}
          </div>

          {isLoadingDirectory ? (
            <div className="flex min-h-[30vh] items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
            </div>
          ) : directoryError ? (
            <div className="mt-5 rounded-lg border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">
              {directoryError}
            </div>
          ) : filteredOrganizations.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">No organisation names match this filter.</div>
          ) : (
            <div className="mt-5 grid gap-x-5 sm:grid-cols-2 lg:grid-cols-3">
              {filteredOrganizations.map(organization => (
                <button
                  key={`${organization.kind}-${organization.name}`}
                  type="button"
                  onClick={() => loadOrganization(organization.name)}
                  className="group flex min-w-0 items-center justify-between gap-4 border-b border-border py-4 text-left"
                >
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold leading-snug text-foreground transition-colors group-hover:text-primary">
                      {organization.name}
                    </span>
                    <span className="mt-1 block text-[10px] font-semibold uppercase text-muted-foreground">
                      {organization.kind}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block text-xs font-semibold tabular-nums text-foreground">
                      {numberFormatter.format(organization.researcherCount)}
                    </span>
                    <span className="block text-[10px] text-muted-foreground">researchers</span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>
      ) : (
        <div className="mx-auto max-w-7xl space-y-0">
          <section className="border-b border-border px-3 py-5 sm:px-6 sm:py-7">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div className="min-w-0">
                <span className="inline-flex rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-semibold uppercase text-primary">
                  {profile.organization.kind}
                </span>
                <h3 className="mt-3 text-xl font-semibold text-foreground sm:text-2xl">{profile.organization.name}</h3>
                <p className="mt-3 max-w-4xl text-sm leading-relaxed text-muted-foreground">{profile.summary}</p>
              </div>
              <div className="grid shrink-0 grid-cols-2 rounded-lg bg-secondary p-1">
                <button
                  type="button"
                  onClick={() => setActiveView("overview")}
                  className={`h-9 rounded-md px-4 text-xs font-semibold transition-colors ${activeView === "overview" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                >
                  Overview
                </button>
                <button
                  type="button"
                  onClick={() => setActiveView("connections")}
                  className={`inline-flex h-9 items-center justify-center gap-2 rounded-md px-4 text-xs font-semibold transition-colors ${activeView === "connections" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                >
                  Connections
                  {isLoadingNetwork && <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />}
                </button>
              </div>
            </div>

            <TooltipProvider delayDuration={180}>
              <div className="mt-6 grid grid-cols-3 border-y border-border">
              {[
                { label: "Researchers", value: profile.organization.researcherCount, Icon: UsersRound },
                { label: "Distinct themes", value: profile.organization.distinctTopicCount, Icon: CalendarRange },
                {
                  label: "Emerging signals",
                  value: profile.organization.emergingTopicCount,
                  Icon: Sparkles,
                  help: "Topics whose publication activity in the latest five years is rising compared with the preceding five years, with evidence across several researchers. They indicate recent momentum, not a forecast.",
                },
              ].map((stat, index) => {
                const Icon = stat.Icon;
                return (
                  <div
                    key={stat.label}
                    className={`min-w-0 px-3 py-4 sm:px-5 ${index > 0 ? "border-l border-border" : ""}`}
                  >
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Icon className="h-3.5 w-3.5" />
                      <span className="truncate text-[10px] font-semibold uppercase">{stat.label}</span>
                      {stat.help && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              aria-label="How emerging signals are calculated"
                              className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                            >
                              <Info className="h-3.5 w-3.5" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-xs text-xs leading-relaxed">
                            {stat.help}
                          </TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                    <p className="mt-2 text-xl font-semibold tabular-nums text-foreground">{numberFormatter.format(stat.value)}</p>
                  </div>
                );
              })}
              </div>
            </TooltipProvider>
          </section>

          {activeView === "connections" && (
            <section className="py-5 sm:px-6 sm:py-7">
              {isLoadingNetwork ? (
                <div className="flex min-h-[360px] items-center justify-center border-y border-border bg-card px-5 text-center sm:rounded-lg sm:border">
                  <div>
                    <Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" />
                    <p className="mt-4 text-sm font-semibold text-foreground">Loading co-authorship connections</p>
                    <p className="mt-1 text-xs text-muted-foreground">The department overview is already available while ITMAP builds this network.</p>
                  </div>
                </div>
              ) : networkError ? (
                <div className="border-y border-destructive/20 bg-destructive/5 p-5 text-sm sm:rounded-lg sm:border">
                  <p className="font-semibold text-destructive">Connections could not be loaded.</p>
                  <p className="mt-1 text-xs text-muted-foreground">{networkError}</p>
                  <button
                    type="button"
                    onClick={() => void loadOrganizationNetwork(profile, organizationRequestRef.current)}
                    className="mt-4 inline-flex h-8 items-center rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
                  >
                    Try again
                  </button>
                </div>
              ) : (
                <div>
                  <div className="mx-auto mb-4 grid w-full max-w-md grid-cols-2 rounded-lg bg-secondary p-1">
                    <button
                      type="button"
                      onClick={() => setConnectionView("researchers")}
                      className={`h-9 rounded-md px-3 text-xs font-semibold transition-colors ${connectionView === "researchers" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                    >
                      Researchers
                    </button>
                    <button
                      type="button"
                      onClick={() => setConnectionView("departments")}
                      className={`h-9 rounded-md px-3 text-xs font-semibold transition-colors ${connectionView === "departments" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                    >
                      Department reach
                    </button>
                  </div>
                  {connectionView === "researchers" ? (
                    <DepartmentCollaborationGraph profile={profile} onOpenProfile={onOpenProfile} />
                  ) : (
                    <DepartmentReachGraph
                      organizationName={profile.organization.name}
                      reach={profile.departmentReach}
                      onOpenOrganization={loadOrganization}
                    />
                  )}
                </div>
              )}
            </section>
          )}

          <div className={activeView === "overview" ? "block" : "hidden"}>

          <section className="border-b border-border px-3 py-5 sm:px-6 sm:py-7">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <h3 className="text-base font-semibold text-foreground">
                  {themeChartView === "span" ? "Theme activity span" : "Paper volume by theme"}
                </h3>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  {themeChartView === "span"
                    ? "The first and latest publication years associated with each leading OpenAlex topic. Click a theme to filter researchers."
                    : "Stored author-topic paper counts, with the number of papers shown on the vertical axis."}
                </p>
              </div>
              <div className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto">
                <div className="grid grid-cols-2 rounded-lg bg-secondary p-1">
                  <button
                    type="button"
                    onClick={() => setThemeChartView("span")}
                    className={`h-8 rounded-md px-3 text-xs font-medium transition-colors ${themeChartView === "span" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                  >
                    Activity span
                  </button>
                  <button
                    type="button"
                    onClick={() => setThemeChartView("volume")}
                    className={`h-8 rounded-md px-3 text-xs font-medium transition-colors ${themeChartView === "volume" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                  >
                    Paper volume
                  </button>
                </div>
                <select
                  value={chartTopicFilter}
                  onChange={event => setChartTopicFilter(event.target.value)}
                  aria-label="Topic shown in department chart"
                  className="h-10 min-w-0 rounded-md border border-border bg-card px-3 text-xs text-foreground outline-none focus:border-primary sm:max-w-[300px]"
                >
                  <option value="">{themeChartView === "volume" ? "Top 5 themes" : "Top 12 themes"}</option>
                  {profile.themes.map(theme => (
                    <option key={theme.openalexTopicId || theme.label} value={theme.openalexTopicId || theme.label}>
                      {theme.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {themeChartView === "span" ? (
              <>
                <div className="mt-4 flex flex-wrap gap-2 text-[10px]">
                  <span className="rounded-full bg-emerald-500/10 px-2 py-1 text-emerald-700 dark:text-emerald-300">Emerging</span>
                  <span className="rounded-full bg-primary/10 px-2 py-1 text-primary">Established</span>
                  <span className="rounded-full bg-amber-500/10 px-2 py-1 text-amber-700 dark:text-amber-300">Cooling</span>
                </div>
                <div className="overflow-x-auto pb-2">
                  <div className="min-w-[580px]">
                    <ThemeTimeline
                      themes={chartThemes}
                      firstYear={profile.organization.firstYear}
                      latestYear={profile.organization.latestYear}
                      selectedTheme={selectedTheme}
                      onSelectTheme={theme => {
                        setSelectedTheme(theme);
                        setResearcherLimit(36);
                      }}
                    />
                  </div>
                </div>
              </>
            ) : (
              <ThemePaperTimeline themes={chartThemes} />
            )}
          </section>

          <section className="grid border-b border-border lg:grid-cols-[0.85fr_1.15fr]">
            <div className="border-b border-border px-3 py-5 sm:px-6 sm:py-7 lg:border-b-0 lg:border-r">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-emerald-600 dark:text-emerald-300" />
                <h3 className="text-base font-semibold text-foreground">Emerging themes</h3>
              </div>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                Topics with recent paper activity and rising signals across several researchers in this unit.
              </p>
              <div className="mt-4 divide-y divide-border">
                {profile.emergingThemes.length === 0 ? (
                  <p className="py-5 text-sm text-muted-foreground">No unit-level emerging signal passes the current evidence threshold.</p>
                ) : profile.emergingThemes.slice(0, 10).map(theme => {
                  const themeKey = theme.openalexTopicId || theme.label;
                  return (
                    <button
                      key={themeKey}
                      type="button"
                      onClick={() => {
                        setSelectedTheme(selectedTheme === themeKey ? "" : themeKey);
                        setResearcherLimit(36);
                      }}
                      className={`flex w-full items-start justify-between gap-3 py-3 text-left transition-colors ${selectedTheme === themeKey ? "text-primary" : "text-foreground hover:text-primary"}`}
                    >
                      <span className="min-w-0">
                        <span className="block text-sm font-medium">{theme.label}</span>
                        <span className="mt-1 block text-[11px] text-muted-foreground">
                          {theme.researcherCount} researchers · {theme.recentPaperCount} recent papers
                        </span>
                      </span>
                      <TrendingUp className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-300" />
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="px-3 py-5 sm:px-6 sm:py-7">
              <h3 className="text-base font-semibold text-foreground">Leading themes</h3>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                Ranked by breadth across researchers, topic strength, paper evidence, and recent activity.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {profile.themes.slice(0, 24).map(theme => {
                  const themeKey = theme.openalexTopicId || theme.label;
                  return (
                    <button
                      key={themeKey}
                      type="button"
                      title={theme.description || theme.label}
                      onClick={() => {
                        setSelectedTheme(selectedTheme === themeKey ? "" : themeKey);
                        setResearcherLimit(36);
                      }}
                      className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                        selectedTheme === themeKey
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-background text-muted-foreground hover:border-primary/50 hover:text-foreground"
                      }`}
                    >
                      {theme.label} · {theme.researcherCount}
                    </button>
                  );
                })}
              </div>
            </div>
          </section>

          <section className="px-3 py-5 sm:px-6 sm:py-7">
            <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
              <div>
                <h3 className="text-base font-semibold text-foreground">Researchers</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  {numberFormatter.format(filteredResearchers.length)} people
                  {selectedThemeLabel ? ` connected to ${selectedThemeLabel}` : ` in ${profile.organization.name}`}.
                </p>
              </div>
              <div className="relative w-full md:max-w-sm">
                <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <input
                  value={researcherQuery}
                  onChange={event => {
                    setResearcherQuery(event.target.value);
                    setResearcherLimit(36);
                  }}
                  placeholder="Filter people in this unit..."
                  className="h-9 w-full rounded-md border border-border bg-background pl-9 pr-3 text-xs text-foreground outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </div>
            </div>

            {selectedThemeLabel && (
              <button
                type="button"
                onClick={() => setSelectedTheme("")}
                className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary"
              >
                {selectedThemeLabel}
                <X className="h-3 w-3" />
              </button>
            )}

            <div className="mt-4 grid gap-x-5 md:grid-cols-2">
              {filteredResearchers.slice(0, researcherLimit).map(researcher => (
                <button
                  key={researcher.researcherId}
                  type="button"
                  onClick={() => onOpenProfile?.({
                    researcherId: researcher.researcherId,
                    openalexId: researcher.openalexId,
                    profileUrl: researcher.profileUrl,
                    name: researcher.name,
                    title: researcher.title,
                    department: researcher.department,
                    faculty: researcher.faculty,
                    score: 1,
                  })}
                  className="group flex min-w-0 items-start justify-between gap-3 border-b border-border py-4 text-left"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-foreground transition-colors group-hover:text-primary">{researcher.name}</span>
                    <span className="mt-1 block line-clamp-1 text-xs text-muted-foreground">{researcher.title}</span>
                    {researcher.themes.length > 0 && (
                      <span className="mt-2 block line-clamp-1 text-[11px] text-muted-foreground">
                        {researcher.themes.slice(0, 3).map(theme => theme.label).join(" · ")}
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block text-xs font-semibold tabular-nums text-foreground">{numberFormatter.format(researcher.paperCount)}</span>
                    <span className="block text-[10px] text-muted-foreground">papers</span>
                  </span>
                </button>
              ))}
            </div>

            {filteredResearchers.length === 0 && (
              <p className="py-10 text-center text-sm text-muted-foreground">No researchers match this filter.</p>
            )}
            {filteredResearchers.length > researcherLimit && (
              <div className="mt-5 flex justify-center">
                <button
                  type="button"
                  onClick={() => setResearcherLimit(limit => limit + 36)}
                  className="rounded-md border border-border bg-card px-4 py-2 text-xs font-semibold text-foreground transition-colors hover:border-primary/50"
                >
                  Show more researchers
                </button>
              </div>
            )}
          </section>

          {profile.coverageNote && (
            <section className="border-t border-border bg-secondary/40 px-3 py-4 sm:px-6">
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                <span className="font-semibold text-foreground">About these figures:</span> {profile.coverageNote}
              </p>
            </section>
          )}
          </div>
        </div>
      )}
    </main>
  );
}
