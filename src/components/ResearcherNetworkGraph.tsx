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
import { useTheme } from "next-themes";
import {
  ArrowLeft,
  ChevronRight,
  Building2,
  ExternalLink,
  GraduationCap,
  Landmark,
  Loader2,
  Maximize2,
  Network,
  Route,
  Search,
  UserRound,
  UsersRound,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import {
  getResearcherConnection,
  getResearcherNetwork,
  suggestResearchers,
  type ResearcherConnection,
  type ResearcherConnectionEdge,
  type ResearcherNetwork,
  type ResearcherNetworkConnection,
  type ResearcherSuggestion,
} from "@/lib/researcherSearch";

type NetworkNodeType = "focal" | "target" | "imperial" | "external" | "department" | "faculty" | "institution";
type NetworkEdgeType = "coauthor" | "department" | "faculty" | "institution";

type NetworkNode = SimulationNodeDatum & {
  id: string;
  type: NetworkNodeType;
  label: string;
  radius: number;
  researcherId?: string;
  openalexId?: string;
  title?: string;
  department?: string;
  faculty?: string;
  profileUrl?: string;
  sharedPapers?: number;
  latestYear?: number | null;
  institutions?: string[];
  paperTitles?: ResearcherNetworkConnection["paperTitles"];
  pathOrder?: number;
};

type NetworkLink = SimulationLinkDatum<NetworkNode> & {
  source: string | NetworkNode;
  target: string | NetworkNode;
  type: NetworkEdgeType;
  weight: number;
};

type GraphModel = {
  nodes: NetworkNode[];
  links: NetworkLink[];
};

type CanvasTransform = {
  x: number;
  y: number;
  scale: number;
};

type Palette = {
  background: string;
  grid: string;
  text: string;
  muted: string;
  focal: string;
  target: string;
  imperial: string;
  external: string;
  department: string;
  faculty: string;
  institution: string;
  selected: string;
};

const NETWORK_LIMITS = [30, 60, 100, 250, 500, 0] as const;
const CACHE_TTL_MS = 60_000;
type TimedCacheEntry<T> = { value: T; expiresAt: number };
const networkCache = new Map<string, TimedCacheEntry<ResearcherNetwork>>();
const connectionCache = new Map<string, TimedCacheEntry<ResearcherConnection>>();

function cachedValue<T>(cache: Map<string, TimedCacheEntry<T>>, key: string) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    cache.delete(key);
    return null;
  }
  return entry.value;
}

function slug(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "unknown";
}

function primaryInstitution(connection: ResearcherNetworkConnection) {
  return connection.institutions.find(name => !/imperial college/i.test(name))
    || connection.institutions[0]
    || "Institution not recorded";
}

function nodeColor(node: NetworkNode, palette: Palette) {
  return palette[node.type];
}

function nodeId(connection: ResearcherNetworkConnection) {
  return connection.isImperialProfile && connection.imperialResearcherId
    ? `researcher:${connection.imperialResearcherId}`
    : `author:${connection.openalexId}`;
}

function buildGraphModel(
  network: ResearcherNetwork | null,
  showImperial: boolean,
  showExternal: boolean,
  minimumSharedPapers: number,
): GraphModel {
  if (!network) return { nodes: [], links: [] };

  const nodes = new Map<string, NetworkNode>();
  const links: NetworkLink[] = [];
  const focalId = `researcher:${network.focal.researcherId}`;
  nodes.set(focalId, {
    id: focalId,
    type: "focal",
    label: network.focal.name,
    radius: 22,
    researcherId: network.focal.researcherId,
    openalexId: network.focal.openalexId,
    title: network.focal.title,
    department: network.focal.department,
    faculty: network.focal.faculty,
    profileUrl: network.focal.profileUrl,
  });

  const visibleConnections = network.connections.filter(connection => (
    connection.sharedPapers >= minimumSharedPapers
    && ((connection.isImperialProfile && showImperial) || (!connection.isImperialProfile && showExternal))
  ));

  for (const connection of visibleConnections) {
    const id = nodeId(connection);
    nodes.set(id, {
      id,
      type: connection.isImperialProfile ? "imperial" : "external",
      label: connection.name,
      radius: Math.min(17, 7 + Math.sqrt(Math.max(1, connection.sharedPapers)) * 1.7),
      researcherId: connection.imperialResearcherId || undefined,
      openalexId: connection.openalexId,
      title: connection.imperialTitle,
      department: connection.imperialDepartment,
      faculty: connection.imperialFaculty,
      profileUrl: connection.imperialProfileUrl || undefined,
      sharedPapers: connection.sharedPapers,
      latestYear: connection.latestYear,
      institutions: connection.institutions,
      paperTitles: connection.paperTitles,
    });
    links.push({ source: focalId, target: id, type: "coauthor", weight: connection.sharedPapers });

    if (connection.isImperialProfile) {
      const department = connection.imperialDepartment || "Department not recorded";
      const faculty = connection.imperialFaculty || "Faculty not recorded";
      const departmentId = `department:${slug(department)}`;
      const facultyId = `faculty:${slug(faculty)}`;
      if (!nodes.has(departmentId)) {
        nodes.set(departmentId, { id: departmentId, type: "department", label: department, radius: 14 });
      }
      if (!nodes.has(facultyId)) {
        nodes.set(facultyId, { id: facultyId, type: "faculty", label: faculty, radius: 18 });
      }
      links.push({ source: id, target: departmentId, type: "department", weight: 1 });
      if (!links.some(link => link.type === "faculty" && link.source === departmentId && link.target === facultyId)) {
        links.push({ source: departmentId, target: facultyId, type: "faculty", weight: 1 });
      }
    } else {
      const institution = primaryInstitution(connection);
      const institutionId = `institution:${slug(institution)}`;
      if (!nodes.has(institutionId)) {
        nodes.set(institutionId, { id: institutionId, type: "institution", label: institution, radius: 13 });
      }
      links.push({ source: id, target: institutionId, type: "institution", weight: 1 });
    }
  }

  const focalDepartment = network.focal.department || "Department not recorded";
  const focalFaculty = network.focal.faculty || "Faculty not recorded";
  const focalDepartmentId = `department:${slug(focalDepartment)}`;
  const focalFacultyId = `faculty:${slug(focalFaculty)}`;
  if (!nodes.has(focalDepartmentId)) {
    nodes.set(focalDepartmentId, { id: focalDepartmentId, type: "department", label: focalDepartment, radius: 14 });
  }
  if (!nodes.has(focalFacultyId)) {
    nodes.set(focalFacultyId, { id: focalFacultyId, type: "faculty", label: focalFaculty, radius: 18 });
  }
  links.push({ source: focalId, target: focalDepartmentId, type: "department", weight: 1 });
  if (!links.some(link => link.type === "faculty" && link.source === focalDepartmentId && link.target === focalFacultyId)) {
    links.push({ source: focalDepartmentId, target: focalFacultyId, type: "faculty", weight: 1 });
  }

  return { nodes: [...nodes.values()], links };
}

