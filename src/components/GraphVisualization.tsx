import { useMemo, useState, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ZoomIn, ZoomOut, Maximize2, Info, Network, Users, GitBranch } from "lucide-react";
import {
  GRAPH_MODES,
  type GraphNode,
  type GraphEdge,
  type GraphCluster,
  type GraphMode,
} from "@/data/graphData";
import type { Researcher } from "@/data/mockData";
import GraphSidePanel from "./GraphSidePanel";

const NODE_SIZES: Record<string, number> = {
  mission: 34,
  pi: 16,
  lecturer: 13,
  postdoc: 11,
  phd: 9,
};

const NODE_COLORS: Record<string, string> = {
  mission: "hsl(268, 58%, 48%)",
  pi: "hsl(268, 50%, 50%)",
  lecturer: "hsl(196, 55%, 43%)",
  postdoc: "hsl(165, 45%, 38%)",
  phd: "hsl(38, 70%, 46%)",
};

const EDGE_COLORS: Record<string, string> = {
  mission: "hsl(268, 34%, 64%)",
  supervisor: "hsl(196, 45%, 48%)",
  coauthor: "hsl(165, 45%, 42%)",
  thematic: "hsl(38, 62%, 48%)",
  department: "hsl(260, 12%, 72%)",
};

const CLUSTER_HUES = [268, 196, 165, 38, 340, 218, 125, 18];

interface GraphVisualizationProps {
  researchers: Researcher[];
  missionLabel?: string;
}

function inferGraphRole(researcher: Researcher): GraphNode["role"] {
  const title = researcher.title.toLowerCase();
  if (title.includes("phd")) return "phd";
  if (title.includes("postdoc") || title.includes("fellow")) return "postdoc";
  if (title.includes("professor") || title.includes("chair")) return "pi";
  return "lecturer";
}

function initialsLabel(name: string) {
  return name.replace(/^prof\.?\s+/i, "").replace(/^dr\.?\s+/i, "");
}

function shortNameLabel(name: string) {
  const clean = initialsLabel(name);
  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length <= 2) return clean;
  return `${parts[0]} ${parts[parts.length - 1]}`;
}

function sharedKeywordWeight(a: Researcher, b: Researcher) {
  const aTerms = new Set([...a.keywords, ...a.matchedKeywords].map(term => term.toLowerCase()));
  const bTerms = new Set([...b.keywords, ...b.matchedKeywords].map(term => term.toLowerCase()));
  let shared = 0;
  for (const term of aTerms) {
    if (bTerms.has(term)) shared += 1;
  }
  return shared;
}

function publicationKey(title: string) {
  return title.toLowerCase().replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
}

function sharedRelevantPapers(a: Researcher, b: Researcher) {
  const aPapers = new Map(
    a.publications.map(pub => [pub.openalexWorkId || publicationKey(pub.title), pub]),
  );

  return b.publications
    .map(pub => {
      const key = pub.openalexWorkId || publicationKey(pub.title);
      const match = aPapers.get(key);
      return match ? pub : undefined;
    })
    .filter(Boolean);
}

