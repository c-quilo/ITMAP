// @vitest-environment node
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";
import * as policy from "../../supabase/functions/search-researchers/matchAssessment";

type Row = Record<string, unknown>;
const source = readFileSync(new URL("../../supabase/functions/search-researchers/index.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;

const profiles = [
  {
    researcher_id: "partial",
    full_name: "Partial match fixture",
    position_name: "Professor of artificial intelligence",
    bio_about: "Artificial intelligence. Artificial intelligence. Artificial intelligence. Ethics of biological manufacturing. AI ethics research.",
    fields_of_research: "Artificial intelligence; biological ethics",
    similarity: 0.99,
  },
  {
    researcher_id: "direct",
    full_name: "Direct match fixture",
    position_name: "Research Fellow",
    bio_about: "We apply machine learning to biological manufacturing and fermentation control.",
    similarity: 0.7,
  },
];
const papers = [{
  researcher_id: "partial",
  openalex_work_id: "irrelevant-paper",
  title: "Ethics of AI agents in healthcare",
  abstract: "Philosophical analysis of healthcare AI.",
  publication_year: 2026,
}, {
  researcher_id: "direct",
  openalex_work_id: "direct-paper",
  title: "Machine learning for biological manufacturing",
  abstract: "We optimise fermentation control using machine learning.",
  publication_year: 2026,
}];

function fakeDatabase(rows: Row[], publicationRows: Row[]) {
  return {
    rpc: vi.fn(async (name: string) => ({
      data: ["match_topic_researcher_profiles", "match_researcher_documents", "match_topic_profile_terms", "match_keyword_researchers"].includes(name)
        ? structuredClone(rows)
        : name === "match_topical_researchers"
          ? rows.map(row => ({ ...row, papers: publicationRows.filter(paper => paper.researcher_id === row.researcher_id) }))
          : [],
      error: null,
    })),
    from: vi.fn((table: string) => {
      let data = table === "researcher_papers" ? publicationRows : [];
      const builder = {
        select: () => builder,
        eq: () => builder,
        or: () => builder,
        in: (_column: string, ids: string[]) => {
          data = data.filter(row => ids.includes(String(row.researcher_id)));
          return builder;
        },
        order: () => builder,
        limit: () => builder,
        range: (start: number, end: number) => {
          data = data.slice(start, end + 1);
          return builder;
        },
        insert: () => Promise.resolve({ error: null }),
        then: (resolve: (value: { data: Row[]; error: null }) => unknown) => Promise.resolve(resolve({ data, error: null })),
      };
      return builder;
    }),
  };
}

async function search(options: { failReview?: boolean; omitPartial?: boolean; tailCount?: number; query?: string; mode?: string } = {}) {
  const additionalProfiles = Array.from({ length: options.tailCount || 0 }, (_, index) => ({
    ...profiles[0], researcher_id: `tail-${index}`, similarity: 0.8,
  }));
  const database = fakeDatabase([...profiles, ...additionalProfiles], papers);
  const outbound = vi.fn(async (url: string, init: RequestInit) => {
    if (url.endsWith("/embeddings")) return Response.json({ data: [{ embedding: [1, 0, 0] }] });
    if (url !== "https://api.openai.com/v1/chat/completions") throw new Error(`Unexpected outbound request: ${url}`);
    const body = JSON.parse(String(init.body));
    const payload = JSON.parse(body.messages[1].content);
    if (!payload.candidates) {
      return Response.json({ choices: [{ message: { content: JSON.stringify({ expanded_query: "artificial intelligence for biological manufacturing", search_strategy: "topic" }) } }] });
    }
    if (options.failReview) return new Response("Simulated model failure", { status: 503 });
    const ranked = (payload.candidates as Row[])
      .filter(candidate => !options.omitPartial || candidate.researcher_id !== "partial")
      .map(candidate => candidate.researcher_id === "direct" ? {
        researcher_id: candidate.researcher_id,
        score: 90,
        match_type: "strong",
        query_coverage: "direct",
        missing_requirements: [],
        direct_evidence: [{ source: "paper", paper_id: "direct-paper", quote: papers[1].title }],
        reason: "Their work applies machine learning to biological manufacturing and fermentation control.",
        best_paper_ids: ["direct-paper"],
      } : {
        researcher_id: candidate.researcher_id,
        score: 22,
        match_type: "weak",
        query_coverage: "partial",
        missing_requirements: ["AI methods for biological manufacturing"],
        direct_evidence: [],
        reason: "AI expertise is primarily in ethics; no evidence of AI methods for biological manufacturing.",
        best_paper_ids: [],
      });
    return Response.json({ choices: [{ message: { content: JSON.stringify({ ranked }) } }] });
  });
  let handler: (request: Request) => Promise<Response>;
  runInNewContext(compiled, {
    exports: {},
    require: (name: string) => {
      if (name === "./matchAssessment.ts") return policy;
      if (name === "https://esm.sh/@supabase/supabase-js@2") return { createClient: () => database };
      throw new Error(`Unexpected dependency: ${name}`);
    },
    Deno: {
      env: { get: (key: string) => ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "OPENAI_API_KEY"].includes(key) ? "local-test-value" : undefined },
      serve: (fn: typeof handler) => { handler = fn; },
    },
    fetch: outbound,
    Response,
    Request,
    console: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
    setTimeout,
    clearTimeout,
    AbortController,
  });
  const response = await handler!(new Request("http://itmap.test/search", {
    method: "POST",
    body: JSON.stringify({ query: options.query || "AI for biological manufacturing", mode: options.mode || "semantic", enable_rerank: true, include_external_evidence: false, limit: 150 }),
  }));
  const body = await response.json() as { results: Row[]; ranking_version?: string; search_strategy?: string };
  expect(response.status).toBe(200);
  return { ...body, outbound };
}

describe("complete semantic search response with local service fixtures", () => {
  it.each([
    "AI for biological manufacturing",
    "Find experts for a workshop on AI for biological manufacturing",
  ])("preserves the evidence judgement through the final response: %s", async query => {
    const data = await search({ query });
    expect(data.results[0].researcher_id).toBe("direct");
    expect(data.results[0].llm_match_type).toBe("strong");
    const partial = data.results.find(row => row.researcher_id === "partial")!;
    expect(partial.llm_match_type).toBe("weak");
    expect(partial.llm_rerank_score).toBe(22);
    expect(partial.match_reason).toContain("no evidence of AI methods");
    expect(partial.papers).toEqual([]);
    expect(data.ranking_version).toBe(policy.SEMANTIC_RANKING_VERSION);
    expect(data.results[0]).not.toHaveProperty("all_paper_records");
  });

  it("does not convert total review failure into strong matches", async () => {
    const data = await search({ failReview: true });
    expect(data.results.length).toBeGreaterThan(0);
    expect(data.results.every(row => row.llm_match_type !== "strong")).toBe(true);
    expect(data.results.every(row => row.review_status === "unreviewed")).toBe(true);
  });

  it("does not promote a candidate omitted by one review worker", async () => {
    const data = await search({ omitPartial: true });
    const partial = data.results.find(row => row.researcher_id === "partial")!;
    expect(partial.llm_match_type).not.toBe("strong");
    expect(partial.review_status).toBe("unreviewed");
  });

  it("retains the wide candidate pool without calling unreviewed results strong", async () => {
    const data = await search({ tailCount: 80 });
    expect(data.results).toHaveLength(82);
    const tail = data.results.filter(row => row.review_status === "unreviewed");
    expect(tail).toHaveLength(7);
    expect(tail.every(row => row.llm_match_type !== "strong")).toBe(true);
  });

  it("leaves the keyword search path independent of semantic review", async () => {
    const data = await search({ mode: "keyword" });
    expect(data.results).toHaveLength(2);
    expect(data.outbound).not.toHaveBeenCalled();
    expect(data.ranking_version).toBeUndefined();
  });
});
