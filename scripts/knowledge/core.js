import { readFileSync } from "node:fs";
import { validateCorpus } from "../../server/knowledge-core.js";
export * from "../../server/knowledge-core.js";
export const root = new URL("../../knowledge/", import.meta.url);
export function loadCorpus() {
  return validateCorpus({
    sources: JSON.parse(readFileSync(new URL("sources.json", root), "utf8")),
    records: JSON.parse(readFileSync(new URL("records.json", root), "utf8")),
  });
}
