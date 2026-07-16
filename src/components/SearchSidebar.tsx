import { useEffect, useState } from "react";
import { Clock3, Search, SlidersHorizontal, Sparkles, Type, ChevronDown, ChevronUp, X, Upload, Loader2, HelpCircle } from "lucide-react";
import { GRADES, FACULTIES } from "@/data/mockData";

type SearchMode = "semantic" | "keyword";

export type SearchOptions = {
  enableRerank: boolean;
  includeExternalEvidence: boolean;
  rewriteMission: boolean;
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
  onCancelSearch?: () => void;
  onOptionsChange?: (options: SearchOptions) => void;
  onLoadSavedSearch?: (id: string) => void;
  isSearching?: boolean;
  activeFilters: string[];
  onToggleFilter: (filter: string) => void;
  onClearFilters: () => void;
  departmentOptions: string[];
  keywordOptions: string[];
  keywordSearchSuggestions: string[];
  schoolMissionOptions: string[];
  schoolMissionThemeOptions: string[];
  savedSearches: SavedSearchSummary[];
}

const MATCH_FILTERS = ["Strong Match", "Moderate", "Weak"];
const ATTACHMENT_CHAR_LIMIT = 20000;

async function extractPdfText(file: File) {
  const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/legacy/build/pdf.worker.min.mjs",
    import.meta.url,
  ).toString();

  const bytes = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
  const pages: string[] = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    pages.push(
      content.items
        .map(item => "str" in item ? item.str : "")
        .join(" ")
        .replace(/\s+/g, " ")
        .trim(),
    );
  }

  return pages.filter(Boolean).join("\n\n");
}

