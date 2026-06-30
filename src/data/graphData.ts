export interface GraphNode {
  id: string;
  x: number;
  y: number;
  label: string;
  shortTitle: string;
  department: string;
  faculty?: string;
  role: "mission" | "pi" | "lecturer" | "postdoc" | "phd";
  relevanceScore: number;
  cluster: string;
  isBridge?: boolean;
  keywords?: string[];
  networkRole?: string;
  interdisciplinarityScore?: number;
  interdisciplinaryReasons?: string[];
}

export interface GraphEdge {
  source: string;
  target: string;
  type: "mission" | "supervisor" | "coauthor" | "thematic" | "department";
  weight: number;
  label?: string;
}

export interface GraphCluster {
  id: string;
  label: string;
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  color: string;
  description: string;
}

export const MISSION_NODE: GraphNode = {
  id: "mission",
  x: 0,
  y: 0,
  label: "Sustainable Textiles & Circular Materials",
  shortTitle: "Mission",
  department: "",
  role: "mission",
  relevanceScore: 100,
  cluster: "mission",
  networkRole: "Central Mission",
};

export const GRAPH_CLUSTERS: GraphCluster[] = [
  {
    id: "chem-biomass",
    label: "Sustainable Chemistry & Biomass",
    cx: -180,
    cy: -120,
    rx: 200,
    ry: 150,
    color: "hsla(270, 60%, 65%, 0.08)",
    description: "Ionic liquids, biomass valorisation, cellulose processing, and sustainable chemical technologies",
  },
  {
    id: "materials",
    label: "Materials & Nanoscience",
    cx: 240,
    cy: -100,
    rx: 180,
    ry: 140,
    color: "hsla(200, 60%, 60%, 0.08)",
    description: "Nanocarbon materials, sustainable polymers, advanced fibres, and polymer chemistry",
  },
  {
    id: "systems",
    label: "Systems, Energy & Supply Chains",
    cx: -200,
    cy: 180,
    rx: 190,
    ry: 130,
    color: "hsla(160, 50%, 50%, 0.08)",
    description: "Process systems engineering, LCA, supply chain optimisation, and decarbonisation modelling",
  },
  {
    id: "environmental",
    label: "Environmental Assessment",
    cx: 120,
    cy: 220,
    rx: 130,
    ry: 90,
    color: "hsla(140, 50%, 50%, 0.08)",
    description: "Environmental technology, circular economy policy, and sustainability assessment",
  },
  {
    id: "design",
    label: "Design for Sustainability",
    cx: 320,
    cy: 120,
    rx: 120,
    ry: 80,
    color: "hsla(30, 60%, 55%, 0.08)",
    description: "Circular product design, fashion technology, and user-centred sustainability",
  },
];

export const GRAPH_NODES: GraphNode[] = [
  MISSION_NODE,
  // Cluster: Sustainable Chemistry & Biomass
  { id: "1", x: -120, y: -80, label: "Prof. Magda Titirici", shortTitle: "Chair, Sustainable Energy Materials", department: "Chemical Engineering", role: "pi", relevanceScore: 97, cluster: "chem-biomass", networkRole: "Central Expert", keywords: ["biomass valorisation", "carbon materials", "VALUED Programme"] },
  { id: "2", x: -200, y: -180, label: "Prof. Jason Hallett", shortTitle: "Prof, Sustainable Chemical Technology", department: "Chemical Engineering", role: "pi", relevanceScore: 94, cluster: "chem-biomass", isBridge: true, networkRole: "Central Expert / Bridge", keywords: ["ionic liquids", "DyeRecycle", "cellulose"] },
  { id: "6", x: -280, y: -80, label: "Dr. Agi Brandt-Talbot", shortTitle: "Lecturer, Sustainable ChemEng", department: "Chemical Engineering", role: "lecturer", relevanceScore: 86, cluster: "chem-biomass", isBridge: true, networkRole: "Bridge Researcher", keywords: ["lignin", "sustainable fibres", "biomass"] },
  { id: "10", x: -200, y: -20, label: "Aida Rafat", shortTitle: "PhD Candidate", department: "Chemical Engineering", role: "phd", relevanceScore: 72, cluster: "chem-biomass", networkRole: "Rising Researcher", keywords: ["cellulose extraction", "ionic liquids"] },

  // Cluster: Materials & Nanoscience
  { id: "3", x: 200, y: -140, label: "Prof. Milo Shaffer", shortTitle: "Prof, Materials Chemistry", department: "Chemistry", role: "pi", relevanceScore: 78, cluster: "materials", isBridge: true, networkRole: "Central Expert / Bridge", keywords: ["nanocarbon", "polymer composites", "carbon fibres"] },
  { id: "11", x: 300, y: -180, label: "Enny Tran", shortTitle: "PhD Student", department: "Chemistry", role: "phd", relevanceScore: 68, cluster: "materials", networkRole: "Rising Researcher", keywords: ["lignin carbon fibres", "fibre spinning"] },
  { id: "12", x: 260, y: -40, label: "Dr. Antoine Romain", shortTitle: "Sr. Lecturer, Polymer Chemistry", department: "Chemistry", role: "lecturer", relevanceScore: 70, cluster: "materials", networkRole: "Thematic Expert", keywords: ["sustainable polymers", "bio-based monomers"] },

  // Cluster: Systems & Energy
  { id: "4", x: -180, y: 160, label: "Prof. Niall Mac Dowell", shortTitle: "Prof, Future Energy Systems", department: "Chemical Engineering", role: "pi", relevanceScore: 75, cluster: "systems", networkRole: "Cluster Lead", keywords: ["carbon capture", "circular economy", "systems modelling"] },
  { id: "7", x: -120, y: 240, label: "Prof. Amparo Galindo", shortTitle: "Prof, Chemical Engineering", department: "Chemical Engineering", role: "pi", relevanceScore: 62, cluster: "systems", networkRole: "Thematic Expert", keywords: ["molecular simulation", "sustainable solvents"] },
  { id: "9", x: -300, y: 200, label: "Dr. Sara Giarola", shortTitle: "Research Fellow", department: "Chemical Engineering", role: "postdoc", relevanceScore: 65, cluster: "systems", isBridge: true, networkRole: "Bridge Researcher", keywords: ["LCA", "supply chain", "optimisation"] },

  // Cluster: Environmental Assessment
  { id: "5", x: 120, y: 210, label: "Prof. Nikolaos Voulvoulis", shortTitle: "Prof, Environmental Technology", department: "Civil & Environmental Eng.", role: "pi", relevanceScore: 73, cluster: "environmental", networkRole: "Cluster Lead", keywords: ["LCA", "circular economy policy", "environmental assessment"] },

  // Cluster: Design
  { id: "8", x: 310, y: 110, label: "Dr. Marco Aurisicchio", shortTitle: "Sr. Lecturer, Design Engineering", department: "Dyson School", role: "lecturer", relevanceScore: 69, cluster: "design", networkRole: "Thematic Expert", keywords: ["circular design", "fashion tech", "product-service systems"] },
];

