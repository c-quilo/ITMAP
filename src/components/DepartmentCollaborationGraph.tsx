import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type Simulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from "d3-force";
import { useTheme } from "next-themes";
import { Maximize2, Network, Search, UserRound, UsersRound, X, ZoomIn, ZoomOut } from "lucide-react";
import type {
  OrganizationProfile,
  OrganizationResearcher,
  ResearcherSuggestion,
} from "@/lib/researcherSearch";

type GraphNode = SimulationNodeDatum & {
  id: string;
  researcher: OrganizationResearcher;
  radius: number;
  degree: number;
  strength: number;
  color: string;
};

type GraphLink = SimulationLinkDatum<GraphNode> & {
  source: string | GraphNode;
  target: string | GraphNode;
  weight: number;
  latestYear?: number | null;
};

type GraphModel = {
  nodes: GraphNode[];
  links: GraphLink[];
  totalEligibleNodes: number;
};

type CanvasTransform = { x: number; y: number; scale: number };

const NODE_LIMITS = [50, 100, 250, 0] as const;
const FACULTY_COLORS_LIGHT = ["#7b68ee", "#2878b5", "#00856f", "#c65d45", "#b27a00", "#9b4f8c", "#587585"];
const FACULTY_COLORS_DARK = ["#00ff7f", "#65c8ff", "#ff8daa", "#fbc15d", "#c7a6ff", "#73e6dc", "#ff9e72"];