function buildGraph(researchers: Researcher[], missionLabel = "Current Mission") {
  const visibleResearchers = researchers.slice(0, 24);
  const departments = [...new Set(visibleResearchers.map(researcher => researcher.department || "Imperial").filter(Boolean))];
  const clusterRadius = 210;
  const nodes: GraphNode[] = [{
    id: "mission",
    x: 0,
    y: 0,
    label: missionLabel,
    shortTitle: "Mission",
    department: "",
    role: "mission",
    relevanceScore: 100,
    cluster: "mission",
    networkRole: "Current Search",
  }];

  const clusters: GraphCluster[] = departments.map((department, index) => {
    const angle = (Math.PI * 2 * index) / Math.max(1, departments.length) - Math.PI / 2;
    const members = visibleResearchers.filter(researcher => researcher.department === department);
    return {
      id: department,
      label: department.replace(/^Department of /, "").replace(/^School of /, ""),
      cx: Math.cos(angle) * clusterRadius,
      cy: Math.sin(angle) * clusterRadius,
      rx: Math.max(78, Math.min(145, 45 + members.length * 14)),
      ry: Math.max(55, Math.min(110, 35 + members.length * 10)),
      color: `hsla(${CLUSTER_HUES[index % CLUSTER_HUES.length]}, 48%, 58%, 0.08)`,
      description: department,
    };
  });

  for (const [departmentIndex, department] of departments.entries()) {
    const cluster = clusters[departmentIndex];
    const members = visibleResearchers.filter(researcher => researcher.department === department);
    for (const [memberIndex, researcher] of members.entries()) {
      const angle = (Math.PI * 2 * memberIndex) / Math.max(1, members.length) - Math.PI / 2;
      const spreadX = members.length === 1 ? 0 : Math.cos(angle) * Math.max(28, cluster.rx * 0.48);
      const spreadY = members.length === 1 ? 0 : Math.sin(angle) * Math.max(24, cluster.ry * 0.48);
      nodes.push({
        id: researcher.id,
        x: cluster.cx + spreadX,
        y: cluster.cy + spreadY,
        label: researcher.name,
        shortTitle: researcher.title,
        department: researcher.department,
        faculty: researcher.faculty,
        role: inferGraphRole(researcher),
        relevanceScore: researcher.relevanceScore,
        cluster: department,
        isBridge: false,
        networkRole: researcher.relevanceScore >= 85 ? "High Match" : researcher.relevanceScore >= 70 ? "Relevant Match" : "Adjacent Match",
        keywords: researcher.matchedKeywords.length > 0 ? researcher.matchedKeywords : researcher.keywords,
      });
    }
  }

  const edges: GraphEdge[] = [];
  const coauthorCounts = new Map<string, number>();
  const crossDepartmentCounts = new Map<string, number>();
  const crossFacultyCounts = new Map<string, number>();

  for (const researcher of visibleResearchers) {
    edges.push({
      source: "mission",
      target: researcher.id,
      type: "mission",
      weight: Math.max(0.25, researcher.relevanceScore / 100),
      label: "Mission match",
    });
  }

  for (let i = 0; i < visibleResearchers.length; i += 1) {
    for (let j = i + 1; j < visibleResearchers.length; j += 1) {
      const a = visibleResearchers[i];
      const b = visibleResearchers[j];
      if (a.department === b.department) {
        edges.push({
          source: a.id,
          target: b.id,
          type: "department",
          weight: 0.25,
          label: a.department,
        });
      }

      const sharedPapers = sharedRelevantPapers(a, b);
      if (sharedPapers.length > 0) {
        const crossDepartment = a.department !== b.department;
        const crossFaculty = a.faculty !== b.faculty;
        edges.push({
          source: a.id,
          target: b.id,
          type: "coauthor",
          weight: Math.min(1, 0.45 + sharedPapers.length * 0.18 + (crossDepartment ? 0.12 : 0) + (crossFaculty ? 0.18 : 0)),
          label: sharedPapers.slice(0, 2).map(pub => pub?.title).join("; "),
        });

        for (const id of [a.id, b.id]) {
          coauthorCounts.set(id, (coauthorCounts.get(id) || 0) + sharedPapers.length);
          if (crossDepartment) crossDepartmentCounts.set(id, (crossDepartmentCounts.get(id) || 0) + 1);
          if (crossFaculty) crossFacultyCounts.set(id, (crossFacultyCounts.get(id) || 0) + 1);
        }
      }

      const shared = sharedKeywordWeight(a, b);
      if (shared > 0) {
        edges.push({
          source: a.id,
          target: b.id,
          type: "thematic",
          weight: Math.min(0.8, 0.25 + shared * 0.15),
          label: `${shared} shared theme${shared === 1 ? "" : "s"}`,
        });
      }
    }
  }

  const crossClusterCounts = new Map<string, number>();
  for (const edge of edges) {
    if (edge.type !== "thematic") continue;
    const source = nodes.find(node => node.id === edge.source);
    const target = nodes.find(node => node.id === edge.target);
    if (!source || !target || source.cluster === target.cluster) continue;
    crossClusterCounts.set(source.id, (crossClusterCounts.get(source.id) || 0) + 1);
    crossClusterCounts.set(target.id, (crossClusterCounts.get(target.id) || 0) + 1);
  }

  for (const node of nodes) {
    if (node.role !== "mission") {
      const coauthors = coauthorCounts.get(node.id) || 0;
      const crossDepartments = crossDepartmentCounts.get(node.id) || 0;
      const crossFaculties = crossFacultyCounts.get(node.id) || 0;
      const thematicCrossings = crossClusterCounts.get(node.id) || 0;
      node.interdisciplinarityScore = Math.min(
        100,
        Math.round(coauthors * 10 + crossDepartments * 18 + crossFaculties * 30 + thematicCrossings * 8),
      );
      node.interdisciplinaryReasons = [
        coauthors > 0 ? `${coauthors} relevant co-authored paper${coauthors === 1 ? "" : "s"}` : "",
        crossDepartments > 0 ? `${crossDepartments} cross-department link${crossDepartments === 1 ? "" : "s"}` : "",
        crossFaculties > 0 ? `${crossFaculties} cross-faculty link${crossFaculties === 1 ? "" : "s"}` : "",
        thematicCrossings > 0 ? `${thematicCrossings} cross-cluster theme${thematicCrossings === 1 ? "" : "s"}` : "",
      ].filter(Boolean);

      if ((crossDepartments + crossFaculties + thematicCrossings) >= 2) {
        node.isBridge = true;
        node.networkRole = "Bridge Match";
      }
    }
  }

  return { nodes, edges, clusters };
}

