#!/usr/bin/env node
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const csvPath = process.argv[2];
if (!csvPath) throw new Error("Usage: import_target_researcher_paper_authors.mjs <csv-path>");

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceRoleKey) throw new Error("Missing Supabase environment variables");

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: {
    fetch: (input, init = {}) => fetch(input, {
      ...init,
      signal: AbortSignal.any([init.signal, AbortSignal.timeout(30_000)].filter(Boolean)),
    }),
  },
});

function parseCsvLine(line) {
  const fields = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      fields.push(field);
      field = "";
    } else {
      field += character;
    }
  }
  fields.push(field);
  return fields;
}

function chunks(items, size) {
  const output = [];
  for (let index = 0; index < items.length; index += size) output.push(items.slice(index, index + size));
  return output;
}

const lines = fs.readFileSync(csvPath, "utf8").split(/\r?\n/).filter(Boolean);
const headers = parseCsvLine(lines.shift());
const records = lines.map(line => {
  const values = parseCsvLine(line);
  return Object.fromEntries(headers.map((header, index) => [header, values[index] || ""]));
});
const openAlexIds = [...new Set(records.map(row => row.researcher_openalex_id).filter(Boolean))];

const { data: researchers, error: researcherError } = await supabase
  .from("researchers")
  .select("id,openalex_id")
  .in("openalex_id", openAlexIds);
if (researcherError) throw researcherError;

const researcherIdsByOpenAlex = new Map();
for (const researcher of researchers || []) {
  const ids = researcherIdsByOpenAlex.get(researcher.openalex_id) || [];
  ids.push(researcher.id);
  researcherIdsByOpenAlex.set(researcher.openalex_id, ids);
}

const paperIdByResearcherAndWork = new Map();
for (const researcher of researchers || []) {
  let from = 0;
  while (from < 20000) {
    const { data, error } = await supabase
      .from("researcher_papers")
      .select("id,researcher_id,openalex_work_id")
      .eq("researcher_id", researcher.id)
      .range(from, from + 999);
    if (error) throw error;
    for (const paper of data || []) {
      paperIdByResearcherAndWork.set(`${paper.researcher_id}:${paper.openalex_work_id}`, paper.id);
    }
    if ((data || []).length < 1000) break;
    from += 1000;
  }
}

const preparedByKey = new Map();
for (const row of records) {
  for (const researcherId of researcherIdsByOpenAlex.get(row.researcher_openalex_id) || []) {
    const paperId = paperIdByResearcherAndWork.get(`${researcherId}:${row.openalex_work_id}`);
    if (!paperId || !row.coauthor_openalex_id || !row.coauthor_name) continue;
    const key = `${paperId}:${row.coauthor_openalex_id}`;
    preparedByKey.set(key, {
      paper_id: paperId,
      researcher_id: researcherId,
      openalex_work_id: row.openalex_work_id,
      coauthor_openalex_id: row.coauthor_openalex_id,
      coauthor_name: row.coauthor_name,
      institution_ids: JSON.parse(row.institution_ids_json || "[]"),
      institution_names: JSON.parse(row.institution_names_json || "[]"),
      publication_year: /^\d+$/.test(row.publication_year) ? Number(row.publication_year) : null,
      cited_by_count: /^\d+$/.test(row.cited_by_count) ? Number(row.cited_by_count) : null,
      paper_title: row.title || null,
    });
  }
}

const prepared = [...preparedByKey.values()];
let uploaded = 0;
for (const batch of chunks(prepared, 150)) {
  let lastError = null;
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      const { error } = await supabase
        .from("researcher_paper_authors")
        .upsert(batch, { onConflict: "paper_id,coauthor_openalex_id" });
      if (error) throw error;
      lastError = null;
      break;
    } catch (error) {
      lastError = error;
      if (attempt === 5) break;
      await new Promise(resolve => setTimeout(resolve, attempt * 1500));
    }
  }
  if (lastError) throw lastError;
  uploaded += batch.length;
  console.log(`Uploaded ${uploaded}/${prepared.length}`);
}

console.log(JSON.stringify({ inputRows: records.length, matchedResearchers: researchers?.length || 0, prepared: prepared.length, uploaded }));
