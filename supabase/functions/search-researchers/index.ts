import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type SearchRequest = {
  action?: "search" | "rewrite_mission" | "suggest_researchers" | "researcher_profile" | "researcher_profile_question" | "quick_search" | "keyword_suggestions" | "match_school_missions" | "summarize_pool" | "admin_search_logs";
  query?: string;
  original_query?: string;
  researcher_id?: string;
  mode?: "semantic" | "keyword";
  filters?: string[];
  limit?: number;
  offset?: number;
  enable_rerank?: boolean;
  include_external_evidence?: boolean;
  admin_password?: string;
  researchers?: SchoolMissionResearcher[];
};

type MissionExpansion = {
  expanded_query: string;
  must_have?: string[];
  nice_to_have?: string[];
  method_terms?: string[];
  domain_terms?: string[];
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
  return value
    .replace(/\bbased on (?:the )?(?:provided|supplied) (?:co-?author )?(?:summary|data|metadata|information|evidence|database)\s*,?\s*/gi, "")
    .replace(/\bthe (?:provided|supplied) (?:co-?author )?(?:summary|data|metadata|information|evidence|database)\b/gi, "the profile evidence")
    .replace(/\bthis (?:provided|supplied) (?:co-?author )?(?:summary|data|metadata|information|evidence|database)\b/gi, "this profile evidence")
    .replace(/\bprovided explicitly\b/gi, "available here")
    .replace(/\bsupplied explicitly\b/gi, "available here")
    .replace(/\s+/g, " ")
    .trim();
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
    for (const term of terms) {
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
  const papers = ((row.papers as Record<string, unknown>[]) || [])
    .slice(0, 2)
    .map(describePaper)
    .filter(Boolean);

  const profileSentence = profileEvidence.length > 0
    ? `${name} matches through their profile evidence: ${profileEvidence.join("; ")}.`
    : `${name} matches through their ${title.toLowerCase()} profile and research description.`;

  if (papers.length > 0) {
    return `${profileSentence} Relevant publication evidence includes ${papers.join("; ")}, which supports the query topic.`;
  }

  return `${profileSentence} No highly ranked paper evidence was needed for this match, so the score is driven mainly by profile, title, and field alignment.`;
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

async function expandMission(openAiKey: string, model: string, query: string, metrics?: UsageMetrics): Promise<MissionExpansion> {
  const fallback = { expanded_query: query };
  try {
    const result = await openAiJson(
      openAiKey,
      model,
      [
        {
          role: "system",
          content: [
            "You rewrite search queries for an expert-finding system.",
            "Expand the user's query into a concise, evidence-oriented search query.",
            "Preserve the user's intent. Do not add unrelated topics. Do not name researchers.",
            "Return JSON only with keys: expanded_query, must_have, nice_to_have, method_terms, domain_terms.",
          ].join(" "),
        },
        {
          role: "user",
          content: `Query:\n${query}`,
        },
      ],
      900,
      metrics,
    ) as MissionExpansion;

    const expanded = truncateText(result.expanded_query || query, 900);
    return {
      expanded_query: expanded || query,
      must_have: Array.isArray(result.must_have) ? result.must_have.slice(0, 8).map(String) : [],
      nice_to_have: Array.isArray(result.nice_to_have) ? result.nice_to_have.slice(0, 8).map(String) : [],
      method_terms: Array.isArray(result.method_terms) ? result.method_terms.slice(0, 8).map(String) : [],
      domain_terms: Array.isArray(result.domain_terms) ? result.domain_terms.slice(0, 10).map(String) : [],
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
      reason: truncateText(item.reason, 500),
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
          "Explain the main expertise patterns in the pool, why the group is relevant to the user's query, and any obvious gaps or caveats.",
          "Write the summary field as about 300 words, useful for a user deciding who to contact.",
          "Return JSON only: {\"headline\":\"...\",\"summary\":\"...\",\"themes\":[\"...\"],\"notable_researchers\":[{\"name\":\"...\",\"reason\":\"...\"}],\"gaps\":[\"...\"]}",
        ].join(" "),
      },
      {
        role: "user",
        content: JSON.stringify({
          user_search: query,
          researchers: researchers.slice(0, 20).map(schoolMissionEvidence),
        }),
      },
    ],
    6500,
  ) as ResearchPoolSummary;

  return {
    headline: truncateText(result.headline || "What ITMAP found", 140),
    summary: truncateText(result.summary || "", 2600),
    themes: Array.isArray(result.themes) ? result.themes.map(item => truncateText(item, 120)).filter(Boolean).slice(0, 6) : [],
    notable_researchers: Array.isArray(result.notable_researchers)
      ? result.notable_researchers
        .map(item => ({
          name: truncateText(item.name, 120),
          reason: truncateText(item.reason, 240),
        }))
        .filter(item => item.name && item.reason)
        .slice(0, 6)
      : [],
    gaps: Array.isArray(result.gaps) ? result.gaps.map(item => truncateText(item, 160)).filter(Boolean).slice(0, 4) : [],
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
            "When selecting best papers, prefer items from all_paper_evidence and return their paper_id values in best_paper_ids. The best papers should be specifically relevant to the query, not merely famous or highly cited.",
            "External evidence may include media appearances, startup/spinout signals, company activity, and UKRI grant/project records. Treat it as a small supporting signal only.",
            "Only give a small boost for external evidence when it is clearly relevant to the query or shows translational impact. Do not let generic publicity override weak research/profile evidence.",
            "UKRI grants and query-relevant startups/spinouts are stronger external signals than generic media mentions.",
            "Reward candidates who satisfy all central query requirements, especially method+domain combinations such as AI applied to weather.",
            "Demote adjacent candidates who match only the domain or only the method.",
            "Score each candidate absolutely against the query, not relative to only the candidates in this request chunk.",
            "Do not penalize candidates because stronger candidates may exist outside this chunk.",
            "You must return one ranked item for every supplied candidate in this chunk. If evidence is weak, give a low score and match_type weak.",
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
      byId.set(researcherId, {
        researcher_id: researcherId,
        score: Math.max(0, Math.min(100, score)),
        reason: truncateText(item.reason, 650),
        match_type: item.match_type,
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
    .replace(/[?!.,;:]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const promptRemoved = cleaned
    .replace(/^(?:please\s+)?(?:tell me about|what can you tell me about|who is|who's|profile of|summari[sz]e|describe|explain)\s+/i, "")
    .trim();
  const beforeQualifier = promptRemoved
    .split(/\b(?:and|with|relationship|connection|role|links?|papers?|publications?|profile|research|at|in)\b/i)[0]
    .trim();

  for (const value of [beforeQualifier, promptRemoved, cleaned, query]) {
    const normalized = value.replace(/\s+/g, " ").trim();
    if (normalized.length >= 3) variants.add(normalized);
  }

  const capitalizedNames = cleaned.match(/\b[A-Z][A-Za-zÀ-ÿ'’-]+(?:\s+[A-Z][A-Za-zÀ-ÿ'’-]+){1,3}\b/g) || [];
  for (const name of capitalizedNames) {
    if (!/Imperial College|Quick Search|Researcher Profile/i.test(name)) {
      variants.add(name.trim());
    }
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
    .replace(/\b(?:people|person|researchers?|experts?)\b/gi, " ")
    .replace(/\b(?:connected|connection|connections|linked|links?|affiliated|affiliation)\b/gi, " ")
    .replace(/\b(?:to|with|at|in|from|who|work|works|working|on)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
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

  if (!wantsCoDirectors) {
    answer += " In ITMAP, questions about the School can be connected back to researchers, themes and missions, but deeper expert ranking should still use the full Search workflow.";
  }

  return {
    kind: "topic",
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

async function quickTopicSuggestions(
  supabase: ReturnType<typeof createClient>,
  query: string,
  limit = 8,
) {
  const searchQuery = quickTopicSearchQuery(query) || query;
  const terms = queryTerms(searchQuery);
  if (terms.length === 0) return [];

  const directMatches = await quickAffiliationSuggestions(supabase, query, limit);

  const { data, error } = await supabase.rpc("match_keyword_researchers", {
    search_query: searchQuery,
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
  const terms = queryTerms(query);
  if (terms.length <= 2 || researcherNameScore(query, name) >= 0.9) {
    return `Tell me about ${name}'s research profile, Imperial role, and relationship to Imperial College London.`;
  }
  return query;
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

  if (isOffTopicProfileQuestion(trimmedQuery)) {
    return {
      kind: "redirect",
      answer: "Ask ITMAP is for serious questions about Imperial researchers, expertise, publications, co-authors, departments, and research topics. Try a researcher name or a short topic such as \"Benjamin Barratt\" or \"experts on photonics\".",
      suggestions: [],
      evidence_titles: [],
      caveat: "",
    };
  }

  const isSchoolQuery = isSchoolOfConvergenceScienceQuery(trimmedQuery);
  const nameSuggestions = await quickNameSuggestions(supabase, trimmedQuery);
  const bestPerson = nameSuggestions[0];
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

  const topicSuggestions = await quickTopicSuggestions(supabase, trimmedQuery, 8);
  if (topicSuggestions.length > 0) {
    return {
      kind: "topic",
      answer: `Here are quick, non-reranked matches for "${trimmedQuery}". This is useful for a first pointer; use the full Search tab when you need ranked results with paper evidence and deeper comparison.`,
      suggestions: topicSuggestions,
      evidence_titles: [],
      caveat: "Ask ITMAP does not run ITMAP reranking, query rewriting, media/grant checks, or the graph workflow.",
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
      .select("openalex_work_id,title,abstract,publication_year,cited_by_count,source_display_name,doi")
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

  return allPapers;
}

async function fetchTopCoauthorsForResearcher(
  supabase: ReturnType<typeof createClient>,
  researcherId: string,
  limit = 20,
) {
  const { data, error } = await supabase
    .from("researcher_coauthors")
    .select("coauthor_openalex_id,coauthor_name,shared_papers,institution_names,latest_year,total_citations,paper_titles")
    .eq("researcher_id", researcherId)
    .order("shared_papers", { ascending: false })
    .order("total_citations", { ascending: false })
    .limit(limit);

  if (error) {
    console.warn("Could not load researcher co-authors", error);
    return [];
  }

  const ranked = (data || [])
    .map(row => ({
      openalex_id: String(row.coauthor_openalex_id || "").trim(),
      name: String(row.coauthor_name || "").trim(),
      shared_papers: Number(row.shared_papers || 0),
      institutions: Array.isArray(row.institution_names) ? row.institution_names.map(String).filter(Boolean) : [],
      latest_year: Number(row.latest_year || 0) || null,
      paper_titles: Array.isArray(row.paper_titles) ? row.paper_titles : [],
    }))
    .filter(coauthor => coauthor.openalex_id && coauthor.name);

  const imperialIds = ranked.map(coauthor => coauthor.openalex_id);
  const imperialMatches = new Map<string, Record<string, unknown>>();
  if (imperialIds.length > 0) {
    const { data: imperialRows, error: imperialError } = await supabase
      .from("researchers")
      .select("id,openalex_id,full_name,position_name,position,affiliation,faculty")
      .in("openalex_id", imperialIds);
    if (!imperialError) {
      for (const row of imperialRows || []) {
        if (row.openalex_id && !imperialMatches.has(String(row.openalex_id))) {
          imperialMatches.set(String(row.openalex_id), row);
        }
      }
    }
  }

  return ranked.map(coauthor => {
    const imperialProfile = imperialMatches.get(coauthor.openalex_id);
    return {
      openalex_id: coauthor.openalex_id,
      name: coauthor.name,
      shared_papers: coauthor.shared_papers,
      institutions: coauthor.institutions.slice(0, 4),
      latest_year: coauthor.latest_year,
      is_imperial_profile: Boolean(imperialProfile),
      imperial_researcher_id: imperialProfile?.id || null,
      imperial_title: imperialProfile ? (imperialProfile.position_name || imperialProfile.position || "") : "",
      imperial_department: imperialProfile ? (imperialProfile.affiliation || "") : "",
      imperial_faculty: imperialProfile ? (imperialProfile.faculty || "") : "",
      paper_titles: coauthor.paper_titles.slice(0, 5),
    };
  });
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

    return truncateText(result.summary || fallback, 1400);
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
  const coauthors = await fetchTopCoauthorsForResearcher(supabase, researcherId, 12);
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
    })),
    coauthors,
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
    const limit = Math.max(1, Math.min(body.limit || 30, 50));

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
      }, { headers: corsHeaders });
    }

    if (body.action === "suggest_researchers") {
      const suggestions = query
        ? await suggestResearchersByName(supabase, query)
        : [];
      return Response.json({ suggestions }, { headers: corsHeaders });
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

    if (!query) {
      return Response.json({ results: [] }, { headers: corsHeaders });
    }

    const mode = body.mode || "semantic";
    const enableRerank = body.enable_rerank !== false;
    const includeExternalEvidence = body.include_external_evidence !== false;
    const searchUsage = createUsageMetrics();
    auditUsage = searchUsage;

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
      return Response.json({ results: [] }, { headers: corsHeaders });
    }

    const rawKeywordTerms = queryTerms(query);
    const mission = {
      expanded_query: query,
      must_have: rawKeywordTerms.slice(0, 10),
      nice_to_have: [],
      method_terms: rawKeywordTerms.filter(term => METHOD_TERMS.has(singularise(term))).slice(0, 8),
      domain_terms: rawKeywordTerms.filter(term => !METHOD_TERMS.has(singularise(term))).slice(0, 10),
    };
    const searchQuery = query;

    const filters = body.filters || [];
    const terms = queryTerms(searchQuery);
    const groups = conceptGroups(searchQuery, terms);
    const keywordBooleanQuery = parseKeywordBooleanQuery(searchQuery);
    const isLongMission = terms.length > 10;
    const facultyFilters = filters
      .filter(filter => filter.startsWith("Faculty of") || filter === "Imperial College Business School")
      .map(normaliseFaculty);
    const roleFilters = filters.filter(filter => GRADE_FILTERS.has(filter));

    if (mode === "keyword") {
      const keywordMatchCount = Math.min(150, Math.max(60, limit * 4));
      const { data: keywordMatches, error: keywordError } = await supabase.rpc("match_keyword_researchers", {
        search_query: searchQuery,
        match_count: keywordMatchCount,
        faculty_filters: facultyFilters,
        role_filters: roleFilters,
      });

      if (keywordError) {
        throw keywordError;
      }

      const filteredKeywordMatches = (keywordMatches || [])
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
        .map((row: Record<string, unknown>, index: number) => ({
          ...row,
          profile_similarity: Number(row.keyword_profile_rank || 0),
          paper_similarity: Number(row.keyword_paper_rank || 0),
          profile_concept_score: profileConceptScore(searchQuery, terms, row),
          profile_authority_score: profileAuthorityScore(searchQuery, terms, row),
          exact_profile_evidence_score: exactProfileEvidenceScore(searchQuery, terms, row),
          profile_evidence: matchedProfileEvidence(searchQuery, terms, row),
          similarity: normalise(Number(row.similarity || 0), minKeywordScore, maxKeywordScore, 0.48, 0.98)
            - Math.min(0.05, Math.log2(index + 1) * 0.006),
          match_reason: "",
        }))
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

      return Response.json({ results }, { headers: corsHeaders });
    }

    const embeddingResponse = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openAiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "text-embedding-3-small",
        input: searchQuery,
      }),
    });

    if (!embeddingResponse.ok) {
      const detail = await embeddingResponse.text();
      throw new Error(`Embedding request failed: ${detail}`);
    }

    const embeddingJson = await embeddingResponse.json();
    recordOpenAiUsage(searchUsage, "embedding", "text-embedding-3-small", embeddingJson.usage);
    const embedding = embeddingJson.data?.[0]?.embedding;
    if (!Array.isArray(embedding)) {
      throw new Error("Embedding response did not include a vector");
    }

    const candidateCount = Math.min(220, Math.max(90, limit * 5));
    const { data: researcherMatches, error: researcherError } = await supabase.rpc("match_researcher_documents", {
      query_embedding: embedding,
      match_count: candidateCount,
      faculty_filters: facultyFilters,
      role_filters: roleFilters,
    });

    if (researcherError) {
      throw researcherError;
    }

    const profileKeywordMatches = (mode !== "keyword" && isLongMission)
      ? []
      : await fetchProfileKeywordCandidates(
        supabase,
        searchQuery,
        terms,
        facultyFilters,
        roleFilters,
      );

    const paperMatchCount = isLongMission
      ? Math.min(120, Math.max(60, limit * 8))
      : Math.min(500, Math.max(150, limit * 25));
    const { data: paperMatches, error: paperError } = await supabase.rpc("match_researcher_paper_documents", {
      query_embedding: embedding,
      match_count: paperMatchCount,
      faculty_filters: facultyFilters,
      role_filters: roleFilters,
    });

    if (paperError) {
      throw paperError;
    }

    const allPaperSimilarities = (paperMatches || [])
      .map((paper: Record<string, unknown>) => Number(paper.similarity || 0))
      .filter(Boolean);
    const minPaperSimilarity = allPaperSimilarities.length > 0 ? Math.min(...allPaperSimilarities) : 0;
    const maxPaperSimilarity = allPaperSimilarities.length > 0 ? Math.max(...allPaperSimilarities) : 1;

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
          papers: [],
          match_reason: "Matched from this researcher's profile and domain-specific query terms.",
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

    const researcherIds = [...merged.keys()];
    if (researcherIds.length > 0) {
      const paperRows = await fetchPapersForResearchers(supabase, researcherIds);
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
      const profileSimilarity = Number(row.profile_similarity || row.similarity || 0);
      const profileConcept = Number(row.profile_concept_score || 0);
      const profileAuthority = Number(row.profile_authority_score || 0);
      const exactProfileEvidence = Number(row.exact_profile_evidence_score || 0);
      const paperSimilarities = ((row.papers as Record<string, unknown>[]) || [])
        .map(paper => Number(paper.raw_similarity || 0))
        .filter(Boolean)
        .slice(0, 3);
      const bestPaperSimilarity = Math.max(Number(row.paper_similarity || 0), ...paperSimilarities, 0);
      const topPaperAverage = average(paperSimilarities);
      const paperEvidenceCount = ((row.papers as Record<string, unknown>[]) || [])
        .filter(paper => Number(paper.relevance_score || 0) >= 0.55)
        .length;
      const paperDepthScore = Math.min(1, paperEvidenceCount / 4);
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
      const methodDomainCap = groups.hasMethodIntent && groups.domainTerms.length > 0
        ? methodDomainScore >= 1
          ? 1
          : methodDomainScore >= 0.58
            ? 0.56
            : 0.36
        : 1;
      const combinedSimilarity = Math.min(
        Math.max(profileDrivenScore, balancedEvidenceScore, exactEvidenceRescueScore),
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
        method_domain_evidence_score: methodDomainScore,
        match_reason: buildMatchReason(row, profileEvidence),
      };
    });

    const combinedScores = candidates.map(row => Number(row.combined_similarity || 0));
    const minCombinedScore = combinedScores.length > 0 ? Math.min(...combinedScores) : 0;
    const maxCombinedScore = combinedScores.length > 0 ? Math.max(...combinedScores) : 1;

    const sortedCandidates = candidates
      .sort((a, b) => Number(b.combined_similarity || 0) - Number(a.combined_similarity || 0));

    const llmPoolSize = 50;
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
      ? await rerankCandidatesWithLlm(openAiKey, rankingModel, query, mission, llmPool, searchUsage)
      : new Map<string, RerankedCandidate>();
    const rankedCandidates = enableRerank && llmReranks.size > 0
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
              llm_match_type: matchTypeForScore(cappedFallbackScore),
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
            llm_match_type: matchTypeForScore(finalRerankScore),
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
              : rerank.reason || row.match_reason,
            similarity: finalRerankScore / 100,
          };
        })
        .sort((a, b) => {
          const scoreDiff = Number(b.llm_rerank_score || 0) - Number(a.llm_rerank_score || 0);
          if (scoreDiff !== 0) return scoreDiff;
          return Number(a.llm_rank_index || 0) - Number(b.llm_rank_index || 0);
        })
      : sortedCandidates;

    const results = rankedCandidates
      .map((row, index) => {
        if (enableRerank && llmReranks.size > 0) {
          return {
            ...row,
            similarity: Math.max(0.01, Math.min(0.99, Number(row.llm_rerank_score || 0) / 100)),
          };
        }
        const evidenceScore = normalise(Number(row.combined_similarity || 0), minCombinedScore, maxCombinedScore, 0.45, 0.98);
        const rankScore = Math.max(0.45, 0.98 - Math.log2(index + 1) * 0.08);
        return {
        ...row,
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
      },
    });

    return Response.json({ results }, { headers: corsHeaders });
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
