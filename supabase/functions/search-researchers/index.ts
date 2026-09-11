import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type SearchRequest = {
  action?: "search" | "rewrite_mission" | "suggest_researchers" | "suggest_organizations" | "list_organizations" | "organization_profile" | "organization_network" | "researcher_profile" | "researcher_network" | "researcher_connection" | "collaboration_opportunities" | "researcher_profile_question" | "research_pool_question" | "quick_search" | "keyword_suggestions" | "match_school_missions" | "summarize_pool" | "admin_search_logs";
  query?: string;
  original_query?: string;
  researcher_id?: string;
  target_researcher_id?: string;
  organization_name?: string;
  researcher_ids?: string[];
  mode?: "semantic" | "keyword";
  filters?: string[];
  limit?: number;
  network_limit?: number;
  max_degrees?: number;
  offset?: number;
  enable_rerank?: boolean;
  include_external_evidence?: boolean;
  admin_password?: string;
  researchers?: SchoolMissionResearcher[];
  pool_summary?: ResearchPoolSummary;
  conversation?: ResearchPoolChatMessage[];
};

type SearchStrategy = "topic" | "brief";

type MissionExpansion = {
  expanded_query: string;
  must_have?: string[];
  nice_to_have?: string[];
  method_terms?: string[];
  domain_terms?: string[];
  search_strategy?: SearchStrategy;
};

type RerankedCandidate = {
  researcher_id: string;
  score: number;
  reason: string;
  match_type?: "strong" | "adjacent" | "weak";
  best_paper_titles?: string[];
  best_paper_ids?: string[];
};

type ExternalEvidence = {
  source: "openai_web" | "ukri";
  evidence_type: "media" | "startup" | "grant" | "video" | "general";
  title: string;
  snippet?: string;
  url?: string;
};

type SchoolMissionResearcher = {
  id?: string;
  name?: string;
  title?: string;
  department?: string;
  faculty?: string;
  summary?: string;
  keywords?: string[];
  match_reason?: string;
  publications?: string[];
  openalex_topics?: string[];
  external_evidence?: Array<Record<string, unknown>>;
};

type SchoolMissionMatch = {
  researcher_id: string;
  school: string;
  mission: string;
  confidence: number;
  reason: string;
};

type ResearchPoolSummary = {
  headline: string;
  summary: string;
  themes: string[];
  notable_researchers: Array<{
    name: string;
    reason: string;
  }>;
  gaps: string[];
};

type ResearchPoolChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type OpenAlexTopicEvidence = {
  openalex_topic_id: string;
  label: string;
  description: string;
  keywords: string[];
  domain_name: string;
  field_name: string;
  subfield_name: string;
  topic_strength: number;
  paper_count: number;
  recent_paper_count: number;
  latest_year: number | null;
  trend: string;
  relevance: number;
};

type UsageCall = {
  kind: "chat" | "embedding" | "web_search";
  model: string;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  estimated_cost_usd: number | null;
};

type UsageMetrics = {
  calls: UsageCall[];
  input_tokens: number;
  output_tokens: number;
  embedding_tokens: number;
  total_tokens: number;
  estimated_cost_usd: number;
  missing_pricing_models: Set<string>;
};

type SearchAuditLog = {
  action?: string;
  status?: string;
  query?: string;
  original_query?: string;
  expanded_query?: string;
  mode?: string;
  enable_rerank?: boolean;
  include_external_evidence?: boolean;
  rewrite_used?: boolean;
  duration_ms?: number;
  result_count?: number;
  candidate_count?: number;
  llm_pool_size?: number;
  models?: Record<string, unknown>;
  usage?: Record<string, unknown>;
  estimated_cost_usd?: number | null;
  error_message?: string;
  metadata?: Record<string, unknown>;
};

const SCHOOL_MISSIONS = [
  {
    school: "Health and Technology",
    missions: [
      {
        name: "AITHER",
        description: "Diagnostics in real-world settings, sensing, interpreting and shaping health outside conventional clinical boundaries, programmable health, continuous adaptive health systems, disadvantaged populations and global health equity.",
      },
      {
        name: "UBUNTU",
        description: "Affordable programmable health architectures, context-appropriate health innovation, operational resilience, maintenance, adaptation, governance and implementation across diverse health systems.",
      },
    ],
  },
  {
    school: "Human and Artificial Intelligence",
    missions: [
      {
        name: "SYMBIOSIS",
        description: "Human-centred AI at scale, human behaviour, workflows, social settings, co-adaptive humans and AI, learning, decision-making, collaboration, augmentation rather than displacement.",
      },
      {
        name: "EMPOWER",
        description: "Safe scaling and responsible deployment of advanced AI architectures, human empowerment, societal benefit, governance, accountability, trust and stewardship of powerful intelligence systems.",
      },
    ],
  },
  {
    school: "Space, Security and Telecoms",
    missions: [
      {
        name: "LACE",
        description: "Low-Altitude Advanced Communications and Earth Observation, resilient sovereign communications, real-time monitoring, next-generation satellites, AI, materials, cybersecurity, environmental monitoring, VLEO and recoverable satellite systems.",
      },
      {
        name: "Space 2099",
        description: "Earth-based space-analogue living lab for future space colonisation technologies, security of humankind, systems design, space habitation, exploration and 2030 demonstrators.",
      },
      {
        name: "Thunderbird",
        description: "Autonomous disaster response, ultra-fast self-deploying infrastructure and relief, communications, logistics, deployable infrastructure, humanitarian impact and hard-to-reach communities.",
      },
    ],
  },
  {
    school: "Sustainability",
    missions: [
      {
        name: "Nurturing",
        description: "Optimising production of energy, food, materials and vital services for and from nature, ecological health, biology, engineering, land use, supply chains, policy and nature as infrastructure.",
      },
      {
        name: "Powering",
        description: "Equitable access to clean healthy energy for 10 billion people by 2050, energy transition, generation, storage, grids, markets, behaviour, public health, fairness and policy.",
      },
      {
        name: "Re-Engineering",
        description: "Systems that share stewardship of critical resources and deliver utility without pollution, circularity, resource stewardship, pollution reduction, industrial systems, materials, infrastructure and governance.",
      },
      {
        name: "Thriving",
        description: "Resilient global societies under frequent large-scale environmental shocks, adaptation, preparedness, social resilience, communities, cities, industries, states, prosperity and wellbeing under environmental stress.",
      },
    ],
  },
];

const SCHOOL_OF_CONVERGENCE_SCIENCE_INFO = {
  name: "Imperial College London's School of Convergence Science",
  director: "Professor Anthony Bull",
  purpose: "a mission-led initiative within Imperial's Science for Humanity strategy that brings together researchers, partners, industry, governments, funders and communities to tackle complex global challenges through integrated, transdisciplinary work.",
  themes: [
    {
      name: "Health and Technology",
      co_directors: ["Anthony Bull", "Iain McNeish", "Marisa Miraldo", "Faith Osier"],
      missions: ["AITHḖR", "UBUNTU"],
    },
    {
      name: "Human and Artificial Intelligence",
      co_directors: ["Payam Barnaghi", "Will Branford", "Aldo Faisal", "Alessandra Russo"],
      missions: ["SYMBIOSIS", "EMPOWER"],
    },
    {
      name: "Space, Security and Telecoms",
      co_directors: ["Jonathan Eastwood", "Kin Leung", "Julie McCann", "Matthew Santer"],
      missions: ["LACE", "Space 2099", "Thunderbird"],
    },
    {
      name: "Sustainability",
      co_directors: ["Benjamin Barratt", "Alyssa Gilbert", "Mirabelle Muûls", "Nilay Shah"],
      missions: ["Nurturing", "Powering", "Re-Engineering", "Thriving"],
    },
  ],
  operations: [
    "Daniela Manca, Operations Director",
    "Melanie Bradnam, Schools Manager for Human and Artificial Intelligence and Health and Technology",
    "Victoria Ebo, Schools Manager for Sustainability and Space, Security and Telecoms",
  ],
};

const GRADE_FILTERS = new Set([
  "Professor",
  "Chair",
  "Reader",
  "Senior Lecturer",
  "Lecturer",
  "Associate Lecturer",
  "Postdoc",
  "Research Fellow",
  "PhD Student",
]);

const RERANK_WORKER_COUNT = 5;

const DEFAULT_MODEL_PRICING_USD_PER_1M: Record<string, { input?: number; output?: number; embedding?: number }> = {
  "text-embedding-3-small": { embedding: 0.02 },
};

const STOP_WORDS = new Set([
  "about",
  "after",
  "also",
  "and",
  "application",
  "applications",
  "are",
  "based",
  "been",
  "being",
  "between",
  "college",
  "could",
  "expert",
  "experts",
  "find",
  "for",
  "from",
  "have",
  "imperial",
  "into",
  "london",
  "mission",
  "need",
  "not",
  "or",
  "research",
  "researcher",
  "researchers",
  "that",
  "the",
  "their",
  "this",
  "through",
  "using",
  "with",
  "work",
  "working",
]);

const METHOD_TERMS = new Set([
  "ai",
  "algorithm",
  "algorithms",
  "artificial",
  "deep",
  "intelligence",
  "learning",
  "machine",
  "ml",
  "model",
  "modeling",
  "modelling",
  "models",
  "neural",
  "surrogate",
  "transformer",
  "transformers",
  "vision",
]);

const METHOD_PHRASES = [
  "artificial intelligence",
  "machine learning",
  "deep learning",
  "neural network",
  "neural networks",
  "computer vision",
  "data driven",
  "data-driven",
  "digital twin",
  "foundation model",
  "foundation models",
  "generative ai",
  "large language model",
  "large language models",
  "surrogate model",
  "surrogate modelling",
  "surrogate modeling",
];

const ROLE_AUTHORITY_TERMS = [
  "chair",
  "professor",
  "reader",
  "director",
  "lead",
  "principal investigator",
];

let keywordSuggestionCache: {
  createdAt: number;
  suggestions: string[];
} | null = null;

const KEYWORD_SUGGESTION_TTL_MS = 24 * 60 * 60 * 1000;
const FALLBACK_KEYWORD_SUGGESTIONS = [
  "air pollution",
  "artificial intelligence",
  "bioengineering",
  "biomaterials",
  "cancer",
  "climate change",
  "data science",
  "deep learning",
  "energy systems",
  "environmental exposure",
  "health services",
  "machine learning",
  "materials science",
  "public health",
  "robotics",
  "sustainability",
];

function normaliseFaculty(filter: string) {
  return filter.startsWith("Faculty of") || filter === "Imperial College Business School"
    ? filter.replace(/^Faculty of /, "")
    : filter;
}

function queryTerms(query: string) {
  return query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map(term => term.trim())
    .filter(term => (term.length > 2 || term === "ai" || term === "ml") && !STOP_WORDS.has(term));
}

function expandResearchAbbreviations(value: string) {
  return value.replace(/\bai\b/gi, "artificial intelligence");
}

function isStandaloneResearchAbbreviation(value: string) {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
  return normalized === "ai";
}

const ADMIN_FORM_HINTS = [
  /\bpermission\s+slip\b/i,
  /\bparent\s*\/?\s*carer\b/i,
  /\bname\s+of\s+child\b/i,
  /\bdo\s+not\s+give\s+permission\b/i,
  /\bgive\s+permission\b/i,
  /\bschool\s+office\b/i,
  /\bregistered\s+office\b/i,
  /\bcompany\s+number\b/i,
  /\btelephone\b/i,
  /\btrip\s+to\b/i,
  /\bprint\s+name\b/i,
  /\bsignature\b/i,
];

const RESEARCH_INTENT_HINTS = [
  /\bresearch(?:er|ers)?\b/i,
  /\bexpert(?:s|ise)?\b/i,
  /\bmission\b/i,
  /\bpublication(?:s)?\b/i,
  /\bpaper(?:s)?\b/i,
  /\bgrant(?:s)?\b/i,
  /\bprofessor(?:s)?\b/i,
  /\bscientist(?:s)?\b/i,
  /\bclinical\s+trial(?:s)?\b/i,
  /\btechnology\b/i,
  /\binnovation\b/i,
  /\bengineering\b/i,
];

function countPatternMatches(value: string, patterns: RegExp[]) {
  return patterns.reduce((count, pattern) => count + (pattern.test(value) ? 1 : 0), 0);
}

function redactSensitiveSearchText(value: string) {
  return value
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[email]")
    .replace(/\b(?:\+?\d[\d\s().-]{7,}\d)\b/g, "[phone]")
    .replace(/\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/gi, "[postcode]")
    .replace(/\bcompany\s+number\s+\d+\b/gi, "company number [redacted]")
    .replace(/\s+/g, " ")
    .trim();
}

function isLikelyAdministrativeForm(value: string) {
  const text = value.trim();
  if (!text) return false;
  const adminHits = countPatternMatches(text, ADMIN_FORM_HINTS);
  const researchHits = countPatternMatches(text, RESEARCH_INTENT_HINTS);
  const hasContactDetails = /(?:@|\btelephone\b|\bemail\b|\bregistered\s+office\b|\bcompany\s+number\b)/i.test(text);
  return adminHits >= 4 && hasContactDetails && researchHits === 0;
}

const INCOMPLETE_QUERY_TERMS = new Set([
  "a", "about", "academic", "academics", "afternoon", "an", "and", "anything", "are", "ask", "at", "can", "could", "day", "do", "doing", "evening", "expert", "experts", "for",
  "find", "give", "hello", "help", "i", "imperial", "in", "information", "is", "list", "looking", "me", "my", "need",
  "good", "how", "itmap", "morning", "people", "person", "please", "researcher", "researchers", "search", "show", "someone",
  "something", "staff", "tell", "thanks", "the", "there", "to", "today", "us", "want", "we", "what", "who", "work", "working", "would", "you", "your",
]);

function isInsufficientResearchQuery(value: string) {
  const text = value.replace(/\s+/g, " ").trim();
  if (!text) return true;
  if (/^(?:hi|hello|hey|hiya|hola|good\s+(?:morning|afternoon|evening)|thanks?|thank\s+you|ok(?:ay)?|test(?:ing)?)\b[\s!?.]*$/i.test(text)) {
    return true;
  }

  const topic = implicitResearchTopic(text);
  const meaningfulTerms = topic
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map(term => term.trim())
    .filter(term => (term.length > 1 || term === "ai") && !INCOMPLETE_QUERY_TERMS.has(term));
  return meaningfulTerms.length === 0;
}

const PROFILE_CHAT_OFF_TOPIC_HINTS = [
  /\bpoem\b/i,
  /\bpoetry\b/i,
  /\brecipe\b/i,
  /\bcook(?:ing)?\b/i,
  /\bjoke\b/i,
  /\bfunny\b/i,
  /\bmeme\b/i,
  /\bsong\b/i,
  /\blyric(?:s)?\b/i,
  /\bstory\b/i,
  /\brole\s*play\b/i,
  /\bpretend\b/i,
  /\bhoroscope\b/i,
  /\bdating\b/i,
  /\btravel itinerary\b/i,
  /\bholiday plan\b/i,
];

const PROFILE_CHAT_RESEARCH_HINTS = [
  /\bresearch\b/i,
  /\bprofile\b/i,
  /\bpublication(?:s)?\b/i,
  /\bpaper(?:s)?\b/i,
  /\bco-?author(?:s)?\b/i,
  /\bcollaborat(?:e|ion|or|ors)\b/i,
  /\bexpert(?:s|ise)?\b/i,
  /\bfield(?:s)?\b/i,
  /\btopic(?:s)?\b/i,
  /\babstract(?:s)?\b/i,
  /\btitle(?:s)?\b/i,
  /\bjournal(?:s)?\b/i,
  /\bcitation(?:s)?\b/i,
  /\bposition\b/i,
  /\brole\b/i,
  /\bdepartment\b/i,
  /\bfaculty\b/i,
  /\bwork(?:s|ed|ing)?\b/i,
  /\bgrant(?:s)?\b/i,
  /\bstartup(?:s)?\b/i,
  /\bmedia\b/i,
  /\bproject(?:s)?\b/i,
];

function isOffTopicProfileQuestion(value: string) {
  const text = value.trim();
  if (!text) return false;
  const offTopicHits = countPatternMatches(text, PROFILE_CHAT_OFF_TOPIC_HINTS);
  if (offTopicHits === 0) return false;
  const researchHits = countPatternMatches(text, PROFILE_CHAT_RESEARCH_HINTS);
  return researchHits === 0 || offTopicHits >= 2;
}

function profileChatRefusal(researcherName: string) {
  return {
    answer: `I can only answer serious questions about ${researcherName}'s research profile, publications, co-authors, collaborations, expertise, and Imperial role. Try asking something like "What are their main research areas?", "Who do they collaborate with most?", or "Which papers best represent their work?"`,
    evidence_titles: [],
    caveat: "",
  };
}

function naturaliseProfileAnswer(value: string) {
  const natural = value
    .replace(/\bbased on (?:the )?(?:provided|supplied) (?:co-?author )?(?:summary|data|metadata|information|evidence|database)\s*,?\s*/gi, "")
    .replace(/\bthe (?:provided|supplied) (?:co-?author )?(?:summary|data|metadata|information|evidence|database)\b/gi, "the profile evidence")
    .replace(/\bthis (?:provided|supplied) (?:co-?author )?(?:summary|data|metadata|information|evidence|database)\b/gi, "this profile evidence")
    .replace(/\bprovided explicitly\b/gi, "available here")
    .replace(/\bsupplied explicitly\b/gi, "available here")
    .replace(/\bthe information provided\b/gi, "the available profile information")
    .replace(/\bshared_paper_count\b/gi, "shared publication count")
    .replace(/\bprovided paper evidence in the prompt\b/gi, "relevant publication evidence")
    .replace(/\b(?:the )?(?:provided|supplied) (?:candidate |researcher )?(?:set|list|pool|payload)\b/gi, "the researchers reviewed")
    .replace(/\b(?:this|the) (?:database|dataset|stored record)\b/gi, "ITMAP's current evidence")
    .replace(/\bOpenAlex metadata\b/gi, "publication evidence")
    .replace(/\bOpenAlex paper topics\b/gi, "publication topics")
    .replace(/\bOpenAlex topics\b/gi, "publication topics")
    .replace(/\bOpenAlex topic\b/gi, "publication topic")
    .replace(/\bthe prompt\b/gi, "the query")
    .replace(/\bthis prompt\b/gi, "this query")
    .replace(/\bLLM(?:-based)?\b/gi, "ITMAP")
    .replace(/\brerank(?:ed|ing)?\b/gi, "review")
    .replace(/\b(?:provided|supplied)\s+(?=roles?|profiles?|fields?|publication|information|records?)/gi, "")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();

  return natural ? `${natural.charAt(0).toUpperCase()}${natural.slice(1)}` : "";
}

function singularise(term: string) {
  if (term.endsWith("ies") && term.length > 4) return `${term.slice(0, -3)}y`;
  if (term.endsWith("s") && term.length > 4) return term.slice(0, -1);
  return term;
}

function expandedTermVariants(term: string) {
  const singular = singularise(term);
  const variants = new Set([term, singular]);
  if (!singular.endsWith("s") && singular.length > 3) variants.add(`${singular}s`);
  if (singular === "ai") variants.add("artificial intelligence");
  if (singular === "artificial" || singular === "intelligence") variants.add("ai");
  if (singular === "wildfire") {
    variants.add("wild fire");
    variants.add("forest fire");
    variants.add("burned area");
    variants.add("burnt area");
  }
  if (singular === "textile" || singular === "fashion") {
    variants.add("textile");
    variants.add("textiles");
    variants.add("fashion");
    variants.add("fabric");
    variants.add("fabrics");
    variants.add("fibre");
    variants.add("fibres");
    variants.add("fiber");
    variants.add("fibers");
    variants.add("cellulose");
    variants.add("dye");
    variants.add("dyes");
    variants.add("dyeing");
    variants.add("garment");
    variants.add("garments");
  }
  if (singular === "circular") {
    variants.add("recycling");
    variants.add("recycle");
    variants.add("recycled");
    variants.add("reuse");
    variants.add("reusable");
    variants.add("waste");
    variants.add("end of life");
    variants.add("end-of-life");
  }
  if (singular === "material") {
    variants.add("materials");
    variants.add("polymer");
    variants.add("polymers");
    variants.add("biomass");
    variants.add("lignin");
    variants.add("cellulose");
    variants.add("carbon");
    variants.add("biopolymer");
    variants.add("biopolymers");
  }
  if (singular === "manufacturing") {
    variants.add("manufacture");
    variants.add("production");
    variants.add("processing");
    variants.add("process");
    variants.add("scale-up");
    variants.add("scale up");
  }
  if (singular === "sustainable" || singular === "environmentally") {
    variants.add("environment");
    variants.add("environmental");
    variants.add("sustainability");
    variants.add("green chemistry");
    variants.add("sustainable chemistry");
    variants.add("low-impact");
    variants.add("low impact");
    variants.add("life cycle");
    variants.add("lca");
  }
  if (singular === "exposure") {
    variants.add("exposures");
    variants.add("exposome");
    variants.add("air pollution");
    variants.add("pollution");
    variants.add("environmental risk");
    variants.add("environmental risks");
    variants.add("environmental health");
  }
  if (singular === "pollution") {
    variants.add("air pollution");
    variants.add("particulate matter");
    variants.add("environmental exposure");
    variants.add("environmental exposures");
  }
  if (singular === "health") {
    variants.add("healthcare");
    variants.add("health care");
    variants.add("clinical");
    variants.add("medical");
    variants.add("medicine");
    variants.add("patient");
    variants.add("patients");
    variants.add("digital health");
    variants.add("public health");
  }
  return [...variants];
}

function conceptGroups(query: string, terms: string[]) {
  const lowerQuery = query.toLowerCase();
  const hasMethodIntent = terms.some(term => METHOD_TERMS.has(term))
    || METHOD_PHRASES.some(phrase => lowerQuery.includes(phrase));
  const domainTerms = terms
    .map(singularise)
    .filter(term => !METHOD_TERMS.has(term));

  return {
    hasMethodIntent,
    methodPhrases: METHOD_PHRASES.filter(phrase => lowerQuery.includes(phrase)),
    domainTerms: [...new Set(domainTerms)],
  };
}

const COMPLEX_BRIEF_HINTS = [
  /\b(?:convene|convening|event|workshop|panel|roundtable|conference|symposium)\b/i,
  /\b(?:team|consortium|partnership|collaboration|collaborative|stakeholder|speaker|speakers)\b/i,
  /\b(?:mission|challenge|programme|program|initiative|proposal|bid|grant)\b/i,
  /\b(?:interdisciplinary|multidisciplinary|cross[-\s]?faculty|across departments)\b/i,
  /\b(?:bring|work)\s+together\b/i,
];

function inferSearchStrategy(query: string, mission?: MissionExpansion): SearchStrategy {
  const topicText = implicitResearchTopic(query);
  const terms = queryTerms(topicText);
  const hasBriefIntent = COMPLEX_BRIEF_HINTS.some(pattern => pattern.test(query));
  const hasSeveralRequirements = (mission?.must_have?.length || 0) >= 4
    || (mission?.nice_to_have?.length || 0) >= 4;

  if (hasBriefIntent) return "brief";
  if (terms.length <= 8 && topicText.length <= 160) return "topic";
  if (terms.length > 12 || hasSeveralRequirements) return "brief";
  return mission?.search_strategy === "topic" ? "topic" : "brief";
}

function websearchOrTerms(values: string[], limit = 14) {
  return [...new Set(values
    .map(value => value.toLowerCase().replace(/[^a-z0-9\s-]+/g, " ").replace(/\s+/g, " ").trim())
    .filter(value => value.length >= 2))]
    .slice(0, limit)
    .map(value => value.includes(" ") ? `"${value}"` : value)
    .join(" OR ");
}

function topicalLexicalQueries(query: string, mission: MissionExpansion) {
  const topic = implicitResearchTopic(query).toLowerCase();
  const terms = queryTerms(topic);
  const groups = conceptGroups(topic, terms);
  const methodTerms = [
    ...(mission.method_terms || []),
    ...groups.methodPhrases,
    ...terms.filter(term => METHOD_TERMS.has(singularise(term))),
  ];
  const domainTerms = [
    ...(mission.domain_terms || []),
    ...groups.domainTerms.filter(term => !["foundation"].includes(term)),
  ];

  if (/\b(?:foundation models?|large language models?|llms?|generative ai)\b/i.test(topic)) {
    methodTerms.push("artificial intelligence", "machine learning", "deep learning");
  }
  if (/\bhealth(?:care)?\b|\bclinical\b|\bmedical\b/i.test(topic)) {
    domainTerms.push("health", "healthcare", "clinical", "medical", "medicine", "digital health");
  }

  return {
    methodQuery: groups.hasMethodIntent ? websearchOrTerms(methodTerms) : "",
    domainQuery: websearchOrTerms(domainTerms),
  };
}

function deterministicTopicalMission(query: string): MissionExpansion {
  const topic = implicitResearchTopic(query);
  const terms = queryTerms(topic);
  const groups = conceptGroups(topic, terms);
  return {
    expanded_query: topic,
    must_have: terms.slice(0, 10),
    nice_to_have: [],
    method_terms: [
      ...groups.methodPhrases,
      ...terms.filter(term => METHOD_TERMS.has(singularise(term))),
    ].slice(0, 8),
    domain_terms: groups.domainTerms
      .filter(term => !["foundation"].includes(term))
      .slice(0, 10),
    search_strategy: "topic",
  };
}

function openAlexTopicRelevance(query: string, row: Record<string, unknown>) {
  const topic = implicitResearchTopic(query).toLowerCase().replace(/\s+/g, " ").trim();
  const terms = [...new Set(queryTerms(topic).map(singularise))];
  if (!topic || terms.length === 0) return 0;

  const label = String(row.label || "").toLowerCase();
  const text = [
    label,
    row.description,
    Array.isArray(row.keywords) ? row.keywords.join(" ") : "",
    row.domain_name,
    row.field_name,
    row.subfield_name,
  ].join(" ").toLowerCase();
  const hasTerm = (term: string, value: string) => expandedTermVariants(term)
    .some(variant => value.includes(variant));
  const matchedTerms = terms.filter(term => hasTerm(term, text)).length;
  const labelMatches = terms.filter(term => hasTerm(term, label)).length;
  const coverage = matchedTerms / terms.length;
  const labelCoverage = labelMatches / terms.length;
  const exactPhrase = text.includes(topic) || label.includes(topic) ? 1 : 0;
  const suppliedRelevance = Number(row.relevance || 0);

  return Math.max(
    suppliedRelevance,
    Math.min(1, coverage * 0.68 + labelCoverage * 0.22 + exactPhrase * 0.1),
  );
}

function openAlexTopicFromRow(query: string, row: Record<string, unknown>): OpenAlexTopicEvidence | null {
  const label = String(row.label || "").trim();
  if (!label) return null;
  return {
    openalex_topic_id: String(row.openalex_topic_id || ""),
    label,
    description: truncateText(row.description, 500),
    keywords: Array.isArray(row.keywords) ? row.keywords.map(String).filter(Boolean).slice(0, 12) : [],
    domain_name: String(row.domain_name || ""),
    field_name: String(row.field_name || ""),
    subfield_name: String(row.subfield_name || ""),
    topic_strength: Math.max(0, Number(row.topic_strength || 0)),
    paper_count: Math.max(0, Number(row.paper_count || 0)),
    recent_paper_count: Math.max(0, Number(row.recent_paper_count || 0)),
    latest_year: row.latest_year === null || row.latest_year === undefined
      ? null
      : Number(row.latest_year),
    trend: String(row.trend || "stable"),
    relevance: openAlexTopicRelevance(query, row),
  };
}

function mergeOpenAlexTopics(...collections: unknown[]) {
  const byKey = new Map<string, OpenAlexTopicEvidence>();
  for (const collection of collections) {
    if (!Array.isArray(collection)) continue;
    for (const item of collection) {
      if (!item || typeof item !== "object") continue;
      const topic = item as OpenAlexTopicEvidence;
      const label = String(topic.label || "").trim();
      if (!label) continue;
      const key = String(topic.openalex_topic_id || label).toLowerCase();
      const existing = byKey.get(key);
      if (!existing || Number(topic.relevance || 0) > Number(existing.relevance || 0)) {
        byKey.set(key, topic);
      }
    }
  }
  return [...byKey.values()]
    .sort((a, b) =>
      Number(b.relevance || 0) - Number(a.relevance || 0)
      || Number(b.topic_strength || 0) - Number(a.topic_strength || 0)
      || Number(b.paper_count || 0) - Number(a.paper_count || 0)
    )
    .slice(0, 8);
}

async function fetchOpenAlexTopicsForResearchers(
  supabase: ReturnType<typeof createClient>,
  researcherIds: string[],
  query: string,
) {
  const byResearcher = new Map<string, OpenAlexTopicEvidence[]>();
  const uniqueIds = [...new Set(researcherIds.filter(Boolean))];

  for (const ids of chunkItems(uniqueIds, 100)) {
    const { data, error } = await supabase
      .from("researcher_themes")
      .select("researcher_id,openalex_topic_id,label,description,keywords,domain_name,field_name,subfield_name,topic_strength,paper_count,recent_paper_count,latest_year,trend")
      .eq("source_type", "openalex_topic")
      .in("researcher_id", ids)
      .limit(1600);

    if (error) {
      console.error("OpenAlex topic evidence lookup failed", error);
      continue;
    }

    for (const rawRow of data || []) {
      const row = rawRow as Record<string, unknown>;
      const researcherId = String(row.researcher_id || "");
      const topic = openAlexTopicFromRow(query, row);
      if (!researcherId || !topic) continue;
      const bucket = byResearcher.get(researcherId) || [];
      bucket.push(topic);
      byResearcher.set(researcherId, bucket);
    }
  }

  for (const [researcherId, topics] of byResearcher.entries()) {
    const relevant = topics
      .filter(topic => topic.relevance >= 0.18)
      .sort((a, b) =>
        b.relevance - a.relevance
        || b.topic_strength - a.topic_strength
        || b.paper_count - a.paper_count
        || a.label.localeCompare(b.label)
      );
    const context = topics
      .filter(topic => !relevant.includes(topic))
      .sort((a, b) =>
        b.topic_strength - a.topic_strength
        || b.paper_count - a.paper_count
        || a.label.localeCompare(b.label)
      )
      .slice(0, relevant.length > 0 ? 2 : 3);
    byResearcher.set(researcherId, [...relevant, ...context].slice(0, 8));
  }

  return byResearcher;
}

function textHasAny(text: string, terms: string[]) {
  return terms.some(term => {
    if (term.includes(" ") || term.includes("-")) return text.includes(term);
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`\\b${escaped}\\b`).test(text);
  });
}

type KeywordBooleanToken =
  | { type: "term"; value: string; exact: boolean }
  | { type: "op"; value: "AND" | "OR" | "NOT" };

function parseKeywordBooleanQuery(query: string) {
  const hasBooleanSyntax = /\b(AND|OR|NOT)\b/i.test(query) || /"[^"]+"/.test(query);
  if (!hasBooleanSyntax) {
    return {
      hasBooleanSyntax: false,
      tokens: [] as KeywordBooleanToken[],
    };
  }

  const rawTokens = query.match(/"[^"]+"|\bAND\b|\bOR\b|\bNOT\b|[^\s"]+/gi) || [];
  const tokens: KeywordBooleanToken[] = [];
  let phraseParts: string[] = [];

  const flushPhrase = () => {
    const value = phraseParts.join(" ").replace(/\s+/g, " ").trim();
    if (value) tokens.push({ type: "term", value, exact: false });
    phraseParts = [];
  };

  for (const raw of rawTokens) {
    const upper = raw.toUpperCase();
    if (upper === "AND" || upper === "OR" || upper === "NOT") {
      flushPhrase();
      tokens.push({ type: "op", value: upper });
      continue;
    }

    if (raw.startsWith("\"") && raw.endsWith("\"")) {
      flushPhrase();
      const value = raw.slice(1, -1).replace(/\s+/g, " ").trim();
      if (value) tokens.push({ type: "term", value, exact: true });
      continue;
    }

    phraseParts.push(raw);
  }

  flushPhrase();

  const withImplicitOperators: KeywordBooleanToken[] = [];
  for (const token of tokens) {
    const previous = withImplicitOperators[withImplicitOperators.length - 1];
    if (
      previous
      && (
        (previous.type === "term" && token.type === "term")
        || (previous.type === "term" && token.type === "op" && token.value === "NOT")
        || (previous.type === "op" && previous.value === "NOT" && token.type === "op" && token.value === "NOT")
      )
    ) {
      withImplicitOperators.push({ type: "op", value: "AND" });
    }
    withImplicitOperators.push(token);
  }

  return {
    hasBooleanSyntax: withImplicitOperators.some(token => token.type === "term"),
    tokens: withImplicitOperators,
  };
}

function keywordBooleanTermMatches(text: string, token: Extract<KeywordBooleanToken, { type: "term" }>) {
  const normalizedText = text.toLowerCase();
  const value = token.value.toLowerCase().replace(/\s+/g, " ").trim();
  if (!value) return false;
  if (value === "ai") return textHasAny(normalizedText, ["ai", "artificial intelligence"]);
  if (token.exact || value.includes(" ")) {
    return normalizedText.includes(value);
  }
  return textHasAny(normalizedText, expandedTermVariants(value));
}

function evaluateKeywordBooleanExpression(
  text: string,
  tokens: KeywordBooleanToken[],
) {
  if (tokens.length === 0) return true;
  let index = 0;

  const parseFactor = (): boolean => {
    const token = tokens[index];
    if (!token) return false;
    if (token.type === "op" && token.value === "NOT") {
      index += 1;
      return !parseFactor();
    }
    if (token.type === "term") {
      index += 1;
      return keywordBooleanTermMatches(text, token);
    }
    index += 1;
    return false;
  };

  const parseAnd = (): boolean => {
    let value = parseFactor();
    while (tokens[index]?.type === "op" && tokens[index].value === "AND") {
      index += 1;
      value = value && parseFactor();
    }
    return value;
  };

  let value = parseAnd();
  while (tokens[index]?.type === "op" && tokens[index].value === "OR") {
    index += 1;
    value = value || parseAnd();
  }
  return value;
}

function rowKeywordBooleanText(row: Record<string, unknown>) {
  const profileText = researcherText(row);
  const paperText = ((row.papers as Record<string, unknown>[]) || [])
    .map(paper => [
      paper.title,
      paper.abstract,
      paper.journal,
      paper.source_display_name,
    ].map(value => String(value || "")).join(" "))
    .join(" ");
  return `${profileText} ${paperText}`.toLowerCase();
}

function hasMethodEvidence(text: string) {
  const normalized = text.toLowerCase();
  if (METHOD_PHRASES.some(phrase => normalized.includes(phrase))) return true;
  if (/\b(neural|algorithm|algorithms|computer vision|diffusion model|diffusion models)\b/.test(normalized)) return true;
  if (/\b(supervised|unsupervised|reinforcement|statistical|machine|deep)\s+learning\b/.test(normalized)) return true;
  if (/\bai[-\s]?(based|driven|enabled|model|models|method|methods|forecast|forecasting|prediction|weather)\b/.test(normalized)) return true;
  if (/\b(ai|artificial intelligence)\s+(for|in|to)\b/.test(normalized)) return true;
  return false;
}

function conceptCoverage(
  query: string,
  terms: string[],
  paper: Record<string, unknown>,
  groups = conceptGroups(query, terms),
) {
  const text = [
    paper.title,
    paper.abstract,
    paper.source_display_name,
  ].map(value => String(value || "").toLowerCase()).join(" ");

  const domainVariants = groups.domainTerms.flatMap(expandedTermVariants);
  const domainHit = domainVariants.length === 0 || textHasAny(text, domainVariants);
  const methodHit = !groups.hasMethodIntent
    || hasMethodEvidence(text);

  if (groups.hasMethodIntent && domainVariants.length > 0) {
    if (methodHit && domainHit) return 1;
    return 0;
  }

  if (domainVariants.length > 0) return domainHit ? 1 : 0;
  if (groups.hasMethodIntent) return methodHit ? 1 : 0.2;
  return 1;
}

function domainEvidenceHit(text: string, groups: ReturnType<typeof conceptGroups>) {
  const domainVariants = groups.domainTerms.flatMap(expandedTermVariants);
  return domainVariants.length === 0 || textHasAny(text.toLowerCase(), domainVariants);
}

function methodDomainEvidenceScore(
  row: Record<string, unknown>,
  groups: ReturnType<typeof conceptGroups>,
) {
  if (!groups.hasMethodIntent || groups.domainTerms.length === 0) return 1;

  const profileText = researcherCoreText(row);
  const paperText = ((row.papers as Record<string, unknown>[]) || [])
    .map(paper => [
      paper.title,
      paper.abstract,
      paper.journal,
      paper.source_display_name,
    ].map(value => String(value || "")).join(" "))
    .join(" ")
    .toLowerCase();
  const allText = `${profileText} ${paperText}`;
  const methodHit = hasMethodEvidence(allText);
  const domainHit = domainEvidenceHit(allText, groups);

  if (methodHit && domainHit) return 1;
  if (domainHit) return 0.58;
  if (methodHit) return 0.3;
  return 0.18;
}

function researcherText(row: Record<string, unknown>) {
  return [
    row.full_name,
    row.position_name,
    row.position,
    row.affiliation,
    row.faculty,
    row.fields_of_research,
    row.bio_about,
    row.research,
    row.document_text,
  ].map(value => String(value || "").toLowerCase()).join(" ");
}

function researcherCoreText(row: Record<string, unknown>) {
  return [
    row.full_name,
    row.position_name,
    row.position,
    row.affiliation,
    row.faculty,
    row.fields_of_research,
    row.bio_about,
    row.research,
  ].map(value => String(value || "").toLowerCase()).join(" ");
}

function isVisitingResearcher(row: Record<string, unknown>) {
  const roleText = [
    row.position_name,
    row.position,
    row.title,
  ].map(value => String(value || "").toLowerCase()).join(" ");

  return /\b(visiting|visitor)\b/.test(roleText);
}

function directQueryPhrases(query: string) {
  const lowerQuery = query.toLowerCase().replace(/\s+/g, " ").trim();
  const phrases = new Set<string>();
  if (lowerQuery.length >= 8) phrases.add(lowerQuery);

  const terms = queryTerms(query).map(singularise);
  for (let size = Math.min(4, terms.length); size >= 2; size -= 1) {
    for (let index = 0; index <= terms.length - size; index += 1) {
      phrases.add(terms.slice(index, index + size).join(" "));
    }
  }

  return [...phrases].filter(phrase => phrase.length >= 8);
}

