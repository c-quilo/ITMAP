import { useState } from "react";
import { LayoutGrid, List, ArrowUpDown, X, Search as SearchIcon, Share2 } from "lucide-react";
import SearchSidebar from "@/components/SearchSidebar";
import ResearcherCard from "@/components/ResearcherCard";
import GraphVisualization from "@/components/GraphVisualization";
import { MOCK_RESEARCHERS } from "@/data/mockData";
import imperialLogo from "@/assets/imperial-logo.png";
import scsSwoosh from "@/assets/scs-swoosh.png";

type ViewMode = "list" | "grid";
type SortBy = "relevance" | "name" | "seniority";
type TabMode = "search" | "graph";

export default function Index() {
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [sortBy, setSortBy] = useState<SortBy>("relevance");
  const [activeFilters, setActiveFilters] = useState<string[]>(["Professor", "Reader", "Senior Lecturer"]);
  const [tabMode, setTabMode] = useState<TabMode>("search");

  const toggleFilter = (filter: string) => {
    setActiveFilters(prev =>
      prev.includes(filter) ? prev.filter(f => f !== filter) : [...prev, filter]
    );
  };

  const sortedResearchers = [...MOCK_RESEARCHERS].sort((a, b) => {
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
        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar */}
          <div className="w-[420px] shrink-0 overflow-hidden border-r border-border hidden lg:block">
            <SearchSidebar
              activeFilters={activeFilters}
              onToggleFilter={toggleFilter}
              onClearFilters={() => setActiveFilters([])}
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
        <GraphVisualization />
      )}
    </div>
  );
}