async function extractDocxText(file: File) {
  const mammoth = await import("mammoth");
  const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
  return result.value.replace(/\s+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

async function extractAttachmentText(file: File) {
  const filename = file.name.toLowerCase();
  if (filename.endsWith(".pdf") || file.type === "application/pdf") {
    return extractPdfText(file);
  }
  if (
    filename.endsWith(".docx")
    || file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    return extractDocxText(file);
  }
  return file.text();
}

export default function SearchSidebar({
  activeFilters,
  onToggleFilter,
  onClearFilters,
  onSearch,
  onCancelSearch,
  onOptionsChange,
  onLoadSavedSearch,
  isSearching = false,
  departmentOptions,
  keywordOptions,
  keywordSearchSuggestions,
  schoolMissionOptions,
  schoolMissionThemeOptions,
  savedSearches,
}: SearchSidebarProps) {
  const [searchMode, setSearchMode] = useState<SearchMode>("semantic");
  const [semanticQuery, setSemanticQuery] = useState("");
  const [keywordQuery, setKeywordQuery] = useState("");
  const [rewriteMission, setRewriteMission] = useState(false);
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
  const [attachmentError, setAttachmentError] = useState("");
  const [isReadingAttachment, setIsReadingAttachment] = useState(false);

  useEffect(() => {
    onOptionsChange?.({
      enableRerank: searchMode === "semantic",
      includeExternalEvidence: false,
      rewriteMission,
    });
  }, [searchMode, rewriteMission, onOptionsChange]);

  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const filteredKeywords = keywordOptions.filter(k =>
    k.toLowerCase().includes(keywordSearch.toLowerCase())
  );
  const keywordQuerySuggestions = keywordSearchSuggestions
    .filter(keyword => keyword.toLowerCase().includes(keywordQuery.toLowerCase()))
    .slice(0, 8);

  const runSearch = () => {
    if (isSearching) {
      onCancelSearch?.();
      return;
    }
    const query = searchMode === "keyword" ? keywordQuery : semanticQuery;
    onSearch?.(query, searchMode, {
      enableRerank: searchMode === "semantic",
      includeExternalEvidence: false,
      rewriteMission,
    });
  };

  const handleDocumentUpload = async (file?: File) => {
    if (!file) return;
    setIsReadingAttachment(true);
    setAttachmentError("");
    try {
      const text = (await extractAttachmentText(file)).trim();
      if (!text) {
        setAttachmentError("I could not find readable text in that file.");
        return;
      }
      setSemanticQuery(text.slice(0, ATTACHMENT_CHAR_LIMIT));
      setSearchMode("semantic");
    } catch (error) {
      setAttachmentError(error instanceof Error ? error.message : "Could not read that file.");
    } finally {
      setIsReadingAttachment(false);
    }
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
          {searchMode === "semantic" && (
            <label
              className="flex cursor-not-allowed items-start justify-between gap-3 opacity-55"
              title="Media, startup, video and UKRI grant evidence is temporarily disabled."
            >
              <span>
                <span className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                  Media, grants and startups
                  <HelpCircle className="h-3 w-3 text-muted-foreground" />
                </span>
                <span className="block text-[11px] leading-relaxed text-muted-foreground">Temporarily unavailable.</span>
              </span>
              <input
                type="checkbox"
                checked={false}
                disabled
                className="mt-0.5 h-4 w-4 accent-primary"
              />
            </label>
          )}
          {searchMode === "semantic" && (
            <label
              className="flex cursor-pointer items-start justify-between gap-3"
              title="Ask ITMAP to rewrite the mission first. You will review the original and rewritten text before any search runs."
            >
              <span>
                <span className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                  Rewrite mission first
                  <HelpCircle className="h-3 w-3 text-muted-foreground" />
                </span>
                <span className="block text-[11px] leading-relaxed text-muted-foreground">Review and edit the rewritten mission before searching.</span>
              </span>
              <input
                type="checkbox"
                checked={rewriteMission}
                onChange={event => setRewriteMission(event.target.checked)}
                className="mt-0.5 h-4 w-4 accent-primary"
              />
            </label>
          )}
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
                {isReadingAttachment ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Upload className="h-3.5 w-3.5" />
                )}
                {isReadingAttachment ? "Reading..." : "Attach file"}
                <input
                  type="file"
                  accept=".txt,.md,.csv,.pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  className="hidden"
                  onChange={event => {
                    handleDocumentUpload(event.target.files?.[0]);
                    event.currentTarget.value = "";
                  }}
                />
              </label>
              <span className="text-[11px] text-muted-foreground">{semanticQuery.length.toLocaleString()} chars</span>
            </div>
            {attachmentError && (
              <p className="mt-1 text-[11px] leading-relaxed text-destructive">{attachmentError}</p>
            )}
          </div>
        )}

        {/* Keyword Search Box */}
        {searchMode === "keyword" && (
          <div>
            <p className="section-label mb-2" title="Use exact terms, quoted phrases, and Boolean operators such as AND, OR, and NOT.">Keyword Search</p>
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                className="w-full rounded-lg border border-border bg-card pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
                placeholder='e.g. "air pollution" AND health NOT indoor'
                value={keywordQuery}
                onChange={event => setKeywordQuery(event.target.value)}
              />
              {keywordQuery.trim().length > 0 && keywordQuerySuggestions.length > 0 && (
                <div className="absolute z-20 top-full mt-1 w-full overflow-hidden rounded-lg border border-border bg-card shadow-lg">
                  {keywordQuerySuggestions.map(keyword => (
                    <button
                      key={keyword}
                      type="button"
                      className="w-full px-3 py-2 text-left text-xs text-foreground transition-colors hover:bg-secondary"
                      onMouseDown={() => setKeywordQuery(keyword)}
                    >
                      {keyword}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {keywordQuery.trim().length === 0 && keywordSearchSuggestions.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {keywordSearchSuggestions.slice(0, 8).map(keyword => (
                  <button
                    key={keyword}
                    type="button"
                    onClick={() => setKeywordQuery(keyword)}
                    className="rounded-md bg-secondary px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
                  >
                    {keyword}
                  </button>
                ))}
              </div>
            )}
            <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
              Supports quoted phrases plus AND, OR, and NOT. Plain keywords still work.
            </p>
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
          help="Filter by ITMAP's final strong, moderate, or weak match judgement. Weak matches are hidden by default until selected."
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
            className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-colors ${
              isSearching
                ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                : "bg-primary text-primary-foreground hover:bg-primary/90"
            }`}
          >
            {isSearching ? (
              <X className="h-4 w-4" />
            ) : (
              <Search className="h-4 w-4" />
            )}
            {isSearching ? "Stop Search" : "Search Researchers"}
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
