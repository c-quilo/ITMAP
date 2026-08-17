#!/usr/bin/env node
import { createClient } from "@supabase/supabase-js";

const [researcherId, ...inputOpenAlexIds] = process.argv.slice(2);
if (!researcherId || inputOpenAlexIds.length === 0) {
  throw new Error("Usage: sync_openalex_author_collaborations.mjs <researcher-uuid> <primary-openalex-id> [alias-openalex-id ...]");
}

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceRoleKey) throw new Error("Missing Supabase environment variables");

const normalizeOpenAlexId = value => String(value || "").trim().replace(/\/$/, "").split("/").pop().toUpperCase();
const openAlexIds = [...new Set(inputOpenAlexIds.map(normalizeOpenAlexId).filter(id => /^A\d+$/.test(id)))];
const focalIds = new Set(openAlexIds);

const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const retry = async (operation, label) => {
  let lastError;
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt < 5) {
        console.warn(`${label} failed; retry ${attempt}/5`);
        await sleep(attempt * 1500);
      }
    }
  }
  throw lastError;
};

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: {
    fetch: (input, init = {}) => fetch(input, {
      ...init,
      signal: AbortSignal.any([init.signal, AbortSignal.timeout(60_000)].filter(Boolean)),
    }),
  },
});

const checked = async (operation, label) => retry(async () => {
  const result = await operation();
  if (result.error) throw result.error;
  return result.data || [];
}, label);

const fetchOpenAlexWorks = async authorId => {
  const works = [];
  let cursor = "*";
  while (cursor) {
    const params = new URLSearchParams({
      filter: `authorships.author.id:${authorId}`,
      "per-page": "200",
      cursor,
    });
    if (process.env.OPENALEX_MAILTO) params.set("mailto", process.env.OPENALEX_MAILTO);
    const payload = await retry(async () => {
      const response = await fetch(`https://api.openalex.org/works?${params}`, {
        signal: AbortSignal.timeout(90_000),
      });
      if (!response.ok) throw new Error(`OpenAlex returned ${response.status}`);
      return response.json();
    }, `OpenAlex ${authorId}`);
    works.push(...(payload.results || []));
    cursor = payload.results?.length ? payload.meta?.next_cursor : null;
    if (cursor) await sleep(80);
  }
  console.log(`${authorId}: ${works.length} works`);
  return works;
};

const loadResearchers = async () => {
  const rows = [];
  for (let from = 0; from < 20000; from += 1000) {
    const page = await checked(
      () => supabase.from("researchers")
        .select("id,openalex_id,full_name,affiliation,faculty")
        .not("openalex_id", "is", null)
        .range(from, from + 999),
      `researchers ${from}`,
    );
    rows.push(...page);
    if (page.length < 1000) break;
  }
  return rows;
};

const loadPaperIds = async () => {
  const rows = [];
  for (let from = 0; from < 5000; from += 1000) {
    const page = await checked(
      () => supabase.from("researcher_papers")
        .select("id,openalex_work_id")
        .eq("researcher_id", researcherId)
        .range(from, from + 999),
      `papers ${from}`,
    );
    rows.push(...page);
    if (page.length < 1000) break;
  }
  return new Map(rows.map(row => [normalizeOpenAlexId(row.openalex_work_id), row.id]));
};

const groupKey = value => {
  const normalized = String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/gi, " ")
    .trim()
    .toLowerCase();
  return normalized === "institute for climate change"
    ? "grantham institute for climate change"
    : normalized;
};

const chunks = (items, size) => {
  const result = [];
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
  return result;
};

const uniqueInstitutionValues = (authorship, key) => [
  ...new Set((authorship.institutions || []).map(institution => String(institution?.[key] || "").trim()).filter(Boolean)),
];

const allWorks = new Map();
for (const openAlexId of openAlexIds) {
  for (const work of await fetchOpenAlexWorks(openAlexId)) {
    const workId = normalizeOpenAlexId(work.id);
    if (workId && !allWorks.has(workId)) allWorks.set(workId, work);
  }
}

const [researchers, paperIds] = await Promise.all([loadResearchers(), loadPaperIds()]);
const focalResearcher = researchers.find(row => row.id === researcherId);
if (!focalResearcher) throw new Error(`Researcher ${researcherId} was not found`);

const profilesByOpenAlexId = new Map();
for (const profile of researchers) {
  const key = normalizeOpenAlexId(profile.openalex_id);
  if (!key) continue;
  const current = profilesByOpenAlexId.get(key);
  if (!current || (!current.affiliation && profile.affiliation)) profilesByOpenAlexId.set(key, profile);
}

const coauthors = new Map();
const yearly = new Map();
const firstYearByCoauthor = new Map();
const detailedRows = [];