function buildConnectionGraphModel(connection: ResearcherConnection | null): GraphModel {
  if (!connection?.found || connection.paths.length === 0) return { nodes: [], links: [] };

  const connectionNodes = new Map(connection.nodes.map(node => [node.openalexId, node]));
  const nodes = new Map<string, NetworkNode>();
  const links = new Map<string, NetworkLink>();
  const primaryOrder = new Map(connection.paths[0].nodeIds.map((id, index) => [id, index]));
  const allEdges = connection.paths.flatMap(path => path.edges);

  for (const path of connection.paths) {
    for (const openalexId of path.nodeIds) {
      if (nodes.has(openalexId)) continue;
      const person = connectionNodes.get(openalexId);
      if (!person) continue;
      const adjacentEdges = allEdges.filter(edge => (
        edge.sourceOpenalexId === openalexId || edge.targetOpenalexId === openalexId
      ));
      const papers = new Map<string, ResearcherConnectionEdge["paperTitles"][number]>();
      for (const paper of adjacentEdges.flatMap(edge => edge.paperTitles)) {
        const key = paper.openalexWorkId || `${paper.title}:${paper.year || ""}`;
        if (!papers.has(key)) papers.set(key, paper);
      }
      const isSource = openalexId === connection.source.openalexId;
      const isTarget = openalexId === connection.target.openalexId;
      nodes.set(openalexId, {
        id: openalexId,
        type: isSource ? "focal" : isTarget ? "target" : person.isImperialProfile ? "imperial" : "external",
        label: person.name,
        radius: isSource || isTarget ? 22 : 15,
        researcherId: person.researcherId || undefined,
        openalexId,
        title: person.title,
        department: person.department,
        faculty: person.faculty,
        profileUrl: person.profileUrl || undefined,
        sharedPapers: adjacentEdges.reduce((sum, edge) => sum + edge.sharedPapers, 0),
        latestYear: Math.max(0, ...adjacentEdges.map(edge => Number(edge.latestYear || 0))) || null,
        institutions: person.institutions,
        paperTitles: [...papers.values()].slice(0, 10),
        pathOrder: primaryOrder.get(openalexId),
      });
    }

    for (const edge of path.edges) {
      const key = [edge.sourceOpenalexId, edge.targetOpenalexId].sort().join(":");
      const existing = links.get(key);
      if (!existing || edge.sharedPapers > existing.weight) {
        links.set(key, {
          source: edge.sourceOpenalexId,
          target: edge.targetOpenalexId,
          type: "coauthor",
          weight: edge.sharedPapers,
        });
      }
    }
  }

  return { nodes: [...nodes.values()], links: [...links.values()] };
}

function shortLabel(value: string, maxLength = 24) {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 1).trim()}...`;
}

function initials(value: string) {
  return value.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join("").toUpperCase();
}

function edgeNodeId(value: string | NetworkNode) {
  return typeof value === "string" ? value : value.id;
}

function nodeTypeLabel(type: NetworkNodeType) {
  if (type === "focal") return "First researcher";
  if (type === "target") return "Second researcher";
  if (type === "imperial") return "Imperial researcher";
  if (type === "external") return "External researcher";
  return type;
}

function paperUrl(paper: ResearcherNetworkConnection["paperTitles"][number]) {
  if (!paper.openalexWorkId) return "";
  const id = paper.openalexWorkId.replace(/^https?:\/\/openalex\.org\//i, "");
  return `https://openalex.org/${id}`;
}

