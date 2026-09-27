import { randomUUID, createHash } from "node:crypto";
import { parse as parseCsv } from "csv-parse/sync";
import { z } from "zod";
import {
  decodeText,
  strictNumber,
  nativeDate,
  parseNative,
  measuredPoints,
  CODEC_VERSION,
} from "./codecs/native.js";
import { roastSchema, profileSchema } from "./schema.js";
export const fail = (message, status = 400) =>
  Object.assign(new Error(message), { status });
export const fingerprint = (value) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
export function initImports(store) {
  store.initImports();
}
export function getFile(s, id) {
  const f = s.file(id);
  if (!f) throw fail("File not found", 404);
  return f;
}
function reference(s, id, kind) {
  if (typeof id !== "string" || !id) throw fail(`Choose an existing ${kind}.`);
  const v = s.get(id, kind);
  if (!v) throw fail(`Choose an existing ${kind}.`);
  return v;
}
export function readCsv(file, delimiter = ",") {
  if (![",", ";", "\t"].includes(delimiter))
    throw fail("Choose comma, semicolon, or tab as the delimiter.");
  let data;
  try {
    data = parseCsv(decodeText(file.content).replace(/^\uFEFF/, ""), {
      delimiter,
      bom: true,
      skip_empty_lines: true,
      relax_column_count: false,
      max_record_size: 1000000,
    });
  } catch (e) {
    throw fail(`CSV could not be parsed: ${e.message}`);
  }
  if (data.length < 2)
    throw fail("CSV needs a header row and at least one data row.");
  if (data.length > 2001)
    throw fail("Import at most 2,000 data rows per batch.");
  const headers = data.shift().map((h) => h.trim());
  if (headers.some((h) => !h) || new Set(headers).size !== headers.length)
    throw fail("CSV column names must be nonempty and unique.");
  return { headers, rows: data.map((cells, i) => ({ row: i + 2, cells })) };
}
export const csvFields = [
  "externalId",
  "name",
  "coffee",
  "profile",
  "roastedAt",
  "greenWeight",
  "roastedWeight",
  "duration",
  "firstCrack",
  "level",
  "notes",
  "taster",
  "tastedAt",
  "score",
  "aroma",
  "acidity",
  "sweetness",
  "body",
  "finish",
  "tastingNotes",
];
const stringMap = z.record(z.string().max(200));
export const csvOptionsSchema = z.object({
  fileId: z.string(),
  dataset: z.string().trim().min(1).max(100),
  delimiter: z.enum([",", ";", "\t"]),
  mapping: stringMap,
  coffeeMap: stringMap,
  profileMap: stringMap,
  dateFormat: z.enum(["ISO", "DMY", "MDY"]),
  offsetMinutes: z.number().int().min(-720).max(840),
  weightUnit: z.enum(["g", "kg"]),
  durationUnit: z.enum(["seconds", "minutes", "mm:ss"]),
  decimal: z.enum([".", ","]),
  excludedRows: z.array(z.number().int().min(2)).max(2000).default([]),
});
export function parseImportDate(raw, format, offsetMinutes) {
  if (!raw) throw fail("Date is required.");
  let y,
    mo,
    d,
    h = "00",
    mi = "00",
    sec = "00";
  if (format === "ISO") {
    const iso =
      /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(Z|[+-]\d{2}:\d{2}))?$/.exec(
        raw,
      );
    if (!iso)
      throw fail(
        "Use YYYY-MM-DD or a complete ISO timestamp with seconds and timezone.",
      );
    [, y, mo, d] = iso;
    if (iso[4]) {
      [, y, mo, d, h, mi, sec] = iso;
      const local = `${y}-${mo}-${d}T${h}:${mi}:${sec}.000Z`;
      if (
        !Number.isFinite(Date.parse(local)) ||
        new Date(local).toISOString() !== local
      )
        throw fail("Invalid calendar date or time.");
      if (!Number.isFinite(Date.parse(raw)))
        throw fail("Invalid timestamp offset.");
      return new Date(raw).toISOString();
    }
  } else {
    const m =
      /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?: (\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(
        raw,
      );
    if (!m)
      throw fail(
        `Use ${format === "DMY" ? "DD/MM/YYYY" : "MM/DD/YYYY"}, optionally followed by HH:mm:ss.`,
      );
    y = m[3];
    mo = (format === "DMY" ? m[2] : m[1]).padStart(2, "0");
    d = (format === "DMY" ? m[1] : m[2]).padStart(2, "0");
    h = m[4] || h;
    mi = m[5] || mi;
    sec = m[6] || sec;
  }
  const local = `${y}-${mo}-${d}T${h}:${mi}:${sec}.000Z`;
  if (
    !Number.isFinite(Date.parse(local)) ||
    new Date(local).toISOString() !== local
  )
    throw fail("Invalid calendar date or time.");
  return new Date(Date.parse(local) - offsetMinutes * 60000).toISOString();
}
function number(raw, label, decimal) {
  const n = strictNumber(decimal === "," ? raw.replace(",", ".") : raw);
  if (n === null) throw fail(`${label}: enter an ungrouped decimal number.`);
  return n;
}
function time(raw, unit, decimal) {
  if (unit === "mm:ss") {
    const m = /^(\d+):([0-5]\d(?:\.\d+)?)$/.exec(raw);
    if (!m) throw fail("Duration must use mm:ss, with seconds below 60.");
    return Number(m[1]) * 60 + Number(m[2]);
  }
  return number(raw, "Duration", decimal) * (unit === "minutes" ? 60 : 1);
}
const tastingSchema = z.object({
  taster: z.string().trim().min(1).max(200),
  tastedAt: z.string().datetime(),
  score: z.number().min(0).max(100).nullable(),
  aroma: z.number().min(0).max(10).nullable(),
  acidity: z.number().min(0).max(10).nullable(),
  sweetness: z.number().min(0).max(10).nullable(),
  body: z.number().min(0).max(10).nullable(),
  finish: z.number().min(0).max(10).nullable(),
  notes: z.string().max(10000),
});
function rowError(e) {
  return e instanceof z.ZodError
    ? e.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")
    : e.message;
}
export function previewCsv(s, input) {
  const options = csvOptionsSchema.parse(input);
  const file = getFile(s, options.fileId);
  const csv = readCsv(file, options.delimiter);
  const seen = new Map();
  for (const [key, column] of Object.entries(options.mapping)) {
    if (!csvFields.includes(key))
      throw fail(`Unknown destination field ${key}`);
    if (column && !csv.headers.includes(column))
      throw fail(`Column ${column} no longer exists.`);
  }
  const rows = csv.rows.map(({ row, cells }) => {
    if (options.excludedRows.includes(row)) return { row, status: "excluded" };
    try {
      const value = (k) => {
        const c = options.mapping[k];
        return c ? cells[csv.headers.indexOf(c)].trim() : "";
      };
      const beanId = options.coffeeMap[value("coffee")],
        profileVersionId = options.profileMap[value("profile")];
      reference(s, beanId, "bean");
      reference(s, profileVersionId, "version");
      const roast = roastSchema.parse({
        name: value("name"),
        beanId,
        profileVersionId,
        roastedAt: parseImportDate(
          value("roastedAt"),
          options.dateFormat,
          options.offsetMinutes,
        ),
        greenWeight:
          number(value("greenWeight"), "Green weight", options.decimal) *
          (options.weightUnit === "kg" ? 1000 : 1),
        roastedWeight:
          number(value("roastedWeight"), "Roasted weight", options.decimal) *
          (options.weightUnit === "kg" ? 1000 : 1),
        duration: time(
          value("duration"),
          options.durationUnit,
          options.decimal,
        ),
        firstCrack: value("firstCrack")
          ? time(value("firstCrack"), options.durationUnit, options.decimal)
          : null,
        level: number(value("level"), "Level", options.decimal),
        notes: value("notes"),
        fileId: file.id,
      });
      const canonical = { ...roast, fileId: null };
      const hash = fingerprint(canonical);
      const key = value("externalId")
        ? `csv:${fingerprint([options.dataset, value("externalId")])}`
        : `roast:${hash}`;
      const old = s.importKey(key);
      if (old && old.fingerprint !== hash)
        throw fail(
          "This source roast ID already exists with different values. Resolve the conflict; no record will be overwritten.",
        );
      if (old) {
        const current = roastSchema.parse(reference(s, old.entity_id, "roast"));
        if (fingerprint({ ...current, fileId: null }) !== old.fingerprint)
          throw fail(
            "The previously imported roast has been edited. Resolve the conflict before adding history.",
          );
      }
      if (seen.has(key) && seen.get(key) !== hash)
        throw fail("Rows sharing a source roast ID disagree about the roast.");
      let tasting = null;
      if (
        [
          "taster",
          "tastedAt",
          "score",
          "aroma",
          "acidity",
          "sweetness",
          "body",
          "finish",
          "tastingNotes",
        ].some((k) => value(k))
      ) {
        const t = {
          taster: value("taster"),
          tastedAt: parseImportDate(
            value("tastedAt"),
            options.dateFormat,
            options.offsetMinutes,
          ),
          notes: value("tastingNotes"),
        };
        for (const k of [
          "score",
          "aroma",
          "acidity",
          "sweetness",
          "body",
          "finish",
        ])
          t[k] = value(k) ? number(value(k), k, options.decimal) : null;
        tasting = tastingSchema.parse(t);
      }
      const tastingKey = tasting
        ? `tasting:${key}:${fingerprint(tasting)}`
        : null;
      const priorTasting = tastingKey && s.importKey(tastingKey);
      const inBatch = seen.has(key);
      seen.set(key, hash);
      const duplicate = !!old || inBatch;
      const cupDuplicate =
        tastingKey && (!!priorTasting || seen.has(tastingKey));
      if (tastingKey) seen.set(tastingKey, true);
      return {
        row,
        status: duplicate && (!tasting || cupDuplicate) ? "duplicate" : "ready",
        roast,
        tasting: cupDuplicate ? null : tasting,
        key,
        hash,
        tastingKey,
        existingRoastId: old?.entity_id || null,
        reuseRoast: duplicate,
      };
    } catch (e) {
      return { row, status: "error", error: rowError(e) };
    }
  });
  return {
    options,
    file: { id: file.id, name: file.name, sha256: file.sha256 },
    rows,
    counts: {
      ready: rows.filter((r) => r.status === "ready").length,
      duplicate: rows.filter((r) => r.status === "duplicate").length,
      error: rows.filter((r) => r.status === "error").length,
      excluded: rows.filter((r) => r.status === "excluded").length,
    },
  };
}
export function createDraft(s, input) {
  const preview = previewCsv(s, input);
  const draft = s.put("importDraft", {
    options: preview.options,
    fileHash: preview.file.sha256,
    previewHash: fingerprint(preview.rows),
    status: "preview",
    counts: preview.counts,
  });
  return { ...preview, draftId: draft.id };
}
export function commitCsv(s, draftId) {
  return s.transaction(() => {
    const draft = reference(s, draftId, "importDraft");
    if (draft.batchId) return reference(s, draft.batchId, "importBatch");
    const preview = previewCsv(s, draft.options);
    if (
      preview.file.sha256 !== draft.fileHash ||
      fingerprint(preview.rows) !== draft.previewHash
    )
      throw fail("Preview is stale. Preview again before importing.", 409);
    if (preview.counts.error)
      throw fail("Fix or explicitly exclude invalid rows before importing.");
    const batchId = randomUUID(),
      records = [],
      keys = [],
      roastIds = new Map();
    const save = (kind, data) => {
      const v = s.put(kind, { ...data, importBatchId: batchId });
      records.push({ id: v.id, kind, hash: fingerprint(v) });
      return v;
    };
    const addKey = (key, id, hash) => {
      s.addImportKey(key, id, hash, batchId);
      keys.push(key);
    };
    for (const row of preview.rows) {
      if (!row.roast) continue;
      let roastId = row.existingRoastId || roastIds.get(row.key);
      if (!roastId) {
        const r = save("roast", {
          ...row.roast,
          inventoryConsumed: false,
          source: {
            fileId: preview.file.id,
            sha256: preview.file.sha256,
            row: row.row,
            kind: "csv",
            dataset: preview.options.dataset,
          },
        });
        roastId = r.id;
        addKey(row.key, roastId, row.hash);
      }
      roastIds.set(row.key, roastId);
      if (row.tasting) {
        const c = save("cupping", {
          ...row.tasting,
          roastId,
          source: { fileId: preview.file.id, row: row.row, kind: "csv" },
        });
        addKey(row.tastingKey, c.id, fingerprint(row.tasting));
      }
    }
    const batch = s.put(
      "importBatch",
      {
        type: "csv",
        fileId: preview.file.id,
        fileName: preview.file.name,
        status: "committed",
        counts: preview.counts,
        records,
        keys,
        options: preview.options,
      },
      batchId,
    );
    s.put("importDraft", { ...draft, status: "committed", batchId }, draft.id);
    return batch;
  });
}
export function rollbackBatch(s, id) {
  return s.transaction(() => {
    const batch = reference(s, id, "importBatch");
    if (batch.status === "rolledBack") return batch;
    if (batch.status === "modified")
      throw fail(
        "Records were deleted from this batch; rollback is unavailable.",
        409,
      );
    const ids = new Set(batch.records.map((r) => r.id));
    for (const record of batch.records) {
      const current = reference(s, record.id, record.kind);
      if (fingerprint(current) !== record.hash)
        throw fail(
          "An imported record has been edited. Rollback is blocked to preserve those changes.",
          409,
        );
    }
    const refs = [
      "beanId",
      "profileVersionId",
      "profileId",
      "roastId",
      "experimentId",
      "versionId",
      "parentVersionId",
    ];
    for (const row of s.allEntities()) {
      if (ids.has(row.id)) continue;
      const data = JSON.parse(row.data);
      if (
        refs.some((k) => ids.has(data[k])) ||
        (data.pilot?.lotIds || []).some((id) => ids.has(id))
      )
        throw fail(
          "A later record references this import. Rollback is blocked to preserve that history.",
          409,
        );
    }
    for (const record of [...batch.records].reverse()) s.remove(record.id);
    s.removeImportKeys("batch_id", id);
    return s.put(
      "importBatch",
      {
        ...batch,
        status: "rolledBack",
        rolledBackAt: new Date().toISOString(),
      },
      id,
    );
  });
}
export function importNativeProfile(s, fileId) {
  return s.transaction(() => {
    const file = getFile(s, fileId),
      parsed = parseNative(file.content, file.name);
    if (parsed.kind !== "profile" || !parsed.canEdit)
      throw fail(
        "This profile cannot be imported: " + parsed.diagnostics.join("; "),
      );
    const key = `native-profile:${file.sha256}`,
      existing = s.importKey(key);
    if (existing)
      return {
        ...reference(s, existing.entity_id, "version"),
        duplicate: true,
      };
    const data = profileSchema.parse({
      name: parsed.summary.name,
      description: parsed.summary.description,
      level: parsed.summary.recommendedLevel,
      points: parsed.curves.roast_profile.points,
      changeNote: "Imported native original",
    });
    const batchId = randomUUID(),
      p = s.put("profile", {
        name: data.name,
        description: data.description,
        importBatchId: batchId,
      });
    const v = s.put("version", {
      ...data,
      profileId: p.id,
      number: 1,
      sourceFileId: file.id,
      native: {
        kind: "profile",
        codecVersion: CODEC_VERSION,
        sourceHash: file.sha256,
        patch: {},
      },
      importBatchId: batchId,
    });
    s.addImportKey(key, v.id, file.sha256, batchId);
    s.put(
      "importBatch",
      {
        type: "native-profile",
        fileId: file.id,
        fileName: file.name,
        status: "committed",
        records: [
          { id: p.id, kind: "profile", hash: fingerprint(p) },
          { id: v.id, kind: "version", hash: fingerprint(v) },
        ],
        keys: [key],
        counts: { ready: 1, duplicate: 0, error: 0, excluded: 0 },
      },
      batchId,
    );
    return v;
  });
}
export function importNativeLog(s, fileId, fields) {
  return s.transaction(() => {
    const file = getFile(s, fileId),
      parsed = parseNative(file.content, file.name);
    if (
      parsed.kind !== "log" ||
      parsed.status === "unsupported" ||
      !parsed.curves.roast_profile
    )
      throw fail("Unsupported native log.");
    const linked = s.list("roast").find((r) => r.fileId === file.id);
    if (linked) return { ...linked, duplicate: true };
    const key = `native-log:${file.sha256}`,
      old = s.importKey(key);
    if (old)
      return { ...reference(s, old.entity_id, "roast"), duplicate: true };
    reference(s, fields.beanId, "bean");
    const duration = fields.duration,
      points = measuredPoints(parsed, duration);
    const batchId = randomUUID();
    const profile = profileSchema.parse({
      name: `${parsed.summary.name} / log snapshot`,
      description: "Exact embedded native settings retained in the source log.",
      level: parsed.summary.recommendedLevel,
      points: parsed.curves.roast_profile.points,
      changeNote: "Snapshot captured in original roast log",
    });
    const p = s.put("profile", {
      name: profile.name,
      description: profile.description,
      importBatchId: batchId,
    });
    const v = s.put("version", {
      ...profile,
      profileId: p.id,
      number: 1,
      sourceFileId: file.id,
      native: {
        kind: "log",
        codecVersion: CODEC_VERSION,
        sourceHash: file.sha256,
        patch: {},
      },
      importBatchId: batchId,
    });
    const data = roastSchema.parse({
      ...fields,
      profileVersionId: v.id,
      fileId: file.id,
      points,
    });
    if (data.experimentId) reference(s, data.experimentId, "experiment");
    const roast = s.put("roast", {
      ...data,
      inventoryConsumed: false,
      importBatchId: batchId,
      source: {
        kind: "native-log",
        fileId: file.id,
        sha256: file.sha256,
        codecVersion: CODEC_VERSION,
        firmware: parsed.summary.firmware,
        timingNote: parsed.timingNote || null,
      },
    });
    s.addImportKey(key, roast.id, file.sha256, batchId);
    s.put(
      "importBatch",
      {
        type: "native-log",
        fileId: file.id,
        fileName: file.name,
        status: "committed",
        records: [
          { id: p.id, kind: "profile", hash: fingerprint(p) },
          { id: v.id, kind: "version", hash: fingerprint(v) },
          { id: roast.id, kind: "roast", hash: fingerprint(roast) },
        ],
        keys: [key],
        counts: { ready: 1, duplicate: 0, error: 0, excluded: 0 },
      },
      batchId,
    );
    for (const run of s.list("deviceRun"))
      if (run.files.some((f) => f.id === file.id)) {
        for (const kind of ["cupping", "brew"])
          for (const record of s.list(kind))
            if (record.roastId === run.id)
              s.put(kind, { ...record, roastId: roast.id }, record.id);
      }
    return roast;
  });
}
