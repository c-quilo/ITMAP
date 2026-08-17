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
  mission: 32,
  pi: 15,
  lecturer: 13,
  postdoc: 11,
  phd: 10,
};

const GRAPH_FONT = '"Imperial Sans Display", system-ui, sans-serif';
const MIN_GRAPH_SCALE = 0.3;
const MAX_GRAPH_SCALE = 3;

const CLUSTER_PALETTE = [
  { node: "#2878b5", fill: "rgba(40, 120, 181, 0.11)" },
  { node: "#a85ea5", fill: "rgba(168, 94, 165, 0.10)" },
  { node: "#249a79", fill: "rgba(36, 154, 121, 0.10)" },
  { node: "#d37c35", fill: "rgba(211, 124, 53, 0.10)" },
  { node: "#4f76a7", fill: "rgba(79, 118, 167, 0.10)" },
  { node: "#b05f78", fill: "rgba(176, 95, 120, 0.10)" },
  { node: "#6f8f45", fill: "rgba(111, 143, 69, 0.10)" },
  { node: "#7a6fb2", fill: "rgba(122, 111, 178, 0.10)" },
];

const EDGE_COLORS: Record<string, string> = {
  mission: "hsl(151, 7%, 50%)",
  supervisor: "hsl(204, 35%, 48%)",
  coauthor: "hsl(161, 36%, 43%)",
  thematic: "hsl(28, 51%, 49%)",
  department: "hsl(151, 7%, 63%)",
};

const MIN_NODE_SPACING = 58;
const CLUSTER_GAP = 28;

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

function getMemberLayout(count: number) {
  if (count <= 1) {
    return { offsets: [{ x: 0, y: 0 }], rx: 76, ry: 60 };
  }

  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  const offsets = Array.from({ length: count }, (_, index) => {
    if (index === 0) return { x: 0, y: 0 };
    const radius = MIN_NODE_SPACING * Math.sqrt(index);
    const angle = index * goldenAngle - Math.PI / 2;
    return {
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius * 0.82,
    };
  });

  const maxX = Math.max(...offsets.map(offset => Math.abs(offset.x)));
  const maxY = Math.max(...offsets.map(offset => Math.abs(offset.y)));
  return {
    offsets,
    rx: Math.max(86, maxX + 52),
    ry: Math.max(68, maxY + 52),
  };
}

function getInitialClusterCentre(index: number, count: number, innerRadius: number) {
  const innerCount = Math.min(8, count);
  const onOuterRing = index >= innerCount;
  const ringIndex = onOuterRing ? index - innerCount : index;
  const ringCount = onOuterRing ? count - innerCount : innerCount;
  const radius = onOuterRing ? innerRadius + 260 : innerRadius;
  const angleOffset = onOuterRing ? Math.PI / Math.max(1, ringCount) : 0;
  const angle = (Math.PI * 2 * ringIndex) / Math.max(1, ringCount) - Math.PI / 2 + angleOffset;
  return {
    x: Math.cos(angle) * radius,
    y: Math.sin(angle) * radius * 0.82,
  };
}

function separateClusterCentres<T extends { cx: number; cy: number; initialX: number; initialY: number; collisionRadius: number }>(clusters: T[]) {
  for (let iteration = 0; iteration < 180; iteration += 1) {
    for (const cluster of clusters) {
      cluster.cx += (cluster.initialX - cluster.cx) * 0.012;
      cluster.cy += (cluster.initialY - cluster.cy) * 0.012;

      const missionDistance = Math.hypot(cluster.cx, cluster.cy) || 1;
      const minimumMissionDistance = cluster.collisionRadius + 92;
      if (missionDistance < minimumMissionDistance) {
        const push = minimumMissionDistance - missionDistance;
        cluster.cx += (cluster.cx / missionDistance) * push;
        cluster.cy += (cluster.cy / missionDistance) * push;
      }
    }

    for (let i = 0; i < clusters.length; i += 1) {
      for (let j = i + 1; j < clusters.length; j += 1) {
        const a = clusters[i];
        const b = clusters[j];
        let dx = b.cx - a.cx;
        let dy = b.cy - a.cy;
        let distance = Math.hypot(dx, dy);
        if (distance < 0.001) {
          const angle = (i + 1) * 1.618;
          dx = Math.cos(angle);
          dy = Math.sin(angle);
          distance = 1;
        }
        const minimumDistance = a.collisionRadius + b.collisionRadius + CLUSTER_GAP;
        if (distance >= minimumDistance) continue;

        const push = (minimumDistance - distance) * 0.52;
        const nx = dx / distance;
        const ny = dy / distance;
        a.cx -= nx * push;
        a.cy -= ny * push;
        b.cx += nx * push;
        b.cy += ny * push;
      }
    }
  }
}

