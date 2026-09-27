import { createHash } from "node:crypto";
import { z } from "zod";

const nonempty = z.string().trim().min(1);
const jsonValue = z.lazy(() =>
  z.union([
    z.string(),
    z.number().finite(),
    z.boolean(),
    z.null(),
    z.array(jsonValue),
    z.record(jsonValue),
  ]),
);
const sourceSchema = z
  .object({
    id: nonempty,
    title: nonempty,
    url: z
      .string()
      .url()
      .refine((v) => v.startsWith("https://")),
    sourceType: nonempty,
    access: z.enum(["page", "search-extract", "blocked"]),
    accessedAt: z.string().date(),
    publishedAt: z.string().date().nullable(),
    license: nonempty,
    bulkIngestion: nonempty,
    redistribution: nonempty,
    retention: nonempty,
    locator: nonempty,
  })
  .strict();
const recordSchema = z
  .object({
    id: nonempty,
    sourceId: nonempty,
    kind: z.enum([
      "variety",
      "process",
      "lot",
      "roast-guidance",
      "experiment-guidance",
      "brew-recipe",
      "equipment-guidance",
      "sensory",
      "water",
      "source-discovery",
    ]),
    title: nonempty,
    summary: nonempty,
    fields: z.record(jsonValue),
    tags: z.array(nonempty).min(1),
    limitations: z.array(nonempty).min(1),
    status: z.enum(["curated", "discovery", "withdrawn"]),
    evidenceType: z.enum([
      "reference",
      "vendor-claim",
      "manufacturer-guidance",
      "vendor-guidance",
      "published-recipe",
      "expert-guidance",
      "discovery",
    ]),
    version: z.number().int().positive(),
  })
  .strict();