function matchedProfileEvidence(query: string, terms: string[], row: Record<string, unknown>) {
  const fields = [
    { label: "title", value: row.position_name || row.position },
    { label: "fields", value: row.fields_of_research },
    { label: "profile", value: row.bio_about || row.document_text },
    { label: "department", value: row.affiliation || row.research },
  ];

  const evidence: string[] = [];
  const phrases = directQueryPhrases(query);
  const termEvidence = /\bfoundation models?\b/i.test(query)
    ? terms.filter(term => !["foundation", "model", "models"].includes(term))
    : terms;

  for (const field of fields) {
    const value = String(field.value || "").replace(/\s+/g, " ").trim();
    const lowerValue = value.toLowerCase();
    if (!lowerValue) continue;

    const phrase = phrases.find(item => lowerValue.includes(item));
    if (phrase) {
      evidence.push(`${field.label}: "${value.slice(0, 160)}${value.length > 160 ? "..." : ""}"`);
      continue;
    }

    const hits = new Set<string>();
    for (const term of termEvidence) {
      if (textHasAny(lowerValue, expandedTermVariants(term))) hits.add(singularise(term));
    }
    if (hits.size >= Math.min(2, Math.max(1, terms.length))) {
      evidence.push(`${field.label}: ${[...hits].slice(0, 5).join(", ")}`);
    }
  }

  return evidence.slice(0, 3);
}

function profileConceptScore(query: string, terms: string[], row: Record<string, unknown>) {
  const text = researcherText(row);
  const coreText = researcherCoreText(row);
  if (!text) return 0;
  const groups = conceptGroups(query, terms);

  const uniqueGroups = new Set<string>();
  for (const term of terms) {
    const variants = expandedTermVariants(term);
    if (textHasAny(text, variants)) {
      uniqueGroups.add(singularise(term));
    }
  }

  let score = terms.length > 0 ? uniqueGroups.size / Math.min(8, terms.length) : 0;

  const phraseBoosts = [
    "environmental exposure",
    "environmental exposures",
    "environmental exposure scientist",
    "environmental risks and health",
    "environmental health",
    "air pollution",
    "textile recycling",
    "sustainable textiles",
    "sustainable textile",
    "circular materials",
    "sustainable materials",
    "carbon materials",
    "cellulose",
    "lignin",
    "biomass",
    "ionic liquid",
    "green chemistry",
    "supply chain",
    "life cycle",
    "lca",
  ];

  for (const phrase of phraseBoosts) {
    if (text.includes(phrase)) score += 0.08;
  }

  if (groups.hasMethodIntent && groups.domainTerms.length > 0 && !hasMethodEvidence(coreText)) {
    score = Math.min(score, 0.35);
  }

  return Math.max(0, Math.min(1, score));
}

function profileAuthorityScore(query: string, terms: string[], row: Record<string, unknown>) {
  const titleText = [
    row.position_name,
    row.position,
  ].map(value => String(value || "").toLowerCase()).join(" ");
  const fieldsText = String(row.fields_of_research || "").toLowerCase();
  const profileText = researcherText(row);
  const coreText = researcherCoreText(row);
  const groups = conceptGroups(query, terms);
  const phrases = directQueryPhrases(query);
  let score = 0;

  for (const phrase of phrases) {
    if (titleText.includes(phrase)) score += 0.55;
    if (fieldsText.includes(phrase)) score += 0.3;
    if (profileText.includes(phrase)) score += 0.25;
  }

  let titleHits = 0;
  let fieldHits = 0;
  let profileHits = 0;
  for (const term of terms) {
    const variants = expandedTermVariants(term);
    if (textHasAny(titleText, variants)) titleHits += 1;
    if (textHasAny(fieldsText, variants)) fieldHits += 1;
    if (textHasAny(profileText, variants)) profileHits += 1;
  }

  const denominator = Math.max(1, Math.min(4, terms.length));
  score += Math.min(0.45, (titleHits / denominator) * 0.45);
  score += Math.min(0.25, (fieldHits / denominator) * 0.25);
  score += Math.min(0.2, (profileHits / Math.max(1, Math.min(6, terms.length))) * 0.2);

  if (ROLE_AUTHORITY_TERMS.some(role => titleText.includes(role)) && (titleHits > 0 || fieldHits > 0)) {
    score += 0.12;
  }

  if (groups.hasMethodIntent && groups.domainTerms.length > 0 && !hasMethodEvidence(coreText)) {
    score = Math.min(score, 0.28);
  }

  return Math.max(0, Math.min(1, score));
}

function countOccurrences(text: string, phrase: string) {
  if (!text || !phrase) return 0;
  let count = 0;
  let index = text.indexOf(phrase);
  while (index !== -1 && count < 20) {
    count += 1;
    index = text.indexOf(phrase, index + phrase.length);
  }
  return count;
}

function exactProfileEvidenceScore(query: string, terms: string[], row: Record<string, unknown>) {
  const titleText = [
    row.position_name,
    row.position,
  ].map(value => String(value || "").toLowerCase()).join(" ");
  const fieldsText = String(row.fields_of_research || "").toLowerCase();
  const profileText = [
    row.bio_about,
    row.research,
  ].map(value => String(value || "").toLowerCase()).join(" ");
  const coreText = researcherCoreText(row);
  const departmentText = [
    row.affiliation,
    row.research,
  ].map(value => String(value || "").toLowerCase()).join(" ");
  const phrases = directQueryPhrases(query);
  let score = 0;

  for (const phrase of phrases) {
    if (titleText.includes(phrase)) score += 0.55;
    if (fieldsText.includes(phrase)) score += 0.35;
    if (departmentText.includes(phrase)) score += 0.25;
    const profileHits = countOccurrences(profileText, phrase);
    if (profileHits > 0) score += Math.min(0.78, 0.48 + profileHits * 0.05);
  }

  const meaningfulTerms = terms
    .map(singularise)
    .filter(term => term.length >= 3 && !["and", "for", "with", "the"].includes(term));
  const matchedTerms = meaningfulTerms.filter(term => textHasAny(coreText, expandedTermVariants(term))).length;
  if (meaningfulTerms.length > 0 && matchedTerms === meaningfulTerms.length) {
    score += 0.18;
  }

  if (ROLE_AUTHORITY_TERMS.some(role => titleText.includes(role)) && score > 0) {
    score += 0.08;
  }

  return Math.max(0, Math.min(1, score));
}

function scorePaper(query: string, terms: string[], paper: Record<string, unknown>) {
  const title = String(paper.title || "").toLowerCase();
  const abstract = String(paper.abstract || "").toLowerCase();
  const queryText = query.toLowerCase();
  let score = 0;

  for (const term of terms) {
    for (const variant of expandedTermVariants(term)) {
      if (title.includes(variant)) score += 2;
      if (abstract.includes(variant)) score += 2;
    }
  }

  if (queryText.length > 12) {
    if (title.includes(queryText)) score += 5;
    if (abstract.includes(queryText)) score += 5;
  }

  const citations = Number(paper.cited_by_count || 0);
  const year = Number(paper.publication_year || 0);
  score += Math.min(4, Math.log10(citations + 1));
  if (year >= 2020) score += 0.75;
  if (year >= 2024) score += 0.75;

  return score;
}

function paperSummary(paper: Record<string, unknown>, relevanceScore?: number, rawSimilarity?: number) {
  return {
    title: paper.title,
    abstract: truncateText(paper.abstract, 900),
    year: paper.publication_year,
    citations: paper.cited_by_count,
    journal: paper.source_display_name,
    relevance_score: relevanceScore,
    raw_similarity: rawSimilarity,
    openalex_work_id: paper.openalex_work_id,
    doi: paper.doi,
  };
}

function paperId(paper: Record<string, unknown>) {
  return String(paper.openalex_work_id || paper.id || paper.doi || paperKey(paper));
}

function paperKey(paper: Record<string, unknown>) {
  const title = String(paper.title || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
  return title || String(paper.openalex_work_id || "");
}

function mergePaperSummaries(
  semanticPapers: Record<string, unknown>[],
  rankedPapers: Record<string, unknown>[],
) {
  const seen = new Set<string>();
  const merged: Record<string, unknown>[] = [];

  for (const paper of [...semanticPapers, ...rankedPapers]) {
    const key = paperKey(paper);
    if (key && seen.has(key)) continue;
    if (key) seen.add(key);
    merged.push(paper);
    if (merged.length >= 10) break;
  }

  return merged;
}

function describePaper(paper: Record<string, unknown>) {
  const title = String(paper.title || "").trim();
  if (!title) return "";
  const year = paper.year || paper.publication_year;
  return year ? `${title} (${year})` : title;
}

function buildMatchReason(row: Record<string, unknown>, profileEvidence: string[]) {
  const name = String(row.full_name || "This researcher");
  const title = String(row.position_name || row.position || "Imperial researcher");
  const rawTopicEvidence = String(row.topic_evidence || "").trim();
  const paperTheme = rawTopicEvidence.match(/^paper theme:\s*(.+)$/i)?.[1]?.trim() || "";
  const papers = ((row.papers as Record<string, unknown>[]) || [])
    .slice(0, 2)
    .map(describePaper)
    .filter(Boolean);

  const profileSentence = profileEvidence.length > 0
    ? `${name} matches through their profile evidence: ${profileEvidence.join("; ")}.`
    : `${name} matches through their ${title.toLowerCase()} profile and research description.`;
  const topicSentence = paperTheme
    ? ` Their paper theme, ${paperTheme}, also aligns with the query.`
    : rawTopicEvidence
      ? ` ${rawTopicEvidence.replace(/[.!?]+$/, "")}.`
      : "";

  if (papers.length > 0) {
    return `${profileSentence}${topicSentence} Relevant publication evidence includes ${papers.join("; ")}, which supports the query topic.`;
  }

  return `${profileSentence}${topicSentence} No highly ranked paper evidence was needed for this match, so the score is driven mainly by profile, title, and field alignment.`;
}

function reorderPapersByTitles(papers: Record<string, unknown>[], titles: string[]) {
  if (titles.length === 0 || papers.length === 0) return papers;
  const normalizedTitles = titles.map(title => title.toLowerCase().replace(/\s+/g, " ").trim());
  return [...papers].sort((a, b) => {
    const aTitle = String(a.title || "").toLowerCase().replace(/\s+/g, " ").trim();
    const bTitle = String(b.title || "").toLowerCase().replace(/\s+/g, " ").trim();
    const aIndex = normalizedTitles.findIndex(title => title && (aTitle.includes(title) || title.includes(aTitle)));
    const bIndex = normalizedTitles.findIndex(title => title && (bTitle.includes(title) || title.includes(bTitle)));
    if (aIndex === -1 && bIndex === -1) return 0;
    if (aIndex === -1) return 1;
    if (bIndex === -1) return -1;
    return aIndex - bIndex;
  });
}

function normalizedTitle(value: unknown) {
  return String(value || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function titleMatches(candidateTitle: string, targetTitle: string) {
  const candidate = normalizedTitle(candidateTitle).replace(/\s+\(\d{4}\)$/, "");
  const target = normalizedTitle(targetTitle).replace(/\s+\(\d{4}\)$/, "");
  return Boolean(candidate && target && (candidate.includes(target) || target.includes(candidate)));
}

function rerankedPaperSummaries(
  existingPapers: Record<string, unknown>[],
  allPaperRecords: Record<string, unknown>[],
  selectedTitles: string[],
  selectedIds: string[] = [],
) {
  const selected: Record<string, unknown>[] = [];
  const seen = new Set<string>();
  const normalizedIds = selectedIds.map(id => String(id || "").trim()).filter(Boolean);

  for (const selectedId of normalizedIds) {
    const fromAll = allPaperRecords.find(paper => paperId(paper) === selectedId);
    const fromExisting = existingPapers.find(paper => paperId(paper) === selectedId);
    const paper = fromAll || fromExisting;
    if (!paper) continue;
    const key = paperKey(paper);
    if (key && seen.has(key)) continue;
    if (key) seen.add(key);
    selected.push(paperSummary(paper, Math.max(0.62, 0.98 - selected.length * 0.04)));
  }

  for (const selectedTitle of selectedTitles) {
    const fromAll = allPaperRecords.find(paper => titleMatches(String(paper.title || ""), selectedTitle));
    const fromExisting = existingPapers.find(paper => titleMatches(String(paper.title || ""), selectedTitle));
    const paper = fromAll || fromExisting;
    if (!paper) continue;
    const key = paperKey(paper);
    if (key && seen.has(key)) continue;
    if (key) seen.add(key);
    selected.push(paperSummary(paper, Math.max(0.62, 0.98 - selected.length * 0.04)));
  }

  for (const paper of reorderPapersByTitles(existingPapers, selectedTitles)) {
    const key = paperKey(paper);
    if (key && seen.has(key)) continue;
    if (key) seen.add(key);
    selected.push(paper);
    if (selected.length >= 10) break;
  }

  return selected.slice(0, 10);
}

function paperEvidenceForRerank(
  query: string,
  terms: string[],
  groups: ReturnType<typeof conceptGroups>,
  papers: Record<string, unknown>[],
) {
  return papers
    .map(paper => {
      const title = String(paper.title || "");
      const abstract = String(paper.abstract || "");
      const coverage = conceptCoverage(query, terms, paper, groups);
      const lexicalScore = scorePaper(query, terms, paper);
      return {
        paper,
        evidenceScore: lexicalScore + coverage * 12,
        hasAbstract: abstract.trim().length > 0,
        item: {
          paper_id: paperId(paper),
          title: truncateText(title, 240),
          abstract: truncateText(abstract, 650),
          year: paper.publication_year || null,
          citations: paper.cited_by_count || 0,
          journal: truncateText(paper.source_display_name, 120),
          relevance_hint: Math.round(Math.max(0, Math.min(100, (lexicalScore + coverage * 12) * 5))),
        },
      };
    })
    .filter(entry => entry.item.title)
    .sort((a, b) => {
      const scoreDiff = b.evidenceScore - a.evidenceScore;
      if (scoreDiff !== 0) return scoreDiff;
      if (a.hasAbstract !== b.hasAbstract) return a.hasAbstract ? -1 : 1;
      return Number(b.paper.cited_by_count || 0) - Number(a.paper.cited_by_count || 0);
    })
    .slice(0, 30)
    .map(entry => entry.item);
}

function isBogusDuplicateSuppression(rerank: RerankedCandidate) {
  return rerank.score <= 1
    && hasDuplicateRerankLanguage(rerank.reason || "");
}

function hasDuplicateRerankLanguage(reason: string) {
  return /\b(duplicate|already ranked|already represented|represented above|same candidate|same researcher)\b/i.test(reason);
}

function matchTypeForScore(score: number): "strong" | "adjacent" | "weak" {
  if (score >= 72) return "strong";
  if (score >= 48) return "adjacent";
  return "weak";
}

function keywordEvidenceMatchType(
  row: Record<string, unknown>,
  query: string,
): "strong" | "adjacent" | "weak" {
  const terms = queryTerms(query).map(singularise).filter(term => term.length >= 2);
  if (terms.length === 0) return "weak";

  const coreText = researcherCoreText(row);
  const authorityText = [
    row.position_name,
    row.position,
    row.fields_of_research,
  ].map(value => String(value || "").toLowerCase()).join(" ");
  const termCounts = terms.map(term => (
    Math.max(...expandedTermVariants(term).map(variant => countOccurrences(coreText, variant)))
  ));
  const allTermsPresent = termCounts.every(count => count > 0);
  const repeatedEvidence = termCounts.every(count => count >= 2);
  const directAuthorityMatch = directQueryPhrases(query).some(phrase => authorityText.includes(phrase))
    || terms.every(term => textHasAny(authorityText, expandedTermVariants(term)));
  const exactProfile = Number(row.exact_profile_evidence_score || 0);
  const profileConcept = Number(row.profile_concept_score || 0);
  const profileAuthority = Number(row.profile_authority_score || 0);

  if (
    directAuthorityMatch
    || (allTermsPresent && repeatedEvidence && exactProfile >= 0.68 && profileConcept >= 0.6)
    || (profileAuthority >= 0.68 && profileConcept >= 0.65)
  ) {
    return "strong";
  }

  if (allTermsPresent && (exactProfile >= 0.4 || profileConcept >= 0.45)) {
    return "adjacent";
  }

  return "weak";
}

function isStatementTimeoutError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const rpcError = error as { code?: unknown; message?: unknown };
  return String(rpcError.code || "") === "57014"
    || /statement timeout/i.test(String(rpcError.message || ""));
}

async function searchRpcWithStatementTimeoutRetry<T extends { error: unknown }>(
  label: string,
  operation: () => PromiseLike<T>,
) {
  let response = await operation();
  if (!isStatementTimeoutError(response.error)) return response;

  console.warn(`Search retrieval ${label} timed out; retrying once`);
  response = await operation();
  return response;
}

function searchRpcRows(
  label: string,
  response: { data: unknown; error: unknown },
  warnings: string[],
) {
  if (!response.error) {
    return Array.isArray(response.data)
      ? response.data as Record<string, unknown>[]
      : [];
  }
  if (isStatementTimeoutError(response.error)) {
    warnings.push(label);
    console.warn(`Search retrieval ${label} was omitted after a second statement timeout`);
    return [];
  }
  throw response.error;
}

function retrievalMatchType(
  row: Record<string, unknown>,
  score: number,
  strategy: SearchStrategy,
): "strong" | "adjacent" | "weak" {
  if (strategy !== "topic") return matchTypeForScore(score);

  const combined = Number(row.combined_similarity || 0);
  const topical = Number(row.topical_retrieval_score || 0);
  const topic = Number(row.topic_similarity || 0);
  const paper = Number(row.paper_similarity || 0);
  const exactProfile = Number(row.exact_profile_evidence_score || 0);
  const hasDirectTopicEvidence = topical >= 0.4
    || topic >= 0.18
    || paper >= 0.55
    || exactProfile >= 0.55;

  if (!hasDirectTopicEvidence || combined < 0.45) return "weak";
  if (combined >= 0.55 && score >= 72) return "strong";
  return "adjacent";
}

function exactEvidenceRerankFloor(row: Record<string, unknown>) {
  const exactProfileEvidence = Number(row.exact_profile_evidence_score || 0);
  if (exactProfileEvidence < 0.78) return 0;

  const queryText = String(row.current_query || "");
  const profileText = [
    row.bio_about,
    row.research,
  ].map(value => String(value || "").toLowerCase()).join(" ");
  const repeatedExactHits = directQueryPhrases(queryText)
    .reduce((maxHits, phrase) => Math.max(maxHits, countOccurrences(profileText, phrase)), 0);
  const profileAuthority = Number(row.profile_authority_score || 0);
  const profileConcept = Number(row.profile_concept_score || 0);
  const paperDepth = Number(row.paper_depth_score || 0);
  const titleText = [
    row.position_name,
    row.position,
  ].map(value => String(value || "").toLowerCase()).join(" ");
  const authorityBoost = ROLE_AUTHORITY_TERMS.some(role => titleText.includes(role)) ? 4 : 0;
  const repeatedExactBoost = repeatedExactHits >= 5 ? 4 : repeatedExactHits >= 3 ? 2 : 0;
  if (repeatedExactHits >= 5 && /\b(chair|director)\b/.test(titleText)) {
    return 100;
  }

  return Math.round(Math.min(
    99,
    78
      + exactProfileEvidence * 8
      + profileAuthority * 4
      + profileConcept * 3
      + paperDepth * 2
      + authorityBoost
      + repeatedExactBoost,
  ));
}

function methodDomainRerankCap(row: Record<string, unknown>, groups: ReturnType<typeof conceptGroups>) {
  if (!groups.hasMethodIntent || groups.domainTerms.length === 0) return 100;
  const score = Number(row.method_domain_evidence_score || 0);
  if (score >= 1) return 100;
  if (score >= 0.58) return 55;
  return 44;
}

function normalise(value: number, min: number, max: number, floor = 0.35, ceiling = 0.98) {
  if (!Number.isFinite(value)) return floor;
  if (max <= min) return ceiling;
  const ratio = (value - min) / (max - min);
  return Math.max(floor, Math.min(ceiling, floor + ratio * (ceiling - floor)));
}

function average(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function retrievalCandidateScore(
  row: Record<string, unknown>,
  index: number,
  minScore: number,
  maxScore: number,
  groups: ReturnType<typeof conceptGroups>,
  strategy: SearchStrategy,
) {
  const topicSearch = strategy === "topic";
  const evidenceScore = normalise(
    Number(row.combined_similarity || 0),
    minScore,
    maxScore,
    topicSearch ? 0.4 : 0.35,
    topicSearch ? 0.88 : 0.72,
  );
  const rankPenalty = Math.min(
    topicSearch ? 0.09 : 0.12,
    Math.log2(index + 1) * (topicSearch ? 0.009 : 0.012),
  );
  const externalBoost = Math.min(0.025, (((row.external_evidence as ExternalEvidence[]) || []).length) * 0.005);
  const score = Math.max(
    Math.round(Math.max(0.3, evidenceScore - rankPenalty + externalBoost) * 100),
    exactEvidenceRerankFloor(row),
  );
  return Math.min(score, methodDomainRerankCap(row, groups));
}

function truncateText(value: unknown, maxLength = 1200) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength).trim()}...`;
}

function parseJsonObject(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("OpenAI response did not contain JSON");
    return JSON.parse(match[0]);
  }
}

async function fetchJsonWithTimeout(url: string, init: RequestInit = {}, timeoutMs = 3500) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
    });
    if (!response.ok) return null;
    return await response.json();
  } catch (error) {
    console.error("External evidence fetch failed", error);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function createUsageMetrics(): UsageMetrics {
  return {
    calls: [],
    input_tokens: 0,
    output_tokens: 0,
    embedding_tokens: 0,
    total_tokens: 0,
    estimated_cost_usd: 0,
    missing_pricing_models: new Set<string>(),
  };
}

function modelPricing() {
  const raw = Deno.env.get("OPENAI_MODEL_PRICING_JSON");
  if (!raw) return DEFAULT_MODEL_PRICING_USD_PER_1M;
  try {
    const parsed = JSON.parse(raw) as Record<string, { input?: number; output?: number; embedding?: number }>;
    return {
      ...DEFAULT_MODEL_PRICING_USD_PER_1M,
      ...parsed,
    };
  } catch (error) {
    console.error("OPENAI_MODEL_PRICING_JSON could not be parsed", error);
    return DEFAULT_MODEL_PRICING_USD_PER_1M;
  }
}

function estimateOpenAiCostUsd(
  kind: UsageCall["kind"],
  model: string,
  inputTokens: number,
  outputTokens: number,
  metrics: UsageMetrics,
) {
  const pricing = modelPricing()[model];
  if (!pricing) {
    metrics.missing_pricing_models.add(model);
    return null;
  }

  if (kind === "embedding") {
    const price = pricing.embedding ?? pricing.input;
    if (typeof price !== "number") {
      metrics.missing_pricing_models.add(model);
      return null;
    }
    return (inputTokens / 1_000_000) * price;
  }

  if (typeof pricing.input !== "number" || typeof pricing.output !== "number") {
    metrics.missing_pricing_models.add(model);
    return null;
  }

  return (inputTokens / 1_000_000) * pricing.input
    + (outputTokens / 1_000_000) * pricing.output;
}

function recordOpenAiUsage(
  metrics: UsageMetrics | undefined,
  kind: UsageCall["kind"],
  model: string,
  usage: Record<string, unknown> | undefined,
) {
  if (!metrics || !usage) return;
  const inputTokens = Number(usage.prompt_tokens ?? usage.input_tokens ?? 0) || 0;
  const outputTokens = Number(usage.completion_tokens ?? usage.output_tokens ?? 0) || 0;
  const totalTokens = Number(usage.total_tokens ?? inputTokens + outputTokens) || 0;
  const estimatedCost = estimateOpenAiCostUsd(kind, model, inputTokens, outputTokens, metrics);

  metrics.input_tokens += inputTokens;
  metrics.output_tokens += outputTokens;
  if (kind === "embedding") {
    metrics.embedding_tokens += totalTokens || inputTokens;
  }
  metrics.total_tokens += totalTokens;
  if (estimatedCost !== null) {
    metrics.estimated_cost_usd += estimatedCost;
  }
  metrics.calls.push({
    kind,
    model,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    total_tokens: totalTokens,
    estimated_cost_usd: estimatedCost,
  });
}

function usageMetricsJson(metrics: UsageMetrics) {
  return {
    input_tokens: metrics.input_tokens,
    output_tokens: metrics.output_tokens,
    embedding_tokens: metrics.embedding_tokens,
    total_tokens: metrics.total_tokens,
    estimated_cost_usd: Number(metrics.estimated_cost_usd.toFixed(6)),
    missing_pricing_models: Array.from(metrics.missing_pricing_models),
    calls: metrics.calls,
  };
}

function constantTimeEqual(left: string, right: string) {
  const maxLength = Math.max(left.length, right.length);
  let diff = left.length === right.length ? 0 : 1;
  for (let index = 0; index < maxLength; index += 1) {
    diff |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return diff === 0;
}

async function insertSearchAuditLog(
  supabase: ReturnType<typeof createClient>,
  log: SearchAuditLog,
) {
  try {
    const { error } = await supabase
      .from("search_audit_logs")
      .insert({
        action: log.action || "search",
        status: log.status || "success",
        query: log.query || null,
        original_query: log.original_query || null,
        expanded_query: log.expanded_query || null,
        mode: log.mode || null,
        enable_rerank: log.enable_rerank ?? null,
        include_external_evidence: log.include_external_evidence ?? null,
        rewrite_used: log.rewrite_used ?? null,
        duration_ms: log.duration_ms ?? null,
        result_count: log.result_count ?? null,
        candidate_count: log.candidate_count ?? null,
        llm_pool_size: log.llm_pool_size ?? null,
        models: log.models || {},
        usage: log.usage || {},
        estimated_cost_usd: log.estimated_cost_usd ?? null,
        error_message: log.error_message || null,
        metadata: log.metadata || {},
      });
    if (error) console.error("Search audit log insert failed", error);
  } catch (error) {
    console.error("Search audit log insert failed", error);
  }
}

async function adminSearchLogs(
  supabase: ReturnType<typeof createClient>,
  body: SearchRequest,
) {
  const adminPassword = Deno.env.get("ITMAP_ADMIN_PASSWORD");
  const suppliedPassword = String(body.admin_password || "");
  if (!adminPassword) {
    return Response.json(
      { error: "Admin password is not configured." },
      { status: 503, headers: corsHeaders },
    );
  }
  if (!suppliedPassword || !constantTimeEqual(suppliedPassword, adminPassword)) {
    return Response.json(
      { error: "Invalid admin password." },
      { status: 401, headers: corsHeaders },
    );
  }

  const pageSize = Math.max(1, Math.min(Number(body.limit || 50), 100));
  const offset = Math.max(0, Number(body.offset || 0));
  const { data, error, count } = await supabase
    .from("search_audit_logs")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(offset, offset + pageSize - 1);

  if (error) throw error;
  return Response.json({ logs: data || [], count: count || 0 }, { headers: corsHeaders });
}

async function openAiJson(
  openAiKey: string,
  model: string,
  messages: Array<{ role: "system" | "user"; content: string }>,
  maxCompletionTokens = 1400,
  metrics?: UsageMetrics,
) {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openAiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages,
      response_format: { type: "json_object" },
      max_completion_tokens: maxCompletionTokens,
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`OpenAI JSON request failed: ${detail}`);
  }

  const json = await response.json();
  recordOpenAiUsage(metrics, "chat", model, json.usage);
  const content = json.choices?.[0]?.message?.content;
  if (!content) throw new Error("OpenAI JSON response was empty");
  return parseJsonObject(content);
}

async function createSearchEmbedding(
  openAiKey: string,
  input: string,
  metrics?: UsageMetrics,
) {
  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openAiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "text-embedding-3-small",
      input,
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Embedding request failed: ${detail}`);
  }

  const json = await response.json();
  recordOpenAiUsage(metrics, "embedding", "text-embedding-3-small", json.usage);
  const embedding = json.data?.[0]?.embedding;
  if (!Array.isArray(embedding)) {
    throw new Error("Embedding response did not include a vector");
  }
  return embedding;
}

async function openAiWebSearchJson(
  openAiKey: string,
  model: string,
  input: string,
  maxOutputTokens = 900,
  metrics?: UsageMetrics,
) {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openAiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      input,
      tools: [{ type: "web_search_preview" }],
      max_output_tokens: maxOutputTokens,
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`OpenAI web search request failed: ${detail}`);
  }

  const json = await response.json();
  recordOpenAiUsage(metrics, "web_search", model, json.usage);
  const outputText = json.output_text
    || (json.output || [])
      .flatMap((item: Record<string, unknown>) => item.content || [])
      .map((content: Record<string, unknown>) => content.text || "")
      .join("\n");
  if (!outputText) throw new Error("OpenAI web search response was empty");
  return parseJsonObject(outputText);
}

function implicitResearchTopic(query: string) {
  const cleaned = query
    .replace(/\b(?:at|from|within)\s+imperial(?:\s+college(?:\s+london)?)?\b/gi, " ")
    .replace(/\b(?:i|we)\s+(?:need|want|would\s+like)\s+to\s+(?:find|identify|look\s+for)\b/gi, " ")
    .replace(/\b(?:please\s+)?(?:find|list|show|identify|recommend)\s+(?:me\s+)?(?:some\s+)?(?:people|researchers|experts|academics|staff)\b/gi, " ")
    .replace(/\b(?:tell|give)\s+me\s+(?:about\s+)?(?:some\s+)?(?:people|researchers|experts|academics|staff)\b/gi, " ")
    .replace(/\b(?:people|researchers|experts|academics|staff)\s+(?:who|that)\s+(?:are\s+)?(?:working|work|speciali[sz](?:e|ing)|researching)\s+(?:on|in)\b/gi, " ")
    .replace(/^\s*(?:who\s+(?:is|are)\s+)?(?:working|works?|researching)\s+(?:on|in)\s+/i, "")
    .replace(/^\s*(?:on|in|about)\s+/i, "")
    .replace(/\s+/g, " ")
    .replace(/^[\s,;:.-]+|[\s,;:.-]+$/g, "")
    .trim();
  return expandResearchAbbreviations(cleaned || query.trim());
}

async function expandMission(openAiKey: string, model: string, query: string, metrics?: UsageMetrics): Promise<MissionExpansion> {
  const implicitTopic = implicitResearchTopic(query);
  const fallback: MissionExpansion = {
    expanded_query: implicitTopic || query,
    search_strategy: inferSearchStrategy(query),
  };
  try {
    const result = await openAiJson(
      openAiKey,
      model,
      [
        {
          role: "system",
          content: [
            "You rewrite search queries for an expert-finding system.",
            "The system always searches for Imperial College London researchers, so finding people at Imperial is implicit.",
            "Remove interface instructions such as find, list, show or recommend people, researchers or experts at Imperial.",
            "Extract the actual research theme, problem, method, application domain, population and outcome the user cares about.",
            "Always interpret the standalone abbreviation AI as artificial intelligence.",
            "Preserve conjunctions and relationships between central requirements. For example, climate change impacts on health must retain both climate change and health as must-have concepts.",
            "Do not turn a precise topic into a broad wishlist and do not add unrelated synonyms, sectors, methods or outcomes.",
            "For a long brief, retain its concrete requirements while producing a concise, evidence-oriented search query.",
            "Do not name or suggest researchers.",
            "Put only indispensable concepts in must_have. Put methods in method_terms and research/application domains in domain_terms.",
            "Classify the request as topic when it is primarily a subject, field, method, or concise method+domain combination, such as pesticides, atmospheric physics, or foundation models for health.",
            "Classify it as brief when it asks to assemble a team, event, panel, programme, collaboration, mission, or satisfy several distinct requirements.",
            "Return JSON only with keys: expanded_query, must_have, nice_to_have, method_terms, domain_terms, search_strategy.",
          ].join(" "),
        },
        {
          role: "user",
          content: JSON.stringify({
            original_query: truncateText(query, 20000),
            topic_after_removing_interface_instructions: truncateText(implicitTopic, 16000),
          }),
        },
      ],
      900,
      metrics,
    ) as MissionExpansion;

    const expanded = expandResearchAbbreviations(truncateText(result.expanded_query || implicitTopic || query, 900));
    return {
      expanded_query: expanded || implicitTopic || query,
      must_have: Array.isArray(result.must_have) ? result.must_have.slice(0, 8).map(item => expandResearchAbbreviations(String(item))) : [],
      nice_to_have: Array.isArray(result.nice_to_have) ? result.nice_to_have.slice(0, 8).map(item => expandResearchAbbreviations(String(item))) : [],
      method_terms: Array.isArray(result.method_terms) ? result.method_terms.slice(0, 8).map(item => expandResearchAbbreviations(String(item))) : [],
      domain_terms: Array.isArray(result.domain_terms) ? result.domain_terms.slice(0, 10).map(item => expandResearchAbbreviations(String(item))) : [],
      search_strategy: result.search_strategy === "topic" || result.search_strategy === "brief"
        ? result.search_strategy
        : inferSearchStrategy(query, result),
    };
  } catch (error) {
    console.error("Mission expansion failed", error);
    return fallback;
  }
}

function classifyExternalEvidence(text: string): ExternalEvidence["evidence_type"] {
  const normalized = text.toLowerCase();
  if (/\b(ukri|grant|funded|funding|award|project)\b/.test(normalized)) return "grant";
  if (/\b(video|webinar|youtube|vimeo|talk|lecture|recording|seminar)\b/.test(normalized)) return "video";
  if (/\b(startup|start-up|spinout|spin-out|company|venture|founder|co-founder|commerciali[sz]ation)\b/.test(normalized)) return "startup";
  if (/\b(media|news|interview|podcast|bbc|guardian|times|conversation|press|feature)\b/.test(normalized)) return "media";
  return "general";
}

async function fetchOpenAiWebEvidence(
  openAiKey: string,
  model: string,
  row: Record<string, unknown>,
  query: string,
  metrics?: UsageMetrics,
): Promise<ExternalEvidence[]> {
  const name = String(row.full_name || "").trim();
  if (!name) return [];

  try {
    const result = await openAiWebSearchJson(
      openAiKey,
      Deno.env.get("OPENAI_WEB_SEARCH_MODEL") || model,
      [
        "Search the public web for concise external evidence about this Imperial College London researcher.",
        "Focus on query-relevant media appearances, interviews, news coverage, videos, recorded talks, webinars, startups, spinouts, companies, founder roles, patents, policy or public-impact activity.",
        "Do not include ordinary academic profile pages unless they mention translational/public impact.",
        "Return JSON only with shape: {\"evidence\":[{\"title\":\"...\",\"snippet\":\"...\",\"url\":\"...\",\"evidence_type\":\"media|startup|grant|video|general\"}]}",
        "Use evidence_type video for YouTube, Vimeo, webinars, recorded seminars, conference talks, or public lecture recordings.",
        "Keep at most 4 evidence items. Use only evidence you can find in public web results.",
        `Researcher: ${name}`,
        `Imperial role: ${row.position_name || row.position || ""}`,
        `Department: ${row.affiliation || row.research || ""}`,
        `Query: ${query}`,
      ].join("\n"),
      900,
      metrics,
    ) as { evidence?: Array<Record<string, unknown>> };

    const evidence = Array.isArray(result.evidence) ? result.evidence : [];
    return evidence
      .map(item => {
        const title = truncateText(item.title, 160);
        const snippet = truncateText(item.snippet, 260);
        const url = String(item.url || "");
        const requestedType = String(item.evidence_type || "") as ExternalEvidence["evidence_type"];
        const evidenceText = `${title} ${snippet} ${url}`;
        const evidenceType = ["media", "startup", "grant", "video", "general"].includes(requestedType)
          ? requestedType
          : classifyExternalEvidence(evidenceText);
        return {
          source: "openai_web" as const,
          evidence_type: evidenceType,
          title,
          snippet,
          url,
        };
      })
      .filter(item => item.title)
      .slice(0, 4);
  } catch (error) {
    console.error("OpenAI web evidence failed", error);
    return [];
  }
}

function ukriLinks(value: unknown): Record<string, unknown>[] {
  const linkValue = (value as Record<string, unknown> | undefined)?.link;
  if (Array.isArray(linkValue)) return linkValue as Record<string, unknown>[];
  return linkValue ? [linkValue as Record<string, unknown>] : [];
}

function normalisePersonName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function ukriPersonMatches(person: Record<string, unknown>, fullName: string) {
  const expected = normalisePersonName(fullName);
  const candidate = normalisePersonName([
    person.firstName,
    person.otherNames,
    person.surname,
  ].filter(Boolean).join(" "));

  if (!expected || !candidate) return false;
  if (candidate === expected) return true;

  const expectedParts = expected.split(/\s+/).filter(Boolean);
  const candidateParts = candidate.split(/\s+/).filter(Boolean);
  const expectedFirst = expectedParts[0];
  const expectedLast = expectedParts[expectedParts.length - 1];
  const candidateFirst = candidateParts[0];
  const candidateLast = candidateParts[candidateParts.length - 1];

  return Boolean(expectedFirst && expectedLast && expectedFirst === candidateFirst && expectedLast === candidateLast);
}

function missionEvidenceMatches(text: string, query: string, terms: string[]) {
  const groups = conceptGroups(query, terms);
  return conceptCoverage(
    query,
    terms,
    { title: text, abstract: text, source_display_name: "" },
    groups,
  ) >= 1;
}

