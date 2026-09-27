import { useEffect, useState } from "react";
import { api } from "./api";
import type { Editor } from "./Forms";
export type KnowledgeSource = {
  id: string;
  title: string;
  url: string;
  access: string;
  accessedAt: string;
  license: string;
  bulkIngestion: string;
};
export type KnowledgeRecord = {
  id: string;
  recordId?: string;
  title: string;
  summary: string;
  kind: string;
  status: string;
  evidenceType: string;
  version: number;
  fields: Record<string, unknown>;
  limitations: string[];
  source: KnowledgeSource;
};
type Metadata = {
  sources: KnowledgeSource[];
  categories: string[];
  counts: { curated: number; discovery: number; sources: number };
  asOf: string;
};
const fieldLabels: Record<string, string> = {
  densityGL: "Density (g/L)",
  densityGLMin: "Minimum density (g/L)",
  densityGLMax: "Maximum density (g/L)",
  altitudeM: "Altitude (m)",
  moisturePercent: "Moisture (%)",
  doseG: "Dose (g)",
  waterInputG: "Water input (g)",
  beverageYieldG: "Beverage yield (g)",
  bypassWaterG: "Bypass water (g)",
  temperatureC: "Temperature (°C)",
  durationS: "Duration (s)",
  pressureBar: "Pressure (bar)",
};
const label = (s: string) =>
  fieldLabels[s] || s.replace(/([a-z])([A-Z])/g, "$1 $2").replaceAll("-", " ");
const access = (s: string) =>
  ({
    page: "Page reviewed",
    "search-extract": "Search excerpt only",
    blocked: "Access blocked",
  })[s] || s;