export function validateCorpus(input) {
  const sources = z.array(sourceSchema).parse(input.sources);
  const records = z.array(recordSchema).parse(input.records);
  for (const [name, list] of Object.entries({ sources, records })) {
    if (new Set(list.map((x) => x.id)).size !== list.length)
      throw Error(`Duplicate ${name} IDs`);
  }
  const sourceMap = new Map(sources.map((s) => [s.id, s]));
  for (const r of records) {
    const s = sourceMap.get(r.sourceId);
    if (!s) throw Error(`Unknown source: ${r.sourceId}`);
    if (
      r.status === "curated" &&
      (s.access === "blocked" ||
        r.kind === "source-discovery" ||
        r.evidenceType === "discovery")
    )
      throw Error(`Discovery cannot be curated: ${r.id}`);
    if (r.kind === "lot") {
      z.object({
        country: nonempty,
        process: nonempty,
        varieties: z.array(nonempty),
        harvestYear: z.number().int().min(1900).max(2100),
        altitudeM: z
          .tuple([z.number().nonnegative(), z.number().nonnegative()])
          .refine(([a, b]) => a <= b),
        densityGL: z.number().positive().nullable(),
        moisturePercent: z.number().min(0).max(100).nullable(),
        waterActivity: z.number().min(0).max(1).nullable(),
        supplierLotId: nonempty.nullable(),
        vendorDescriptors: z.array(nonempty),
      }).parse(r.fields);
    }
    if (r.kind === "brew-recipe") {
      z.object({
        brewMethod: nonempty,
        brewer: nonempty,
        doseG: z.number().positive(),
        waterInputG: z.number().positive().nullable(),
        beverageYieldG: z.number().positive().nullable(),
        durationS: z
          .tuple([z.number().positive(), z.number().positive()])
          .refine(([a, b]) => a <= b),
      }).parse(r.fields);
      const f = r.fields;
      if (
        typeof f.waterThroughCoffeeG === "number" &&
        typeof f.bypassWaterG === "number" &&
        Math.abs(f.waterThroughCoffeeG + f.bypassWaterG - f.waterInputG) > 0.01
      )
        throw Error(`Water accounting mismatch: ${r.id}`);
    }
  }
  return { sources, records };
}
const normalize = (text) =>
  text
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/sl[- ]+28/g, "sl28");
const stopwords = new Set(
  "a an the and or of for to with is are what which how do i my in on from use can we want".split(
    " ",
  ),
);
export function tokens(text) {
  return (
    normalize(text)
      .match(/[\p{L}\p{N}]+/gu)
      ?.filter((t) => !stopwords.has(t)) ?? []
  );
}
function searchable(r) {
  return `${r.title} ${r.title} ${r.tags.join(" ")} ${r.summary} ${JSON.stringify(r.fields)}`;
}
export function chunks(corpus) {
  const sourceMap = new Map(corpus.sources.map((s) => [s.id, s]));
  return corpus.records
    .filter((r) => r.status === "curated")
    .map((r) => {
      const s = sourceMap.get(r.sourceId);
      const content = `${r.title}\n${r.summary}\n${JSON.stringify(r.fields)}\nLimitations: ${r.limitations.join(" ")}`;
      return {
        id: `${r.id}:v${r.version}`,
        recordId: r.id,
        kind: r.kind,
        text: content,
        sha256: createHash("sha256").update(content).digest("hex"),
        source: {
          id: s.id,
          url: s.url,
          title: s.title,
          locator: s.locator,
          accessedAt: s.accessedAt,
          access: s.access,
          license: s.license,
          redistribution: s.redistribution,
        },
        evidenceType: r.evidenceType,
        fields: r.fields,
        limitations: r.limitations,
      };
    });
}
// Dependency-free BM25 baseline. Scores measure text relevance, never confidence.
export function search(
  corpus,
  query,
  { kind, process, brewer, sourceId, limit = 5, includeDiscovery = false } = {},
) {
  const terms = [...new Set(tokens(query))];
  if (!terms.length) return [];
  const candidates = corpus.records
    .filter(
      (r) =>
        r.status === "curated" ||
        (includeDiscovery && r.status === "discovery"),
    )
    .filter(
      (r) =>
        (!kind || r.kind === kind) &&
        (!sourceId || r.sourceId === sourceId) &&
        (!process ||
          normalize(String(r.fields.process ?? "")) === normalize(process)) &&
        (!brewer ||
          normalize(String(r.fields.brewer ?? "")) === normalize(brewer)),
    );
  if (!candidates.length) return [];
  const docs = candidates.map((r) => tokens(searchable(r)));
  const avg = docs.reduce((a, d) => a + d.length, 0) / docs.length;
  const sourceMap = new Map(corpus.sources.map((s) => [s.id, s]));
  return candidates
    .map((r, i) => {
      let score = 0;
      for (const t of terms) {
        const tf = docs[i].filter((v) => v === t).length;
        const df = docs.filter((d) => d.includes(t)).length;
        if (tf)
          score +=
            (Math.log(1 + (docs.length - df + 0.5) / (df + 0.5)) * tf * 2.2) /
            (tf + 1.2 * (0.25 + (0.75 * docs[i].length) / avg));
      }
      return { ...r, relevanceScore: score, source: sourceMap.get(r.sourceId) };
    })
    .filter((r) => r.relevanceScore > 0)
    .sort(
      (a, b) => b.relevanceScore - a.relevanceScore || a.id.localeCompare(b.id),
    )
    .slice(0, limit);
}
export function densityCandidates(corpus, densityGL) {
  if (!Number.isFinite(densityGL) || densityGL <= 0)
    throw Error("Density must be positive g/L");
  return corpus.records
    .filter(
      (r) =>
        r.status === "curated" &&
        r.fields.roasterFamily === "Kaffelogic Nano 7" &&
        Object.hasOwn(r.fields, "densityGLMin"),
    )
    .filter(
      (r) =>
        (r.fields.densityGLMin === null ||
          densityGL >= r.fields.densityGLMin) &&
        (r.fields.densityGLMax === null || densityGL <= r.fields.densityGLMax),
    );
}
