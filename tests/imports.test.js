import { test } from "node:test";
import assert from "node:assert/strict";
import { openDb } from "../server/db.js";
import { archiveFile } from "../server/files.js";
import {
  parseNative,
  patchNative,
  nativeDate,
  measuredPoints,
} from "../server/codecs/native.js";
import {
  initImports,
  createDraft,
  commitCsv,
  rollbackBatch,
  importNativeProfile,
  parseImportDate,
  readCsv,
} from "../server/imports.js";
const native =
  "\uFEFFprofile_schema_version:1.6\r\nprofile_short_name:Fixture\r\nrecommended_level:2.1\r\nunknown_setting:keep:exactly\r\nroast_profile:0,20,0,0,100,100,600,220,500,200,0,0\r\nfan_profile:0,15000,0,0,100,15000,600,14000,500,14000,0,0\r\n";
test("native no-op is byte exact; selective edits preserve BOM, CRLF and unknown fields", () => {
  const bytes = Buffer.from(native);
  const p = parseNative(bytes);
  assert.equal(p.canEdit, true);
  assert.equal(p.curves.roast_profile.points.length, 41);
  assert.deepEqual(p.curves.roast_profile.points.at(-1), {
    time: 600,
    temperature: 220,
  });
  assert.deepEqual(patchNative(bytes, {}), bytes);
  assert.equal(
    patchNative(bytes, { recommended_level: "2.20000" }).toString(),
    native.replace("recommended_level:2.1", "recommended_level:2.20000"),
  );
  assert.throws(
    () => patchNative(bytes, { unknown_setting: "overwrite" }),
    /not supported/,
  );
  assert.throws(
    () => patchNative(bytes, { recommended_level: "2x" }),
    /finite/,
  );
  assert.throws(
    () => patchNative(bytes, { profile_short_name: "injected\nkey:value" }),
    /Invalid/,
  );
  assert.equal(
    parseNative(Buffer.from(native + "recommended_level:3\r\n")).canEdit,
    false,
  );
  assert.equal(
    parseNative(Buffer.from(native.replace("version:1.6", "version:9.9")))
      .status,
    "unsupported",
  );
  assert.equal(parseNative(Buffer.from([255, 0])).status, "unsupported");
});
test("log channels retain blanks, raw offsets and distinct start/end dates; malformed rows diagnosed", () => {
  const log = Buffer.from(
    native +
      "native_schema_version:1.8\r\nroast_date:06/09/2026 15:00:00 UTC\r\noffsets\t-8.5\t0\r\ntime\t#=temp\t#^actual_fan_RPM\r\n0\t25\t15000\t\r\n100\t100\t\r\n200\t180\t14000\r\n300\t100\t14000\r\n!first_crack:150\r\n!roast end:220\r\n!roast_date:06/09/2026 15:04:00 UTC\r\n400\tbad\t14000\r\n500\t1\r\n",
  );
  const p = parseNative(log);
  assert.equal(p.summary.roastedAt, "2026-09-06T15:00:00.000Z");
  assert.equal(p.summary.endedAt, "2026-09-06T15:04:00.000Z");
  assert.equal(p.channels[1].recordedOffset, -8.5);
  assert.equal(p.channels[2].unit, "RPM");
  assert.equal(p.rows[1][2], null);
  assert.equal(p.rows.length, 4);
  assert.equal(measuredPoints(p, 220).length, 3);
  assert.equal(p.status, "partial");
  assert.match(
    p.diagnostics.join(" "),
    /invalid measurement.*expected 3 columns/,
  );
  assert.equal(nativeDate("31/02/2026 00:00:00 UTC"), null);
});
function setup(t, csv) {
  const s = openDb(":memory:");
  initImports(s);
  t.after(() => s.db.close());
  const bean = s.put("bean", { name: "Lot", stock: 1000 });
  const version = s.put("version", { name: "Profile", number: 1 });
  const file = archiveFile(s, "history.csv", Buffer.from(csv));
  const options = {
    fileId: file.id,
    dataset: "fixture",
    delimiter: ";",
    mapping: {
      externalId: "ID",
      name: "Name",
      coffee: "Coffee",
      profile: "Profile",
      roastedAt: "Date",
      greenWeight: "Green",
      roastedWeight: "Roasted",
      duration: "Time",
      level: "Level",
      taster: "Taster",
      tastedAt: "Tasted",
      score: "Score",
      notes: "Notes",
    },
    coffeeMap: { Lot: bean.id },
    profileMap: { Profile: version.id },
    dateFormat: "DMY",
    offsetMinutes: 120,
    weightUnit: "kg",
    durationUnit: "mm:ss",
    decimal: ",",
    excludedRows: [],
  };
  return { s, options, bean, file };
}
const header =
  "ID;Name;Coffee;Profile;Date;Green;Roasted;Time;Level;Taster;Tasted;Score;Notes\n";