function NetworkCanvas({
  model,
  selectedNode,
  onSelectNode,
}: {
  model: GraphModel;
  selectedNode: NetworkNode | null;
  onSelectNode: (node: NetworkNode | null) => void;
}) {
  const { resolvedTheme } = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const simulationRef = useRef<Simulation<NetworkNode, NetworkLink> | null>(null);
  const nodesRef = useRef<NetworkNode[]>([]);
  const linksRef = useRef<NetworkLink[]>([]);
  const transformRef = useRef<CanvasTransform>({ x: 0, y: 0, scale: 1 });
  const drawRef = useRef<() => void>(() => undefined);
  const fitViewRef = useRef<() => void>(() => undefined);
  const userAdjustedViewRef = useRef(false);
  const selectedIdRef = useRef<string | null>(selectedNode?.id || null);
  const hoveredIdRef = useRef<string | null>(null);
  const interactionRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    transform: CanvasTransform;
    node: NetworkNode | null;
    moved: boolean;
  } | null>(null);
  const [zoomPercent, setZoomPercent] = useState(100);
  const [hoveredNode, setHoveredNode] = useState<NetworkNode | null>(null);
  const [tooltip, setTooltip] = useState({ x: 0, y: 0 });

  const palette = useMemo<Palette>(() => resolvedTheme === "dark" ? {
    background: "#232333",
    grid: "rgba(212, 211, 227, 0.07)",
    text: "#f3f2f8",
    muted: "#a9a8b8",
    focal: "#00ff7f",
    target: "#ff8daa",
    imperial: "#8fdcff",
    external: "#d4d3e3",
    department: "#fcd360",
    faculty: "#faae94",
    institution: "#a98fb6",
    selected: "#ffffff",
  } : {
    background: "#faf9fd",
    grid: "rgba(63, 53, 92, 0.07)",
    text: "#221d2f",
    muted: "#746f7e",
    focal: "#7b68ee",
    target: "#d84b70",
    imperial: "#2878b5",
    external: "#7c8792",
    department: "#c58a00",
    faculty: "#c75d66",
    institution: "#8b67a5",
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
    const scale = transformRef.current.scale;
    let nearest: NetworkNode | null = null;
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (const node of nodesRef.current) {
      if (!Number.isFinite(node.x) || !Number.isFinite(node.y)) continue;
      const distance = Math.hypot(point.x - Number(node.x), point.y - Number(node.y));
      const hitRadius = node.radius + Math.max(4, 7 / scale);
      if (distance <= hitRadius && distance < nearestDistance) {
        nearest = node;
        nearestDistance = distance;
      }
    }
    return nearest;
  }, [graphPoint]);

  const resetView = useCallback(() => {
    userAdjustedViewRef.current = false;
    fitViewRef.current();
  }, []);

  const zoomBy = useCallback((factor: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const current = transformRef.current;
    const nextScale = Math.max(0.45, Math.min(3.2, current.scale * factor));
    const centreX = rect.width / 2;
    const centreY = rect.height / 2;
    const ratio = nextScale / current.scale;
    transformRef.current = {
      x: centreX - ratio * (centreX - current.x),
      y: centreY - ratio * (centreY - current.y),
      scale: nextScale,
    };
    userAdjustedViewRef.current = true;
    setZoomPercent(Math.round(nextScale * 100));
    drawRef.current();
  }, []);

  useEffect(() => {
    selectedIdRef.current = selectedNode?.id || null;
    drawRef.current();
  }, [selectedNode]);

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const nodes = model.nodes.map(node => ({ ...node }));
    const links = model.links.map(link => ({ ...link }));
    nodesRef.current = nodes;
    linksRef.current = links;
    const context = canvas.getContext("2d");
    if (!context) return;

    let width = 1;
    let height = 1;
    let dpr = window.devicePixelRatio || 1;
    let animationFrame = 0;

    const drawNode = (node: NetworkNode) => {
      const x = Number(node.x || 0);
      const y = Number(node.y || 0);
      const color = nodeColor(node, palette);
      const selected = selectedIdRef.current === node.id;
      const hovered = hoveredIdRef.current === node.id;

      context.save();
      if (selected || hovered) {
        context.globalAlpha = selected ? 0.95 : 0.7;
        context.strokeStyle = palette.selected;
        context.lineWidth = selected ? 2.2 : 1.4;
        context.beginPath();
        context.arc(x, y, node.radius + 5, 0, Math.PI * 2);
        context.stroke();
      }

      context.globalAlpha = node.type === "external" ? 0.82 : 0.96;
      context.fillStyle = color;
      context.strokeStyle = node.type === "external" ? palette.background : color;
      context.lineWidth = 1.5;

      if (node.type === "faculty") {
        context.beginPath();
        context.moveTo(x, y - node.radius);
        context.lineTo(x + node.radius, y);
        context.lineTo(x, y + node.radius);
        context.lineTo(x - node.radius, y);
        context.closePath();
        context.fill();
      } else if (node.type === "department") {
        const size = node.radius * 1.55;
        context.beginPath();
        context.roundRect(x - size / 2, y - size / 2, size, size, 4);
        context.fill();
      } else if (node.type === "institution") {
        context.beginPath();
        context.arc(x, y, node.radius, 0, Math.PI * 2);
        context.fill();
        context.globalAlpha = 0.45;
        context.strokeStyle = palette.selected;
        context.beginPath();
        context.arc(x, y, node.radius + 3, 0, Math.PI * 2);
        context.stroke();
      } else {
        context.beginPath();
        context.arc(x, y, node.radius, 0, Math.PI * 2);
        context.fill();
        context.stroke();
        context.globalAlpha = 0.96;
        context.fillStyle = node.type === "focal" || node.type === "target" ? palette.background : "#ffffff";
        context.font = `${node.type === "focal" || node.type === "target" ? 600 : 500} ${Math.max(8, node.radius * 0.58)}px "Imperial Sans Display", sans-serif`;
        context.textAlign = "center";
        context.textBaseline = "middle";
        context.fillText(initials(node.label), x, y + 0.5);
      }
      context.restore();
    };

    const drawLabels = () => {
      const strongestPeople = new Set(
        [...nodes]
          .filter(node => node.type === "imperial" || node.type === "external")
          .sort((a, b) => Number(b.sharedPapers || 0) - Number(a.sharedPapers || 0))
          .slice(0, 12)
          .map(node => node.id),
      );

      for (const node of nodes) {
        const alwaysShow = node.type === "focal" || node.type === "target" || node.type === "faculty" || node.type === "department" || node.pathOrder !== undefined;
        const active = selectedIdRef.current === node.id || hoveredIdRef.current === node.id;
        if (!alwaysShow && !active && !strongestPeople.has(node.id)) continue;
        const x = Number(node.x || 0);
        const y = Number(node.y || 0) + node.radius + 10;
        context.save();
        context.globalAlpha = active || node.type === "focal" || node.type === "target" ? 1 : 0.78;
        context.fillStyle = palette.text;
        context.font = `${node.type === "focal" || node.type === "target" ? 600 : 500} ${node.type === "focal" || node.type === "target" ? 12 : 10}px "Imperial Sans Display", sans-serif`;
        context.textAlign = "center";
        context.textBaseline = "middle";
        context.fillText(shortLabel(node.label, node.type === "faculty" ? 30 : 24), x, y);
        context.restore();
      }
    };

    const draw = () => {
      cancelAnimationFrame(animationFrame);
      animationFrame = requestAnimationFrame(() => {
        context.setTransform(dpr, 0, 0, dpr, 0, 0);
        context.clearRect(0, 0, width, height);
        context.fillStyle = palette.background;
        context.fillRect(0, 0, width, height);

        const transform = transformRef.current;
        context.save();
        context.translate(transform.x, transform.y);
        context.scale(transform.scale, transform.scale);

        const gridStep = 44;
        context.fillStyle = palette.grid;
        for (let x = -gridStep; x < width / transform.scale + gridStep; x += gridStep) {
          for (let y = -gridStep; y < height / transform.scale + gridStep; y += gridStep) {
            context.fillRect(x, y, 1.2, 1.2);
          }
        }

        context.lineCap = "round";
        for (const link of links) {
          const source = typeof link.source === "string" ? nodes.find(node => node.id === link.source) : link.source;
          const target = typeof link.target === "string" ? nodes.find(node => node.id === link.target) : link.target;
          if (!source || !target) continue;
          const connected = selectedIdRef.current
            && (source.id === selectedIdRef.current || target.id === selectedIdRef.current);
          context.globalAlpha = connected ? 0.82 : link.type === "coauthor" ? 0.28 : 0.18;
          context.strokeStyle = link.type === "coauthor"
            ? palette.imperial
            : link.type === "department"
              ? palette.department
              : link.type === "faculty"
                ? palette.faculty
                : palette.institution;
          context.lineWidth = link.type === "coauthor"
            ? Math.min(4, 0.65 + Math.sqrt(link.weight) * 0.42)
            : 0.8;
          context.beginPath();
          context.moveTo(Number(source.x || 0), Number(source.y || 0));
          context.lineTo(Number(target.x || 0), Number(target.y || 0));
          context.stroke();
        }

        for (const node of nodes) drawNode(node);
        drawLabels();
        context.restore();
      });
    };
    drawRef.current = draw;

    const fitView = () => {
      const positioned = nodes.filter(node => Number.isFinite(node.x) && Number.isFinite(node.y));
      if (positioned.length === 0) {
        transformRef.current = { x: 0, y: 0, scale: 1 };
        setZoomPercent(100);
        draw();
        return;
      }
      const padding = Math.min(72, Math.max(28, Math.min(width, height) * 0.08));
      const minX = Math.min(...positioned.map(node => Number(node.x) - node.radius - 12));
      const maxX = Math.max(...positioned.map(node => Number(node.x) + node.radius + 12));
      const minY = Math.min(...positioned.map(node => Number(node.y) - node.radius - 22));
      const maxY = Math.max(...positioned.map(node => Number(node.y) + node.radius + 22));
      const graphWidth = Math.max(1, maxX - minX);
      const graphHeight = Math.max(1, maxY - minY);
      const nextScale = Math.max(0.45, Math.min(1.15, Math.min(
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
      context.setTransform(dpr, 0, 0, dpr, 0, 0);

      nodes.forEach((node, index) => {
        if (Number.isFinite(node.x) && Number.isFinite(node.y)) return;
        const angle = (index / Math.max(1, nodes.length)) * Math.PI * 2;
        const radius = 40 + (index % 7) * 18;
        node.x = width / 2 + Math.cos(angle) * radius;
        node.y = height / 2 + Math.sin(angle) * radius;
      });
      const focal = nodes.find(node => node.type === "focal");
      if (focal) {
        focal.fx = width / 2;
        focal.fy = height / 2;
      }
      simulationRef.current?.force("center", forceCenter(width / 2, height / 2));
      simulationRef.current?.alpha(0.35).restart();
      if (!userAdjustedViewRef.current) fitView();
      else draw();
    };

    simulationRef.current?.stop();
    const simulation = forceSimulation<NetworkNode, NetworkLink>(nodes)
      .alpha(0.95)
      .alphaDecay(0.042)
      .velocityDecay(0.4)
      .force("link", forceLink<NetworkNode, NetworkLink>(links)
        .id(node => node.id)
        .distance(link => link.type === "coauthor" ? Math.max(72, 145 - Math.sqrt(link.weight) * 13) : 58)
        .strength(link => link.type === "coauthor" ? 0.22 : 0.12))
      .force("charge", forceManyBody<NetworkNode>().strength(node => (
        node.type === "focal" || node.type === "target" ? -620
          : node.type === "faculty" ? -360
            : node.type === "department" || node.type === "institution" ? -210
              : -88
      )))
      .force("collide", forceCollide<NetworkNode>().radius(node => node.radius + 8).iterations(2))
      .force("center", forceCenter(1, 1))
      .on("tick", draw)
      .on("end", () => {
        if (!userAdjustedViewRef.current) fitView();
        else draw();
      });
    simulationRef.current = simulation;

    const observer = new ResizeObserver(resize);
    observer.observe(container);
    resize();

    return () => {
      observer.disconnect();
      simulation.stop();
      cancelAnimationFrame(animationFrame);
      if (simulationRef.current === simulation) simulationRef.current = null;
      if (fitViewRef.current === fitView) fitViewRef.current = () => undefined;
    };
  }, [model, palette]);

  const handleWheel = (event: React.WheelEvent<HTMLCanvasElement>) => {
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const current = transformRef.current;
    const factor = Math.exp(-Math.max(-100, Math.min(100, event.deltaY)) * 0.0022);
    const nextScale = Math.max(0.45, Math.min(3.2, current.scale * factor));
    const pointerX = event.clientX - rect.left;
    const pointerY = event.clientY - rect.top;
    const ratio = nextScale / current.scale;
    transformRef.current = {
      x: pointerX - ratio * (pointerX - current.x),
      y: pointerY - ratio * (pointerY - current.y),
      scale: nextScale,
    };
    userAdjustedViewRef.current = true;
    setZoomPercent(Math.round(nextScale * 100));
    drawRef.current();
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const node = findNode(event.clientX, event.clientY);
    userAdjustedViewRef.current = true;
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
      simulationRef.current?.alphaTarget(0.18).restart();
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
      if (interaction.node.type !== "focal") {
        interaction.node.fx = null;
        interaction.node.fy = null;
      }
      simulationRef.current?.alphaTarget(0);
      if (!interaction.moved) onSelectNode(interaction.node);
    } else if (interaction && !interaction.moved) {
      onSelectNode(null);
    }
    interactionRef.current = null;
  };

  return (
    <div ref={containerRef} className="relative h-full min-h-[360px] w-full overflow-hidden bg-background">
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
        aria-label="Researcher collaboration network"
      />

      <div className="absolute right-3 top-3 flex items-center gap-1 rounded-md border border-border bg-card/90 p-1 shadow-sm backdrop-blur-sm">
        <button onClick={() => zoomBy(1.18)} className="flex h-9 w-9 items-center justify-center rounded-md hover:bg-secondary" aria-label="Zoom in" title="Zoom in">
          <ZoomIn className="h-4 w-4 text-muted-foreground" />
        </button>
        <button onClick={() => zoomBy(1 / 1.18)} className="flex h-9 w-9 items-center justify-center rounded-md hover:bg-secondary" aria-label="Zoom out" title="Zoom out">
          <ZoomOut className="h-4 w-4 text-muted-foreground" />
        </button>
        <button onClick={resetView} className="flex h-9 w-9 items-center justify-center rounded-md hover:bg-secondary" aria-label="Re-frame graph" title="Re-frame graph">
          <Maximize2 className="h-4 w-4 text-muted-foreground" />
        </button>
        <span className="min-w-10 px-1 text-center text-[10px] font-medium text-muted-foreground">{zoomPercent}%</span>
      </div>

      {hoveredNode && (
        <div
          className="pointer-events-none absolute z-20 max-w-[240px] rounded-md border border-border bg-popover px-3 py-2 shadow-lg"
          style={{ left: Math.min(tooltip.x, Math.max(8, (containerRef.current?.clientWidth || 280) - 250)), top: tooltip.y }}
        >
          <p className="text-xs font-semibold text-popover-foreground">{hoveredNode.label}</p>
          <p className="mt-0.5 text-[10px] text-muted-foreground">{nodeTypeLabel(hoveredNode.type)}</p>
          {hoveredNode.sharedPapers ? <p className="mt-1 text-[10px] text-muted-foreground">{hoveredNode.sharedPapers} shared papers</p> : null}
        </div>
      )}
    </div>
  );
}

