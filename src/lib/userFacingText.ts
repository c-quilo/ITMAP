const INTERNAL_LANGUAGE_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\bprovided paper evidence in the prompt\b/gi, "relevant publication evidence"],
  [/\b(?:the )?(?:provided|supplied) evidence set\b/gi, "the available research evidence"],
  [/\b(?:the )?(?:provided|supplied) (?:candidate |researcher )?(?:set|list|pool|payload)\b/gi, "the researchers reviewed"],
  [/\b(?:the )?(?:provided|supplied) (?:data|metadata|information|evidence|context)\b/gi, "the available evidence"],
  [/\bprofile evidence:\s*profile:\s*/gi, "the Imperial profile mentions "],
  [/\bmatches through their imperial college\b/gi, "matches because their Imperial College"],
  [/\bpaper records\b/gi, "publications"],
  [/\bpaper record\b/gi, "publication"],
  [/\bpaper themes\b/gi, "publication themes"],
  [/\bpaper theme\b/gi, "publication theme"],
  [/\b(?:this|the) (?:database|dataset|stored record)\b/gi, "ITMAP's current evidence"],
  [/\bOpenAlex (?:author )?(?:entry|record|profile)\b/gi, "publication record"],
  [/\bOpenAlex metadata\b/gi, "publication evidence"],
  [/\bOpenAlex paper topics\b/gi, "publication topics"],
  [/\bOpenAlex topics\b/gi, "publication topics"],
  [/\bOpenAlex topic\b/gi, "publication topic"],
  [/\bthe prompt\b/gi, "the query"],
  [/\bthis prompt\b/gi, "this query"],
  [/\bLLM(?:-based)?\b/gi, "ITMAP"],
  [/\brerank(?:ed|ing)?\b/gi, "review"],
  [/\bembedding(?:s)?\b/gi, "meaning-based comparison"],
  [/\bvector(?:s)?\b/gi, "meaning-based evidence"],
];

/**
 * Keeps generated explanations focused on the research evidence rather than
 * exposing implementation language to people using ITMAP.
 */
export function naturaliseUserFacingText(value: unknown) {
  let text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text) return "";

  for (const [pattern, replacement] of INTERNAL_LANGUAGE_REPLACEMENTS) {
    text = text.replace(pattern, replacement);
  }

  text = text
    .replace(/\bBased on (?:the )?(?:available evidence|researchers reviewed),?\s*/i, "")
    .replace(/\bAccording to ITMAP's current evidence,?\s*/i, "")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/([.!?]){2,}/g, "$1")
    .replace(/\bthe the\b/gi, "the")
    .replace(/\s{2,}/g, " ")
    .trim();

  return text ? `${text.charAt(0).toUpperCase()}${text.slice(1)}` : "";
}

export function friendlyUserFacingError(error: unknown, fallback: string) {
  const raw = error instanceof Error ? error.message : String(error || "");
  if (!raw) return fallback;

  if (/edge function|non-2xx|failed to fetch|network|database|supabase|jwt|unauthori[sz]ed|timeout|timed out|service role|api key/i.test(raw)) {
    return `${fallback.replace(/[.!?]+$/, "")}. Please try again.`;
  }

  return naturaliseUserFacingText(raw) || fallback;
}
