import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  type Simulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from "d3-force";
import { Maximize2, Network, ZoomIn, ZoomOut } from "lucide-react";
import { useTheme } from "next-themes";
import type { Researcher } from "@/data/mockData";
import { researcherMatchLabel } from "@/lib/matchStrength";

type SearchNodeType = "researcher" | "topic" | "department";

type SearchNode = SimulationNodeDatum & {
  id: string;
  type: SearchNodeType;
  label: string;
  radius: number;
  researcher?: Researcher;
  faculty?: string;
  department?: string;
  relevance?: number;
  connectionCount?: number;
  topics?: string[];
};

type SearchLink = SimulationLinkDatum<SearchNode> & {
  source: string | SearchNode;
  target: string | SearchNode;
  type: "topic" | "department";
  weight: number;
};

type GraphModel = {
  nodes: SearchNode[];
  links: SearchLink[];
  researcherCount: number;
  topicCount: number;
  departmentCount: number;
};

type CanvasTransform = { x: number; y: number; scale: number };

type Palette = {
  background: string;
  grid: string;
  text: string;
  muted: string;
  topic: string;
  department: string;
  engineering: string;
  medicine: string;
  naturalSciences: string;
  business: string;
  other: string;
  selected: string;
};

const RESULT_LIMITS = [25, 50, 100, 0] as const;

function slug(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "unknown";
}

