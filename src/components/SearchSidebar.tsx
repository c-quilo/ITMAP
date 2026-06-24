import { useState } from "react";
import { Search, SlidersHorizontal, Sparkles, Type, List, ChevronDown, ChevronUp, X } from "lucide-react";
import { GRADES, FACULTIES, DEPARTMENTS, KEYWORD_OPTIONS } from "@/data/mockData";

type SearchMode = "semantic" | "keyword" | "browse";

interface SearchSidebarProps {
  onSearch?: () => void;
  activeFilters: string[];
  onToggleFilter: (filter: string) => void;
  onClearFilters: () => void;
}

const SEMANTIC_PLACEHOLDER = `I need to find experts at Imperial College London working on sustainable textiles, circular materials, low-impact manufacturing, and supply-chain innovation for environmentally responsible fashion and related industrial applications.`;

export default function SearchSidebar({ activeFilters, onToggleFilter, onClearFilters }: SearchSidebarProps) {
  const [searchMode, setSearchMode] = useState<SearchMode>("semantic");
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    grade: true,
    keywords: true,
    faculty: false,
    department: false,
  });
  const [keywordSearch, setKeywordSearch] = useState("");
  const [showKeywordDropdown, setShowKeywordDropdown] = useState(false);

  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const filteredKeywords = KEYWORD_OPTIONS.filter(k =>
    k.toLowerCase().includes(keywordSearch.toLowerCase())
  );

  return (
    <aside className="w-full h-full overflow-y-auto border-r border-border bg-card">
      <div className="p-5 space-y-6">
        {/* Search Mode Tabs */}
        <div>
          <p className="section-label mb-2.5">Search Mode</p>
          <div className="flex gap-1.5 rounded-lg bg-secondary p-1">
            {[
              { mode: "semantic" as const, icon: Sparkles, label: "Semantic" },
              { mode: "keyword" as const, icon: Type, label: "Keyword" },
              { mode: "browse" as const, icon: List, label: "Browse" },
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

        {/* Semantic Search Box */}
        {searchMode === "semantic" && (
          <div>
            <p className="section-label mb-2">Natural Language Query</p>
            <textarea
              className="search-box-semantic"
              defaultValue={SEMANTIC_PLACEHOLDER}
              placeholder="Describe the expertise you're looking for..."
            />
            <p className="text-[11px] text-muted-foreground mt-1.5">
              AI-powered search finds researchers by meaning, not just keywords
            </p>
          </div>
        )}

        {/* Keyword Search Box */}
        {searchMode === "keyword" && (
          <div>
            <p className="section-label mb-2">Keyword Search</p>
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                className="w-full rounded-lg border border-border bg-card pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
                placeholder="Search by keyword..."
                defaultValue="sustainable textiles, circular materials"
              />
            </div>
          </div>
        )}

        {/* Search Button */}
        {(searchMode === "semantic" || searchMode === "keyword") && (
          <button className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground py-2.5 rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors">
            <Search className="h-4 w-4" />
            Search Researchers
          </button>
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

        {/* Grade Filter */}
        <FilterSection
          title="Grade / Role"
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
            {KEYWORD_OPTIONS.slice(0, 10).map(k => (
              <span
                key={k}
                className={`filter-chip ${activeFilters.includes(k) ? "filter-chip-active" : ""}`}
                onClick={() => onToggleFilter(k)}
              >
                {k}
              </span>
            ))}
          </div>
        </FilterSection>

        {/* Faculty Filter */}
        <FilterSection
          title="Faculty"
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
          expanded={expandedSections.department}
          onToggle={() => toggleSection("department")}
        >
          <div className="space-y-1">
            {DEPARTMENTS.map(d => (
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
            ))}
          </div>
        </FilterSection>
      </div>
    </aside>
  );
}

function FilterSection({
  title,
  expanded,
  onToggle,
  children,
}: {
  title: string;
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
        <span className="section-label group-hover:text-foreground transition-colors">{title}</span>
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
