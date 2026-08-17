#!/usr/bin/env node
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const outputPath = process.argv[2];
if (!outputPath) throw new Error("Usage: export_researcher_collaboration_metadata.mjs <output-json>");

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

const researchers = [];
let from = 0;
while (from < 20000) {
  const { data, error } = await supabase
    .from("researchers")
    .select("id,openalex_id,full_name,affiliation,faculty")
    .not("openalex_id", "is", null)
    .range(from, from + 999);
  if (error) throw error;
  researchers.push(...(data || []));
  if ((data || []).length < 1000) break;
  from += 1000;
}

fs.writeFileSync(outputPath, JSON.stringify(researchers));
console.log(JSON.stringify({ researchers: researchers.length, outputPath }));
