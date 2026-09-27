# Knowledge library

The existing public corpus is bundled into the local and cloud APIs. No external service, embedding key or database migration is needed. Open **Knowledge library** in the sidebar after starting the updated application.

1. Search a coffee, process, recipe or profile. Category and source filters apply when you press **Search**; **Reset** restores all curated records.
2. Expand **Details and limitations** to read structured facts, unknown measurements and source caveats. Every result links to its source and states whether a page or only a search excerpt was reviewed.
3. Use **Plan experiment**, enter a hypothesis and variable, then save. The experiment retains a server-created snapshot of the record, fields, version, limitations and source. It creates no roast, brew, tasting or inventory event.
4. Open **Experiments → public reference** to inspect that evidence alongside subsequent linked roasts. Editing an experiment preserves its evidence snapshot.

The library has 37 curated records, seven optional discovery leads and 30 source references, reviewed on 2026-09-17. Discovery leads cannot be attached as experimental evidence. Reddit and forum leads are not ingested discussion archives. Vendor descriptors are claims, not observations.

The density tool returns vendor starting-profile families in g/L, including overlapping boundary candidates. It is not a learned prediction. Search is deterministic lexical retrieval, not semantic or generative RAG. Native roast profile binaries are not included.

## API and maintenance

- `GET /api/knowledge`: source registry, categories, counts and latest access date.
- `POST /api/knowledge/search`: read-only lookup with optional `query`, `kind`, `sourceId`, `includeDiscovery`, or `densityGL`. Density mode takes precedence over text; category/source filters still apply. No cloud database commit occurs on search.
- Experiment create/update accepts `referenceIds` (up to 20 unique curated IDs). Evidence is resolved on the server. Existing snapshots remain unchanged on edit; omitting IDs preserves existing references, and an explicit empty array removes them. The current UI attaches one reference when planning; multiple references/removal are API capabilities.

Update `knowledge/sources.json` and `knowledge/records.json`, increment changed record versions, and record access dates and limitations. Run validation, retrieval checks and tests, then rebuild/redeploy to ship the new snapshot. Sources do not sync automatically. Established bulk reuse permission is still required before expanding into full source ingestion.

The CLI uses the same validation, search and density code as the application. Local notebook exports and cloud entity persistence include experiment evidence snapshots. The bundled public corpus itself remains in the repository.

## Verification

Integration verified on 2026-09-18: 53 tests passed; all ten retrieval smoke queries passed; production frontend and Pages Functions bundle compiled. Cloud configuration enables `nodejs_compat`. Browser smoke testing used an isolated temporary notebook and verified search → experiment creation → saved source details. No deployment was performed.
