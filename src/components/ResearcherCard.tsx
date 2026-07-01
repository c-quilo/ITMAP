import { useState } from "react";
import { ChevronDown, ChevronUp, Bookmark, BookmarkCheck, Sparkles, FileText, ExternalLink, Radio, Rocket, Newspaper, BadgePoundSterling, PlayCircle, Target } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import type { ExternalEvidence, Researcher, Publication } from "@/data/mockData";

interface ResearcherCardProps {
  researcher: Researcher;
  bookmarked?: boolean;
  onToggleBookmark?: (researcher: Researcher) => void;
}

function RelevanceBadge({ score }: { score: number }) {
  const level = score >= 80 ? "high" : score >= 60 ? "medium" : "low";
  const labels = { high: "Strong Match", medium: "Moderate", low: "Weak" };
  return (
    <span className={`relevance-badge relevance-${level}`}>
      <span className={`inline-block h-2 w-2 rounded-full ${
        level === "high" ? "bg-relevance-high" : level === "medium" ? "bg-relevance-medium" : "bg-relevance-low"
      }`} />
      {labels[level]}
    </span>
  );
}

function PublicationItem({ pub }: { pub: Publication }) {
  const title = pub.doiUrl ? (
    <a
      href={pub.doiUrl}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-start gap-1.5 text-primary hover:underline"
    >
      <span>{pub.title}</span>
      <ExternalLink className="mt-0.5 h-3 w-3 shrink-0" />
    </a>
  ) : (
    pub.title
  );

  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-border/50 last:border-0">
      <FileText className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground leading-snug">{title}</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {pub.journal} · {pub.year} · {pub.citations} citations
        </p>
      </div>
    </div>
  );
}

function evidenceConfig(type: string) {
  if (type === "video") return { label: "Video", Icon: PlayCircle };
  if (type === "startup") return { label: "Startup", Icon: Rocket };
  if (type === "grant") return { label: "Grant", Icon: BadgePoundSterling };
  if (type === "media") return { label: "Media", Icon: Newspaper };
  return { label: "Signal", Icon: Radio };
}

function ExternalEvidenceItem({ item }: { item: ExternalEvidence }) {
  const { label, Icon } = evidenceConfig(item.evidenceType);
  const title = item.url ? (
    <a
      href={item.url}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-start gap-1.5 text-primary hover:underline"
    >
      <span>{item.title}</span>
      <ExternalLink className="mt-0.5 h-3 w-3 shrink-0" />
    </a>
  ) : (
    item.title
  );

  return (
    <div className="rounded-md border border-border bg-card px-3 py-2">
      <div className="mb-1 flex items-center gap-2">
        <span className="inline-flex items-center gap-1 rounded bg-secondary px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
          <Icon className="h-3 w-3" />
          {label}
        </span>
        {item.source === "ukri" && (
          <span className="text-[10px] font-medium text-muted-foreground">UKRI</span>
        )}
      </div>
      <p className="text-xs font-medium leading-snug text-foreground">{title}</p>
      {item.snippet && (
        <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{item.snippet}</p>
      )}
    </div>
  );
}

function ExternalEvidenceSummary({ evidence }: { evidence?: ExternalEvidence[] }) {
  const items = (evidence || []).filter(item => item.title).slice(0, 6);
  if (items.length === 0) return null;

  const videos = items.filter(item => item.evidenceType === "video").length;
  const startups = items.filter(item => item.evidenceType === "startup").length;
  const grants = items.filter(item => item.evidenceType === "grant").length;
  const media = items.filter(item => item.evidenceType === "media").length;
  const parts = [
    videos > 0 ? `${videos} video${videos === 1 ? "" : "s"}` : "",
    startups > 0 ? `${startups} startup/spinout signal${startups === 1 ? "" : "s"}` : "",
    grants > 0 ? `${grants} grant signal${grants === 1 ? "" : "s"}` : "",
    media > 0 ? `${media} media signal${media === 1 ? "" : "s"}` : "",
  ].filter(Boolean);

  return (
    <div className="mt-3 rounded-lg border border-border bg-secondary/30 px-3 py-2.5">
      <div className="mb-2 flex items-start gap-2">
        <Radio className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
        <div>
          <span className="text-[10px] font-semibold uppercase tracking-wider text-primary">External signals</span>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
            {parts.length > 0
              ? `Found ${parts.join(", ")} that may support translational or public impact.`
              : "Found public web or UKRI evidence that may support translational or public impact."}
          </p>
        </div>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {items.map((item, index) => (
          <ExternalEvidenceItem key={`${item.title}-${index}`} item={item} />
        ))}
      </div>
    </div>
  );
}

