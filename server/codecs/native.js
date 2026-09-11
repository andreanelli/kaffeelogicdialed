import { createHash } from "node:crypto";
export const CODEC_VERSION = "kaffelogic-text/1";
const fail = (message) => Object.assign(new Error(message), { status: 400 });
export function strictNumber(value) {
  if (
    typeof value !== "string" ||
    !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim())
  )
    return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
export function decodeText(bytes) {
  try {
    const text = new TextDecoder("utf-8", {
      fatal: true,
      ignoreBOM: true,
    }).decode(bytes);
    if (text.includes("\0")) throw new Error();
    return text;
  } catch {
    throw fail(
      "Unsupported text encoding. Original bytes are preserved; UTF-8 text is required.",
    );
  }
}
export function nativeDate(text) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2}):(\d{2}) UTC$/.exec(
    text || "",
  );
  if (!m) return null;
  const [, d, mo, y, h, mi, s] = m;
  const iso = `${y}-${mo}-${d}T${h}:${mi}:${s}.000Z`;
  const date = new Date(iso);
  return Number.isFinite(+date) && date.toISOString() === iso ? iso : null;
}
export function decodeBezier(raw) {
  if (typeof raw !== "string") throw fail("Missing native curve");
  const numbers = raw.split(",").map(strictNumber);
  if (
    numbers.length < 12 ||
    numbers.length % 6 ||
    numbers.length > 1200 ||
    numbers.some((n) => n === null)
  )
    throw fail("Invalid Bézier anchor/handle groups");
  const nodes = [];
  for (let i = 0; i < numbers.length; i += 6)
    nodes.push({
      time: numbers[i],
      value: numbers[i + 1],
      inTime: numbers[i + 2],
      inValue: numbers[i + 3],
      outTime: numbers[i + 4],
      outValue: numbers[i + 5],
    });
  if (
    nodes.some(
      (n, i) =>
        n.time < 0 || n.time > 3600 || (i && n.time <= nodes[i - 1].time),
    )
  )
    throw fail("Bézier anchor times must increase within 0–3600 seconds");
  return nodes;
}
export function sampleBezier(nodes) {
  const points = [];
  const b = (a, c, d, e, t) =>
    (1 - t) ** 3 * a +
    3 * (1 - t) ** 2 * t * c +
    3 * (1 - t) * t * t * d +
    t ** 3 * e;
  for (let i = 1; i < nodes.length; i++)
    for (let j = i === 1 ? 0 : 1; j <= 40; j++) {
      const a = nodes[i - 1],
        d = nodes[i],
        t = j / 40;
      const time = b(a.time, a.outTime, d.inTime, d.time, t),
        value = b(a.value, a.outValue, d.inValue, d.value, t);
      if (points.length && time <= points.at(-1).time)
        throw fail("Non-monotonic Bézier time curve is not supported");
      points.push({ time, temperature: value });
    }
  return points;
}
const channelInfo = {
  spot_temp: ["Spot temperature", "°C"],
  temp: ["Temperature", "°C"],
  mean_temp: ["Mean temperature", "°C"],
  profile: ["Target temperature", "°C"],
  profile_ROR: ["Target rate of rise", "°C/min"],
  actual_ROR: ["Actual rate of rise", "°C/min"],
  desired_ROR: ["Desired rate of rise", "°C/min"],
  power_kW: ["Heater power", "kW"],
  actual_fan_RPM: ["Fan speed", "RPM"],
};
export function parseNative(bytes, name = "") {
  const base = {
    codecVersion: CODEC_VERSION,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    kind: "unknown",
    status: "unsupported",
    diagnostics: [],
    metadata: [],
    events: [],
    channels: [],
    rows: [],
    curves: {},
    summary: {},
    canEdit: false,
  };
  let text;
  try {
    text = decodeText(bytes);
  } catch (e) {
    return { ...base, diagnostics: [e.message] };
  }
  const lines = text.replace(/^\uFEFF/, "").split(/\r\n|\n|\r/);
  if (lines.length > 20000)
    return {
      ...base,
      diagnostics: ["File exceeds the 20,000-line parsing limit."],
    };
  const headers = [],
    meta = new Map(),
    eventMap = new Map();
  let table = false,
    offsets = [];
  const diagnose = (m) => {
    if (base.diagnostics.length < 50) base.diagnostics.push(m);
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    if (/^offsets?\t/.test(line)) {
      offsets = line.split("\t").slice(1).map(strictNumber);
      continue;
    }
    if (/^time\t/.test(line)) {
      if (table) {
        diagnose(`Line ${i + 1}: repeated measurement header.`);
        continue;
      }
      table = true;
      headers.push(
        ...line.split("\t").map((raw, index) => ({
          raw,
          key: raw.replace(/^[#=^]+/, ""),
          index,
        })),
      );
      continue;
    }
    if (line.startsWith("!")) {
      const index = line.indexOf(":");
      if (index < 2) {
        diagnose(`Line ${i + 1}: unrecognized event.`);
        continue;
      }
      const key = line.slice(1, index),
        value = line.slice(index + 1);
      base.events.push({ key, value, line: i + 1 });
      eventMap.set(key, value);
      continue;
    }
    if (!table) {
      const index = line.indexOf(":");
      if (index <= 0) {
        diagnose(`Line ${i + 1}: unrecognized metadata retained.`);
        continue;
      }
      const key = line.slice(0, index),
        value = line.slice(index + 1);
      base.metadata.push({ key, value, line: i + 1 });
      if (meta.has(key)) diagnose(`Duplicate metadata key: ${key}.`);
      meta.set(key, value);
      continue;
    }
    const cells = line.split("\t");
    while (cells.length > headers.length && cells.at(-1) === "") cells.pop();
    if (cells.length !== headers.length) {
      diagnose(
        `Line ${i + 1}: expected ${headers.length} columns, found ${cells.length}.`,
      );
      continue;
    }
    const numbers = cells.map((v) => (v === "" ? null : strictNumber(v)));
    if (
      numbers[0] === null ||
      numbers.slice(1).some((n, j) => n === null && cells[j + 1] !== "")
    ) {
      diagnose(`Line ${i + 1}: invalid measurement number.`);
      continue;
    }
    if (base.rows.length && numbers[0] <= base.rows.at(-1)[0]) {
      diagnose(`Line ${i + 1}: measurement time is not increasing.`);
      continue;
    }
    base.rows.push(numbers);
  }
  if (!meta.has("profile_schema_version") || !meta.has("roast_profile"))
    return {
      ...base,
      diagnostics: [
        "Unrecognized Kaffelogic text structure. Original bytes remain available.",
      ],
    };
  base.kind = table || meta.has("native_schema_version") ? "log" : "profile";
  const profileSchema = meta.get("profile_schema_version"),
    logSchema = meta.get("native_schema_version");
  const known =
    ["1.4", "1.6"].includes(profileSchema) &&
    (base.kind === "profile" || ["1.7", "1.8"].includes(logSchema));
  if (!known)
    diagnose(
      `Unsupported schema: profile ${profileSchema}, log ${logSchema || "n/a"}. Only raw metadata is shown.`,
    );
  if (known) {
    for (const key of ["roast_profile", "fan_profile"])
      try {
        const nodes = decodeBezier(meta.get(key));
        base.curves[key] = { nodes, points: sampleBezier(nodes) };
      } catch (e) {
        diagnose(`${key}: ${e.message}`);
      }
    base.channels = headers.map((h, i) => ({
      key: h.key,
      label: channelInfo[h.key]?.[0] || h.key,
      unit: channelInfo[h.key]?.[1] || "unverified",
      rawHeader: h.raw,
      index: i,
      recordedOffset: i ? (offsets[i - 1] ?? null) : null,
    }));
  } else {
    base.rows = [];
  }
  const end = strictNumber(
    eventMap.get("roast_end") ?? eventMap.get("roast end"),
  );
  const firstCrack = strictNumber(eventMap.get("first_crack"));
  const roastStart = nativeDate(meta.get("roast_date"));
  base.summary = {
    name: meta.get("profile_short_name") || name,
    description: (meta.get("profile_description") || "").replace(/\\v/g, "\n"),
    designer: meta.get("profile_designer") || "",
    profileSchema,
    logSchema: logSchema || null,
    firmware: meta.get("firmware_version") || null,
    profileModified: meta.get("profile_modified") || null,
    roastedAt: roastStart,
    endedAt: nativeDate(eventMap.get("roast_date")),
    duration: end,
    firstCrack,
    colourChange: strictNumber(eventMap.get("colour_change")),
    level: strictNumber(
      eventMap.get("roasting_level") ??
        meta.get("roasting_level") ??
        meta.get("recommended_level"),
    ),
    recommendedLevel: strictNumber(meta.get("recommended_level")),
  };
  if (base.kind === "log") {
    if (!roastStart)
      diagnose(
        "Roast-start date is missing or unsupported. Supply it explicitly when importing.",
      );
    if (end === null)
      diagnose(
        "No verified roast-end event. Supply duration explicitly when importing.",
      );
    if (!base.rows.length) diagnose("No usable measurement rows.");
    // These are retained as recorded. Their display/alignment convention is not silently applied.
    if (offsets.some((o) => o !== 0 && o !== null))
      base.timingNote =
        "Channel offsets are preserved. Charts use recorded time; Studio display offsets are not applied.";
  }
  base.status = known
    ? base.diagnostics.length
      ? "partial"
      : "supported"
    : "unsupported";
  base.canEdit =
    base.kind === "profile" &&
    base.status === "supported" &&
    !!base.curves.roast_profile &&
    !!base.curves.fan_profile;
  return base;
}
export function patchNative(bytes, patch) {
  const parsed = parseNative(bytes);
  if (!parsed.canEdit)
    throw fail("This native profile is not eligible for lossless editing.");
  const available = new Map(parsed.metadata.map((m) => [m.key, m.value]));
  const textKeys = new Set([
    "profile_short_name",
    "profile_description",
    "profile_designer",
  ]);
  const editableNumeric = new Set([
    "recommended_level",
    "expect_fc",
    "expect_colrchange",
    "preheat_power",
    "roast_required_power",
    "roast_end_by_time_ratio",
    "cooldown_hi_speed",
    "cooldown_lo_speed",
    "cooldown_lo_temperature",
    "roast_PID_Kp",
    "roast_PID_Ki",
    "roast_PID_Kd",
    "zone1_time_start",
    "zone1_time_end",
    "zone1_boost",
    "zone2_time_start",
    "zone2_time_end",
    "zone2_boost",
    "zone3_time_start",
    "zone3_time_end",
    "zone3_boost",
  ]);
  for (const [key, value] of Object.entries(patch)) {
    if (
      !available.has(key) ||
      !(
        textKeys.has(key) ||
        editableNumeric.has(key) ||
        ["roast_profile", "fan_profile"].includes(key)
      )
    )
      throw fail(
        `Editing ${key} is not supported; the original value is retained.`,
      );
    if (
      typeof value !== "string" ||
      value.length > 10000 ||
      /[\r\n\0]/.test(value)
    )
      throw fail(`Invalid value for ${key}`);
    if (textKeys.has(key)) {
      if (key === "profile_short_name" && (!value.trim() || value.length > 30))
        throw fail("Native short name must contain 1–30 characters.");
    } else if (key.endsWith("_profile")) {
      const nodes = decodeBezier(value);
      const max = key === "fan_profile" ? 30000 : 350;
      if (
        nodes.some((n) =>
          [n.value, n.inValue, n.outValue].some((v) => v < 0 || v > max),
        )
      )
        throw fail(`${key} values are out of range`);
      sampleBezier(nodes);
    } else {
      const n = strictNumber(value);
      if (n === null) throw fail(`${key} must be a finite decimal number`);
      if (key === "recommended_level" && (n < 0.1 || n > 5.9))
        throw fail("Recommended level must be 0.1–5.9");
      if (Math.abs(n) > 30000) throw fail(`${key} is outside editor bounds`);
    }
  }
  if (!Object.keys(patch).length) return Buffer.from(bytes);
  const text = decodeText(bytes);
  const edited = text.replace(
    /(^|\r\n|\n|\r)(\uFEFF?)([^:\r\n]+):([^\r\n]*)/g,
    (all, nl, bom, key, value) =>
      Object.hasOwn(patch, key) ? `${nl}${bom}${key}:${patch[key]}` : all,
  );
  return Buffer.from(edited, "utf8");
}
export function measuredPoints(parsed, duration) {
  const channel = parsed.channels.find((c) => c.key === "temp");
  if (!channel) return null;
  const fan = parsed.channels.find((c) => c.key === "actual_fan_RPM");
  const points = parsed.rows
    .filter((r) => r[0] >= 0 && r[0] <= duration && r[channel.index] !== null)
    .map((r) => ({
      time: r[0],
      temperature: r[channel.index],
      ...(fan && r[fan.index] !== null ? { fan: r[fan.index] } : {}),
    }));
  return points.length >= 2 ? points : null;
}
