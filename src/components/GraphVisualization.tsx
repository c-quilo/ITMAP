import { useState, useRef, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ZoomIn, ZoomOut, Maximize2, Info } from "lucide-react";
import {
  GRAPH_NODES,
  GRAPH_EDGES,
  GRAPH_CLUSTERS,
  GRAPH_MODES,
  type GraphNode,
  type GraphEdge,
  type GraphMode,
} from "@/data/graphData";
import { MOCK_RESEARCHERS } from "@/data/mockData";
import GraphSidePanel from "./GraphSidePanel";

const NODE_SIZES: Record<string, number> = {
  mission: 38,
  pi: 18,
  lecturer: 14,
  postdoc: 12,
  phd: 10,
};

const NODE_COLORS: Record<string, string> = {
  mission: "hsl(268, 65%, 50%)",
  pi: "hsl(268, 55%, 55%)",
  lecturer: "hsl(200, 55%, 55%)",
  postdoc: "hsl(160, 50%, 50%)",
  phd: "hsl(30, 55%, 55%)",
};

const EDGE_COLORS: Record<string, string> = {
  mission: "hsl(268, 40%, 70%)",
  supervisor: "hsl(200, 50%, 60%)",
  coauthor: "hsl(160, 45%, 55%)",
  thematic: "hsl(30, 50%, 60%)",
  department: "hsl(260, 15%, 80%)",
};

function getVisibleEdges(mode: GraphMode, edges: GraphEdge[]): GraphEdge[] {
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
        const src = GRAPH_NODES.find(n => n.id === e.source);
        const tgt = GRAPH_NODES.find(n => n.id === e.target);
        return src && tgt && src.cluster !== tgt.cluster;
      });
    default:
      return edges;
  }
}

function getHighlightedNodes(mode: GraphMode): Set<string> {
  if (mode !== "bridges") return new Set();
  return new Set(GRAPH_NODES.filter(n => n.isBridge).map(n => n.id));
}

