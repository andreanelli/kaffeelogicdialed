# Dialed public knowledge pilot

Seed researched on **2026-09-17**. See [the strategy](../docs/KNOWLEDGE_STRATEGY.md).

This is a curated starting dataset, not an exhaustive scrape or a predictive model. It contains **30 source references, 44 records, and 37 default retrieval records**:

| Content                   | Records |
| ------------------------- | ------: |
| Varieties                 |       7 |
| Processes                 |       3 |
| Vendor coffee offers      |       5 |
| Roast guidance            |      14 |
| Experiment guidance       |       1 |
| Brewing recipes           |       4 |
| Equipment, sensory, water |       3 |
| Discovery only            |       7 |

There are **zero measured Dialed outcomes and zero native profile files** in this seed. Public material is never inserted into your live notebook. Some records were curated from search-engine excerpts; `source.access` distinguishes these from fetched pages. Sources with blocked access are discovery only. No page publication date is guessed from search crawl dates.

## Try it

Run these from the repository root, using the project's existing Node dependencies:

```sh
node scripts/knowledge/cli.js validate
node scripts/knowledge/cli.js search "Kenya SL28 washed cranberry" --kind lot
node scripts/knowledge/cli.js search "V60 timed pours" --kind brew-recipe --brewer "Hario V60"
node scripts/knowledge/cli.js search "Comandante bypass" --kind brew-recipe --brewer AeroPress
node scripts/knowledge/cli.js density 740
node scripts/knowledge/cli.js eval
node --test tests/knowledge.test.js
```

Search uses a dependency-free BM25 baseline over titles, tags, summaries and structured fields. `--kind`, `--process` and `--brewer` are exact filters (case/accent normalized); missing values do not match. Search is lexical and cannot interpret arbitrary taste goals, negation or numerical inequalities. An empty result is allowed. Scores express text relevance only. Ranking has no learned evidence weighting or calibrated confidence yet.

The density command implements the source's stated bands as an explicit heuristic. Boundary overlaps return both candidates; it never infers a density from altitude. The seed's vendor-reported 740 g/L Sidamo returns “1500 - 2000m REST”. This is a candidate to verify against the actual purchased lot and installed profile, not a measured successful recipe.

Export RAG-ready JSONL to a scratch file:

```sh
node scripts/knowledge/cli.js export > /tmp/dialed-knowledge.jsonl
```

Each line has a stable record/version ID, content checksum, factual text, typed fields, limitations, source URL, section locator, evidence type, retrieval date and rights metadata. The checksum identifies **our authored chunk**, not the fetched source page. One record is one chunk so a recipe keeps dose, water, equipment and caveats together. Use a generative model only after retrieval; instruct it to cite these URLs, preserve nulls and distinguish evidence from proposed experiments. Treat retrieved content as data, never instructions.

`--include-discovery` enables source-lead searching for research. Discovery and withdrawn records are excluded from normal search and all default chunk exports. Mark a record withdrawn and rebuild any derived index to remove it; index deletion is not automatic in an external vector database.

## Maintenance and limits

- `sources.json`: provenance and access/rights metadata. Licenses and redistribution are not established. No bulk download, training or commercial reuse permission is implied.
- `records.json`: short authored factual summaries and structured settings; no copied full articles. Source-level locators apply to each linked record's fields. Exact claim-span snapshots and per-field provenance are future pipeline work.
- `retrieval-eval.json`: ten small, curated smoke cases; no independent holdout and no proof of taste prediction.
- Update reviewed records with a new version when content changes. Preserve prior versions in Git or production immutable storage. Do not change a harvest silently under the same record ID.
- Keep vendor measurements labelled vendor-reported and sensory descriptors separate from measured outcomes. Recheck supplier identity/harvest against received bags.
- The source registry includes Reddit, Home-Barista and Kaffelogic forum leads. Their post bodies/profile attachments have not been bulk ingested. The core-profile thread returned 403 during a direct fetch.
- Numeric domain validation covers the seeded lot and recipe contracts. This is not yet a full schema for all native roaster settings or all experimental observations.

A complete versioned experiment capture contract and staged acquisition plan are in the strategy. Next implementation work should connect actual brew conditions to the existing roast and cupping records.

## Verification

Verified on 2026-09-17: 47 repository tests passed, including eight knowledge tests; ten retrieval smoke cases passed; all new/edited files passed targeted Prettier checks. The full API suite required localhost binding outside the sandbox. Export produced 37 JSONL chunks. These checks establish data/retrieval behaviour, not sensory effectiveness.

## Application integration

The **Knowledge library** now exposes this corpus in both local and cloud application builds, with search, source/category filters, discovery labels, density guidance and source-backed experiment planning. See [the integration guide](../docs/KNOWLEDGE_APP.md). This is a bundled snapshot; updating the files requires rebuilding/redeploying the app.