export const GRAPH_EDGES: GraphEdge[] = [
  // Mission-to-person (relevance)
  { source: "mission", target: "1", type: "mission", weight: 0.97 },
  { source: "mission", target: "2", type: "mission", weight: 0.94 },
  { source: "mission", target: "6", type: "mission", weight: 0.86 },
  { source: "mission", target: "3", type: "mission", weight: 0.78 },
  { source: "mission", target: "4", type: "mission", weight: 0.75 },
  { source: "mission", target: "5", type: "mission", weight: 0.73 },
  { source: "mission", target: "10", type: "mission", weight: 0.72 },
  { source: "mission", target: "12", type: "mission", weight: 0.70 },
  { source: "mission", target: "8", type: "mission", weight: 0.69 },
  { source: "mission", target: "11", type: "mission", weight: 0.68 },
  { source: "mission", target: "9", type: "mission", weight: 0.65 },
  { source: "mission", target: "7", type: "mission", weight: 0.62 },

  // Supervisor/team relationships
  { source: "1", target: "10", type: "supervisor", weight: 0.9, label: "VALUED team" },
  { source: "2", target: "10", type: "supervisor", weight: 0.9, label: "PhD Supervisor" },
  { source: "2", target: "6", type: "supervisor", weight: 0.85, label: "Hallett Group" },
  { source: "3", target: "11", type: "supervisor", weight: 0.9, label: "PhD Supervisor" },
  { source: "6", target: "11", type: "supervisor", weight: 0.8, label: "Co-supervisor" },
  { source: "4", target: "9", type: "supervisor", weight: 0.8, label: "Research group" },

  // Co-authorship
  { source: "1", target: "2", type: "coauthor", weight: 0.7, label: "Co-authored" },
  { source: "2", target: "3", type: "coauthor", weight: 0.5, label: "Co-authored" },
  { source: "4", target: "7", type: "coauthor", weight: 0.6, label: "Co-authored" },
  { source: "1", target: "6", type: "coauthor", weight: 0.65, label: "VALUED collaboration" },
  { source: "5", target: "9", type: "coauthor", weight: 0.4, label: "LCA collaboration" },

  // Thematic similarity
  { source: "6", target: "3", type: "thematic", weight: 0.6, label: "Fibre technologies" },
  { source: "12", target: "6", type: "thematic", weight: 0.55, label: "Bio-based polymers" },
  { source: "8", target: "5", type: "thematic", weight: 0.4, label: "Circular economy" },
  { source: "9", target: "5", type: "thematic", weight: 0.45, label: "LCA methods" },
  { source: "8", target: "2", type: "thematic", weight: 0.35, label: "Fashion & textiles" },
  { source: "12", target: "3", type: "thematic", weight: 0.5, label: "Polymer materials" },
  { source: "1", target: "12", type: "thematic", weight: 0.4, label: "Carbon materials" },
  { source: "4", target: "5", type: "thematic", weight: 0.35, label: "Sustainability systems" },

  // Department connections
  { source: "1", target: "4", type: "department", weight: 0.3, label: "Chemical Engineering" },
  { source: "2", target: "4", type: "department", weight: 0.3, label: "Chemical Engineering" },
  { source: "7", target: "4", type: "department", weight: 0.3, label: "Chemical Engineering" },
  { source: "3", target: "12", type: "department", weight: 0.3, label: "Chemistry" },
];

export const GRAPH_MODES = [
  { id: "relevance", label: "Mission Relevance", description: "How each person relates to the semantic mission" },
  { id: "coauthorship", label: "Co-authorship", description: "Co-authorship links from the relevant papers shown for this search" },
  { id: "supervision", label: "Teams & Supervision", description: "PI, postdoc and PhD team structures" },
  { id: "thematic", label: "Semantic Similarity", description: "Shared research themes and topics" },
  { id: "bridges", label: "Cross-faculty Bridges", description: "People connecting departments or faculties through relevant papers and shared themes" },
] as const;

export type GraphMode = typeof GRAPH_MODES[number]["id"];