function compact(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function initials(value: string) {
  return value.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join("").toUpperCase();
}

function shortLabel(value: string, maxLength = 25) {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 1).trim()}...`;
}

function edgeNodeId(value: string | GraphNode) {
  return typeof value === "string" ? value : value.id;
}

function deterministicOffset(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
  return {
    x: ((Math.abs(hash) % 997) / 997 - 0.5) * 90,
    y: ((Math.abs(hash * 31) % 991) / 991 - 0.5) * 90,
  };
}

function buildGraphModel(
  profile: OrganizationProfile,
  minimumSharedPapers: number,
  nodeLimit: number,
  includeUnconnected: boolean,
  focusedResearcherId: string,
  darkMode: boolean,
): GraphModel {
  const researchersById = new Map(profile.researchers.map(researcher => [researcher.researcherId, researcher]));
  const eligibleEdges = profile.network.edges.filter(edge => (
    edge.sharedPapers >= minimumSharedPapers
    && researchersById.has(edge.sourceResearcherId)
    && researchersById.has(edge.targetResearcherId)
  ));
  const stats = new Map<string, { degree: number; strength: number }>();
  for (const edge of eligibleEdges) {
    for (const researcherId of [edge.sourceResearcherId, edge.targetResearcherId]) {
      const current = stats.get(researcherId) || { degree: 0, strength: 0 };
      current.degree += 1;
      current.strength += edge.sharedPapers;
      stats.set(researcherId, current);
    }
  }

  const rankedIds = profile.researchers
    .filter(researcher => includeUnconnected || stats.has(researcher.researcherId))
    .sort((first, second) => {
      const firstStats = stats.get(first.researcherId) || { degree: 0, strength: 0 };
      const secondStats = stats.get(second.researcherId) || { degree: 0, strength: 0 };
      return secondStats.strength - firstStats.strength
        || secondStats.degree - firstStats.degree
        || second.paperCount - first.paperCount
        || first.name.localeCompare(second.name);
    })
    .map(researcher => researcher.researcherId);

  let selectedIds = nodeLimit > 0 ? rankedIds.slice(0, nodeLimit) : rankedIds;
  if (focusedResearcherId && researchersById.has(focusedResearcherId)) {
    const neighbours = eligibleEdges
      .filter(edge => edge.sourceResearcherId === focusedResearcherId || edge.targetResearcherId === focusedResearcherId)
      .sort((first, second) => second.sharedPapers - first.sharedPapers)
      .flatMap(edge => [edge.sourceResearcherId, edge.targetResearcherId]);
    selectedIds = [...new Set([focusedResearcherId, ...neighbours, ...selectedIds])];
    if (nodeLimit > 0) selectedIds = selectedIds.slice(0, Math.max(nodeLimit, neighbours.length + 1));
  }
  const selected = new Set(selectedIds);
  const faculties = [...new Set(selectedIds.map(id => researchersById.get(id)?.faculty || "Imperial College London"))].sort();
  const colors = darkMode ? FACULTY_COLORS_DARK : FACULTY_COLORS_LIGHT;
  const facultyColors = new Map(faculties.map((faculty, index) => [faculty, colors[index % colors.length]]));

  const nodes = selectedIds.flatMap(researcherId => {
    const researcher = researchersById.get(researcherId);
    if (!researcher) return [];
    const nodeStats = stats.get(researcherId) || { degree: 0, strength: 0 };
    const offset = deterministicOffset(researcherId);
    return [{
      id: researcherId,
      researcher,
      radius: Math.min(17, 6.5 + Math.sqrt(Math.max(1, researcher.paperCount)) * 0.48),
      degree: nodeStats.degree,
      strength: nodeStats.strength,
      color: facultyColors.get(researcher.faculty || "Imperial College London") || colors[0],
      x: offset.x,
      y: offset.y,
    } satisfies GraphNode];
  });
  const links = eligibleEdges
    .filter(edge => selected.has(edge.sourceResearcherId) && selected.has(edge.targetResearcherId))
    .map(edge => ({
      source: edge.sourceResearcherId,
      target: edge.targetResearcherId,
      weight: edge.sharedPapers,
      latestYear: edge.latestYear,
    }));
  return { nodes, links, totalEligibleNodes: rankedIds.length };
}

function DepartmentNetworkCanvas({
  model,
  selectedNode,
  onSelectNode,
}: {
  model: GraphModel;
  selectedNode: GraphNode | null;
  onSelectNode: (node: GraphNode | null) => void;
}) {
  const { resolvedTheme } = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const simulationRef = useRef<Simulation<GraphNode, GraphLink> | null>(null);
  const nodesRef = useRef<GraphNode[]>([]);
  const linksRef = useRef<GraphLink[]>([]);
  const selectedIdRef = useRef(selectedNode?.id || "");
  const hoveredIdRef = useRef("");
  const transformRef = useRef<CanvasTransform>({ x: 0, y: 0, scale: 1 });
  const drawRef = useRef<() => void>(() => undefined);
  const fitRef = useRef<() => void>(() => undefined);
  const userAdjustedRef = useRef(false);
  const pointerRef = useRef<{
    id: number;
    x: number;
    y: number;
    transform: CanvasTransform;
    node: GraphNode | null;
    moved: boolean;
  } | null>(null);
  const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null);
  const [tooltip, setTooltip] = useState({ x: 0, y: 0 });
  const [zoomPercent, setZoomPercent] = useState(100);

  const palette = useMemo(() => resolvedTheme === "dark" ? {
    background: "#232333",
    text: "#f3f2f8",
    muted: "#aaa9b9",
    edge: "rgba(199, 198, 218, 0.24)",
    edgeActive: "rgba(0, 255, 127, 0.78)",
    outline: "#ffffff",
  } : {
    background: "#fbfaff",
    text: "#251f32",
    muted: "#746f7e",
    edge: "rgba(80, 72, 105, 0.20)",
    edgeActive: "rgba(123, 104, 238, 0.78)",
    outline: "#251f32",
  }, [resolvedTheme]);

  const graphPoint = useCallback((clientX: number, clientY: number) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    const transform = transformRef.current;
    return {
      x: (clientX - rect.left - transform.x) / transform.scale,
      y: (clientY - rect.top - transform.y) / transform.scale,
    };
  }, []);

  const findNode = useCallback((clientX: number, clientY: number) => {
    const point = graphPoint(clientX, clientY);
    let closest: GraphNode | null = null;
    let distance = Number.POSITIVE_INFINITY;
    for (const node of nodesRef.current) {
      if (!Number.isFinite(node.x) || !Number.isFinite(node.y)) continue;
      const nextDistance = Math.hypot(point.x - Number(node.x), point.y - Number(node.y));
      if (nextDistance <= node.radius + 7 / transformRef.current.scale && nextDistance < distance) {
        closest = node;
        distance = nextDistance;
      }
    }
    return closest;
  }, [graphPoint]);

  const zoomBy = useCallback((factor: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const current = transformRef.current;
    const scale = Math.max(0.35, Math.min(3, current.scale * factor));
    const ratio = scale / current.scale;
    transformRef.current = {
      x: rect.width / 2 - ratio * (rect.width / 2 - current.x),
      y: rect.height / 2 - ratio * (rect.height / 2 - current.y),
      scale,
    };
    userAdjustedRef.current = true;
    setZoomPercent(Math.round(scale * 100));
    drawRef.current();
  }, []);

  const reframe = useCallback(() => {
    userAdjustedRef.current = false;
    fitRef.current();
  }, []);

  useEffect(() => {
    selectedIdRef.current = selectedNode?.id || "";
    drawRef.current();
  }, [selectedNode]);

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    const nodes = model.nodes.map(node => ({ ...node }));
    const links = model.links.map(link => ({ ...link }));
    nodesRef.current = nodes;
    linksRef.current = links;
    let width = 1;
    let height = 1;
    let dpr = window.devicePixelRatio || 1;
    let frame = 0;
    let tickCount = 0;

    const draw = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        context.setTransform(dpr, 0, 0, dpr, 0, 0);
        context.clearRect(0, 0, width, height);
        context.fillStyle = palette.background;
        context.fillRect(0, 0, width, height);
        const transform = transformRef.current;
        context.save();
        context.translate(transform.x, transform.y);
        context.scale(transform.scale, transform.scale);
        context.lineCap = "round";

        for (const link of links) {
          const source = typeof link.source === "string" ? nodes.find(node => node.id === link.source) : link.source;
          const target = typeof link.target === "string" ? nodes.find(node => node.id === link.target) : link.target;
          if (!source || !target) continue;
          const active = selectedIdRef.current && (source.id === selectedIdRef.current || target.id === selectedIdRef.current);
          context.strokeStyle = active ? palette.edgeActive : palette.edge;
          context.globalAlpha = active ? 1 : 0.75;
          context.lineWidth = Math.min(4.5, 0.45 + Math.sqrt(Math.max(1, link.weight)) * 0.46);
          context.beginPath();
          context.moveTo(Number(source.x || 0), Number(source.y || 0));
          context.lineTo(Number(target.x || 0), Number(target.y || 0));
          context.stroke();
        }

        const labelledNodes = new Set(
          [...nodes]
            .sort((first, second) => second.strength - first.strength || second.degree - first.degree)
            .slice(0, 18)
            .map(node => node.id),
        );
        for (const node of nodes) {
          const x = Number(node.x || 0);
          const y = Number(node.y || 0);
          const selected = selectedIdRef.current === node.id;
          const hovered = hoveredIdRef.current === node.id;
          context.globalAlpha = 0.96;
          context.fillStyle = node.color;
          context.beginPath();
          context.arc(x, y, node.radius, 0, Math.PI * 2);
          context.fill();
          if (selected || hovered) {
            context.strokeStyle = palette.outline;
            context.lineWidth = selected ? 2.3 : 1.5;
            context.beginPath();
            context.arc(x, y, node.radius + 4, 0, Math.PI * 2);
            context.stroke();
          }
          if (node.radius >= 9) {
            context.fillStyle = resolvedTheme === "dark" ? "#232333" : "#ffffff";
            context.font = `600 ${Math.max(7, node.radius * 0.62)}px "Imperial Sans Display", sans-serif`;
            context.textAlign = "center";
            context.textBaseline = "middle";
            context.fillText(initials(node.researcher.name), x, y + 0.4);
          }
          if (selected || hovered || labelledNodes.has(node.id)) {
            context.globalAlpha = selected || hovered ? 1 : 0.78;
            context.fillStyle = palette.text;
            context.font = `${selected || hovered ? 600 : 500} ${selected || hovered ? 11 : 9.5}px "Imperial Sans Display", sans-serif`;
            context.textAlign = "center";
            context.textBaseline = "middle";
            context.fillText(shortLabel(node.researcher.name), x, y + node.radius + 9);
          }
        }
        context.restore();
      });
    };
    drawRef.current = draw;

    const fit = () => {
      const positioned = nodes.filter(node => Number.isFinite(node.x) && Number.isFinite(node.y));
      if (positioned.length === 0) return;
      const minX = Math.min(...positioned.map(node => Number(node.x) - node.radius - 10));
      const maxX = Math.max(...positioned.map(node => Number(node.x) + node.radius + 10));
      const minY = Math.min(...positioned.map(node => Number(node.y) - node.radius - 18));
      const maxY = Math.max(...positioned.map(node => Number(node.y) + node.radius + 18));
      const graphWidth = Math.max(1, maxX - minX);
      const graphHeight = Math.max(1, maxY - minY);
      const padding = Math.max(28, Math.min(70, Math.min(width, height) * 0.08));
      const scale = Math.max(0.35, Math.min(1.2, Math.min(
        (width - padding * 2) / graphWidth,
        (height - padding * 2) / graphHeight,
      )));
      transformRef.current = {
        x: (width - graphWidth * scale) / 2 - minX * scale,
        y: (height - graphHeight * scale) / 2 - minY * scale,
        scale,
      };
      setZoomPercent(Math.round(scale * 100));
      draw();
    };
    fitRef.current = fit;

    const faculties = [...new Set(nodes.map(node => node.researcher.faculty || "Imperial College London"))].sort();
    const clusterPosition = new Map(faculties.map((faculty, index) => {
      const angle = (index / Math.max(1, faculties.length)) * Math.PI * 2 - Math.PI / 2;
      const radius = faculties.length <= 1 ? 0 : Math.min(width, height) * 0.22;
      return [faculty, { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius }];
    }));

    simulationRef.current?.stop();
    const simulation = forceSimulation<GraphNode, GraphLink>(nodes)
      .alpha(0.95)
      .alphaDecay(nodes.length > 300 ? 0.055 : 0.042)
      .velocityDecay(0.4)
      .force("link", forceLink<GraphNode, GraphLink>(links)
        .id(node => node.id)
        .distance(link => Math.max(48, 104 - Math.sqrt(Math.max(1, link.weight)) * 9))
        .strength(link => Math.min(0.55, 0.12 + Math.sqrt(Math.max(1, link.weight)) * 0.055)))
      .force("charge", forceManyBody<GraphNode>().strength(node => -42 - node.radius * 2.8))
      .force("collide", forceCollide<GraphNode>().radius(node => node.radius + 6).iterations(3))
      .force("x", forceX<GraphNode>(node => clusterPosition.get(node.researcher.faculty || "Imperial College London")?.x || 0).strength(0.045))
      .force("y", forceY<GraphNode>(node => clusterPosition.get(node.researcher.faculty || "Imperial College London")?.y || 0).strength(0.045))
      .force("center", forceCenter(0, 0))
      .on("tick", () => {
        tickCount += 1;
        draw();
        if (tickCount === 14 && !userAdjustedRef.current) fit();
      })
      .on("end", () => {
        if (!userAdjustedRef.current) fit();
      });
    simulationRef.current = simulation;

    const resize = () => {
      const rect = container.getBoundingClientRect();
      width = Math.max(1, Math.floor(rect.width));
      height = Math.max(1, Math.floor(rect.height));
      dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      simulation.force("center", forceCenter(0, 0)).alpha(0.25).restart();
      if (!userAdjustedRef.current) fit();
      else draw();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    resize();

    return () => {
      observer.disconnect();
      simulation.stop();
      cancelAnimationFrame(frame);
      if (simulationRef.current === simulation) simulationRef.current = null;
    };
  }, [model, palette, resolvedTheme]);

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const node = findNode(event.clientX, event.clientY);
    pointerRef.current = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      transform: { ...transformRef.current },
      node,
      moved: false,
    };
    userAdjustedRef.current = true;
    if (node) {
      node.fx = node.x;
      node.fy = node.y;
      simulationRef.current?.alphaTarget(0.16).restart();
    }
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const interaction = pointerRef.current;
    if (interaction?.id === event.pointerId) {
      const dx = event.clientX - interaction.x;
      const dy = event.clientY - interaction.y;
      if (Math.hypot(dx, dy) > 4) interaction.moved = true;
      if (interaction.node) {
        const point = graphPoint(event.clientX, event.clientY);
        interaction.node.fx = point.x;
        interaction.node.fy = point.y;
      } else {
        transformRef.current = {
          ...interaction.transform,
          x: interaction.transform.x + dx,
          y: interaction.transform.y + dy,
        };
        drawRef.current();
      }
      return;
    }
    const node = findNode(event.clientX, event.clientY);
    if (hoveredIdRef.current !== (node?.id || "")) {
      hoveredIdRef.current = node?.id || "";
      setHoveredNode(node);
      drawRef.current();
    }
    const rect = event.currentTarget.getBoundingClientRect();
    setTooltip({ x: event.clientX - rect.left + 14, y: event.clientY - rect.top + 14 });
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const interaction = pointerRef.current;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (interaction?.node) {
      interaction.node.fx = null;
      interaction.node.fy = null;
      simulationRef.current?.alphaTarget(0);
      if (!interaction.moved) onSelectNode(interaction.node);
    } else if (interaction && !interaction.moved) {
      onSelectNode(null);
    }
    pointerRef.current = null;
  };

  return (
    <div ref={containerRef} className="relative h-full min-h-[460px] w-full overflow-hidden bg-background sm:min-h-[620px]">
      <canvas
        ref={canvasRef}
        className="block h-full w-full touch-none cursor-grab active:cursor-grabbing"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onPointerLeave={() => {
          if (!pointerRef.current) {
            hoveredIdRef.current = "";
            setHoveredNode(null);
            drawRef.current();
          }
        }}
        aria-label="Department co-authorship network"
      />

      <div className="absolute right-3 top-3 flex items-center gap-1 rounded-md border border-border bg-card/90 p-1 shadow-sm backdrop-blur-sm">
        <button type="button" onClick={() => zoomBy(1.18)} className="flex h-9 w-9 items-center justify-center rounded-md hover:bg-secondary" title="Zoom in" aria-label="Zoom in">
          <ZoomIn className="h-4 w-4 text-muted-foreground" />
        </button>
        <button type="button" onClick={() => zoomBy(1 / 1.18)} className="flex h-9 w-9 items-center justify-center rounded-md hover:bg-secondary" title="Zoom out" aria-label="Zoom out">
          <ZoomOut className="h-4 w-4 text-muted-foreground" />
        </button>
        <button type="button" onClick={reframe} className="flex h-9 w-9 items-center justify-center rounded-md hover:bg-secondary" title="Re-frame graph" aria-label="Re-frame graph">
          <Maximize2 className="h-4 w-4 text-muted-foreground" />
        </button>
        <span className="min-w-10 px-1 text-center text-[10px] font-medium text-muted-foreground">{zoomPercent}%</span>
      </div>

      {hoveredNode && (
        <div
          className="pointer-events-none absolute z-20 max-w-[250px] rounded-md border border-border bg-popover px-3 py-2 shadow-lg"
          style={{
            left: Math.min(tooltip.x, Math.max(8, (containerRef.current?.clientWidth || 280) - 260)),
            top: tooltip.y,
          }}
        >
          <p className="text-xs font-semibold text-popover-foreground">{hoveredNode.researcher.name}</p>
          <p className="mt-0.5 text-[10px] text-muted-foreground">{hoveredNode.degree} co-authors in this view</p>
        </div>
      )}
    </div>
  );
}

export default function DepartmentCollaborationGraph({
  profile,
  onOpenProfile,
}: {
  profile: OrganizationProfile;
  onOpenProfile?: (researcher: ResearcherSuggestion) => void;
}) {
  const { resolvedTheme } = useTheme();
  const [minimumSharedPapers, setMinimumSharedPapers] = useState(1);
  const [nodeLimit, setNodeLimit] = useState<number>(100);
  const [includeUnconnected, setIncludeUnconnected] = useState(false);
  const [researcherQuery, setResearcherQuery] = useState("");
  const [focusedResearcherId, setFocusedResearcherId] = useState("");
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);

  const suggestions = useMemo(() => {
    const query = compact(researcherQuery).toLocaleLowerCase();
    if (query.length < 2 || focusedResearcherId) return [];
    return profile.researchers
      .filter(researcher => researcher.name.toLocaleLowerCase().includes(query))
      .slice(0, 8);
  }, [focusedResearcherId, profile.researchers, researcherQuery]);

  const model = useMemo(() => buildGraphModel(
    profile,
    minimumSharedPapers,
    nodeLimit,
    includeUnconnected,
    focusedResearcherId,
    resolvedTheme === "dark",
  ), [focusedResearcherId, includeUnconnected, minimumSharedPapers, nodeLimit, profile, resolvedTheme]);

  useEffect(() => {
    setSelectedNode(current => current ? model.nodes.find(node => node.id === current.id) || null : null);
  }, [model]);

  const connectedPeople = useMemo(() => {
    if (!selectedNode) return [];
    return model.links.flatMap(link => {
      const sourceId = edgeNodeId(link.source);
      const targetId = edgeNodeId(link.target);
      const neighbourId = sourceId === selectedNode.id ? targetId : targetId === selectedNode.id ? sourceId : "";
      if (!neighbourId) return [];
      const node = model.nodes.find(candidate => candidate.id === neighbourId);
      return node ? [{ node, sharedPapers: link.weight, latestYear: link.latestYear }] : [];
    }).sort((first, second) => second.sharedPapers - first.sharedPapers || first.node.researcher.name.localeCompare(second.node.researcher.name));
  }, [model, selectedNode]);

  const faculties = useMemo(() => {
    const values = new Map<string, string>();
    for (const node of model.nodes) values.set(node.researcher.faculty || "Imperial College London", node.color);
    return [...values.entries()];
  }, [model.nodes]);

  const chooseResearcher = (researcher: OrganizationResearcher) => {
    setResearcherQuery(researcher.name);
    setFocusedResearcherId(researcher.researcherId);
    setSelectedNode(null);
  };

  return (
    <div className="overflow-hidden border-y border-border bg-card">
      <div className="border-b border-border px-3 py-4 sm:px-5">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Network className="h-4 w-4 text-primary" />
              <h4 className="text-sm font-semibold text-foreground">Co-authorship connections</h4>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Solid links represent shared papers. Thicker links mean more papers together.
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <label className="min-w-[140px] text-[10px] font-semibold uppercase text-muted-foreground">
              Minimum shared papers
              <select
                value={minimumSharedPapers}
                onChange={event => setMinimumSharedPapers(Number(event.target.value))}
                className="mt-1 block h-9 w-full rounded-md border border-border bg-background px-2 text-xs font-medium normal-case text-foreground outline-none focus:border-primary"
              >
                {[1, 2, 3, 5, 10].map(value => <option key={value} value={value}>{value}</option>)}
              </select>
            </label>
            <label className="min-w-[118px] text-[10px] font-semibold uppercase text-muted-foreground">
              Researchers
              <select
                value={nodeLimit}
                onChange={event => setNodeLimit(Number(event.target.value))}
                className="mt-1 block h-9 w-full rounded-md border border-border bg-background px-2 text-xs font-medium normal-case text-foreground outline-none focus:border-primary"
              >
                {NODE_LIMITS.map(value => <option key={value} value={value}>{value || "All"}</option>)}
              </select>
            </label>
            <label className="flex h-9 items-center gap-2 rounded-md border border-border bg-background px-3 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={includeUnconnected}
                onChange={event => setIncludeUnconnected(event.target.checked)}
                className="h-4 w-4 accent-primary"
              />
              Include unconnected
            </label>
          </div>
        </div>

        <div className="mt-3 flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative w-full lg:max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <input
              value={researcherQuery}
              onChange={event => {
                setResearcherQuery(event.target.value);
                setFocusedResearcherId("");
              }}
              placeholder="Find a researcher in this graph..."
              className="h-9 w-full rounded-md border border-border bg-background pl-9 pr-9 text-xs text-foreground outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
            {researcherQuery && (
              <button
                type="button"
                onClick={() => {
                  setResearcherQuery("");
                  setFocusedResearcherId("");
                  setSelectedNode(null);
                }}
                className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-md hover:bg-secondary"
                aria-label="Clear researcher lookup"
              >
                <X className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            )}
            {suggestions.length > 0 && (
              <div className="absolute inset-x-0 top-[calc(100%+5px)] z-40 max-h-64 overflow-y-auto rounded-md border border-border bg-popover p-1 shadow-xl">
                {suggestions.map(researcher => (
                  <button
                    key={researcher.researcherId}
                    type="button"
                    onClick={() => chooseResearcher(researcher)}
                    className="block w-full rounded-md px-3 py-2 text-left hover:bg-secondary"
                  >
                    <span className="block text-xs font-semibold text-foreground">{researcher.name}</span>
                    <span className="mt-0.5 block truncate text-[10px] text-muted-foreground">{researcher.title}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-muted-foreground">
            <span>{model.nodes.length.toLocaleString()} researchers shown</span>
            <span>{model.links.length.toLocaleString()} co-authorship links</span>
            {profile.network.edgeCount > profile.network.returnedEdgeCount && (
              <span>Showing the strongest {profile.network.returnedEdgeCount.toLocaleString()} of {profile.network.edgeCount.toLocaleString()} links</span>
            )}
          </div>
        </div>

        {faculties.length > 1 && (
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-[10px] text-muted-foreground">
            {faculties.map(([faculty, color]) => (
              <span key={faculty} className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
                {faculty}
              </span>
            ))}
          </div>
        )}
      </div>

      {model.nodes.length === 0 || (model.links.length === 0 && !includeUnconnected) ? (
        <div className="flex min-h-[420px] items-center justify-center px-6 text-center">
          <div>
            <UsersRound className="mx-auto h-6 w-6 text-muted-foreground" />
            <p className="mt-3 text-sm font-semibold text-foreground">No co-authorship links pass these filters</p>
            <p className="mt-1 text-xs text-muted-foreground">Lower the shared-paper threshold or include unconnected researchers.</p>
          </div>
        </div>
      ) : (
        <div className="relative">
          <DepartmentNetworkCanvas model={model} selectedNode={selectedNode} onSelectNode={setSelectedNode} />
          {selectedNode && (
            <aside className="absolute inset-x-0 bottom-0 z-30 max-h-[72%] overflow-y-auto border-t border-border bg-card shadow-xl sm:inset-y-0 sm:left-auto sm:right-0 sm:w-[350px] sm:border-l sm:border-t-0">
              <div className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase text-primary">Researcher</p>
                    <h4 className="mt-1 text-lg font-semibold leading-tight text-foreground">{selectedNode.researcher.name}</h4>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{selectedNode.researcher.title}</p>
                  </div>
                  <button type="button" onClick={() => setSelectedNode(null)} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md hover:bg-secondary" aria-label="Close researcher details">
                    <X className="h-4 w-4 text-muted-foreground" />
                  </button>
                </div>
                <div className="mt-4 grid grid-cols-3 border-y border-border py-3 text-center">
                  <div>
                    <p className="text-lg font-semibold tabular-nums text-foreground">{selectedNode.degree}</p>
                    <p className="text-[10px] text-muted-foreground">co-authors</p>
                  </div>
                  <div className="border-l border-border">
                    <p className="text-lg font-semibold tabular-nums text-foreground">{selectedNode.strength}</p>
                    <p className="text-[10px] text-muted-foreground">shared papers</p>
                  </div>
                  <div className="border-l border-border">
                    <p className="text-lg font-semibold tabular-nums text-foreground">{selectedNode.researcher.paperCount}</p>
                    <p className="text-[10px] text-muted-foreground">papers total</p>
                  </div>
                </div>
                <div className="mt-4">
                  <p className="text-[10px] font-semibold uppercase text-muted-foreground">Strongest connections in this view</p>
                  <div className="mt-2 divide-y divide-border">
                    {connectedPeople.slice(0, 16).map(connection => (
                      <button
                        key={connection.node.id}
                        type="button"
                        onClick={() => setSelectedNode(connection.node)}
                        className="flex w-full items-center justify-between gap-3 py-2.5 text-left"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-xs font-medium text-foreground">{connection.node.researcher.name}</span>
                          <span className="mt-0.5 block text-[10px] text-muted-foreground">{connection.latestYear ? `Latest ${connection.latestYear}` : "Year not recorded"}</span>
                        </span>
                        <span className="shrink-0 text-[10px] font-semibold text-primary">{connection.sharedPapers} papers</span>
                      </button>
                    ))}
                  </div>
                </div>
                {onOpenProfile && (
                  <button
                    type="button"
                    onClick={() => onOpenProfile({
                      researcherId: selectedNode.researcher.researcherId,
                      openalexId: selectedNode.researcher.openalexId,
                      profileUrl: selectedNode.researcher.profileUrl,
                      name: selectedNode.researcher.name,
                      title: selectedNode.researcher.title,
                      department: selectedNode.researcher.department,
                      faculty: selectedNode.researcher.faculty,
                      score: 1,
                    })}
                    className="mt-4 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-md bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
                  >
                    <UserRound className="h-3.5 w-3.5" />
                    Open researcher profile
                  </button>
                )}
              </div>
            </aside>
          )}
        </div>
      )}
    </div>
  );
}