function NetworkNodePanel({
  node,
  model,
  onClose,
  onOpenProfile,
}: {
  node: NetworkNode;
  model: GraphModel;
  onClose: () => void;
  onOpenProfile?: (suggestion: ResearcherSuggestion) => void;
}) {
  const relatedPeople = useMemo(() => {
    const relatedIds = new Set<string>();
    for (const link of model.links) {
      const source = edgeNodeId(link.source);
      const target = edgeNodeId(link.target);
      if (source === node.id) relatedIds.add(target);
      if (target === node.id) relatedIds.add(source);
    }
    return model.nodes.filter(candidate => relatedIds.has(candidate.id) && ["focal", "target", "imperial", "external"].includes(candidate.type));
  }, [model, node.id]);
  const canOpenProfile = Boolean(node.researcherId && (node.type === "focal" || node.type === "target" || node.type === "imperial"));

  return (
    <aside className="absolute inset-x-0 bottom-0 z-30 max-h-[72%] overflow-y-auto rounded-t-lg border-t border-border bg-card shadow-xl sm:inset-y-0 sm:left-auto sm:right-0 sm:w-[350px] sm:rounded-none sm:border-l sm:border-t-0">
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-primary">{nodeTypeLabel(node.type)}</span>
            <h2 className="mt-1 text-lg font-semibold leading-tight text-foreground">{node.label}</h2>
            {node.title && <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{node.title}</p>}
          </div>
          <button onClick={onClose} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md hover:bg-secondary" aria-label="Close details">
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        {(node.department || node.faculty) && (
          <div className="mt-4 space-y-1 rounded-md border border-border bg-background px-3 py-2 text-xs text-muted-foreground">
            {node.department && <p><span className="font-medium text-foreground">Department:</span> {node.department}</p>}
            {node.faculty && <p><span className="font-medium text-foreground">Faculty:</span> {node.faculty}</p>}
          </div>
        )}

        {node.sharedPapers !== undefined && (
          <div className="mt-4 grid grid-cols-2 gap-2">
            <div className="rounded-md border border-border bg-background px-3 py-2">
              <p className="text-[10px] text-muted-foreground">Shared papers</p>
              <p className="mt-0.5 text-xl font-semibold text-foreground">{node.sharedPapers}</p>
            </div>
            <div className="rounded-md border border-border bg-background px-3 py-2">
              <p className="text-[10px] text-muted-foreground">Latest paper</p>
              <p className="mt-0.5 text-xl font-semibold text-foreground">{node.latestYear || "-"}</p>
            </div>
          </div>
        )}

        {node.institutions && node.institutions.length > 0 && (
          <div className="mt-4">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Institutions recorded</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {node.institutions.map(institution => (
                <span key={institution} className="rounded-full bg-secondary px-2 py-1 text-[10px] text-muted-foreground">{institution}</span>
              ))}
            </div>
          </div>
        )}

        {node.paperTitles && node.paperTitles.length > 0 && (
          <div className="mt-4">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Shared publication evidence</p>
            <div className="mt-2 divide-y divide-border rounded-md border border-border bg-background">
              {node.paperTitles.map((paper, index) => {
                const url = paperUrl(paper);
                return (
                  <div key={`${paper.title}-${index}`} className="px-3 py-2.5">
                    {url ? (
                      <a href={url} target="_blank" rel="noreferrer" className="group flex items-start justify-between gap-2 text-xs font-medium leading-relaxed text-foreground hover:text-primary">
                        <span>{paper.title}</span>
                        <ExternalLink className="mt-0.5 h-3 w-3 shrink-0" />
                      </a>
                    ) : (
                      <p className="text-xs font-medium leading-relaxed text-foreground">{paper.title}</p>
                    )}
                    {paper.year && <p className="mt-1 text-[10px] text-muted-foreground">{paper.year}</p>}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {relatedPeople.length > 0 && !["focal", "target", "imperial", "external"].includes(node.type) && (
          <div className="mt-4">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Connected researchers</p>
            <div className="mt-2 space-y-1.5">
              {relatedPeople.slice(0, 12).map(person => (
                <div key={person.id} className="rounded-md border border-border bg-background px-3 py-2">
                  <p className="text-xs font-medium text-foreground">{person.label}</p>
                  {person.title && <p className="mt-0.5 truncate text-[10px] text-muted-foreground">{person.title}</p>}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-4">
          {canOpenProfile && onOpenProfile && (
            <button
              onClick={() => onOpenProfile({
                researcherId: node.researcherId!,
                openalexId: node.openalexId,
                profileUrl: node.profileUrl,
                name: node.label,
                title: node.title || "Imperial researcher",
                department: node.department || "",
                faculty: node.faculty || "Imperial College London",
                score: 1,
              })}
              className="inline-flex min-h-10 items-center gap-2 rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90"
            >
              <UserRound className="h-3.5 w-3.5" />
              Open researcher profile
            </button>
          )}
          {node.openalexId && (
            <a
              href={`https://openalex.org/authors/${node.openalexId}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-10 items-center gap-2 rounded-md border border-border px-3 py-2 text-xs font-medium text-foreground hover:bg-secondary"
            >
              OpenAlex
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
        </div>
      </div>
    </aside>
  );
}

export default function ResearcherNetworkGraph({
  onOpenProfile,
  focalResearcher,
}: {
  onOpenProfile?: (suggestion: ResearcherSuggestion) => void;
  focalResearcher?: ResearcherSuggestion | null;
}) {
  const requestIdRef = useRef(0);
  const connectionRequestIdRef = useRef(0);
  const [query, setQuery] = useState(focalResearcher?.name || "");
  const [suggestions, setSuggestions] = useState<ResearcherSuggestion[]>([]);
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [selectedResearcher, setSelectedResearcher] = useState<ResearcherSuggestion | null>(focalResearcher || null);
  const [network, setNetwork] = useState<ResearcherNetwork | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [networkLimit, setNetworkLimit] = useState<(typeof NETWORK_LIMITS)[number]>(() => (
    window.matchMedia("(max-width: 767px)").matches ? 30 : 60
  ));
  const [showImperial, setShowImperial] = useState(true);
  const [showExternal, setShowExternal] = useState(true);
  const [minimumSharedPapers, setMinimumSharedPapers] = useState(1);
  const [selectedNode, setSelectedNode] = useState<NetworkNode | null>(null);
  const [targetQuery, setTargetQuery] = useState("");
  const [targetSuggestions, setTargetSuggestions] = useState<ResearcherSuggestion[]>([]);
  const [isTargetSuggesting, setIsTargetSuggesting] = useState(false);
  const [selectedTarget, setSelectedTarget] = useState<ResearcherSuggestion | null>(null);
  const [connection, setConnection] = useState<ResearcherConnection | null>(null);
  const [isLoadingConnection, setIsLoadingConnection] = useState(false);
  const [connectionError, setConnectionError] = useState("");

  useEffect(() => {
    if (!focalResearcher || selectedResearcher?.researcherId === focalResearcher.researcherId) return;

    connectionRequestIdRef.current += 1;
    setSelectedResearcher(focalResearcher);
    setQuery(focalResearcher.name);
    setSuggestions([]);
    setTargetQuery("");
    setTargetSuggestions([]);
    setSelectedTarget(null);
    setConnection(null);
    setConnectionError("");
    setIsLoadingConnection(false);
  }, [focalResearcher, selectedResearcher?.researcherId]);

  const loadNetwork = useCallback(async (researcher: ResearcherSuggestion, limit: number) => {
    const requestId = ++requestIdRef.current;
    const cacheKey = `${researcher.researcherId}:${limit}`;
    setIsLoading(true);
    setError("");
    setSelectedNode(null);
    try {
      const cached = cachedValue(networkCache, cacheKey);
      const result = cached || await getResearcherNetwork(researcher.researcherId, limit);
      if (requestId !== requestIdRef.current) return;
      if (!cached) networkCache.set(cacheKey, { value: result, expiresAt: Date.now() + CACHE_TTL_MS });
      setNetwork(result);
      setMinimumSharedPapers(1);
    } catch (loadError) {
      if (requestId !== requestIdRef.current) return;
      setNetwork(null);
      setError(loadError instanceof Error ? loadError.message : "Could not load this collaboration network.");
    } finally {
      if (requestId === requestIdRef.current) setIsLoading(false);
    }
  }, []);

  const loadConnection = useCallback(async (
    source: ResearcherSuggestion,
    target: ResearcherSuggestion,
  ) => {
    const requestId = ++connectionRequestIdRef.current;
    const cacheKey = `${source.researcherId}:${target.researcherId}:3`;
    setIsLoadingConnection(true);
    setConnectionError("");
    setSelectedNode(null);
    try {
      const cached = cachedValue(connectionCache, cacheKey);
      const result = cached || await getResearcherConnection(source.researcherId, target.researcherId, 3);
      if (requestId !== connectionRequestIdRef.current) return;
      if (!cached) connectionCache.set(cacheKey, { value: result, expiresAt: Date.now() + CACHE_TTL_MS });
      setConnection(result);
    } catch (loadError) {
      if (requestId !== connectionRequestIdRef.current) return;
      setConnection(null);
      setConnectionError(loadError instanceof Error ? loadError.message : "Could not trace a connection between these researchers.");
    } finally {
      if (requestId === connectionRequestIdRef.current) setIsLoadingConnection(false);
    }
  }, []);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2 || (selectedResearcher && trimmed.toLowerCase() === selectedResearcher.name.toLowerCase())) {
      setSuggestions([]);
      setIsSuggesting(false);
      return;
    }
    let cancelled = false;
    setIsSuggesting(true);
    const timer = window.setTimeout(() => {
      suggestResearchers(trimmed)
        .then(rows => {
          if (!cancelled) setSuggestions(rows.slice(0, 8));
        })
        .catch(() => {
          if (!cancelled) setSuggestions([]);
        })
        .finally(() => {
          if (!cancelled) setIsSuggesting(false);
        });
    }, 180);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query, selectedResearcher]);

  useEffect(() => {
    const trimmed = targetQuery.trim();
    if (
      !selectedResearcher
      || trimmed.length < 2
      || (selectedTarget && trimmed.toLowerCase() === selectedTarget.name.toLowerCase())
    ) {
      setTargetSuggestions([]);
      setIsTargetSuggesting(false);
      return;
    }
    let cancelled = false;
    setIsTargetSuggesting(true);
    const timer = window.setTimeout(() => {
      suggestResearchers(trimmed)
        .then(rows => {
          if (!cancelled) {
            setTargetSuggestions(rows
              .filter(row => row.researcherId !== selectedResearcher.researcherId)
              .slice(0, 8));
          }
        })
        .catch(() => {
          if (!cancelled) setTargetSuggestions([]);
        })
        .finally(() => {
          if (!cancelled) setIsTargetSuggesting(false);
        });
    }, 180);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [selectedResearcher, selectedTarget, targetQuery]);

  useEffect(() => {
    if (selectedResearcher) loadNetwork(selectedResearcher, networkLimit);
  }, [loadNetwork, networkLimit, selectedResearcher]);

  useEffect(() => {
    if (selectedResearcher && selectedTarget) loadConnection(selectedResearcher, selectedTarget);
  }, [loadConnection, selectedResearcher, selectedTarget]);

  const neighbourhoodModel = useMemo(
    () => buildGraphModel(network, showImperial, showExternal, minimumSharedPapers),
    [minimumSharedPapers, network, showExternal, showImperial],
  );
  const connectionModel = useMemo(() => buildConnectionGraphModel(connection), [connection]);
  const model = selectedTarget ? connectionModel : neighbourhoodModel;
  const maxSharedPapers = Math.max(1, ...((network?.connections || []).map(connection => connection.sharedPapers)));
  const visiblePeople = neighbourhoodModel.nodes.filter(node => node.type === "imperial" || node.type === "external").length;
  const coauthorLinks = model.links.filter(link => link.type === "coauthor").length;
  const connectionNodeById = useMemo(
    () => new Map((connection?.nodes || []).map(node => [node.openalexId, node])),
    [connection],
  );
  const primaryConnectionPath = connection?.paths[0] || null;

  const selectResearcher = (suggestion: ResearcherSuggestion) => {
    connectionRequestIdRef.current += 1;
    setSelectedResearcher(suggestion);
    setQuery(suggestion.name);
    setSuggestions([]);
    setTargetQuery("");
    setTargetSuggestions([]);
    setSelectedTarget(null);
    setConnection(null);
    setConnectionError("");
    setIsLoadingConnection(false);
  };

  const selectTargetResearcher = (suggestion: ResearcherSuggestion) => {
    setSelectedTarget(suggestion);
    setTargetQuery(suggestion.name);
    setTargetSuggestions([]);
    setConnection(null);
    setConnectionError("");
  };

  const clearConnection = () => {
    connectionRequestIdRef.current += 1;
    setTargetQuery("");
    setTargetSuggestions([]);
    setSelectedTarget(null);
    setConnection(null);
    setConnectionError("");
    setIsLoadingConnection(false);
    setSelectedNode(null);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background lg:flex-row">
      <aside className="max-h-[44dvh] w-full shrink-0 overflow-y-auto border-b border-border bg-card lg:max-h-none lg:w-[350px] lg:border-b-0 lg:border-r">
        <div className="space-y-5 p-4 sm:p-5">
          <div>
            <div className="flex items-center gap-2">
              <Network className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-semibold text-foreground">Collaboration Network</h2>
            </div>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Explore one researcher's network, or choose a second person to trace a co-authorship path between them.
            </p>
          </div>

          {!focalResearcher && (
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
              <input
                value={query}
                onChange={event => {
                  setQuery(event.target.value);
                  if (selectedResearcher && event.target.value !== selectedResearcher.name) {
                    setSelectedResearcher(null);
                    clearConnection();
                  }
                }}
                placeholder="Type a researcher name..."
                className="h-11 w-full rounded-lg border border-border bg-background pl-9 pr-9 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
              {isSuggesting && <Loader2 className="absolute right-3 top-3.5 h-4 w-4 animate-spin text-primary" />}
              {suggestions.length > 0 && (
                <div className="absolute left-0 right-0 top-full z-40 mt-1 max-h-72 overflow-y-auto rounded-lg border border-border bg-popover p-1 shadow-xl">
                  {suggestions.map(suggestion => (
                    <button
                      key={suggestion.researcherId}
                      type="button"
                      onClick={() => selectResearcher(suggestion)}
                      className="w-full rounded-md px-3 py-2.5 text-left hover:bg-secondary"
                    >
                      <p className="text-sm font-semibold text-foreground">{suggestion.name}</p>
                      <p className="mt-0.5 line-clamp-1 text-[11px] text-muted-foreground">{suggestion.title}</p>
                      <p className="mt-0.5 break-words text-[10px] leading-snug text-muted-foreground">{suggestion.department}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {network && (
            <>
              <section className="border-y border-border py-4">
                <p className="text-base font-semibold text-foreground">{network.focal.name}</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{network.focal.title}</p>
                <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{network.focal.department} · {network.focal.faculty}</p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <div className="rounded-md bg-secondary px-3 py-2">
                    <p className="text-[10px] text-muted-foreground">All co-authors</p>
                    <p className="mt-0.5 text-lg font-semibold text-foreground">{network.counts.totalCoauthors.toLocaleString()}</p>
                  </div>
                  <div className="rounded-md bg-secondary px-3 py-2">
                    <p className="text-[10px] text-muted-foreground">Shown now</p>
                    <p className="mt-0.5 text-lg font-semibold text-foreground">{visiblePeople.toLocaleString()}</p>
                  </div>
                </div>
                <p className="mt-2 text-[10px] text-muted-foreground">Data loaded in {network.durationMs.toLocaleString()} ms</p>
              </section>

              <section className="rounded-lg border border-primary/20 bg-primary/5 p-3.5">
                <div className="flex items-center gap-2">
                  <Route className="h-4 w-4 text-primary" />
                  <p className="text-xs font-semibold text-foreground">Find a connection</p>
                </div>
                <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                  Choose a second researcher to trace genuine co-authorship links up to three degrees.
                </p>

                <div className="relative mt-3">
                  <Search className="pointer-events-none absolute left-3 top-3 h-3.5 w-3.5 text-muted-foreground" />
                  <input
                    value={targetQuery}
                    onChange={event => {
                      const value = event.target.value;
                      setTargetQuery(value);
                      if (selectedTarget && value !== selectedTarget.name) {
                        connectionRequestIdRef.current += 1;
                        setSelectedTarget(null);
                        setConnection(null);
                        setConnectionError("");
                        setIsLoadingConnection(false);
                      }
                    }}
                    placeholder="Search a second researcher..."
                    className="h-10 w-full rounded-md border border-border bg-background pl-9 pr-9 text-xs text-foreground outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20"
                  />
                  {isTargetSuggesting && <Loader2 className="absolute right-3 top-3 h-3.5 w-3.5 animate-spin text-primary" />}
                  {targetSuggestions.length > 0 && (
                    <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-64 overflow-y-auto rounded-lg border border-border bg-popover p-1 shadow-xl">
                      {targetSuggestions.map(suggestion => (
                        <button
                          key={suggestion.researcherId}
                          type="button"
                          onClick={() => selectTargetResearcher(suggestion)}
                          className="w-full rounded-md px-3 py-2.5 text-left hover:bg-secondary"
                        >
                          <p className="text-xs font-semibold text-foreground">{suggestion.name}</p>
                          <p className="mt-0.5 line-clamp-1 text-[10px] text-muted-foreground">{suggestion.title}</p>
                          <p className="mt-0.5 break-words text-[10px] leading-snug text-muted-foreground">{suggestion.department}</p>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {isLoadingConnection && (
                  <div className="mt-3 flex items-center gap-2 text-[11px] text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                    Tracing the strongest path...
                  </div>
                )}

                {connectionError && <p className="mt-3 text-[11px] leading-relaxed text-destructive">{connectionError}</p>}

                {selectedTarget && connection && !isLoadingConnection && (
                  <div className="mt-3 space-y-3">
                    {connection.found && primaryConnectionPath ? (
                      <>
                        <div className="flex items-center justify-between gap-2">
                          <span className="rounded-full bg-primary px-2.5 py-1 text-[10px] font-semibold text-primary-foreground">
                            {connection.degree === 1 ? "Direct co-author" : `${connection.degree} degrees`}
                          </span>
                          <span className="text-[10px] text-muted-foreground">
                            {connection.paths.length} {connection.paths.length === 1 ? "route" : "routes"}
                          </span>
                        </div>
                        <div className="rounded-md border border-border bg-background px-3 py-2.5">
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Strongest route</p>
                          <div className="mt-2 flex flex-wrap items-center gap-1.5">
                            {primaryConnectionPath.nodeIds.map((openalexId, index) => (
                              <span key={openalexId} className="contents">
                                {index > 0 && <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />}
                                <span className="rounded-md bg-secondary px-2 py-1 text-[10px] font-medium text-foreground">
                                  {connectionNodeById.get(openalexId)?.name || "Researcher"}
                                </span>
                              </span>
                            ))}
                          </div>
                        </div>
                        {connection.paths.length > 1 && (
                          <div className="space-y-1.5">
                            {connection.paths.slice(1).map((path, index) => (
                              <div key={path.id} className="rounded-md bg-background px-2.5 py-2 text-[10px] text-muted-foreground">
                                Alternative {index + 1}: {path.nodeIds.map(id => connectionNodeById.get(id)?.name || "Researcher").join(" → ")}
                              </div>
                            ))}
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="rounded-md border border-border bg-background p-3">
                        <p className="text-xs font-semibold text-foreground">No known path within three degrees</p>
                        <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">This does not mean that no wider relationship exists.</p>
                      </div>
                    )}
                    <p className="text-[10px] leading-relaxed text-muted-foreground">{connection.coverageNote}</p>
                    <div className="flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={clearConnection}
                        className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1.5 text-[10px] font-medium text-foreground hover:bg-secondary"
                      >
                        <ArrowLeft className="h-3 w-3" />
                        Back to neighbourhood
                      </button>
                      <span className="text-[10px] text-muted-foreground">{connection.durationMs.toLocaleString()} ms</span>
                    </div>
                  </div>
                )}
              </section>

              {!selectedTarget ? (
                <>

              <section>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Network size</p>
                <div className="mt-2 grid grid-cols-3 gap-1 rounded-lg bg-secondary p-1">
                  {NETWORK_LIMITS.map(limit => (
                    <button
                      key={limit}
                      type="button"
                      onClick={() => setNetworkLimit(limit)}
                      title={limit === 0 ? "Show every stored co-author; large networks can take longer" : `Show up to ${limit} co-authors`}
                      className={`min-h-9 rounded-md text-xs font-medium transition-colors ${networkLimit === limit ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                    >
                      {limit === 0 ? "All" : limit}
                    </button>
                  ))}
                </div>
              </section>

              <section className="space-y-3">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">People shown</p>
                <label className="flex cursor-pointer items-center justify-between gap-3 text-xs text-foreground">
                  <span className="flex items-center gap-2"><UsersRound className="h-3.5 w-3.5 text-[hsl(var(--publication-engineering))]" />Imperial co-authors</span>
                  <input type="checkbox" checked={showImperial} onChange={event => setShowImperial(event.target.checked)} className="h-4 w-4 accent-primary" />
                </label>
                <label className="flex cursor-pointer items-center justify-between gap-3 text-xs text-foreground">
                  <span className="flex items-center gap-2"><UserRound className="h-3.5 w-3.5 text-muted-foreground" />Other institutions</span>
                  <input type="checkbox" checked={showExternal} onChange={event => setShowExternal(event.target.checked)} className="h-4 w-4 accent-primary" />
                </label>
              </section>

              <section>
                <div className="flex items-center justify-between gap-3">
                  <label htmlFor="minimum-shared-papers" className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Minimum shared papers</label>
                  <span className="text-xs font-semibold text-foreground">{minimumSharedPapers}</span>
                </div>
                <input
                  id="minimum-shared-papers"
                  type="range"
                  min={1}
                  max={Math.min(12, maxSharedPapers)}
                  step={1}
                  value={Math.min(minimumSharedPapers, Math.min(12, maxSharedPapers))}
                  onChange={event => setMinimumSharedPapers(Number(event.target.value))}
                  className="mt-2 w-full accent-primary"
                />
              </section>

              <section className="space-y-2 border-t border-border pt-4 text-[11px] text-muted-foreground">
                <p className="flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-primary" />Selected researcher</p>
                <p className="flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-[hsl(var(--publication-engineering))]" />Imperial co-author</p>
                <p className="flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-muted-foreground" />External co-author</p>
                <p className="flex items-center gap-2"><Building2 className="h-3.5 w-3.5 text-[hsl(var(--publication-energy))]" />Department</p>
                <p className="flex items-center gap-2"><GraduationCap className="h-3.5 w-3.5 text-[hsl(var(--publication-health))]" />Faculty</p>
                <p className="flex items-center gap-2"><Landmark className="h-3.5 w-3.5 text-[hsl(var(--publication-policy))]" />Other institution</p>
              </section>
                </>
              ) : (
                <section className="space-y-2 border-t border-border pt-4 text-[11px] text-muted-foreground">
                  <p className="flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-primary" />First researcher</p>
                  <p className="flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-[#ff8daa]" />Second researcher</p>
                  <p className="flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-[hsl(var(--publication-engineering))]" />Imperial intermediary</p>
                  <p className="flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-muted-foreground" />External intermediary</p>
                  <p className="pt-1 text-[10px] leading-relaxed">Every line is supported by one or more shared publications.</p>
                </section>
              )}
            </>
          )}
        </div>
      </aside>

      <main className="relative min-h-0 flex-1 overflow-hidden">
        {selectedTarget ? (
          isLoadingConnection ? (
            <div className="flex h-full min-h-[360px] items-center justify-center bg-background">
              <div className="max-w-sm rounded-lg border border-border bg-card px-5 py-4 text-center shadow-sm">
                <Loader2 className="mx-auto h-5 w-5 animate-spin text-primary" />
                <p className="mt-3 text-sm font-medium text-foreground">Tracing the co-authorship path</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Checking direct links, shared co-authors, and third-degree bridges.</p>
              </div>
            </div>
          ) : connectionError ? (
            <div className="flex h-full min-h-[360px] items-center justify-center p-4">
              <div className="max-w-md rounded-lg border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">{connectionError}</div>
            </div>
          ) : connection?.found ? (
            <>
              <NetworkCanvas model={model} selectedNode={selectedNode} onSelectNode={setSelectedNode} />
              <div className="pointer-events-none absolute bottom-3 left-3 rounded-md border border-border bg-card/88 px-3 py-2 text-[10px] text-muted-foreground shadow-sm backdrop-blur-sm">
                {connection.degree === 1 ? "Direct co-author" : `${connection.degree} degrees`} · {connection.paths.length} {connection.paths.length === 1 ? "route" : "routes"} · {model.nodes.length} people
              </div>
              {selectedNode && (
                <NetworkNodePanel
                  node={selectedNode}
                  model={model}
                  onClose={() => setSelectedNode(null)}
                  onOpenProfile={onOpenProfile}
                />
              )}
            </>
          ) : connection ? (
            <div className="relative flex h-full min-h-[360px] items-center justify-center overflow-hidden bg-background p-6 text-center">
              <div className="absolute inset-0 opacity-50" style={{ backgroundImage: "radial-gradient(hsl(var(--border)) 1px, transparent 1px)", backgroundSize: "34px 34px" }} />
              <div className="relative max-w-md">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-border bg-card">
                  <Route className="h-7 w-7 text-muted-foreground" />
                </div>
                <p className="mt-4 text-base font-semibold text-foreground">No known path within three degrees</p>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">ITMAP did not find a supported co-authorship route between {connection.source.name} and {connection.target.name}. This does not rule out a wider relationship.</p>
                <button
                  type="button"
                  onClick={clearConnection}
                  className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-xs font-medium text-foreground hover:bg-secondary"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Back to neighbourhood
                </button>
              </div>
            </div>
          ) : null
        ) : isLoading ? (
          <div className="flex h-full min-h-[360px] items-center justify-center bg-background">
            <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 text-sm text-muted-foreground shadow-sm">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              Loading immediate connections...
            </div>
          </div>
        ) : error ? (
          <div className="flex h-full min-h-[360px] items-center justify-center p-4">
            <div className="max-w-md rounded-lg border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">{error}</div>
          </div>
        ) : network ? (
          <>
            <NetworkCanvas model={model} selectedNode={selectedNode} onSelectNode={setSelectedNode} />
            <div className="pointer-events-none absolute bottom-3 left-3 rounded-md border border-border bg-card/88 px-3 py-2 text-[10px] text-muted-foreground shadow-sm backdrop-blur-sm">
              {visiblePeople} people · {coauthorLinks} co-author links · {model.nodes.length} total nodes
            </div>
            {selectedNode && (
              <NetworkNodePanel
                node={selectedNode}
                model={model}
                onClose={() => setSelectedNode(null)}
                onOpenProfile={onOpenProfile}
              />
            )}
          </>
        ) : (
          <div className="relative flex h-full min-h-[360px] items-center justify-center overflow-hidden bg-background p-6 text-center">
            <div className="absolute inset-0 opacity-50" style={{ backgroundImage: "radial-gradient(hsl(var(--border)) 1px, transparent 1px)", backgroundSize: "34px 34px" }} />
            <div className="relative max-w-sm">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-primary/20 bg-primary/10">
                <Network className="h-7 w-7 text-primary" />
              </div>
              <p className="mt-4 text-base font-semibold text-foreground">Choose a researcher to open the network</p>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">ITMAP will load only their immediate collaboration neighbourhood, keeping even very large careers responsive.</p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