function edgePath(src: GraphNode, tgt: GraphNode, index: number) {
  const dx = tgt.x - src.x;
  const dy = tgt.y - src.y;
  const distance = Math.sqrt(dx * dx + dy * dy) || 1;
  const curve = Math.min(34, Math.max(10, distance * 0.08));
  const direction = index % 2 === 0 ? 1 : -1;
  const midX = (src.x + tgt.x) / 2 + (-dy / distance) * curve * direction;
  const midY = (src.y + tgt.y) / 2 + (dx / distance) * curve * direction;
  return `M ${src.x} ${src.y} Q ${midX} ${midY} ${tgt.x} ${tgt.y}`;
}

function getVisibleEdges(mode: GraphMode, edges: GraphEdge[], nodes: GraphNode[]): GraphEdge[] {
  switch (mode) {
    case "relevance":
      return edges.filter(e => e.type === "mission");
    case "coauthorship":
      return edges.filter(e => e.type === "coauthor" || e.type === "mission");
    case "supervision":
      return edges.filter(e => e.type === "supervisor" || e.type === "mission");
    case "thematic":
      return edges.filter(e => e.type === "thematic" || e.type === "mission");
    case "bridges":
      return edges.filter(e => {
        if (e.type === "mission") return true;
        const src = nodes.find(n => n.id === e.source);
        const tgt = nodes.find(n => n.id === e.target);
        return src && tgt && src.cluster !== tgt.cluster;
      });
    default:
      return edges;
  }
}

function getHighlightedNodes(mode: GraphMode, nodes: GraphNode[]): Set<string> {
  if (mode !== "bridges") return new Set();
  return new Set(nodes.filter(n => n.isBridge).map(n => n.id));
}