async function fetchUkriEvidence(row: Record<string, unknown>, query: string): Promise<ExternalEvidence[]> {
  const name = String(row.full_name || "").trim();
  if (!name) return [];

  const personUrl = new URL("https://gtr.ukri.org/gtr/api/persons");
  personUrl.searchParams.set("q", name);
  personUrl.searchParams.set("fetchSize", "10");

  const personJson = await fetchJsonWithTimeout(
    personUrl.toString(),
    { headers: { Accept: "application/json" } },
    4500,
  ) as Record<string, unknown> | null;

  const personValue = personJson?.person;
  const people = Array.isArray(personValue)
    ? personValue
    : personValue
      ? [personValue]
      : [];
  const matchedPerson = (people as Record<string, unknown>[]).find(person => ukriPersonMatches(person, name));
  if (!matchedPerson) return [];

  const projectLinks = ukriLinks(matchedPerson.links)
    .filter(link => ["PI_PER", "COI_PER", "PM_PER"].includes(String(link.rel || "")))
    .map(link => String(link.href || "").replace(/^http:\/\//, "https://"))
    .filter(Boolean)
    .slice(0, 8);
  if (projectLinks.length === 0) return [];

  const terms = queryTerms(query);
  const projects = await Promise.all(projectLinks.map(link =>
    fetchJsonWithTimeout(link, { headers: { Accept: "application/json" } }, 4500) as Promise<Record<string, unknown> | null>
  ));

  return projects
    .filter((project): project is Record<string, unknown> => Boolean(project))
    .map(project => {
      const title = truncateText(project.title || project.projectTitle || project.name, 170);
      const id = String(project.id || project.href || "").replace(/^https?:\/\/gtr\.ukri\.org\/gtr\/api\/projects\//, "");
      const snippet = truncateText(
        project.abstractText || project.techAbstractText || project.potentialImpact || project.abstract || project.description,
        260,
      );
      const url = id.startsWith("http")
        ? id
        : id
          ? `https://gtr.ukri.org/projects?ref=${encodeURIComponent(id)}`
          : undefined;
      return {
        source: "ukri" as const,
        evidence_type: "grant" as const,
        title,
        snippet,
        url,
      };
    })
    .filter(item => item.title)
    .filter(item => missionEvidenceMatches(`${item.title} ${item.snippet || ""}`, query, terms))
    .slice(0, 5);
}

async function addExternalEvidenceToCandidates(
  openAiKey: string,
  model: string,
  candidates: Record<string, unknown>[],
  query: string,
  metrics?: UsageMetrics,
) {
  const concurrency = 4;
  let index = 0;

  async function worker() {
    while (index < candidates.length) {
      const candidate = candidates[index++];
      const [webEvidence, ukriEvidence] = await Promise.all([
        fetchOpenAiWebEvidence(openAiKey, model, candidate, query, metrics),
        fetchUkriEvidence(candidate, query),
      ]);
      candidate.external_evidence = [...webEvidence, ...ukriEvidence].slice(0, 8);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, candidates.length) }, worker));
}

function candidateEvidence(row: Record<string, unknown>) {
  const papers = ((row.papers as Record<string, unknown>[]) || []).slice(0, 8).map(paper => ({
    paper_id: paperId(paper),
    title: truncateText(paper.title, 220),
    abstract: truncateText(paper.abstract, 500),
    year: paper.year || paper.publication_year || null,
    relevance_score: paper.relevance_score || null,
  }));
  const allPaperEvidence = ((row.all_paper_evidence as Record<string, unknown>[]) || []).slice(0, 30);

  return {
    researcher_id: row.researcher_id,
    name: row.full_name,
    title: row.position_name || row.position,
    department: row.affiliation || row.research,
    faculty: row.faculty,
    fields_of_research: truncateText(row.fields_of_research, 500),
    profile: truncateText(row.bio_about || row.document_text, 1400),
    profile_evidence: row.profile_evidence || [],
    current_score: row.similarity,
    profile_authority_score: row.profile_authority_score || 0,
    profile_concept_score: row.profile_concept_score || 0,
    paper_similarity: row.paper_similarity || 0,
    paper_depth_score: row.paper_depth_score || 0,
    topical_retrieval_score: row.topical_retrieval_score || 0,
    topic_similarity: row.topic_similarity || 0,
    topic_evidence: row.topic_evidence || "",
    openalex_topics: ((row.openalex_topics as OpenAlexTopicEvidence[]) || []).slice(0, 8).map(topic => ({
      openalex_topic_id: topic.openalex_topic_id,
      label: truncateText(topic.label, 180),
      description: truncateText(topic.description, 320),
      keywords: topic.keywords.slice(0, 8),
      field: topic.field_name,
      subfield: topic.subfield_name,
      relevance: topic.relevance,
      topic_strength: topic.topic_strength,
      paper_count: topic.paper_count,
      recent_paper_count: topic.recent_paper_count,
      trend: topic.trend,
    })),
    exact_profile_evidence_score: row.exact_profile_evidence_score || 0,
    papers,
    all_paper_evidence: allPaperEvidence,
    all_paper_evidence_count: allPaperEvidence.length,
    all_paper_total_count: row.all_paper_total_count || allPaperEvidence.length,
    external_evidence: ((row.external_evidence as ExternalEvidence[]) || []).slice(0, 4).map(item => ({
      source: item.source,
      evidence_type: item.evidence_type,
      title: truncateText(item.title, 180),
      snippet: truncateText(item.snippet, 240),
      url: item.url,
    })),
  };
}

function schoolMissionEvidence(researcher: SchoolMissionResearcher) {
  return {
    researcher_id: String(researcher.id || researcher.name || ""),
    name: truncateText(researcher.name, 120),
    title: truncateText(researcher.title, 160),
    department: truncateText(researcher.department, 160),
    faculty: truncateText(researcher.faculty, 160),
    profile: truncateText(researcher.summary, 1200),
    keywords: Array.isArray(researcher.keywords) ? researcher.keywords.slice(0, 12).map(String) : [],
    match_reason: truncateText(researcher.match_reason, 650),
    paper_titles: Array.isArray(researcher.publications)
      ? researcher.publications.map(title => truncateText(title, 180)).slice(0, 20)
      : [],
    external_evidence: Array.isArray(researcher.external_evidence)
      ? researcher.external_evidence.slice(0, 5).map(item => ({
        evidence_type: item.evidence_type,
        title: truncateText(item.title, 160),
        snippet: truncateText(item.snippet, 220),
      }))
      : [],
  };
}

function poolSummaryEvidence(researcher: SchoolMissionResearcher) {
  return {
    researcher_id: String(researcher.id || researcher.name || ""),
    name: truncateText(researcher.name, 120),
    title: truncateText(researcher.title, 160),
    department: truncateText(researcher.department, 160),
    faculty: truncateText(researcher.faculty, 160),
    profile: truncateText(researcher.summary, 700),
    keywords: Array.isArray(researcher.keywords) ? researcher.keywords.slice(0, 10).map(String) : [],
    match_reason: truncateText(researcher.match_reason, 420),
    openalex_topics: Array.isArray(researcher.openalex_topics)
      ? researcher.openalex_topics.slice(0, 8).map(item => truncateText(item, 160))
      : [],
    paper_titles: Array.isArray(researcher.publications)
      ? researcher.publications.map(title => truncateText(title, 180)).slice(0, 10)
      : [],
  };
}

async function matchSchoolMissionsWithLlm(
  openAiKey: string,
  model: string,
  query: string,
  researchers: SchoolMissionResearcher[],
) {
  if (researchers.length === 0) return [] as SchoolMissionMatch[];

  const result = await openAiJson(
    openAiKey,
    model,
    [
      {
        role: "system",
        content: [
          "You match Imperial College London researchers to the School of Convergence Science missions.",
          "Use only the supplied researcher evidence and the supplied mission brief.",
          "Assign a mission only when the profile, role, keywords, paper titles or evidence make a plausible connection.",
          "Prefer the single strongest mission. If none are plausible, omit that researcher.",
          "Return JSON only: {\"mission_matches\":[{\"researcher_id\":\"...\",\"school\":\"...\",\"mission\":\"...\",\"confidence\":0-100,\"reason\":\"...\"}]}",
        ].join(" "),
      },
      {
        role: "user",
        content: JSON.stringify({
          user_search: query,
          school_missions: SCHOOL_MISSIONS,
          researchers: researchers.slice(0, 20).map(schoolMissionEvidence),
        }),
      },
    ],
    5000,
  ) as { mission_matches?: SchoolMissionMatch[] };

  const allowed = new Set(SCHOOL_MISSIONS.flatMap(school =>
    school.missions.map(mission => `${school.school}|||${mission.name}`)
  ));

  return (Array.isArray(result.mission_matches) ? result.mission_matches : [])
    .map(item => ({
      researcher_id: String(item.researcher_id || ""),
      school: truncateText(item.school, 90),
      mission: truncateText(item.mission, 90),
      confidence: Math.max(0, Math.min(100, Number(item.confidence || 0))),
      reason: truncateText(naturaliseProfileAnswer(item.reason), 500),
    }))
    .filter(item => item.researcher_id && allowed.has(`${item.school}|||${item.mission}`))
    .slice(0, researchers.length);
}

async function summarizePoolWithLlm(
  openAiKey: string,
  model: string,
  query: string,
  researchers: SchoolMissionResearcher[],
) {
  if (researchers.length === 0) {
    return {
      headline: "No researchers to summarise",
      summary: "",
      themes: [],
      notable_researchers: [],
      gaps: [],
    } as ResearchPoolSummary;
  }

  const result = await openAiJson(
    openAiKey,
    model,
    [
      {
        role: "system",
        content: [
          "You summarise the pool of relevant Imperial College London researchers returned by an expert-finding search.",
          "Use only the supplied researcher evidence. Do not invent publications, grants, affiliations, or capabilities.",
          "Use positions, profiles, match reasons, publication titles, and publication topics to explain the main expertise patterns in the full supplied pool, why the group is relevant to the user's query, and any obvious gaps or caveats.",
          "Write for a non-technical reader. Never mention prompts, payloads, supplied sets, candidate pools, databases, embeddings, vectors, models, or internal ranking steps.",
          "Write the summary field as a very concise 50-70 word overview. State only the strongest overall finding and the main spread of expertise, avoid repeating the notable-researcher list, and keep all detail for follow-up questions.",
          "Return JSON only: {\"headline\":\"...\",\"summary\":\"...\",\"themes\":[\"...\"],\"notable_researchers\":[{\"name\":\"...\",\"reason\":\"...\"}],\"gaps\":[\"...\"]}",
        ].join(" "),
      },
      {
        role: "user",
        content: JSON.stringify({
          user_search: query,
          researchers: researchers.slice(0, 80).map(poolSummaryEvidence),
        }),
      },
    ],
    4200,
  ) as ResearchPoolSummary;

  return {
    headline: truncateText(naturaliseProfileAnswer(result.headline || "What ITMAP found"), 140),
    summary: truncateText(naturaliseProfileAnswer(result.summary || ""), 650),
    themes: Array.isArray(result.themes) ? result.themes.map(item => truncateText(item, 120)).filter(Boolean).slice(0, 6) : [],
    notable_researchers: Array.isArray(result.notable_researchers)
      ? result.notable_researchers
        .map(item => ({
          name: truncateText(item.name, 120),
          reason: truncateText(naturaliseProfileAnswer(item.reason), 240),
        }))
        .filter(item => item.name && item.reason)
        .slice(0, 6)
      : [],
    gaps: Array.isArray(result.gaps) ? result.gaps.map(item => truncateText(naturaliseProfileAnswer(item), 160)).filter(Boolean).slice(0, 4) : [],
  };
}

function researchPoolChatRefusal() {
  return {
    answer: "I can help you interpret these search results, compare researchers, identify expertise and publication themes, or discuss gaps in the returned pool. Try asking which researchers best cover a particular part of the query, how two candidates differ, or which departments are represented.",
    evidence_titles: [],
    caveat: "",
  };
}

async function answerResearchPoolQuestion(
  openAiKey: string,
  model: string,
  searchQuery: string,
  question: string,
  researchers: SchoolMissionResearcher[],
  poolSummary?: ResearchPoolSummary,
  conversation: ResearchPoolChatMessage[] = [],
) {
  const trimmedQuestion = truncateText(question, 1200);
  if (!trimmedQuestion) throw new Error("Missing question");
  if (isOffTopicProfileQuestion(trimmedQuestion)) return researchPoolChatRefusal();

  const result = await openAiJson(
    openAiKey,
    model,
    [
      {
        role: "system",
        content: [
          "You answer serious follow-up questions about a completed ITMAP researcher search at Imperial College London.",
          "Use only the supplied search query, generated overview, researcher profiles, positions, departments, match reasons, publication titles, and OpenAlex topics.",
          "You may compare researchers, explain coverage across the pool, identify relevant expertise or papers, and point out gaps.",
          "Do not invent publications, affiliations, relationships, grants, or capabilities. If the evidence is insufficient, say so plainly.",
          "Politely refuse poems, recipes, jokes, roleplay, entertainment, personal advice, or requests unrelated to interpreting these search results.",
          "Write naturally. Do not mention databases, datasets, JSON, supplied evidence, prompts, models, or internal system details.",
          "Answer directly in 90-180 words unless a short list is clearly more useful.",
          "Return JSON only: {\"answer\":\"...\",\"evidence_titles\":[\"...\"],\"caveat\":\"...\"}",
        ].join(" "),
      },
      {
        role: "user",
        content: JSON.stringify({
          search_query: truncateText(searchQuery, 1200),
          question: trimmedQuestion,
          generated_overview: poolSummary ? {
            headline: truncateText(poolSummary.headline, 160),
            summary: truncateText(poolSummary.summary, 1200),
            themes: Array.isArray(poolSummary.themes) ? poolSummary.themes.slice(0, 8) : [],
            gaps: Array.isArray(poolSummary.gaps) ? poolSummary.gaps.slice(0, 5) : [],
          } : null,
          recent_conversation: conversation
            .filter(message => message?.role === "user" || message?.role === "assistant")
            .slice(-6)
            .map(message => ({
              role: message.role,
              content: truncateText(message.content, 900),
            })),
          researchers: researchers.slice(0, 80).map(poolSummaryEvidence),
        }),
      },
    ],
    2200,
  ) as { answer?: string; evidence_titles?: string[]; caveat?: string };

  return {
    answer: truncateText(naturaliseProfileAnswer(result.answer || "I could not answer that from the current search results."), 2200),
    evidence_titles: Array.isArray(result.evidence_titles)
      ? result.evidence_titles.map(String).filter(Boolean).slice(0, 8)
      : [],
    caveat: truncateText(naturaliseProfileAnswer(result.caveat || ""), 600),
  };
}

function chunkItems<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

async function rerankCandidateChunkWithLlm(
  openAiKey: string,
  model: string,
  originalQuery: string,
  mission: MissionExpansion,
  candidates: Record<string, unknown>[],
  metrics?: UsageMetrics,
) {
  if (candidates.length === 0) return new Map<string, RerankedCandidate>();

  try {
    const result = await openAiJson(
      openAiKey,
      model,
      [
        {
          role: "system",
          content: [
            "You are reranking Imperial College London researchers for a search query.",
            "Use only the supplied position, profile, fields, shortlisted papers, and all_paper_evidence. Do not invent papers, affiliations, or expertise.",
            "Candidate researcher_id values are already deduplicated by the system. Do not mark anyone as a duplicate, do not suppress anyone because they seem represented elsewhere, and never give score 0 for duplicate reasons.",
            "The all_paper_evidence list was selected after scanning every fetched paper title and abstract for that candidate. Use these title+abstract snippets to detect whether the person has a substantial publication pattern relevant to the query.",
            "OpenAlex paper topics summarise recurring themes across the candidate's publications. Use relevant topics as supporting breadth evidence, but verify them against the profile and paper titles/abstracts rather than treating one topic label as proof.",
            "When selecting best papers, prefer items from all_paper_evidence and return their paper_id values in best_paper_ids. The best papers should be specifically relevant to the query, not merely famous or highly cited.",
            "External evidence may include media appearances, startup/spinout signals, company activity, and UKRI grant/project records. Treat it as a small supporting signal only.",
            "Only give a small boost for external evidence when it is clearly relevant to the query or shows translational impact. Do not let generic publicity override weak research/profile evidence.",
            "UKRI grants and query-relevant startups/spinouts are stronger external signals than generic media mentions.",
            "Reward candidates who satisfy all central query requirements, especially method+domain combinations such as AI applied to weather.",
            "Demote adjacent candidates who match only the domain or only the method.",
            "Score each candidate absolutely against the query, not relative to only the candidates in this request chunk.",
            "Do not penalize candidates because stronger candidates may exist outside this chunk.",
            "You must return one ranked item for every supplied candidate in this chunk. If evidence is weak, give a low score and match_type weak.",
            "Write each reason for a non-technical reader. State the expertise, the publication pattern that supports it, and any important limitation.",
            "Never mention prompts, payloads, supplied evidence, candidate lists, databases, datasets, embeddings, vectors, models, or internal ranking steps in a reason.",
            "Return JSON only: {\"ranked\":[{\"researcher_id\":\"...\",\"score\":0-100,\"match_type\":\"strong|adjacent|weak\",\"reason\":\"...\",\"best_paper_ids\":[\"...\"],\"best_paper_titles\":[\"...\"]}]}",
          ].join(" "),
        },
        {
          role: "user",
          content: JSON.stringify({
            original_mission: originalQuery,
            expanded_mission: mission,
            candidates: candidates.map(candidateEvidence),
          }),
        },
      ],
      8000,
      metrics,
    ) as { ranked?: RerankedCandidate[] };

    const ranked = Array.isArray(result.ranked) ? result.ranked : [];
    const byId = new Map<string, RerankedCandidate>();
    for (const item of ranked) {
      const researcherId = String(item.researcher_id || "");
      const score = Number(item.score);
      if (!researcherId || !Number.isFinite(score)) continue;
      const clampedScore = Math.max(0, Math.min(100, score));
      byId.set(researcherId, {
        researcher_id: researcherId,
        score: clampedScore,
        reason: truncateText(item.reason, 650),
        match_type: matchTypeForScore(clampedScore),
        best_paper_titles: Array.isArray(item.best_paper_titles) ? item.best_paper_titles.slice(0, 10).map(String) : [],
        best_paper_ids: Array.isArray(item.best_paper_ids) ? item.best_paper_ids.slice(0, 10).map(String) : [],
      });
    }
    return byId;
  } catch (error) {
    console.error("LLM rerank chunk failed", error);
    return new Map<string, RerankedCandidate>();
  }
}

async function rerankCandidatesWithLlm(
  openAiKey: string,
  model: string,
  originalQuery: string,
  mission: MissionExpansion,
  candidates: Record<string, unknown>[],
  metrics?: UsageMetrics,
) {
  if (candidates.length === 0) return new Map<string, RerankedCandidate>();

  const workerCount = Math.min(RERANK_WORKER_COUNT, candidates.length);
  const chunkSize = Math.ceil(candidates.length / workerCount);
  const candidateChunks = chunkItems(candidates, chunkSize);
  console.log(`LLM rerank: ${candidates.length} candidates across ${candidateChunks.length} parallel chunks`);

  const chunkResults = await Promise.all(candidateChunks.map(chunk =>
    rerankCandidateChunkWithLlm(openAiKey, model, originalQuery, mission, chunk, metrics)
  ));
  const byId = new Map<string, RerankedCandidate>();
  for (const chunkResult of chunkResults) {
    for (const [researcherId, rerank] of chunkResult) {
      byId.set(researcherId, rerank);
    }
  }
  return byId;
}

function profileSearchVariants(terms: string[]) {
  const variants = new Set<string>();
  const genericTerms = new Set([
    "application",
    "environmentally",
    "industrial",
    "innovation",
    "low",
    "related",
    "responsible",
  ]);

  for (const term of terms.map(singularise)) {
    if (genericTerms.has(term)) continue;
    for (const variant of expandedTermVariants(term)) {
      if (variant.length >= 3) variants.add(variant);
    }
  }

  return [...variants]
    .filter(variant => !["sustainable", "material", "materials"].includes(variant))
    .slice(0, 32);
}

function escapeIlike(value: string) {
  return value.replace(/[%_]/g, "\\$&").replace(/[,()]/g, " ");
}

function cleanKeywordSuggestion(value: string) {
  return value
    .replace(/[_/]+/g, " ")
    .replace(/[^\p{L}\p{N}\s&-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function keywordSuggestionTokens(value: string) {
  return cleanKeywordSuggestion(value)
    .toLowerCase()
    .split(/\s+/)
    .map(token => token.trim())
    .filter(token =>
      (token.length > 2 || token === "ai" || token === "ml")
      && !STOP_WORDS.has(token)
      && !/^\d+$/.test(token)
    );
}

function isUsefulKeywordSuggestion(value: string) {
  const cleaned = cleanKeywordSuggestion(value);
  const lowered = cleaned.toLowerCase();
  const tokens = keywordSuggestionTokens(cleaned);
  if (tokens.length === 0 || tokens.length > 5) return false;
  if (cleaned.length < 3 || cleaned.length > 70) return false;
  if (STOP_WORDS.has(lowered)) return false;
  if (["faculty", "department", "university", "group", "centre", "center"].includes(lowered)) return false;
  return true;
}

function addKeywordSuggestion(
  counts: Map<string, number>,
  value: string,
  weight: number,
) {
  const cleaned = cleanKeywordSuggestion(value);
  if (!isUsefulKeywordSuggestion(cleaned)) return;
  const key = cleaned.toLowerCase();
  counts.set(key, (counts.get(key) || 0) + weight);
}

function addKeywordSuggestionsFromText(
  counts: Map<string, number>,
  value: unknown,
  weight: number,
) {
  const text = cleanKeywordSuggestion(String(value || ""));
  if (!text) return;
  const tokens = keywordSuggestionTokens(text);
  for (const token of tokens) addKeywordSuggestion(counts, token, weight);
  for (let size = 2; size <= 3; size += 1) {
    for (let index = 0; index <= tokens.length - size; index += 1) {
      addKeywordSuggestion(counts, tokens.slice(index, index + size).join(" "), weight + size);
    }
  }
}

async function buildKeywordSuggestions(supabase: ReturnType<typeof createClient>) {
  const now = Date.now();
  if (
    keywordSuggestionCache
    && keywordSuggestionCache.suggestions.length > 0
    && now - keywordSuggestionCache.createdAt < KEYWORD_SUGGESTION_TTL_MS
  ) {
    return keywordSuggestionCache.suggestions;
  }

  const counts = new Map<string, number>();
  const pageSize = 1000;
  let from = 0;

  while (from < 12000) {
    const { data, error } = await supabase
      .from("researchers")
      .select("fields_of_research,bio_about,research,position_name,position,affiliation,faculty")
      .range(from, from + pageSize - 1);

    if (error) throw error;
    const rows = data || [];

    for (const row of rows) {
      const fields = String(row.fields_of_research || "");
      fields
        .split(/[;,|]/)
        .map(item => item.trim())
        .filter(Boolean)
        .forEach(item => addKeywordSuggestion(counts, item, 12));

      addKeywordSuggestionsFromText(counts, row.fields_of_research, 5);
      addKeywordSuggestionsFromText(counts, row.bio_about, 1);
      addKeywordSuggestionsFromText(counts, row.research, 1);
      addKeywordSuggestion(counts, String(row.affiliation || ""), 3);
      addKeywordSuggestion(counts, String(row.faculty || ""), 2);
    }

    if (rows.length < pageSize) break;
    from += pageSize;
  }

  from = 0;
  while (from < 12000) {
    const { data, error } = await supabase
      .from("researcher_documents")
      .select("document_text")
      .range(from, from + pageSize - 1);

    if (error) throw error;
    const rows = data || [];

    for (const row of rows) {
      addKeywordSuggestionsFromText(counts, row.document_text, 1);
    }

    if (rows.length < pageSize) break;
    from += pageSize;
  }

  const suggestions = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([keyword]) => keyword)
    .filter(keyword => !keyword.includes("undefined"))
    .slice(0, 250);

  const finalSuggestions = suggestions.length > 0 ? suggestions : FALLBACK_KEYWORD_SUGGESTIONS;
  keywordSuggestionCache = { createdAt: now, suggestions: finalSuggestions };
  return finalSuggestions;
}

async function keywordSuggestions(
  supabase: ReturnType<typeof createClient>,
  query: string,
) {
  const suggestions = await buildKeywordSuggestions(supabase);
  const cleanedQuery = cleanKeywordSuggestion(query).toLowerCase();
  if (!cleanedQuery) return suggestions.slice(0, 80);

  return suggestions
    .filter(keyword => keyword.includes(cleanedQuery))
    .slice(0, 40);
}

function normalizeName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function nameTokens(value: string) {
  return normalizeName(value)
    .split(/[\s-]+/)
    .map(token => token.trim())
    .filter(token => token.length >= 2);
}

function editDistance(a: string, b: string) {
  if (a === b) return 0;
  if (!a) return b.length;
  if (!b) return a.length;
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  const current = Array.from({ length: b.length + 1 }, () => 0);

  for (let i = 1; i <= a.length; i += 1) {
    current[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + cost,
      );
    }
    for (let j = 0; j <= b.length; j += 1) previous[j] = current[j];
  }

  return previous[b.length];
}

function tokenSimilarity(queryToken: string, candidateToken: string) {
  if (!queryToken || !candidateToken) return 0;
  if (candidateToken === queryToken) return 1;
  if (candidateToken.startsWith(queryToken) || queryToken.startsWith(candidateToken)) return 0.92;
  const distance = editDistance(queryToken, candidateToken);
  return Math.max(0, 1 - distance / Math.max(queryToken.length, candidateToken.length));
}

function researcherNameScore(query: string, fullName: string) {
  const queryParts = nameTokens(query);
  const candidateParts = nameTokens(fullName);
  if (queryParts.length === 0 || candidateParts.length === 0) return 0;

  const normalizedQuery = normalizeName(query);
  const normalizedCandidate = normalizeName(fullName);
  if (normalizedCandidate === normalizedQuery) return 1;

  const matched = queryParts.map(queryPart =>
    Math.max(...candidateParts.map(candidatePart => tokenSimilarity(queryPart, candidatePart)))
  );
  const averageScore = matched.reduce((sum, score) => sum + score, 0) / matched.length;
  const exactTokenMatches = queryParts.filter(queryPart => candidateParts.includes(queryPart)).length;
  const exactTokenRatio = exactTokenMatches / queryParts.length;
  const candidateCoveragePenalty = Math.max(0, candidateParts.length - queryParts.length) * 0.04;
  const exactPhraseBoost = normalizedCandidate.includes(normalizedQuery) ? 0.15 : 0;
  const allQueryTokensPresentBoost = queryParts.every(queryPart => candidateParts.includes(queryPart)) ? 0.18 : 0;
  return Math.min(1, Math.max(0, averageScore + exactPhraseBoost + allQueryTokensPresentBoost + exactTokenRatio * 0.08 - candidateCoveragePenalty));
}

async function fetchPapersForResearchers(
  supabase: ReturnType<typeof createClient>,
  researcherIds: string[],
) {
  if (researcherIds.length === 0) return [];

  const { data, error } = await supabase
    .from("researcher_papers")
    .select("researcher_id,openalex_work_id,title,abstract,publication_year,cited_by_count,source_display_name,doi")
    .in("researcher_id", researcherIds)
    .order("cited_by_count", { ascending: false, nullsFirst: false })
    .limit(Math.min(5000, Math.max(1000, researcherIds.length * 50)));

  if (error) throw error;
  return data || [];
}

async function fetchAllPapersForResearchers(
  supabase: ReturnType<typeof createClient>,
  researcherIds: string[],
) {
  if (researcherIds.length === 0) return new Map<string, Record<string, unknown>[]>();

  const papersByResearcher = new Map<string, Record<string, unknown>[]>();
  const pageSize = 1000;
  let from = 0;

  while (from < 20000) {
    const { data, error } = await supabase
      .from("researcher_papers")
      .select("researcher_id,openalex_work_id,title,abstract,publication_year,cited_by_count,source_display_name,doi")
      .in("researcher_id", researcherIds)
      .order("cited_by_count", { ascending: false, nullsFirst: false })
      .range(from, from + pageSize - 1);

    if (error) throw error;
    const rows = data || [];

    for (const paper of rows) {
      const researcherId = String(paper.researcher_id || "");
      const title = String(paper.title || "").replace(/\s+/g, " ").trim();
      if (!researcherId || !title) continue;
      const bucket = papersByResearcher.get(researcherId) || [];
      bucket.push(paper);
      papersByResearcher.set(researcherId, bucket);
    }

    if (rows.length < pageSize) break;
    from += pageSize;
  }

  return papersByResearcher;
}

async function suggestResearchersByName(
  supabase: ReturnType<typeof createClient>,
  query: string,
) {
  const terms = nameTokens(query).slice(0, 4);
  if (terms.length === 0) return [];

  const orFilter = terms
    .map(term => `full_name.ilike.%${escapeIlike(term)}%`)
    .join(",");

  const { data, error } = await supabase
    .from("researchers")
    .select("id,openalex_id,profile_url,full_name,position_name,position,affiliation,faculty")
    .or(orFilter)
    .limit(80);

  if (error) throw error;

  return (data || [])
    .map((row: Record<string, unknown>) => ({
      researcher_id: row.id,
      openalex_id: row.openalex_id,
      profile_url: row.profile_url,
      full_name: row.full_name,
      title: row.position_name || row.position,
      department: row.affiliation,
      faculty: row.faculty,
      score: researcherNameScore(query, String(row.full_name || "")),
    }))
    .filter(row => Number(row.score || 0) >= 0.45)
    .sort((a, b) => Number(b.score || 0) - Number(a.score || 0))
    .slice(0, 10);
}

function quickPersonQueryVariants(query: string) {
  const variants = new Set<string>();
  const cleaned = query
    .replace(/(['’])s\b/gi, "")
    .replace(/[?!.,;:]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const promptRemoved = cleaned
    .replace(/^(?:please\s+)?(?:tell me about|what can you tell me about|who is|who's|profile of|summari[sz]e|describe|explain)\s+/i, "")
    .trim();
  const beforeQualifier = promptRemoved
    .split(/\b(?:and|with|relationship|connection|role|links?|papers?|publications?|profile|research|at|in)\b/i)[0]
    .trim();

  // Pull likely names out of conversational questions before scoring. Without
  // this, words such as "how can I ask" dilute an exact name like Aldo Faisal.
  const conversationalWords = new Set([
    "a", "about", "an", "and", "are", "ask", "at", "be", "been", "between",
    "can", "collaboration", "connection", "could", "department", "describe", "do", "does", "explain", "experts", "find", "for", "from",
    "give", "has", "have", "he", "her", "his", "how", "i", "in", "is", "it",
    "imperial", "institute", "key", "link", "list", "london", "main", "major", "me", "my", "of", "on", "or", "our",
    "papers", "people", "person", "please", "profile", "publications", "research",
    "comparable", "like", "related", "relation", "relationship", "researcher", "researchers", "school", "search", "semantic", "she", "show", "similar", "suggest", "tell", "the", "their",
    "them", "they", "to", "topic", "topics", "us", "was", "we", "were", "what",
    "where", "which", "who", "why", "with", "work", "working", "works", "would",
    "you", "your",
  ]);
  const likelyNameTokens = cleaned
    .split(/\s+/)
    .map(token => token.trim())
    .filter(token => {
      const normalized = normalizeName(token);
      return normalized.length >= 2 && !conversationalWords.has(normalized);
    });

  if (likelyNameTokens.length > 0 && likelyNameTokens.length <= 4) {
    variants.add(likelyNameTokens.join(" "));
  }
  for (const windowSize of [2, 3]) {
    for (let index = 0; index + windowSize <= likelyNameTokens.length; index += 1) {
      variants.add(likelyNameTokens.slice(index, index + windowSize).join(" "));
    }
  }

  const capitalizedNames = cleaned.match(/\b[A-Z][A-Za-zÀ-ÿ'’-]+(?:\s+[A-Z][A-Za-zÀ-ÿ'’-]+){1,3}\b/g) || [];
  for (const name of capitalizedNames) {
    if (!/Imperial College|Quick Search|Researcher Profile/i.test(name)) {
      variants.add(name.trim());
    }
  }

  for (const value of [beforeQualifier, promptRemoved, cleaned, query]) {
    const normalized = value.replace(/\s+/g, " ").trim();
    if (normalized.length >= 3) variants.add(normalized);
  }

  return [...variants].slice(0, 6);
}

async function quickNameSuggestions(
  supabase: ReturnType<typeof createClient>,
  query: string,
) {
  const byResearcher = new Map<string, Record<string, unknown>>();
  for (const variant of quickPersonQueryVariants(query)) {
    const suggestions = await suggestResearchersByName(supabase, variant);
    for (const suggestion of suggestions) {
      const id = String(suggestion.researcher_id || "");
      if (!id) continue;
      const existing = byResearcher.get(id);
      if (!existing || Number(suggestion.score || 0) > Number(existing.score || 0)) {
        byResearcher.set(id, suggestion);
      }
    }
  }

  return [...byResearcher.values()]
    .sort((a, b) => Number(b.score || 0) - Number(a.score || 0))
    .slice(0, 8);
}

function quickTopicReason(query: string, terms: string[], row: Record<string, unknown>) {
  const evidence = matchedProfileEvidence(query, terms, row);
  if (evidence.length > 0) {
    return `Likely match through ${evidence.join("; ")}.`;
  }

  const fields = String(row.fields_of_research || "").replace(/\s+/g, " ").trim();
  if (fields) {
    return `Likely match through their fields of research: ${truncateText(fields, 180)}.`;
  }

  const department = String(row.affiliation || row.research || "").replace(/\s+/g, " ").trim();
  if (department) {
    return `Likely match through their Imperial role or department: ${truncateText(department, 180)}.`;
  }

  return "Likely match from profile and publication text in the quick keyword index.";
}

function quickTopicSearchQuery(query: string) {
  return query
    .replace(/\b(?:please|list|show|give|tell|name|identify)\b/gi, " ")
    .replace(/\b(?:impact|impacts|effect|effects)\s+of\b/gi, " ")
    .replace(/\b(?:people|person|researchers?|experts?)\b/gi, " ")
    .replace(/\b(?:connected|connection|connections|linked|links?|affiliated|affiliation)\b/gi, " ")
    .replace(/\b(?:to|with|at|in|from|who|whom|whose|work|works|working|on|are|is|the|of)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isQuickAffiliationQuery(query: string) {
  return /\bgrantham\b/i.test(query)
    || /\b(?:affiliated|affiliation|connected\s+to|associated\s+with|part\s+of|belongs?\s+to|members?|department|institute|school|faculty|centre|center|laboratory|lab)\b/i.test(query);
}

function isQuickOrganizationPeopleQuery(query: string) {
  if (/\b(?:co-?directors?|directors?|leadership|who runs|what is|what's|describe|explain)\b/i.test(query)) {
    return false;
  }

  const asksForPeople = /\b(?:who|people|researchers?|academics?|staff|members?|working|works?|based|affiliated|belongs?)\b/i.test(query);
  const namesOrganization = /\b(?:department|institute|school|faculty|centre|center|laboratory|lab|unit|grantham)\b/i.test(query);
  return asksForPeople && namesOrganization;
}

function quickAffiliationTerms(query: string) {
  const cleaned = quickTopicSearchQuery(query);
  const terms = new Set<string>();
  if (/\bgrantham\b/i.test(query)) {
    terms.add("Grantham");
    terms.add("Institute for Climate Change");
    terms.add("Climate Change");
  }
  if (cleaned.length >= 4) terms.add(cleaned);

  for (const term of queryTerms(cleaned)) {
    if (term.length >= 4 && !["people", "connected", "institute"].includes(term)) {
      terms.add(term);
    }
  }

  return [...terms].slice(0, 8);
}

function quickAffiliationScore(query: string, row: Record<string, unknown>) {
  const lowerQuery = query.toLowerCase();
  const affiliation = String(row.affiliation || "").toLowerCase();
  const research = String(row.research || "").toLowerCase();
  const bio = String(row.bio_about || "").toLowerCase();
  const fields = String(row.fields_of_research || "").toLowerCase();
  let score = 0.45;

  if (lowerQuery.includes("grantham")) {
    if (affiliation.includes("grantham") || affiliation.includes("institute for climate change")) score += 0.42;
    if (research.includes("grantham") || research.includes("institute for climate change")) score += 0.26;
    if (bio.includes("grantham")) score += 0.16;
  }

  const terms = queryTerms(quickTopicSearchQuery(query));
  const text = `${affiliation} ${research} ${bio} ${fields}`;
  const hits = terms.filter(term => textHasAny(text, expandedTermVariants(term))).length;
  score += Math.min(0.28, hits * 0.07);

  return Math.max(0.35, Math.min(0.98, score));
}

function quickAffiliationReason(query: string, row: Record<string, unknown>) {
  const affiliation = String(row.affiliation || "").replace(/\s+/g, " ").trim();
  const research = String(row.research || "").replace(/\s+/g, " ").trim();
  const bio = String(row.bio_about || "").replace(/\s+/g, " ").trim();

  if (/\bgrantham\b/i.test(query)) {
    if (/grantham|institute for climate change/i.test(affiliation)) {
      return `Connected through their Imperial affiliation: ${truncateText(affiliation, 180)}.`;
    }
    if (/grantham|institute for climate change/i.test(research)) {
      return `Connected through their Imperial department or research listing: ${truncateText(research, 180)}.`;
    }
    if (/grantham/i.test(bio)) {
      return `Connected through their profile, which mentions Grantham Institute activity.`;
    }
  }

  return quickTopicReason(query, queryTerms(query), row);
}

async function quickAffiliationSuggestions(
  supabase: ReturnType<typeof createClient>,
  query: string,
  limit = 8,
) {
  const terms = quickAffiliationTerms(query);
  if (terms.length === 0) return [];

  const filters = terms.flatMap(term => {
    const escaped = escapeIlike(term);
    return [
      `affiliation.ilike.%${escaped}%`,
      `research.ilike.%${escaped}%`,
      `bio_about.ilike.%${escaped}%`,
      `fields_of_research.ilike.%${escaped}%`,
    ];
  });

  const { data, error } = await supabase
    .from("researchers")
    .select("id,openalex_id,full_name,position_name,position,affiliation,faculty,research,bio_about,fields_of_research")
    .or(filters.join(","))
    .limit(80);

  if (error) throw error;

  return (data || [])
    .filter((row: Record<string, unknown>) => !isVisitingResearcher(row))
    .map((row: Record<string, unknown>) => ({
      researcher_id: row.id,
      openalex_id: row.openalex_id,
      full_name: row.full_name,
      title: row.position_name || row.position,
      department: row.affiliation || row.research,
      faculty: row.faculty,
      score: quickAffiliationScore(query, row),
      reason: quickAffiliationReason(query, row),
    }))
    .sort((a, b) => Number(b.score || 0) - Number(a.score || 0))
    .slice(0, limit);
}

function isSchoolOfConvergenceScienceQuery(query: string) {
  const text = query.toLowerCase();
  return /\bschool\s+of\s+convergence\s+science\b/.test(text)
    || /\bconvergence\s+science\s+school\b/.test(text)
    || /\bconvergence\s+science\b/.test(text)
    || /\bthe\s+school\b/.test(text)
    || /\bsocs\b/.test(text)
    || /\bscs\b/.test(text);
}

async function schoolCoDirectorSuggestions(
  supabase: ReturnType<typeof createClient>,
) {
  const names = SCHOOL_OF_CONVERGENCE_SCIENCE_INFO.themes.flatMap(theme => theme.co_directors);
  const suggestions: Record<string, unknown>[] = [];
  const seen = new Set<string>();

  for (const name of names) {
    const matches = await suggestResearchersByName(supabase, name);
    const best = matches.find(match => Number(match.score || 0) >= 0.78);
    const id = String(best?.researcher_id || "");
    if (!best || !id || seen.has(id)) continue;
    seen.add(id);
    const theme = SCHOOL_OF_CONVERGENCE_SCIENCE_INFO.themes.find(item => item.co_directors.includes(name));
    suggestions.push({
      ...best,
      score: 1,
      reason: theme ? `${theme.name} Co-Director` : "School of Convergence Science Co-Director",
    });
  }

  return suggestions;
}

async function schoolOfConvergenceScienceAnswer(
  supabase: ReturnType<typeof createClient>,
  query: string,
) {
  const info = SCHOOL_OF_CONVERGENCE_SCIENCE_INFO;
  const lowerQuery = query.toLowerCase();
  const wantsCoDirectors = /\bco-?directors?\b/.test(lowerQuery);
  const wantsDirectors = /\bdirector|co-?director|leadership|leads?|who runs\b/.test(lowerQuery);
  const wantsMissions = /\bmission|theme|themes\b/.test(lowerQuery);
  const wantsOperations = /\boperation|operations|manager|staff|team\b/.test(lowerQuery);

  const themeSummary = info.themes
    .map(theme => `${theme.name}: ${theme.missions.join(", ")}`)
    .join("; ");
  const directorSummary = [
    `Director: ${info.director}`,
    ...info.themes.map(theme => `${theme.name} Co-Directors: ${theme.co_directors.join(", ")}`),
  ].join("; ");
  const coDirectorSummary = info.themes
    .map(theme => `${theme.name}: ${theme.co_directors.join(", ")}`)
    .join("; ");

  let answer = wantsCoDirectors
    ? `The School of Convergence Science Co-Directors are: ${coDirectorSummary}.`
    : `${info.name} is ${info.purpose} It is organised around four themes: ${themeSummary}.`;

  if (!wantsCoDirectors && (wantsDirectors || !wantsMissions)) {
    answer += ` ${directorSummary}.`;
  }

  if (wantsOperations) {
    answer += ` Its operations leadership includes ${info.operations.join("; ")}.`;
  }

  return {
    kind: "information",
    answer,
    suggestions: wantsCoDirectors || wantsDirectors
      ? await schoolCoDirectorSuggestions(supabase)
      : [],
    evidence_titles: [
      "Imperial School of Convergence Science leadership and inaugural Co-Directors",
      ...(wantsCoDirectors ? [] : [
        "Imperial School of Convergence Science overview",
        "Imperial School of Convergence Science missions",
      ]),
    ],
    caveat: "This is a built-in institutional summary for quick orientation; use the School pages for the latest public announcements.",
  };
}

function normalizePersonName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\bprof(?:essor)?\.?\b/gi, "")
    .replace(/[^\p{L}\p{N}\s'-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function schoolRoleForResearcher(name: string) {
  const normalized = normalizePersonName(name);
  const info = SCHOOL_OF_CONVERGENCE_SCIENCE_INFO;
  if (normalized === normalizePersonName(info.director)) {
    return "Director of the School of Convergence Science";
  }

  for (const theme of info.themes) {
    const match = theme.co_directors.find(coDirector => normalizePersonName(coDirector) === normalized);
    if (match) {
      return `${theme.name} Co-Director for the School of Convergence Science`;
    }
  }

  return "";
}

function schoolThemeForCoDirector(name: string) {
  const normalized = normalizePersonName(name);
  return SCHOOL_OF_CONVERGENCE_SCIENCE_INFO.themes.find(theme =>
    theme.co_directors.some(coDirector => normalizePersonName(coDirector) === normalized)
  ) || null;
}

function schoolPersonRelationAnswer(researcher: Record<string, unknown>) {
  const name = String(researcher.full_name || "This researcher");
  const role = schoolRoleForResearcher(name);
  const answer = role
    ? `${name} is connected to the School of Convergence Science as ${role}.`
    : `${name} has an Imperial researcher profile in ITMAP, but I do not have a specific built-in School of Convergence Science leadership role recorded for them. Open their profile to check their department, publications, and research areas.`;

  return {
    kind: "person",
    answer,
    researcher,
    suggestions: [researcher],
    evidence_titles: role
      ? ["Imperial School of Convergence Science leadership and inaugural Co-Directors"]
      : [],
    caveat: role
      ? "This is a built-in institutional role lookup for the School of Convergence Science."
      : "This only checks the built-in School leadership list; it does not run a full Search query.",
  };
}

function isQuickPaperQuestion(query: string) {
  return /\b(?:has|have|did)\s+(?:anyone|anybody|any\s+(?:people|researchers?|academics?|experts?))\s+(?:at\s+imperial\s+)?(?:worked|published|written|studied|researched|investigated)\s+(?:on|about|in|into)\b/i.test(query)
    || /\b(?:who|which\s+(?:people|researchers?|academics?|experts?))\s+(?:at\s+imperial\s+)?(?:has|have)\s+(?:worked|published|written|studied|researched|investigated)\s+(?:on|about|in|into)\b/i.test(query)
    || /\b(?:find|show|list|give\s+me|what|which|any|relevant)\s+(?:me\s+)?(?:papers?|publications?|studies|works)\s+(?:on|about|into|covering|related\s+to)\b/i.test(query)
    || /\b(?:papers?|publications?|studies)\s+(?:on|about|into|covering|related\s+to)\b/i.test(query);
}

type QuickPaperGroup = {
  id: string;
  rows: Record<string, unknown>[];
  paperIds: Set<string>;
  maxSimilarity: number;
  imperialAuthors: Map<string, Record<string, unknown>>;
};

function quickPaperGroupKey(row: Record<string, unknown>) {
  const title = normalizedPublicationTitle(row.title);
  if (isSubstantivePublicationTitle(title)) return `title:${title}`;
  const workId = String(row.openalex_work_id || "").trim().toLowerCase();
  if (workId) return `work:${workId.split("/").filter(Boolean).pop()}`;
  return `paper:${String(row.paper_id || row.id || "")}`;
}

function quickPaperRepresentative(group: QuickPaperGroup) {
  const canonical = canonicalizePublicationRows(group.rows)[0];
  return canonical || group.rows[0];
}

function quickPaperResearcher(row: Record<string, unknown>) {
  return {
    researcher_id: row.researcher_id,
    openalex_id: row.openalex_id,
    profile_url: row.profile_url,
    full_name: row.full_name,
    title: row.position_name || row.position,
    department: row.affiliation,
    faculty: row.faculty,
    score: Number(row.similarity || 0),
    reason: "Author of this publication.",
  };
}

async function quickPaperSearch(
  supabase: ReturnType<typeof createClient>,
  openAiKey: string,
  model: string,
  originalQuery: string,
  topicQuery: string,
) {
  const embedding = await createSearchEmbedding(openAiKey, topicQuery);
  const response = await searchRpcWithStatementTimeoutRetry("quick paper evidence", () =>
    supabase.rpc("match_researcher_paper_documents", {
      query_embedding: embedding,
      match_count: 240,
      faculty_filters: [],
      role_filters: [],
    })
  );
  const warnings: string[] = [];
  const vectorRows = searchRpcRows("quick paper evidence", response, warnings)
    .filter(row => !isVisitingResearcher(row))
    .filter(row => String(row.paper_id || "") && String(row.title || "").trim())
    .sort((first, second) => Number(second.similarity || 0) - Number(first.similarity || 0));

  if (vectorRows.length === 0) {
    return {
      kind: "empty",
      answer: `I could not find a publication that clearly addresses "${truncateText(topicQuery, 180)}". Try a more specific phrase or use the full Search.`,
      suggestions: [],
      papers: [],
      evidence_titles: [],
      caveat: warnings.length > 0
        ? "The paper search took too long, so no reliable quick answer was available."
        : "This quick answer searches the paper titles and abstracts currently stored in ITMAP.",
    };
  }

  const bestSimilarity = Number(vectorRows[0]?.similarity || 0);
  const similarityFloor = Math.max(0.32, bestSimilarity - 0.22);
  const nearestRows = vectorRows
    .filter(row => Number(row.similarity || 0) >= similarityFloor)
    .slice(0, 140);
  const paperIds = [...new Set(nearestRows.map(row => String(row.paper_id || "")).filter(Boolean))];
  const { data: paperDetails, error: paperError } = await supabase
    .from("researcher_papers")
    .select("id,openalex_work_id,title,abstract,publication_year,cited_by_count,source_display_name,doi")
    .in("id", paperIds);
  if (paperError) throw paperError;

  const detailsById = new Map(
    (paperDetails || []).map((paper: Record<string, unknown>) => [String(paper.id || ""), paper]),
  );
  const grouped = new Map<string, QuickPaperGroup>();
  for (const vectorRow of nearestRows) {
    const paperId = String(vectorRow.paper_id || "");
    const row = {
      ...vectorRow,
      ...(detailsById.get(paperId) || {}),
      paper_id: paperId,
    };
    const key = quickPaperGroupKey(row);
    const group = grouped.get(key) || {
      id: "",
      rows: [],
      paperIds: new Set<string>(),
      maxSimilarity: 0,
      imperialAuthors: new Map<string, Record<string, unknown>>(),
    };
    group.rows.push(row);
    group.paperIds.add(paperId);
    group.maxSimilarity = Math.max(group.maxSimilarity, Number(row.similarity || 0));
    const researcherId = String(row.researcher_id || "");
    if (researcherId) group.imperialAuthors.set(researcherId, quickPaperResearcher(row));
    grouped.set(key, group);
  }

  const candidates = [...grouped.values()]
    .sort((first, second) => second.maxSimilarity - first.maxSimilarity)
    .slice(0, 36)
    .map((group, index) => {
      group.id = `P${index + 1}`;
      return group;
    });

  let rerankSucceeded = false;
  let selectedMatches: Array<{ key: string; reason: string }> = [];
  try {
    const reranked = await openAiJson(
      openAiKey,
      model,
      [
        {
          role: "system",
          content: [
            "You select publication evidence for a serious Imperial College London research question.",
            "Choose only papers that substantively address the requested topic, method, population, or application.",
            "Give the title and abstract equal evidential weight; a keyword appearing incidentally is not enough.",
            "Reject broad lexical coincidences, papers that only mention one half of a combined topic, and unrelated applications.",
            "Return between 3 and 10 matches when that many are genuinely relevant; otherwise return fewer, including none.",
            "Preserve the supplied paper_key exactly and rank strongest evidence first.",
            "For every match, write one natural sentence explaining the specific relevance without mentioning embeddings, vectors, databases, retrieval, candidates, or supplied evidence.",
            "Return JSON only: {\"matches\":[{\"paper_key\":\"P1\",\"reason\":\"...\"}]}",
          ].join(" "),
        },
        {
          role: "user",
          content: JSON.stringify({
            original_question: originalQuery,
            research_topic: topicQuery,
            publications: candidates.map(group => {
              const paper = quickPaperRepresentative(group);
              return {
                paper_key: group.id,
                title: truncateText(paper.title, 300),
                abstract: truncateText(paper.abstract, 950),
                year: paper.publication_year || null,
                journal: truncateText(paper.source_display_name, 140),
                imperial_authors: [...group.imperialAuthors.values()].map(author => author.full_name),
              };
            }),
          }),
        },
      ],
      1100,
    ) as { matches?: Array<{ paper_key?: unknown; key?: unknown; reason?: unknown }> };
    rerankSucceeded = true;
    const validKeys = new Set(candidates.map(group => group.id));
    selectedMatches = (Array.isArray(reranked.matches) ? reranked.matches : [])
      .map(match => ({
        key: String(match.paper_key || match.key || ""),
        reason: truncateText(match.reason, 360),
      }))
      .filter(match => validKeys.has(match.key))
      .slice(0, 10);
  } catch (error) {
    console.warn("Could not rerank quick paper evidence", error);
  }

  if (!rerankSucceeded) {
    selectedMatches = candidates
      .filter(group => group.maxSimilarity >= Math.max(0.42, bestSimilarity - 0.08))
      .slice(0, 8)
      .map(group => ({
        key: group.id,
        reason: "This publication is closely related in meaning to the requested research topic.",
      }));
  }

  const candidateById = new Map(candidates.map(group => [group.id, group]));
  const selected: Array<{ group: QuickPaperGroup; reason: string; paper: Record<string, unknown> }> = [];
  for (const match of selectedMatches) {
    const group = candidateById.get(match.key);
    if (!group) continue;
    const paper = quickPaperRepresentative(group);
    const normalizedTitle = normalizedPublicationTitle(paper.title);
    const year = Number(paper.publication_year || 0);
    const duplicate = selected.some(existing => {
      const existingTitle = normalizedPublicationTitle(existing.paper.title);
      const existingYear = Number(existing.paper.publication_year || 0);
      return normalizedTitle === existingTitle
        || (Math.abs(year - existingYear) <= 3
          && publicationTitleTokenSimilarity(normalizedTitle, existingTitle) >= 0.88);
    });
    if (!duplicate) selected.push({ group, reason: match.reason, paper });
  }

  if (selected.length === 0) {
    return {
      kind: "empty",
      answer: `I could not find a publication that clearly addresses "${truncateText(topicQuery, 180)}". Try a more specific phrase or use the full Search.`,
      suggestions: [],
      papers: [],
      evidence_titles: [],
      caveat: "ITMAP checked the closest stored titles and abstracts but did not find strong enough paper evidence.",
    };
  }

  const selectedPaperIds = [...new Set(selected.flatMap(item => [...item.group.paperIds]))];
  const { data: authorshipRows, error: authorshipError } = await supabase
    .from("researcher_paper_authors")
    .select("paper_id,coauthor_openalex_id,coauthor_name")
    .in("paper_id", selectedPaperIds);
  if (authorshipError) console.warn("Could not load quick paper authors", authorshipError);

  const groupByPaperId = new Map<string, QuickPaperGroup>();
  for (const item of selected) {
    for (const paperId of item.group.paperIds) groupByPaperId.set(paperId, item.group);
  }
  const authorsByGroup = new Map<string, Map<string, { name: string; openalex_id: string }>>();
  for (const authorship of (authorshipRows || []) as Record<string, unknown>[]) {
    const group = groupByPaperId.get(String(authorship.paper_id || ""));
    const name = String(authorship.coauthor_name || "").trim();
    if (!group || !name) continue;
    const openAlexId = String(authorship.coauthor_openalex_id || "").trim();
    const authorKey = openAlexAuthorKey(openAlexId) || normalizeName(name);
    const groupAuthors = authorsByGroup.get(group.id) || new Map();
    if (!groupAuthors.has(authorKey)) {
      groupAuthors.set(authorKey, { name, openalex_id: openAlexId });
    }
    authorsByGroup.set(group.id, groupAuthors);
  }

  const papers = selected.map(({ group, paper, reason }) => {
    const imperialAuthors = [...group.imperialAuthors.values()]
      .sort((first, second) => String(first.full_name || "").localeCompare(String(second.full_name || "")));
    const listedAuthors = [...(authorsByGroup.get(group.id)?.values() || [])];
    if (listedAuthors.length === 0) {
      for (const author of imperialAuthors) {
        listedAuthors.push({
          name: String(author.full_name || ""),
          openalex_id: String(author.openalex_id || ""),
        });
      }
    }
    return {
      paper_id: String(paper.paper_id || paper.id || [...group.paperIds][0] || ""),
      openalex_work_id: paper.openalex_work_id,
      title: paper.title,
      abstract: truncateText(paper.abstract, 700),
      publication_year: paper.publication_year,
      cited_by_count: paper.cited_by_count,
      source_display_name: paper.source_display_name,
      doi: paper.doi,
      reason,
      authors: listedAuthors,
      author_count: listedAuthors.length,
      imperial_authors: imperialAuthors,
    };
  });
  const imperialResearcherCount = new Set(
    selected.flatMap(item => [...item.group.imperialAuthors.keys()]),
  ).size;

  return {
    kind: "papers",
    answer: `Yes. I found ${papers.length} relevant publication${papers.length === 1 ? "" : "s"} involving ${imperialResearcherCount} Imperial researcher${imperialResearcherCount === 1 ? "" : "s"}. The strongest paper evidence is shown below.`,
    suggestions: [],
    papers,
    evidence_titles: [],
    caveat: "This quick answer searches stored paper titles and abstracts. It may miss publications that do not yet have a usable embedding.",
  };
}

async function quickTopicSuggestions(
  supabase: ReturnType<typeof createClient>,
  query: string,
  limit = 8,
  mission?: MissionExpansion,
  sourceQuery = query,
) {
  const searchQuery = quickTopicSearchQuery(query) || query;
  const structuredConcepts = mission?.must_have?.length
    ? mission.must_have
    : [...(mission?.method_terms || []), ...(mission?.domain_terms || [])];
  const termSource = structuredConcepts.length > 0 ? structuredConcepts.join(" ") : searchQuery;
  const terms = [...new Set(queryTerms(termSource))]
    .filter(term => !["impact", "impacts", "effect", "effects", "topic", "topics"].includes(term))
    .slice(0, 8);
  if (terms.length === 0) return [];
  const requiredTermQuery = terms.join(" AND ");

  const directMatches = isQuickAffiliationQuery(sourceQuery)
    ? await quickAffiliationSuggestions(supabase, sourceQuery, limit)
    : [];

  const { data, error } = await supabase.rpc("match_keyword_researchers", {
    search_query: requiredTermQuery,
    match_count: Math.max(20, limit * 4),
    faculty_filters: [],
    role_filters: [],
  });

  if (error) throw error;

  const keywordMatches = (data || [])
    .filter((row: Record<string, unknown>) => !isVisitingResearcher(row))
    .sort((a: Record<string, unknown>, b: Record<string, unknown>) => Number(b.similarity || 0) - Number(a.similarity || 0))
    .map((row: Record<string, unknown>) => ({
      researcher_id: row.researcher_id,
      openalex_id: row.openalex_id,
      full_name: row.full_name,
      title: row.position_name || row.position,
      department: row.affiliation,
      faculty: row.faculty,
      score: Number(row.similarity || 0),
      reason: quickTopicReason(searchQuery, terms, row),
    }));

  const byResearcher = new Map<string, Record<string, unknown>>();
  for (const row of [...directMatches, ...keywordMatches]) {
    const id = String(row.researcher_id || "");
    if (!id) continue;
    const existing = byResearcher.get(id);
    if (!existing || Number(row.score || 0) > Number(existing.score || 0)) {
      byResearcher.set(id, row);
    }
  }

  return [...byResearcher.values()]
    .sort((a, b) => Number(b.score || 0) - Number(a.score || 0))
    .slice(0, limit);
}

function quickPersonQuestion(query: string, researcher: Record<string, unknown>) {
  const name = String(researcher.full_name || "this researcher");
  if (/\b(?:main|key|primary|core|leading)\s+(?:research\s+)?(?:topics?|areas?|themes?|interests?)\b/i.test(query)) {
    return `What are ${name}'s main research topics? Summarise them from the Imperial profile and the themes supported by their publication titles and abstracts.`;
  }
  const terms = queryTerms(query);
  if (terms.length <= 2 || researcherNameScore(query, name) >= 0.9) {
    return `Tell me about ${name}'s research profile, Imperial role, and relationship to Imperial College London.`;
  }
  return query;
}

function isQuickSimilarPeopleQuery(query: string) {
  return /\b(?:suggest|show|find|give|recommend)\b[^?.!]{0,45}\b(?:people|researchers?|academics?|experts?|profiles?)\b[^?.!]{0,25}\b(?:like|similar\s+to|comparable\s+to)\b/i.test(query)
    || /\b(?:people|researchers?|academics?|experts?|profiles?)\b[^?.!]{0,25}\b(?:like|similar\s+to|comparable\s+to)\b/i.test(query)
    || /\b(?:similar|comparable)\s+(?:people|researchers?|academics?|experts?|profiles?)\s+(?:to|as)\b/i.test(query);
}

function quickSimilarProfileReason(row: Record<string, unknown>) {
  const fields = String(row.fields_of_research || "")
    .split(/[;,]/)
    .map(value => value.trim())
    .filter(Boolean)
    .slice(0, 3);
  if (fields.length > 0) {
    return `Similar profile themes include ${fields.join(", ")}.`;
  }
  return "Their Imperial profile is close in meaning to the reference researcher's profile.";
}

async function quickSimilarResearcherProfiles(
  supabase: ReturnType<typeof createClient>,
  sourceResearcher: Record<string, unknown>,
  limit = 5,
) {
  const sourceId = String(sourceResearcher.researcher_id || "");
  if (!sourceId) return [];

  const { data, error } = await supabase.rpc("find_similar_researcher_profiles", {
    p_researcher_id: sourceId,
    p_match_count: Math.max(3, Math.min(limit, 5)),
  });
  if (error) throw error;

  return (data || []).map((row: Record<string, unknown>) => ({
    researcher_id: row.researcher_id,
    openalex_id: row.openalex_id,
    profile_url: row.profile_url,
    full_name: row.full_name,
    title: row.title,
    department: row.department,
    faculty: row.faculty,
    score: Number(row.similarity || 0),
    reason: quickSimilarProfileReason(row),
  }));
}

function quickRelationshipNames(query: string) {
  const cleaned = query
    .replace(/[?!.,;:]+$/g, "")
    .replace(/\s*&\s*/g, " and ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^(?:please\s+)?(?:tell me about|what is|what's|describe|explain)\s+(?:the\s+)?/i, "");
  const patterns = [
    /\b(?:relationship|connection|collaboration|link)\s+between\s+(.+?)\s+and\s+(.+)$/i,
    /\b(?:relationship|connection|collaboration|link)\s+(?:of|for)\s+(.+?)\s+(?:and|with)\s+(.+)$/i,
    /\bhow\s+(?:are|is)\s+(.+?)\s+(?:and|with)\s+(.+?)\s+(?:connected|related|linked)(?:\s+to\s+each\s+other)?$/i,
    /^(.+?)\s+(?:and|with)\s+(.+?)\s+(?:relationship|connection|collaboration|link)$/i,
  ];

  for (const pattern of patterns) {
    const match = cleaned.match(pattern);
    if (!match?.[1] || !match?.[2]) continue;
    const names = [match[1], match[2]]
      .map(name => name.replace(/^(?:dr|prof|professor)\.?\s+/i, "").trim())
      .filter(name => name.length >= 3);
    if (names.length === 2 && normalizeName(names[0]) !== normalizeName(names[1])) return names;
  }

  return null;
}

async function resolveQuickRelationshipResearcher(
  supabase: ReturnType<typeof createClient>,
  name: string,
) {
  const suggestions = await suggestResearchersByName(supabase, name);
  const best = suggestions[0];
  return best && Number(best.score || 0) >= 0.62 ? best : null;
}

function openAlexAuthorKey(value: unknown) {
  const normalized = String(value || "").trim().split("/").filter(Boolean).pop() || "";
  return normalized.toUpperCase();
}

function relationshipPaperKey(paper: Record<string, unknown>) {
  const workId = String(paper.openalex_work_id || "").trim().toLowerCase();
  if (workId) return `work:${workId.split("/").filter(Boolean).pop()}`;
  const doi = String(paper.doi || "").trim().toLowerCase().replace(/^https?:\/\/(?:dx\.)?doi\.org\//, "");
  if (doi) return `doi:${doi}`;
  return `title:${String(paper.title || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()}`;
}

function canonicalRelationshipAffiliation(value: unknown) {
  return canonicalOrganizationName(value);
}

function hasGranthamConnection(researcher: Record<string, unknown>) {
  const profileText = [
    researcher.affiliation,
    researcher.research,
    researcher.bio_about,
    researcher.position_name,
    researcher.position,
    researcher.fields_of_research,
  ].map(String).join(" ");
  return /grantham|institute for climate change/i.test(profileText);
}

function relationshipSuggestion(row: Record<string, unknown>, reason: string) {
  return {
    researcher_id: row.id,
    openalex_id: row.openalex_id,
    profile_url: row.profile_url,
    full_name: row.full_name,
    title: row.position_name || row.position,
    department: row.affiliation || row.research,
    faculty: row.faculty,
    score: 1,
    reason,
  };
}

async function fetchDirectRelationshipCoauthorship(
  supabase: ReturnType<typeof createClient>,
  first: Record<string, unknown>,
  second: Record<string, unknown>,
) {
  const lookups = [
    { researcherId: String(first.id || ""), coauthorId: openAlexAuthorKey(second.openalex_id) },
    { researcherId: String(second.id || ""), coauthorId: openAlexAuthorKey(first.openalex_id) },
  ].filter(lookup => lookup.researcherId && lookup.coauthorId);

  for (const lookup of lookups) {
    const variants = [lookup.coauthorId, `https://openalex.org/${lookup.coauthorId}`];
    const { data, error } = await supabase
      .from("researcher_coauthors")
      .select("shared_papers,latest_year,paper_titles")
      .eq("researcher_id", lookup.researcherId)
      .in("coauthor_openalex_id", variants)
      .order("shared_papers", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!error && data) return data as Record<string, unknown>;
  }

  return null;
}

async function answerQuickRelationship(
  supabase: ReturnType<typeof createClient>,
  openAiKey: string,
  model: string,
  query: string,
  requestedNames: string[],
) {
  const resolved = await Promise.all(requestedNames.map(name => resolveQuickRelationshipResearcher(supabase, name)));
  const unresolved = requestedNames.filter((_, index) => !resolved[index]);
  const found = resolved.filter((researcher): researcher is Record<string, unknown> => Boolean(researcher));

  if (unresolved.length > 0 || found.length !== 2) {
    return {
      kind: "empty",
      answer: unresolved.length > 0
        ? `I could not confidently identify ${unresolved.join(" and ")} in the Imperial researcher directory. Try their full name or check the spelling.`
        : "I could not confidently identify both researchers. Try their full names.",
      suggestions: found.map(researcher => relationshipSuggestion(researcher, "Researcher identified for this comparison.")),
      evidence_titles: [],
      caveat: "",
    };
  }

  const researcherIds = found.map(researcher => String(researcher.researcher_id || ""));
  const { data: profiles, error: profileError } = await supabase
    .from("researchers")
    .select("id,openalex_id,profile_url,full_name,position_name,position,affiliation,faculty,research,bio_about,fields_of_research")
    .in("id", researcherIds);
  if (profileError) throw profileError;

  const profileById = new Map<string, Record<string, unknown>>();
  for (const profile of (profiles || []) as Record<string, unknown>[]) {
    profileById.set(String(profile.id || ""), profile);
  }
  const first = profileById.get(researcherIds[0]);
  const second = profileById.get(researcherIds[1]);
  if (!first || !second) throw new Error("Could not load both researcher profiles");

  const representativePaperRows = await fetchPapersForResearchers(supabase, researcherIds);
  const papersByResearcher = new Map<string, Record<string, unknown>[]>();
  for (const paper of representativePaperRows as Record<string, unknown>[]) {
    const researcherId = String(paper.researcher_id || "");
    if (!researcherId) continue;
    const bucket = papersByResearcher.get(researcherId) || [];
    bucket.push(paper);
    papersByResearcher.set(researcherId, bucket);
  }
  const firstPapers = papersByResearcher.get(researcherIds[0]) || [];
  const secondPapers = papersByResearcher.get(researcherIds[1]) || [];
  const firstPaperMap = new Map(firstPapers.map(paper => [relationshipPaperKey(paper), paper]));
  const sharedPapers = secondPapers
    .filter(paper => firstPaperMap.has(relationshipPaperKey(paper)))
    .map(paper => firstPaperMap.get(relationshipPaperKey(paper)) || paper)
    .filter((paper, index, papers) => papers.findIndex(candidate => relationshipPaperKey(candidate) === relationshipPaperKey(paper)) === index)
    .sort((a, b) => Number(b.publication_year || 0) - Number(a.publication_year || 0));

  const directCoauthorship = await fetchDirectRelationshipCoauthorship(supabase, first, second);
  const directPaperTitles = Array.isArray(directCoauthorship?.paper_titles)
    ? (directCoauthorship?.paper_titles as Record<string, unknown>[])
      .map(paper => String(paper.title || "").trim())
      .filter(Boolean)
    : [];
  const sharedTitles = [...new Set([
    ...sharedPapers.map(paper => String(paper.title || "").trim()).filter(Boolean),
    ...directPaperTitles,
  ])];
  const sharedPaperCount = Math.max(sharedPapers.length, Number(directCoauthorship?.shared_papers || 0));

  const firstAffiliation = canonicalRelationshipAffiliation(first.affiliation || first.research);
  const secondAffiliation = canonicalRelationshipAffiliation(second.affiliation || second.research);
  const sharedAffiliations: string[] = [];
  const addSharedAffiliation = (affiliation: string) => {
    if (!affiliation) return;
    if (!sharedAffiliations.some(existing => normalizeName(existing) === normalizeName(affiliation))) {
      sharedAffiliations.push(affiliation);
    }
  };
  if (hasGranthamConnection(first) && hasGranthamConnection(second)) {
    addSharedAffiliation("Grantham Institute for Climate Change");
  }
  if (firstAffiliation && normalizeName(firstAffiliation) === normalizeName(secondAffiliation)) {
    addSharedAffiliation(firstAffiliation);
  }
  const firstFaculty = String(first.faculty || "").trim();
  const secondFaculty = String(second.faculty || "").trim();
  if (firstFaculty && normalizeName(firstFaculty) === normalizeName(secondFaculty)) {
    addSharedAffiliation(firstFaculty);
  }
  const firstSchoolTheme = schoolThemeForCoDirector(String(first.full_name || ""));
  const secondSchoolTheme = schoolThemeForCoDirector(String(second.full_name || ""));
  const sharedSchoolTheme = firstSchoolTheme && secondSchoolTheme && firstSchoolTheme.name === secondSchoolTheme.name
    ? firstSchoolTheme
    : null;
  const sharedSchoolRoles = sharedSchoolTheme
    ? [`${sharedSchoolTheme.name} Co-Directors of the School of Convergence Science`]
    : [];

  const fallbackParts = [
    ...(sharedSchoolTheme
      ? [`${first.full_name} and ${second.full_name} are both ${sharedSchoolTheme.name} Co-Directors of Imperial's School of Convergence Science.`]
      : []),
    sharedAffiliations.length > 0
      ? `${first.full_name} and ${second.full_name} share an Imperial connection through ${sharedAffiliations.join(" and ")}.`
      : `${first.full_name} and ${second.full_name} have different listed Imperial affiliations.`,
    sharedPaperCount > 0
      ? `They have ${sharedPaperCount} shared publication${sharedPaperCount === 1 ? "" : "s"}${sharedTitles.length > 0 ? `, including “${sharedTitles.slice(0, 3).join("”, “")}”` : ""}.`
      : "I did not find a publication co-authored by both researchers.",
  ];

  let answer = fallbackParts.join(" ");
  try {
    const result = await openAiJson(
      openAiKey,
      model,
      [
        {
          role: "system",
          content: [
            "You answer serious two-researcher relationship questions for ITMAP at Imperial College London.",
            "Explain verified School of Convergence Science leadership roles first, then other institutional connections, direct publication co-authorship, and meaningful thematic overlap or complementarity.",
            "Distinguish clearly between verified direct collaboration and inferred thematic connection.",
            "If shared_school_roles is non-empty, state that shared leadership relationship prominently and do not reduce the relationship to publication co-authorship.",
            "If shared_paper_count is zero, explicitly say no co-authored publication was found; do not imply publication collaboration, but preserve any verified shared leadership relationship.",
            "If shared affiliations are listed, state them clearly.",
            "Use only the profile, affiliation, field and publication-title content in the payload.",
            "Do not mention databases, JSON, supplied or provided evidence, retrieval, payloads, or internal systems.",
            "Never repeat payload field names such as shared_paper_count; express them in natural English.",
            "Write a direct, natural answer in 130-220 words.",
            "Return JSON only: {\"answer\":\"...\"}",
          ].join(" "),
        },
        {
          role: "user",
          content: JSON.stringify({
            question: query,
            shared_affiliations: sharedAffiliations,
            shared_school_roles: sharedSchoolRoles,
            shared_school_theme: sharedSchoolTheme ? {
              name: sharedSchoolTheme.name,
              co_directors: sharedSchoolTheme.co_directors,
              missions: sharedSchoolTheme.missions,
            } : null,
            shared_paper_count: sharedPaperCount,
            shared_paper_titles: sharedTitles.slice(0, 12),
            researchers: [first, second].map((researcher, index) => ({
              name: researcher.full_name,
              position: researcher.position_name || researcher.position,
              department: researcher.affiliation || researcher.research,
              faculty: researcher.faculty,
              fields_of_research: truncateText(researcher.fields_of_research, 900),
              profile: truncateText(researcher.bio_about, 1800),
              research: truncateText(researcher.research, 700),
              representative_paper_titles: (index === 0 ? firstPapers : secondPapers)
                .slice(0, 30)
                .map(paper => truncateText(paper.title, 220)),
            })),
          }),
        },
      ],
      700,
    ) as { answer?: string };
    if (result.answer) answer = truncateText(naturaliseProfileAnswer(result.answer), 2400);
  } catch (error) {
    console.warn("Could not generate two-researcher relationship answer", error);
  }

  return {
    kind: "relationship",
    answer,
    suggestions: [
      relationshipSuggestion(first, schoolRoleForResearcher(String(first.full_name || "")) || firstAffiliation || "Researcher included in this comparison."),
      relationshipSuggestion(second, schoolRoleForResearcher(String(second.full_name || "")) || secondAffiliation || "Researcher included in this comparison."),
    ],
    evidence_titles: [
      ...(sharedSchoolTheme ? [`Imperial School of Convergence Science: ${sharedSchoolTheme.name} Co-Directors`] : []),
      ...sharedTitles,
    ].slice(0, 6),
    caveat: sharedSchoolTheme
      ? `Their shared ${sharedSchoolTheme.name} leadership role is verified independently of publication co-authorship${sharedPaperCount === 0 ? "; no joint publication was found" : ""}.`
      : sharedPaperCount === 0
        ? "No direct co-authored publication was found, so any research connection described is thematic or institutional."
        : "Shared publications indicate direct co-authorship; broader thematic connections are based on their profiles and publication titles.",
  };
}

async function quickSearch(
  supabase: ReturnType<typeof createClient>,
  openAiKey: string,
  model: string,
  query: string,
) {
  const trimmedQuery = truncateText(query.trim(), 1200);
  if (!trimmedQuery) {
    return {
      kind: "empty",
      answer: "Type a researcher name or short topic to use Quick Search.",
      suggestions: [],
      evidence_titles: [],
      caveat: "",
    };
  }

  if (isInsufficientResearchQuery(trimmedQuery)) {
    return {
      kind: "empty",
      answer: "I need a little more detail before I can help. Try a researcher name, a department, or a clear research topic such as \"air pollution and health\".",
      suggestions: [],
      evidence_titles: [],
      caveat: "",
    };
  }

  if (isOffTopicProfileQuestion(trimmedQuery)) {
    return {
      kind: "redirect",
      answer: "Ask ITMAP is for serious questions about Imperial researchers, expertise, publications, co-authors, departments, and research topics. Try a researcher name or a short topic such as \"Benjamin Barratt\" or \"experts on photonics\".",
      suggestions: [],
      evidence_titles: [],
      caveat: "",
    };
  }

  const relationshipNames = quickRelationshipNames(trimmedQuery);
  if (relationshipNames) {
    return await answerQuickRelationship(supabase, openAiKey, model, trimmedQuery, relationshipNames);
  }

  if (isQuickOrganizationPeopleQuery(trimmedQuery)) {
    const organization = await quickOrganizationMatch(supabase, trimmedQuery);
    if (organization) {
      return {
        kind: "organization",
        answer: `The Departments area contains the researcher directory, themes, and publication activity for ${organization.name}. Open it there to see who is connected to this ${organization.kind}.`,
        organization,
        suggestions: [],
        evidence_titles: [],
        caveat: "Organisation membership is based on the Imperial affiliations currently stored in ITMAP.",
      };
    }
  }

  const isSchoolQuery = isSchoolOfConvergenceScienceQuery(trimmedQuery);
  const standaloneTopic = isStandaloneResearchAbbreviation(trimmedQuery)
    ? expandResearchAbbreviations(trimmedQuery)
    : "";
  const nameSuggestions = standaloneTopic
    ? []
    : await quickNameSuggestions(supabase, trimmedQuery);
  const bestPerson = nameSuggestions[0];

  if (
    isQuickSimilarPeopleQuery(trimmedQuery)
    && bestPerson
    && Number(bestPerson.score || 0) >= 0.68
  ) {
    const similarProfiles = await quickSimilarResearcherProfiles(supabase, bestPerson, 5);
    const sourceName = String(bestPerson.full_name || "This researcher");
    return {
      kind: "person",
      answer: similarProfiles.length > 0
        ? `${sourceName} is the reference profile. These researchers have the closest profile-level research overlap in ITMAP.`
        : `I found ${sourceName}, but there are not enough embedded researcher profiles to make a reliable similarity list yet.`,
      researcher: bestPerson,
      suggestions: similarProfiles,
      evidence_titles: [],
      caveat: similarProfiles.length > 0
        ? "Similarity compares the meaning of stored Imperial profile text. It is a thematic comparison, not a claim that the researchers do identical work."
        : "Open the researcher profile to explore their publications and research areas.",
    };
  }

  if (isSchoolQuery && bestPerson && Number(bestPerson.score || 0) >= 0.68) {
    return schoolPersonRelationAnswer(bestPerson);
  }

  if (isSchoolQuery) {
    return await schoolOfConvergenceScienceAnswer(supabase, trimmedQuery);
  }

  if (bestPerson && Number(bestPerson.score || 0) >= 0.68) {
    const answer = await answerResearcherProfileQuestion(
      supabase,
      openAiKey,
      model,
      String(bestPerson.researcher_id || ""),
      quickPersonQuestion(trimmedQuery, bestPerson),
    );
    return {
      kind: "person",
      answer: answer.answer,
      researcher: bestPerson,
      suggestions: Number(bestPerson.score || 0) >= 0.9 ? [bestPerson] : nameSuggestions.slice(0, 4),
      evidence_titles: answer.evidence_titles,
      caveat: answer.caveat,
    };
  }

  if (isQuickPaperQuestion(trimmedQuery)) {
    const paperMission = await expandMission(
      openAiKey,
      model,
      truncateText(redactSensitiveSearchText(trimmedQuery), 20000),
    );
    const paperTopic = paperMission.expanded_query?.trim()
      || implicitResearchTopic(trimmedQuery)
      || trimmedQuery;
    return await quickPaperSearch(
      supabase,
      openAiKey,
      model,
      trimmedQuery,
      paperTopic,
    );
  }

  const topicMission: MissionExpansion = standaloneTopic
    ? {
      expanded_query: standaloneTopic,
      must_have: [standaloneTopic],
      method_terms: [standaloneTopic],
      search_strategy: "topic",
    }
    : await expandMission(
      openAiKey,
      model,
      truncateText(redactSensitiveSearchText(trimmedQuery), 20000),
    );
  const topicQuery = topicMission.expanded_query?.trim()
    || implicitResearchTopic(trimmedQuery)
    || trimmedQuery;
  const topicSuggestions = await quickTopicSuggestions(
    supabase,
    topicQuery,
    8,
    topicMission,
    trimmedQuery,
  );
  if (topicSuggestions.length > 0) {
    if (isQuickAffiliationQuery(trimmedQuery)) {
      const affiliationDescription = /\bgrantham\b/i.test(trimmedQuery)
        ? "a Grantham Institute connection"
        : "the requested institutional connection";
      return {
        kind: "information",
        answer: `Here are researchers whose Imperial profiles indicate ${affiliationDescription}.`,
        suggestions: topicSuggestions,
        evidence_titles: [],
        caveat: "Affiliations are drawn from stored Imperial profile text and may not reflect very recent role changes.",
      };
    }

    return {
      kind: "topic",
      answer: `Here are quick, non-reranked matches for "${topicQuery}". This is useful for a first pointer; use the full Search tab when you need ranked results with paper evidence and deeper comparison.`,
      suggestions: topicSuggestions,
      evidence_titles: [],
      caveat: "Ask ITMAP clarifies the topic but does not run the full semantic retrieval, ITMAP reranking, media/grant checks, or the graph workflow.",
    };
  }

  return {
    kind: "empty",
    answer: "I could not find a clear researcher or quick topic match. Try a name, a department, or a shorter research topic.",
    suggestions: [],
    evidence_titles: [],
    caveat: "",
  };
}

type OrganizationKind = "department" | "institute" | "school" | "faculty" | "centre" | "laboratory" | "unit";
type OrganizationGroupKey = "engineering" | "medicine" | "natural-sciences" | "business-school" | "education" | "cross-college" | "other";
type OrganizationScope = "faculty" | "department-hosted" | "cross-college" | "education" | "top-level-school" | "unclassified";

type OrganizationHierarchyMetadata = {
  group_key: OrganizationGroupKey;
  group_name: string;
  parent_name: string;
  scope: OrganizationScope;
  official_url: string;
};

function organizationIdentityKey(value: unknown) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\bcenter\b/g, "centre")
    .replace(/\bdept\b/g, "department")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const ORGANIZATION_DIRECTORY_MIN_RESEARCHERS = 3;

const CANONICAL_ORGANIZATION_NAMES = new Map<string, string>([
  ["business", "Imperial College Business School"],
  ["business school", "Imperial College Business School"],
  ["imperial business school", "Imperial College Business School"],
  ["imperial college business school", "Imperial College Business School"],
  ["department of analytics marketing and operations", "Imperial College Business School"],
  ["department of economics and public policy", "Imperial College Business School"],
  ["department of finance", "Imperial College Business School"],
  ["department of management and entrepreneurship", "Imperial College Business School"],
  ["of entrepreneurship business school", "Imperial College Business School"],
  ["of practice business school", "Imperial College Business School"],
  ["centre for en", "Centre for Engagement and Simulation Science"],
  ["centre for he", "Centre for Health Economics and Policy Innovation"],
  ["centre for hi", "Centre for Higher Education Research and Scholarship"],
  ["centre for la", "Centre for Languages, Culture and Communication"],
  ["centre for po", "Centre for Population Biology"],
  ["department of earth science and engineering", "Department of Earth Science & Engineering"],
  ["department of life sciences silwood park", "Department of Life Sciences"],
  ["department of surgery and cancer", "Department of Surgery & Cancer"],
  ["national heart and lung institute", "National Heart & Lung Institute"],
  ["institute for security science and technology", "Institute for Security Science & Technology"],
  ["grantham institute for climate change", "Grantham Institute for Climate Change"],
  ["institute for climate change", "Grantham Institute for Climate Change"],
  ["uk bioengineering dyson school", "School of Design Engineering"],
  ["hall shared the uk institute", "Department of Physics"],
]);

const ORGANIZATION_QUERY_ALIASES = new Map<string, string[]>([
  ["imperial college business school", [
    "Business",
    "Business School",
    "Imperial Business School",
    "Imperial College Business School",
    "Department of Analytics, Marketing and Operations",
    "Department of Economics and Public Policy",
    "Department of Finance",
    "Department of Management and Entrepreneurship",
  ]],
  ["centre for engagement and simulation science", ["Centre for Engagement and Simulation Science", "Centre for En"]],
  ["centre for health economics and policy innovation", ["Centre for Health Economics and Policy Innovation", "Centre for He"]],
  ["centre for higher education research and scholarship", ["Centre for Higher Education Research and Scholarship", "Centre for Hi"]],
  ["centre for languages culture and communication", ["Centre for Languages, Culture and Communication", "Centre for La"]],
  ["centre for population biology", ["Centre for Population Biology", "Centre for Po"]],
  ["department of life sciences", ["Department of Life Sciences", "Department of Life Sciences (Silwood Park)"]],
  ["school of design engineering", ["School of Design Engineering", "uk Bioengineering Dyson School"]],
  ["department of physics", ["Department of Physics", "Hall shared the UK Institute"]],
]);

const ORGANIZATION_GROUPS: Record<OrganizationGroupKey, {
  name: string;
  parentName: string;
  scope: OrganizationScope;
  officialUrl: string;
  order: number;
}> = {
  engineering: {
    name: "Faculty of Engineering",
    parentName: "Faculty of Engineering",
    scope: "faculty",
    officialUrl: "https://www.imperial.ac.uk/engineering/departments/",
    order: 0,
  },
  medicine: {
    name: "Faculty of Medicine",
    parentName: "Faculty of Medicine",
    scope: "faculty",
    officialUrl: "https://www.imperial.ac.uk/medicine/",
    order: 1,
  },
  "natural-sciences": {
    name: "Faculty of Natural Sciences",
    parentName: "Faculty of Natural Sciences",
    scope: "faculty",
    officialUrl: "https://www.imperial.ac.uk/natural-sciences/departments/",
    order: 2,
  },
  "business-school": {
    name: "Imperial College Business School",
    parentName: "Imperial College London",
    scope: "top-level-school",
    officialUrl: "https://www.imperial.ac.uk/faculties-and-departments/",
    order: 3,
  },
  education: {
    name: "Education centres & schools",
    parentName: "Imperial College London",
    scope: "education",
    officialUrl: "https://www.imperial.ac.uk/faculties-and-departments/",
    order: 4,
  },
  "cross-college": {
    name: "Cross-College institutes & centres",
    parentName: "Imperial College London",
    scope: "cross-college",
    officialUrl: "https://www.imperial.ac.uk/multidisciplinary-research/",
    order: 5,
  },
  other: {
    name: "Other Imperial units",
    parentName: "Imperial College London",
    scope: "unclassified",
    officialUrl: "https://www.imperial.ac.uk/faculties-and-departments/",
    order: 6,
  },
};

function organizationKeySet(names: string[]) {
  return new Set(names.map(organizationIdentityKey));
}

const ENGINEERING_ORGANIZATIONS = organizationKeySet([
  "Department of Aeronautics",
  "Department of Bioengineering",
  "Department of Chemical Engineering",
  "Department of Civil and Environmental Engineering",
  "Department of Computing",
  "School of Design Engineering",
  "Dyson School of Design Engineering",
  "Department of Earth Science & Engineering",
  "Department of Electrical and Electronic Engineering",
  "Department of Materials",
  "Department of Mechanical Engineering",
]);

const MEDICINE_ORGANIZATIONS = organizationKeySet([
  "Department of Brain Sciences",
  "Department of Immunology and Inflammation",
  "Department of Infectious Disease",
  "Institute of Clinical Sciences",
  "Department of Medicine",
  "Department of Metabolism, Digestion and Reproduction",
  "National Heart & Lung Institute",
  "School of Public Health",
  "Department of Surgery & Cancer",
]);

const NATURAL_SCIENCES_ORGANIZATIONS = organizationKeySet([
  "Department of Chemistry",
  "Department of Life Sciences",
  "Division of Cell & Molecular Biology",
  "Department of Mathematics",
  "Department of Physics",
  "Centre for Environmental Policy",
]);

const CROSS_COLLEGE_ORGANIZATIONS = organizationKeySet([
  "Centre for Advanced Therapeutics",
  "Centre for Paediatrics and Child Health",
  "Centre for Translational Nutrition and Food Research",
  "Data Science Institute",
  "Grantham Institute for Climate Change",
  "Institute for Security Science & Technology",
  "Institute of Chemical Biology",
  "Institute of Global Health Innovation",
  "Institute of Infection",
]);

const EDUCATION_ORGANIZATIONS = organizationKeySet([
  "Centre for Higher Education Research and Scholarship",
  "Centre for Languages, Culture and Communication",
  "School of Convergence Science",
]);

const DEPARTMENT_HOSTED_ORGANIZATIONS = new Map<string, {
  groupKey: OrganizationGroupKey;
  parentName: string;
  officialUrl: string;
}>([
  [organizationIdentityKey("Centre for Engagement and Simulation Science"), {
    groupKey: "medicine",
    parentName: "Department of Surgery & Cancer",
    officialUrl: "https://www.imperial.ac.uk/engagement-and-simulation-science/about-iccess/history/",
  }],
  [organizationIdentityKey("Centre for Population Biology"), {
    groupKey: "natural-sciences",
    parentName: "Department of Life Sciences",
    officialUrl: "https://www.imperial.ac.uk/silwood-park/",
  }],
  [organizationIdentityKey("Centre for Health Economics and Policy Innovation"), {
    groupKey: "business-school",
    parentName: "Imperial College Business School",
    officialUrl: "https://www.imperial.ac.uk/business-school/faculty-research/research-centres/centre-health-economics-policy-innovation/",
  }],
]);

function organizationHierarchy(name: string): OrganizationHierarchyMetadata {
  const key = organizationIdentityKey(name);
  const hosted = DEPARTMENT_HOSTED_ORGANIZATIONS.get(key);
  if (hosted) {
    const group = ORGANIZATION_GROUPS[hosted.groupKey];
    return {
      group_key: hosted.groupKey,
      group_name: group.name,
      parent_name: hosted.parentName,
      scope: "department-hosted",
      official_url: hosted.officialUrl,
    };
  }

  let groupKey: OrganizationGroupKey = "other";
  if (ENGINEERING_ORGANIZATIONS.has(key)) groupKey = "engineering";
  else if (MEDICINE_ORGANIZATIONS.has(key)) groupKey = "medicine";
  else if (NATURAL_SCIENCES_ORGANIZATIONS.has(key)) groupKey = "natural-sciences";
  else if (key === organizationIdentityKey("Imperial College Business School")) groupKey = "business-school";
  else if (EDUCATION_ORGANIZATIONS.has(key)) groupKey = "education";
  else if (CROSS_COLLEGE_ORGANIZATIONS.has(key)) groupKey = "cross-college";

  const group = ORGANIZATION_GROUPS[groupKey];
  return {
    group_key: groupKey,
    group_name: group.name,
    parent_name: group.parentName,
    scope: group.scope,
    official_url: group.officialUrl,
  };
}

function canonicalOrganizationName(value: unknown) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  if (/grantham|institute for climate change/i.test(text)) {
    return "Grantham Institute for Climate Change";
  }
  if (/\bnational heart and lung institute\b/.test(organizationIdentityKey(text))) {
    return "National Heart & Lung Institute";
  }
  const markers = [...text.matchAll(/\b(?:Department of|Faculty of|Institute (?:of|for)|School of|(?:Centre|Center) (?:for|of)|Division of)\b/gi)];
  if (markers.length === 2 && markers[0].index === 0 && typeof markers[1].index === "number") {
    const first = text.slice(0, markers[1].index).trim();
    const second = text.slice(markers[1].index).trim();
    if (organizationIdentityKey(first) === organizationIdentityKey(second)) {
      return CANONICAL_ORGANIZATION_NAMES.get(organizationIdentityKey(first)) || first.replace(/^Center\b/i, "Centre");
    }
  }
  const repeated = text.match(/^(.{4,}?)\s+\1$/i)?.[1]?.trim() || text;
  const key = organizationIdentityKey(repeated);
  return CANONICAL_ORGANIZATION_NAMES.get(key) || repeated.replace(/^Center\b/i, "Centre");
}

function organizationKind(name: string): OrganizationKind {
  if (/\bfaculty\b/i.test(name)) return "faculty";
  if (/\bdepartment\b/i.test(name)) return "department";
  if (/\binstitute\b/i.test(name)) return "institute";
  if (/\bschool\b/i.test(name)) return "school";
  if (/\bcentre|center\b/i.test(name)) return "centre";
  if (/\blaboratory|\blab\b/i.test(name)) return "laboratory";
  return "unit";
}

function isOrganizationName(name: string) {
  if (name === "Grantham Institute for Climate Change") return true;
  if (name.length < 6 || name.length > 110 || name.split(/\s+/).length > 15) return false;
  if (/\b(?:I|my|we|our|he|she|they|their)\b/i.test(name)) return false;
  if (/\b(?:joined|worked|working|role|support|provides|commenced|tenure|professor|lecturer|researcher|administrator)\b/i.test(name)) return false;

  const structureCount = (name.match(/\b(?:department|institute|school|faculty|centre|center|laboratory|lab|division)\b/gi) || []).length;
  if (structureCount !== 1) return false;

  const department = name.match(/^Department of\s+(.+)$/i);
  if (department) return department[1].trim().length >= 4;
  if (/^(?:Institute (?:of|for)\s+.+|National\s+.+\s+Institute|[\p{L}\d&'()/-]+(?:\s+[\p{L}\d&'()/-]+){1,5}\s+Institute)$/iu.test(name)) return true;
  if (/^(?:School of\s+.+|[\p{L}\d&'()/-]+(?:\s+[\p{L}\d&'()/-]+){1,5}\s+School(?:\s+of\s+.+)?)$/iu.test(name)) return true;
  if (/^Faculty of\s+.+$/i.test(name)) return true;
  if (/^(?:Centre|Center) (?:for|of)\s+.+$/i.test(name)) return true;
  if (/^(?:Laboratory|Lab) (?:for|of)\s+.+$/i.test(name)) return true;
  if (/^[\p{L}\d&'()/-]+(?:\s+[\p{L}\d&'()/-]+){1,5}\s+(?:Laboratory|Lab)$/iu.test(name)) return true;
  return /^Division of\s+.+$/i.test(name);
}

function organizationNamesForResearcher(row: Record<string, unknown>) {
  return [...new Set([
    canonicalOrganizationName(row.affiliation),
    canonicalOrganizationName(row.faculty),
  ].filter(name => name && isOrganizationName(name)))];
}

function organizationQueryAliases(query: string) {
  if (/\bgrantham\b|\binstitute for climate change\b/i.test(query)) {
    return ["Grantham", "Institute for Climate Change"];
  }
  if (/\bnational heart and lung institute\b/.test(organizationIdentityKey(query))) {
    return ["National Heart & Lung Institute", "National Heart and Lung Institute"];
  }
  const trimmed = query.trim();
  const normalizedQuery = organizationIdentityKey(trimmed);
  const canonicalQuery = canonicalOrganizationName(trimmed);
  const directAliases = ORGANIZATION_QUERY_ALIASES.get(organizationIdentityKey(canonicalQuery)) || [];
  const partialAliases = normalizedQuery.length >= 6
    ? [...ORGANIZATION_QUERY_ALIASES.entries()]
      .filter(([canonicalName, aliases]) => canonicalName.includes(normalizedQuery)
        || aliases.some(alias => organizationIdentityKey(alias).includes(normalizedQuery)))
      .flatMap(([, aliases]) => aliases)
    : [];
  return [...new Set([
    trimmed,
    ...directAliases,
    ...partialAliases,
    trimmed.includes("&") ? trimmed.replace(/\s*&\s*/g, " and ") : "",
    /\band\b/i.test(trimmed) ? trimmed.replace(/\band\b/gi, "&") : "",
    /\bcentre\b/i.test(trimmed) ? trimmed.replace(/\bcentre\b/gi, "Center") : "",
    /\bcenter\b/i.test(trimmed) ? trimmed.replace(/\bcenter\b/gi, "Centre") : "",
  ].filter(Boolean))];
}

let organizationDirectoryCache: {
  expiresAt: number;
  rows: Array<{
    name: string;
    kind: OrganizationKind;
    researcher_count: number;
    score: number;
    group_key: OrganizationGroupKey;
    group_name: string;
    group_researcher_count: number;
    group_unit_count: number;
    parent_name: string;
    scope: OrganizationScope;
    official_url: string;
  }>;
} | null = null;

async function listOrganizations(supabase: ReturnType<typeof createClient>) {
  if (organizationDirectoryCache && organizationDirectoryCache.expiresAt > Date.now()) {
    return organizationDirectoryCache.rows;
  }

  const pageSize = 1000;
  const researcherRows: Record<string, unknown>[] = [];
  for (let offset = 0; offset < 25000; offset += pageSize) {
    const { data, error } = await supabase
      .from("researchers")
      .select("id,affiliation,faculty")
      .order("id", { ascending: true })
      .range(offset, offset + pageSize - 1);
    if (error) throw error;
    const rows = (data || []) as Record<string, unknown>[];
    researcherRows.push(...rows);
    if (rows.length < pageSize) break;
  }

  const organizations = new Map<string, {
    name: string;
    kind: OrganizationKind;
    researcherIds: Set<string>;
    nameCounts: Map<string, number>;
  }>();
  for (const row of researcherRows) {
    const researcherId = String(row.id || "");
    if (!researcherId) continue;
    for (const name of organizationNamesForResearcher(row)) {
      const key = organizationIdentityKey(name);
      if (!key) continue;
      const organization = organizations.get(key) || {
        name,
        kind: organizationKind(name),
        researcherIds: new Set<string>(),
        nameCounts: new Map<string, number>(),
      };
      organization.researcherIds.add(researcherId);
      organization.nameCounts.set(name, (organization.nameCounts.get(name) || 0) + 1);
      organization.name = [...organization.nameCounts.entries()]
        .sort((first, second) => second[1] - first[1] || first[0].length - second[0].length)[0][0];
      organization.kind = organizationKind(organization.name);
      organizations.set(key, organization);
    }
  }

  const kindOrder: Record<OrganizationKind, number> = {
    department: 0,
    institute: 1,
    school: 2,
    centre: 3,
    laboratory: 4,
    unit: 5,
    faculty: 6,
  };
  const visibleOrganizations = [...organizations.values()]
    .filter(organization => organization.kind !== "faculty"
      && organization.researcherIds.size >= ORGANIZATION_DIRECTORY_MIN_RESEARCHERS);
  const groupResearcherIds = new Map<OrganizationGroupKey, Set<string>>();
  const groupUnitCounts = new Map<OrganizationGroupKey, number>();
  for (const organization of visibleOrganizations) {
    const hierarchy = organizationHierarchy(organization.name);
    const researcherIds = groupResearcherIds.get(hierarchy.group_key) || new Set<string>();
    organization.researcherIds.forEach(researcherId => researcherIds.add(researcherId));
    groupResearcherIds.set(hierarchy.group_key, researcherIds);
    groupUnitCounts.set(hierarchy.group_key, (groupUnitCounts.get(hierarchy.group_key) || 0) + 1);
  }

  const rows = visibleOrganizations
    .map(organization => {
      const hierarchy = organizationHierarchy(organization.name);
      return {
        name: organization.name,
        kind: organization.kind,
        researcher_count: organization.researcherIds.size,
        score: 1,
        ...hierarchy,
        group_researcher_count: groupResearcherIds.get(hierarchy.group_key)?.size || 0,
        group_unit_count: groupUnitCounts.get(hierarchy.group_key) || 0,
      };
    })
    .sort((first, second) => ORGANIZATION_GROUPS[first.group_key].order - ORGANIZATION_GROUPS[second.group_key].order
      || kindOrder[first.kind] - kindOrder[second.kind]
      || second.researcher_count - first.researcher_count
      || first.name.localeCompare(second.name));

  organizationDirectoryCache = {
    expiresAt: Date.now() + 15 * 60 * 1000,
    rows,
  };
  return rows;
}

async function suggestOrganizations(
  supabase: ReturnType<typeof createClient>,
  query: string,
  requestedLimit = 10,
) {
  const trimmed = truncateText(query.trim(), 140);
  if (trimmed.length < 2) return [];
  const limit = Math.max(3, Math.min(Number(requestedLimit) || 10, 20));
  const aliases = organizationQueryAliases(trimmed);
  const filters = aliases.flatMap(alias => {
    const escaped = escapeIlike(alias);
    return [
      `affiliation.ilike.%${escaped}%`,
      `faculty.ilike.%${escaped}%`,
    ];
  });
  const { data, error } = await supabase
    .from("researchers")
    .select("id,affiliation,faculty")
    .or(filters.join(","))
    .limit(700);
  if (error) throw error;

  const organizations = new Map<string, { name: string; researcherIds: Set<string> }>();
  for (const row of (data || []) as Record<string, unknown>[]) {
    for (const name of organizationNamesForResearcher(row)) {
      const normalizedName = organizationIdentityKey(name);
      const normalizedQuery = organizationIdentityKey(trimmed);
      const normalizedAliases = organizationQueryAliases(name).map(organizationIdentityKey);
      const isGranthamAlias = name === "Grantham Institute for Climate Change"
        && normalizedQuery.includes("grantham");
      if (
        !isGranthamAlias
        && !normalizedName.includes(normalizedQuery)
        && !normalizedQuery.includes(normalizedName)
        && !normalizedAliases.some(alias => alias.includes(normalizedQuery) || normalizedQuery.includes(alias))
      ) continue;
      const organization = organizations.get(normalizedName) || {
        name,
        researcherIds: new Set<string>(),
      };
      organization.researcherIds.add(String(row.id || ""));
      organizations.set(normalizedName, organization);
    }
  }

  const normalizedQuery = organizationIdentityKey(trimmed);
  return [...organizations.values()]
    .map(({ name, researcherIds }) => {
      const normalizedName = organizationIdentityKey(name);
      const normalizedAliases = organizationQueryAliases(name).map(organizationIdentityKey);
      const score = normalizedName === normalizedQuery || normalizedAliases.includes(normalizedQuery)
        ? 1
        : normalizedName.startsWith(normalizedQuery) || normalizedAliases.some(alias => alias.startsWith(normalizedQuery))
          ? 0.94
          : normalizedName.includes(normalizedQuery) || normalizedAliases.some(alias => alias.includes(normalizedQuery))
            ? 0.88
            : name === "Grantham Institute for Climate Change" && normalizedQuery.includes("grantham")
              ? 0.98
              : 0.72;
      return {
        name,
        kind: organizationKind(name),
        researcher_count: researcherIds.size,
        score,
        ...organizationHierarchy(name),
      };
    })
    .sort((first, second) => Number(second.score) - Number(first.score)
      || Number(second.researcher_count) - Number(first.researcher_count)
      || String(first.name).localeCompare(String(second.name)))
    .slice(0, limit);
}

function quickOrganizationTokens(value: unknown) {
  const generic = new Set([
    "and", "at", "college", "department", "faculty", "for", "imperial", "institute",
    "laboratory", "lab", "london", "of", "school", "the", "unit", "centre", "center",
  ]);
  return organizationIdentityKey(value)
    .split(/\s+/)
    .filter(token => token.length >= 3 && !generic.has(token));
}

async function quickOrganizationMatch(
  supabase: ReturnType<typeof createClient>,
  query: string,
) {
  const organizations = await listOrganizations(supabase);
  const normalizedQuery = organizationIdentityKey(query);
  const queryTokens = new Set(quickOrganizationTokens(query));
  const ranked = organizations
    .map(organization => {
      const normalizedName = organizationIdentityKey(organization.name);
      const aliases = organizationQueryAliases(organization.name);
      const aliasKeys = aliases.map(organizationIdentityKey);
      const tokenCoverage = Math.max(...aliases.map(alias => {
        const nameTokens = quickOrganizationTokens(alias);
        const matchedTokens = nameTokens.filter(token => queryTokens.has(token)).length;
        return nameTokens.length > 0 ? matchedTokens / nameTokens.length : 0;
      }));
      const explicitName = normalizedQuery.includes(normalizedName)
        || aliasKeys.some(alias => normalizedQuery.includes(alias));
      const brandedAlias = normalizedName.includes("grantham") && normalizedQuery.includes("grantham");
      const score = explicitName ? 1 : brandedAlias ? 0.98 : tokenCoverage;
      return { ...organization, score, explicitName };
    })
    .filter(organization => organization.score >= 0.72)
    .sort((first, second) => second.score - first.score
      || Number(second.researcher_count || 0) - Number(first.researcher_count || 0)
      || String(first.name).localeCompare(String(second.name)));

  const best = ranked[0];
  const second = ranked[1];
  if (!best) return null;
  if (!best.explicitName && second && best.score - second.score < 0.12) return null;

  return {
    name: best.name,
    kind: best.kind,
    researcher_count: best.researcher_count,
    score: best.score,
    ...organizationHierarchy(best.name),
  };
}

function themeEvidencePapers(row: Record<string, unknown>) {
  const evidence = row.evidence && typeof row.evidence === "object"
    ? row.evidence as Record<string, unknown>
    : {};
  return Array.isArray(evidence.papers)
    ? (evidence.papers as Record<string, unknown>[])
    : [];
}

function themeAuthorPaperCount(row: Record<string, unknown>) {
  const evidence = row.evidence && typeof row.evidence === "object"
    ? row.evidence as Record<string, unknown>
    : {};
  return Math.max(0, Number(evidence.total_author_papers || 0));
}

function themeYearCounts(row: Record<string, unknown>) {
  const evidence = row.evidence && typeof row.evidence === "object"
    ? row.evidence as Record<string, unknown>
    : {};
  const rawCounts = evidence.year_counts && typeof evidence.year_counts === "object"
    ? evidence.year_counts as Record<string, unknown>
    : {};
  return Object.entries(rawCounts)
    .map(([year, count]) => [Number(year), Math.max(0, Number(count || 0))] as const)
    .filter(([year, count]) => year >= 1970 && year <= new Date().getFullYear() + 1 && count > 0);
}

const EMPTY_ORGANIZATION_NETWORK = {
  edge_count: 0,
  returned_edge_count: 0,
  connected_researcher_count: 0,
  edges: [],
};

const EMPTY_ORGANIZATION_DEPARTMENT_REACH = {
  department_count: 0,
  returned_department_count: 0,
  shared_papers: 0,
  departments: [],
};

async function organizationUniquePublicationRollup(
  supabase: ReturnType<typeof createClient>,
  researcherIds: string[],
) {
  try {
    const { data, error } = await supabase.rpc("organization_unique_publication_rollup", {
      p_researcher_ids: researcherIds,
    });
    if (error) throw error;
    return data && typeof data === "object" ? data as Record<string, unknown> : {};
  } catch (rollupError) {
    console.warn("Unique organization publication rollup unavailable; using author-topic totals", rollupError);
    return {};
  }
}

async function organizationCollaborationNetwork(
  supabase: ReturnType<typeof createClient>,
  requestedResearcherIds: string[],
) {
  const researcherIds = [...new Set(requestedResearcherIds
    .map(value => String(value || "").trim())
    .filter(value => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)))]
    .slice(0, 1000);
  if (researcherIds.length === 0) return { ...EMPTY_ORGANIZATION_NETWORK, edges: [] };

  try {
    const { data, error } = await supabase.rpc("organization_collaboration_network", {
      p_researcher_ids: researcherIds,
      p_edge_limit: 8000,
    });
    if (error) throw error;
    return data && typeof data === "object"
      ? data as Record<string, unknown>
      : { ...EMPTY_ORGANIZATION_NETWORK, edges: [] };
  } catch (networkError) {
    console.warn("Organization collaboration network unavailable", networkError);
    throw networkError;
  }
}

async function organizationDepartmentReachNetwork(
  supabase: ReturnType<typeof createClient>,
  requestedResearcherIds: string[],
) {
  const researcherIds = [...new Set(requestedResearcherIds
    .map(value => String(value || "").trim())
    .filter(value => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)))]
    .slice(0, 1000);
  if (researcherIds.length === 0) {
    return { ...EMPTY_ORGANIZATION_DEPARTMENT_REACH, departments: [] };
  }

  try {
    const largeUnit = researcherIds.length > 200;
    const primaryFunction = largeUnit
      ? "organization_department_reach_network_rollup"
      : "organization_department_reach_network";
    let { data, error } = await supabase.rpc(primaryFunction, {
      p_researcher_ids: researcherIds,
      p_department_limit: 120,
    });
    if (error) {
      const fallback = await supabase.rpc("organization_department_reach_network_fast", {
        p_researcher_ids: researcherIds,
        p_department_limit: 120,
      });
      data = fallback.data;
      error = fallback.error;
    }
    if (error) throw error;
    return data && typeof data === "object"
      ? data as Record<string, unknown>
      : { ...EMPTY_ORGANIZATION_DEPARTMENT_REACH, departments: [] };
  } catch (reachError) {
    console.warn("Organization department reach unavailable", reachError);
    return { ...EMPTY_ORGANIZATION_DEPARTMENT_REACH, departments: [] };
  }
}

async function organizationProfile(
  supabase: ReturnType<typeof createClient>,
  requestedName: string,
) {
  const name = canonicalOrganizationName(truncateText(requestedName.trim(), 220));
  if (!name || !isOrganizationName(name)) throw new Error("Organisation not found");
  const aliases = organizationQueryAliases(name);
  const filters = aliases.flatMap(alias => {
    const escaped = escapeIlike(alias);
    return [
      `affiliation.ilike.%${escaped}%`,
      `faculty.ilike.%${escaped}%`,
    ];
  });
  const { data: candidateRows, error: candidateError } = await supabase
    .from("researchers")
    .select("id,openalex_id,profile_url,full_name,position_name,position,affiliation,faculty,fields_of_research")
    .or(filters.join(","))
    .limit(1000);
  if (candidateError) throw candidateError;

  const normalizedName = organizationIdentityKey(name);
  const researchers = ((candidateRows || []) as Record<string, unknown>[])
    .filter(row => organizationNamesForResearcher(row)
      .some(candidate => organizationIdentityKey(candidate) === normalizedName));
  if (researchers.length === 0) throw new Error("No researchers found for this organisation");

  const researcherIds = researchers.map(row => String(row.id || "")).filter(Boolean);
  const [themeResults, uniquePaperRollup] = await Promise.all([
    Promise.all(chunkItems(researcherIds, 50).map(async ids => {
      const { data, error } = await supabase
        .from("researcher_themes")
        .select("researcher_id,openalex_topic_id,label,description,keywords,domain_name,field_name,subfield_name,topic_strength,paper_count,first_year,latest_year,recent_paper_count,trend,confidence,evidence")
        .in("researcher_id", ids)
        .eq("source_type", "openalex_topic")
        .order("topic_strength", { ascending: false })
        .limit(1000);
      if (error) throw error;
      return (data || []) as Record<string, unknown>[];
    })),
    organizationUniquePublicationRollup(supabase, researcherIds),
  ]);
  const themeRows = themeResults.flat();
  const uniqueTopicRows = Array.isArray(uniquePaperRollup.topics)
    ? uniquePaperRollup.topics as Record<string, unknown>[]
    : [];
  const uniqueTopicsByLabel = new Map(uniqueTopicRows.map(topic => [
    normalizeName(String(topic.label || "")),
    topic,
  ]));

  type TopicAggregate = {
    openalexTopicId: string;
    label: string;
    description: string;
    keywords: string[];
    domain: string;
    field: string;
    subfield: string;
    researcherIds: Set<string>;
    paperCount: number;
    recentPaperCount: number;
    firstYear: number | null;
    latestYear: number | null;
    strength: number;
    emergingResearchers: number;
    stableResearchers: number;
    decliningResearchers: number;
    yearCounts: Map<number, number>;
    evidencePapers: Record<string, unknown>[];
  };

  const topicByKey = new Map<string, TopicAggregate>();
  const themesByResearcher = new Map<string, Record<string, unknown>[]>();
  const authorPaperCount = new Map<string, number>();
  for (const row of themeRows) {
    const researcherId = String(row.researcher_id || "");
    const topicId = String(row.openalex_topic_id || "");
    const label = String(row.label || "").trim();
    if (!researcherId || !label) continue;

    const researcherThemes = themesByResearcher.get(researcherId) || [];
    researcherThemes.push(row);
    themesByResearcher.set(researcherId, researcherThemes);
    authorPaperCount.set(researcherId, Math.max(
      authorPaperCount.get(researcherId) || 0,
      themeAuthorPaperCount(row),
    ));

    const key = topicId || normalizeName(label);
    const aggregate = topicByKey.get(key) || {
      openalexTopicId: topicId,
      label,
      description: String(row.description || ""),
      keywords: Array.isArray(row.keywords) ? row.keywords.map(String).filter(Boolean).slice(0, 8) : [],
      domain: String(row.domain_name || ""),
      field: String(row.field_name || ""),
      subfield: String(row.subfield_name || ""),
      researcherIds: new Set<string>(),
      paperCount: 0,
      recentPaperCount: 0,
      firstYear: null,
      latestYear: null,
      strength: 0,
      emergingResearchers: 0,
      stableResearchers: 0,
      decliningResearchers: 0,
      yearCounts: new Map<number, number>(),
      evidencePapers: [],
    };
    aggregate.researcherIds.add(researcherId);
    aggregate.paperCount += Math.max(0, Number(row.paper_count || 0));
    aggregate.recentPaperCount += Math.max(0, Number(row.recent_paper_count || 0));
    aggregate.strength += Math.max(0, Number(row.topic_strength || 0));
    const firstYear = Number(row.first_year || 0);
    const latestYear = Number(row.latest_year || 0);
    if (firstYear >= 1970) aggregate.firstYear = aggregate.firstYear === null ? firstYear : Math.min(aggregate.firstYear, firstYear);
    if (latestYear >= 1970) aggregate.latestYear = aggregate.latestYear === null ? latestYear : Math.max(aggregate.latestYear, latestYear);
    if (row.trend === "emerging") aggregate.emergingResearchers += 1;
    else if (row.trend === "declining") aggregate.decliningResearchers += 1;
    else aggregate.stableResearchers += 1;
    for (const [year, count] of themeYearCounts(row)) {
      aggregate.yearCounts.set(year, (aggregate.yearCounts.get(year) || 0) + count);
    }
    for (const paper of themeEvidencePapers(row)) {
      const paperKey = String(paper.openalex_work_id || paper.title || "").toLowerCase();
      if (!paperKey || aggregate.evidencePapers.some(candidate =>
        String(candidate.openalex_work_id || candidate.title || "").toLowerCase() === paperKey
      )) continue;
      aggregate.evidencePapers.push(paper);
    }
    aggregate.evidencePapers.sort((first, second) =>
      Number(second.publication_year || 0) - Number(first.publication_year || 0)
      || Number(second.cited_by_count || 0) - Number(first.cited_by_count || 0));
    aggregate.evidencePapers = aggregate.evidencePapers.slice(0, 5);
    topicByKey.set(key, aggregate);
  }

  const allThemes = [...topicByKey.values()].map(theme => {
    const researcherCount = theme.researcherIds.size;
    const uniqueTopic = uniqueTopicsByLabel.get(normalizeName(theme.label));
    const uniquePaperCount = uniqueTopic
      ? Math.max(0, Number(uniqueTopic.paper_count || 0))
      : theme.paperCount;
    const uniqueRecentPaperCount = uniqueTopic
      ? Math.max(0, Number(uniqueTopic.recent_paper_count || 0))
      : theme.recentPaperCount;
    const uniqueFirstYear = Number(uniqueTopic?.first_year || 0);
    const uniqueLatestYear = Number(uniqueTopic?.latest_year || 0);
    const uniqueYearCounts = Array.isArray(uniqueTopic?.year_counts)
      ? (uniqueTopic.year_counts as Record<string, unknown>[])
        .map(item => ({ year: Number(item.year || 0), count: Number(item.count || 0) }))
        .filter(item => item.year >= 1970 && item.count > 0)
      : [...theme.yearCounts.entries()]
        .sort((first, second) => first[0] - second[0])
        .map(([year, count]) => ({ year, count }));
    const uniqueEvidencePapers = Array.isArray(uniqueTopic?.evidence_papers)
      ? uniqueTopic.evidence_papers as Record<string, unknown>[]
      : theme.evidencePapers;
    const isEmerging = theme.emergingResearchers >= Math.max(1, Math.ceil(researcherCount * 0.35))
      && theme.emergingResearchers >= theme.decliningResearchers
      && uniqueRecentPaperCount >= 3;
    const isDeclining = !isEmerging
      && theme.decliningResearchers > theme.emergingResearchers
      && theme.decliningResearchers >= Math.max(2, Math.ceil(researcherCount * 0.4));
    return {
      openalex_topic_id: theme.openalexTopicId,
      label: theme.label,
      description: theme.description,
      keywords: theme.keywords,
      domain: theme.domain,
      field: theme.field,
      subfield: theme.subfield,
      researcher_count: researcherCount,
      paper_count: uniquePaperCount,
      recent_paper_count: uniqueRecentPaperCount,
      first_year: uniqueFirstYear >= 1970 ? uniqueFirstYear : theme.firstYear,
      latest_year: uniqueLatestYear >= 1970 ? uniqueLatestYear : theme.latestYear,
      trend: isEmerging ? "emerging" : isDeclining ? "declining" : "stable",
      emerging_researchers: theme.emergingResearchers,
      year_counts: uniqueYearCounts,
      evidence_papers: uniqueEvidencePapers.map(paper => ({
        openalex_work_id: paper.openalex_work_id,
        title: paper.title,
        publication_year: paper.publication_year,
        cited_by_count: paper.cited_by_count,
      })),
      importance: researcherCount * 5 + uniqueRecentPaperCount * 0.6 + uniquePaperCount * 0.08 + theme.strength * 10,
    };
  }).sort((first, second) => second.importance - first.importance || first.label.localeCompare(second.label));
  const emergingThemes = allThemes
    .filter(theme => theme.trend === "emerging")
    .sort((first, second) => second.recent_paper_count - first.recent_paper_count
      || second.researcher_count - first.researcher_count)
    .slice(0, 40);
  const selectedThemeKeys = new Set([
    ...allThemes.slice(0, 80).map(theme => theme.openalex_topic_id || normalizeName(theme.label)),
    ...emergingThemes.map(theme => theme.openalex_topic_id || normalizeName(theme.label)),
  ]);
  const returnedThemes = allThemes.filter(theme =>
    selectedThemeKeys.has(theme.openalex_topic_id || normalizeName(theme.label))
  );

  const researcherRows = researchers.map(row => {
    const researcherId = String(row.id || "");
    const themes = (themesByResearcher.get(researcherId) || [])
      .sort((first, second) => Number(second.topic_strength || 0) - Number(first.topic_strength || 0))
      .slice(0, 6);
    return {
      researcher_id: researcherId,
      openalex_id: row.openalex_id,
      profile_url: row.profile_url,
      full_name: row.full_name,
      title: row.position_name || row.position || "Imperial researcher",
      department: canonicalOrganizationName(row.affiliation),
      faculty: row.faculty || "",
      fields_of_research: row.fields_of_research || "",
      paper_count: authorPaperCount.get(researcherId) || 0,
      themes: themes.map(theme => ({
        openalex_topic_id: theme.openalex_topic_id,
        label: theme.label,
        trend: theme.trend,
      })),
    };
  }).sort((first, second) => String(first.full_name).localeCompare(String(second.full_name)));

  const datedThemes = returnedThemes.filter(theme => theme.first_year && theme.latest_year);
  const firstYear = datedThemes.length > 0 ? Math.min(...datedThemes.map(theme => Number(theme.first_year))) : null;
  const latestYear = datedThemes.length > 0 ? Math.max(...datedThemes.map(theme => Number(theme.latest_year))) : null;
  const topThemeNames = allThemes.slice(0, 5).map(theme => theme.label);
  const emergingNames = emergingThemes.slice(0, 3).map(theme => theme.label);
  const uniqueOrganizationPaperCount = Math.max(0, Number(uniquePaperRollup.paper_count || 0));

  return {
    organization: {
      name,
      kind: organizationKind(name),
      ...organizationHierarchy(name),
      researcher_count: researcherRows.length,
      researchers_with_topics: themesByResearcher.size,
      paper_count: uniqueOrganizationPaperCount,
      distinct_topic_count: topicByKey.size,
      emerging_topic_count: emergingThemes.length,
      first_year: firstYear,
      latest_year: latestYear,
    },
    summary: [
      `${name} has ${researcherRows.length.toLocaleString()} researcher profiles in ITMAP, with publication-topic coverage for ${themesByResearcher.size.toLocaleString()}.`,
      topThemeNames.length > 0 ? `Leading themes include ${topThemeNames.join(", ")}.` : "",
      emergingNames.length > 0 ? `Current emerging signals include ${emergingNames.join(", ")}.` : "",
    ].filter(Boolean).join(" "),
    themes: returnedThemes,
    emerging_themes: emergingThemes,
    researchers: researcherRows,
    coverage_note: uniqueOrganizationPaperCount > 0
      ? "Paper-volume charts count a publication once when several researchers in the same unit co-authored it. Exact-title preprint, journal, and repository versions are also grouped where the evidence is strong."
      : "Theme coverage ranges use the earliest and latest publication years currently available to ITMAP.",
  };
}

const PREPRINT_SOURCE_PATTERN = /(arxiv|biorxiv|medrxiv|chemrxiv|ssrn|research square|preprints\.org|osf preprints|eartharxiv|engrxiv)/i;
const GENERIC_PUBLICATION_TITLE_PATTERN = /^(issue information|contents?|contents list|table of contents|front matter|back matter|editorial board|information for authors|publication information|masthead|editors? choice|preface|foreword|introduction|index|abstracts?)$|(?:publication information|information for authors)$/i;

function normalizedPublicationTitle(value: unknown) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/<[^>]+>/g, " ")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizedPublicationDoi(value: unknown) {
  return String(value || "")
    .toLowerCase()
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//, "")
    .replace(/^doi:\s*/, "")
    .trim();
}

function isSubstantivePublicationTitle(value: string) {
  return value.length >= 24
    && value.split(/\s+/).length >= 5
    && !GENERIC_PUBLICATION_TITLE_PATTERN.test(value);
}

function isPreprintPublication(paper: Record<string, unknown>) {
  return PREPRINT_SOURCE_PATTERN.test(String(paper.source_display_name || ""))
    || PREPRINT_SOURCE_PATTERN.test(normalizedPublicationDoi(paper.doi));
}

function publicationTitleTokenSimilarity(first: string, second: string) {
  const firstTokens = new Set(first.split(/\s+/).filter(Boolean));
  const secondTokens = new Set(second.split(/\s+/).filter(Boolean));
  if (firstTokens.size < 5 || secondTokens.size < 5) return 0;
  const overlap = [...firstTokens].filter(token => secondTokens.has(token)).length;
  const union = new Set([...firstTokens, ...secondTokens]).size;
  const jaccard = union > 0 ? overlap / union : 0;
  const containment = overlap / Math.min(firstTokens.size, secondTokens.size);
  return Math.min(jaccard, containment);
}

function canonicalizePublicationRows(rows: Record<string, unknown>[]) {
  if (rows.length < 2) return rows.map(row => ({
    ...row,
    versions: publicationVersions(row),
  }));

  const papers = rows.map((row, index) => ({
    row,
    index,
    title: normalizedPublicationTitle(row.title),
    doi: normalizedPublicationDoi(row.doi),
    year: Number(row.publication_year || 0),
    isPreprint: isPreprintPublication(row),
  }));
  const parent = papers.map((_, index) => index);
  const find = (value: number): number => {
    if (parent[value] !== value) parent[value] = find(parent[value]);
    return parent[value];
  };
  const union = (first: number, second: number) => {
    const firstRoot = find(first);
    const secondRoot = find(second);
    if (firstRoot !== secondRoot) parent[secondRoot] = firstRoot;
  };

  const byTitle = new Map<string, typeof papers>();
  for (const paper of papers) {
    if (!isSubstantivePublicationTitle(paper.title)) continue;
    const matches = byTitle.get(paper.title) || [];
    for (const match of matches) {
      const closeInTime = !paper.year || !match.year || Math.abs(paper.year - match.year) <= 3;
      const sameDoi = Boolean(paper.doi && match.doi && paper.doi === match.doi);
      const missingIdentifier = !paper.doi || !match.doi;
      if (sameDoi || (closeInTime && (paper.isPreprint || match.isPreprint || missingIdentifier))) {
        union(paper.index, match.index);
      }
    }
    matches.push(paper);
    byTitle.set(paper.title, matches);
  }

  const preprints = papers.filter(paper => paper.isPreprint && isSubstantivePublicationTitle(paper.title));
  const published = papers.filter(paper => !paper.isPreprint && isSubstantivePublicationTitle(paper.title));
  for (const preprint of preprints) {
    for (const publication of published) {
      if (find(preprint.index) === find(publication.index)) continue;
      if (preprint.year && publication.year && Math.abs(preprint.year - publication.year) > 3) continue;
      const lengthRatio = Math.min(preprint.title.length, publication.title.length)
        / Math.max(preprint.title.length, publication.title.length);
      if (lengthRatio < 0.8) continue;
      if (publicationTitleTokenSimilarity(preprint.title, publication.title) >= 0.82) {
        union(preprint.index, publication.index);
      }
    }
  }

  const groups = new Map<number, Record<string, unknown>[]>();
  for (const paper of papers) {
    const root = find(paper.index);
    const group = groups.get(root) || [];
    group.push(paper.row);
    groups.set(root, group);
  }

  return [...groups.values()]
    .map(group => {
      const ranked = [...group].sort((first, second) => {
        const firstPreprint = isPreprintPublication(first);
        const secondPreprint = isPreprintPublication(second);
        const firstDoi = Boolean(normalizedPublicationDoi(first.doi));
        const secondDoi = Boolean(normalizedPublicationDoi(second.doi));
        const firstRank = !firstPreprint && firstDoi ? 0 : !firstPreprint ? 1 : firstDoi ? 2 : 3;
        const secondRank = !secondPreprint && secondDoi ? 0 : !secondPreprint ? 1 : secondDoi ? 2 : 3;
        return firstRank - secondRank
          || Number(second.publication_year || 0) - Number(first.publication_year || 0)
          || Number(second.cited_by_count || 0) - Number(first.cited_by_count || 0);
      });
      const canonical = ranked[0];
      const longestAbstract = [...group]
        .map(paper => String(paper.abstract || ""))
        .sort((first, second) => second.length - first.length)[0] || "";
      const versions = [...new Map(group.flatMap(paper => publicationVersions(paper)).map(version => {
        return [version.url || version.openalex_url || String(version.openalex_work_id || ""), version];
      })).values()];
      return {
        ...canonical,
        abstract: longestAbstract || canonical.abstract,
        cited_by_count: Math.max(...group.map(paper => Number(paper.cited_by_count || 0))),
        versions,
        version_count: versions.length,
      };
    })
    .sort((first, second) => Number(second.publication_year || 0) - Number(first.publication_year || 0)
      || Number(second.cited_by_count || 0) - Number(first.cited_by_count || 0));
}

function publicationVersion(paper: Record<string, unknown>) {
  const doi = String(paper.doi || "").trim();
  const openalexWorkId = String(paper.openalex_work_id || "").replace(/^https?:\/\/openalex\.org\//i, "");
  const source = String(paper.source_display_name || "").trim();
  const isPreprint = isPreprintPublication(paper);
  const doiUrl = doi
    ? doi.startsWith("http") ? doi : `https://doi.org/${doi.replace(/^doi:\s*/i, "")}`
    : "";
  return {
    label: source || (isPreprint ? "Preprint" : doi ? "Published version" : "OpenAlex record"),
    kind: isPreprint ? "preprint" : doi ? "published" : "repository",
    url: doiUrl || (openalexWorkId ? `https://openalex.org/${openalexWorkId}` : ""),
    openalex_url: openalexWorkId ? `https://openalex.org/${openalexWorkId}` : "",
    openalex_work_id: openalexWorkId,
    doi: doi || null,
    publication_year: paper.publication_year || null,
  };
}

function publicationVersions(paper: Record<string, unknown>) {
  const storedVersions = Array.isArray(paper.versions)
    ? paper.versions.filter(version => version && typeof version === "object") as Record<string, unknown>[]
    : [];
  const currentVersion = publicationVersion(paper);
  return [...new Map([...storedVersions, currentVersion].map(version => [
    String(version.url || version.openalex_url || version.openalex_work_id || version.doi || ""),
    version,
  ])).values()].filter(version => (
    version.url || version.openalex_url || version.openalex_work_id || version.doi
  ));
}

async function fetchAllPapersForResearcher(
  supabase: ReturnType<typeof createClient>,
  researcherId: string,
) {
  const allPapers: Record<string, unknown>[] = [];
  const pageSize = 1000;
  let from = 0;

  while (from < 20000) {
    const { data, error } = await supabase
      .from("researcher_papers")
      .select("id,openalex_work_id,title,abstract,publication_year,cited_by_count,source_display_name,doi")
      .eq("researcher_id", researcherId)
      .order("publication_year", { ascending: false, nullsFirst: false })
      .order("cited_by_count", { ascending: false, nullsFirst: false })
      .range(from, from + pageSize - 1);

    if (error) throw error;
    const rows = data || [];
    allPapers.push(...rows);
    if (rows.length < pageSize) break;
    from += pageSize;
  }

  const documentMetadata = new Map<string, Record<string, unknown>>();
  for (let offset = 0; offset < allPapers.length; offset += 200) {
    const paperIds = allPapers.slice(offset, offset + 200).map(paper => String(paper.id || "")).filter(Boolean);
    if (paperIds.length === 0) continue;
    const { data, error } = await supabase
      .from("researcher_paper_documents")
      .select("paper_id,metadata")
      .in("paper_id", paperIds);
    if (error) throw error;
    for (const document of (data || []) as Record<string, unknown>[]) {
      const paperId = String(document.paper_id || "");
      const metadata = document.metadata && typeof document.metadata === "object"
        ? document.metadata as Record<string, unknown>
        : {};
      if (paperId) documentMetadata.set(paperId, metadata);
    }
  }

  return canonicalizePublicationRows(allPapers.map(paper => ({
    ...paper,
    versions: documentMetadata.get(String(paper.id || ""))?.versions || [],
  })));
}

type CanonicalCoauthorConnection = {
  openalexId: string;
  name: string;
  sharedPapers: number;
  institutions: string[];
  latestYear: number | null;
  totalCitations: number;
  paperTitles: Record<string, unknown>[];
  imperialProfile?: Record<string, unknown>;
};

function sharedPaperEvidenceKey(paper: Record<string, unknown>) {
  const workId = String(paper.openalex_work_id || "").trim().toUpperCase();
  if (workId) return `work:${workId}`;
  return `title:${String(paper.title || "").trim().toLowerCase()}:${String(paper.year || "")}`;
}

async function fetchCompleteCanonicalCoauthorsForResearcher(
  supabase: ReturnType<typeof createClient>,
  researcherId: string,
) {
  const rows: Record<string, unknown>[] = [];
  const pageSize = 1000;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase
      .from("researcher_paper_authors")
      .select("coauthor_openalex_id,coauthor_name,institution_names,publication_year,cited_by_count,paper_title,openalex_work_id")
      .eq("researcher_id", researcherId)
      .order("publication_year", { ascending: false, nullsFirst: false })
      .range(offset, offset + pageSize - 1);
    if (error) throw error;
    const page = (data || []) as Record<string, unknown>[];
    rows.push(...page);
    if (page.length < pageSize) break;
  }
  if (rows.length === 0) return [] as CanonicalCoauthorConnection[];

  const papersByAuthor = new Map<string, {
    name: string;
    institutions: Set<string>;
    papers: Map<string, Record<string, unknown>>;
    latestYear: number | null;
  }>();
  for (const row of rows) {
    const openalexId = openAlexAuthorKey(row.coauthor_openalex_id);
    if (!openalexId) continue;
    const aggregate = papersByAuthor.get(openalexId) || {
      name: String(row.coauthor_name || "Researcher").trim() || "Researcher",
      institutions: new Set<string>(),
      papers: new Map<string, Record<string, unknown>>(),
      latestYear: null,
    };
    for (const institution of Array.isArray(row.institution_names) ? row.institution_names : []) {
      const name = String(institution || "").trim();
      if (name) aggregate.institutions.add(name);
    }
    const paper = {
      openalex_work_id: row.openalex_work_id,
      title: row.paper_title,
      year: row.publication_year,
      citations: Number(row.cited_by_count || 0),
    };
    aggregate.papers.set(sharedPaperEvidenceKey(paper), paper);
    const year = Number(row.publication_year || 0);
    if (year) aggregate.latestYear = Math.max(Number(aggregate.latestYear || 0), year);
    papersByAuthor.set(openalexId, aggregate);
  }

  const profiles = await connectionProfilesByOpenAlexId(supabase, [...papersByAuthor.keys()]);
  const canonical = new Map<string, CanonicalCoauthorConnection>();
  for (const [aliasOpenAlexId, aggregate] of papersByAuthor) {
    const imperialProfile = profiles.get(aliasOpenAlexId);
    const imperialResearcherId = String(imperialProfile?.id || "");
    const canonicalOpenAlexId = openAlexAuthorKey(imperialProfile?.openalex_id) || aliasOpenAlexId;
    const identity = imperialResearcherId
      ? `researcher:${imperialResearcherId}`
      : `author:${aliasOpenAlexId}`;
    const papers = [...aggregate.papers.values()];
    const next: CanonicalCoauthorConnection = {
      openalexId: canonicalOpenAlexId,
      name: String(imperialProfile?.full_name || aggregate.name),
      sharedPapers: papers.length,
      institutions: [...aggregate.institutions].slice(0, 8),
      latestYear: aggregate.latestYear,
      totalCitations: papers.reduce((sum, paper) => sum + Number(paper.citations || 0), 0),
      paperTitles: papers
        .sort((first, second) => Number(second.year || 0) - Number(first.year || 0)
          || Number(second.citations || 0) - Number(first.citations || 0))
        .slice(0, 10),
      imperialProfile,
    };
    const existing = canonical.get(identity);
    if (!existing) {
      canonical.set(identity, next);
      continue;
    }
    const mergedPapers = new Map<string, Record<string, unknown>>();
    for (const paper of [...existing.paperTitles, ...next.paperTitles]) {
      mergedPapers.set(sharedPaperEvidenceKey(paper), paper);
    }
    existing.sharedPapers += next.sharedPapers;
    existing.totalCitations += next.totalCitations;
    existing.latestYear = Math.max(Number(existing.latestYear || 0), Number(next.latestYear || 0)) || null;
    existing.institutions = [...new Set([...existing.institutions, ...next.institutions])].slice(0, 8);
    existing.paperTitles = [...mergedPapers.values()].slice(0, 10);
  }

  return [...canonical.values()].sort((first, second) => (
    second.sharedPapers - first.sharedPapers
    || second.totalCitations - first.totalCitations
    || first.name.localeCompare(second.name)
  ));
}

async function fetchCanonicalCoauthorsForResearcher(
  supabase: ReturnType<typeof createClient>,
  researcherId: string,
  limit = 100,
) {
  const requestedLimit = Number(limit);
  const fetchAll = Number.isFinite(requestedLimit) && requestedLimit <= 0;
  if (fetchAll || requestedLimit > 100) {
    const complete = await fetchCompleteCanonicalCoauthorsForResearcher(supabase, researcherId);
    return fetchAll ? complete : complete.slice(0, requestedLimit);
  }
  const rows: Record<string, unknown>[] = [];
  const pageSize = 1000;
  for (let offset = 0; ; offset += pageSize) {
    let request = supabase
      .from("researcher_coauthors")
      .select("coauthor_openalex_id,coauthor_name,shared_papers,institution_names,latest_year,total_citations,paper_titles,imperial_researcher_id")
      .eq("researcher_id", researcherId)
      .order("shared_papers", { ascending: false })
      .order("total_citations", { ascending: false });
    request = fetchAll
      ? request.range(offset, offset + pageSize - 1)
      : request.limit(Math.max(pageSize, Math.min(5000, requestedLimit * 4)));
    const { data, error } = await request;
    if (error) throw error;
    const page = (data || []) as Record<string, unknown>[];
    rows.push(...page);
    if (!fetchAll || page.length < pageSize) break;
  }
  if (rows.length === 0) return [] as CanonicalCoauthorConnection[];

  const profileByOpenAlexId = await connectionProfilesByOpenAlexId(
    supabase,
    rows.map(row => String(row.coauthor_openalex_id || "")),
  );
  const profileByResearcherId = new Map<string, Record<string, unknown>>();
  for (const profile of profileByOpenAlexId.values()) {
    const profileId = String(profile.id || "");
    if (profileId) profileByResearcherId.set(profileId, profile);
  }

  const missingProfileIds = [...new Set(
    rows
      .map(row => String(row.imperial_researcher_id || ""))
      .filter(id => id && !profileByResearcherId.has(id)),
  )];
  for (let offset = 0; offset < missingProfileIds.length; offset += 50) {
    const { data: profiles, error: profileError } = await supabase
      .from("researchers")
      .select("id,openalex_id,profile_url,full_name,position_name,position,affiliation,faculty")
      .in("id", missingProfileIds.slice(offset, offset + 50));
    if (profileError) throw profileError;
    for (const profile of (profiles || []) as Record<string, unknown>[]) {
      const profileId = String(profile.id || "");
      if (profileId) profileByResearcherId.set(profileId, profile);
    }
  }

  const canonical = new Map<string, CanonicalCoauthorConnection>();
  for (const row of rows) {
    const aliasOpenAlexId = openAlexAuthorKey(row.coauthor_openalex_id);
    if (!aliasOpenAlexId) continue;
    const imperialProfile = profileByResearcherId.get(String(row.imperial_researcher_id || ""))
      || profileByOpenAlexId.get(aliasOpenAlexId);
    const imperialResearcherId = String(imperialProfile?.id || "");
    const canonicalOpenAlexId = openAlexAuthorKey(imperialProfile?.openalex_id) || aliasOpenAlexId;
    const identity = imperialResearcherId
      ? `researcher:${imperialResearcherId}`
      : `author:${aliasOpenAlexId}`;
    const institutions = Array.isArray(row.institution_names)
      ? row.institution_names.map(String).map(value => value.trim()).filter(Boolean)
      : [];
    const paperTitles = Array.isArray(row.paper_titles)
      ? row.paper_titles as Record<string, unknown>[]
      : [];
    const next: CanonicalCoauthorConnection = {
      openalexId: canonicalOpenAlexId,
      name: String(imperialProfile?.full_name || row.coauthor_name || "Researcher").trim() || "Researcher",
      sharedPapers: Math.max(0, Number(row.shared_papers || 0)),
      institutions: [...new Set(institutions)].slice(0, 8),
      latestYear: Number(row.latest_year || 0) || null,
      totalCitations: Math.max(0, Number(row.total_citations || 0)),
      paperTitles: paperTitles.slice(0, 10),
      imperialProfile,
    };

    const existing = canonical.get(identity);
    if (!existing) {
      canonical.set(identity, next);
      continue;
    }

    const papers = new Map<string, Record<string, unknown>>();
    for (const paper of [...existing.paperTitles, ...next.paperTitles]) {
      const key = sharedPaperEvidenceKey(paper);
      if (!papers.has(key)) papers.set(key, paper);
    }
    existing.sharedPapers += next.sharedPapers;
    existing.totalCitations += next.totalCitations;
    existing.latestYear = Math.max(Number(existing.latestYear || 0), Number(next.latestYear || 0)) || null;
    existing.institutions = [...new Set([...existing.institutions, ...next.institutions])].slice(0, 8);
    existing.paperTitles = [...papers.values()].slice(0, 10);
  }

  const ranked = [...canonical.values()]
    .sort((first, second) => (
      second.sharedPapers - first.sharedPapers
      || second.totalCitations - first.totalCitations
      || first.name.localeCompare(second.name)
    ));
  return fetchAll
    ? ranked
    : ranked.slice(0, Math.max(1, requestedLimit || 100));
}

async function fetchTopCoauthorsForResearcher(
  supabase: ReturnType<typeof createClient>,
  researcherId: string,
  limit = 20,
) {
  let ranked: CanonicalCoauthorConnection[] = [];
  try {
    ranked = await fetchCanonicalCoauthorsForResearcher(supabase, researcherId, limit);
  } catch (error) {
    console.warn("Could not load researcher co-authors", error);
    return [];
  }

  return serializeCoauthorConnections(ranked);
}

function serializeCoauthorConnections(ranked: CanonicalCoauthorConnection[]) {
  return ranked.map(coauthor => {
    const imperialProfile = coauthor.imperialProfile;
    return {
      openalex_id: coauthor.openalexId,
      name: coauthor.name,
      shared_papers: coauthor.sharedPapers,
      institutions: coauthor.institutions.slice(0, 4),
      latest_year: coauthor.latestYear,
      is_imperial_profile: Boolean(imperialProfile),
      imperial_researcher_id: imperialProfile?.id || null,
      imperial_title: imperialProfile ? (imperialProfile.position_name || imperialProfile.position || "") : "",
      imperial_department: imperialProfile ? (imperialProfile.affiliation || "") : "",
      imperial_faculty: imperialProfile ? (imperialProfile.faculty || "") : "",
      paper_titles: coauthor.paperTitles.slice(0, 10),
    };
  });
}

async function fetchRecentCoauthorsForResearcher(
  supabase: ReturnType<typeof createClient>,
  researcherId: string,
  limit = 12,
) {
  let coauthors: CanonicalCoauthorConnection[] = [];
  try {
    coauthors = await fetchCompleteCanonicalCoauthorsForResearcher(supabase, researcherId);
    if (coauthors.length === 0) {
      coauthors = await fetchCanonicalCoauthorsForResearcher(
        supabase,
        researcherId,
        Math.min(100, Math.max(40, limit * 8)),
      );
    }
  } catch (error) {
    console.warn("Could not load recent researcher co-authors", error);
    return [];
  }

  const recent = [...coauthors]
    .sort((first, second) => (
      Number(second.latestYear || 0) - Number(first.latestYear || 0)
      || second.sharedPapers - first.sharedPapers
      || second.totalCitations - first.totalCitations
      || first.name.localeCompare(second.name)
    ))
    .slice(0, Math.max(1, limit));

  return serializeCoauthorConnections(recent);
}

async function researcherNetworkById(
  supabase: ReturnType<typeof createClient>,
  researcherId: string,
  requestedLimit = 60,
) {
  const startedAt = Date.now();
  const numericLimit = Number(requestedLimit);
  const networkLimit = Number.isFinite(numericLimit) && numericLimit <= 0
    ? 0
    : Math.max(10, Math.min(numericLimit || 60, 500));
  const [researcherResult, canonicalConnections] = await Promise.all([
    supabase
      .from("researchers")
      .select("id,openalex_id,profile_url,full_name,position_name,position,affiliation,faculty")
      .eq("id", researcherId)
      .maybeSingle(),
    fetchCanonicalCoauthorsForResearcher(supabase, researcherId, networkLimit),
  ]);

  if (researcherResult.error) throw researcherResult.error;
  if (!researcherResult.data) throw new Error("Researcher not found");

  const researcher = researcherResult.data as Record<string, unknown>;
  const focalOpenAlexId = openAlexAuthorKey(researcher.openalex_id);
  const connections = canonicalConnections
    .filter(connection => connection.openalexId !== focalOpenAlexId)
    .map(connection => {
      const imperialProfile = connection.imperialProfile;
      return {
        openalex_id: connection.openalexId,
        name: connection.name,
        shared_papers: connection.sharedPapers,
        institutions: connection.institutions.slice(0, 5),
        latest_year: connection.latestYear,
        total_citations: connection.totalCitations,
        paper_titles: connection.paperTitles,
        is_imperial_profile: Boolean(imperialProfile),
        imperial_researcher_id: imperialProfile?.id || null,
        imperial_profile_url: imperialProfile?.profile_url || null,
        imperial_title: imperialProfile ? (imperialProfile.position_name || imperialProfile.position || "") : "",
        imperial_department: imperialProfile ? canonicalRelationshipAffiliation(imperialProfile.affiliation) : "",
        imperial_faculty: imperialProfile?.faculty || "",
      };
    });

  const imperialConnections = connections.filter(connection => connection.is_imperial_profile);
  return {
    focal: {
      researcher_id: researcher.id,
      openalex_id: focalOpenAlexId,
      profile_url: researcher.profile_url,
      name: researcher.full_name,
      title: researcher.position_name || researcher.position || "Imperial researcher",
      department: canonicalRelationshipAffiliation(researcher.affiliation),
      faculty: researcher.faculty || "Imperial College London",
    },
    connections,
    counts: {
      total_coauthors: connections.length,
      returned_coauthors: connections.length,
      imperial_coauthors: imperialConnections.length,
      external_coauthors: connections.length - imperialConnections.length,
      departments: new Set(imperialConnections.map(connection => connection.imperial_department).filter(Boolean)).size,
      faculties: new Set(imperialConnections.map(connection => connection.imperial_faculty).filter(Boolean)).size,
    },
    duration_ms: Date.now() - startedAt,
  };
}

async function collaborationOpportunitiesByResearcher(
  supabase: ReturnType<typeof createClient>,
  researcherId: string,
  requestedLimit = 24,
) {
  const startedAt = Date.now();
  const opportunityLimit = Math.max(6, Math.min(Number(requestedLimit) || 24, 50));
  const [researcherResult, themesResult, opportunitiesResult] = await Promise.all([
    supabase
      .from("researchers")
      .select("id,openalex_id,profile_url,full_name,position_name,position,affiliation,faculty")
      .eq("id", researcherId)
      .maybeSingle(),
    supabase
      .from("researcher_themes")
      .select(
        "openalex_topic_id,label,description,keywords,domain_name,field_name,subfield_name,topic_strength,paper_share,paper_count,first_year,latest_year,recent_paper_count,trend,confidence",
      )
      .eq("researcher_id", researcherId)
      .eq("source_type", "openalex_topic")
      .order("topic_strength", { ascending: false })
      .limit(12),
    supabase.rpc("find_collaboration_opportunities", {
      p_researcher_id: researcherId,
      p_match_count: opportunityLimit,
    }),
  ]);

  if (researcherResult.error) throw researcherResult.error;
  if (!researcherResult.data) throw new Error("Researcher not found");
  if (themesResult.error) throw themesResult.error;
  if (opportunitiesResult.error) throw opportunitiesResult.error;

  const researcher = researcherResult.data as Record<string, unknown>;
  const themes = (themesResult.data || []) as Record<string, unknown>[];
  const opportunities = (opportunitiesResult.data || []) as Record<string, unknown>[];

  return {
    source: {
      researcher_id: researcher.id,
      openalex_id: openAlexAuthorKey(researcher.openalex_id),
      profile_url: researcher.profile_url,
      full_name: researcher.full_name,
      title: researcher.position_name || researcher.position || "Imperial researcher",
      department: researcher.affiliation || "",
      faculty: researcher.faculty || "",
    },
    themes,
    opportunities,
    coverage_note: themes.length > 0
      ? "Recommendations compare official OpenAlex topics and exclude known collaborations using co-author summaries, author aliases, and shared paper IDs."
      : "No OpenAlex Topics are cached for this researcher's stored papers yet.",
    duration_ms: Date.now() - startedAt,
  };
}

type StoredConnectionRow = {
  researcherId: string;
  openalexId: string;
  name: string;
  sharedPapers: number;
  institutions: string[];
  latestYear: number | null;
  totalCitations: number;
  paperTitles: Record<string, unknown>[];
};

function storedConnectionRow(row: Record<string, unknown>): StoredConnectionRow {
  return {
    researcherId: String(row.researcher_id || ""),
    openalexId: openAlexAuthorKey(row.coauthor_openalex_id),
    name: String(row.coauthor_name || "Researcher").trim() || "Researcher",
    sharedPapers: Math.max(0, Number(row.shared_papers || 0)),
    institutions: Array.isArray(row.institution_names)
      ? [...new Set(row.institution_names.map(String).map(value => value.trim()).filter(Boolean))].slice(0, 6)
      : [],
    latestYear: Number(row.latest_year || 0) || null,
    totalCitations: Math.max(0, Number(row.total_citations || 0)),
    paperTitles: Array.isArray(row.paper_titles)
      ? (row.paper_titles as Record<string, unknown>[]).slice(0, 6)
      : [],
  };
}

function connectionEdge(
  sourceOpenAlexId: string,
  targetOpenAlexId: string,
  row: StoredConnectionRow,
) {
  return {
    source_openalex_id: sourceOpenAlexId,
    target_openalex_id: targetOpenAlexId,
    shared_papers: row.sharedPapers,
    latest_year: row.latestYear,
    total_citations: row.totalCitations,
    paper_titles: row.paperTitles,
  };
}

function connectionPathStrength(edges: Array<ReturnType<typeof connectionEdge>>) {
  if (edges.length === 0) return 0;
  const currentYear = new Date().getUTCFullYear();
  const edgeScores = edges.map(edge => {
    const papers = Math.log1p(Math.max(0, Number(edge.shared_papers || 0))) * 18;
    const age = edge.latest_year ? Math.max(0, currentYear - Number(edge.latest_year)) : 20;
    const recency = Math.max(0, 12 - age) * 0.75;
    return papers + recency;
  });
  const weakest = Math.min(...edgeScores);
  const average = edgeScores.reduce((sum, value) => sum + value, 0) / edgeScores.length;
  return Math.round((weakest * 1.7 + average) * 100) / 100;
}

async function connectionProfilesByOpenAlexId(
  supabase: ReturnType<typeof createClient>,
  openalexIds: string[],
) {
  const uniqueIds = [...new Set(openalexIds.map(openAlexAuthorKey).filter(Boolean))];
  const profiles = new Map<string, Record<string, unknown>>();
  if (uniqueIds.length === 0) return profiles;

  const researcherSelect = "id,openalex_id,profile_url,full_name,position_name,position,affiliation,faculty";
  const chunks: string[][] = [];
  for (let offset = 0; offset < uniqueIds.length; offset += 25) {
    chunks.push(uniqueIds.slice(offset, offset + 25));
  }
  const results = await Promise.all(chunks.map(chunk => {
    const variants = [...new Set(chunk.flatMap(id => [
      id,
      id.toLowerCase(),
      `https://openalex.org/${id}`,
      `https://openalex.org/${id.toLowerCase()}`,
    ]))];
    return supabase
      .from("researchers")
      .select(researcherSelect)
      .in("openalex_id", variants);
  }));

  for (const result of results) {
    if (result.error) throw result.error;
    for (const profile of (result.data || []) as Record<string, unknown>[]) {
      const key = openAlexAuthorKey(profile.openalex_id);
      if (key && !profiles.has(key)) profiles.set(key, profile);
    }
  }

  const missingIds = uniqueIds.filter(id => !profiles.has(id));
  if (missingIds.length === 0) return profiles;

  const aliasChunks: string[][] = [];
  for (let offset = 0; offset < missingIds.length; offset += 50) {
    aliasChunks.push(missingIds.slice(offset, offset + 50));
  }
  const aliasResults = await Promise.all(aliasChunks.map(chunk => (
    supabase
      .from("researcher_openalex_aliases")
      .select("researcher_id,openalex_id,confidence,is_primary")
      .in("openalex_id", chunk)
      .order("is_primary", { ascending: false })
      .order("confidence", { ascending: false })
  )));
  const aliases: Record<string, unknown>[] = [];
  for (const result of aliasResults) {
    if (result.error) {
      console.warn("Could not resolve OpenAlex aliases", result.error);
      continue;
    }
    aliases.push(...((result.data || []) as Record<string, unknown>[]));
  }

  const researcherIds = [...new Set(aliases.map(alias => String(alias.researcher_id || "")).filter(Boolean))];
  if (researcherIds.length === 0) return profiles;
  const researcherChunks: string[][] = [];
  for (let offset = 0; offset < researcherIds.length; offset += 50) {
    researcherChunks.push(researcherIds.slice(offset, offset + 50));
  }
  const resolvedResults = await Promise.all(researcherChunks.map(chunk => (
    supabase.from("researchers").select(researcherSelect).in("id", chunk)
  )));
  const profileByResearcherId = new Map<string, Record<string, unknown>>();
  for (const result of resolvedResults) {
    if (result.error) throw result.error;
    for (const profile of (result.data || []) as Record<string, unknown>[]) {
      const researcherId = String(profile.id || "");
      if (researcherId && !profileByResearcherId.has(researcherId)) {
        profileByResearcherId.set(researcherId, profile);
      }
      const primaryKey = openAlexAuthorKey(profile.openalex_id);
      if (primaryKey && !profiles.has(primaryKey)) profiles.set(primaryKey, profile);
    }
  }

  for (const alias of aliases) {
    const aliasKey = openAlexAuthorKey(alias.openalex_id);
    const profile = profileByResearcherId.get(String(alias.researcher_id || ""));
    if (aliasKey && profile && !profiles.has(aliasKey)) profiles.set(aliasKey, profile);
  }
  return profiles;
}

async function storedBridgeRows(
  supabase: ReturnType<typeof createClient>,
  sourceProfiles: Record<string, unknown>[],
  targetOpenAlexIds: string[],
) {
  const sourceIds = [...new Set(sourceProfiles.map(profile => String(profile.id || "")).filter(Boolean))];
  const targetIds = new Set(targetOpenAlexIds.map(openAlexAuthorKey).filter(Boolean));
  if (sourceIds.length === 0 || targetIds.size === 0) return [] as StoredConnectionRow[];

  const targetProfiles = await connectionProfilesByOpenAlexId(supabase, [...targetIds]);
  const targetResearcherIds = [...new Set(
    [...targetProfiles.values()].map(profile => String(profile.id || "")).filter(Boolean),
  )];
  for (let offset = 0; offset < targetResearcherIds.length; offset += 50) {
    const { data, error } = await supabase
      .from("researcher_openalex_aliases")
      .select("openalex_id")
      .in("researcher_id", targetResearcherIds.slice(offset, offset + 50));
    if (error) {
      console.warn("Could not expand graph target aliases", error);
      break;
    }
    for (const alias of data || []) {
      const aliasKey = openAlexAuthorKey(alias.openalex_id);
      if (aliasKey) targetIds.add(aliasKey);
    }
  }

  const sourceChunks: string[][] = [];
  const targetChunks: string[][] = [];
  for (let offset = 0; offset < sourceIds.length; offset += 50) {
    sourceChunks.push(sourceIds.slice(offset, offset + 50));
  }
  const expandedTargetIds = [...targetIds];
  for (let offset = 0; offset < expandedTargetIds.length; offset += 50) {
    targetChunks.push(expandedTargetIds.slice(offset, offset + 50));
  }

  const requests = sourceChunks.flatMap(sourceChunk => targetChunks.map(targetChunk => (
    supabase
      .from("researcher_coauthors")
      .select("researcher_id,coauthor_openalex_id,coauthor_name,shared_papers,institution_names,latest_year,total_citations,paper_titles")
      .in("researcher_id", sourceChunk)
      .in("coauthor_openalex_id", targetChunk)
      .limit(1000)
  )));
  const results = await Promise.all(requests);
  const rows = new Map<string, StoredConnectionRow>();
  for (const result of results) {
    if (result.error) throw result.error;
    for (const rawRow of (result.data || []) as Record<string, unknown>[]) {
      const row = storedConnectionRow(rawRow);
      if (!row.researcherId || !row.openalexId) continue;
      rows.set(`${row.researcherId}:${row.openalexId}`, row);
    }
  }
  return [...rows.values()];
}

function connectionProfileNode(
  openalexId: string,
  profile: Record<string, unknown> | undefined,
  fallback: StoredConnectionRow | undefined,
) {
  return {
    openalex_id: openalexId,
    name: String(profile?.full_name || fallback?.name || "Researcher"),
    is_imperial_profile: Boolean(profile),
    researcher_id: profile?.id || null,
    profile_url: profile?.profile_url || null,
    title: profile ? (profile.position_name || profile.position || "Imperial researcher") : "",
    department: profile ? canonicalRelationshipAffiliation(profile.affiliation) : "",
    faculty: profile?.faculty || "",
    institutions: fallback?.institutions || [],
  };
}

async function researcherConnectionById(
  supabase: ReturnType<typeof createClient>,
  sourceResearcherId: string,
  targetResearcherId: string,
  requestedMaxDegrees = 3,
) {
  const startedAt = Date.now();
  const maxDegrees = Math.max(1, Math.min(Number(requestedMaxDegrees) || 3, 3));
  if (sourceResearcherId === targetResearcherId) throw new Error("Choose two different researchers");

  const researcherSelect = "id,openalex_id,profile_url,full_name,position_name,position,affiliation,faculty";
  const [sourceResult, targetResult, sourceCanonical, targetCanonical] = await Promise.all([
    supabase.from("researchers").select(researcherSelect).eq("id", sourceResearcherId).maybeSingle(),
    supabase.from("researchers").select(researcherSelect).eq("id", targetResearcherId).maybeSingle(),
    fetchCanonicalCoauthorsForResearcher(supabase, sourceResearcherId, 100),
    fetchCanonicalCoauthorsForResearcher(supabase, targetResearcherId, 100),
  ]);

  if (sourceResult.error) throw sourceResult.error;
  if (targetResult.error) throw targetResult.error;
  if (!sourceResult.data || !targetResult.data) throw new Error("Researcher not found");

  const sourceProfile = sourceResult.data as Record<string, unknown>;
  const targetProfile = targetResult.data as Record<string, unknown>;
  const sourceOpenAlexId = openAlexAuthorKey(sourceProfile.openalex_id);
  const targetOpenAlexId = openAlexAuthorKey(targetProfile.openalex_id);
  if (!sourceOpenAlexId || !targetOpenAlexId) throw new Error("Both researchers need an OpenAlex ID to find co-authorship paths");

  const toStoredRows = (
    ownerResearcherId: string,
    connections: CanonicalCoauthorConnection[],
    focalOpenAlexId: string,
  ) => connections.map(connection => ({
    researcherId: ownerResearcherId,
    openalexId: connection.openalexId,
    name: connection.name,
    sharedPapers: connection.sharedPapers,
    institutions: connection.institutions,
    latestYear: connection.latestYear,
    totalCitations: connection.totalCitations,
    paperTitles: connection.paperTitles,
  }))
    .filter(row => row.openalexId && row.openalexId !== focalOpenAlexId);
  const rawSourceRows = toStoredRows(sourceResearcherId, sourceCanonical, sourceOpenAlexId);
  const rawTargetRows = toStoredRows(targetResearcherId, targetCanonical, targetOpenAlexId);
  const profileByOpenAlexId = new Map<string, Record<string, unknown>>([
    [sourceOpenAlexId, sourceProfile],
    [targetOpenAlexId, targetProfile],
  ]);
  for (const connection of [...sourceCanonical, ...targetCanonical]) {
    const profile = connection.imperialProfile;
    if (profile) profileByOpenAlexId.set(connection.openalexId, profile);
  }
  const sourceNeighbours = new Map(rawSourceRows.map(row => [row.openalexId, row]));
  const targetNeighbours = new Map(rawTargetRows.map(row => [row.openalexId, row]));
  sourceNeighbours.delete(sourceOpenAlexId);
  targetNeighbours.delete(targetOpenAlexId);
  const sourceRows = [...sourceNeighbours.values()];
  const targetRows = [...targetNeighbours.values()];
  const fallbackByOpenAlexId = new Map<string, StoredConnectionRow>();
  for (const row of [...sourceRows, ...targetRows]) {
    const existing = fallbackByOpenAlexId.get(row.openalexId);
    if (!existing || row.sharedPapers > existing.sharedPapers) fallbackByOpenAlexId.set(row.openalexId, row);
  }

  type PathCandidate = {
    nodeIds: string[];
    edges: Array<ReturnType<typeof connectionEdge>>;
    strength: number;
  };
  let candidates: PathCandidate[] = [];

  if (maxDegrees >= 1) {
    const directRow = sourceNeighbours.get(targetOpenAlexId) || targetNeighbours.get(sourceOpenAlexId);
    if (directRow) {
      const edges = [connectionEdge(sourceOpenAlexId, targetOpenAlexId, directRow)];
      candidates.push({ nodeIds: [sourceOpenAlexId, targetOpenAlexId], edges, strength: connectionPathStrength(edges) });
    }
  }

  if (candidates.length === 0 && maxDegrees >= 2) {
    for (const [commonId, sourceRow] of sourceNeighbours) {
      if (commonId === sourceOpenAlexId || commonId === targetOpenAlexId) continue;
      const targetRow = targetNeighbours.get(commonId);
      if (!targetRow) continue;
      const edges = [
        connectionEdge(sourceOpenAlexId, commonId, sourceRow),
        connectionEdge(commonId, targetOpenAlexId, targetRow),
      ];
      candidates.push({
        nodeIds: [sourceOpenAlexId, commonId, targetOpenAlexId],
        edges,
        strength: connectionPathStrength(edges),
      });
    }
  }

  if (candidates.length === 0 && maxDegrees >= 3) {
    const profileByResearcherId = new Map<string, Record<string, unknown>>();
    for (const profile of profileByOpenAlexId.values()) {
      const id = String(profile.id || "");
      if (id) profileByResearcherId.set(id, profile);
    }
    const sourceInternalProfiles = [...sourceNeighbours.keys()]
      .map(id => profileByOpenAlexId.get(id))
      .filter((profile): profile is Record<string, unknown> => Boolean(profile));
    const targetInternalProfiles = [...targetNeighbours.keys()]
      .map(id => profileByOpenAlexId.get(id))
      .filter((profile): profile is Record<string, unknown> => Boolean(profile));
    const [forwardBridges, reverseBridges] = await Promise.all([
      storedBridgeRows(supabase, sourceInternalProfiles, [...targetNeighbours.keys()]),
      storedBridgeRows(supabase, targetInternalProfiles, [...sourceNeighbours.keys()]),
    ]);
    const bridgeProfiles = await connectionProfilesByOpenAlexId(
      supabase,
      [...forwardBridges, ...reverseBridges].map(bridge => bridge.openalexId),
    );
    for (const [key, profile] of bridgeProfiles) profileByOpenAlexId.set(key, profile);
    const seenPaths = new Set<string>();

    for (const bridge of forwardBridges) {
      const sourceIntermediateProfile = profileByResearcherId.get(bridge.researcherId);
      const sourceIntermediateId = openAlexAuthorKey(sourceIntermediateProfile?.openalex_id);
      const targetIntermediateId = openAlexAuthorKey(profileByOpenAlexId.get(bridge.openalexId)?.openalex_id)
        || bridge.openalexId;
      const firstEdge = sourceNeighbours.get(sourceIntermediateId);
      const lastEdge = targetNeighbours.get(targetIntermediateId);
      const nodeIds = [sourceOpenAlexId, sourceIntermediateId, targetIntermediateId, targetOpenAlexId];
      if (!firstEdge || !lastEdge || new Set(nodeIds).size !== 4) continue;
      const key = nodeIds.join(">");
      if (seenPaths.has(key)) continue;
      seenPaths.add(key);
      fallbackByOpenAlexId.set(
        targetIntermediateId,
        fallbackByOpenAlexId.get(targetIntermediateId) || { ...bridge, openalexId: targetIntermediateId },
      );
      const edges = [
        connectionEdge(sourceOpenAlexId, sourceIntermediateId, firstEdge),
        connectionEdge(sourceIntermediateId, targetIntermediateId, bridge),
        connectionEdge(targetIntermediateId, targetOpenAlexId, lastEdge),
      ];
      candidates.push({ nodeIds, edges, strength: connectionPathStrength(edges) });
    }

    for (const bridge of reverseBridges) {
      const targetIntermediateProfile = profileByResearcherId.get(bridge.researcherId);
      const targetIntermediateId = openAlexAuthorKey(targetIntermediateProfile?.openalex_id);
      const sourceIntermediateId = openAlexAuthorKey(profileByOpenAlexId.get(bridge.openalexId)?.openalex_id)
        || bridge.openalexId;
      const firstEdge = sourceNeighbours.get(sourceIntermediateId);
      const lastEdge = targetNeighbours.get(targetIntermediateId);
      const nodeIds = [sourceOpenAlexId, sourceIntermediateId, targetIntermediateId, targetOpenAlexId];
      if (!firstEdge || !lastEdge || new Set(nodeIds).size !== 4) continue;
      const key = nodeIds.join(">");
      if (seenPaths.has(key)) continue;
      seenPaths.add(key);
      fallbackByOpenAlexId.set(
        sourceIntermediateId,
        fallbackByOpenAlexId.get(sourceIntermediateId) || { ...bridge, openalexId: sourceIntermediateId },
      );
      const edges = [
        connectionEdge(sourceOpenAlexId, sourceIntermediateId, firstEdge),
        connectionEdge(sourceIntermediateId, targetIntermediateId, bridge),
        connectionEdge(targetIntermediateId, targetOpenAlexId, lastEdge),
      ];
      candidates.push({ nodeIds, edges, strength: connectionPathStrength(edges) });
    }
  }

  candidates = candidates
    .sort((first, second) => second.strength - first.strength)
    .slice(0, 3);
  const intermediateIds = [...new Set(candidates.flatMap(path => path.nodeIds.slice(1, -1)))];
  const missingProfileIds = intermediateIds.filter(id => !profileByOpenAlexId.has(id));
  if (missingProfileIds.length > 0) {
    const intermediateProfiles = await connectionProfilesByOpenAlexId(supabase, missingProfileIds);
    for (const [key, profile] of intermediateProfiles) profileByOpenAlexId.set(key, profile);
  }
  const visibleNodeIds = [...new Set(candidates.flatMap(path => path.nodeIds))];
  const nodes = visibleNodeIds.map(openalexId => connectionProfileNode(
    openalexId,
    profileByOpenAlexId.get(openalexId),
    fallbackByOpenAlexId.get(openalexId),
  ));

  return {
    found: candidates.length > 0,
    degree: candidates[0]?.edges.length || null,
    source: connectionProfileNode(sourceOpenAlexId, sourceProfile, undefined),
    target: connectionProfileNode(targetOpenAlexId, targetProfile, undefined),
    nodes,
    paths: candidates.map((path, index) => ({
      id: `path-${index + 1}`,
      degree: path.edges.length,
      node_ids: path.nodeIds,
      edges: path.edges,
      strength: path.strength,
    })),
    coverage_note: candidates.length > 0
      ? "Paths use stored ITMAP co-authorship evidence. Department and faculty membership do not count as degrees of separation."
      : "No known co-authorship path was found within three degrees in the stored ITMAP network. This does not prove that no wider relationship exists.",
    duration_ms: Date.now() - startedAt,
  };
}

function collaborationGroupKey(value: unknown) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/gi, " ")
    .trim()
    .toLowerCase()
    .replace(/^institute for climate change$/, "grantham institute for climate change");
}

async function fetchStoredCollaborationTimeline(
  supabase: ReturnType<typeof createClient>,
  researcherId: string,
) {
  const { data, error } = await supabase
    .from("researcher_collaboration_years")
    .select("year,active_coauthors,new_coauthors,imperial_coauthors,cross_department,cross_faculty,other_institutions,shared_papers,total_coauthors,matched_imperial_coauthors,top_cross_department")
    .eq("researcher_id", researcherId)
    .order("year", { ascending: true });

  if (error) {
    console.warn("Could not load stored collaboration timeline", error);
    return null;
  }
  if (!data || data.length === 0) return null;

  return {
    years: data.map(row => ({
      year: Number(row.year || 0),
      active_coauthors: Number(row.active_coauthors || 0),
      new_coauthors: Number(row.new_coauthors || 0),
      imperial_coauthors: Number(row.imperial_coauthors || 0),
      cross_department: Number(row.cross_department || 0),
      cross_faculty: Number(row.cross_faculty || 0),
      other_institutions: Number(row.other_institutions || 0),
      shared_papers: Number(row.shared_papers || 0),
      top_cross_department: Array.isArray(row.top_cross_department) ? row.top_cross_department : [],
    })),
    total_coauthors: Number(data[0].total_coauthors || 0),
    matched_imperial_coauthors: Number(data[0].matched_imperial_coauthors || 0),
  };
}

async function fetchCollaborationTimelineForResearcher(
  supabase: ReturnType<typeof createClient>,
  researcher: Record<string, unknown>,
) {
  const researcherId = String(researcher.id || "");
  const focalOpenAlexId = openAlexAuthorKey(researcher.openalex_id);
  if (!researcherId || !focalOpenAlexId) {
    return { years: [], matched_imperial_coauthors: 0, total_coauthors: 0 };
  }

  const rows: Record<string, unknown>[] = [];
  const pageSize = 1000;
  let from = 0;
  while (from < 50000) {
    const { data, error } = await supabase
      .from("researcher_paper_authors")
      .select("coauthor_openalex_id,coauthor_name,institution_names,publication_year,openalex_work_id")
      .eq("researcher_id", researcherId)
      .order("publication_year", { ascending: true, nullsFirst: false })
      .range(from, from + pageSize - 1);
    if (error) {
      console.warn("Could not load researcher collaboration timeline", error);
      return { years: [], matched_imperial_coauthors: 0, total_coauthors: 0 };
    }
    const page = (data || []) as Record<string, unknown>[];
    rows.push(...page);
    if (page.length < pageSize) break;
    from += pageSize;
  }

  const usableRows = rows.filter(row => {
    const coauthorId = openAlexAuthorKey(row.coauthor_openalex_id);
    const year = Number(row.publication_year || 0);
    return coauthorId && coauthorId !== focalOpenAlexId && year >= 1970 && year <= new Date().getFullYear() + 1;
  });
  const coauthorIds = [...new Set(usableRows.map(row => openAlexAuthorKey(row.coauthor_openalex_id)))];
  const profileByOpenAlexId = new Map<string, Record<string, unknown>>();
  const chunkSize = 120;
  const coauthorChunks: string[][] = [];
  for (let offset = 0; offset < coauthorIds.length; offset += chunkSize) {
    coauthorChunks.push(coauthorIds.slice(offset, offset + chunkSize));
  }

  for (let offset = 0; offset < coauthorChunks.length; offset += 5) {
    const results = await Promise.all(coauthorChunks.slice(offset, offset + 5).map(async chunk => {
      const variants = [...chunk, ...chunk.map(id => `https://openalex.org/${id}`)];
      return supabase
        .from("researchers")
        .select("id,openalex_id,full_name,position_name,position,affiliation,faculty")
        .in("openalex_id", variants);
    }));
    for (const { data, error } of results) {
      if (error) {
        console.warn("Could not match collaboration timeline co-authors", error);
        continue;
      }
      for (const profile of (data || []) as Record<string, unknown>[]) {
        const key = openAlexAuthorKey(profile.openalex_id);
        if (key && !profileByOpenAlexId.has(key)) profileByOpenAlexId.set(key, profile);
      }
    }
  }

  const focalDepartment = collaborationGroupKey(researcher.affiliation || researcher.research);
  const focalFaculty = collaborationGroupKey(researcher.faculty);
  const rowsByYear = new Map<number, Record<string, unknown>[]>();
  for (const row of usableRows) {
    const year = Number(row.publication_year);
    const bucket = rowsByYear.get(year) || [];
    bucket.push(row);
    rowsByYear.set(year, bucket);
  }

  const seenCoauthors = new Set<string>();
  const years = [...rowsByYear.entries()]
    .sort(([firstYear], [secondYear]) => firstYear - secondYear)
    .map(([year, yearRows]) => {
      const activeCoauthors = new Set<string>();
      const imperialCoauthors = new Set<string>();
      const crossDepartment = new Set<string>();
      const crossFaculty = new Set<string>();
      const otherInstitutions = new Set<string>();
      const sharedPapers = new Set<string>();
      const collaboratorCounts = new Map<string, number>();

      for (const row of yearRows) {
        const coauthorId = openAlexAuthorKey(row.coauthor_openalex_id);
        if (!coauthorId) continue;
        activeCoauthors.add(coauthorId);
        sharedPapers.add(String(row.openalex_work_id || `${coauthorId}:${year}`));
        collaboratorCounts.set(coauthorId, (collaboratorCounts.get(coauthorId) || 0) + 1);

        const profile = profileByOpenAlexId.get(coauthorId);
        if (profile) {
          imperialCoauthors.add(coauthorId);
          const department = collaborationGroupKey(profile.affiliation);
          const faculty = collaborationGroupKey(profile.faculty);
          if (focalDepartment && department && department !== focalDepartment) crossDepartment.add(coauthorId);
          if (focalFaculty && faculty && faculty !== focalFaculty) crossFaculty.add(coauthorId);
        } else {
          const institutions = Array.isArray(row.institution_names) ? row.institution_names.map(String) : [];
          const hasImperialAffiliation = institutions.some(name => /imperial college/i.test(name));
          if (!hasImperialAffiliation) otherInstitutions.add(coauthorId);
        }
      }

      const newCoauthors = [...activeCoauthors].filter(id => !seenCoauthors.has(id));
      activeCoauthors.forEach(id => seenCoauthors.add(id));

      const topCrossDepartment = [...crossDepartment]
        .map(openalexId => {
          const profile = profileByOpenAlexId.get(openalexId) || {};
          return {
            researcher_id: profile.id || null,
            openalex_id: openalexId,
            name: profile.full_name || yearRows.find(row => openAlexAuthorKey(row.coauthor_openalex_id) === openalexId)?.coauthor_name || "Imperial researcher",
            department: profile.affiliation || "",
            faculty: profile.faculty || "",
            shared_papers: collaboratorCounts.get(openalexId) || 0,
          };
        })
        .sort((first, second) => second.shared_papers - first.shared_papers)
        .slice(0, 6);

      return {
        year,
        active_coauthors: activeCoauthors.size,
        new_coauthors: newCoauthors.length,
        imperial_coauthors: imperialCoauthors.size,
        cross_department: crossDepartment.size,
        cross_faculty: crossFaculty.size,
        other_institutions: otherInstitutions.size,
        shared_papers: sharedPapers.size,
        top_cross_department: topCrossDepartment,
      };
    });

  return {
    years,
    matched_imperial_coauthors: profileByOpenAlexId.size,
    total_coauthors: coauthorIds.length,
  };
}

async function summarizeResearcherProfileWithLlm(
  openAiKey: string,
  model: string,
  researcher: Record<string, unknown>,
  papers: Record<string, unknown>[],
) {
  const fallback = truncateText(
    [researcher.bio_about, researcher.research, researcher.fields_of_research]
      .filter(Boolean)
      .join(" "),
    900,
  );
  if (!fallback && papers.length === 0) return "";

  try {
    const result = await openAiJson(
      openAiKey,
      model,
      [
        {
          role: "system",
          content: [
            "You write concise researcher profile summaries for an Imperial College London expert-finding tool.",
            "Use only the supplied profile, position, fields, and paper titles.",
            "Do not invent affiliations, grants, papers, or claims.",
            "Write naturally for a non-technical reader. Do not mention prompts, supplied data, databases, datasets, models, or internal processing.",
            "Write the summary as 100-150 words.",
            "Return JSON only: {\"summary\":\"...\"}",
          ].join(" "),
        },
        {
          role: "user",
          content: JSON.stringify({
            name: researcher.full_name,
            position: researcher.position_name || researcher.position,
            department: researcher.affiliation || researcher.research,
            faculty: researcher.faculty,
            fields_of_research: researcher.fields_of_research,
            profile: truncateText(researcher.bio_about, 1800),
            research: truncateText(researcher.research, 700),
            paper_count: papers.length,
            paper_titles: papers.slice(0, 80).map(paper => ({
              title: truncateText(paper.title, 220),
              year: paper.publication_year || null,
              journal: truncateText(paper.source_display_name, 120),
            })),
          }),
        },
      ],
      1800,
    ) as { summary?: string };

    return truncateText(naturaliseProfileAnswer(result.summary || fallback), 1400);
  } catch (error) {
    console.error("Researcher profile summary failed", error);
    return fallback;
  }
}

async function researcherProfileById(
  supabase: ReturnType<typeof createClient>,
  openAiKey: string,
  model: string,
  researcherId: string,
) {
  const { data: researcher, error } = await supabase
    .from("researchers")
    .select("id,openalex_id,profile_url,full_name,email,bio_about,research,position_name,position,affiliation,faculty,fields_of_research")
    .eq("id", researcherId)
    .maybeSingle();

  if (error) throw error;
  if (!researcher) throw new Error("Researcher not found");

  const papers = await fetchAllPapersForResearcher(supabase, researcherId);
  const coauthors = await fetchRecentCoauthorsForResearcher(supabase, researcherId, 12);
  const collaborationTimeline = await fetchStoredCollaborationTimeline(supabase, researcherId)
    || await fetchCollaborationTimelineForResearcher(supabase, researcher);
  const profileSummary = await summarizeResearcherProfileWithLlm(openAiKey, model, researcher, papers);

  return {
    researcher: {
      researcher_id: researcher.id,
      openalex_id: researcher.openalex_id,
      profile_url: researcher.profile_url,
      full_name: researcher.full_name,
      email: researcher.email,
      bio_about: researcher.bio_about,
      research: researcher.research,
      position_name: researcher.position_name,
      position: researcher.position,
      affiliation: researcher.affiliation,
      faculty: researcher.faculty,
      fields_of_research: researcher.fields_of_research,
      profile_summary: profileSummary,
      paper_count: papers.length,
    },
    papers: papers.map(paper => ({
      title: paper.title,
      abstract: truncateText(paper.abstract, 800),
      year: paper.publication_year,
      citations: paper.cited_by_count,
      journal: paper.source_display_name,
      openalex_work_id: paper.openalex_work_id,
      doi: paper.doi,
      versions: Array.isArray(paper.versions) ? paper.versions : [],
    })),
    coauthors,
    collaboration_timeline: collaborationTimeline,
  };
}

async function answerResearcherProfileQuestion(
  supabase: ReturnType<typeof createClient>,
  openAiKey: string,
  model: string,
  researcherId: string,
  question: string,
) {
  const trimmedQuestion = truncateText(question, 1200);
  if (!trimmedQuestion) throw new Error("Missing question");

  const { data: researcher, error } = await supabase
    .from("researchers")
    .select("id,openalex_id,profile_url,full_name,email,bio_about,research,position_name,position,affiliation,faculty,fields_of_research")
    .eq("id", researcherId)
    .maybeSingle();

  if (error) throw error;
  if (!researcher) throw new Error("Researcher not found");

  if (isOffTopicProfileQuestion(trimmedQuestion)) {
    return profileChatRefusal(String(researcher.full_name || "this researcher"));
  }

  const allPapers = await fetchAllPapersForResearcher(supabase, researcherId);
  const coauthors = await fetchTopCoauthorsForResearcher(supabase, researcherId, 20);
  const questionTerms = queryTerms(trimmedQuestion);
  const relevantPapers = allPapers
    .map(paper => ({
      paper,
      score: scorePaper(trimmedQuestion, questionTerms, paper),
    }))
    .filter(entry => entry.score > 0)
    .sort((a, b) => {
      const scoreDiff = b.score - a.score;
      if (scoreDiff !== 0) return scoreDiff;
      return Number(b.paper.cited_by_count || 0) - Number(a.paper.cited_by_count || 0);
    })
    .slice(0, 30)
    .map(entry => entry.paper);
  const representativePapers = relevantPapers.length > 0
    ? relevantPapers
    : allPapers.slice(0, 30);

  const result = await openAiJson(
    openAiKey,
    model,
    [
      {
        role: "system",
        content: [
          "You answer serious questions about one Imperial College London researcher for ITMAP.",
          "Only answer questions about the researcher's research profile, expertise, position, publications, co-authors, collaborations, grants, media evidence, or related academic and professional context.",
          "Politely refuse poems, recipes, jokes, roleplay, entertainment, personal advice, or other off-topic requests.",
          "Use only the profile, position, fields, paper metadata, and co-author evidence in the JSON payload.",
          "Write naturally for a user. Do not mention databases, datasets, JSON, supplied evidence, provided evidence, co-author summaries, metadata dumps, or internal system details.",
          "Do not start with phrases like 'Based on the provided...' or 'Based on the supplied...'.",
          "For co-author questions, describe recurring collaborators directly and mention shared-paper counts when useful.",
          "Do not invent papers, grants, affiliations, startups, or claims.",
          "If there is not enough evidence, say that naturally without naming the database.",
          "Write a direct answer in 120-220 words.",
          "Return JSON only: {\"answer\":\"...\",\"evidence_titles\":[\"...\"],\"caveat\":\"...\"}",
        ].join(" "),
      },
      {
        role: "user",
        content: JSON.stringify({
          question: trimmedQuestion,
          researcher: {
            name: researcher.full_name,
            position: researcher.position_name || researcher.position,
            department: researcher.affiliation || researcher.research,
            faculty: researcher.faculty,
            fields_of_research: researcher.fields_of_research,
            profile: truncateText(researcher.bio_about, 2600),
            research: truncateText(researcher.research, 900),
            paper_count: allPapers.length,
          },
          papers: representativePapers.map(paper => ({
            title: truncateText(paper.title, 240),
            abstract: truncateText(paper.abstract, 700),
            year: paper.publication_year || null,
            journal: truncateText(paper.source_display_name, 120),
            citations: paper.cited_by_count || 0,
          })),
          coauthors: coauthors.map(coauthor => ({
            name: coauthor.name,
            openalex_id: coauthor.openalex_id,
            shared_papers: coauthor.shared_papers,
            latest_year: coauthor.latest_year,
            institutions: coauthor.institutions,
            is_imperial_profile: coauthor.is_imperial_profile,
            imperial_title: coauthor.imperial_title,
            imperial_department: coauthor.imperial_department,
            representative_shared_papers: coauthor.paper_titles,
          })),
        }),
      },
    ],
    1800,
  ) as { answer?: string; evidence_titles?: string[]; caveat?: string };

  return {
    answer: truncateText(naturaliseProfileAnswer(result.answer || "I could not answer this from the available profile and papers."), 2200),
    evidence_titles: Array.isArray(result.evidence_titles) ? result.evidence_titles.slice(0, 6).map(String) : [],
    caveat: truncateText(naturaliseProfileAnswer(result.caveat || ""), 600),
  };
}

async function fetchProfileKeywordCandidates(
  supabase: ReturnType<typeof createClient>,
  query: string,
  terms: string[],
  facultyFilters: string[],
  roleFilters: string[],
) {
  const variants = profileSearchVariants(terms);
  if (variants.length === 0) return [];

  const { data, error } = await supabase
    .from("researcher_documents")
    .select(`
      researcher_id,
      document_text,
      paper_count,
      researchers (
        id,
        openalex_id,
        full_name,
        email,
        profile_url,
        bio_about,
        research,
        position_name,
        position,
        affiliation,
        faculty,
        fields_of_research
      )
    `)
    .or(variants.map(variant => `document_text.ilike.%${escapeIlike(variant)}%`).join(","))
    .limit(1000);

  if (error) throw error;

  return (data || [])
    .map((row: Record<string, unknown>) => {
      const researcher = row.researchers as Record<string, unknown> | undefined;
      if (!researcher) return null;
      return {
        researcher_id: row.researcher_id,
        openalex_id: researcher.openalex_id,
        full_name: researcher.full_name,
        email: researcher.email,
        profile_url: researcher.profile_url,
        bio_about: researcher.bio_about,
        research: researcher.research,
        position_name: researcher.position_name,
        position: researcher.position,
        affiliation: researcher.affiliation,
        faculty: researcher.faculty,
        fields_of_research: researcher.fields_of_research,
        document_text: row.document_text,
        paper_count: row.paper_count,
        similarity: 0,
      };
    })
    .filter((row): row is Record<string, unknown> => {
      if (!row) return false;
      const faculty = String(row.faculty || "");
      const positionName = String(row.position_name || "");
      const position = String(row.position || "");
      const exactScore = exactProfileEvidenceScore(query, terms, row);
      return (facultyFilters.length === 0 || facultyFilters.includes(faculty))
        && (
          roleFilters.length === 0
          || roleFilters.includes(positionName)
          || roleFilters.includes(position)
        )
        && (profileConceptScore(query, terms, row) >= 0.45 || exactScore >= 0.55);
    })
    .map(row => ({
      ...row,
      exact_profile_evidence_score: exactProfileEvidenceScore(query, terms, row),
    }))
    .sort((a, b) => {
      const bScore = Math.max(profileConceptScore(query, terms, b), Number(b.exact_profile_evidence_score || 0));
      const aScore = Math.max(profileConceptScore(query, terms, a), Number(a.exact_profile_evidence_score || 0));
      return bScore - aScore;
    })
    .slice(0, 200);
}

Deno.serve(async req => {
  const requestStartedAt = Date.now();
  let auditSupabase: ReturnType<typeof createClient> | null = null;
  let auditBody: SearchRequest | null = null;
  let auditUsage: UsageMetrics | null = null;
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = (await req.json()) as SearchRequest;
    auditBody = body;
    const query = (body.query || "").trim();
    const originalQuery = (body.original_query || query).trim();
    const redactedQueryForAudit = redactSensitiveSearchText(query);
    const redactedOriginalQueryForAudit = redactSensitiveSearchText(originalQuery || query);
    const administrativeFormInput = isLikelyAdministrativeForm(query);
    const limit = Math.max(1, Math.min(body.limit || 100, 250));

    const openAiKey = Deno.env.get("OPENAI_API_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const rankingModel = Deno.env.get("OPENAI_RANKING_MODEL")
      || Deno.env.get("OPENAI_CHAT_MODEL")
      || "gpt-5.4-nano";

    if (!openAiKey || !supabaseUrl || !serviceRoleKey) {
      throw new Error("Missing OPENAI_API_KEY, SUPABASE_URL, or SUPABASE_SERVICE_ROLE_KEY");
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    auditSupabase = supabase;

    if (body.action === "admin_search_logs") {
      return await adminSearchLogs(supabase, body);
    }

    if (body.action === "rewrite_mission") {
      if (!query) {
        return Response.json({ rewritten_query: "" }, { headers: corsHeaders });
      }
      if (administrativeFormInput) {
        return Response.json({
          rewritten_query: redactedQueryForAudit,
          must_have: [],
          nice_to_have: [],
          method_terms: [],
          domain_terms: [],
        }, { headers: corsHeaders });
      }
      let rewritten: MissionExpansion;
      try {
        rewritten = await expandMission(openAiKey, rankingModel, redactSensitiveSearchText(query));
      } catch (error) {
        console.warn("Mission rewrite failed; returning original query", error);
        rewritten = { expanded_query: redactedQueryForAudit };
      }
      return Response.json({
        rewritten_query: rewritten.expanded_query || redactedQueryForAudit || query,
        must_have: rewritten.must_have || [],
        nice_to_have: rewritten.nice_to_have || [],
        method_terms: rewritten.method_terms || [],
        domain_terms: rewritten.domain_terms || [],
        search_strategy: inferSearchStrategy(query, rewritten),
      }, { headers: corsHeaders });
    }

    if (body.action === "suggest_researchers") {
      const suggestions = query
        ? await suggestResearchersByName(supabase, query)
        : [];
      return Response.json({ suggestions }, { headers: corsHeaders });
    }

    if (body.action === "suggest_organizations") {
      const suggestions = query
        ? await suggestOrganizations(supabase, query, Number(body.limit || 10))
        : [];
      return Response.json({ suggestions }, { headers: corsHeaders });
    }

    if (body.action === "list_organizations") {
      const organizations = await listOrganizations(supabase);
      return Response.json({ organizations }, { headers: corsHeaders });
    }

    if (body.action === "organization_profile") {
      const organizationName = String(body.organization_name || query || "").trim();
      if (!organizationName) {
        return Response.json(
          { error: "Missing organization_name" },
          { status: 400, headers: corsHeaders },
        );
      }
      const profile = await organizationProfile(supabase, organizationName);
      return Response.json(profile, { headers: corsHeaders });
    }

    if (body.action === "organization_network") {
      const researcherIds = Array.isArray(body.researcher_ids)
        ? body.researcher_ids.map(String)
        : [];
      if (researcherIds.length === 0) {
        return Response.json(
          { error: "Missing researcher_ids" },
          { status: 400, headers: corsHeaders },
        );
      }
      let network: Record<string, unknown>;
      let departmentReach: Record<string, unknown>;
      if (researcherIds.length > 200) {
        // Large units can exceed the database statement timeout when both graph
        // aggregations compete for resources. Run them independently instead.
        departmentReach = await organizationDepartmentReachNetwork(supabase, researcherIds);
        network = await organizationCollaborationNetwork(supabase, researcherIds);
      } else {
        [network, departmentReach] = await Promise.all([
          organizationCollaborationNetwork(supabase, researcherIds),
          organizationDepartmentReachNetwork(supabase, researcherIds),
        ]);
      }
      return Response.json({
        network,
        department_reach: departmentReach,
      }, { headers: corsHeaders });
    }

    if (body.action === "researcher_profile") {
      const researcherId = String(body.researcher_id || "");
      if (!researcherId) {
        return Response.json(
          { error: "Missing researcher_id" },
          { status: 400, headers: corsHeaders },
        );
      }
      const profile = await researcherProfileById(supabase, openAiKey, rankingModel, researcherId);
      return Response.json(profile, { headers: corsHeaders });
    }

    if (body.action === "researcher_network") {
      const researcherId = String(body.researcher_id || "");
      if (!researcherId) {
        return Response.json(
          { error: "Missing researcher_id" },
          { status: 400, headers: corsHeaders },
        );
      }
      const network = await researcherNetworkById(
        supabase,
        researcherId,
        body.network_limit === undefined ? 60 : Number(body.network_limit),
      );
      return Response.json(network, { headers: corsHeaders });
    }

    if (body.action === "researcher_connection") {
      const researcherId = String(body.researcher_id || "");
      const targetResearcherId = String(body.target_researcher_id || "");
      if (!researcherId || !targetResearcherId) {
        return Response.json(
          { error: "Missing researcher_id or target_researcher_id" },
          { status: 400, headers: corsHeaders },
        );
      }
      const connection = await researcherConnectionById(
        supabase,
        researcherId,
        targetResearcherId,
        Number(body.max_degrees || 3),
      );
      return Response.json(connection, { headers: corsHeaders });
    }

    if (body.action === "collaboration_opportunities") {
      const researcherId = String(body.researcher_id || "");
      if (!researcherId) {
        return Response.json(
          { error: "Missing researcher_id" },
          { status: 400, headers: corsHeaders },
        );
      }
      const result = await collaborationOpportunitiesByResearcher(
        supabase,
        researcherId,
        Number(body.limit || 24),
      );
      return Response.json(result, { headers: corsHeaders });
    }

    if (body.action === "researcher_profile_question") {
      const researcherId = String(body.researcher_id || "");
      if (!researcherId) {
        return Response.json(
          { error: "Missing researcher_id" },
          { status: 400, headers: corsHeaders },
        );
      }
      const answer = await answerResearcherProfileQuestion(
        supabase,
        openAiKey,
        rankingModel,
        researcherId,
        query,
      );
      return Response.json(answer, { headers: corsHeaders });
    }

    if (body.action === "quick_search") {
      const result = await quickSearch(supabase, openAiKey, rankingModel, query);
      return Response.json(result, { headers: corsHeaders });
    }

    if (body.action === "keyword_suggestions") {
      const suggestions = await keywordSuggestions(supabase, query);
      return Response.json({
        suggestions: suggestions.length > 0 ? suggestions : FALLBACK_KEYWORD_SUGGESTIONS,
      }, { headers: corsHeaders });
    }

    if (body.action === "match_school_missions") {
      const researchers = Array.isArray(body.researchers) ? body.researchers : [];
      const missionMatches = await matchSchoolMissionsWithLlm(openAiKey, rankingModel, query, researchers);
      return Response.json({ mission_matches: missionMatches }, { headers: corsHeaders });
    }

    if (body.action === "summarize_pool") {
      const researchers = Array.isArray(body.researchers) ? body.researchers : [];
      const summary = await summarizePoolWithLlm(openAiKey, rankingModel, query, researchers);
      return Response.json({ summary }, { headers: corsHeaders });
    }

    if (body.action === "research_pool_question") {
      const researchers = Array.isArray(body.researchers) ? body.researchers : [];
      const conversation = Array.isArray(body.conversation) ? body.conversation : [];
      const answer = await answerResearchPoolQuestion(
        openAiKey,
        rankingModel,
        originalQuery,
        query,
        researchers,
        body.pool_summary,
        conversation,
      );
      return Response.json(answer, { headers: corsHeaders });
    }

    if (!query) {
      return Response.json({ results: [], original_query: "", expanded_query: "" }, { headers: corsHeaders });
    }

    const mode = body.mode || "semantic";
    const enableRerank = body.enable_rerank !== false;
    const includeExternalEvidence = body.include_external_evidence !== false;
    const searchUsage = createUsageMetrics();
    auditUsage = searchUsage;

    if (mode === "semantic" && isInsufficientResearchQuery(query)) {
      const usageJson = usageMetricsJson(searchUsage);
      await insertSearchAuditLog(supabase, {
        action: "search",
        status: "success",
        query: redactedQueryForAudit,
        original_query: redactedOriginalQueryForAudit || redactedQueryForAudit,
        mode,
        enable_rerank: enableRerank,
        include_external_evidence: includeExternalEvidence,
        rewrite_used: false,
        duration_ms: Date.now() - requestStartedAt,
        result_count: 0,
        candidate_count: 0,
        llm_pool_size: 0,
        models: {},
        usage: usageJson,
        estimated_cost_usd: Number(usageJson.estimated_cost_usd || 0),
        metadata: { skipped_reason: "incomplete_or_greeting_query" },
      });
      return Response.json({
        results: [],
        original_query: originalQuery || query,
        expanded_query: query,
        message: "Please add a researcher name, department, or clear research topic and try again.",
      }, { headers: corsHeaders });
    }

    if (mode === "semantic" && administrativeFormInput) {
      const usageJson = usageMetricsJson(searchUsage);
      await insertSearchAuditLog(supabase, {
        action: "search",
        status: "success",
        query: redactedQueryForAudit,
        original_query: redactedOriginalQueryForAudit || redactedQueryForAudit,
        mode,
        enable_rerank: enableRerank,
        include_external_evidence: includeExternalEvidence,
        rewrite_used: Boolean(originalQuery && originalQuery !== query),
        duration_ms: Date.now() - requestStartedAt,
        result_count: 0,
        candidate_count: 0,
        llm_pool_size: 0,
        models: {},
        usage: usageJson,
        estimated_cost_usd: Number(usageJson.estimated_cost_usd || 0),
        metadata: {
          skipped_reason: "administrative_form_without_research_intent",
        },
      });
      return Response.json({
        results: [],
        original_query: originalQuery || query,
        expanded_query: query,
      }, { headers: corsHeaders });
    }

    let searchQuery = query;
    let mission: MissionExpansion;
    if (mode === "semantic") {
      mission = await expandMission(
        openAiKey,
        rankingModel,
        truncateText(redactSensitiveSearchText(query), 20000),
        searchUsage,
      );
      searchQuery = mission.expanded_query?.trim() || implicitResearchTopic(query) || query;
    } else {
      searchQuery = expandResearchAbbreviations(query);
      const rawKeywordTerms = queryTerms(searchQuery);
      mission = {
        expanded_query: searchQuery,
        must_have: rawKeywordTerms.slice(0, 10),
        nice_to_have: [],
        method_terms: rawKeywordTerms.filter(term => METHOD_TERMS.has(singularise(term))).slice(0, 8),
        domain_terms: rawKeywordTerms.filter(term => !METHOD_TERMS.has(singularise(term))).slice(0, 10),
        search_strategy: "brief",
      };
    }

    const searchStrategy: SearchStrategy = mode === "semantic"
      ? inferSearchStrategy(originalQuery || query, mission)
      : "brief";
    mission.search_strategy = searchStrategy;
    const isTopicalSearch = mode === "semantic" && searchStrategy === "topic";
    if (isTopicalSearch) {
      searchQuery = implicitResearchTopic(originalQuery || query) || searchQuery;
      mission = deterministicTopicalMission(searchQuery);
    }
    mission.expanded_query = searchQuery;
    const filters = body.filters || [];
    const lexicalTopicQueries = topicalLexicalQueries(originalQuery || query, mission);
    const scoringQuery = isTopicalSearch
      ? `${searchQuery} ${lexicalTopicQueries.methodQuery.replace(/\bOR\b/g, " ")} ${lexicalTopicQueries.domainQuery.replace(/\bOR\b/g, " ")}`
      : searchQuery;
    const terms = queryTerms(scoringQuery);
    const groups = conceptGroups(scoringQuery, terms);
    const keywordBooleanQuery = parseKeywordBooleanQuery(mode === "keyword" ? query : searchQuery);
    const isLongMission = searchStrategy === "brief" && terms.length > 10;
    const facultyFilters = filters
      .filter(filter => filter.startsWith("Faculty of") || filter === "Imperial College Business School")
      .map(normaliseFaculty);
    const roleFilters = filters.filter(filter => GRADE_FILTERS.has(filter));

    if (mode === "keyword") {
      const keywordMatchCount = Math.min(150, Math.max(60, limit * 4));
      const keywordQueries = [...new Set([query, searchQuery].map(value => value.trim()).filter(Boolean))];
      const keywordResponses = await Promise.all(keywordQueries.map(keywordQuery => (
        supabase.rpc("match_keyword_researchers", {
          search_query: keywordQuery,
          match_count: keywordMatchCount,
          faculty_filters: facultyFilters,
          role_filters: roleFilters,
        })
      )));
      const keywordFailure = keywordResponses.find(response => response.error)?.error;
      if (keywordFailure) throw keywordFailure;

      const keywordMatchesByResearcher = new Map<string, Record<string, unknown>>();
      for (const response of keywordResponses) {
        for (const rawRow of response.data || []) {
          const row = rawRow as Record<string, unknown>;
          const researcherId = String(row.researcher_id || "");
          if (!researcherId) continue;
          const existing = keywordMatchesByResearcher.get(researcherId);
          if (!existing || Number(row.similarity || 0) > Number(existing.similarity || 0)) {
            keywordMatchesByResearcher.set(researcherId, row);
          }
        }
      }
      const keywordMatches = [...keywordMatchesByResearcher.values()];

      const filteredKeywordMatches = keywordMatches
        .filter((row: Record<string, unknown>) => !isVisitingResearcher(row))
        .filter((row: Record<string, unknown>) => {
          if (!keywordBooleanQuery.hasBooleanSyntax) return true;
          return evaluateKeywordBooleanExpression(rowKeywordBooleanText(row), keywordBooleanQuery.tokens);
        });
      const keywordScores = filteredKeywordMatches
        .map((row: Record<string, unknown>) => Number(row.similarity || 0))
        .filter(Boolean);
      const minKeywordScore = keywordScores.length > 0 ? Math.min(...keywordScores) : 0;
      const maxKeywordScore = keywordScores.length > 0 ? Math.max(...keywordScores) : 1;

      const results = filteredKeywordMatches
        .sort((a: Record<string, unknown>, b: Record<string, unknown>) => Number(b.similarity || 0) - Number(a.similarity || 0))
        .map((row: Record<string, unknown>, index: number) => {
          const profileEvidence = matchedProfileEvidence(searchQuery, terms, row);
          const scoredRow = {
            ...row,
            profile_similarity: Number(row.keyword_profile_rank || 0),
            paper_similarity: Number(row.keyword_paper_rank || 0),
            profile_concept_score: profileConceptScore(searchQuery, terms, row),
            profile_authority_score: profileAuthorityScore(searchQuery, terms, row),
            exact_profile_evidence_score: exactProfileEvidenceScore(searchQuery, terms, row),
            profile_evidence: profileEvidence,
            similarity: normalise(Number(row.similarity || 0), minKeywordScore, maxKeywordScore, 0.48, 0.98)
              - Math.min(0.05, Math.log2(index + 1) * 0.006),
          };
          return {
            ...scoredRow,
            llm_match_type: keywordEvidenceMatchType(scoredRow, searchQuery),
            match_reason: buildMatchReason(scoredRow, profileEvidence),
          };
        })
        .slice(0, limit);

      await insertSearchAuditLog(supabase, {
        action: "search",
        status: "success",
        query: redactSensitiveSearchText(searchQuery),
        original_query: redactedOriginalQueryForAudit || redactSensitiveSearchText(searchQuery),
        expanded_query: originalQuery && originalQuery !== searchQuery ? redactSensitiveSearchText(searchQuery) : undefined,
        mode,
        enable_rerank: false,
        include_external_evidence: false,
        rewrite_used: Boolean(originalQuery && originalQuery !== searchQuery),
        duration_ms: Date.now() - requestStartedAt,
        result_count: results.length,
        candidate_count: filteredKeywordMatches.length,
        llm_pool_size: 0,
        models: {},
        usage: usageMetricsJson(searchUsage),
        estimated_cost_usd: 0,
      });

      return Response.json({
        results,
        original_query: originalQuery || query,
        expanded_query: searchQuery,
      }, { headers: corsHeaders });
    }

    const embedding = await createSearchEmbedding(openAiKey, searchQuery, searchUsage);

    const candidateCount = isTopicalSearch
      ? Math.min(300, Math.max(180, limit + 50))
      : Math.min(220, Math.max(90, limit * 2));
    const paperMatchCount = isLongMission
      ? Math.min(160, Math.max(80, limit * 2))
      : isTopicalSearch
        ? Math.min(1000, Math.max(500, limit * 5))
        : Math.min(500, Math.max(150, limit * 5));
    const topicalMatchCount = Math.min(300, Math.max(200, limit + 50));
    const nearestTopicalPaperCount = Math.min(450, Math.max(350, limit * 2));
    const openAlexTopicMatchCount = Math.min(500, Math.max(300, limit * 2));

    const [researcherResponse, paperResponse, topicalResponse, topicalLexicalResponse, openAlexTopicResponse] = await Promise.all([
      searchRpcWithStatementTimeoutRetry("researcher profiles", () => isTopicalSearch
        ? supabase.rpc("match_topic_researcher_profiles", {
          query_embedding: embedding,
          match_count: candidateCount,
          faculty_filters: facultyFilters,
          role_filters: roleFilters,
        })
        : supabase.rpc("match_researcher_documents", {
          query_embedding: embedding,
          match_count: candidateCount,
          faculty_filters: facultyFilters,
          role_filters: roleFilters,
        })),
      isTopicalSearch
        ? Promise.resolve({ data: [], error: null })
        : searchRpcWithStatementTimeoutRetry("paper vectors", () => supabase.rpc("match_researcher_paper_documents", {
          query_embedding: embedding,
          match_count: paperMatchCount,
          faculty_filters: facultyFilters,
          role_filters: roleFilters,
        })),
      isTopicalSearch
        ? searchRpcWithStatementTimeoutRetry("topical paper vectors", () => supabase.rpc("match_topical_researchers", {
          query_embedding: embedding,
          topic_query: searchQuery,
          match_count: topicalMatchCount,
          nearest_paper_count: nearestTopicalPaperCount,
          faculty_filters: facultyFilters,
          role_filters: roleFilters,
        }))
        : Promise.resolve({ data: [], error: null }),
      isTopicalSearch
        ? searchRpcWithStatementTimeoutRetry("profile topic terms", () => supabase.rpc("match_topic_profile_terms", {
          method_query: lexicalTopicQueries.methodQuery,
          domain_query: lexicalTopicQueries.domainQuery,
          match_count: 200,
          faculty_filters: facultyFilters,
          role_filters: roleFilters,
        }))
        : Promise.resolve({ data: [], error: null }),
      isTopicalSearch
        ? searchRpcWithStatementTimeoutRetry("OpenAlex topics", () => supabase.rpc("match_openalex_topic_researchers", {
          topic_query: searchQuery,
          match_count: openAlexTopicMatchCount,
          faculty_filters: facultyFilters,
          role_filters: roleFilters,
        }))
        : Promise.resolve({ data: [], error: null }),
    ]);

    const retrievalWarnings: string[] = [];
    const researcherMatches = searchRpcRows("researcher profiles", researcherResponse, retrievalWarnings);
    const paperMatches = searchRpcRows("paper vectors", paperResponse, retrievalWarnings);
    const topicalVectorMatches = searchRpcRows("topical paper vectors", topicalResponse, retrievalWarnings);
    const topicalLexicalMatches = searchRpcRows("profile topic terms", topicalLexicalResponse, retrievalWarnings);
    const openAlexTopicMatches = searchRpcRows("OpenAlex topics", openAlexTopicResponse, retrievalWarnings);
    const topicalMatches = [
      ...topicalVectorMatches.map((row: Record<string, unknown>) => ({
        ...row,
        topical_source: "paper_vector",
      })),
      ...openAlexTopicMatches.map((row: Record<string, unknown>) => ({
        ...row,
        topical_source: "openalex_topic",
      })),
    ];

    if (
      retrievalWarnings.length > 0
      && researcherMatches.length === 0
      && paperMatches.length === 0
      && topicalMatches.length === 0
      && topicalLexicalMatches.length === 0
    ) {
      throw new Error("Search retrieval timed out after retrying. Please try again.");
    }

    const profileKeywordMatches = isTopicalSearch
      ? topicalLexicalMatches
      : mode !== "keyword" && isLongMission
        ? []
        : await fetchProfileKeywordCandidates(
        supabase,
        searchQuery,
        terms,
        facultyFilters,
          roleFilters,
        );
    const topicalLexicalScores = topicalLexicalMatches
      .map((row: Record<string, unknown>) => Number(row.similarity || 0))
      .filter(score => Number.isFinite(score) && score > 0);
    const minTopicalLexicalScore = topicalLexicalScores.length > 0 ? Math.min(...topicalLexicalScores) : 0;
    const maxTopicalLexicalScore = topicalLexicalScores.length > 0 ? Math.max(...topicalLexicalScores) : 1;

    const allPaperSimilarities = (paperMatches || [])
      .map((paper: Record<string, unknown>) => Number(paper.similarity || 0))
      .filter(Boolean);
    const minPaperSimilarity = allPaperSimilarities.length > 0 ? Math.min(...allPaperSimilarities) : 0;
    const maxPaperSimilarity = allPaperSimilarities.length > 0 ? Math.max(...allPaperSimilarities) : 1;
    const topicalRetrievalScores = topicalMatches
      .map((row: Record<string, unknown>) => Number(row.similarity || 0))
      .filter(Number.isFinite);
    const minTopicalRetrievalScore = topicalRetrievalScores.length > 0 ? Math.min(...topicalRetrievalScores) : 0;
    const maxTopicalRetrievalScore = topicalRetrievalScores.length > 0 ? Math.max(...topicalRetrievalScores) : 1;
    const topicalThemeScores = topicalMatches
      .map((row: Record<string, unknown>) => Number(row.topic_similarity || 0))
      .filter(score => Number.isFinite(score) && score > 0);
    const minTopicalThemeScore = topicalThemeScores.length > 0 ? Math.min(...topicalThemeScores) : 0;
    const maxTopicalThemeScore = topicalThemeScores.length > 0 ? Math.max(...topicalThemeScores) : 1;
    const topicalPaperScores = topicalMatches
      .flatMap((row: Record<string, unknown>) => Array.isArray(row.papers) ? row.papers : [])
      .map((paper: Record<string, unknown>) => Number(paper.similarity || 0))
      .filter(Number.isFinite);
    const minTopicalPaperScore = topicalPaperScores.length > 0 ? Math.min(...topicalPaperScores) : 0;
    const maxTopicalPaperScore = topicalPaperScores.length > 0 ? Math.max(...topicalPaperScores) : 1;

    const paperMatchesByResearcher = new Map<string, Record<string, unknown>[]>();
    for (const paper of paperMatches || []) {
      const researcherId = String(paper.researcher_id || "");
      if (!researcherId) continue;
      const rawSimilarity = Number(paper.similarity || 0);
      const coverage = conceptCoverage(searchQuery, terms, paper, groups);
      if (coverage < 0.45) continue;
      const normalisedPaperScore = normalise(rawSimilarity, minPaperSimilarity, maxPaperSimilarity, 0.4, 0.99);
      const adjustedPaperScore = Math.max(0.05, Math.min(0.99, normalisedPaperScore * 0.65 + coverage * 0.35));
      const bucket = paperMatchesByResearcher.get(researcherId) || [];
      bucket.push(paperSummary(paper, adjustedPaperScore, adjustedPaperScore));
      paperMatchesByResearcher.set(researcherId, bucket);
    }

    for (const [researcherId, papers] of paperMatchesByResearcher.entries()) {
      paperMatchesByResearcher.set(
        researcherId,
        papers.sort((a, b) => Number(b.relevance_score || 0) - Number(a.relevance_score || 0)).slice(0, 10),
      );
    }

    const merged = new Map<string, Record<string, unknown>>();

    for (const row of researcherMatches || []) {
      const semanticPapers = paperMatchesByResearcher.get(row.researcher_id) || [];
      const profileConcept = profileConceptScore(searchQuery, terms, row);
      const profileAuthority = profileAuthorityScore(searchQuery, terms, row);
      const exactProfileEvidence = exactProfileEvidenceScore(searchQuery, terms, row);
      const profileEvidence = matchedProfileEvidence(searchQuery, terms, row);
      merged.set(row.researcher_id, {
        ...row,
        profile_similarity: Number(row.similarity || 0),
        profile_concept_score: profileConcept,
        profile_authority_score: profileAuthority,
        exact_profile_evidence_score: exactProfileEvidence,
        current_query: searchQuery,
        profile_evidence: profileEvidence,
        paper_similarity: semanticPapers.length > 0
          ? Math.max(...semanticPapers.map(paper => Number(paper.raw_similarity || 0)))
          : 0,
        papers: semanticPapers,
        match_reason: semanticPapers.length > 0
          ? "Matched from this researcher's profile and semantically relevant publications."
          : "Matched from this researcher's profile and combined publication summary.",
      });
    }

    for (const row of profileKeywordMatches) {
      const existing = merged.get(row.researcher_id);
      const profileConcept = profileConceptScore(searchQuery, terms, row);
      const profileAuthority = profileAuthorityScore(searchQuery, terms, row);
      const exactProfileEvidence = exactProfileEvidenceScore(searchQuery, terms, row);
      const profileEvidence = matchedProfileEvidence(searchQuery, terms, row);
      const topicalLexicalScore = isTopicalSearch
        ? normalise(
          Number(row.similarity || 0),
          minTopicalLexicalScore,
          maxTopicalLexicalScore,
          0.52,
          0.96,
        )
        : 0;
      if (existing) {
        existing.profile_concept_score = Math.max(Number(existing.profile_concept_score || 0), profileConcept);
        existing.profile_authority_score = Math.max(Number(existing.profile_authority_score || 0), profileAuthority);
        existing.exact_profile_evidence_score = Math.max(Number(existing.exact_profile_evidence_score || 0), exactProfileEvidence);
        existing.profile_evidence = [
          ...new Set([
            ...(((existing.profile_evidence as string[]) || [])),
            ...profileEvidence,
          ]),
        ].slice(0, 3);
        if (isTopicalSearch) {
          existing.topical_retrieval_score = Math.max(
            Number(existing.topical_retrieval_score || 0),
            topicalLexicalScore,
          );
          existing.topic_evidence = "Profile terminology aligns with both sides of the topic";
        }
        existing.match_reason = "Matched from this researcher's profile, domain terms, and publication evidence.";
      } else {
        merged.set(row.researcher_id, {
          ...row,
          profile_similarity: Math.max(0.38, profileConcept * 0.55),
          profile_concept_score: profileConcept,
          profile_authority_score: profileAuthority,
          exact_profile_evidence_score: exactProfileEvidence,
          profile_evidence: profileEvidence,
          paper_similarity: 0,
          topical_retrieval_score: topicalLexicalScore,
          topic_evidence: isTopicalSearch
            ? "Profile terminology aligns with both sides of the topic"
            : "",
          papers: [],
          match_reason: "Matched from this researcher's profile and domain-specific query terms.",
        });
      }
    }

    for (const row of topicalMatches) {
      const researcherId = String(row.researcher_id || "");
      if (!researcherId) continue;
      const rawRetrievalScore = Number(row.similarity || 0);
      const rawThemeScore = Number(row.topic_similarity || 0);
      const topicalRetrievalScore = normalise(
        rawRetrievalScore,
        minTopicalRetrievalScore,
        maxTopicalRetrievalScore,
        0.42,
        0.99,
      );
      const topicSimilarity = rawThemeScore > 0
        ? normalise(rawThemeScore, minTopicalThemeScore, maxTopicalThemeScore, 0.35, 0.96)
        : 0;
      const topicalPapers = (Array.isArray(row.papers) ? row.papers : [])
        .map((paper: Record<string, unknown>) => {
          const rawSimilarity = Number(paper.similarity || 0);
          const relevance = normalise(
            rawSimilarity,
            minTopicalPaperScore,
            maxTopicalPaperScore,
            0.42,
            0.99,
          );
          return paperSummary(paper, relevance, relevance);
        });
      const profileConcept = profileConceptScore(searchQuery, terms, row);
      const profileAuthority = profileAuthorityScore(searchQuery, terms, row);
      const exactProfileEvidence = exactProfileEvidenceScore(searchQuery, terms, row);
      const profileEvidence = matchedProfileEvidence(searchQuery, terms, row);
      const existing = merged.get(researcherId);
      const topicLabel = String(row.topic_label || "").trim();
      const topicEvidence = topicLabel
        ? `Paper theme: ${topicLabel}`
        : "Individual publications align with the topic";

      if (existing) {
        existing.profile_similarity = Math.max(
          Number(existing.profile_similarity || 0),
          Number(row.profile_similarity || 0),
        );
        existing.profile_concept_score = Math.max(Number(existing.profile_concept_score || 0), profileConcept);
        existing.profile_authority_score = Math.max(Number(existing.profile_authority_score || 0), profileAuthority);
        existing.exact_profile_evidence_score = Math.max(Number(existing.exact_profile_evidence_score || 0), exactProfileEvidence);
        existing.paper_similarity = Math.max(
          Number(existing.paper_similarity || 0),
          ...topicalPapers.map(paper => Number(paper.raw_similarity || 0)),
          0,
        );
        existing.paper_depth_score = Math.max(
          Number(existing.paper_depth_score || 0),
          Number(row.paper_depth_score || 0),
        );
        existing.topical_retrieval_score = Math.max(
          Number(existing.topical_retrieval_score || 0),
          topicalRetrievalScore,
        );
        existing.topic_similarity = Math.max(Number(existing.topic_similarity || 0), topicSimilarity);
        existing.topic_evidence = topicLabel
          ? topicEvidence
          : existing.topic_evidence || topicEvidence;
        existing.openalex_topics = mergeOpenAlexTopics(existing.openalex_topics, row.openalex_topics);
        existing.papers = mergePaperSummaries(
          topicalPapers,
          ((existing.papers as Record<string, unknown>[]) || []),
        );
        existing.profile_evidence = [
          ...new Set([
            ...(((existing.profile_evidence as string[]) || [])),
            ...profileEvidence,
          ]),
        ].slice(0, 3);
        existing.match_reason = topicLabel
          ? `Matched through the ${topicLabel} paper theme, individual publications, and profile evidence.`
          : "Matched through individual publications and profile evidence for this topic.";
      } else {
        merged.set(researcherId, {
          ...row,
          similarity: topicalRetrievalScore,
          profile_similarity: Number(row.profile_similarity || 0),
          profile_concept_score: profileConcept,
          profile_authority_score: profileAuthority,
          exact_profile_evidence_score: exactProfileEvidence,
          current_query: searchQuery,
          profile_evidence: profileEvidence,
          paper_similarity: Math.max(...topicalPapers.map(paper => Number(paper.raw_similarity || 0)), 0),
          paper_depth_score: Number(row.paper_depth_score || 0),
          topical_retrieval_score: topicalRetrievalScore,
          topic_similarity: topicSimilarity,
          topic_evidence: topicEvidence,
          openalex_topics: mergeOpenAlexTopics(row.openalex_topics),
          papers: topicalPapers,
          match_reason: topicLabel
            ? `Matched through the ${topicLabel} paper theme and individual publications.`
            : "Matched through individual publications for this topic.",
        });
      }
    }

    for (const paper of paperMatches || []) {
      const existing = merged.get(paper.researcher_id);
      const rawSimilarity = Number(paper.similarity || 0);
      const coverage = conceptCoverage(searchQuery, terms, paper, groups);
      if (coverage < 0.45) continue;
      const adjustedPaperScore = Math.max(
        0.05,
        Math.min(0.99, normalise(rawSimilarity, minPaperSimilarity, maxPaperSimilarity, 0.4, 0.99) * 0.65 + coverage * 0.35),
      );
      const semanticPaperSummary = paperSummary(
        paper,
        adjustedPaperScore,
        adjustedPaperScore,
      );
      if (existing) {
        existing.paper_similarity = Math.max(Number(existing.paper_similarity || 0), adjustedPaperScore);
        existing.papers = mergePaperSummaries(
          [semanticPaperSummary],
          ((existing.papers as Record<string, unknown>[]) || []),
        );
        existing.match_reason = "Matched from this researcher's profile and semantically relevant publications.";
      } else {
        const profileAuthority = profileAuthorityScore(searchQuery, terms, paper);
        const exactProfileEvidence = exactProfileEvidenceScore(searchQuery, terms, paper);
        const profileEvidence = matchedProfileEvidence(searchQuery, terms, paper);
        merged.set(paper.researcher_id, {
          ...paper,
          profile_similarity: 0,
          profile_concept_score: 0,
          profile_authority_score: profileAuthority,
          exact_profile_evidence_score: exactProfileEvidence,
          profile_evidence: profileEvidence,
          paper_similarity: adjustedPaperScore,
          papers: [semanticPaperSummary],
          paper_count: 1,
          document_text: "",
          match_reason: "Matched from a semantically relevant OpenAlex paper title or abstract.",
        });
      }
    }

    for (const [researcherId, row] of merged.entries()) {
      if (isVisitingResearcher(row)) {
        merged.delete(researcherId);
      }
    }

    if (isTopicalSearch && merged.size > 0) {
      const openAlexTopicsByResearcher = await fetchOpenAlexTopicsForResearchers(
        supabase,
        [...merged.keys()],
        searchQuery,
      );
      for (const [researcherId, row] of merged.entries()) {
        const topics = mergeOpenAlexTopics(
          row.openalex_topics,
          openAlexTopicsByResearcher.get(researcherId) || [],
        );
        row.openalex_topics = topics;
        const bestRelevantTopic = topics.find(topic => Number(topic.relevance || 0) >= 0.18);
        if (!bestRelevantTopic) continue;
        row.topic_similarity = Math.max(
          Number(row.topic_similarity || 0),
          Number(bestRelevantTopic.relevance || 0),
        );
        row.topic_evidence = `OpenAlex paper topic: ${bestRelevantTopic.label}`;
      }
    }

    const researcherIdsNeedingPapers = isTopicalSearch
      ? []
      : [...merged.entries()]
        .filter(([, row]) => (((row.papers as Record<string, unknown>[]) || []).length === 0))
        .map(([researcherId]) => researcherId);
    if (researcherIdsNeedingPapers.length > 0) {
      const paperRows = await fetchPapersForResearchers(supabase, researcherIdsNeedingPapers);
      const papersByResearcher = new Map<string, Record<string, unknown>[]>();

      for (const paper of paperRows) {
        const researcherId = String(paper.researcher_id || "");
        if (!researcherId) continue;
        const bucket = papersByResearcher.get(researcherId) || [];
        bucket.push(paper);
        papersByResearcher.set(researcherId, bucket);
      }

      for (const [researcherId, row] of merged.entries()) {
        const rankedPapers = (papersByResearcher.get(researcherId) || [])
          .filter(paper => conceptCoverage(searchQuery, terms, paper, groups) >= 0.45)
          .map(paper => ({ paper, score: scorePaper(searchQuery, terms, paper) + conceptCoverage(searchQuery, terms, paper, groups) * 8 }))
          .filter(({ score }) => score > 0)
          .sort((a, b) => b.score - a.score)
          .slice(0, 10)
          .map(({ paper, score }) => paperSummary(
            paper,
            terms.length > 0 ? Math.min(0.99, score / (terms.length * 4 + 10)) : undefined,
          ));

        if (rankedPapers.length > 0 && (((row.papers as Record<string, unknown>[]) || []).length === 0)) {
          const existingPapers = (row.papers as Record<string, unknown>[]) || [];
          row.papers = mergePaperSummaries(existingPapers, rankedPapers);
          if (existingPapers.length === 0) {
            row.match_reason = "Matched from this researcher profile; publications shown are ranked against the query text.";
          }
        }
      }
    }

    if (mode === "keyword" && keywordBooleanQuery.hasBooleanSyntax) {
      for (const [researcherId, row] of merged.entries()) {
        if (!evaluateKeywordBooleanExpression(rowKeywordBooleanText(row), keywordBooleanQuery.tokens)) {
          merged.delete(researcherId);
        }
      }
    }

    const candidates = [...merged.values()].map(row => {
      const profileSimilarity = Number(row.profile_similarity ?? row.similarity ?? 0);
      const profileConcept = Number(row.profile_concept_score || 0);
      const profileAuthority = Number(row.profile_authority_score || 0);
      const exactProfileEvidence = Number(row.exact_profile_evidence_score || 0);
      const topicalRetrievalScore = Number(row.topical_retrieval_score || 0);
      const topicSimilarity = Number(row.topic_similarity || 0);
      const paperSimilarities = ((row.papers as Record<string, unknown>[]) || [])
        .map(paper => Number(paper.raw_similarity || 0))
        .filter(Boolean)
        .slice(0, 3);
      const bestPaperSimilarity = Math.max(Number(row.paper_similarity || 0), ...paperSimilarities, 0);
      const topPaperAverage = average(paperSimilarities);
      const paperEvidenceCount = ((row.papers as Record<string, unknown>[]) || [])
        .filter(paper => Number(paper.relevance_score || 0) >= 0.55)
        .length;
      const paperDepthScore = Math.max(
        Number(row.paper_depth_score || 0),
        Math.min(1, paperEvidenceCount / 4),
      );
      const methodDomainScore = methodDomainEvidenceScore(row, groups);
      const profileDrivenScore = (
        profileAuthority * 0.62
        + profileConcept * 0.24
        + profileSimilarity * 0.08
        + exactProfileEvidence * 0.06
      );
      const balancedEvidenceScore = (
        profileAuthority * 0.38
        + profileConcept * 0.2
        + profileSimilarity * 0.1
        + exactProfileEvidence * 0.08
        + bestPaperSimilarity * 0.14
        + topPaperAverage * 0.06
        + paperDepthScore * 0.04
      );
      const exactEvidenceRescueScore = exactProfileEvidence > 0
        ? exactProfileEvidence * 0.72 + profileAuthority * 0.16 + profileConcept * 0.12
        : 0;
      const topicalEvidenceScore = topicalRetrievalScore > 0
        ? topicalRetrievalScore * 0.48
          + bestPaperSimilarity * 0.2
          + topPaperAverage * 0.08
          + paperDepthScore * 0.1
          + topicSimilarity * 0.1
          + Math.max(profileAuthority, profileConcept) * 0.04
        : 0;
      const methodDomainCap = groups.hasMethodIntent && groups.domainTerms.length > 0
        ? methodDomainScore >= 1
          ? 1
          : methodDomainScore >= 0.58
            ? 0.56
            : 0.36
        : 1;
      const combinedSimilarity = Math.min(
        Math.max(profileDrivenScore, balancedEvidenceScore, exactEvidenceRescueScore, topicalEvidenceScore),
        methodDomainCap,
      );
      const profileEvidence = ((row.profile_evidence as string[]) || []).slice(0, 3);

      return {
        ...row,
        similarity: combinedSimilarity,
        combined_similarity: combinedSimilarity,
        profile_similarity: profileSimilarity,
        profile_concept_score: profileConcept,
        profile_authority_score: profileAuthority,
        exact_profile_evidence_score: exactProfileEvidence,
        profile_evidence: profileEvidence,
        paper_similarity: bestPaperSimilarity,
        paper_depth_score: paperDepthScore,
        topical_retrieval_score: topicalRetrievalScore,
        topic_similarity: topicSimilarity,
        method_domain_evidence_score: methodDomainScore,
        match_reason: buildMatchReason(row, profileEvidence),
      };
    });

    const combinedScores = candidates.map(row => Number(row.combined_similarity || 0));
    const minCombinedScore = combinedScores.length > 0 ? Math.min(...combinedScores) : 0;
    const maxCombinedScore = combinedScores.length > 0 ? Math.max(...combinedScores) : 1;

    const sortedCandidates = candidates
      .sort((a, b) => Number(b.combined_similarity || 0) - Number(a.combined_similarity || 0));

    const llmPoolSize = isTopicalSearch ? 75 : 50;
    const llmPool = sortedCandidates.slice(0, llmPoolSize);
    const llmPoolIds = llmPool
      .map(row => String(row.researcher_id || ""))
      .filter(Boolean);
    if (enableRerank) {
      const allPapersByResearcher = await fetchAllPapersForResearchers(supabase, llmPoolIds);
      for (const row of llmPool) {
        const allPapers = allPapersByResearcher.get(String(row.researcher_id || "")) || [];
        row.all_paper_records = allPapers;
        row.all_paper_evidence = paperEvidenceForRerank(searchQuery, terms, groups, allPapers);
        row.all_paper_total_count = allPapers.length;
        row.all_paper_titles = allPapers.map(paper => {
          const title = String(paper.title || "").replace(/\s+/g, " ").trim();
          return paper.publication_year ? `${title} (${paper.publication_year})` : title;
        });
      }
    }
    const externalEvidencePool = llmPool.slice(0, Math.min(10, llmPool.length));
    if (includeExternalEvidence) {
      await addExternalEvidenceToCandidates(openAiKey, rankingModel, externalEvidencePool, query, searchUsage);
    }
    const llmReranks = enableRerank
      ? await rerankCandidatesWithLlm(openAiKey, rankingModel, originalQuery || query, mission, llmPool, searchUsage)
      : new Map<string, RerankedCandidate>();
    const rerankedPool = enableRerank && llmReranks.size > 0
      ? llmPool
        .map((row, index) => {
          const returnedRerank = llmReranks.get(String(row.researcher_id || ""));
          const rerank = returnedRerank && !isBogusDuplicateSuppression(returnedRerank)
            ? returnedRerank
            : undefined;
          if (!rerank) {
            const isSuppressedDuplicate = returnedRerank ? isBogusDuplicateSuppression(returnedRerank) : false;
            const evidenceScore = normalise(
              Number(row.combined_similarity || 0),
              minCombinedScore,
              maxCombinedScore,
              isSuppressedDuplicate ? 0.45 : 0.38,
              isSuppressedDuplicate ? 0.88 : 0.56,
            );
            const rankPenalty = isSuppressedDuplicate ? 0 : Math.min(0.08, Math.log2(index + 1) * 0.012);
            const externalBoost = Math.min(0.025, (((row.external_evidence as ExternalEvidence[]) || []).length) * 0.005);
            const fallbackScore = Math.max(
              Math.round(Math.max(0.35, Math.min(isSuppressedDuplicate ? 0.88 : 0.52, evidenceScore - rankPenalty + externalBoost)) * 100),
              exactEvidenceRerankFloor(row),
            );
            const cappedFallbackScore = Math.min(fallbackScore, methodDomainRerankCap(row, groups));
            const selectedPapers = rerankedPaperSummaries(
              ((row.papers as Record<string, unknown>[]) || []),
              ((row.all_paper_records as Record<string, unknown>[]) || []),
              [],
              ((row.all_paper_evidence as Record<string, unknown>[]) || []).slice(0, 10).map(paper => String(paper.paper_id || "")),
            );
            return {
              ...row,
              papers: selectedPapers,
              llm_rerank_score: cappedFallbackScore,
              llm_match_type: retrievalMatchType(row, cappedFallbackScore, searchStrategy),
              llm_rank_index: index + 1000,
              match_reason: isSuppressedDuplicate
                ? buildMatchReason({ ...row, papers: selectedPapers }, ((row.profile_evidence as string[]) || []))
                : row.match_reason,
              similarity: cappedFallbackScore / 100,
            };
          }
          const exactFloor = exactEvidenceRerankFloor(row);
          const finalRerankScore = Math.min(
            Math.max(rerank.score, exactFloor),
            methodDomainRerankCap(row, groups),
          );
          return {
            ...row,
            papers: rerankedPaperSummaries(
              ((row.papers as Record<string, unknown>[]) || []),
              ((row.all_paper_records as Record<string, unknown>[]) || []),
              rerank.best_paper_titles || [],
              rerank.best_paper_ids || [],
            ),
            llm_rerank_score: finalRerankScore,
            llm_match_type: retrievalMatchType(row, finalRerankScore, searchStrategy),
            llm_rank_index: index,
            match_reason: hasDuplicateRerankLanguage(rerank.reason || "")
              ? buildMatchReason({
                ...row,
                papers: rerankedPaperSummaries(
                  ((row.papers as Record<string, unknown>[]) || []),
                  ((row.all_paper_records as Record<string, unknown>[]) || []),
                  rerank.best_paper_titles || [],
                  rerank.best_paper_ids || [],
                ),
              }, ((row.profile_evidence as string[]) || []))
              : naturaliseProfileAnswer(rerank.reason || String(row.match_reason || "")),
            similarity: finalRerankScore / 100,
          };
        })
        .sort((a, b) => {
          const scoreDiff = Number(b.llm_rerank_score || 0) - Number(a.llm_rerank_score || 0);
          if (scoreDiff !== 0) return scoreDiff;
          return Number(a.llm_rank_index || 0) - Number(b.llm_rank_index || 0);
        })
      : [];
    const llmPoolIdSet = new Set(llmPoolIds);
    const retrievalTail = enableRerank && llmReranks.size > 0
      ? sortedCandidates
        .filter(row => !llmPoolIdSet.has(String(row.researcher_id || "")))
        .map((row, index) => {
          const retrievalScore = retrievalCandidateScore(
            row,
            llmPoolSize + index,
            minCombinedScore,
            maxCombinedScore,
            groups,
            searchStrategy,
          );
          return {
            ...row,
            retrieval_rank_score: retrievalScore,
            llm_match_type: retrievalMatchType(row, retrievalScore, searchStrategy),
            llm_rank_index: llmPoolSize + index,
            similarity: retrievalScore / 100,
          };
        })
      : [];
    const rankedCandidates = enableRerank && llmReranks.size > 0
      ? [...rerankedPool, ...retrievalTail].sort((a, b) => {
        const scoreA = Number(a.llm_rerank_score ?? a.retrieval_rank_score ?? 0);
        const scoreB = Number(b.llm_rerank_score ?? b.retrieval_rank_score ?? 0);
        const scoreDiff = scoreB - scoreA;
        if (scoreDiff !== 0) return scoreDiff;
        return Number(a.llm_rank_index || 0) - Number(b.llm_rank_index || 0);
      })
      : sortedCandidates;

    const categorisedCandidates = isTopicalSearch
      ? rankedCandidates.map(row => {
        const finalScore = Number(row.llm_rerank_score ?? row.retrieval_rank_score ?? 0);
        return {
          ...row,
          llm_match_type: retrievalMatchType(row, finalScore, searchStrategy),
        };
      })
      : rankedCandidates;
    const resultCandidates = isTopicalSearch
      ? [...categorisedCandidates].sort((a, b) => {
        const aVisible = a.llm_match_type !== "weak" ? 1 : 0;
        const bVisible = b.llm_match_type !== "weak" ? 1 : 0;
        return bVisible - aVisible;
      })
      : categorisedCandidates;

    const results = resultCandidates
      .map((row, index) => {
        const publicRow: Record<string, unknown> = { ...row };
        delete publicRow.all_paper_records;
        delete publicRow.all_paper_evidence;
        delete publicRow.all_paper_titles;
        delete publicRow.all_paper_total_count;
        delete publicRow.document_text;
        delete publicRow.current_query;
        publicRow.match_reason = naturaliseProfileAnswer(String(publicRow.match_reason || ""));
        if (enableRerank && llmReranks.size > 0) {
          const finalScore = Number(row.llm_rerank_score ?? row.retrieval_rank_score ?? 0);
          return {
            ...publicRow,
            similarity: Math.max(0.01, Math.min(0.99, finalScore / 100)),
          };
        }
        const evidenceScore = normalise(Number(row.combined_similarity || 0), minCombinedScore, maxCombinedScore, 0.45, 0.98);
        const rankScore = Math.max(0.45, 0.98 - Math.log2(index + 1) * 0.08);
        return {
          ...publicRow,
          similarity: evidenceScore * 0.45 + rankScore * 0.55,
        };
      })
      .slice(0, limit);

    const usageJson = usageMetricsJson(searchUsage);
    await insertSearchAuditLog(supabase, {
      action: "search",
      status: "success",
      query: redactSensitiveSearchText(searchQuery),
      original_query: redactedOriginalQueryForAudit || redactSensitiveSearchText(searchQuery),
      expanded_query: originalQuery && originalQuery !== searchQuery ? redactSensitiveSearchText(searchQuery) : undefined,
      mode,
      enable_rerank: enableRerank,
      include_external_evidence: includeExternalEvidence,
      rewrite_used: Boolean(originalQuery && originalQuery !== searchQuery),
      duration_ms: Date.now() - requestStartedAt,
      result_count: results.length,
      candidate_count: candidates.length,
      llm_pool_size: enableRerank ? llmPool.length : 0,
      models: {
        ranking: rankingModel,
        embedding: "text-embedding-3-small",
        rerank_worker_count: RERANK_WORKER_COUNT,
      },
      usage: usageJson,
      estimated_cost_usd: Number(usageJson.estimated_cost_usd || 0),
      metadata: {
        rerank_returned: llmReranks.size,
        search_strategy: searchStrategy,
        topical_candidate_count: topicalMatches.length,
        openalex_topic_candidate_count: openAlexTopicMatches.length,
        retrieval_tail_count: retrievalTail.length,
        retrieval_warnings: retrievalWarnings,
        default_visible_result_count: results.filter(row => row.llm_match_type !== "weak").length,
      },
    });

    return Response.json({
      results,
      original_query: originalQuery || query,
      expanded_query: searchQuery,
      search_strategy: searchStrategy,
    }, { headers: corsHeaders });
  } catch (error) {
    const message = error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : JSON.stringify(error);
    const isSearchAction = !auditBody?.action || auditBody.action === "search";
    if (auditSupabase && auditBody && isSearchAction) {
      const auditQuery = (auditBody.query || "").trim();
      const auditOriginalQuery = (auditBody.original_query || auditQuery).trim();
      const usageJson = auditUsage ? usageMetricsJson(auditUsage) : {};
      await insertSearchAuditLog(auditSupabase, {
        action: "search",
        status: "error",
        query: redactSensitiveSearchText(auditQuery),
        original_query: redactSensitiveSearchText(auditOriginalQuery),
        expanded_query: auditOriginalQuery && auditOriginalQuery !== auditQuery ? redactSensitiveSearchText(auditQuery) : undefined,
        mode: auditBody.mode || "semantic",
        enable_rerank: auditBody.enable_rerank !== false,
        include_external_evidence: auditBody.include_external_evidence !== false,
        rewrite_used: Boolean(auditOriginalQuery && auditOriginalQuery !== auditQuery),
        duration_ms: Date.now() - requestStartedAt,
        result_count: 0,
        models: {},
        usage: usageJson,
        estimated_cost_usd: Number((usageJson as Record<string, unknown>).estimated_cost_usd || 0),
        error_message: message || "Search failed",
      });
    }
    return Response.json(
      { error: message || "Search failed" },
      { status: 500, headers: corsHeaders },
    );
  }
});
