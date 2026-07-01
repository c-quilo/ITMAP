import { useEffect, useMemo, useState } from "react";
import { ArrowUpDown, X, Search as SearchIcon, Share2, Loader2, Sparkles, Database, Brain, BookmarkCheck, Download, List, Target, CheckCircle2 } from "lucide-react";
import SearchSidebar, { type SavedSearchSummary, type SearchOptions } from "@/components/SearchSidebar";
import ResearcherCard from "@/components/ResearcherCard";
import GraphVisualization from "@/components/GraphVisualization";
import { KEYWORD_OPTIONS, type Researcher } from "@/data/mockData";
import { matchSchoolMissions, searchResearchers, summarizeResearchPool, type ResearchPoolSummary } from "@/lib/researcherSearch";
import imperialLogo from "@/assets/imperial-logo.png";
import scsSwoosh from "@/assets/scs-swoosh.png";

type SortBy = "relevance" | "name" | "seniority";
type TabMode = "search" | "graph" | "saved";
type SearchMode = "semantic" | "keyword";
type SaveFilePicker = (options?: {
  suggestedName?: string;
  types?: Array<{
    description: string;
    accept: Record<string, string[]>;
  }>;
}) => Promise<{
  createWritable: () => Promise<{
    write: (data: Blob) => Promise<void>;
    close: () => Promise<void>;
  }>;
}>;

type SavedSearch = SavedSearchSummary & {
  results: Researcher[];
};

const SAVED_SEARCHES_KEY = "itmap.savedSearches.v1";
const SAVED_RESEARCHERS_KEY = "itmap.savedResearchers.v1";
const SCHOOL_MISSION_CACHE_KEY = "itmap.schoolMissionMatches.v1";
const POOL_SUMMARY_CACHE_KEY = "itmap.researchPoolSummaries.v1";
const MATCH_FILTERS = new Set(["Strong Match", "Moderate", "Weak"]);
const SCHOOL_MISSION_THEME_PREFIX = "Theme: ";
const SCHOOL_MISSION_PREFIX = "Mission: ";
const KEYWORD_STOP_WORDS = new Set([
  "about", "after", "also", "analysis", "based", "being", "between", "college", "data", "from",
  "department", "faculty", "imperial", "including", "into", "london", "metadata", "model", "models",
  "profile", "research", "researcher", "science", "sciences", "study", "that", "their", "these",
  "this", "through", "university", "using", "with", "work", "works",
]);

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

function matchLabel(score: number) {
  if (score >= 80) return "Strong Match";
  if (score >= 60) return "Moderate";
  return "Weak";
}

function isPersistentFilter(filter: string) {
  return GRADE_FILTERS.has(filter) || FACULTY_FILTERS.has(filter) || MATCH_FILTERS.has(filter);
}

function csvCell(value: unknown) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return `"${text.replace(/"/g, '""')}"`;
}

function keywordCandidates(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .map(term => term.trim())
    .filter(term => term.length > 3 && !KEYWORD_STOP_WORDS.has(term));
}

function buildResultKeywords(researchers: Researcher[]) {
  const counts = new Map<string, number>();
  const add = (term: string, weight = 1) => {
    const cleaned = term.toLowerCase().replace(/\s+/g, " ").trim();
    if (!cleaned || cleaned.length < 4 || KEYWORD_STOP_WORDS.has(cleaned)) return;
    counts.set(cleaned, (counts.get(cleaned) || 0) + weight);
  };

  for (const researcher of researchers) {
    researcher.keywords.forEach(keyword => add(keyword, 5));
    researcher.matchedKeywords.forEach(keyword => add(keyword, 6));
    [
      researcher.title,
      researcher.department,
      researcher.faculty,
      researcher.summary,
      researcher.semanticExplanation || "",
      researcher.publications.map(publication => publication.title).join(" "),
    ].forEach(text => keywordCandidates(text).forEach(term => add(term)));
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([term]) => term)
    .slice(0, 36);
}

