#!/usr/bin/env node
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const inputPath = process.argv[2];
if (!inputPath) throw new Error("Usage: import_researcher_collaboration_years.mjs <input-ndjson>");

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

const rows = fs.readFileSync(inputPath, "utf8").split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
let uploaded = 0;
for (let offset = 0; offset < rows.length; offset += 500) {
  const batch = rows.slice(offset, offset + 500);
  let lastError = null;
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      const { error } = await supabase
        .from("researcher_collaboration_years")
        .upsert(batch, { onConflict: "researcher_id,year" });
      if (error) throw error;
      lastError = null;
      break;
    } catch (error) {
      lastError = error;
      if (attempt < 5) await new Promise(resolve => setTimeout(resolve, attempt * 1500));
    }
  }
  if (lastError) throw lastError;
  uploaded += batch.length;
  if (uploaded % 5000 === 0 || uploaded === rows.length) console.log(`Uploaded ${uploaded}/${rows.length}`);
}

console.log(JSON.stringify({ uploaded }));
