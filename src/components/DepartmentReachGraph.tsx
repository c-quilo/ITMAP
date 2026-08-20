import { useMemo, useState } from "react";
import { ArrowRight, Building2, ExternalLink, Network, X } from "lucide-react";
import { useTheme } from "next-themes";
import type {
  OrganizationDepartmentConnection,
  OrganizationDepartmentReach,
} from "@/lib/researcherSearch";

type PositionedDepartment = OrganizationDepartmentConnection & {
  x: number;
  y: number;
  radius: number;
  color: string;
  labelRank: number;
};

const DEPARTMENT_LIMITS = [12, 24, 40, 0] as const;
const FACULTY_COLORS_LIGHT = ["#2878b5", "#00856f", "#c65d45", "#b27a00", "#9b4f8c", "#587585", "#7b68ee"];
const FACULTY_COLORS_DARK = ["#65c8ff", "#73e6dc", "#ff8daa", "#fbc15d", "#c7a6ff", "#ff9e72", "#00ff7f"];

function splitLabel(value: string, maxLineLength = 24) {
  const words = value.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (current && next.length > maxLineLength) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  if (lines.length <= 2) return lines;
  return [lines[0], `${lines[1].slice(0, Math.max(1, maxLineLength - 3)).trim()}...`];
}

function openAlexWorkUrl(value?: string) {
  if (!value) return "";
  const key = value.split("/").filter(Boolean).pop();
  return key ? `https://openalex.org/${key}` : "";
}

function buildPositions(
  connections: OrganizationDepartmentConnection[],
  darkMode: boolean,
): PositionedDepartment[] {
  if (connections.length === 0) return [];
  const colors = darkMode ? FACULTY_COLORS_DARK : FACULTY_COLORS_LIGHT;
  const faculties = [...new Set(connections.map(connection => connection.faculty || "Imperial College London"))].sort();
  const facultyColor = new Map(faculties.map((faculty, index) => [faculty, colors[index % colors.length]]));
  const strongest = Math.max(...connections.map(connection => connection.sharedPapers), 1);
  const ringCapacities = [9, 15, 22, 30, 40];
  const ringRadii = [
    { x: 150, y: 92 },
    { x: 245, y: 158 },
    { x: 345, y: 225 },
    { x: 445, y: 292 },
    { x: 510, y: 330 },
  ];
  const sorted = [...connections].sort((first, second) => (
    first.faculty.localeCompare(second.faculty)
    || second.sharedPapers - first.sharedPapers
    || first.department.localeCompare(second.department)
  ));
  let offset = 0;
  const positioned: PositionedDepartment[] = [];
  for (let ringIndex = 0; offset < sorted.length; ringIndex += 1) {
    const capacity = ringCapacities[Math.min(ringIndex, ringCapacities.length - 1)];
    const ring = sorted.slice(offset, offset + capacity);
    const radii = ringRadii[Math.min(ringIndex, ringRadii.length - 1)];
    const angleOffset = ringIndex % 2 === 0 ? -Math.PI / 2 : -Math.PI / 2 + Math.PI / Math.max(1, ring.length);
    ring.forEach((connection, index) => {
      const angle = angleOffset + (index / Math.max(1, ring.length)) * Math.PI * 2;
      positioned.push({
        ...connection,
        x: Math.cos(angle) * radii.x,
        y: Math.sin(angle) * radii.y,
        radius: Math.min(25, 10 + Math.sqrt(connection.sharedPapers / strongest) * 15),
        color: facultyColor.get(connection.faculty || "Imperial College London") || colors[0],
        labelRank: connections
          .slice()
          .sort((first, second) => second.sharedPapers - first.sharedPapers)
          .findIndex(candidate => candidate.department === connection.department),
      });
    });
    offset += ring.length;
  }
  return positioned;
}