function Value({ value }: { value: unknown }) {
  if (value === null || value === undefined) return <>Unknown</>;
  if (Array.isArray(value))
    return (
      <ul>
        {value.map((v, i) => (
          <li key={i}>
            <Value value={v} />
          </li>
        ))}
      </ul>
    );
  if (typeof value === "object")
    return (
      <dl className="knowledge-fields">
        {Object.entries(value).map(([k, v]) => (
          <div key={k}>
            <dt>{label(k)}</dt>
            <dd>
              <Value value={v} />
            </dd>
          </div>
        ))}
      </dl>
    );
  return <>{String(value)}</>;
}
export function KnowledgeEvidence({
  records = [],
}: {
  records?: KnowledgeRecord[];
}) {
  if (!records.length) return null;
  return (
    <details className="knowledge-evidence">
      <summary>
        {records.length} public reference{records.length === 1 ? "" : "s"}
      </summary>
      <p>
        Saved evidence for this experiment; these are not your measured results.
      </p>
      {records.map((r) => (
        <div key={r.id}>
          <strong>
            {r.title} · version {r.version}
          </strong>
          <p>{r.summary}</p>
          <a href={r.source.url} target="_blank" rel="noreferrer">
            {r.source.title}
          </a>
          <p>
            {access(r.source.access)} · accessed {r.source.accessedAt}
          </p>
          <Value value={r.fields} />
          {r.limitations.map((l) => (
            <p key={l}>{l}</p>
          ))}
        </div>
      ))}
    </details>
  );
}
export function KnowledgePage({ onEdit }: { onEdit: (e: Editor) => void }) {
  const [meta, setMeta] = useState<Metadata>();
  const [results, setResults] = useState<KnowledgeRecord[]>([]);
  const [options, setOptions] = useState<Record<string, unknown>>({});
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState("");
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    Promise.all([
      api<Metadata>("/knowledge"),
      api<{ results: KnowledgeRecord[]; mode: string }>(
        "/knowledge/search",
        options,
      ),
    ])
      .then(([m, r]) => {
        if (active) {
          setMeta(m);
          setResults(r.results);
          setMode(r.mode);
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [options]);
  return (
    <div className="knowledge-library">
      <section className="panel knowledge-intro">
        <h2>From public knowledge to your next test</h2>
        <p>
          {meta
            ? `${meta.counts.curated} curated records · ${meta.counts.discovery} discovery leads · ${meta.counts.sources} sources · reviewed ${meta.asOf}`
            : "Loading source registry…"}
        </p>
        <p>
          A bundled reference collection. Published recipes and vendor
          descriptions are starting points, not predictions of your cup. Sources
          are not refreshed automatically.
        </p>
      </section>
      <form
        className="panel knowledge-search"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          setOptions({
            query: String(f.get("query") || ""),
            kind: String(f.get("kind") || "") || undefined,
            sourceId: String(f.get("sourceId") || "") || undefined,
            includeDiscovery: f.has("discovery"),
          });
        }}
      >
        <label>
          Search references
          <input name="query" placeholder="Kenya, espresso, fermentation…" />
        </label>
        <label>
          Category
          <select name="kind">
            <option value="">All categories</option>
            {meta?.categories.map((k) => (
              <option key={k} value={k}>
                {label(k)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Source
          <select name="sourceId">
            <option value="">All sources</option>
            {meta?.sources.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </select>
        </label>
        <label className="knowledge-checkbox">
          <input type="checkbox" name="discovery" /> Include discovery leads
        </label>
        <button className="primary" type="submit">
          Search
        </button>
        <button type="reset" onClick={() => setOptions({})}>
          Reset
        </button>
      </form>
      <details className="panel knowledge-density">
        <summary>
          Find Kaffelogic starting points by green-bean bulk density
        </summary>
        <p>
          This vendor heuristic suggests profile families, not verified roast
          outcomes. Boundary values may return two candidates.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setOptions({
              densityGL: Number(new FormData(e.currentTarget).get("density")),
            });
          }}
        >
          <label>
            Density (g/L)
            <input
              name="density"
              type="number"
              min="1"
              max="2000"
              step="any"
              required
            />
          </label>
          <button type="submit">Find starting points</button>
        </form>
      </details>
      {error ? (
        <div role="alert">
          {error}{" "}
          <button onClick={() => setOptions({ ...options })}>Retry</button>
        </div>
      ) : loading ? (
        <p role="status">Loading references…</p>
      ) : (
        <>
          <p role="status">
            {results.length} results
            {mode === "density-heuristic" ? " · density heuristic" : ""}
          </p>
          <div className="knowledge-grid">
            {results.map((r) => (
              <article className="panel knowledge-card" key={r.id}>
                <span className="eyebrow">
                  {label(r.kind)} ·{" "}
                  {r.status === "discovery"
                    ? "Discovery lead — not ingested"
                    : label(r.evidenceType)}
                </span>
                <h2>{r.title}</h2>
                <p>{r.summary}</p>
                <a href={r.source.url} target="_blank" rel="noreferrer">
                  {r.source.title} ↗
                </a>
                <p className="knowledge-meta">
                  {access(r.source.access)} · accessed {r.source.accessedAt}
                </p>
                <details>
                  <summary>Details and limitations</summary>
                  <Value value={r.fields} />
                  {r.limitations.map((l) => (
                    <p key={l}>{l}</p>
                  ))}
                </details>
                {r.status === "curated" && (
                  <button
                    onClick={() =>
                      onEdit({
                        type: "experiment",
                        preset: {
                          name: r.title,
                          referenceIds: [r.id],
                          evidence: [r],
                        },
                      })
                    }
                  >
                    Plan experiment
                  </button>
                )}
              </article>
            ))}
          </div>
          {!results.length && (
            <p>
              No matching references. Try broader terms or reset the filters.
            </p>
          )}
        </>
      )}
      <details className="panel knowledge-sources">
        <summary>Source registry ({meta?.counts.sources || 0})</summary>
        <p>
          Only curated facts and paraphrases are included. Bulk reuse rights
          have not been established.
        </p>
        {meta?.sources.map((s) => (
          <div key={s.id}>
            <a href={s.url} target="_blank" rel="noreferrer">
              {s.title} ↗
            </a>
            <p>
              {access(s.access)} · accessed {s.accessedAt} · bulk ingestion:{" "}
              {label(s.bulkIngestion)}
            </p>
          </div>
        ))}
      </details>
    </div>
  );
}