function shortLabel(value: string, maxLength = 28) {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 1).trim()}...`;
}

function initials(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0])
    .join("")
    .toUpperCase();
}

function researcherColor(faculty: string, palette: Palette) {
  const value = faculty.toLowerCase();
  if (value.includes("engineering")) return palette.engineering;
  if (value.includes("medicine")) return palette.medicine;
  if (value.includes("natural sciences")) return palette.naturalSciences;
  if (value.includes("business")) return palette.business;
  return palette.other;
}

function edgeNodeId(node: string | SearchNode) {
  return typeof node === "string" ? node : node.id;
}

function buildSearchResultsGraphModel(researchers: Researcher[], limit: number): GraphModel {
  const visibleResearchers = limit > 0 ? researchers.slice(0, limit) : researchers;
  const topicGroups = new Map<string, {
    id: string;
    label: string;
    researcherIds: Set<string>;
    relevance: number;
  }>();
  const departmentGroups = new Map<string, { id: string; label: string; researcherIds: Set<string> }>();

  for (const researcher of visibleResearchers) {
    const department = researcher.department || "Department not recorded";
    const departmentKey = slug(department);
    const departmentGroup = departmentGroups.get(departmentKey) || {
      id: `department:${departmentKey}`,
      label: department,
      researcherIds: new Set<string>(),
    };
    departmentGroup.researcherIds.add(researcher.id);
    departmentGroups.set(departmentKey, departmentGroup);

    const seenTopics = new Set<string>();
    for (const topic of (researcher.openAlexTopics || []).filter(item => item.relevance >= 0.18).slice(0, 6)) {
      const topicKey = slug(topic.openalexTopicId || topic.label);
      if (!topicKey || seenTopics.has(topicKey)) continue;
      seenTopics.add(topicKey);
      const group = topicGroups.get(topicKey) || {
        id: `topic:${topicKey}`,
        label: topic.label,
        researcherIds: new Set<string>(),
        relevance: 0,
      };
      group.researcherIds.add(researcher.id);
      group.relevance += topic.relevance;
      topicGroups.set(topicKey, group);
    }
  }

  const topicLimit = Math.min(18, Math.max(8, Math.ceil(Math.sqrt(Math.max(1, visibleResearchers.length)) * 2)));
  const selectedTopics = [...topicGroups.values()]
    .sort((a, b) => b.researcherIds.size - a.researcherIds.size || b.relevance - a.relevance)
    .slice(0, topicLimit);
  const selectedTopicIds = new Set(selectedTopics.map(topic => topic.id));
  const selectedDepartments = [...departmentGroups.values()]
    .sort((a, b) => b.researcherIds.size - a.researcherIds.size || a.label.localeCompare(b.label));

  const nodes: SearchNode[] = visibleResearchers.map(researcher => ({
    id: `researcher:${researcher.id}`,
    type: "researcher",
    label: researcher.name,
    radius: 8 + Math.max(0, Math.min(5, (researcher.relevanceScore - 45) / 10)),
    researcher,
    faculty: researcher.faculty,
    department: researcher.department,
    relevance: researcher.relevanceScore,
    topics: (researcher.openAlexTopics || []).slice(0, 4).map(topic => topic.label),
  }));

  nodes.push(...selectedTopics.map(topic => ({
    id: topic.id,
    type: "topic" as const,
    label: topic.label,
    radius: Math.min(22, 11 + Math.sqrt(topic.researcherIds.size) * 1.6),
    connectionCount: topic.researcherIds.size,
  })));
  nodes.push(...selectedDepartments.map(department => ({
    id: department.id,
    type: "department" as const,
    label: department.label,
    radius: Math.min(19, 10 + Math.sqrt(department.researcherIds.size) * 1.4),
    connectionCount: department.researcherIds.size,
  })));

  const links: SearchLink[] = [];
  for (const researcher of visibleResearchers) {
    const researcherId = `researcher:${researcher.id}`;
    const departmentId = `department:${slug(researcher.department || "Department not recorded")}`;
    links.push({ source: researcherId, target: departmentId, type: "department", weight: 1 });

    const linkedTopics = new Set<string>();
    for (const topic of (researcher.openAlexTopics || []).filter(item => item.relevance >= 0.18).slice(0, 6)) {
      const topicId = `topic:${slug(topic.openalexTopicId || topic.label)}`;
      if (!selectedTopicIds.has(topicId) || linkedTopics.has(topicId)) continue;
      linkedTopics.add(topicId);
      links.push({ source: researcherId, target: topicId, type: "topic", weight: topic.relevance });
    }
  }

  return {
    nodes,
    links,
    researcherCount: visibleResearchers.length,
    topicCount: selectedTopics.length,
    departmentCount: selectedDepartments.length,
  };
}

function SearchResultsCanvas({
  model,
  onSelectResearcher,
}: {
  model: GraphModel;
  onSelectResearcher: (researcher: Researcher) => void;
}) {
  const { resolvedTheme } = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const simulationRef = useRef<Simulation<SearchNode, SearchLink> | null>(null);
  const nodesRef = useRef<SearchNode[]>([]);
  const transformRef = useRef<CanvasTransform>({ x: 0, y: 0, scale: 1 });
  const drawRef = useRef<() => void>(() => undefined);
  const fitViewRef = useRef<() => void>(() => undefined);
  const userAdjustedRef = useRef(false);
  const hoveredIdRef = useRef<string | null>(null);
  const interactionRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    transform: CanvasTransform;
    node: SearchNode | null;
    moved: boolean;
  } | null>(null);
  const [zoomPercent, setZoomPercent] = useState(100);
  const [hoveredNode, setHoveredNode] = useState<SearchNode | null>(null);
  const [tooltip, setTooltip] = useState({ x: 0, y: 0 });

  const palette = useMemo<Palette>(() => resolvedTheme === "dark" ? {
    background: "#232333",
    grid: "rgba(222, 222, 238, 0.07)",
    text: "#f7f6fb",
    muted: "#aaa9ba",
    topic: "#00ff7f",
    department: "#ffd166",
    engineering: "#79c7ff",
    medicine: "#ff8fa3",
    naturalSciences: "#86e3b1",
    business: "#f6bd60",
    other: "#c7c4d8",
    selected: "#ffffff",
  } : {
    background: "#faf9fd",
    grid: "rgba(63, 53, 92, 0.07)",
    text: "#221d2f",
    muted: "#746f7e",
    topic: "#7b68ee",
    department: "#c58a00",
    engineering: "#2878b5",
    medicine: "#c84f69",
    naturalSciences: "#25875f",
    business: "#a56a00",
    other: "#777382",
    selected: "#18131f",
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
    let nearest: SearchNode | null = null;
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (const node of nodesRef.current) {
      if (!Number.isFinite(node.x) || !Number.isFinite(node.y)) continue;
      const distance = Math.hypot(point.x - Number(node.x), point.y - Number(node.y));
      if (distance <= node.radius + 7 / transformRef.current.scale && distance < nearestDistance) {
        nearest = node;
        nearestDistance = distance;
      }
    }
    return nearest;
  }, [graphPoint]);

  const zoomBy = useCallback((factor: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const current = transformRef.current;
    const nextScale = Math.max(0.35, Math.min(3.2, current.scale * factor));
    const centreX = rect.width / 2;
    const centreY = rect.height / 2;
    const ratio = nextScale / current.scale;
    transformRef.current = {
      x: centreX - ratio * (centreX - current.x),
      y: centreY - ratio * (centreY - current.y),
      scale: nextScale,
    };
    userAdjustedRef.current = true;
    setZoomPercent(Math.round(nextScale * 100));
    drawRef.current();
  }, []);

  const resetView = useCallback(() => {
    userAdjustedRef.current = false;
    fitViewRef.current();
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    const nodes = model.nodes.map(node => ({ ...node }));
    const links = model.links.map(link => ({ ...link }));
    nodesRef.current = nodes;
    let width = 1;
    let height = 1;
    let dpr = window.devicePixelRatio || 1;
    let frame = 0;

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

        context.fillStyle = palette.grid;
        for (let x = -44; x < width / transform.scale + 44; x += 44) {
          for (let y = -44; y < height / transform.scale + 44; y += 44) {
            context.fillRect(x, y, 1.2, 1.2);
          }
        }

        context.lineCap = "round";
        for (const link of links) {
          const source = typeof link.source === "string" ? nodes.find(node => node.id === link.source) : link.source;
          const target = typeof link.target === "string" ? nodes.find(node => node.id === link.target) : link.target;
          if (!source || !target) continue;
          const hovered = hoveredIdRef.current && (source.id === hoveredIdRef.current || target.id === hoveredIdRef.current);
          context.globalAlpha = hovered ? 0.72 : link.type === "topic" ? 0.24 : 0.15;
          context.strokeStyle = link.type === "topic" ? palette.topic : palette.department;
          context.lineWidth = link.type === "topic" ? Math.max(0.65, Math.min(2.2, link.weight * 2)) : 0.7;
          context.beginPath();
          context.moveTo(Number(source.x || 0), Number(source.y || 0));
          context.lineTo(Number(target.x || 0), Number(target.y || 0));
          context.stroke();
        }

        const labelledResearchers = new Set(
          nodes
            .filter(node => node.type === "researcher")
            .sort((a, b) => Number(b.relevance || 0) - Number(a.relevance || 0))
            .slice(0, 14)
            .map(node => node.id),
        );

        for (const node of nodes) {
          const x = Number(node.x || 0);
          const y = Number(node.y || 0);
          const hovered = hoveredIdRef.current === node.id;
          const color = node.type === "topic"
            ? palette.topic
            : node.type === "department"
              ? palette.department
              : researcherColor(node.faculty || "", palette);

          context.save();
          if (hovered) {
            context.globalAlpha = 0.9;
            context.strokeStyle = palette.selected;
            context.lineWidth = 1.8;
            context.beginPath();
            context.arc(x, y, node.radius + 4, 0, Math.PI * 2);
            context.stroke();
          }

          context.globalAlpha = 0.96;
          context.fillStyle = color;
          if (node.type === "department") {
            const size = node.radius * 1.55;
            context.beginPath();
            context.roundRect(x - size / 2, y - size / 2, size, size, 4);
            context.fill();
          } else {
            context.beginPath();
            context.arc(x, y, node.radius, 0, Math.PI * 2);
            context.fill();
          }

          if (node.type === "researcher") {
            context.fillStyle = "#ffffff";
            context.font = `600 ${Math.max(7, node.radius * 0.55)}px "Imperial Sans Display", sans-serif`;
            context.textAlign = "center";
            context.textBaseline = "middle";
            context.fillText(initials(node.label), x, y + 0.5);
          }
          context.restore();

          const showLabel = node.type !== "researcher" || hovered || labelledResearchers.has(node.id);
          if (showLabel) {
            context.save();
            context.globalAlpha = hovered ? 1 : node.type === "researcher" ? 0.76 : 0.9;
            context.fillStyle = palette.text;
            context.font = `${node.type === "topic" ? 600 : 500} ${node.type === "topic" ? 11 : 9.5}px "Imperial Sans Display", sans-serif`;
            context.textAlign = "center";
            context.textBaseline = "middle";
            context.fillText(shortLabel(node.label, node.type === "researcher" ? 24 : 30), x, y + node.radius + 9);
            context.restore();
          }
        }
        context.restore();
      });
    };
    drawRef.current = draw;

    const fitView = () => {
      const positioned = nodes.filter(node => Number.isFinite(node.x) && Number.isFinite(node.y));
      if (positioned.length === 0) return;
      const horizontalExtent = (node: SearchNode) => node.type === "researcher"
        ? Math.max(node.radius + 14, 46)
        : Math.max(node.radius + 14, Math.min(105, node.label.length * 3.4));
      const minX = Math.min(...positioned.map(node => Number(node.x) - horizontalExtent(node)));
      const maxX = Math.max(...positioned.map(node => Number(node.x) + horizontalExtent(node)));
      const minY = Math.min(...positioned.map(node => Number(node.y) - node.radius - 18));
      const maxY = Math.max(...positioned.map(node => Number(node.y) + node.radius + 22));
      const graphWidth = Math.max(1, maxX - minX);
      const graphHeight = Math.max(1, maxY - minY);
      const padding = Math.min(72, Math.max(28, Math.min(width, height) * 0.08));
      const nextScale = Math.max(0.35, Math.min(1.1, Math.min(
        (width - padding * 2) / graphWidth,
        (height - padding * 2) / graphHeight,
      )));
      transformRef.current = {
        x: (width - graphWidth * nextScale) / 2 - minX * nextScale,
        y: (height - graphHeight * nextScale) / 2 - minY * nextScale,
        scale: nextScale,
      };
      setZoomPercent(Math.round(nextScale * 100));
      draw();
    };
    fitViewRef.current = fitView;

    const resize = () => {
      const rect = container.getBoundingClientRect();
      width = Math.max(1, Math.floor(rect.width));
      height = Math.max(1, Math.floor(rect.height));
      dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;

      nodes.forEach((node, index) => {
        if (Number.isFinite(node.x) && Number.isFinite(node.y)) return;
        const angle = (index / Math.max(1, nodes.length)) * Math.PI * 2;
        const ring = node.type === "topic" ? 80 : node.type === "department" ? 180 : 260;
        node.x = width / 2 + Math.cos(angle) * ring;
        node.y = height / 2 + Math.sin(angle) * ring;
      });
      simulationRef.current?.force("center", forceCenter(width / 2, height / 2));
      simulationRef.current?.alpha(0.28).restart();
      if (!userAdjustedRef.current) fitView();
      else draw();
    };

    simulationRef.current?.stop();
    const simulation = forceSimulation<SearchNode, SearchLink>(nodes)
      .alpha(0.95)
      .alphaDecay(0.045)
      .velocityDecay(0.42)
      .force("link", forceLink<SearchNode, SearchLink>(links)
        .id(node => node.id)
        .distance(link => link.type === "topic" ? 82 : 62)
        .strength(link => link.type === "topic" ? 0.22 : 0.1))
      .force("charge", forceManyBody<SearchNode>().strength(node => (
        node.type === "topic" ? -340 : node.type === "department" ? -240 : -72
      )))
      .force("collide", forceCollide<SearchNode>().radius(node => node.radius + 10).iterations(3))
      .force("center", forceCenter(1, 1))
      .on("tick", draw)
      .on("end", () => {
        if (!userAdjustedRef.current) fitView();
        else draw();
      });
    simulationRef.current = simulation;

    const observer = new ResizeObserver(resize);
    observer.observe(container);
    resize();

    return () => {
      observer.disconnect();
      simulation.stop();
      cancelAnimationFrame(frame);
      if (simulationRef.current === simulation) simulationRef.current = null;
      if (fitViewRef.current === fitView) fitViewRef.current = () => undefined;
    };
  }, [model, palette]);

  const handleWheel = (event: React.WheelEvent<HTMLCanvasElement>) => {
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const current = transformRef.current;
    const factor = Math.exp(-Math.max(-80, Math.min(80, event.deltaY)) * 0.0018);
    const nextScale = Math.max(0.35, Math.min(3.2, current.scale * factor));
    const pointerX = event.clientX - rect.left;
    const pointerY = event.clientY - rect.top;
    const ratio = nextScale / current.scale;
    transformRef.current = {
      x: pointerX - ratio * (pointerX - current.x),
      y: pointerY - ratio * (pointerY - current.y),
      scale: nextScale,
    };
    userAdjustedRef.current = true;
    setZoomPercent(Math.round(nextScale * 100));
    drawRef.current();
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const node = findNode(event.clientX, event.clientY);
    userAdjustedRef.current = true;
    interactionRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      transform: { ...transformRef.current },
      node,
      moved: false,
    };
    if (node) {
      node.fx = node.x;
      node.fy = node.y;
      simulationRef.current?.alphaTarget(0.15).restart();
    }
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const interaction = interactionRef.current;
    if (interaction && interaction.pointerId === event.pointerId) {
      const dx = event.clientX - interaction.startX;
      const dy = event.clientY - interaction.startY;
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
    if (hoveredIdRef.current !== node?.id) {
      hoveredIdRef.current = node?.id || null;
      setHoveredNode(node);
      drawRef.current();
    }
    const rect = event.currentTarget.getBoundingClientRect();
    setTooltip({ x: event.clientX - rect.left + 14, y: event.clientY - rect.top + 14 });
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const interaction = interactionRef.current;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (interaction?.node) {
      interaction.node.fx = null;
      interaction.node.fy = null;
      simulationRef.current?.alphaTarget(0);
      if (!interaction.moved && interaction.node.researcher) onSelectResearcher(interaction.node.researcher);
    }
    interactionRef.current = null;
  };

  return (
    <div ref={containerRef} className="relative h-[58dvh] min-h-[500px] max-h-[760px] w-full overflow-hidden bg-background">
      <canvas
        ref={canvasRef}
        className="block h-full w-full touch-none cursor-grab active:cursor-grabbing"
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onPointerLeave={() => {
          if (!interactionRef.current) {
            hoveredIdRef.current = null;
            setHoveredNode(null);
            drawRef.current();
          }
        }}
        aria-label="Search result topic network"
      />

      <div className="absolute right-3 top-3 flex items-center gap-1 rounded-md border border-border bg-card/90 p-1 shadow-sm backdrop-blur-sm">
        <button type="button" onClick={() => zoomBy(1.18)} className="flex h-9 w-9 items-center justify-center rounded-md hover:bg-secondary" aria-label="Zoom in" title="Zoom in">
          <ZoomIn className="h-4 w-4 text-muted-foreground" />
        </button>
        <button type="button" onClick={() => zoomBy(1 / 1.18)} className="flex h-9 w-9 items-center justify-center rounded-md hover:bg-secondary" aria-label="Zoom out" title="Zoom out">
          <ZoomOut className="h-4 w-4 text-muted-foreground" />
        </button>
        <button type="button" onClick={resetView} className="flex h-9 w-9 items-center justify-center rounded-md hover:bg-secondary" aria-label="Re-frame graph" title="Re-frame graph">
          <Maximize2 className="h-4 w-4 text-muted-foreground" />
        </button>
        <span className="min-w-10 px-1 text-center text-[10px] font-medium text-muted-foreground">{zoomPercent}%</span>
      </div>

      {hoveredNode && (
        <div
          className="pointer-events-none absolute z-20 max-w-[270px] rounded-md border border-border bg-popover px-3 py-2 shadow-lg"
          style={{
            left: Math.min(tooltip.x, Math.max(8, (containerRef.current?.clientWidth || 300) - 280)),
            top: Math.min(tooltip.y, Math.max(8, (containerRef.current?.clientHeight || 500) - 150)),
          }}
        >
          <p className="text-xs font-semibold text-popover-foreground">{hoveredNode.label}</p>
          {hoveredNode.type === "researcher" ? (
            <>
              <p className="mt-0.5 text-[10px] text-muted-foreground">{hoveredNode.department}</p>
              <p className="mt-1 text-[10px] font-medium text-primary">{hoveredNode.researcher ? researcherMatchLabel(hoveredNode.researcher) : "Researcher"}</p>
              {hoveredNode.topics && hoveredNode.topics.length > 0 && (
                <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">{hoveredNode.topics.join(" · ")}</p>
              )}
              <p className="mt-1 text-[10px] text-muted-foreground">Click to view this result</p>
            </>
          ) : (
            <p className="mt-1 text-[10px] text-muted-foreground">
              {hoveredNode.connectionCount} connected {hoveredNode.connectionCount === 1 ? "researcher" : "researchers"}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export default function SearchResultsGraph({
  researchers,
  onSelectResearcher,
}: {
  researchers: Researcher[];
  onSelectResearcher: (researcher: Researcher) => void;
}) {
  const [limit, setLimit] = useState<(typeof RESULT_LIMITS)[number]>(() => (
    window.matchMedia("(max-width: 767px)").matches ? 25 : 50
  ));
  const model = useMemo(() => buildSearchResultsGraphModel(researchers, limit), [limit, researchers]);
  const visibleResearchers = useMemo(
    () => model.nodes.flatMap(node => node.researcher ? [node.researcher] : []),
    [model],
  );

  return (
    <section className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
      <div className="flex flex-col gap-3 border-b border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Network className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">Search result network</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {model.researcherCount} researchers · {model.topicCount} paper topics · {model.departmentCount} departments
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
            <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-primary" />Topic</span>
            <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-[#c58a00] dark:bg-[#ffd166]" />Department</span>
            <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-[#2878b5] dark:bg-[#79c7ff]" />Researcher</span>
          </div>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            Show
            <select
              value={limit}
              onChange={event => setLimit(Number(event.target.value) as (typeof RESULT_LIMITS)[number])}
              className="h-9 rounded-md border border-border bg-background px-2 text-xs text-foreground outline-none focus:border-primary"
            >
              {RESULT_LIMITS.map(option => (
                <option key={option} value={option}>{option === 0 ? `All (${researchers.length})` : option}</option>
              ))}
            </select>
          </label>
        </div>
      </div>
      <SearchResultsCanvas model={model} onSelectResearcher={onSelectResearcher} />
      <details className="group border-t border-border">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between px-4 py-3 text-xs font-medium text-foreground marker:content-none">
          Browse the researchers as a list
          <span className="text-[10px] text-muted-foreground">{visibleResearchers.length} shown</span>
        </summary>
        <div className="grid max-h-72 overflow-y-auto border-t border-border sm:grid-cols-2 lg:grid-cols-3">
          {visibleResearchers.map(researcher => (
            <button
              key={researcher.id}
              type="button"
              onClick={() => onSelectResearcher(researcher)}
              className="border-b border-border px-4 py-3 text-left transition-colors hover:bg-secondary sm:border-r"
            >
              <span className="block truncate text-xs font-semibold text-foreground">{researcher.name}</span>
              <span className="mt-1 block truncate text-[10px] text-muted-foreground">{researcher.department}</span>
              <span className="mt-1 block text-[10px] font-medium text-primary">{researcherMatchLabel(researcher)}</span>
            </button>
          ))}
        </div>
      </details>
    </section>
  );
}
