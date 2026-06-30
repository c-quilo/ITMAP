import { useEffect, useMemo, useState } from "react";
import { LayoutGrid, List, ArrowUpDown, X, Search as SearchIcon, Share2, Loader2, Sparkles, Database, Brain } from "lucide-react";
import SearchSidebar from "@/components/SearchSidebar";
import ResearcherCard from "@/components/ResearcherCard";
import GraphVisualization from "@/components/GraphVisualization";
import { MOCK_RESEARCHERS } from "@/data/mockData";
import { searchResearchers } from "@/lib/researcherSearch";
import imperialLogo from "@/assets/imperial-logo.png";
import scsSwoosh from "@/assets/scs-swoosh.png";

type ViewMode = "list" | "grid";
type SortBy = "relevance" | "name" | "seniority";
type TabMode = "search" | "graph";
type SearchMode = "semantic" | "keyword" | "browse";

const GRADE_FILTERS = new Set([
  "Professor",
  "Chair",
  "Reader",
  "Senior Lecturer",
  "Lecturer",
  "Associate Lecturer",
  "Postdoc",
  "Research Fellow",
  "PhD Student",
]);

const FACULTY_FILTERS = new Set([
  "Faculty of Engineering",
  "Faculty of Natural Sciences",
  "Faculty of Medicine",
  "Imperial College Business School",
]);

function normaliseFaculty(value: string) {
  return value.replace(/^Faculty of /, "").toLowerCase();
}

function filterByAny(values: string[], filters: string[]) {
  if (filters.length === 0) return true;
  const haystack = values.join(" ").toLowerCase();
  return filters.some(filter => haystack.includes(filter.toLowerCase()));
}

const SEARCH_STEPS = [
  {
    at: 0,
    label: "Expanding the mission",
    detail: "ITMAP is clarifying the intent and separating must-have expertise from nice-to-have signals.",
    Icon: Sparkles,
  },
  {
    at: 7,
    label: "Searching profiles and papers",
    detail: "Matching the expanded mission against researcher profiles, fields, positions, and paper evidence.",
    Icon: Database,
  },
  {
    at: 16,
    label: "Collecting full publication titles",
    detail: "Adding each candidate's broader publication history before the final judgement.",
    Icon: List,
  },
  {
    at: 25,
    label: "Reranking candidates",
    detail: "ITMAP is reviewing the narrowed pool and writing grounded match explanations.",
    Icon: Brain,
  },
];