export default function GraphVisualization({ researchers, missionLabel }: GraphVisualizationProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<GraphMode>("relevance");
  const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef({ x: 0, y: 0, tx: 0, ty: 0 });
  const { nodes, edges, clusters } = useMemo(
    () => buildGraph(researchers, missionLabel),
    [missionLabel, researchers],
  );
  const researchersById = useMemo(
    () => new Map(researchers.map(researcher => [researcher.id, researcher])),
    [researchers],
  );

  const visibleEdges = getVisibleEdges(mode, edges, nodes);
  const highlightedNodes = getHighlightedNodes(mode, nodes);
  const bridgeCount = nodes.filter(node => node.isBridge).length;
  const coauthorEdgeCount = edges.filter(edge => edge.type === "coauthor").length;

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setTransform(prev => ({
      ...prev,
      scale: Math.max(0.3, Math.min(3, prev.scale * delta)),
    }));
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    setIsPanning(true);
    panStartRef.current = { x: e.clientX, y: e.clientY, tx: transform.x, ty: transform.y };
  }, [transform.x, transform.y]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isPanning) return;
    const dx = e.clientX - panStartRef.current.x;
    const dy = e.clientY - panStartRef.current.y;
    setTransform(prev => ({ ...prev, x: panStartRef.current.tx + dx, y: panStartRef.current.ty + dy }));
  }, [isPanning]);

  const handleMouseUp = useCallback(() => {
    setIsPanning(false);
  }, []);

  const resetView = useCallback(() => {
    setTransform({ x: 0, y: 0, scale: 1 });
  }, []);

  const handleNodeHover = useCallback((node: GraphNode | null, e?: React.MouseEvent) => {
    setHoveredNode(node);
    if (e && node) {
      const rect = containerRef.current?.getBoundingClientRect();
      if (rect) {
        setTooltipPos({ x: e.clientX - rect.left + 16, y: e.clientY - rect.top - 10 });
      }
    }
  }, []);

  const handleNodeClick = useCallback((node: GraphNode) => {
    if (node.role === "mission") return;
    setSelectedNode(prev => prev?.id === node.id ? null : node);
  }, []);

  const getResearcher = (nodeId: string) => researchersById.get(nodeId);

  const getConnections = useCallback((node: GraphNode) => {
    return nodes
      .filter(otherNode => otherNode.id !== node.id && otherNode.role !== "mission")
      .map(otherNode => {
        const connectingEdges = visibleEdges.filter(edge =>
          (edge.source === node.id && edge.target === otherNode.id)
          || (edge.target === node.id && edge.source === otherNode.id)
        );
        return {
          node: otherNode,
          labels: connectingEdges.map(edge => edge.label).filter((label): label is string => Boolean(label)),
          types: [...new Set(connectingEdges.map(edge => edge.type))],
          isCrossDepartment: node.department !== otherNode.department,
          isCrossFaculty: Boolean(node.faculty && otherNode.faculty && node.faculty !== otherNode.faculty),
        };
      })
      .filter(connection => connection.types.length > 0)
      .sort((a, b) => {
        const aCoauthor = a.types.includes("coauthor") ? 1 : 0;
        const bCoauthor = b.types.includes("coauthor") ? 1 : 0;
        if (aCoauthor !== bCoauthor) return bCoauthor - aCoauthor;
        return b.node.relevanceScore - a.node.relevanceScore;
      });
  }, [nodes, visibleEdges]);

  // Node opacity based on mode
  const getNodeOpacity = (node: GraphNode): number => {
    if (mode === "bridges" && node.role !== "mission") {
      return node.isBridge ? 1 : 0.4;
    }
    return 1;
  };

  const viewBox = "-450 -320 900 640";

  return (
    <div className="flex-1 flex flex-col overflow-hidden relative bg-[linear-gradient(135deg,hsl(250,20%,99%),hsl(260,26%,96%))]">
      {/* Graph Controls */}
      <div className="z-10 flex items-center justify-between gap-4 border-b border-border/70 bg-card/80 px-6 py-3 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <div className="hidden items-center gap-2 rounded-lg border border-border/80 bg-background/80 px-3 py-2 text-xs text-muted-foreground shadow-sm md:flex">
            <Network className="h-4 w-4 text-primary" />
            <span>{nodes.length - 1} researchers</span>
            <span className="h-3 w-px bg-border" />
            <Users className="h-4 w-4 text-imperial-teal" />
            <span>{coauthorEdgeCount} co-author links</span>
            <span className="h-3 w-px bg-border" />
            <GitBranch className="h-4 w-4 text-imperial-gold" />
            <span>{bridgeCount} bridges</span>
          </div>
        </div>
        <div className="flex flex-1 items-center justify-center gap-2 overflow-x-auto">
          {GRAPH_MODES.map(m => (
            <button
              key={m.id}
              onClick={() => setMode(m.id)}
              className={`graph-mode-btn ${mode === m.id ? "graph-mode-btn-active" : ""}`}
              title={m.description}
            >
              {m.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-border/80 bg-background/80 p-1 shadow-sm">
          <button onClick={() => setTransform(p => ({ ...p, scale: Math.min(3, p.scale * 1.2) }))} className="rounded-md p-2 transition-colors hover:bg-secondary" title="Zoom in">
            <ZoomIn className="h-4 w-4 text-muted-foreground" />
          </button>
          <button onClick={() => setTransform(p => ({ ...p, scale: Math.max(0.3, p.scale * 0.8) }))} className="rounded-md p-2 transition-colors hover:bg-secondary" title="Zoom out">
            <ZoomOut className="h-4 w-4 text-muted-foreground" />
          </button>
          <button onClick={resetView} className="rounded-md p-2 transition-colors hover:bg-secondary" title="Reset view">
            <Maximize2 className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>
      </div>

      {/* Graph Canvas */}
      <div
        ref={containerRef}
        className="graph-canvas flex-1 relative overflow-hidden cursor-grab active:cursor-grabbing"
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <svg
          ref={svgRef}
          viewBox={viewBox}
          className="w-full h-full"
          style={{ transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`, transformOrigin: "center" }}
        >
          <defs>
            <filter id="node-soft-shadow" x="-80%" y="-80%" width="260%" height="260%">
              <feDropShadow dx="0" dy="7" stdDeviation="7" floodColor="hsl(260, 20%, 20%)" floodOpacity="0.16" />
            </filter>
            <filter id="mission-shadow" x="-90%" y="-90%" width="280%" height="280%">
              <feDropShadow dx="0" dy="10" stdDeviation="10" floodColor="hsl(268, 55%, 35%)" floodOpacity="0.25" />
            </filter>
            <linearGradient id="mission-fill" x1="0%" x2="100%" y1="0%" y2="100%">
              <stop offset="0%" stopColor="hsl(268, 65%, 56%)" />
              <stop offset="100%" stopColor="hsl(196, 50%, 42%)" />
            </linearGradient>
            {/* Mission glow */}
            <radialGradient id="mission-glow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="hsl(268, 65%, 50%)" stopOpacity="0.22" />
              <stop offset="70%" stopColor="hsl(196, 50%, 45%)" stopOpacity="0.06" />
              <stop offset="100%" stopColor="hsl(268, 65%, 50%)" stopOpacity="0" />
            </radialGradient>
            {/* Relevance rings */}
            <radialGradient id="relevance-ring" cx="50%" cy="50%" r="50%">
              <stop offset="95%" stopColor="hsl(268, 30%, 70%)" stopOpacity="0.06" />
              <stop offset="100%" stopColor="hsl(268, 30%, 70%)" stopOpacity="0" />
            </radialGradient>
          </defs>

          {/* Relevance rings */}
          {[150, 280, 400].map((r, i) => (
            <circle key={i} cx="0" cy="0" r={r} fill="none" stroke="hsl(260, 18%, 78%)" strokeWidth="0.45" strokeDasharray="2 9" opacity={0.45} />
          ))}

          {/* Cluster hulls */}
          {clusters.map(cluster => (
            <g key={cluster.id}>
              <ellipse
                cx={cluster.cx}
                cy={cluster.cy}
                rx={cluster.rx}
                ry={cluster.ry}
                fill={cluster.color}
                stroke="hsl(260, 18%, 80%)"
                strokeWidth="0.35"
                strokeDasharray="2 7"
                opacity={0.55}
              />
              <text
                x={cluster.cx}
                y={cluster.cy - cluster.ry + 11}
                textAnchor="middle"
                className="fill-muted-foreground"
                fontSize="5.5"
                fontFamily="Space Grotesk, sans-serif"
                fontWeight="600"
                letterSpacing="0"
                opacity="0.44"
              >
                {cluster.label.toUpperCase()}
              </text>
            </g>
          ))}

          {/* Edges */}
          {visibleEdges.map((edge, i) => {
            const src = nodes.find(n => n.id === edge.source);
            const tgt = nodes.find(n => n.id === edge.target);
            if (!src || !tgt) return null;
            const color = EDGE_COLORS[edge.type] || "hsl(260, 15%, 80%)";
            const width = edge.type === "mission" ? 0.65 + edge.weight * 1.1 : 0.55 + edge.weight * 0.8;
            const opacity = edge.type === "mission" ? 0.1 + edge.weight * 0.18 : 0.14 + edge.weight * 0.28;
            const isHighlighted = selectedNode && (edge.source === selectedNode.id || edge.target === selectedNode.id);
            return (
              <path
                key={`${edge.source}-${edge.target}-${i}`}
                d={edgePath(src, tgt, i)}
                fill="none"
                stroke={color}
                strokeWidth={isHighlighted ? width * 2.2 : width}
                opacity={isHighlighted ? 0.72 : selectedNode ? opacity * 0.22 : opacity}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            );
          })}

          {/* Co-authored paper labels */}
          {mode === "coauthorship" && visibleEdges
            .filter(edge => edge.type === "coauthor" && edge.label)
            .slice(0, 16)
            .map((edge, i) => {
              const src = nodes.find(n => n.id === edge.source);
              const tgt = nodes.find(n => n.id === edge.target);
              if (!src || !tgt) return null;
              const label = edge.label && edge.label.length > 58 ? `${edge.label.slice(0, 58)}...` : edge.label;
              return (
                <text
                  key={`${edge.source}-${edge.target}-label-${i}`}
                  x={(src.x + tgt.x) / 2}
                  y={(src.y + tgt.y) / 2 - 4}
                  textAnchor="middle"
                  className="fill-muted-foreground"
                  fontSize="4"
                  fontFamily="Inter, sans-serif"
                  opacity="0.55"
                >
                  {label}
                </text>
              );
            })}

          {/* Mission glow circle */}
          <circle cx="0" cy="0" r="86" fill="url(#mission-glow)" className="animate-pulse-glow" />

          {/* Nodes */}
          {nodes.map(node => {
            const size = NODE_SIZES[node.role] || 12;
            const color = NODE_COLORS[node.role] || "hsl(260, 30%, 60%)";
            const isSelected = selectedNode?.id === node.id;
            const isConnected = selectedNode && visibleEdges.some(
              e => (e.source === selectedNode.id && e.target === node.id) || (e.target === selectedNode.id && e.source === node.id)
            );
            const dimmed = selectedNode && !isSelected && !isConnected && node.role !== "mission";
            const bridgeHighlight = highlightedNodes.size > 0 && highlightedNodes.has(node.id);

            return (
              <g
                key={node.id}
                className="graph-node"
                opacity={dimmed ? 0.2 : getNodeOpacity(node)}
                onMouseEnter={e => handleNodeHover(node, e)}
                onMouseLeave={() => handleNodeHover(null)}
                onClick={() => handleNodeClick(node)}
              >
                {/* Bridge indicator */}
                {(node.isBridge || bridgeHighlight) && node.role !== "mission" && (
                  <circle cx={node.x} cy={node.y} r={size + 5} fill="none" stroke="hsl(38, 80%, 48%)" strokeWidth="1.2" strokeDasharray="2 3" opacity={0.7} />
                )}
                {/* Selection ring */}
                {isSelected && (
                  <circle cx={node.x} cy={node.y} r={size + 5} fill="none" stroke={color} strokeWidth="1.8" opacity={0.85} />
                )}
                {/* Main circle */}
                {node.role === "mission" ? (
                  <>
                    <circle cx={node.x} cy={node.y} r={size} fill="url(#mission-fill)" opacity={0.98} filter="url(#mission-shadow)" />
                    <circle cx={node.x} cy={node.y} r={size - 4} fill="none" stroke="white" strokeWidth="0.9" opacity={0.55} />
                    <text x={node.x} y={node.y - 5} textAnchor="middle" fill="white" fontSize="5.2" fontFamily="Space Grotesk, sans-serif" fontWeight="700" letterSpacing="0">
                      SEARCH
                    </text>
                    <text x={node.x} y={node.y + 3} textAnchor="middle" fill="white" fontSize="3.6" fontFamily="Inter, sans-serif" opacity={0.86}>
                      {node.label.slice(0, 24)}
                    </text>
                    <text x={node.x} y={node.y + 9} textAnchor="middle" fill="white" fontSize="3.4" fontFamily="Inter, sans-serif" opacity={0.78}>
                      {node.label.length > 24 ? node.label.slice(24, 48) : "Search Results"}
                    </text>
                  </>
                ) : (
                  <>
                    <circle cx={node.x} cy={node.y} r={size + 3} fill={color} opacity="0.08" />
                    <circle cx={node.x} cy={node.y} r={size} fill={color} opacity={0.95} filter="url(#node-soft-shadow)" />
                    <circle cx={node.x - size * 0.28} cy={node.y - size * 0.35} r={Math.max(1.8, size * 0.24)} fill="white" opacity={0.28} />
                    {/* Initials */}
                    <text x={node.x} y={node.y + 1.2} textAnchor="middle" fill="white" fontSize={size > 14 ? "6.5" : "5.2"} fontFamily="Space Grotesk, sans-serif" fontWeight="700">
                      {node.label.split(" ").map(w => w[0]).filter(Boolean).slice(-2).join("")}
                    </text>
                    {/* Name label */}
                    {(isSelected || isConnected || !selectedNode) && (
                      <>
                        <text x={node.x} y={node.y + size + 9} textAnchor="middle" fill="hsl(260, 25%, 22%)" fontSize="4.8" fontFamily="Space Grotesk, sans-serif" fontWeight="600">
                          {shortNameLabel(node.label)}
                        </text>
                        <text x={node.x} y={node.y + size + 15} textAnchor="middle" fill="hsl(260, 10%, 48%)" fontSize="3.5" fontFamily="Inter, sans-serif">
                          {node.networkRole}
                        </text>
                      </>
                    )}
                    {/* Relevance score */}
                    <circle cx={node.x + size * 0.78} cy={node.y - size * 0.78} r="3.1" fill={node.relevanceScore >= 80 ? "hsl(142, 64%, 40%)" : node.relevanceScore >= 60 ? "hsl(38, 92%, 50%)" : "hsl(0, 72%, 55%)"} stroke="white" strokeWidth="0.9" />
                  </>
                )}
              </g>
            );
          })}
        </svg>

        {/* Hover Tooltip */}
        <AnimatePresence>
          {hoveredNode && hoveredNode.role !== "mission" && (
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="graph-tooltip absolute z-20"
              style={{ left: tooltipPos.x, top: tooltipPos.y }}
            >
              <div className="flex items-center justify-between gap-3 mb-1">
                <p className="font-brand font-semibold text-foreground text-sm">{hoveredNode.label}</p>
                <span className={`text-xs font-bold ${hoveredNode.relevanceScore >= 80 ? "text-relevance-high" : hoveredNode.relevanceScore >= 60 ? "text-relevance-medium" : "text-relevance-low"}`}>
                  {hoveredNode.relevanceScore}%
                </span>
              </div>
              <p className="text-xs text-muted-foreground">{hoveredNode.shortTitle}</p>
              <p className="text-xs text-muted-foreground">{hoveredNode.department}</p>
              {hoveredNode.networkRole && (
                <div className="mt-2 flex items-center gap-1.5">
                  <Info className="h-3 w-3 text-primary" />
                  <span className="text-[11px] font-medium text-primary">{hoveredNode.networkRole}</span>
                </div>
              )}
              {hoveredNode.keywords && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {hoveredNode.keywords.slice(0, 3).map(k => (
                    <span key={k} className="text-[10px] px-1.5 py-0.5 rounded bg-accent text-accent-foreground">{k}</span>
                  ))}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Legend */}
        <div className="absolute bottom-4 left-4 z-10 space-y-1.5 rounded-xl border border-border/80 bg-card/80 p-3 text-xs shadow-lg backdrop-blur-xl">
          <p className="font-brand text-[10px] font-semibold tracking-wider text-muted-foreground uppercase mb-2">Legend</p>
          {[
            { color: NODE_COLORS.pi, label: "Professor / PI", size: 8 },
            { color: NODE_COLORS.lecturer, label: "Lecturer / Reader", size: 7 },
            { color: NODE_COLORS.postdoc, label: "Postdoc / Fellow", size: 6 },
            { color: NODE_COLORS.phd, label: "PhD Student", size: 5 },
          ].map(item => (
            <div key={item.label} className="flex items-center gap-2">
              <span className="inline-block rounded-full" style={{ width: item.size * 2, height: item.size * 2, backgroundColor: item.color }} />
              <span className="text-muted-foreground">{item.label}</span>
            </div>
          ))}
          <div className="flex items-center gap-2 mt-1 pt-1 border-t border-border">
            <span className="inline-block w-3.5 h-3.5 rounded-full border-2 border-dashed border-primary/50" />
            <span className="text-muted-foreground">Bridge researcher</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-block h-0.5 w-5 rounded bg-[hsl(160,45%,55%)]" />
            <span className="text-muted-foreground">Relevant paper co-author</span>
          </div>
        </div>

        {/* Info overlay */}
        <div className="absolute top-4 left-4 z-10 max-w-xs rounded-xl border border-border/80 bg-card/80 px-4 py-3 shadow-lg backdrop-blur-xl">
          <p className="font-brand text-xs font-semibold text-foreground">
            {GRAPH_MODES.find(m => m.id === mode)?.label}
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {GRAPH_MODES.find(m => m.id === mode)?.description}
          </p>
          <div className="mt-2 space-y-1 border-t border-border pt-2 text-[10px] leading-relaxed text-muted-foreground">
            <p><span className="font-semibold text-foreground">Bridge Match</span>: connects the mission to people in other departments or faculties through relevant co-authored papers or shared themes.</p>
            <p><span className="font-semibold text-foreground">Adjacent Match</span>: relevant to the mission, but with weaker direct evidence or fewer interdisciplinary links.</p>
          </div>
        </div>
      </div>

      {/* Side Panel */}
      <AnimatePresence>
        {selectedNode && selectedNode.role !== "mission" && (
          <GraphSidePanel
            node={selectedNode}
            researcher={getResearcher(selectedNode.id)}
            connections={getConnections(selectedNode)}
            onClose={() => setSelectedNode(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