export default function DepartmentReachGraph({
  organizationName,
  reach,
  onOpenOrganization,
}: {
  organizationName: string;
  reach: OrganizationDepartmentReach;
  onOpenOrganization?: (name: string) => void;
}) {
  const { resolvedTheme } = useTheme();
  const [minimumSharedPapers, setMinimumSharedPapers] = useState(1);
  const [departmentLimit, setDepartmentLimit] = useState<number>(24);
  const [selectedDepartment, setSelectedDepartment] = useState<OrganizationDepartmentConnection | null>(null);
  const [hoveredDepartment, setHoveredDepartment] = useState("");

  const filteredConnections = useMemo(() => {
    const eligible = reach.departments
      .filter(connection => connection.sharedPapers >= minimumSharedPapers)
      .sort((first, second) => second.sharedPapers - first.sharedPapers || first.department.localeCompare(second.department));
    return departmentLimit > 0 ? eligible.slice(0, departmentLimit) : eligible;
  }, [departmentLimit, minimumSharedPapers, reach.departments]);

  const positioned = useMemo(() => buildPositions(
    filteredConnections,
    resolvedTheme === "dark",
  ), [filteredConnections, resolvedTheme]);

  const facultyLegend = useMemo(() => {
    const entries = new Map<string, string>();
    for (const connection of positioned) entries.set(connection.faculty || "Imperial College London", connection.color);
    return [...entries.entries()];
  }, [positioned]);

  const centralColor = resolvedTheme === "dark" ? "#00ff7f" : "#7b68ee";
  const centralText = resolvedTheme === "dark" ? "#232333" : "#ffffff";
  const lineColor = resolvedTheme === "dark" ? "rgba(199, 198, 218, 0.34)" : "rgba(80, 72, 105, 0.25)";
  const activeLineColor = centralColor;
  const labelColor = resolvedTheme === "dark" ? "#f3f2f8" : "#251f32";
  const mutedColor = resolvedTheme === "dark" ? "#aaa9b9" : "#746f7e";

  return (
    <div className="overflow-hidden border-y border-border bg-card sm:rounded-lg sm:border">
      <div className="border-b border-border px-3 py-4 sm:px-5">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-primary" />
              <h4 className="text-sm font-semibold text-foreground">Department collaboration reach</h4>
            </div>
            <p className="mt-1 max-w-3xl text-xs leading-relaxed text-muted-foreground">
              Links connect this unit to other Imperial departments and units through co-authored papers. Each paper is counted once per connection.
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
                {[1, 2, 5, 10, 20, 50].map(value => <option key={value} value={value}>{value}</option>)}
              </select>
            </label>
            <label className="min-w-[118px] text-[10px] font-semibold uppercase text-muted-foreground">
              Departments
              <select
                value={departmentLimit}
                onChange={event => setDepartmentLimit(Number(event.target.value))}
                className="mt-1 block h-9 w-full rounded-md border border-border bg-background px-2 text-xs font-medium normal-case text-foreground outline-none focus:border-primary"
              >
                {DEPARTMENT_LIMITS.map(value => <option key={value} value={value}>{value || "All"}</option>)}
              </select>
            </label>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-muted-foreground">
          <span>{positioned.length.toLocaleString()} departments shown</span>
          <span>{filteredConnections.reduce((sum, connection) => sum + connection.sharedPapers, 0).toLocaleString()} distinct shared papers</span>
          {reach.departmentCount > reach.returnedDepartmentCount && (
            <span>Showing {reach.returnedDepartmentCount.toLocaleString()} of {reach.departmentCount.toLocaleString()} connected departments</span>
          )}
        </div>

        {facultyLegend.length > 1 && (
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-[10px] text-muted-foreground">
            {facultyLegend.map(([faculty, color]) => (
              <span key={faculty} className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
                {faculty}
              </span>
            ))}
          </div>
        )}
      </div>

      {positioned.length === 0 ? (
        <div className="flex min-h-[420px] items-center justify-center px-6 text-center">
          <div>
            <Network className="mx-auto h-6 w-6 text-muted-foreground" />
            <p className="mt-3 text-sm font-semibold text-foreground">No department links pass this threshold</p>
            <p className="mt-1 text-xs text-muted-foreground">Lower the shared-paper threshold to show more connections.</p>
          </div>
        </div>
      ) : (
        <div className="relative min-h-[520px] sm:min-h-[680px]">
          <svg
            viewBox="-540 -360 1080 720"
            className="absolute inset-0 h-full w-full bg-background"
            role="img"
            aria-label={`Department collaboration reach for ${organizationName}`}
          >
            <g>
              {positioned.map(connection => {
                const distance = Math.max(1, Math.hypot(connection.x, connection.y));
                const startX = (connection.x / distance) * 43;
                const startY = (connection.y / distance) * 43;
                const endX = connection.x - (connection.x / distance) * connection.radius;
                const endY = connection.y - (connection.y / distance) * connection.radius;
                const active = selectedDepartment?.department === connection.department
                  || hoveredDepartment === connection.department;
                return (
                  <line
                    key={`line-${connection.department}`}
                    x1={startX}
                    y1={startY}
                    x2={endX}
                    y2={endY}
                    stroke={active ? activeLineColor : lineColor}
                    strokeWidth={Math.min(8, 0.8 + Math.sqrt(connection.sharedPapers) * 0.32)}
                    strokeLinecap="round"
                    opacity={active ? 0.95 : 0.72}
                  />
                );
              })}
            </g>

            <g>
              <circle cx="0" cy="0" r="43" fill={centralColor} />
              <circle cx="0" cy="0" r="48" fill="none" stroke={centralColor} strokeOpacity="0.25" strokeWidth="2" />
              <Building2 x={-12} y={-13} width={24} height={24} color={centralText} strokeWidth={1.8} />
              <text
                x="0"
                y="62"
                textAnchor="middle"
                fill={labelColor}
                fontFamily="Imperial Sans Display, sans-serif"
                fontWeight="600"
                fontSize="13"
              >
                {organizationName.length > 42 ? `${organizationName.slice(0, 39)}...` : organizationName}
              </text>
            </g>

            {positioned.map(connection => {
              const selected = selectedDepartment?.department === connection.department;
              const hovered = hoveredDepartment === connection.department;
              const showLabel = selected || hovered || connection.labelRank < Math.min(18, positioned.length);
              const lines = splitLabel(connection.department);
              const labelX = connection.x >= 0
                ? connection.x + connection.radius + 7
                : connection.x - connection.radius - 7;
              const anchor = connection.x >= 0 ? "start" : "end";
              return (
                <g
                  key={connection.department}
                  role="button"
                  tabIndex={0}
                  aria-label={`${connection.department}, ${connection.sharedPapers} shared papers`}
                  className="cursor-pointer outline-none"
                  onMouseEnter={() => setHoveredDepartment(connection.department)}
                  onMouseLeave={() => setHoveredDepartment("")}
                  onFocus={() => setHoveredDepartment(connection.department)}
                  onBlur={() => setHoveredDepartment("")}
                  onClick={() => setSelectedDepartment(connection)}
                  onKeyDown={event => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setSelectedDepartment(connection);
                    }
                  }}
                >
                  <circle
                    cx={connection.x}
                    cy={connection.y}
                    r={connection.radius + (selected || hovered ? 5 : 0)}
                    fill={selected || hovered ? connection.color : "transparent"}
                    opacity={0.18}
                  />
                  <circle
                    cx={connection.x}
                    cy={connection.y}
                    r={connection.radius}
                    fill={connection.color}
                    stroke={selected || hovered ? labelColor : "transparent"}
                    strokeWidth={selected ? 2.3 : 1.5}
                  />
                  <text
                    x={connection.x}
                    y={connection.y + 3.5}
                    textAnchor="middle"
                    fill={resolvedTheme === "dark" ? "#232333" : "#ffffff"}
                    fontFamily="Imperial Sans Display, sans-serif"
                    fontWeight="700"
                    fontSize={Math.max(8, connection.radius * 0.56)}
                  >
                    {connection.sharedPapers}
                  </text>
                  {showLabel && (
                    <text
                      x={labelX}
                      y={connection.y - ((lines.length - 1) * 5)}
                      textAnchor={anchor}
                      fill={labelColor}
                      fontFamily="Imperial Sans Display, sans-serif"
                      fontWeight={selected || hovered ? "600" : "500"}
                      fontSize={selected || hovered ? "11" : "9.5"}
                    >
                      {lines.map((line, index) => (
                        <tspan key={line} x={labelX} dy={index === 0 ? 0 : 12}>{line}</tspan>
                      ))}
                    </text>
                  )}
                  {(selected || hovered) && (
                    <text
                      x={labelX}
                      y={connection.y + ((lines.length + 0.5) * 12)}
                      textAnchor={anchor}
                      fill={mutedColor}
                      fontFamily="Imperial Sans Display, sans-serif"
                      fontSize="9"
                    >
                      {connection.sharedPapers} shared papers
                    </text>
                  )}
                </g>
              );
            })}
          </svg>

          {selectedDepartment && (
            <aside className="absolute inset-x-0 bottom-0 z-20 max-h-[76%] overflow-y-auto border-t border-border bg-card shadow-xl sm:inset-y-0 sm:left-auto sm:right-0 sm:w-[370px] sm:border-l sm:border-t-0">
              <div className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase text-primary">Connected department</p>
                    <h4 className="mt-1 text-lg font-semibold leading-tight text-foreground">{selectedDepartment.department}</h4>
                    <p className="mt-1 text-xs text-muted-foreground">{selectedDepartment.faculty}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedDepartment(null)}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md hover:bg-secondary"
                    aria-label="Close department details"
                  >
                    <X className="h-4 w-4 text-muted-foreground" />
                  </button>
                </div>

                <div className="mt-4 grid grid-cols-3 border-y border-border py-3 text-center">
                  <div>
                    <p className="text-lg font-semibold tabular-nums text-foreground">{selectedDepartment.sharedPapers.toLocaleString()}</p>
                    <p className="text-[10px] text-muted-foreground">shared papers</p>
                  </div>
                  <div className="border-l border-border">
                    <p className="text-lg font-semibold tabular-nums text-foreground">{selectedDepartment.sourceResearcherCount.toLocaleString()}</p>
                    <p className="text-[10px] text-muted-foreground">people here</p>
                  </div>
                  <div className="border-l border-border">
                    <p className="text-lg font-semibold tabular-nums text-foreground">{selectedDepartment.collaboratorCount.toLocaleString()}</p>
                    <p className="text-[10px] text-muted-foreground">people there</p>
                  </div>
                </div>

                <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                  {selectedDepartment.latestYear
                    ? `The latest recorded collaboration is from ${selectedDepartment.latestYear}.`
                    : "The latest collaboration year is not recorded."}
                  {" "}Counts use distinct shared publications, not author appearances.
                </p>

                {selectedDepartment.evidencePapers.length > 0 && (
                  <div className="mt-5">
                    <p className="text-[10px] font-semibold uppercase text-muted-foreground">Recent shared publications</p>
                    <div className="mt-2 divide-y divide-border">
                      {selectedDepartment.evidencePapers.map(paper => {
                        const href = openAlexWorkUrl(paper.openalexWorkId);
                        const content = (
                          <>
                            <span className="block text-xs font-medium leading-relaxed text-foreground">{paper.title}</span>
                            <span className="mt-1 block text-[10px] text-muted-foreground">
                              {paper.year || "Year not recorded"}{paper.citations ? ` · ${paper.citations.toLocaleString()} citations` : ""}
                            </span>
                          </>
                        );
                        return href ? (
                          <a
                            key={`${paper.openalexWorkId}-${paper.title}`}
                            href={href}
                            target="_blank"
                            rel="noreferrer"
                            className="group block py-2.5"
                          >
                            {content}
                            <ExternalLink className="mt-1.5 h-3 w-3 text-primary opacity-0 transition-opacity group-hover:opacity-100" />
                          </a>
                        ) : (
                          <div key={paper.title} className="py-2.5">{content}</div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {onOpenOrganization && (
                  <button
                    type="button"
                    onClick={() => onOpenOrganization(selectedDepartment.department)}
                    className="mt-5 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-md bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
                  >
                    Explore this department
                    <ArrowRight className="h-3.5 w-3.5" />
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
