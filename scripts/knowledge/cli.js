import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { loadCorpus, search, chunks, densityCandidates, root } from "./core.js";

try {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      kind: { type: "string" },
      process: { type: "string" },
      brewer: { type: "string" },
      limit: { type: "string", default: "5" },
      "include-discovery": { type: "boolean", default: false },
    },
  });
  const [command = "stats", ...args] = positionals;
  const corpus = loadCorpus();
  if (command === "stats" || command === "validate") {
    const counts = {};
    for (const r of corpus.records) counts[r.kind] = (counts[r.kind] ?? 0) + 1;
    console.log(
      JSON.stringify(
        {
          sources: corpus.sources.length,
          records: corpus.records.length,
          curated: chunks(corpus).length,
          byKind: counts,
          measuredDialedOutcomes: 0,
          nativeProfileFiles: 0,
        },
        null,
        2,
      ),
    );
  } else if (command === "search") {
    if (!args.length)
      throw Error('Supply a query, e.g. search "washed Kenya" --kind lot');
    const limit = Number(values.limit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100)
      throw Error("Limit must be 1–100");
    const results = search(corpus, args.join(" "), {
      ...values,
      limit,
      includeDiscovery: values["include-discovery"],
    });
    console.log(
      JSON.stringify(
        {
          query: args.join(" "),
          notice:
            "Retrieval evidence only. Relevance scores are not confidence or taste predictions.",
          results,
        },
        null,
        2,
      ),
    );
  } else if (command === "export") {
    for (const chunk of chunks(corpus)) console.log(JSON.stringify(chunk));
  } else if (command === "density") {
    if (args.length !== 1)
      throw Error("Supply one measured or vendor-reported density in g/L");
    console.log(
      JSON.stringify(
        {
          densityGL: Number(args[0]),
          notice:
            "Vendor heuristic only; verify density method and actual native profile. No roast level or taste prediction is inferred.",
          candidates: densityCandidates(corpus, Number(args[0])),
        },
        null,
        2,
      ),
    );
  } else if (command === "eval") {
    const cases = JSON.parse(
      readFileSync(new URL("retrieval-eval.json", root), "utf8"),
    );
    const results = cases.map((c) => {
      const ids = search(corpus, c.query, c.filters).map((r) => r.id);
      return {
        id: c.id,
        pass: c.expected.length
          ? c.expected.every((id) => ids.includes(id))
          : ids.length === 0,
        expected: c.expected,
        returned: ids,
      };
    });
    console.log(
      JSON.stringify(
        {
          passed: results.filter((r) => r.pass).length,
          total: results.length,
          notice:
            "Curated smoke benchmark, not evidence of real-world recommendation accuracy.",
          results,
        },
        null,
        2,
      ),
    );
    if (results.some((r) => !r.pass)) process.exitCode = 1;
  } else
    throw Error("Commands: stats, validate, search, export, density, eval");
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