for (const [workId, work] of allWorks) {
  const year = Number(work.publication_year || 0);
  if (year < 1970 || year > 2100) continue;
  const title = String(work.display_name || work.title || "").trim();
  const citations = Number(work.cited_by_count || 0);
  const paperId = paperIds.get(workId);
  const yearBucket = yearly.get(year) || {
    active: new Set(),
    works: new Set(),
    otherInstitutions: new Set(),
    counts: new Map(),
    names: new Map(),
  };
  yearBucket.works.add(workId);
  yearly.set(year, yearBucket);
  const seenCoauthorsInWork = new Set();

  for (const authorship of work.authorships || []) {
    const coauthorId = normalizeOpenAlexId(authorship.author?.id);
    if (!coauthorId || focalIds.has(coauthorId) || seenCoauthorsInWork.has(coauthorId)) continue;
    seenCoauthorsInWork.add(coauthorId);
    const name = String(authorship.author?.display_name || "Unknown co-author").trim();
    const institutionIds = uniqueInstitutionValues(authorship, "id");
    const institutionNames = uniqueInstitutionValues(authorship, "display_name");

    yearBucket.active.add(coauthorId);
    yearBucket.counts.set(coauthorId, (yearBucket.counts.get(coauthorId) || 0) + 1);
    yearBucket.names.set(coauthorId, name);
    firstYearByCoauthor.set(coauthorId, Math.min(year, firstYearByCoauthor.get(coauthorId) || year));
    if (!profilesByOpenAlexId.has(coauthorId)
      && !institutionNames.some(institution => /imperial college/i.test(institution))) {
      yearBucket.otherInstitutions.add(coauthorId);
    }

    const aggregate = coauthors.get(coauthorId) || {
      openalex_id: coauthorId,
      name,
      workIds: new Set(),
      institutions: new Set(),
      latest_year: null,
      total_citations: 0,
      papers: [],
    };
    if (!aggregate.workIds.has(workId)) {
      aggregate.workIds.add(workId);
      aggregate.total_citations += citations;
      aggregate.papers.push({ title, year, citations, openalex_work_id: workId });
    }
    aggregate.latest_year = Math.max(Number(aggregate.latest_year || 0), year);
    institutionNames.forEach(institution => aggregate.institutions.add(institution));
    coauthors.set(coauthorId, aggregate);

    if (paperId) {
      detailedRows.push({
        paper_id: paperId,
        researcher_id: researcherId,
        openalex_work_id: workId,
        coauthor_openalex_id: coauthorId,
        coauthor_name: name,
        institution_ids: institutionIds.slice(0, 8),
        institution_names: institutionNames.slice(0, 8),
        publication_year: year,
        cited_by_count: citations,
        paper_title: title,
      });
    }
  }
}

const focalDepartment = groupKey(focalResearcher.affiliation);
const focalFaculty = groupKey(focalResearcher.faculty);
const totalCoauthors = coauthors.size;
const matchedImperialCoauthors = [...coauthors.keys()].filter(id => profilesByOpenAlexId.has(id)).length;
const collaborationYears = [...yearly.entries()].sort(([a], [b]) => a - b).map(([year, bucket]) => {
  const imperial = [...bucket.active].filter(id => profilesByOpenAlexId.has(id));
  const crossDepartment = imperial.filter(id => {
    const department = groupKey(profilesByOpenAlexId.get(id)?.affiliation);
    return focalDepartment && department && department !== focalDepartment;
  });
  const crossFaculty = imperial.filter(id => {
    const faculty = groupKey(profilesByOpenAlexId.get(id)?.faculty);
    return focalFaculty && faculty && faculty !== focalFaculty;
  });
  const topCrossDepartment = crossDepartment
    .sort((a, b) => (bucket.counts.get(b) || 0) - (bucket.counts.get(a) || 0))
    .slice(0, 6)
    .map(id => {
      const profile = profilesByOpenAlexId.get(id);
      return {
        researcher_id: profile?.id || null,
        openalex_id: id,
        name: profile?.full_name || bucket.names.get(id) || "Imperial researcher",
        department: profile?.affiliation || "",
        faculty: profile?.faculty || "",
        shared_papers: bucket.counts.get(id) || 0,
      };
    });
  return {
    researcher_id: researcherId,
    year,
    active_coauthors: bucket.active.size,
    new_coauthors: [...bucket.active].filter(id => firstYearByCoauthor.get(id) === year).length,
    imperial_coauthors: imperial.length,
    cross_department: crossDepartment.length,
    cross_faculty: crossFaculty.length,
    other_institutions: bucket.otherInstitutions.size,
    shared_papers: bucket.works.size,
    total_coauthors: totalCoauthors,
    matched_imperial_coauthors: matchedImperialCoauthors,
    top_cross_department: topCrossDepartment,
  };
});

const coauthorRows = [...coauthors.values()]
  .sort((a, b) => b.workIds.size - a.workIds.size || b.total_citations - a.total_citations)
  .slice(0, 100)
  .map(coauthor => ({
    researcher_id: researcherId,
    coauthor_openalex_id: coauthor.openalex_id,
    coauthor_name: coauthor.name,
    shared_papers: coauthor.workIds.size,
    institution_names: [...coauthor.institutions].slice(0, 8),
    latest_year: coauthor.latest_year,
    total_citations: coauthor.total_citations,
    paper_titles: coauthor.papers
      .sort((a, b) => b.citations - a.citations || b.year - a.year)
      .slice(0, 5),
  }));

console.log(JSON.stringify({
  combined_works: allWorks.size,
  paper_matches: paperIds.size,
  detailed_authorships: detailedRows.length,
  coauthors: totalCoauthors,
  collaboration_years: collaborationYears.length,
}));

for (const table of ["researcher_paper_authors", "researcher_coauthors", "researcher_collaboration_years"]) {
  await checked(() => supabase.from(table).delete().eq("researcher_id", researcherId), `clear ${table}`);
}

for (const batch of chunks(detailedRows, 500)) {
  await checked(
    () => supabase.from("researcher_paper_authors").upsert(batch, { onConflict: "paper_id,coauthor_openalex_id" }),
    "paper authors",
  );
}
for (const batch of chunks(coauthorRows, 500)) {
  await checked(
    () => supabase.from("researcher_coauthors").upsert(batch, { onConflict: "researcher_id,coauthor_openalex_id" }),
    "coauthors",
  );
}
for (const batch of chunks(collaborationYears, 500)) {
  await checked(
    () => supabase.from("researcher_collaboration_years").upsert(batch, { onConflict: "researcher_id,year" }),
    "collaboration years",
  );
}

console.log(JSON.stringify({
  uploaded_paper_authors: detailedRows.length,
  uploaded_top_coauthors: coauthorRows.length,
  uploaded_collaboration_years: collaborationYears.length,
}));
