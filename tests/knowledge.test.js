import test from "node:test";
import assert from "node:assert/strict";
import {
  loadCorpus,
  validateCorpus,
  search,
  chunks,
  densityCandidates,
} from "../scripts/knowledge/core.js";

test("seed validates and preserves unknown physical measurements", () => {
  const c = loadCorpus();
  const lot = c.records.find((r) => r.id === "lot-colombia-2026");
  assert.equal(lot.fields.densityGL, null);
  assert.equal(lot.fields.waterActivity, null);
  assert.equal(c.records.filter((r) => r.status === "curated").length, 37);
});
test("broken provenance and duplicate IDs fail validation", () => {
  const c = loadCorpus();
  const broken = structuredClone(c);
  broken.records[0].sourceId = "missing";
  assert.throws(() => validateCorpus(broken), /Unknown source/);
  const duplicate = structuredClone(c);
  duplicate.records.push(duplicate.records[0]);
  assert.throws(() => validateCorpus(duplicate), /Duplicate records/);
});
test("invalid measurements and inverted ranges fail validation", () => {
  for (const [field, value] of [
    ["waterActivity", 2],
    ["densityGL", -1],
    ["altitudeM", [2000, 1000]],
  ]) {
    const c = loadCorpus();
    c.records.find((r) => r.kind === "lot").fields[field] = value;
    assert.throws(() => validateCorpus(c));
  }
});
test("source discovery and withdrawn content stay out of RAG export", () => {
  const c = loadCorpus();
  assert.equal(
    search(c, "D-Roast").some((r) => r.status === "discovery"),
    false,
  );
  assert.equal(
    search(c, "D-Roast", { includeDiscovery: true }).some(
      (r) => r.status === "discovery",
    ),
    true,
  );
  c.records[0].status = "withdrawn";
  const out = chunks(c);
  assert.equal(
    out.some((r) => r.recordId === c.records[0].id),
    false,
  );
  assert.ok(
    out.every(
      (r) =>
        r.kind !== "source-discovery" && r.source.url && r.sha256.length === 64,
    ),
  );
});
test("exact equipment/process filters do not fill gaps with unrelated recipes", () => {
  const c = loadCorpus();
  assert.deepEqual(search(c, "espresso", { brewer: "Unknown" }), []);
  assert.deepEqual(search(c, "Kenya", { kind: "lot", process: "honey" }), []);
  assert.equal(
    search(c, "SL-28 cranberry", { kind: "lot", process: "washed" })[0].id,
    "lot-kenya-2025",
  );
});
test("AeroPress bypass water is not beverage yield and mass balances", () => {
  const c = loadCorpus();
  const r = c.records.find((r) => r.id === "recipe-wac-2022-simon");
  assert.equal(r.fields.waterInputG, 186);
  assert.equal(r.fields.beverageYieldG, null);
  r.fields.bypassWaterG = 100;
  assert.throws(() => validateCorpus(c), /Water accounting/);
});
test("density heuristic retains overlap and refuses missing input", () => {
  const c = loadCorpus();
  assert.deepEqual(
    densityCandidates(c, 740).map((r) => r.id),
    ["density-high"],
  );
  assert.deepEqual(
    densityCandidates(c, 700).map((r) => r.id),
    ["density-low", "density-mid"],
  );
  assert.throws(() => densityCandidates(c, null));
  assert.throws(() => densityCandidates(c, NaN));
});
test("chunk checksums change with evidence content", () => {
  const c = loadCorpus();
  const before = chunks(c)[0];
  c.records[0].fields.geneticGroup = "changed";
  assert.notEqual(chunks(c)[0].sha256, before.sha256);
});
