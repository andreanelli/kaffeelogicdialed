import { openDb } from "../server/db.js";
import { changes } from "../cloud/store.js";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
const store = openDb(
  resolve(process.env.DIALED_DATA_DIR || "data", "dialed.sqlite"),
);
store.initImports();
const snapshot = store.transaction(() => ({
  entities: store.allEntities(),
  files: store
    .allFiles()
    .map((f) => ({ ...f, content: Buffer.from(f.content).toString("base64") })),
  keys: store.db.prepare("SELECT * FROM import_keys ORDER BY rowid").all(),
  meta: store.db
    .prepare("SELECT * FROM meta ORDER BY rowid")
    .all()
    .map((m) => ({ ...m, value: JSON.parse(m.value) })),
}));
store.db.close();
for (const f of snapshot.files)
  if (
    createHash("sha256")
      .update(Buffer.from(f.content, "base64"))
      .digest("hex") !== f.sha256
  )
    throw new Error(`File integrity failure: ${f.id}`);
mkdirSync("data/backups", { recursive: true });
const path = resolve("data/backups", `cloud-migration-${Date.now()}.json`);
writeFileSync(
  path,
  JSON.stringify({ format: "dialed-cloud-snapshot", version: 1, ...snapshot }),
  { mode: 0o600, flag: "wx" },
);
console.log(`Private backup saved: ${path}`);
console.log(
  Object.fromEntries(Object.entries(snapshot).map(([k, v]) => [k, v.length])),
);
if (process.argv.includes("--upload")) {
  const {
    SUPABASE_URL: url,
    SUPABASE_SERVICE_ROLE_KEY: key,
    DIALED_WORKSPACE_ID: workspace,
    DIALED_MIGRATION_USER_ID: actor,
  } = process.env;
  if (!url || !key || !workspace || !actor)
    throw new Error(
      "Set migration environment variables as described in docs/HOSTING.md.",
    );
  const headers = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  };
  const get = async (path) => {
    const r = await fetch(`${url}/rest/v1/${path}`, { headers });
    if (!r.ok) throw new Error(`Database request failed (${r.status})`);
    return r.json();
  };
  const rows = await get(
    `dialed_workspaces?id=eq.${encodeURIComponent(workspace)}&select=revision`,
  );
  if (rows.length !== 1 || rows[0].revision !== 0)
    throw new Error(
      "Migration requires a new, empty workspace at revision zero.",
    );
  const existing = await get(
    `dialed_records?workspace_id=eq.${encodeURIComponent(workspace)}&select=key&limit=1`,
  );
  if (existing.length) throw new Error("Workspace already contains records.");
  const delta = changes(
    { entities: [], files: [], keys: [], meta: [] },
    snapshot,
  );
  const response = await fetch(`${url}/rest/v1/rpc/dialed_commit`, {
    method: "POST",
    headers,
    body: JSON.stringify({ workspace, actor, expected_revision: 0, delta }),
  });
  if (!response.ok)
    throw new Error(
      `Migration failed (${response.status}); inspect Supabase logs. Local backup is intact.`,
    );
  const remote = [];
  for (let offset = 0; ; offset += 500) {
    const page = await get(
      `dialed_records?workspace_id=eq.${encodeURIComponent(workspace)}&select=collection,key,payload&order=ordinal&offset=${offset}&limit=500`,
    );
    remote.push(...page);
    if (page.length < 500) break;
  }
  const canonical = (v) =>
    JSON.stringify(v, (_k, val) =>
      val && typeof val === "object" && !Array.isArray(val)
        ? Object.fromEntries(
            Object.entries(val).sort(([a], [b]) => a.localeCompare(b)),
          )
        : val,
    );
  for (const [collection, entries] of Object.entries(snapshot)) {
    const actual = remote.filter((r) => r.collection === collection);
    if (actual.length !== entries.length)
      throw new Error(`Verification count mismatch: ${collection}`);
    for (const row of entries) {
      const found = actual.find((r) => r.key === (row.id || row.key));
      if (!found || canonical(found.payload) !== canonical(row))
        throw new Error(`Verification mismatch: ${collection}`);
    }
  }
  console.log(
    "Migration committed and every record/file verified. Keep the private backup.",
  );
}
