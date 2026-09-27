import sources from "../knowledge/sources.json" with { type: "json" };
import records from "../knowledge/records.json" with { type: "json" };
import { z } from "zod";
import { validateCorpus, search, densityCandidates } from "./knowledge-core.js";
const corpus = validateCorpus({ sources, records });
const sourceMap = new Map(corpus.sources.map((s) => [s.id, s]));
const fail = (message) => Object.assign(new Error(message), { status: 400 });
export function evidenceFor(ids, previous = []) {
  return ids.map((id) => {
    const saved = previous.find((e) => e.recordId === id);
    if (saved) return saved;
    const record = corpus.records.find(
      (r) => r.id === id && r.status === "curated",
    );
    if (!record)
      throw fail("Only available curated knowledge can support an experiment");
    return {
      ...structuredClone(record),
      recordId: record.id,
      source: structuredClone(sourceMap.get(record.sourceId)),
    };
  });
}
export function registerKnowledgeRoutes(app) {
  app.get("/api/knowledge", (_, res) =>
    res.json({
      sources: corpus.sources,
      categories: [
        ...new Set(
          corpus.records
            .filter((r) => r.status !== "withdrawn")
            .map((r) => r.kind),
        ),
      ],
      counts: {
        curated: corpus.records.filter((r) => r.status === "curated").length,
        discovery: corpus.records.filter((r) => r.status === "discovery")
          .length,
        sources: corpus.sources.length,
      },
      asOf: corpus.sources
        .map((s) => s.accessedAt)
        .sort()
        .at(-1),
    }),
  );
  app.post("/api/knowledge/search", (req, res) => {
    const options = z
      .object({
        query: z.string().trim().max(500).default(""),
        kind: z.string().max(100).optional(),
        sourceId: z.string().max(100).optional(),
        includeDiscovery: z.boolean().default(false),
        densityGL: z.number().finite().positive().max(2000).optional(),
      })
      .strict()
      .parse(req.body);
    let results;
    if (options.densityGL !== undefined) {
      results = densityCandidates(corpus, options.densityGL).filter(
        (r) =>
          (!options.kind || r.kind === options.kind) &&
          (!options.sourceId || r.sourceId === options.sourceId),
      );
    } else if (options.query) {
      results = search(corpus, options.query, { ...options, limit: 100 });
    } else {
      results = corpus.records
        .filter(
          (r) =>
            r.status === "curated" ||
            (options.includeDiscovery && r.status === "discovery"),
        )
        .filter(
          (r) =>
            (!options.kind || r.kind === options.kind) &&
            (!options.sourceId || r.sourceId === options.sourceId),
        );
    }
    res.json({
      results: results.map((r) => ({
        ...r,
        source: sourceMap.get(r.sourceId),
      })),
      mode:
        options.densityGL !== undefined
          ? "density-heuristic"
          : "reference-search",
    });
  });
}