const row =
  'r1;Batch;Lot;Profile;06/09/2026 15:00;0,100;0,086;09:00;2,1;Alex;08/09/2026 10:00;;"peach; sweet\nand clean"\n';
test("CSV quoted multiline fields, explicit conversions, nullable scores, idempotency and rollback", (t) => {
  const { s, options, bean, file } = setup(
    t,
    header + row + row.replace("Alex", "Sam"),
  );
  const draft = createDraft(s, options);
  assert.equal(draft.counts.ready, 2);
  assert.equal(draft.rows[0].roast.greenWeight, 100);
  assert.equal(draft.rows[0].roast.duration, 540);
  assert.equal(draft.rows[0].roast.roastedAt, "2026-09-06T13:00:00.000Z");
  assert.equal(draft.rows[0].tasting.score, null);
  assert.match(draft.rows[0].roast.notes, /\n/);
  const batch = commitCsv(s, draft.draftId);
  assert.equal(commitCsv(s, draft.draftId).id, batch.id);
  assert.equal(s.list("roast").length, 1);
  assert.equal(s.list("cupping").length, 2);
  assert.equal(s.get(bean.id, "bean").stock, 1000);
  assert.equal(s.list("roast")[0].inventoryConsumed, false);
  assert.equal(createDraft(s, options).counts.duplicate, 2);
  rollbackBatch(s, batch.id);
  assert.equal(s.list("roast").length, 0);
  assert.equal(s.list("cupping").length, 0);
  assert.ok(s.db.prepare("SELECT id FROM files WHERE id=?").get(file.id));
  assert.equal(createDraft(s, options).counts.ready, 2);
});
test("invalid rows block the entire batch until explicitly excluded", (t) => {
  const { s, options } = setup(
    t,
    header + row + row.replace("r1;", "r2;").replace("0,086", "0,200"),
  );
  const draft = createDraft(s, options);
  assert.equal(draft.counts.error, 1);
  assert.throws(() => commitCsv(s, draft.draftId), /invalid rows/);
  assert.equal(s.list("roast").length, 0);
  const fixed = createDraft(s, { ...options, excludedRows: [3] });
  commitCsv(s, fixed.draftId);
  assert.equal(s.list("roast").length, 1);
});
test("conflicting source IDs and edits are never silently overwritten; edited batch rollback blocked", (t) => {
  const { s, options } = setup(t, header + row);
  const batch = commitCsv(s, createDraft(s, options).draftId);
  const r = s.list("roast")[0];
  s.put("roast", { ...r, notes: "Changed later" }, r.id);
  assert.equal(createDraft(s, options).counts.error, 1);
  assert.throws(() => rollbackBatch(s, batch.id), /edited/);
  assert.equal(s.list("roast").length, 1);
});
test("concurrent imports invalidate preview and later references protect rollback", (t) => {
  const { s, options } = setup(t, header + row);
  const a = createDraft(s, options),
    b = createDraft(s, options);
  const batch = commitCsv(s, a.draftId);
  assert.throws(() => commitCsv(s, b.draftId), /stale/);
  s.put("cupping", { roastId: s.list("roast")[0].id, taster: "Later" });
  assert.throws(() => rollbackBatch(s, batch.id), /later record/);
});
test("native import deduplicates and preserves source without changing stock", (t) => {
  const { s, bean } = setup(t, header + row);
  const f = archiveFile(s, "fixture.kpro", Buffer.from(native));
  importNativeProfile(s, f.id);
  importNativeProfile(s, f.id);
  assert.equal(s.list("profile").length, 1);
  assert.equal(s.list("version").length, 2);
  assert.equal(
    s.list("version").find((v) => v.sourceFileId === f.id).native.sourceHash,
    f.sha256,
  );
  assert.equal(s.get(bean.id, "bean").stock, 1000);
});
test("dates and CSV structure reject ambiguity and impossible values", () => {
  assert.throws(() => parseImportDate("31/02/2026", "DMY", 0), /Invalid/);
  assert.throws(
    () => parseImportDate("2026-09-06T12:00", "ISO", 0),
    /complete ISO/,
  );
  assert.equal(
    parseImportDate("2026-09-06T12:00:00+02:00", "ISO", 0),
    "2026-09-06T10:00:00.000Z",
  );
  assert.throws(() => readCsv({ content: Buffer.from("A,A\n1,2") }), /unique/);
  assert.throws(
    () => readCsv({ content: Buffer.from("A,B\n1,2,3") }),
    /could not be parsed/,
  );
});