export default function GraphVisualization() {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<GraphMode>("relevance");
  const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef({ x: 0, y: 0, tx: 0, ty: 0 });

  const visibleEdges = getVisibleEdges(mode, GRAPH_EDGES);
  const highlightedNodes = getHighlightedNodes(mode);

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

  // Get the matching researcher data
  const getResearcher = (nodeId: string) => MOCK_RESEARCHERS.find(r => r.id === nodeId);

  // Node opacity based on mode
  const getNodeOpacity = (node: GraphNode): number => {
    if (mode === "bridges" && node.role !== "mission") {
      return node.isBridge ? 1 : 0.4;
    }
    return 1;
  };

  const viewBox = "-450 -320 900 640";

  return (
    <div className="flex-1 flex flex-col overflow-hidden relative">
      {/* Graph Controls */}
      <div className="bg-card/95 backdrop-blur-sm border-b border-border px-6 py-3 flex items-center justify-between z-10">
        <div className="flex items-center gap-2 flex-wrap">
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
        <div className="flex items-center gap-1">
          <button onClick={() => setTransform(p => ({ ...p, scale: Math.min(3, p.scale * 1.2) }))} className="p-2 rounded-lg hover:bg-secondary transition-colors" title="Zoom in">
            <ZoomIn className="h-4 w-4 text-muted-foreground" />
          </button>
          <button onClick={() => setTransform(p => ({ ...p, scale: Math.max(0.3, p.scale * 0.8) }))} className="p-2 rounded-lg hover:bg-secondary transition-colors" title="Zoom out">
            <ZoomOut className="h-4 w-4 text-muted-foreground" />
          </button>
          <button onClick={resetView} className="p-2 rounded-lg hover:bg-secondary transition-colors" title="Reset view">
            <Maximize2 className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>
      </div>

      {/* Graph Canvas */}
      <div
        ref={containerRef}
        className="flex-1 relative overflow-hidden bg-background cursor-grab active:cursor-grabbing"
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
            {/* Mission glow */}
            <radialGradient id="mission-glow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="hsl(268, 65%, 50%)" stopOpacity="0.25" />
              <stop offset="70%" stopColor="hsl(268, 65%, 50%)" stopOpacity="0.05" />
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
            <circle key={i} cx="0" cy="0" r={r} fill="none" stroke="hsl(268, 20%, 85%)" strokeWidth="0.5" strokeDasharray="4 6" opacity={0.5} />
          ))}

          {/* Cluster hulls */}
          {GRAPH_CLUSTERS.map(cluster => (
            <g key={cluster.id}>
              <ellipse
                cx={cluster.cx}
                cy={cluster.cy}
                rx={cluster.rx}
                ry={cluster.ry}
                fill={cluster.color}
                stroke="hsl(260, 15%, 85%)"
                strokeWidth="0.5"
                strokeDasharray="6 4"
                opacity={0.8}
              />
              <text
                x={cluster.cx}
                y={cluster.cy - cluster.ry + 14}
                textAnchor="middle"
                className="fill-muted-foreground"
                fontSize="7"
                fontFamily="Space Grotesk, sans-serif"
                fontWeight="500"
                letterSpacing="0.05em"
                opacity="0.5"
              >
                {cluster.label.toUpperCase()}
              </text>
            </g>
          ))}

          {/* Edges */}
          {visibleEdges.map((edge, i) => {
            const src = GRAPH_NODES.find(n => n.id === edge.source);
            const tgt = GRAPH_NODES.find(n => n.id === edge.target);
            if (!src || !tgt) return null;
            const color = EDGE_COLORS[edge.type] || "hsl(260, 15%, 80%)";
            const width = edge.type === "mission" ? 1 + edge.weight * 1.5 : 0.8 + edge.weight * 1;
            const opacity = edge.type === "mission" ? 0.15 + edge.weight * 0.2 : 0.2 + edge.weight * 0.3;
            const isHighlighted = selectedNode && (edge.source === selectedNode.id || edge.target === selectedNode.id);
            return (
              <line
                key={`${edge.source}-${edge.target}-${i}`}
                x1={src.x}
                y1={src.y}
                x2={tgt.x}
                y2={tgt.y}
                stroke={color}
                strokeWidth={isHighlighted ? width * 2 : width}
                opacity={isHighlighted ? 0.8 : selectedNode ? opacity * 0.3 : opacity}
                strokeLinecap="round"
              />
            );
          })}

          {/* Mission glow circle */}
          <circle cx="0" cy="0" r="70" fill="url(#mission-glow)" className="animate-pulse-glow" />

          {/* Nodes */}
          {GRAPH_NODES.map(node => {
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
                  <circle cx={node.x} cy={node.y} r={size + 5} fill="none" stroke="hsl(268, 60%, 60%)" strokeWidth="1.5" strokeDasharray="3 2" opacity={0.6} />
                )}
                {/* Selection ring */}
                {isSelected && (
                  <circle cx={node.x} cy={node.y} r={size + 4} fill="none" stroke={color} strokeWidth="2" opacity={0.8} />
                )}
                {/* Main circle */}
                {node.role === "mission" ? (
                  <>
                    <circle cx={node.x} cy={node.y} r={size} fill="hsl(268, 65%, 50%)" opacity={0.9} />
                    <circle cx={node.x} cy={node.y} r={size - 3} fill="none" stroke="white" strokeWidth="1" opacity={0.5} />
                    <text x={node.x} y={node.y - 6} textAnchor="middle" fill="white" fontSize="5.5" fontFamily="Space Grotesk, sans-serif" fontWeight="600" letterSpacing="0.08em">
                      MISSION
                    </text>
                    <text x={node.x} y={node.y + 2} textAnchor="middle" fill="white" fontSize="3.5" fontFamily="Inter, sans-serif" opacity={0.8}>
                      Sustainable Textiles
                    </text>
                    <text x={node.x} y={node.y + 8} textAnchor="middle" fill="white" fontSize="3.5" fontFamily="Inter, sans-serif" opacity={0.8}>
                      & Circular Materials
                    </text>
                  </>
                ) : (
                  <>
                    <circle cx={node.x} cy={node.y} r={size} fill={color} opacity={0.85} />
                    <circle cx={node.x} cy={node.y} r={size - 1.5} fill="none" stroke="white" strokeWidth="0.5" opacity={0.3} />
                    {/* Initials */}
                    <text x={node.x} y={node.y + 1.2} textAnchor="middle" fill="white" fontSize={size > 14 ? "7" : "5.5"} fontFamily="Space Grotesk, sans-serif" fontWeight="600">
                      {node.label.split(" ").map(w => w[0]).filter(Boolean).slice(-2).join("")}
                    </text>
                    {/* Name label */}
                    <text x={node.x} y={node.y + size + 10} textAnchor="middle" fill="hsl(260, 25%, 25%)" fontSize="5" fontFamily="Space Grotesk, sans-serif" fontWeight="500">
                      {node.label.replace("Prof. ", "").replace("Dr. ", "")}
                    </text>
                    <text x={node.x} y={node.y + size + 17} textAnchor="middle" fill="hsl(260, 10%, 55%)" fontSize="3.8" fontFamily="Inter, sans-serif">
                      {node.shortTitle}
                    </text>
                    {/* Relevance score */}
                    <text x={node.x + size + 3} y={node.y - size + 3} textAnchor="start" fill={node.relevanceScore >= 80 ? "hsl(142, 64%, 40%)" : node.relevanceScore >= 60 ? "hsl(38, 92%, 45%)" : "hsl(0, 72%, 51%)"} fontSize="4.5" fontFamily="Space Grotesk, sans-serif" fontWeight="600">
                      {node.relevanceScore}
                    </text>
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
        <div className="absolute bottom-4 left-4 bg-card/90 backdrop-blur-sm border border-border rounded-xl p-3 text-xs space-y-1.5 z-10">
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
        </div>

        {/* Info overlay */}
        <div className="absolute top-4 left-4 bg-card/90 backdrop-blur-sm border border-border rounded-xl px-4 py-3 max-w-xs z-10">
          <p className="font-brand text-xs font-semibold text-foreground">
            {GRAPH_MODES.find(m => m.id === mode)?.label}
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {GRAPH_MODES.find(m => m.id === mode)?.description}
          </p>
        </div>
      </div>

      {/* Side Panel */}
      <AnimatePresence>
        {selectedNode && selectedNode.role !== "mission" && (
          <GraphSidePanel
            node={selectedNode}
            researcher={getResearcher(selectedNode.id)}
            connectedNodes={GRAPH_NODES.filter(n =>
              visibleEdges.some(e =>
                (e.source === selectedNode.id && e.target === n.id) ||
                (e.target === selectedNode.id && e.source === n.id)
              ) && n.id !== selectedNode.id && n.role !== "mission"
            )}
            onClose={() => setSelectedNode(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
