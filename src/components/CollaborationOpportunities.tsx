import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUpRight,
  BookOpen,
  Building2,
  Check,
  ChevronDown,
  ChevronUp,
  GraduationCap,
  Handshake,
  Layers3,
  Loader2,
  Search,
  Sparkles,
  TrendingUp,
  UserRoundSearch,
  UsersRound,
  X,
} from "lucide-react";
import {
  getCollaborationOpportunities,
  suggestResearchers,
  type CollaborationOpportunity,
  type CollaborationOpportunitiesResult,
  type ResearcherSuggestion,
  type ResearcherThemeEvidencePaper,
} from "@/lib/researcherSearch";


const resultCache = new Map<string, CollaborationOpportunitiesResult>();
type ScopeFilter = "all" | "department" | "faculty";


function paperLink(paper: ResearcherThemeEvidencePaper) {
  if (paper.doi) return paper.doi.startsWith("http") ? paper.doi : `https://doi.org/${paper.doi}`;
  return paper.openalexWorkId ? `https://openalex.org/${paper.openalexWorkId}` : "";
}


function opportunityLabel(opportunity: CollaborationOpportunity, maximumScore: number) {
  const relativeScore = maximumScore > 0 ? opportunity.topicalScore / maximumScore : 0;
  if (opportunity.sharedTopicCount >= 3 || relativeScore >= 0.72) {
    return { label: "Strong opportunity", className: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300" };
  }
  if (opportunity.sharedTopicCount >= 2 || relativeScore >= 0.4) {
    return { label: "Promising", className: "bg-amber-500/12 text-amber-700 dark:text-amber-300" };
  }
  return { label: "Exploratory", className: "bg-secondary text-muted-foreground" };
}


function EvidencePaper({ paper }: { paper?: ResearcherThemeEvidencePaper }) {
  if (!paper) return <span className="text-xs text-muted-foreground">No representative paper available</span>;
  const href = paperLink(paper);
  const content = (
    <>
      <span className="line-clamp-2 leading-snug">{paper.title}</span>
      {paper.year ? <span className="mt-1 block text-[10px] text-muted-foreground">{paper.year}</span> : null}
    </>
  );
  return href ? (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="group text-xs font-medium text-foreground transition-colors hover:text-primary"
    >
      {content}
    </a>
  ) : (
    <span className="text-xs font-medium text-foreground">{content}</span>
  );
}


function OpportunityCard({
  opportunity,
  sourceName,
  maximumScore,
  selectedTopicIds,
  onToggleTopic,
  onOpenProfile,
}: {
  opportunity: CollaborationOpportunity;
  sourceName: string;
  maximumScore: number;
  selectedTopicIds: string[];
  onToggleTopic: (topicId: string) => void;
  onOpenProfile?: (suggestion: ResearcherSuggestion) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const match = opportunityLabel(opportunity, maximumScore);
  const visibleTopics = opportunity.sharedTopics.slice(0, isExpanded ? 4 : 2);

  return (
    <article className="flex min-h-[320px] flex-col rounded-lg border border-border bg-card p-4 shadow-sm transition-colors hover:border-primary/35">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${match.className}`}>
              {match.label}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/8 px-2.5 py-1 text-[10px] font-medium text-primary">
              <Check className="h-3 w-3" />
              No recorded co-authorship
            </span>
          </div>
          <h3 className="mt-3 text-base font-semibold text-foreground">{opportunity.name}</h3>
          <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{opportunity.title}</p>
        </div>
        {onOpenProfile ? (
          <button
            type="button"
            title={`Open ${opportunity.name} in Researcher Profile`}
            onClick={() => onOpenProfile({
              researcherId: opportunity.researcherId,
              openalexId: opportunity.openalexId || undefined,
              profileUrl: opportunity.profileUrl || undefined,
              name: opportunity.name,
              title: opportunity.title,
              department: opportunity.department,
              faculty: opportunity.faculty,
              score: opportunity.topicalScore,
            })}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/8 hover:text-primary"
          >
            <ArrowUpRight className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5 text-[10px] text-muted-foreground">
        {opportunity.department ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-1">
            <Building2 className="h-3 w-3" />
            {opportunity.department}
          </span>
        ) : null}
        {opportunity.crossFaculty ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-primary/8 px-2 py-1 text-primary">
            <GraduationCap className="h-3 w-3" />
            Cross-faculty
          </span>
        ) : opportunity.crossDepartment ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-primary/8 px-2 py-1 text-primary">
            <Layers3 className="h-3 w-3" />
            Cross-department
          </span>
        ) : null}
      </div>

      <div className="mt-4 border-t border-border pt-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[11px] font-semibold uppercase text-muted-foreground">Shared research ground</p>
          <span className="text-[10px] text-muted-foreground">
            {opportunity.sharedTopicCount} shared {opportunity.sharedTopicCount === 1 ? "topic" : "topics"}
          </span>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {visibleTopics.map(topic => (
            <button
              key={topic.openalexTopicId}
              type="button"
              aria-pressed={selectedTopicIds.includes(topic.openalexTopicId)}
              onClick={() => onToggleTopic(topic.openalexTopicId)}
              title="Filter collaboration opportunities by this topic"
              className={`rounded-full border px-2.5 py-1 text-[10px] font-medium transition-colors ${
                selectedTopicIds.includes(topic.openalexTopicId)
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-primary/20 bg-primary/8 text-primary hover:bg-primary/15"
              }`}
            >
              {topic.label}
            </button>
          ))}
        </div>
      </div>

      {visibleTopics[0] ? (
        <div className="mt-4 grid grid-cols-2 gap-3 border-t border-border pt-3">
          <div className="min-w-0">
            <p className="mb-2 line-clamp-1 text-[10px] font-semibold uppercase text-muted-foreground">{sourceName}</p>
            <EvidencePaper paper={visibleTopics[0].sourceEvidence[0]} />
          </div>
          <div className="min-w-0 border-l border-border pl-3">
            <p className="mb-2 line-clamp-1 text-[10px] font-semibold uppercase text-muted-foreground">{opportunity.name}</p>
            <EvidencePaper paper={visibleTopics[0].candidateEvidence[0]} />
          </div>
        </div>
      ) : null}

      {opportunity.sharedTopics.length > 2 ? (
        <button
          type="button"
          onClick={() => setIsExpanded(value => !value)}
          className="mt-auto inline-flex min-h-9 items-center gap-1.5 self-start pt-4 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          {isExpanded ? "Show less" : `Show ${Math.min(2, opportunity.sharedTopics.length - 2)} more topics`}
        </button>
      ) : <div className="mt-auto" />}
    </article>
  );
}


export default function CollaborationOpportunities({
  onOpenProfile,
}: {
  onOpenProfile?: (suggestion: ResearcherSuggestion) => void;
}) {
  const requestIdRef = useRef(0);
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<ResearcherSuggestion[]>([]);
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [selectedResearcher, setSelectedResearcher] = useState<ResearcherSuggestion | null>(null);
  const [result, setResult] = useState<CollaborationOpportunitiesResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [scope, setScope] = useState<ScopeFilter>("all");
  const [emergingOnly, setEmergingOnly] = useState(false);
  const [selectedTopicIds, setSelectedTopicIds] = useState<string[]>([]);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2 || (selectedResearcher && trimmed.toLowerCase() === selectedResearcher.name.toLowerCase())) {
      setSuggestions([]);
      setIsSuggesting(false);
      return;
    }
    let cancelled = false;
    setIsSuggesting(true);
    const timer = window.setTimeout(() => {
      suggestResearchers(trimmed)
        .then(rows => {
          if (!cancelled) setSuggestions(rows.slice(0, 8));
        })
        .catch(() => {
          if (!cancelled) setSuggestions([]);
        })
        .finally(() => {
          if (!cancelled) setIsSuggesting(false);
        });
    }, 180);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query, selectedResearcher]);

  const selectResearcher = async (researcher: ResearcherSuggestion) => {
    const requestId = ++requestIdRef.current;
    setSelectedResearcher(researcher);
    setQuery(researcher.name);
    setSuggestions([]);
    setScope("all");
    setEmergingOnly(false);
    setSelectedTopicIds([]);
    setIsLoading(true);
    setError("");
    try {
      const cached = resultCache.get(researcher.researcherId);
      const response = cached || await getCollaborationOpportunities(researcher.researcherId, 24);
      if (requestId !== requestIdRef.current) return;
      if (!cached) resultCache.set(researcher.researcherId, response);
      setResult(response);
    } catch (loadError) {
      if (requestId !== requestIdRef.current) return;
      setResult(null);
      setError(loadError instanceof Error ? loadError.message : "Could not load collaboration opportunities.");
    } finally {
      if (requestId === requestIdRef.current) setIsLoading(false);
    }
  };

  const clearResearcher = () => {
    requestIdRef.current += 1;
    setSelectedResearcher(null);
    setQuery("");
    setSuggestions([]);
    setResult(null);
    setError("");
    setIsLoading(false);
    setSelectedTopicIds([]);
  };

  const toggleTopic = (topicId: string) => {
    setSelectedTopicIds(current => (
      current.includes(topicId)
        ? current.filter(id => id !== topicId)
        : [...current, topicId]
    ));
  };

  const filteredOpportunities = useMemo(() => {
    return (result?.opportunities || []).filter(opportunity => {
      if (scope === "faculty" && !opportunity.crossFaculty) return false;
      if (scope === "department" && !opportunity.crossDepartment) return false;
      if (
        selectedTopicIds.length > 0
        && !selectedTopicIds.every(topicId => opportunity.sharedTopicIds.includes(topicId))
      ) return false;
      if (emergingOnly && !opportunity.sharedTopics.some(topic => (
        topic.sourceTrend === "emerging" || topic.candidateTrend === "emerging"
      ))) return false;
      return true;
    });
  }, [emergingOnly, result, scope, selectedTopicIds]);

  const maximumScore = Math.max(0, ...(result?.opportunities || []).map(opportunity => opportunity.topicalScore));
  const crossFacultyCount = filteredOpportunities.filter(item => item.crossFaculty).length;
  const crossDepartmentCount = filteredOpportunities.filter(item => item.crossDepartment).length;
  const hasActiveFilters = scope !== "all" || emergingOnly || selectedTopicIds.length > 0;

  return (
    <main className="min-h-0 flex-1 overflow-y-auto bg-background">
      <div className="sticky top-0 z-20 border-b border-border bg-background/95 px-3 py-3 backdrop-blur-sm sm:px-6">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Handshake className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-foreground">Collaboration Opportunities</h2>
              <p className="text-xs text-muted-foreground">Related research, without a recorded co-authorship</p>
            </div>
          </div>

          <div className="relative w-full lg:max-w-xl">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={event => {
                setQuery(event.target.value);
                if (selectedResearcher && event.target.value !== selectedResearcher.name) {
                  setSelectedResearcher(null);
                  setResult(null);
                }
              }}
              placeholder="Find an Imperial researcher"
              className="h-11 w-full rounded-lg border border-input bg-card pl-10 pr-10 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/15"
            />
            {isSuggesting ? (
              <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-primary" />
            ) : query ? (
              <button
                type="button"
                title="Clear researcher"
                onClick={clearResearcher}
                className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}

            {suggestions.length > 0 ? (
              <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-30 max-h-80 overflow-y-auto rounded-lg border border-border bg-popover p-1 shadow-xl">
                {suggestions.map(suggestion => (
                  <button
                    key={suggestion.researcherId}
                    type="button"
                    onClick={() => selectResearcher(suggestion)}
                    className="flex w-full items-start gap-3 rounded-md px-3 py-2.5 text-left transition-colors hover:bg-secondary"
                  >
                    <UserRoundSearch className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-foreground">{suggestion.name}</span>
                      <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                        {[suggestion.title, suggestion.department].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {!selectedResearcher && !isLoading ? (
        <div className="mx-auto flex min-h-[60dvh] max-w-xl flex-col items-center justify-center px-6 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary">
            <UsersRound className="h-8 w-8" />
          </div>
          <h3 className="mt-5 text-lg font-semibold text-foreground">Start with one researcher</h3>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            ITMAP will look for Imperial colleagues with overlapping OpenAlex topics and no co-authorship in the stored record.
          </p>
        </div>
      ) : isLoading ? (
        <div className="mx-auto flex min-h-[60dvh] max-w-md flex-col items-center justify-center px-6 text-center">
          <Loader2 className="h-9 w-9 animate-spin text-primary" />
          <p className="mt-4 text-sm font-medium text-foreground">Comparing research topics</p>
          <p className="mt-1 text-xs text-muted-foreground">Checking shared themes and removing existing co-authors...</p>
        </div>
      ) : error ? (
        <div className="mx-auto max-w-xl p-6">
          <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">{error}</div>
        </div>
      ) : result ? (
        <div className="mx-auto max-w-7xl space-y-4 p-3 sm:p-6">
          <section className="rounded-lg border border-border bg-card p-4 sm:p-5">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-lg font-semibold text-foreground">{result.source.name}</h3>
                  <span className="rounded-full bg-secondary px-2.5 py-1 text-[10px] font-medium text-muted-foreground">
                    {hasActiveFilters
                      ? `${filteredOpportunities.length} of ${result.opportunities.length} opportunities`
                      : `${result.opportunities.length} opportunities`}
                  </span>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{result.source.title}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {[result.source.department, result.source.faculty].filter(Boolean).join(" · ")}
                </p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {result.themes.slice(0, 8).map(theme => (
                    <button
                      key={theme.openalexTopicId}
                      type="button"
                      aria-pressed={selectedTopicIds.includes(theme.openalexTopicId)}
                      onClick={() => toggleTopic(theme.openalexTopicId)}
                      title={`${theme.paperCount} papers · ${theme.trend.replace("_", " ")}`}
                      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-medium transition-colors ${
                        selectedTopicIds.includes(theme.openalexTopicId)
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-primary/15 bg-primary/8 text-primary hover:bg-primary/15"
                      }`}
                    >
                      {theme.trend === "emerging" ? <TrendingUp className="h-3 w-3" /> : null}
                      {theme.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid shrink-0 grid-cols-2 gap-2 sm:grid-cols-3">
                <div className="rounded-md bg-secondary px-3 py-2.5">
                  <p className="text-lg font-semibold text-foreground">{filteredOpportunities.length}</p>
                  <p className="text-[10px] text-muted-foreground">Candidates</p>
                </div>
                <div className="rounded-md bg-secondary px-3 py-2.5">
                  <p className="text-lg font-semibold text-foreground">{crossDepartmentCount}</p>
                  <p className="text-[10px] text-muted-foreground">Cross-department</p>
                </div>
                <div className="col-span-2 rounded-md bg-secondary px-3 py-2.5 sm:col-span-1">
                  <p className="text-lg font-semibold text-foreground">{crossFacultyCount}</p>
                  <p className="text-[10px] text-muted-foreground">Cross-faculty</p>
                </div>
              </div>
            </div>
          </section>

          {result.themes.length > 0 ? (
            <section className="flex flex-col gap-3 border-y border-border py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-center gap-1 rounded-lg bg-secondary p-1">
                {([
                  ["all", "All"],
                  ["department", "Cross-department"],
                  ["faculty", "Cross-faculty"],
                ] as Array<[ScopeFilter, string]>).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setScope(value)}
                    className={`min-h-9 rounded-md px-3 text-xs font-medium transition-colors ${
                      scope === value ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={emergingOnly}
                aria-label="Emerging topics only"
                onClick={() => setEmergingOnly(value => !value)}
                className={`flex min-h-10 items-center gap-2 rounded-lg border px-3 py-2 transition-colors ${
                  emergingOnly
                    ? "border-primary/35 bg-primary/10 text-foreground"
                    : "border-border bg-card text-muted-foreground hover:border-primary/25 hover:text-foreground"
                }`}
              >
                <TrendingUp className={`h-3.5 w-3.5 shrink-0 ${emergingOnly ? "text-primary" : ""}`} />
                <span className="text-xs font-medium">Emerging topics only</span>
                <span
                  aria-hidden="true"
                  className={`relative ml-1 h-6 w-11 shrink-0 rounded-full border transition-colors ${
                    emergingOnly ? "border-primary bg-primary" : "border-border bg-muted"
                  }`}
                >
                  <span
                    className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${
                      emergingOnly ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </span>
              </button>
            </section>
          ) : null}

          {selectedTopicIds.length > 0 ? (
            <section className="flex flex-col gap-2 border-b border-border pb-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                <span className="text-[11px] font-medium text-muted-foreground">Every selected topic:</span>
                {selectedTopicIds.map(topicId => {
                  const topic = result.themes.find(theme => theme.openalexTopicId === topicId)
                    || result.opportunities.flatMap(item => item.sharedTopics).find(item => item.openalexTopicId === topicId);
                  return (
                    <button
                      key={topicId}
                      type="button"
                      onClick={() => toggleTopic(topicId)}
                      className="inline-flex items-center gap-1 rounded-full bg-primary px-2.5 py-1 text-[10px] font-medium text-primary-foreground"
                    >
                      {topic?.label || topicId}
                      <X className="h-3 w-3" />
                    </button>
                  );
                })}
              </div>
              <button
                type="button"
                onClick={() => setSelectedTopicIds([])}
                className="self-start text-xs font-medium text-muted-foreground transition-colors hover:text-foreground sm:self-auto"
              >
                Clear topics
              </button>
            </section>
          ) : null}

          {result.themes.length === 0 ? (
            <section className="rounded-lg border border-border bg-card p-8 text-center">
              <BookOpen className="mx-auto h-8 w-8 text-muted-foreground" />
              <h3 className="mt-3 text-sm font-semibold text-foreground">Topic data is not available yet</h3>
              <p className="mx-auto mt-2 max-w-xl text-xs leading-relaxed text-muted-foreground">{result.coverageNote}</p>
            </section>
          ) : filteredOpportunities.length === 0 ? (
            <section className="rounded-lg border border-border bg-card p-8 text-center">
              <Sparkles className="mx-auto h-8 w-8 text-muted-foreground" />
              <h3 className="mt-3 text-sm font-semibold text-foreground">No opportunities match these filters</h3>
              <p className="mt-2 text-xs text-muted-foreground">Try showing all departments or including stable topics.</p>
            </section>
          ) : (
            <section className="grid grid-cols-1 gap-3 lg:grid-cols-2 2xl:grid-cols-3">
              {filteredOpportunities.map(opportunity => (
                <OpportunityCard
                  key={opportunity.researcherId}
                  opportunity={opportunity}
                  sourceName={result.source.name}
                  maximumScore={maximumScore}
                  selectedTopicIds={selectedTopicIds}
                  onToggleTopic={toggleTopic}
                  onOpenProfile={onOpenProfile}
                />
              ))}
            </section>
          )}

          <p className="pb-2 text-center text-[10px] text-muted-foreground">{result.coverageNote}</p>
        </div>
      ) : null}
    </main>
  );
}
