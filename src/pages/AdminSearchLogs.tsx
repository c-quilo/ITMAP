import { useEffect, useMemo, useState } from "react";
import { Activity, AlertCircle, Download, KeyRound, Loader2, RefreshCw, Search } from "lucide-react";
import { getSearchAuditLogs, type SearchAuditLog } from "@/lib/researcherSearch";
import scsSwoosh from "@/assets/scs-swoosh.png";

const ADMIN_PASSWORD_STORAGE_KEY = "itmap.adminSearchLogsPassword.v1";
const PAGE_SIZE = 50;

function formatDate(value: string) {
  if (!value) return "";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatDuration(ms: number) {
  if (!ms) return "-";
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

function formatCost(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "Not priced";
  if (value === 0) return "$0.000000";
  return `$${value.toFixed(6)}`;
}

function usageNumber(log: SearchAuditLog, key: string) {
  const value = Number(log.usage?.[key] || 0);
  return Number.isFinite(value) ? value : 0;
}

function missingPricingModels(log: SearchAuditLog) {
  return Array.isArray(log.usage?.missing_pricing_models)
    ? log.usage.missing_pricing_models.map(String).filter(Boolean)
    : [];
}

function formatLogCost(log: SearchAuditLog) {
  const base = formatCost(log.estimatedCostUsd);
  return missingPricingModels(log).length > 0 ? `${base} partial` : base;
}

function csvCell(value: unknown) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return `"${text.replace(/"/g, '""')}"`;
}

function exportLogsCsv(logs: SearchAuditLog[]) {
  const headers = [
    "created_at",
    "status",
    "mode",
    "original_query",
    "query_used",
    "expanded_query",
    "duration_ms",
    "result_count",
    "candidate_count",
    "llm_pool_size",
    "input_tokens",
    "output_tokens",
    "embedding_tokens",
    "total_tokens",
    "estimated_cost_usd",
    "missing_pricing_models",
    "models",
    "error_message",
  ];
  const rows = logs.map(log => [
    log.createdAt,
    log.status,
    log.mode,
    log.originalQuery,
    log.query,
    log.expandedQuery,
    log.durationMs,
    log.resultCount,
    log.candidateCount,
    log.llmPoolSize,
    usageNumber(log, "input_tokens"),
    usageNumber(log, "output_tokens"),
    usageNumber(log, "embedding_tokens"),
    usageNumber(log, "total_tokens"),
    log.estimatedCostUsd ?? "",
    missingPricingModels(log).join("; "),
    JSON.stringify(log.models || {}),
    log.errorMessage,
  ]);
  const csv = [headers, ...rows].map(row => row.map(csvCell).join(",")).join("\n");
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "itmap-search-audit-logs.csv";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export default function AdminSearchLogs() {
  const [password, setPassword] = useState("");
  const [authenticated, setAuthenticated] = useState(false);
  const [logs, setLogs] = useState<SearchAuditLog[]>([]);
  const [count, setCount] = useState(0);
  const [offset, setOffset] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const storedPassword = window.sessionStorage.getItem(ADMIN_PASSWORD_STORAGE_KEY);
    if (storedPassword) {
      setPassword(storedPassword);
      setAuthenticated(true);
    }
  }, []);

  const totals = useMemo(() => {
    return logs.reduce(
      (acc, log) => ({
        searches: acc.searches + 1,
        durationMs: acc.durationMs + log.durationMs,
        tokens: acc.tokens + usageNumber(log, "total_tokens"),
        cost: acc.cost + (log.estimatedCostUsd || 0),
      }),
      { searches: 0, durationMs: 0, tokens: 0, cost: 0 },
    );
  }, [logs]);
  const hasPartialCosts = logs.some(log => missingPricingModels(log).length > 0);

  const loadLogs = async (nextOffset = offset, nextPassword = password) => {
    if (!nextPassword.trim()) {
      setError("Enter the admin password.");
      return;
    }
    setIsLoading(true);
    setError("");
    try {
      const response = await getSearchAuditLogs(nextPassword, nextOffset, PAGE_SIZE);
      setLogs(response.logs);
      setCount(response.count);
      setOffset(nextOffset);
      setAuthenticated(true);
      window.sessionStorage.setItem(ADMIN_PASSWORD_STORAGE_KEY, nextPassword);
    } catch (loadError) {
      setLogs([]);
      setCount(0);
      setAuthenticated(false);
      window.sessionStorage.removeItem(ADMIN_PASSWORD_STORAGE_KEY);
      setError(loadError instanceof Error ? loadError.message : "Could not load admin logs.");
    } finally {
      setIsLoading(false);
    }
  };

  const pageStart = count === 0 ? 0 : offset + 1;
  const pageEnd = Math.min(offset + PAGE_SIZE, count);

  return (
    <main className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-4">
          <div className="flex items-center gap-3">
            <img src={scsSwoosh} alt="" className="h-9 w-9 object-contain" />
            <div>
              <p className="font-brand text-lg font-semibold tracking-[0.15em] text-foreground">ITMAP</p>
              <p className="text-xs text-muted-foreground">Search activity admin</p>
            </div>
          </div>
          {authenticated && (
            <button
              onClick={() => {
                setAuthenticated(false);
                setPassword("");
                setLogs([]);
                setCount(0);
                window.sessionStorage.removeItem(ADMIN_PASSWORD_STORAGE_KEY);
              }}
              className="rounded-lg border border-border px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted"
            >
              Lock
            </button>
          )}
        </div>
      </header>

      <section className="mx-auto max-w-7xl space-y-5 px-6 py-6">
        {!authenticated ? (
          <div className="mx-auto mt-16 max-w-md rounded-lg border border-border bg-card p-5 shadow-sm">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
                <KeyRound className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h1 className="text-base font-semibold text-foreground">Admin access</h1>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  Enter the private ITMAP admin password to view search activity.
                </p>
              </div>
            </div>
            <form
              className="mt-5 space-y-3"
              onSubmit={event => {
                event.preventDefault();
                loadLogs(0, password);
              }}
            >
              <input
                type="password"
                value={password}
                onChange={event => setPassword(event.target.value)}
                placeholder="Admin password"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
              {error && (
                <p className="flex items-center gap-2 text-xs text-destructive">
                  <AlertCircle className="h-3.5 w-3.5" />
                  {error}
                </p>
              )}
              <button
                type="submit"
                disabled={isLoading}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                {isLoading ? "Checking..." : "View Logs"}
              </button>
            </form>
          </div>
        ) : (
          <>
            <div className="grid gap-3 md:grid-cols-4">
              <div className="rounded-lg border border-border bg-card p-4">
                <p className="text-xs text-muted-foreground">Visible searches</p>
                <p className="mt-1 text-2xl font-semibold text-foreground">{totals.searches}</p>
              </div>
              <div className="rounded-lg border border-border bg-card p-4">
                <p className="text-xs text-muted-foreground">Visible duration</p>
                <p className="mt-1 text-2xl font-semibold text-foreground">{formatDuration(totals.durationMs)}</p>
              </div>
              <div className="rounded-lg border border-border bg-card p-4">
                <p className="text-xs text-muted-foreground">Visible tokens</p>
                <p className="mt-1 text-2xl font-semibold text-foreground">{totals.tokens.toLocaleString()}</p>
              </div>
              <div className="rounded-lg border border-border bg-card p-4">
                <p className="text-xs text-muted-foreground">Visible estimated cost</p>
                <p className="mt-1 text-2xl font-semibold text-foreground">{formatCost(totals.cost)}</p>
                {hasPartialCosts && (
                  <p className="mt-1 text-[11px] text-muted-foreground">Partial until all model prices are configured.</p>
                )}
              </div>
            </div>

            <div className="rounded-lg border border-border bg-card">
              <div className="flex flex-col gap-3 border-b border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-foreground">Search logs</p>
                  <p className="text-xs text-muted-foreground">
                    Showing {pageStart}-{pageEnd} of {count}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => loadLogs(offset)}
                    disabled={isLoading}
                    className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                    Refresh
                  </button>
                  <button
                    onClick={() => exportLogsCsv(logs)}
                    disabled={logs.length === 0}
                    className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Export Page
                  </button>
                </div>
              </div>

              {error && (
                <div className="border-b border-border px-4 py-3 text-xs text-destructive">{error}</div>
              )}

              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-border text-sm">
                  <thead className="bg-secondary/60 text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold">Time</th>
                      <th className="px-4 py-3 text-left font-semibold">Search</th>
                      <th className="px-4 py-3 text-left font-semibold">Mode</th>
                      <th className="px-4 py-3 text-left font-semibold">Duration</th>
                      <th className="px-4 py-3 text-left font-semibold">Results</th>
                      <th className="px-4 py-3 text-left font-semibold">Tokens</th>
                      <th className="px-4 py-3 text-left font-semibold">Cost</th>
                      <th className="px-4 py-3 text-left font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {logs.length === 0 && (
                      <tr>
                        <td className="px-4 py-10 text-center text-muted-foreground" colSpan={8}>
                          No search logs yet.
                        </td>
                      </tr>
                    )}
                    {logs.map(log => (
                      <tr key={log.id} className="align-top">
                        <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">
                          {formatDate(log.createdAt)}
                        </td>
                        <td className="max-w-xl px-4 py-3">
                          <p className="font-medium text-foreground">{log.originalQuery || log.query}</p>
                          {log.expandedQuery && (
                            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                              Expanded: {log.expandedQuery}
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">
                          <span className="rounded-md bg-secondary px-2 py-1">{log.mode || "search"}</span>
                          {log.enableRerank && <span className="ml-1 rounded-md bg-primary/10 px-2 py-1 text-primary">rerank</span>}
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">{formatDuration(log.durationMs)}</td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">
                          {log.resultCount} / {log.candidateCount || "-"}
                          {log.llmPoolSize > 0 && <span className="block">LLM pool {log.llmPoolSize}</span>}
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">
                          <span>{usageNumber(log, "total_tokens").toLocaleString()} total</span>
                          <span className="block">{usageNumber(log, "input_tokens").toLocaleString()} in / {usageNumber(log, "output_tokens").toLocaleString()} out</span>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">
                          {formatLogCost(log)}
                        </td>
                        <td className="px-4 py-3 text-xs">
                          <span className={`inline-flex items-center gap-1 rounded-md px-2 py-1 ${
                            log.status === "success"
                              ? "bg-emerald-500/10 text-emerald-700"
                              : "bg-destructive/10 text-destructive"
                          }`}>
                            <Activity className="h-3 w-3" />
                            {log.status}
                          </span>
                          {log.errorMessage && (
                            <p className="mt-1 max-w-xs text-[11px] leading-relaxed text-destructive">{log.errorMessage}</p>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center justify-between border-t border-border px-4 py-3">
                <button
                  onClick={() => loadLogs(Math.max(0, offset - PAGE_SIZE))}
                  disabled={isLoading || offset === 0}
                  className="rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Previous
                </button>
                <p className="text-xs text-muted-foreground">
                  Page {Math.floor(offset / PAGE_SIZE) + 1}
                </p>
                <button
                  onClick={() => loadLogs(offset + PAGE_SIZE)}
                  disabled={isLoading || offset + PAGE_SIZE >= count}
                  className="rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </section>
    </main>
  );
}
