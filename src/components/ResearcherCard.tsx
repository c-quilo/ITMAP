import { useState } from "react";
import { ChevronDown, ChevronUp, Bookmark, BookmarkCheck, Sparkles, FileText } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import type { Researcher, Publication } from "@/data/mockData";

interface ResearcherCardProps {
  researcher: Researcher;
  showSemanticExplanation?: boolean;
}

function RelevanceBadge({ score }: { score: number }) {
  const level = score >= 80 ? "high" : score >= 60 ? "medium" : "low";
  const labels = { high: "Strong Match", medium: "Moderate", low: "Weak" };
  return (
    <span className={`relevance-badge relevance-${level}`}>
      <span className={`inline-block h-2 w-2 rounded-full ${
        level === "high" ? "bg-relevance-high" : level === "medium" ? "bg-relevance-medium" : "bg-relevance-low"
      }`} />
      {score}% — {labels[level]}
    </span>
  );
}

function PublicationItem({ pub }: { pub: Publication }) {
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-border/50 last:border-0">
      <FileText className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground leading-snug">{pub.title}</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {pub.journal} · {pub.year} · {pub.citations} citations
          {pub.relevanceScore && (
            <span className="ml-2 text-imperial-teal font-medium">{pub.relevanceScore}% relevant</span>
          )}
        </p>
      </div>
    </div>
  );
}

export default function ResearcherCard({ researcher, showSemanticExplanation = true }: ResearcherCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [bookmarked, setBookmarked] = useState(researcher.bookmarked ?? false);
  const [pubView, setPubView] = useState<"relevant" | "all">("relevant");
  const [pubPage, setPubPage] = useState(1);

  const pubs = pubView === "relevant"
    ? researcher.publications.slice(0, 10)
    : researcher.publications;
  const visiblePubs = pubs.slice(0, pubPage * 10);
  const hasMore = visiblePubs.length < pubs.length;

  return (
    <div className="result-card animate-fade-in">
      <div className="flex items-start justify-between gap-4">
        {/* Avatar + Info */}
        <div className="flex items-start gap-4 min-w-0">
          <div className="shrink-0 h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
            <span className="text-sm font-semibold text-primary">{researcher.imageInitials}</span>
          </div>
          <div className="min-w-0">
            <h3 className="font-brand text-lg font-semibold text-foreground leading-tight">{researcher.name}</h3>
            <p className="text-sm text-muted-foreground">{researcher.title}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{researcher.department} · {researcher.faculty}</p>
          </div>
        </div>

        {/* Score + Actions */}
        <div className="flex items-center gap-2 shrink-0">
          <RelevanceBadge score={researcher.relevanceScore} />
          <button
            onClick={() => setBookmarked(!bookmarked)}
            className="p-1.5 rounded-md hover:bg-secondary transition-colors"
          >
            {bookmarked ? (
              <BookmarkCheck className="h-4 w-4 text-imperial-gold" />
            ) : (
              <Bookmark className="h-4 w-4 text-muted-foreground" />
            )}
          </button>
        </div>
      </div>

      {/* Summary */}
      <p className="text-sm text-foreground/80 mt-3 leading-relaxed">{researcher.summary}</p>

      {/* Keywords */}
      <div className="flex flex-wrap gap-1.5 mt-3">
        {researcher.keywords.map(k => (
          <span
            key={k}
            className={`inline-flex px-2 py-0.5 rounded text-[11px] font-medium ${
              researcher.matchedKeywords.includes(k)
                ? "bg-accent text-accent-foreground ring-1 ring-primary/20"
                : "bg-secondary text-muted-foreground"
            }`}
          >
            {k}
          </span>
        ))}
      </div>

      {/* Semantic Explanation */}
      {showSemanticExplanation && researcher.semanticExplanation && (
        <div className="mt-3 flex items-start gap-2 px-3 py-2.5 rounded-lg bg-imperial-light/50 border border-primary/10">
          <Sparkles className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />
          <div>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-primary">Why matched</span>
            <p className="text-xs text-foreground/70 mt-0.5 leading-relaxed">{researcher.semanticExplanation}</p>
          </div>
        </div>
      )}

      {/* Expand Publications */}
      <button
        onClick={() => { setExpanded(!expanded); setPubPage(1); }}
        className="mt-3 flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
      >
        {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        {expanded ? "Hide" : "Show"} Publications ({researcher.publications.length})
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="mt-3 pt-3 border-t border-border">
              <div className="flex items-center gap-2 mb-2">
                <button
                  onClick={() => { setPubView("relevant"); setPubPage(1); }}
                  className={`text-[11px] font-medium px-2.5 py-1 rounded-md transition-colors ${
                    pubView === "relevant" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary"
                  }`}
                >
                  10 Most Relevant
                </button>
                <button
                  onClick={() => { setPubView("all"); setPubPage(1); }}
                  className={`text-[11px] font-medium px-2.5 py-1 rounded-md transition-colors ${
                    pubView === "all" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary"
                  }`}
                >
                  All Papers
                </button>
              </div>
              <div>
                {visiblePubs.map((pub, i) => (
                  <PublicationItem key={i} pub={pub} />
                ))}
              </div>
              {hasMore && (
                <button
                  onClick={() => setPubPage(p => p + 1)}
                  className="mt-2 w-full text-center text-xs font-medium text-primary hover:text-primary/80 py-2 rounded-md hover:bg-secondary transition-colors"
                >
                  Load next 10 papers
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
