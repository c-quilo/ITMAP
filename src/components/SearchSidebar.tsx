import { useEffect, useState } from "react";
import { Clock3, Search, SlidersHorizontal, Sparkles, Type, ChevronDown, ChevronUp, X, Upload, Loader2, HelpCircle } from "lucide-react";
import { GRADES, FACULTIES } from "@/data/mockData";

type SearchMode = "semantic" | "keyword";

export type SearchOptions = {
  enableRerank: boolean;
  includeExternalEvidence: boolean;
};

export interface SavedSearchSummary {
  id: string;
  query: string;
  mode: SearchMode;
  createdAt: string;
  resultCount: number;
}

interface SearchSidebarProps {
  onSearch?: (query: string, mode: SearchMode, options: SearchOptions) => void;
  onOptionsChange?: (options: SearchOptions) => void;
  onLoadSavedSearch?: (id: string) => void;
  isSearching?: boolean;
  activeFilters: string[];
  onToggleFilter: (filter: string) => void;
  onClearFilters: () => void;
  departmentOptions: string[];
  keywordOptions: string[];
  schoolMissionOptions: string[];
  schoolMissionThemeOptions: string[];
  savedSearches: SavedSearchSummary[];
}

const MATCH_FILTERS = ["Strong Match", "Moderate", "Weak"];