export default function ResearcherCard({
  researcher,
  bookmarked = false,
  onToggleBookmark,
}: ResearcherCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [profileExpanded, setProfileExpanded] = useState(false);

  const visiblePubs = researcher.publications.slice(0, 10);

  return (
    <div className="result-card animate-fade-in h-fit">
      <div className="flex items-start justify-between gap-3">
        {/* Avatar + Info */}
        <div className="flex items-start gap-3 min-w-0">
          <div className="shrink-0 h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
            <span className="text-xs font-semibold text-primary">{researcher.imageInitials}</span>
          </div>
          <div className="min-w-0">
            <h3 className="font-brand text-base font-semibold text-foreground leading-tight">{researcher.name}</h3>
            <p className="text-xs text-muted-foreground">{researcher.title}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{researcher.department} · {researcher.faculty}</p>
            {researcher.savedFromMission && (
              <p className="mt-1 line-clamp-2 text-[11px] font-medium text-primary">
                Saved from: {researcher.savedFromMission}
              </p>
            )}
            {researcher.schoolMissionMatch && (
              <div
                className="mt-2 inline-flex max-w-full items-center gap-1.5 rounded-md bg-primary/10 px-2 py-1 text-[11px] font-medium text-primary"
                title={researcher.schoolMissionMatch.reason}
              >
                <Target className="h-3 w-3 shrink-0" />
                <span className="truncate">
                  Relevant to {researcher.schoolMissionMatch.school} · {researcher.schoolMissionMatch.mission}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Score + Actions */}
        <div className="flex items-center gap-2 shrink-0">
          <RelevanceBadge score={researcher.relevanceScore} />
          <button
            onClick={() => onToggleBookmark?.(researcher)}
            className="p-1.5 rounded-md hover:bg-secondary transition-colors"
            title={bookmarked ? "Remove from saved researchers" : "Save researcher"}
          >
            {bookmarked ? (
              <BookmarkCheck className="h-4 w-4 text-imperial-gold" />
            ) : (
              <Bookmark className="h-4 w-4 text-muted-foreground" />
            )}
          </button>
        </div>
      </div>

      <button
        onClick={() => setProfileExpanded(!profileExpanded)}
        className="mt-3 flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
      >
        {profileExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        {profileExpanded ? "Hide" : "Show"} Profile
      </button>

      <AnimatePresence>
        {profileExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <p className="text-sm text-foreground/80 mt-3 leading-relaxed">{researcher.summary}</p>
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
          </motion.div>
        )}
      </AnimatePresence>

      {/* Match Explanation */}
      {researcher.semanticExplanation && (
        <div className="mt-3 flex items-start gap-2 px-3 py-2.5 rounded-lg bg-imperial-light/50 border border-primary/10">
          <Sparkles className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />
          <div>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-primary">Why they matched</span>
            <p className="text-xs text-foreground/70 mt-0.5 leading-relaxed">{researcher.semanticExplanation}</p>
          </div>
        </div>
      )}

      <ExternalEvidenceSummary evidence={researcher.externalEvidence} />

      {/* Expand Publications */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="mt-3 flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
      >
        {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        {expanded ? "Hide" : "Show"} Relevant Publications ({Math.min(researcher.publications.length, 10)})
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
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Most Relevant Publications
              </p>
              <div>
                {visiblePubs.map((pub, i) => (
                  <PublicationItem key={i} pub={pub} />
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