function SearchProgress({ seconds }: { seconds: number }) {
  const activeIndex = SEARCH_STEPS.reduce((latest, step, index) => seconds >= step.at ? index : latest, 0);
  const activeStep = SEARCH_STEPS[Math.max(0, activeIndex)];
  const ActiveIcon = activeStep.Icon;
  const progress = Math.min(96, 8 + seconds * 2.6);

  return (
    <div className="relative overflow-hidden rounded-lg border border-primary/15 bg-card px-4 py-3 shadow-sm">
      <div className="relative z-10 flex items-start gap-3">
        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <ActiveIcon className="h-4 w-4 text-primary" />
            <p className="text-sm font-semibold text-foreground">{activeStep.label}</p>
            <span className="text-xs text-muted-foreground">{seconds}s</span>
          </div>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{activeStep.detail}</p>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-secondary">
            <div
              className="h-full rounded-full bg-primary transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="mt-3 grid grid-cols-4 gap-1.5">
            {SEARCH_STEPS.map((step, index) => {
              const StepIcon = step.Icon;
              const isActive = index === Math.max(0, activeIndex);
              const isDone = index < Math.max(0, activeIndex);
              return (
                <div
                  key={step.label}
                  className={`flex items-center gap-1 rounded-md px-2 py-1 text-[10px] ${
                    isActive
                      ? "bg-primary/10 text-primary"
                      : isDone
                        ? "bg-secondary text-foreground"
                        : "bg-secondary/60 text-muted-foreground"
                  }`}
                >
                  <StepIcon className="h-3 w-3 shrink-0" />
                  <span className="truncate">{step.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Index() {
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [sortBy, setSortBy] = useState<SortBy>("relevance");
  const [activeFilters, setActiveFilters] = useState<string[]>([]);
  const [tabMode, setTabMode] = useState<TabMode>("search");
  const [searchResults, setSearchResults] = useState(MOCK_RESEARCHERS);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [hasSearched, setHasSearched] = useState(false);
  const [currentMission, setCurrentMission] = useState("Current mission");
  const [searchSeconds, setSearchSeconds] = useState(0);

  useEffect(() => {
    if (!isSearching) {
      setSearchSeconds(0);
      return;
    }

    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      setSearchSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 500);

    return () => window.clearInterval(timer);
  }, [isSearching]);

  const availableDepartments = useMemo(() => {
    if (!hasSearched) return [];
    return [...new Set(searchResults.map(researcher => researcher.department).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b));
  }, [hasSearched, searchResults]);

  const departmentFilters = useMemo(() => new Set(availableDepartments), [availableDepartments]);

  const toggleFilter = (filter: string) => {
    setActiveFilters(prev =>
      prev.includes(filter) ? prev.filter(f => f !== filter) : [...prev, filter]
    );
  };

  const handleSearch = async (query: string, mode: SearchMode) => {
    setIsSearching(true);
    setSearchError("");
    try {
      const results = await searchResearchers({ query, mode, filters: [] });
      const nextDepartments = new Set(results.map(researcher => researcher.department).filter(Boolean));
      setActiveFilters(prev => prev.filter(filter => !departmentFilters.has(filter) || nextDepartments.has(filter)));
      setSearchResults(results);
      setCurrentMission(query);
      setHasSearched(true);
    } catch (error) {
      setSearchError(error instanceof Error ? error.message : "Search failed");
    } finally {
      setIsSearching(false);
    }
  };

  const filteredResearchers = useMemo(() => {
    const selectedGrades = activeFilters.filter(filter => GRADE_FILTERS.has(filter));
    const selectedFaculties = activeFilters.filter(filter => FACULTY_FILTERS.has(filter));
    const selectedDepartments = activeFilters.filter(filter => departmentFilters.has(filter));
    const selectedKeywords = activeFilters.filter(filter =>
      !GRADE_FILTERS.has(filter) && !FACULTY_FILTERS.has(filter) && !departmentFilters.has(filter)
    );

    return searchResults.filter(researcher => {
      const facultyMatch = selectedFaculties.length === 0
        || selectedFaculties.some(filter => normaliseFaculty(researcher.faculty) === normaliseFaculty(filter));
      const departmentMatch = selectedDepartments.length === 0
        || selectedDepartments.includes(researcher.department);
      const gradeMatch = filterByAny([researcher.title], selectedGrades);
      const keywordMatch = filterByAny([
        researcher.summary,
        researcher.keywords.join(" "),
        researcher.matchedKeywords.join(" "),
        researcher.publications.map(pub => pub.title).join(" "),
      ], selectedKeywords);

      return facultyMatch && departmentMatch && gradeMatch && keywordMatch;
    });
  }, [activeFilters, departmentFilters, searchResults]);

  const sortedResearchers = [...filteredResearchers].sort((a, b) => {
    if (sortBy === "relevance") return b.relevanceScore - a.relevanceScore;
    if (sortBy === "name") return a.name.localeCompare(b.name);
    return b.relevanceScore - a.relevanceScore;
  });

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="h-24 border-b border-border bg-card flex items-center justify-between px-6 shrink-0 relative overflow-hidden">
        {/* Swoosh background */}
        <img
          src={scsSwoosh}
          alt=""
          className="absolute inset-0 w-full h-full object-cover scale-[2] translate-y-[30%] brightness-0 opacity-[0.18] pointer-events-none"
        />
        <div className="flex items-center gap-4 relative z-10">
          <img
            src={imperialLogo}
            alt="Imperial College London - School of Convergence Science"
            className="h-8 brightness-0"
          />
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-1 bg-secondary rounded-lg p-0.5 relative z-10">
          <button
            onClick={() => setTabMode("search")}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-md text-xs font-medium transition-all ${
              tabMode === "search"
                ? "bg-card shadow-sm text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <SearchIcon className="h-3.5 w-3.5" />
            Search
          </button>
          <button
            onClick={() => setTabMode("graph")}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-md text-xs font-medium transition-all ${
              tabMode === "graph"
                ? "bg-card shadow-sm text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Share2 className="h-3.5 w-3.5" />
            Graph
          </button>
        </div>

        <h1 className="font-brand text-xl tracking-[0.15em] font-semibold text-foreground relative z-10">
          ITMAP
        </h1>
      </header>

      {/* Body */}
      {tabMode === "search" ? (
        <div className="flex flex-1 flex-col overflow-hidden lg:flex-row">
          {/* Sidebar */}
          <div className="max-h-[46vh] w-full shrink-0 overflow-hidden border-b border-border lg:max-h-none lg:w-[420px] lg:border-b-0 lg:border-r">
            <SearchSidebar
              activeFilters={activeFilters}
              onToggleFilter={toggleFilter}
              onClearFilters={() => setActiveFilters([])}
              onSearch={handleSearch}
              isSearching={isSearching}
              departmentOptions={availableDepartments}
            />
          </div>

          {/* Results */}
          <main className="flex-1 overflow-y-auto">
            {/* Results Header */}
            <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b border-border px-6 py-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <p className="text-sm font-medium text-foreground">
                    {sortedResearchers.length} researchers found
                  </p>
                  {searchError && (
                    <span className="text-xs text-destructive">{searchError}</span>
                  )}
                  {activeFilters.length > 0 && (
                    <div className="flex items-center gap-1.5 ml-2">
                      {activeFilters.slice(0, 3).map(f => (
                        <span key={f} className="filter-chip filter-chip-active text-[10px] py-1 px-2" onClick={() => toggleFilter(f)}>
                          {f}
                          <X className="h-2.5 w-2.5" />
                        </span>
                      ))}
                      {activeFilters.length > 3 && (
                        <span className="text-[10px] text-muted-foreground">+{activeFilters.length - 3} more</span>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1.5">
                    <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground" />
                    <select
                      value={sortBy}
                      onChange={e => setSortBy(e.target.value as SortBy)}
                      className="text-xs bg-transparent border-0 text-muted-foreground focus:outline-none cursor-pointer"
                    >
                      <option value="relevance">Relevance</option>
                      <option value="name">Name</option>
                      <option value="seniority">Seniority</option>
                    </select>
                  </div>
                  <div className="w-px h-4 bg-border" />
                  <div className="flex items-center gap-0.5 bg-secondary rounded-md p-0.5">
                    <button
                      onClick={() => setViewMode("list")}
                      className={`p-1.5 rounded transition-colors ${viewMode === "list" ? "bg-card shadow-sm" : ""}`}
                    >
                      <List className="h-3.5 w-3.5 text-foreground" />
                    </button>
                    <button
                      onClick={() => setViewMode("grid")}
                      className={`p-1.5 rounded transition-colors ${viewMode === "grid" ? "bg-card shadow-sm" : ""}`}
                    >
                      <LayoutGrid className="h-3.5 w-3.5 text-foreground" />
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Results List */}
            <div className={`p-6 ${viewMode === "grid" ? "grid grid-cols-2 gap-4" : "space-y-4 max-w-4xl"}`}>
              {isSearching && (
                <SearchProgress seconds={searchSeconds} />
              )}
              {sortedResearchers.map((r, i) => (
                <ResearcherCard
                  key={r.id}
                  researcher={r}
                  showSemanticExplanation={i < 10}
                />
              ))}
            </div>
          </main>
        </div>
      ) : (
        <GraphVisualization researchers={sortedResearchers} missionLabel={currentMission} />
      )}
    </div>
  );
}