export default function SearchSidebar({
  activeFilters,
  onToggleFilter,
  onClearFilters,
  onSearch,
  onOptionsChange,
  onLoadSavedSearch,
  isSearching = false,
  departmentOptions,
  keywordOptions,
  schoolMissionOptions,
  schoolMissionThemeOptions,
  savedSearches,
}: SearchSidebarProps) {
  const [searchMode, setSearchMode] = useState<SearchMode>("semantic");
  const [semanticQuery, setSemanticQuery] = useState("");
  const [keywordQuery, setKeywordQuery] = useState("");
  const [enableRerank, setEnableRerank] = useState(true);
  const [includeExternalEvidence, setIncludeExternalEvidence] = useState(true);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    match: true,
    grade: true,
    keywords: true,
    schoolMissions: true,
    faculty: false,
    department: false,
  });
  const [keywordSearch, setKeywordSearch] = useState("");
  const [showKeywordDropdown, setShowKeywordDropdown] = useState(false);

  useEffect(() => {
    onOptionsChange?.({ enableRerank, includeExternalEvidence });
  }, [enableRerank, includeExternalEvidence, onOptionsChange]);

  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const filteredKeywords = keywordOptions.filter(k =>
    k.toLowerCase().includes(keywordSearch.toLowerCase())
  );

  const runSearch = () => {
    const query = searchMode === "keyword" ? keywordQuery : semanticQuery;
    onSearch?.(query, searchMode, { enableRerank, includeExternalEvidence });
  };

  const handleDocumentUpload = async (file?: File) => {
    if (!file) return;
    const text = await file.text();
    setSemanticQuery(text.slice(0, 12000));
    setSearchMode("semantic");
  };

  return (
    <aside className="flex h-full w-full min-h-0 flex-col border-r border-border bg-card">
      <div className="min-h-0 flex-1 overflow-y-auto p-5 space-y-6">
        {/* Search Mode Tabs */}
        <div>
          <p className="section-label mb-2.5" title="Semantic search understands a mission in natural language. Keyword search is stricter and better for exact terms.">Search Mode</p>
          <div className="grid grid-cols-2 gap-1.5 rounded-lg bg-secondary p-1">
            {[
              { mode: "semantic" as const, icon: Sparkles, label: "Semantic" },
              { mode: "keyword" as const, icon: Type, label: "Keyword" },
            ].map(({ mode, icon: Icon, label }) => (
              <button
                key={mode}
                onClick={() => setSearchMode(mode)}
                className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-xs font-medium transition-all duration-150 ${
                  searchMode === mode
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2 rounded-lg border border-border bg-background px-3 py-3">
          <p className="section-label">Search Options</p>
          <label
            className="flex cursor-pointer items-start justify-between gap-3"
            title="ITMAP rerank asks the model to review the narrowed candidate pool using each researcher's role, profile, paper titles, and evidence before final ranking."
          >
            <span>
              <span className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                ITMAP rerank
                <HelpCircle className="h-3 w-3 text-muted-foreground" />
              </span>
              <span className="block text-[11px] leading-relaxed text-muted-foreground">Review the narrowed pool with profile and paper evidence.</span>
            </span>
            <input
              type="checkbox"
              checked={enableRerank}
              onChange={event => setEnableRerank(event.target.checked)}
              className="mt-0.5 h-4 w-4 accent-primary"
            />
          </label>
          <label
            className="flex cursor-pointer items-start justify-between gap-3"
            title="Adds public web, video, startup/spinout, media, and UKRI grant signals. These only give a small boost when clearly relevant."
          >
            <span>
              <span className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                Media, grants and startups
                <HelpCircle className="h-3 w-3 text-muted-foreground" />
              </span>
              <span className="block text-[11px] leading-relaxed text-muted-foreground">Add web search and UKRI evidence.</span>
            </span>
            <input
              type="checkbox"
              checked={includeExternalEvidence}
              onChange={event => setIncludeExternalEvidence(event.target.checked)}
              className="mt-0.5 h-4 w-4 accent-primary"
            />
          </label>
        </div>

        {/* Semantic Search Box */}
        {searchMode === "semantic" && (
          <div>
            <p className="section-label mb-2" title="Describe the outcome, technology, sector, or problem you want expertise for. A sentence or paragraph is fine.">Natural Language Query</p>
            <textarea
              className="search-box-semantic"
              value={semanticQuery}
              onChange={event => setSemanticQuery(event.target.value)}
              placeholder="Describe the expertise you're looking for..."
            />
            <div className="mt-2 flex items-center justify-between gap-2">
              <label className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground hover:bg-secondary cursor-pointer transition-colors">
                <Upload className="h-3.5 w-3.5" />
                Attach text
                <input
                  type="file"
                  accept=".txt,.md,.csv"
                  className="hidden"
                  onChange={event => handleDocumentUpload(event.target.files?.[0])}
                />
              </label>
              <span className="text-[11px] text-muted-foreground">{semanticQuery.length.toLocaleString()} chars</span>
            </div>
          </div>
        )}

        {/* Keyword Search Box */}
        {searchMode === "keyword" && (
          <div>
            <p className="section-label mb-2" title="Use this when you want exact words or phrases to appear in profiles, fields, or papers.">Keyword Search</p>
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                className="w-full rounded-lg border border-border bg-card pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
                placeholder="Search by keyword..."
                value={keywordQuery}
                onChange={event => setKeywordQuery(event.target.value)}
              />
            </div>
          </div>
        )}

        {savedSearches.length > 0 && (
          <div>
            <p className="section-label mb-2">Recent Searches</p>
            <div className="space-y-1.5">
              {savedSearches.slice(0, 4).map(search => (
                <button
                  key={search.id}
                  onClick={() => onLoadSavedSearch?.(search.id)}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-left transition-colors hover:bg-secondary"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-xs font-medium text-foreground">{search.query}</span>
                    <span className="shrink-0 rounded bg-secondary px-1.5 py-0.5 text-[10px] capitalize text-muted-foreground">
                      {search.mode}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                    <Clock3 className="h-3 w-3" />
                    <span>{new Date(search.createdAt).toLocaleDateString()}</span>
                    <span>·</span>
                    <span>{search.resultCount} researchers</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Divider */}
        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-border" />
          <SlidersHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="section-label">Filters</span>
          <div className="flex-1 h-px bg-border" />
        </div>

        {/* Active Filters */}
        {activeFilters.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="section-label">Active Filters</p>
              <button onClick={onClearFilters} className="text-[11px] text-muted-foreground hover:text-destructive transition-colors">
                Clear all
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {activeFilters.map(f => (
                <span key={f} className="filter-chip filter-chip-active" onClick={() => onToggleFilter(f)}>
                  {f}
                  <X className="h-3 w-3 ml-0.5" />
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Match Filter */}
        <FilterSection
          title="Match Strength"
          help="Filter by ITMAP's final strong, moderate, or weak match judgement."
          expanded={expandedSections.match ?? true}
          onToggle={() => toggleSection("match")}
        >
          <div className="flex flex-wrap gap-1.5">
            {MATCH_FILTERS.map(match => (
              <span
                key={match}
                className={`filter-chip ${activeFilters.includes(match) ? "filter-chip-active" : ""}`}
                onClick={() => onToggleFilter(match)}
              >
                {match}
              </span>
            ))}
          </div>
        </FilterSection>

        {/* Grade Filter */}
        <FilterSection
          title="Grade / Role"
          help="Filter by seniority or role terms found in Imperial profile data."
          expanded={expandedSections.grade}
          onToggle={() => toggleSection("grade")}
        >
          <div className="flex flex-wrap gap-1.5">
            {GRADES.map(g => (
              <span
                key={g}
                className={`filter-chip ${activeFilters.includes(g) ? "filter-chip-active" : ""}`}
                onClick={() => onToggleFilter(g)}
              >
                {g}
              </span>
            ))}
          </div>
        </FilterSection>

        {/* Keywords Filter */}
        <FilterSection
          title="Keywords"
          help="These keywords are extracted from the current results' profiles, fields, and publication titles."
          expanded={expandedSections.keywords}
          onToggle={() => toggleSection("keywords")}
        >
          <div className="relative mb-2">
            <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="text"
              className="w-full rounded-md border border-border bg-background pl-8 pr-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/50 transition-all"
              placeholder="Type to find keywords..."
              value={keywordSearch}
              onChange={(e) => {
                setKeywordSearch(e.target.value);
                setShowKeywordDropdown(true);
              }}
              onFocus={() => setShowKeywordDropdown(true)}
              onBlur={() => setTimeout(() => setShowKeywordDropdown(false), 150)}
            />
            {showKeywordDropdown && keywordSearch && (
              <div className="absolute z-10 top-full mt-1 w-full bg-card border border-border rounded-lg shadow-lg max-h-40 overflow-y-auto">
                {filteredKeywords.map(k => (
                  <button
                    key={k}
                    className="w-full text-left px-3 py-1.5 text-xs hover:bg-accent transition-colors"
                    onMouseDown={() => {
                      onToggleFilter(k);
                      setKeywordSearch("");
                    }}
                  >
                    {k}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {keywordOptions.length > 0 ? keywordOptions.slice(0, 12).map(k => (
              <span
                key={k}
                className={`filter-chip ${activeFilters.includes(k) ? "filter-chip-active" : ""}`}
                onClick={() => onToggleFilter(k)}
              >
                {k}
              </span>
            )) : (
              <p className="text-xs text-muted-foreground">Run a search to generate result keywords</p>
            )}
          </div>
        </FilterSection>

        {/* School Missions Filter */}
        <FilterSection
          title="School Missions"
          help="Filter by the School of Convergence Science theme or exact mission after running Check Missions."
          expanded={expandedSections.schoolMissions}
          onToggle={() => toggleSection("schoolMissions")}
        >
          <div className="space-y-3">
            {schoolMissionThemeOptions.length > 0 || schoolMissionOptions.length > 0 ? (
              <>
                {schoolMissionThemeOptions.length > 0 && (
                  <div>
                    <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Theme</p>
                    <div className="flex flex-wrap gap-1.5">
                      {schoolMissionThemeOptions.map(option => (
                        <span
                          key={option}
                          className={`filter-chip ${activeFilters.includes(option) ? "filter-chip-active" : ""}`}
                          onClick={() => onToggleFilter(option)}
                        >
                          {option}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {schoolMissionOptions.length > 0 && (
                  <div>
                    <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Mission</p>
                    <div className="flex flex-wrap gap-1.5">
                      {schoolMissionOptions.map(option => (
                        <span
                          key={option}
                          className={`filter-chip ${activeFilters.includes(option) ? "filter-chip-active" : ""}`}
                          onClick={() => onToggleFilter(option)}
                        >
                          {option}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <p className="text-xs text-muted-foreground">Run Check Missions to filter by school relevance</p>
            )}
          </div>
        </FilterSection>

        {/* Faculty Filter */}
        <FilterSection
          title="Faculty"
          help="Filter by Imperial faculty."
          expanded={expandedSections.faculty}
          onToggle={() => toggleSection("faculty")}
        >
          <div className="space-y-1">
            {FACULTIES.map(f => (
              <button
                key={f}
                className={`w-full text-left px-3 py-2 rounded-md text-xs transition-colors ${
                  activeFilters.includes(f)
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-secondary text-foreground"
                }`}
                onClick={() => onToggleFilter(f)}
              >
                {f}
              </button>
            ))}
          </div>
        </FilterSection>

        {/* Department Filter */}
        <FilterSection
          title="Department"
          help="Departments are generated from the researchers returned by the current search."
          expanded={expandedSections.department}
          onToggle={() => toggleSection("department")}
        >
          <div className="space-y-1">
            {departmentOptions.length > 0 ? (
              departmentOptions.map(d => (
                <button
                  key={d}
                  className={`w-full text-left px-3 py-2 rounded-md text-xs transition-colors ${
                    activeFilters.includes(d)
                      ? "bg-primary text-primary-foreground"
                      : "hover:bg-secondary text-foreground"
                  }`}
                  onClick={() => onToggleFilter(d)}
                >
                  {d}
                </button>
              ))
            ) : (
              <p className="px-3 py-2 text-xs text-muted-foreground">Run a search to see departments</p>
            )}
          </div>
        </FilterSection>
      </div>
      {(searchMode === "semantic" || searchMode === "keyword") && (
        <div className="shrink-0 border-t border-border bg-card p-4">
          <button
            onClick={runSearch}
            disabled={isSearching}
            className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground py-2.5 rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isSearching ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Search className="h-4 w-4" />
            )}
            {isSearching ? "Searching..." : "Search Researchers"}
          </button>
        </div>
      )}
    </aside>
  );
}

function FilterSection({
  title,
  help,
  expanded,
  onToggle,
  children,
}: {
  title: string;
  help?: string;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div>
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between py-1.5 group"
      >
        <span className="flex items-center gap-1.5">
          <span className="section-label group-hover:text-foreground transition-colors">{title}</span>
          {help && (
            <HelpCircle
              className="h-3 w-3 text-muted-foreground"
              aria-label={help}
              title={help}
            />
          )}
        </span>
        {expanded ? (
          <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        )}
      </button>
      {expanded && <div className="mt-2">{children}</div>}
    </div>
  );
}