function getGraphViewBox(clusters: GraphCluster[]) {
  if (clusters.length === 0) return "-450 -320 900 640";

  const padding = 92;
  let minX = Math.min(-60, ...clusters.map(cluster => cluster.cx - cluster.rx)) - padding;
  let maxX = Math.max(60, ...clusters.map(cluster => cluster.cx + cluster.rx)) + padding;
  let minY = Math.min(-60, ...clusters.map(cluster => cluster.cy - cluster.ry)) - padding;
  let maxY = Math.max(60, ...clusters.map(cluster => cluster.cy + cluster.ry)) + padding;

  const targetRatio = 1.48;
  const width = maxX - minX;
  const height = maxY - minY;
  if (width / height < targetRatio) {
    const extra = (height * targetRatio - width) / 2;
    minX -= extra;
    maxX += extra;
  } else if (width / height > targetRatio) {
    const extra = (width / targetRatio - height) / 2;
    minY -= extra;
    maxY += extra;
  }

  return `${minX} ${minY} ${maxX - minX} ${maxY - minY}`;
}

function buildGraph(researchers: Researcher[], missionLabel = "Current Mission") {
  const visibleResearchers = researchers.slice(0, 24);
  const departments = [...new Set(visibleResearchers.map(researcher => researcher.department || "Imperial").filter(Boolean))];
  const memberLayouts = new Map(departments.map(department => {
    const count = visibleResearchers.filter(researcher => (researcher.department || "Imperial") === department).length;
    return [department, getMemberLayout(count)] as const;
  }));
  const largestClusterRadius = Math.max(110, ...[...memberLayouts.values()].map(layout => Math.max(layout.rx, layout.ry)));
  const innerRadius = Math.max(245, largestClusterRadius * 1.65);
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

  const clusterDrafts = departments.map((department, index) => {
    const layout = memberLayouts.get(department) ?? getMemberLayout(1);
    const initial = getInitialClusterCentre(index, departments.length, innerRadius);
    const palette = CLUSTER_PALETTE[index % CLUSTER_PALETTE.length];
    return {
      id: department,
      label: department.replace(/^Department of /, "").replace(/^School of /, ""),
      cx: initial.x,
      cy: initial.y,
      initialX: initial.x,
      initialY: initial.y,
      rx: layout.rx,
      ry: layout.ry,
      collisionRadius: Math.max(layout.rx, layout.ry) + 20,
      color: palette.fill,
      nodeColor: palette.node,
      description: department,
    };
  });
  separateClusterCentres(clusterDrafts);
  const clusters: GraphCluster[] = clusterDrafts.map(({ initialX: _initialX, initialY: _initialY, collisionRadius: _collisionRadius, nodeColor: _nodeColor, ...cluster }) => cluster);
  const clusterNodeColors = new Map(clusterDrafts.map(cluster => [cluster.id, cluster.nodeColor]));

  for (const [departmentIndex, department] of departments.entries()) {
    const cluster = clusters[departmentIndex];
    const members = visibleResearchers.filter(researcher => (researcher.department || "Imperial") === department);
    const layout = memberLayouts.get(department) ?? getMemberLayout(members.length);
    for (const [memberIndex, researcher] of members.entries()) {
      const offset = layout.offsets[memberIndex] ?? { x: 0, y: 0 };
      nodes.push({
        id: researcher.id,
        x: cluster.cx + offset.x,
        y: cluster.cy + offset.y,
        label: researcher.name,
        shortTitle: researcher.title,
        department: researcher.department,
        faculty: researcher.faculty,
        role: inferGraphRole(researcher),
        relevanceScore: researcher.relevanceScore,
        cluster: department,
        isBridge: false,
        networkRole: matchStrengthLabel(researcher.relevanceScore),
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
        thematicCrossings > 0 ? `${thematicCrossings} cross-cluster thematic link${thematicCrossings === 1 ? "" : "s"}` : "",
      ].filter(Boolean);

      if ((crossDepartments + crossFaculties) > 0) {
        node.isBridge = true;
        node.networkRole = "Bridge Match";
      }
    }
  }

  return { nodes, edges, clusters, clusterNodeColors, viewBox: getGraphViewBox(clusters) };
}

function edgePath(src: GraphNode, tgt: GraphNode, index: number) {
  const dx = tgt.x - src.x;
  const dy = tgt.y - src.y;
  const distance = Math.sqrt(dx * dx + dy * dy) || 1;
  const curve = Math.min(72, Math.max(12, distance * 0.16));
  const direction = index % 2 === 0 ? 1 : -1;
  const midX = (src.x + tgt.x) / 2 + (-dy / distance) * curve * direction;
  const midY = (src.y + tgt.y) / 2 + (dx / distance) * curve * direction;
  return `M ${src.x} ${src.y} Q ${midX} ${midY} ${tgt.x} ${tgt.y}`;
}

function getNodeLabelPlacement(node: GraphNode, cluster: GraphCluster | undefined, size: number) {
  if (!cluster) {
    return { x: node.x, y: node.y + size + 10, anchor: "middle" as const, roleY: node.y + size + 17 };
  }

  const dx = node.x - cluster.cx;
  const dy = node.y - cluster.cy;
  if (Math.hypot(dx, dy) < 12) {
    return { x: node.x, y: node.y + size + 11, anchor: "middle" as const, roleY: node.y + size + 18 };
  }

  if (Math.abs(dx) >= Math.abs(dy) * 0.7) {
    const direction = dx >= 0 ? 1 : -1;
    return {
      x: node.x + direction * (size + 8),
      y: node.y - 1,
      anchor: direction > 0 ? "start" as const : "end" as const,
      roleY: node.y + 7,
    };
  }

  const direction = dy >= 0 ? 1 : -1;
  return {
    x: node.x,
    y: node.y + direction * (size + 10),
    anchor: "middle" as const,
    roleY: node.y + direction * (size + 17),
  };
}

function matchStrengthLabel(score: number) {
  if (score >= 80) return "Strong Match";
  if (score >= 60) return "Moderate Match";
  return "Weak Match";
}

function getVisibleEdges(mode: GraphMode, edges: GraphEdge[], nodes: GraphNode[]): GraphEdge[] {
  switch (mode) {
    case "coauthorship":
      return edges.filter(e => e.type === "coauthor" || e.type === "mission");
    case "bridges":
      return edges.filter(e => {
        if (e.type === "mission") return true;
        const src = nodes.find(n => n.id === e.source);
        const tgt = nodes.find(n => n.id === e.target);
        if (!src || !tgt || src.cluster === tgt.cluster) return false;
        if (e.type === "coauthor") return true;
        return e.type === "thematic" && Boolean(src.isBridge || tgt.isBridge);
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
  const [mode, setMode] = useState<GraphMode>("coauthorship");
  const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef({ x: 0, y: 0, tx: 0, ty: 0 });
  const { nodes, edges, clusters, clusterNodeColors, viewBox } = useMemo(
    () => buildGraph(researchers, missionLabel),
    [missionLabel, researchers],
  );
  const clustersById = useMemo(
    () => new Map(clusters.map(cluster => [cluster.id, cluster])),
    [clusters],
  );
  const researchersById = useMemo(
    () => new Map(researchers.map(researcher => [researcher.id, researcher])),
    [researchers],
  );

  const visibleEdges = getVisibleEdges(mode, edges, nodes);
  const highlightedNodes = getHighlightedNodes(mode, nodes);
  const focusedNode = selectedNode ?? hoveredNode;
  const bridgeCount = nodes.filter(node => node.isBridge).length;
  const coauthorEdgeCount = edges.filter(edge => edge.type === "coauthor").length;

  const zoomAtPoint = useCallback((factor: number, pointX = 0, pointY = 0) => {
    setTransform(prev => {
      const scale = Math.max(MIN_GRAPH_SCALE, Math.min(MAX_GRAPH_SCALE, prev.scale * factor));
      if (scale === prev.scale) return prev;

      const ratio = scale / prev.scale;
      return {
        scale,
        x: pointX - ratio * (pointX - prev.x),
        y: pointY - ratio * (pointY - prev.y),
      };
    });
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const deltaMultiplier = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? rect.height : 1;
    const pixelDelta = Math.max(-120, Math.min(120, e.deltaY * deltaMultiplier));
    const factor = Math.exp(-pixelDelta * 0.0018);
    const pointX = e.clientX - rect.left - rect.width / 2;
    const pointY = e.clientY - rect.top - rect.height / 2;
    zoomAtPoint(factor, pointX, pointY);
  }, [zoomAtPoint]);

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if ((e.target as Element).closest?.(".graph-node")) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setIsPanning(true);
    panStartRef.current = { x: e.clientX, y: e.clientY, tx: transform.x, ty: transform.y };
  }, [transform.x, transform.y]);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!isPanning) return;
    const dx = e.clientX - panStartRef.current.x;
    const dy = e.clientY - panStartRef.current.y;
    setTransform(prev => ({ ...prev, x: panStartRef.current.tx + dx, y: panStartRef.current.ty + dy }));
  }, [isPanning]);

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
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

  return (
    <div className="graph-view relative flex flex-1 flex-col overflow-hidden bg-background">
      {/* Graph Controls */}
      <div className="z-10 flex flex-wrap items-center justify-between gap-2 border-b border-border/70 bg-card/90 px-3 py-2 backdrop-blur-xl sm:flex-nowrap sm:gap-4 sm:px-6 sm:py-3">
        <div className="hidden items-center gap-3 md:flex">
          <div className="hidden items-center gap-2 rounded-md border border-border/70 bg-background/70 px-3 py-2 text-xs text-muted-foreground md:flex">
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
        <div className="order-3 flex w-full items-center justify-center gap-2 overflow-x-auto sm:order-none sm:w-auto sm:flex-1">
          {GRAPH_MODES.map(m => (
            <button
              key={m.id}
              onClick={() => setMode(m.id)}
              className={`graph-mode-btn flex-1 sm:flex-none ${mode === m.id ? "graph-mode-btn-active" : ""}`}
              title={m.description}
            >
              {m.label}
            </button>
          ))}
        </div>
        <div className="order-2 ml-auto flex items-center gap-1 rounded-md border border-border/70 bg-background/70 p-1 sm:order-none sm:ml-0">
          <button
            onClick={() => zoomAtPoint(1.18)}
            className="flex h-10 w-10 items-center justify-center rounded-md transition-colors hover:bg-secondary sm:h-auto sm:w-auto sm:p-2"
            title="Zoom in"
            aria-label="Zoom in"
          >
            <ZoomIn className="h-4 w-4 text-muted-foreground" />
          </button>
          <button
            onClick={() => zoomAtPoint(1 / 1.18)}
            className="flex h-10 w-10 items-center justify-center rounded-md transition-colors hover:bg-secondary sm:h-auto sm:w-auto sm:p-2"
            title="Zoom out"
            aria-label="Zoom out"
          >
            <ZoomOut className="h-4 w-4 text-muted-foreground" />
          </button>
          <button
            onClick={resetView}
            className="flex h-10 w-10 items-center justify-center rounded-md transition-colors hover:bg-secondary sm:h-auto sm:w-auto sm:p-2"
            title="Re-frame graph"
            aria-label="Re-frame graph"
          >
            <Maximize2 className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>
      </div>

      {/* Graph Canvas */}
      <div
        ref={containerRef}
        className="graph-canvas relative flex-1 touch-none cursor-grab overflow-hidden active:cursor-grabbing"
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <svg
          ref={svgRef}
          viewBox={viewBox}
          className="w-full h-full"
          style={{ transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`, transformOrigin: "center" }}
        >
          <defs>
            <filter id="node-soft-shadow" x="-80%" y="-80%" width="260%" height="260%">
              <feDropShadow dx="0" dy="3" stdDeviation="4" floodColor="hsl(153, 18%, 18%)" floodOpacity="0.12" />
            </filter>
            <filter id="mission-shadow" x="-90%" y="-90%" width="280%" height="280%">
              <feDropShadow dx="0" dy="5" stdDeviation="7" floodColor="hsl(235, 45%, 35%)" floodOpacity="0.2" />
            </filter>
          </defs>

          {/* Cluster hulls */}
          {clusters.map(cluster => (
            <g key={cluster.id}>
              <ellipse
                cx={cluster.cx}
                cy={cluster.cy}
                rx={cluster.rx}
                ry={cluster.ry}
                fill={cluster.color}
                stroke={clusterNodeColors.get(cluster.id)}
                strokeWidth="0.65"
                opacity={1}
                strokeOpacity={0.16}
              />
              <text
                x={cluster.cx}
                y={cluster.cy - cluster.ry - 10}
                textAnchor="middle"
                className="fill-muted-foreground"
                fontSize="7"
                fontFamily={GRAPH_FONT}
                fontWeight="500"
                letterSpacing="0"
                opacity="0.78"
              >
                {cluster.label}
              </text>
            </g>
          ))}

          {/* Edges */}
          {visibleEdges.map((edge, i) => {
            const src = nodes.find(n => n.id === edge.source);
            const tgt = nodes.find(n => n.id === edge.target);
            if (!src || !tgt) return null;
            const color = EDGE_COLORS[edge.type] || "hsl(151, 7%, 63%)";
            const width = edge.type === "mission" ? 0.4 + edge.weight * 0.35 : 0.45 + edge.weight * 0.5;
            const opacity = edge.type === "mission" ? 0.035 + edge.weight * 0.06 : 0.08 + edge.weight * 0.16;
            const isHighlighted = Boolean(focusedNode && (edge.source === focusedNode.id || edge.target === focusedNode.id));
            return (
              <path
                key={`${edge.source}-${edge.target}-${i}`}
                d={edgePath(src, tgt, i)}
                fill="none"
                stroke={color}
                strokeWidth={isHighlighted ? width * 1.9 : width}
                opacity={isHighlighted ? 0.82 : focusedNode ? opacity * 0.2 : opacity}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            );
          })}

          {/* Co-authored paper labels */}
          {mode === "coauthorship" && focusedNode && visibleEdges
            .filter(edge => edge.type === "coauthor" && edge.label && (edge.source === focusedNode.id || edge.target === focusedNode.id))
            .slice(0, 6)
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
                  fontSize="4.5"
                  fontFamily={GRAPH_FONT}
                  opacity="0.62"
                >
                  {label}
                </text>
              );
            })}

          {/* Nodes */}
          {nodes.map(node => {
            const size = NODE_SIZES[node.role] || 12;
            const color = node.role === "mission" ? "hsl(var(--primary))" : clusterNodeColors.get(node.cluster) ?? "#647a75";
            const cluster = clustersById.get(node.cluster);
            const label = getNodeLabelPlacement(node, cluster, size);
            const isSelected = selectedNode?.id === node.id;
            const isConnected = focusedNode && visibleEdges.some(
              e => (e.source === focusedNode.id && e.target === node.id) || (e.target === focusedNode.id && e.source === node.id)
            );
            const isFocused = focusedNode?.id === node.id;
            const dimmed = focusedNode && !isFocused && !isConnected && node.role !== "mission";
            const bridgeHighlight = highlightedNodes.size > 0 && highlightedNodes.has(node.id);

            return (
              <g
                key={node.id}
                className="graph-node"
                data-node-id={node.id}
                data-node-size={size}
                role={node.role === "mission" ? undefined : "button"}
                aria-label={node.role === "mission" ? undefined : `${node.label}, ${node.networkRole ?? "researcher"}`}
                opacity={dimmed ? 0.18 : getNodeOpacity(node)}
                onMouseEnter={e => handleNodeHover(node, e)}
                onMouseLeave={() => handleNodeHover(null)}
                onClick={() => handleNodeClick(node)}
              >
                {/* Bridge indicator */}
                {(node.isBridge || bridgeHighlight) && node.role !== "mission" && (
                  <circle cx={node.x} cy={node.y} r={size + 5} fill="none" stroke="#d34f57" strokeWidth="1.1" strokeDasharray="2.5 3.5" opacity={0.72} />
                )}
                {/* Selection ring */}
                {isSelected && (
                  <circle cx={node.x} cy={node.y} r={size + 7} fill="none" stroke="#d34f57" strokeWidth="1.8" opacity={0.9} />
                )}
                {/* Main circle */}
                {node.role === "mission" ? (
                  <>
                    <circle cx={node.x} cy={node.y} r={size + 14} fill="none" stroke={color} strokeWidth="0.8" opacity={0.16} />
                    <circle cx={node.x} cy={node.y} r={size} fill={color} opacity={0.98} filter="url(#mission-shadow)" />
                    <text x={node.x} y={node.y - 5} textAnchor="middle" fill="white" fontSize="5.2" fontFamily={GRAPH_FONT} fontWeight="500" letterSpacing="0">
                      MISSION
                    </text>
                    <text x={node.x} y={node.y + 3} textAnchor="middle" fill="white" fontSize="3.6" fontFamily={GRAPH_FONT} opacity={0.86}>
                      {node.label.slice(0, 24)}
                    </text>
                    <text x={node.x} y={node.y + 9} textAnchor="middle" fill="white" fontSize="3.4" fontFamily={GRAPH_FONT} opacity={0.78}>
                      {node.label.length > 24 ? node.label.slice(24, 48) : "Search Results"}
                    </text>
                  </>
                ) : (
                  <>
                    <circle cx={node.x} cy={node.y} r={size + 4} fill={color} opacity="0.09" />
                    <circle cx={node.x} cy={node.y} r={size} fill={color} opacity={0.94} filter="url(#node-soft-shadow)" />
                    {/* Initials */}
                    <text x={node.x} y={node.y + 1.4} textAnchor="middle" fill="white" fontSize={size > 14 ? "6.5" : "5.2"} fontFamily={GRAPH_FONT} fontWeight="500">
                      {node.label.split(" ").map(w => w[0]).filter(Boolean).slice(-2).join("")}
                    </text>
                    {/* Name label */}
                    {(isFocused || isConnected || !focusedNode) && (
                      <>
                        <text x={label.x} y={label.y} textAnchor={label.anchor} className="fill-foreground" fontSize="5" fontFamily={GRAPH_FONT} fontWeight="500">
                          {shortNameLabel(node.label)}
                        </text>
                        {(isSelected || hoveredNode?.id === node.id) && (
                          <text x={label.x} y={label.roleY} textAnchor={label.anchor} className="fill-muted-foreground" fontSize="3.8" fontFamily={GRAPH_FONT}>
                            {node.networkRole}
                          </text>
                        )}
                      </>
                    )}
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
                  {matchStrengthLabel(hoveredNode.relevanceScore)}
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
        <div className="absolute bottom-4 left-4 z-10 hidden space-y-1.5 rounded-lg border border-border/70 bg-card/88 p-3 text-xs shadow-sm backdrop-blur-xl sm:block">
          <p className="font-brand text-[10px] font-semibold tracking-wider text-muted-foreground uppercase mb-2">Legend</p>
          <div className="flex items-center gap-2">
            <span className="inline-block h-3 w-3 rounded-full bg-[#2878b5]" />
            <span className="text-muted-foreground">Colour shows department</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex w-5 items-center justify-center gap-0.5">
              <span className="inline-block h-2 w-2 rounded-full bg-[#647a75]" />
              <span className="inline-block h-3.5 w-3.5 rounded-full bg-[#647a75]" />
            </span>
            <span className="text-muted-foreground">Size shows role / seniority</span>
          </div>
          <div className="flex items-center gap-2 mt-1 pt-1 border-t border-border">
            <span className="inline-block w-3.5 h-3.5 rounded-full border-2 border-dashed border-[#d34f57]" />
            <span className="text-muted-foreground">Bridge researcher</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-block h-0.5 w-5 rounded bg-[hsl(160,45%,55%)]" />
            <span className="text-muted-foreground">Relevant paper co-author</span>
          </div>
        </div>

        {/* Info overlay */}
        <div className="absolute left-4 top-4 z-10 hidden max-w-xs rounded-lg border border-border/70 bg-card/88 px-4 py-3 shadow-sm backdrop-blur-xl sm:block">
          <p className="font-brand text-xs font-semibold text-foreground">
            {GRAPH_MODES.find(m => m.id === mode)?.label}
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {GRAPH_MODES.find(m => m.id === mode)?.description}
          </p>
          <div className="mt-2 space-y-1 border-t border-border pt-2 text-[10px] leading-relaxed text-muted-foreground">
            <p><span className="font-semibold text-foreground">Bridge Match</span>: connects the mission to people in other departments or faculties through relevant co-authored papers. Shared themes add context, but do not create a bridge on their own.</p>
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
