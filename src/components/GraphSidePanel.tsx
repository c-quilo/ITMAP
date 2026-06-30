import { motion } from "framer-motion";
import { X, Sparkles, FileText, Users, MapPin, Network } from "lucide-react";
import type { GraphNode } from "@/data/graphData";
import type { Researcher } from "@/data/mockData";

interface GraphSidePanelProps {
  node: GraphNode;
  researcher?: Researcher;
  connections: Array<{
    node: GraphNode;
    labels: string[];
    types: string[];
    isCrossDepartment: boolean;
    isCrossFaculty: boolean;
  }>;
  onClose: () => void;
}

export default function GraphSidePanel({ node, researcher, connections, onClose }: GraphSidePanelProps) {
  return (
    <motion.div
      initial={{ x: 400, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 400, opacity: 0 }}
      transition={{ type: "spring", damping: 30, stiffness: 300 }}
      className="absolute right-0 top-0 bottom-0 w-[380px] bg-card border-l border-border shadow-xl overflow-y-auto z-30"
    >
      <div className="p-5">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="font-brand text-lg font-semibold text-foreground">{node.label}</h2>
            <p className="text-sm text-muted-foreground">{node.shortTitle}</p>
            <div className="flex items-center gap-1.5 mt-1">
              <MapPin className="h-3 w-3 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">{node.department}</span>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-secondary transition-colors">
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        {/* Relevance + Role */}
        <div className="flex items-center gap-3 mb-4">
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
            node.relevanceScore >= 80 ? "bg-green-50 text-green-700 border border-green-200" :
            node.relevanceScore >= 60 ? "bg-amber-50 text-amber-700 border border-amber-200" :
            "bg-red-50 text-red-700 border border-red-200"
          }`}>
            <span className={`inline-block h-2 w-2 rounded-full ${
              node.relevanceScore >= 80 ? "bg-relevance-high" : node.relevanceScore >= 60 ? "bg-relevance-medium" : "bg-relevance-low"
            }`} />
            {node.relevanceScore}% Match
          </span>
          {node.networkRole && (
            <span className="text-[11px] font-medium text-primary bg-accent px-2 py-1 rounded-full">
              {node.networkRole}
            </span>
          )}
        </div>

        {/* Interdisciplinarity */}
        <div className="mb-4 rounded-lg border border-border bg-secondary/40 px-3 py-2.5">
          <div className="mb-1.5 flex items-center justify-between gap-3">
            <div className="flex items-center gap-1.5">
              <Network className="h-3.5 w-3.5 text-primary" />
              <p className="section-label">Interdisciplinarity</p>
            </div>
            <span className="font-brand text-sm font-semibold text-foreground">
              {node.interdisciplinarityScore ?? 0}%
            </span>
          </div>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Based on relevant co-authored papers, with extra weight for links across departments and faculties.
          </p>
          {node.interdisciplinaryReasons && node.interdisciplinaryReasons.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {node.interdisciplinaryReasons.map(reason => (
                <span key={reason} className="rounded bg-card px-1.5 py-0.5 text-[10px] text-muted-foreground">
                  {reason}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Summary */}
        {researcher && (
          <div className="mb-4">
            <p className="text-sm text-foreground/80 leading-relaxed">{researcher.summary}</p>
          </div>
        )}

        {/* Semantic explanation */}
        {researcher?.semanticExplanation && (
          <div className="mb-4 flex items-start gap-2 px-3 py-2.5 rounded-lg bg-accent/50 border border-primary/10">
            <Sparkles className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />
            <div>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-primary">Why matched</span>
              <p className="text-xs text-foreground/70 mt-0.5 leading-relaxed">{researcher.semanticExplanation}</p>
            </div>
          </div>
        )}

        {/* Keywords */}
        {researcher && (
          <div className="mb-4">
            <p className="section-label mb-2">Keywords</p>
            <div className="flex flex-wrap gap-1.5">
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
          </div>
        )}

        {/* Connected Researchers */}
        {connections.length > 0 && (
          <div className="mb-4">
            <div className="flex items-center gap-1.5 mb-2">
              <Users className="h-3.5 w-3.5 text-muted-foreground" />
              <p className="section-label">Connection Evidence</p>
            </div>
            <div className="space-y-2">
              {connections.map(connection => (
                <div key={connection.node.id} className="rounded-lg px-3 py-2 hover:bg-secondary transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <span className="text-[10px] font-semibold text-primary">
                        {connection.node.label.split(" ").map(w => w[0]).filter(Boolean).slice(-2).join("")}
                      </span>
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-foreground truncate">{connection.node.label}</p>
                      <p className="text-[10px] text-muted-foreground truncate">{connection.node.shortTitle}</p>
                    </div>
                    <span className={`ml-auto text-[10px] font-bold shrink-0 ${
                      connection.node.relevanceScore >= 80 ? "text-relevance-high" : connection.node.relevanceScore >= 60 ? "text-relevance-medium" : "text-relevance-low"
                    }`}>
                      {connection.node.relevanceScore}%
                    </span>
                  </div>
                  {connection.labels.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {connection.labels.slice(0, 2).map(label => (
                        <p key={label} className="text-[10px] leading-snug text-muted-foreground">
                          {connection.types.includes("coauthor") ? "Co-authored paper" : "Link"}: {label}
                        </p>
                      ))}
                    </div>
                  )}
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {connection.types.includes("coauthor") && (
                      <span className="rounded bg-card px-1.5 py-0.5 text-[10px] text-muted-foreground">co-authorship</span>
                    )}
                    {connection.types.includes("thematic") && (
                      <span className="rounded bg-card px-1.5 py-0.5 text-[10px] text-muted-foreground">shared theme</span>
                    )}
                    {connection.isCrossDepartment && (
                      <span className="rounded bg-card px-1.5 py-0.5 text-[10px] text-muted-foreground">cross-department</span>
                    )}
                    {connection.isCrossFaculty && (
                      <span className="rounded bg-card px-1.5 py-0.5 text-[10px] text-muted-foreground">cross-faculty</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Key Publications */}
        {researcher && researcher.publications.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <FileText className="h-3.5 w-3.5 text-muted-foreground" />
              <p className="section-label">Key Publications</p>
            </div>
            <div className="space-y-0.5">
              {researcher.publications.slice(0, 5).map((pub, i) => (
                <div key={i} className="py-2 border-b border-border/50 last:border-0">
                  <p className="text-xs font-medium text-foreground leading-snug">{pub.title}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {pub.journal} · {pub.year} · {pub.citations} cit.
                    {pub.relevanceScore && (
                      <span className="ml-1 text-primary font-medium">{pub.relevanceScore}%</span>
                    )}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Cluster info */}
        <div className="mt-4 pt-4 border-t border-border">
          <p className="section-label mb-1">Cluster</p>
          <p className="text-xs text-foreground font-medium">{node.cluster}</p>
        </div>
      </div>
    </motion.div>
  );
}