function missionCacheKey(query: string, researchers: Researcher[]) {
  return [
    query.trim().toLowerCase(),
    ...researchers.slice(0, 20).map(researcher => researcher.id),
  ].join("|");
}

function poolSummaryCacheKey(query: string, researchers: Researcher[]) {
  return [
    "summary",
    query.trim().toLowerCase(),
    ...researchers.slice(0, 20).map(researcher => researcher.id),
  ].join("|");
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

function ResearchPoolSummaryPanel({ summary }: { summary: ResearchPoolSummary }) {
  return (
    <div className="xl:col-span-2 rounded-lg border border-primary/15 bg-card px-4 py-4">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
          <Sparkles className="h-4 w-4 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">{summary.headline}</p>
          {summary.summary && (
            <p className="mt-1 text-sm leading-relaxed text-foreground/75">{summary.summary}</p>
          )}
          {summary.themes.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {summary.themes.map(theme => (
                <span key={theme} className="rounded-md bg-secondary px-2 py-1 text-[11px] font-medium text-muted-foreground">
                  {theme}
                </span>
              ))}
            </div>
          )}
          {summary.notableResearchers.length > 0 && (
            <div className="mt-3 grid gap-2 md:grid-cols-2">
              {summary.notableResearchers.map(item => (
                <div key={`${item.name}-${item.reason}`} className="rounded-md border border-border bg-background px-3 py-2">
                  <p className="text-xs font-semibold text-foreground">{item.name}</p>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">{item.reason}</p>
                </div>
              ))}
            </div>
          )}
          {summary.gaps.length > 0 && (
            <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
              Caveats: {summary.gaps.join("; ")}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Index() {
  const [sortBy, setSortBy] = useState<SortBy>("relevance");
  const [activeFilters, setActiveFilters] = useState<string[]>([]);
  const [tabMode, setTabMode] = useState<TabMode>("search");
  const [searchResults, setSearchResults] = useState<Researcher[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [hasSearched, setHasSearched] = useState(false);
  const [currentMission, setCurrentMission] = useState("");
  const [searchSeconds, setSearchSeconds] = useState(0);
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([]);
  const [savedResearchers, setSavedResearchers] = useState<Researcher[]>([]);
  const [isCheckingMissions, setIsCheckingMissions] = useState(false);
  const [schoolMissionError, setSchoolMissionError] = useState("");
  const [missionCheckDone, setMissionCheckDone] = useState(false);
  const [poolSummary, setPoolSummary] = useState<ResearchPoolSummary | null>(null);
  const [isGeneratingPoolSummary, setIsGeneratingPoolSummary] = useState(false);
  const [poolSummaryError, setPoolSummaryError] = useState("");
  const [poolSummaryDone, setPoolSummaryDone] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(SAVED_SEARCHES_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      if (Array.isArray(parsed)) {
        setSavedSearches(parsed.filter(search => Array.isArray(search.results)).slice(0, 10));
      }
    } catch {
      setSavedSearches([]);
    }

    try {
      const rawResearchers = window.localStorage.getItem(SAVED_RESEARCHERS_KEY);
      const parsedResearchers = rawResearchers ? JSON.parse(rawResearchers) : [];
      if (Array.isArray(parsedResearchers)) {
        setSavedResearchers(parsedResearchers);
      }
    } catch {
      setSavedResearchers([]);
    }
  }, []);

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

  const availableKeywords = useMemo(() => {
    if (!hasSearched) return [];
    const resultKeywords = buildResultKeywords(searchResults);
    return resultKeywords.length > 0 ? resultKeywords : KEYWORD_OPTIONS.slice(0, 12);
  }, [hasSearched, searchResults]);

  const availableSchoolMissionThemes = useMemo(() => {
    if (!hasSearched) return [];
    return [...new Set(searchResults
      .map(researcher => researcher.schoolMissionMatch?.school)
      .filter((school): school is string => Boolean(school))
      .map(school => `${SCHOOL_MISSION_THEME_PREFIX}${school}`))]
      .sort((a, b) => a.localeCompare(b));
  }, [hasSearched, searchResults]);

  const availableSchoolMissions = useMemo(() => {
    if (!hasSearched) return [];
    return [...new Set(searchResults
      .map(researcher => researcher.schoolMissionMatch)
      .filter((match): match is NonNullable<Researcher["schoolMissionMatch"]> => Boolean(match))
      .map(match => `${SCHOOL_MISSION_PREFIX}${match.school} · ${match.mission}`))]
      .sort((a, b) => a.localeCompare(b));
  }, [hasSearched, searchResults]);

  const schoolMissionFilters = useMemo(
    () => new Set([...availableSchoolMissionThemes, ...availableSchoolMissions]),
    [availableSchoolMissionThemes, availableSchoolMissions],
  );

  const toggleFilter = (filter: string) => {
    setActiveFilters(prev =>
      prev.includes(filter) ? prev.filter(f => f !== filter) : [...prev, filter]
    );
  };

  const persistSavedSearches = (nextSearches: SavedSearch[]) => {
    setSavedSearches(nextSearches);
    try {
      window.localStorage.setItem(SAVED_SEARCHES_KEY, JSON.stringify(nextSearches));
    } catch {
      // localStorage can be unavailable in private or restricted browser contexts.
    }
  };

  const persistSavedResearchers = (nextResearchers: Researcher[]) => {
    setSavedResearchers(nextResearchers);
    try {
      window.localStorage.setItem(SAVED_RESEARCHERS_KEY, JSON.stringify(nextResearchers));
    } catch {
      // localStorage can be unavailable in private or restricted browser contexts.
    }
  };

  const savedResearcherIds = useMemo(
    () => new Set(savedResearchers.map(researcher => researcher.id)),
    [savedResearchers],
  );

  const toggleSavedResearcher = (researcher: Researcher) => {
    const nextResearchers = savedResearcherIds.has(researcher.id)
      ? savedResearchers.filter(item => item.id !== researcher.id)
      : [{
        ...researcher,
        savedFromMission: currentMission,
        savedAt: new Date().toISOString(),
      }, ...savedResearchers].slice(0, 100);
    persistSavedResearchers(nextResearchers);
  };

  const savedResearchersCsv = useMemo(() => {
    const headers = [
      "name",
      "title",
      "department",
      "faculty",
      "match",
      "saved_from_search",
      "saved_at",
      "profile_url",
      "email",
      "summary",
      "publications",
      "external_evidence",
      "school_mission_school",
      "school_mission",
      "school_mission_reason",
    ];
    const rows = savedResearchers.map(researcher => [
      researcher.name,
      researcher.title,
      researcher.department,
      researcher.faculty,
      matchLabel(researcher.relevanceScore),
      researcher.savedFromMission || "",
      researcher.savedAt || "",
      researcher.profileUrl || "",
      researcher.email || "",
      researcher.semanticExplanation || researcher.summary,
      researcher.publications.map(pub => pub.title).join("; "),
      (researcher.externalEvidence || []).map(item => `${item.evidenceType}: ${item.title}${item.url ? ` (${item.url})` : ""}`).join("; "),
      researcher.schoolMissionMatch?.school || "",
      researcher.schoolMissionMatch?.mission || "",
      researcher.schoolMissionMatch?.reason || "",
    ]);
    return [headers, ...rows].map(row => row.map(csvCell).join(",")).join("\n");
  }, [savedResearchers]);

  const savedResearchersCsvHref = useMemo(
    () => `data:text/csv;charset=utf-8,%EF%BB%BF${encodeURIComponent(savedResearchersCsv)}`,
    [savedResearchersCsv],
  );

  const exportSavedResearchersCsv = async () => {
    const fileName = "itmap-saved-researchers.csv";
    const csvBlob = new Blob([`\uFEFF${savedResearchersCsv}`], { type: "text/csv;charset=utf-8" });
    const saveFilePicker = (window as Window & { showSaveFilePicker?: SaveFilePicker }).showSaveFilePicker;

    if (saveFilePicker) {
      try {
        const handle = await saveFilePicker({
          suggestedName: fileName,
          types: [
            {
              description: "CSV file",
              accept: { "text/csv": [".csv"] },
            },
          ],
        });
        const writable = await handle.createWritable();
        await writable.write(csvBlob);
        await writable.close();
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
      }
    }

    const link = document.createElement("a");
    link.href = savedResearchersCsvHref;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const saveSearch = (query: string, mode: SearchMode, results: Researcher[]) => {
    const trimmedQuery = query.trim();
    if (!trimmedQuery || results.length === 0) return;

    const saved: SavedSearch = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      query: trimmedQuery,
      mode,
      createdAt: new Date().toISOString(),
      resultCount: results.length,
      results,
    };
    const nextSearches = [
      saved,
      ...savedSearches.filter(search => !(search.query === trimmedQuery && search.mode === mode)),
    ].slice(0, 10);
    persistSavedSearches(nextSearches);
  };

  const loadSavedSearch = (id: string) => {
    const saved = savedSearches.find(search => search.id === id);
    if (!saved) return;
    const nextDepartments = new Set(saved.results.map(researcher => researcher.department).filter(Boolean));
    const nextSchoolMissionFilters = new Set(saved.results.flatMap(researcher => {
      const match = researcher.schoolMissionMatch;
      return match
        ? [
          `${SCHOOL_MISSION_THEME_PREFIX}${match.school}`,
          `${SCHOOL_MISSION_PREFIX}${match.school} · ${match.mission}`,
        ]
        : [];
    }));
    setActiveFilters(prev => prev.filter(filter =>
      isPersistentFilter(filter)
      || (!departmentFilters.has(filter) && nextDepartments.has(filter))
      || (!schoolMissionFilters.has(filter) && nextSchoolMissionFilters.has(filter))
    ));
    setSearchResults(saved.results);
    setCurrentMission(saved.query);
    setHasSearched(true);
    setMissionCheckDone(saved.results.some(researcher => researcher.schoolMissionMatch));
    setSchoolMissionError("");
    setPoolSummary(null);
    setPoolSummaryDone(false);
    setPoolSummaryError("");
    setSearchError("");
    setTabMode("search");
  };

  const handleSearch = async (query: string, mode: SearchMode, options: SearchOptions) => {
    const trimmedQuery = query.trim();
    if (!trimmedQuery) {
      setSearchError("Type a mission or keyword before searching.");
      setHasSearched(false);
      setSearchResults([]);
      return;
    }
    setIsSearching(true);
    setSearchError("");
    setSchoolMissionError("");
    setMissionCheckDone(false);
    setPoolSummary(null);
    setPoolSummaryError("");
    setPoolSummaryDone(false);
    try {
      const results = await searchResearchers({
        query: trimmedQuery,
        mode,
        filters: [],
        enableRerank: options.enableRerank,
        includeExternalEvidence: options.includeExternalEvidence,
      });
      const nextDepartments = new Set(results.map(researcher => researcher.department).filter(Boolean));
      setActiveFilters(prev => prev.filter(filter =>
        isPersistentFilter(filter) || (!departmentFilters.has(filter) && nextDepartments.has(filter))
      ));
      setSearchResults(results);
      setCurrentMission(trimmedQuery);
      setHasSearched(true);
      saveSearch(trimmedQuery, mode, results);
    } catch (error) {
      setSearchError(error instanceof Error ? error.message : "Search failed");
      setHasSearched(true);
    } finally {
      setIsSearching(false);
    }
  };

  const applySchoolMissionMatches = (matches: Awaited<ReturnType<typeof matchSchoolMissions>>) => {
    const byId = new Map(matches.map(match => [match.researcherId, match]));
    setSearchResults(prev => prev.map(researcher => {
      const match = byId.get(researcher.id);
      if (!match) return researcher;
      return {
        ...researcher,
        schoolMissionMatch: {
          school: match.school,
          mission: match.mission,
          confidence: match.confidence,
          reason: match.reason,
        },
      };
    }));
  };

  const checkSchoolMissions = async () => {
    if (!currentMission || sortedResearchers.length === 0) return;
    const topResearchers = sortedResearchers.slice(0, 20);
    const cacheKey = missionCacheKey(currentMission, topResearchers);
    setIsCheckingMissions(true);
    setSchoolMissionError("");
    try {
      const rawCache = window.localStorage.getItem(SCHOOL_MISSION_CACHE_KEY);
      const cache = rawCache ? JSON.parse(rawCache) : {};
      const cachedMatches = cache?.[cacheKey];
      if (Array.isArray(cachedMatches)) {
        applySchoolMissionMatches(cachedMatches);
        setMissionCheckDone(true);
        return;
      }

      const matches = await matchSchoolMissions(currentMission, topResearchers);
      applySchoolMissionMatches(matches);
      setMissionCheckDone(true);
      try {
        window.localStorage.setItem(SCHOOL_MISSION_CACHE_KEY, JSON.stringify({
          ...cache,
          [cacheKey]: matches,
        }));
      } catch {
        // The mission check still works if local cache storage is unavailable.
      }
    } catch (error) {
      setSchoolMissionError(error instanceof Error ? error.message : "School Missions check failed");
    } finally {
      setIsCheckingMissions(false);
    }
  };

  const generatePoolSummary = async () => {
    if (!currentMission || sortedResearchers.length === 0) return;
    const topResearchers = sortedResearchers.slice(0, 20);
    const cacheKey = poolSummaryCacheKey(currentMission, topResearchers);
    setIsGeneratingPoolSummary(true);
    setPoolSummaryError("");
    try {
      const rawCache = window.localStorage.getItem(POOL_SUMMARY_CACHE_KEY);
      const cache = rawCache ? JSON.parse(rawCache) : {};
      const cachedSummary = cache?.[cacheKey];
      if (cachedSummary && typeof cachedSummary === "object") {
        setPoolSummary(cachedSummary as ResearchPoolSummary);
        setPoolSummaryDone(true);
        return;
      }

      const summary = await summarizeResearchPool(currentMission, topResearchers);
      setPoolSummary(summary);
      setPoolSummaryDone(true);
      try {
        window.localStorage.setItem(POOL_SUMMARY_CACHE_KEY, JSON.stringify({
          ...cache,
          [cacheKey]: summary,
        }));
      } catch {
        // The summary still works if local cache storage is unavailable.
      }
    } catch (error) {
      setPoolSummaryError(error instanceof Error ? error.message : "Summary generation failed");
    } finally {
      setIsGeneratingPoolSummary(false);
    }
  };

  const filteredResearchers = useMemo(() => {
    const selectedGrades = activeFilters.filter(filter => GRADE_FILTERS.has(filter));
    const selectedFaculties = activeFilters.filter(filter => FACULTY_FILTERS.has(filter));
    const selectedDepartments = activeFilters.filter(filter => departmentFilters.has(filter));
    const selectedMatches = activeFilters.filter(filter => MATCH_FILTERS.has(filter));
    const selectedSchoolMissionThemes = activeFilters
      .filter(filter => filter.startsWith(SCHOOL_MISSION_THEME_PREFIX))
      .map(filter => filter.slice(SCHOOL_MISSION_THEME_PREFIX.length));
    const selectedSchoolMissions = activeFilters
      .filter(filter => filter.startsWith(SCHOOL_MISSION_PREFIX))
      .map(filter => filter.slice(SCHOOL_MISSION_PREFIX.length));
    const selectedKeywords = activeFilters.filter(filter =>
      !GRADE_FILTERS.has(filter)
      && !FACULTY_FILTERS.has(filter)
      && !departmentFilters.has(filter)
      && !MATCH_FILTERS.has(filter)
      && !schoolMissionFilters.has(filter)
    );

    return searchResults.filter(researcher => {
      const facultyMatch = selectedFaculties.length === 0
        || selectedFaculties.some(filter => normaliseFaculty(researcher.faculty) === normaliseFaculty(filter));
      const departmentMatch = selectedDepartments.length === 0
        || selectedDepartments.includes(researcher.department);
      const gradeMatch = filterByAny([researcher.title], selectedGrades);
      const matchStrengthMatch = selectedMatches.length === 0 || selectedMatches.includes(matchLabel(researcher.relevanceScore));
      const schoolMissionThemeMatch = selectedSchoolMissionThemes.length === 0
        || (researcher.schoolMissionMatch && selectedSchoolMissionThemes.includes(researcher.schoolMissionMatch.school));
      const schoolMissionMatch = selectedSchoolMissions.length === 0
        || (researcher.schoolMissionMatch && selectedSchoolMissions.includes(`${researcher.schoolMissionMatch.school} · ${researcher.schoolMissionMatch.mission}`));
      const keywordMatch = filterByAny([
        researcher.summary,
        researcher.keywords.join(" "),
        researcher.matchedKeywords.join(" "),
        researcher.publications.map(pub => pub.title).join(" "),
      ], selectedKeywords);

      return facultyMatch
        && departmentMatch
        && gradeMatch
        && matchStrengthMatch
        && schoolMissionThemeMatch
        && schoolMissionMatch
        && keywordMatch;
    });
  }, [activeFilters, departmentFilters, schoolMissionFilters, searchResults]);

  const sortedResearchers = [...filteredResearchers].sort((a, b) => {
    if (sortBy === "relevance") return b.relevanceScore - a.relevanceScore;
    if (sortBy === "name") return a.name.localeCompare(b.name);
    return b.relevanceScore - a.relevanceScore;
  });

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
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
          <button
            onClick={() => setTabMode("saved")}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-md text-xs font-medium transition-all ${
              tabMode === "saved"
                ? "bg-card shadow-sm text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <BookmarkCheck className="h-3.5 w-3.5" />
            Saved
            {savedResearchers.length > 0 && (
              <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] text-primary-foreground">
                {savedResearchers.length}
              </span>
            )}
          </button>
        </div>

        <h1 className="font-brand text-xl tracking-[0.15em] font-semibold text-foreground relative z-10">
          ITMAP
        </h1>
      </header>

      {/* Body */}
      {tabMode === "search" ? (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
          {/* Sidebar */}
          <div className="max-h-[46vh] w-full shrink-0 overflow-hidden border-b border-border lg:max-h-none lg:w-[420px] lg:border-b-0 lg:border-r">
            <SearchSidebar
              activeFilters={activeFilters}
              onToggleFilter={toggleFilter}
              onClearFilters={() => setActiveFilters([])}
              onSearch={handleSearch}
              onLoadSavedSearch={loadSavedSearch}
              isSearching={isSearching}
              departmentOptions={availableDepartments}
              keywordOptions={availableKeywords}
              schoolMissionOptions={availableSchoolMissions}
              schoolMissionThemeOptions={availableSchoolMissionThemes}
              savedSearches={savedSearches}
            />
          </div>

          {/* Results */}
          <main className="flex-1 overflow-y-auto">
            {/* Results Header */}
            <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b border-border px-6 py-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <p className="text-sm font-medium text-foreground">
                    {hasSearched ? `${sortedResearchers.length} researchers found` : "Ready to search"}
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
                </div>
              </div>
            </div>

            {/* Results List */}
            <div className="grid grid-cols-1 gap-4 p-6 xl:grid-cols-2">
              {isSearching && (
                <div className="xl:col-span-2">
                  <SearchProgress seconds={searchSeconds} />
                </div>
              )}
              {!isSearching && !hasSearched && (
                <div className="flex min-h-[55vh] items-center justify-center xl:col-span-2">
                  <img
                    src={scsSwoosh}
                    alt=""
                    className="h-auto w-full max-w-3xl opacity-20"
                  />
                </div>
              )}
              {!isSearching && hasSearched && sortedResearchers.length > 0 && (
                <>
                  {poolSummary && <ResearchPoolSummaryPanel summary={poolSummary} />}
                  <div className="xl:col-span-2 rounded-lg border border-primary/15 bg-card px-4 py-3">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex items-start gap-2">
                        <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                        <div>
                          <p className="text-sm font-medium text-foreground">Summarise this researcher pool?</p>
                          <p className="text-xs leading-relaxed text-muted-foreground">
                            Generate a short overview of the main expertise clusters, notable researchers, and gaps in the current results.
                          </p>
                          {poolSummaryError && (
                            <p className="mt-1 text-xs text-destructive">{poolSummaryError}</p>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={generatePoolSummary}
                        disabled={isGeneratingPoolSummary}
                        className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
                        title="Runs an opt-in LLM pass over the current top results and caches the summary."
                      >
                        {isGeneratingPoolSummary ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : poolSummaryDone ? (
                          <CheckCircle2 className="h-3.5 w-3.5" />
                        ) : (
                          <Sparkles className="h-3.5 w-3.5" />
                        )}
                        {isGeneratingPoolSummary ? "Summarising..." : poolSummaryDone ? "Summary ready" : "Generate Summary"}
                      </button>
                    </div>
                  </div>
                </>
              )}
              {!isSearching && hasSearched && sortedResearchers.length > 0 && (
                <div className="xl:col-span-2 rounded-lg border border-primary/15 bg-card px-4 py-3">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-start gap-2">
                      <Target className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      <div>
                        <p className="text-sm font-medium text-foreground">Check against School Missions?</p>
                        <p className="text-xs leading-relaxed text-muted-foreground">
                          Compare the top researchers with Health and Technology, Human and Artificial Intelligence, Space/Security/Telecoms, and Sustainability missions.
                        </p>
                        {schoolMissionError && (
                          <p className="mt-1 text-xs text-destructive">{schoolMissionError}</p>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={checkSchoolMissions}
                      disabled={isCheckingMissions}
                      className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
                      title="Runs an opt-in LLM pass over the current top results and cached School Missions brief."
                    >
                      {isCheckingMissions ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : missionCheckDone ? (
                        <CheckCircle2 className="h-3.5 w-3.5" />
                      ) : (
                        <Target className="h-3.5 w-3.5" />
                      )}
                      {isCheckingMissions ? "Checking..." : missionCheckDone ? "Checked" : "Check Missions"}
                    </button>
                  </div>
                </div>
              )}
              {!isSearching && hasSearched && sortedResearchers.length === 0 && (
                <div className="xl:col-span-2 rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
                  No researchers matched this search. Try a broader mission or turn on ITMAP rerank.
                </div>
              )}
              {sortedResearchers.map(r => (
                <ResearcherCard
                  key={r.id}
                  researcher={r}
                  bookmarked={savedResearcherIds.has(r.id)}
                  onToggleBookmark={toggleSavedResearcher}
                />
              ))}
            </div>
          </main>
        </div>
      ) : tabMode === "graph" ? (
        <GraphVisualization researchers={sortedResearchers} missionLabel={currentMission} />
      ) : (
        <main className="min-h-0 flex-1 overflow-y-auto bg-background">
          <div className="sticky top-0 z-10 border-b border-border bg-background/95 px-6 py-3 backdrop-blur-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-foreground">{savedResearchers.length} saved researchers</p>
                <p className="text-xs text-muted-foreground">Each saved researcher keeps the search/mission that produced it.</p>
              </div>
              {savedResearchers.length > 0 ? (
                <button
                  onClick={exportSavedResearchersCsv}
                  className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  <Download className="h-3.5 w-3.5" />
                  Export CSV
                </button>
              ) : (
                <button
                  disabled
                  className="inline-flex cursor-not-allowed items-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground opacity-50"
                >
                  <Download className="h-3.5 w-3.5" />
                  Export CSV
                </button>
              )}
            </div>
          </div>
          {savedResearchers.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground">
              Saved researchers will appear here when you click the bookmark icon on a researcher card.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 p-6 xl:grid-cols-2">
              {savedResearchers.map(researcher => (
                <ResearcherCard
                  key={researcher.id}
                  researcher={researcher}
                  bookmarked
                  onToggleBookmark={toggleSavedResearcher}
                />
              ))}
            </div>
          )}
        </main>
      )}
    </div>
  );
}
