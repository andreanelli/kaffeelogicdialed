import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  FileSpreadsheet,
  Upload,
  Undo2,
} from "lucide-react";
import { api, upload } from "./api";
import { Field } from "./Forms";
import type { State } from "./types";
type CsvTable = { headers: string[]; rows: { row: number; cells: string[] }[] };
type ImportOptions = {
  fileId: string;
  dataset: string;
  delimiter: string;
  mapping: Record<string, string>;
  coffeeMap: Record<string, string>;
  profileMap: Record<string, string>;
  dateFormat: string;
  offsetMinutes: number;
  weightUnit: string;
  durationUnit: string;
  decimal: string;
  excludedRows: number[];
};
type Preview = {
  draftId: string;
  counts: { ready: number; duplicate: number; error: number; excluded: number };
  rows: {
    row: number;
    status: string;
    error?: string;
    roast?: {
      name: string;
      roastedAt: string;
      greenWeight: number;
      roastedWeight: number;
      duration: number;
      level: number;
    };
    tasting?: { taster: string; tastedAt: string; score: number | null } | null;
  }[];
};
type Batch = {
  id: string;
  fileName: string;
  type: string;
  status: string;
  createdAt: string;
  records: { id: string }[];
  counts: { ready: number; duplicate: number; error: number; excluded: number };
};
const fieldList = [
  ["externalId", "Source roast ID (optional)"],
  ["name", "Roast name"],
  ["coffee", "Coffee / lot name"],
  ["profile", "Profile name"],
  ["roastedAt", "Roast date"],
  ["greenWeight", "Green weight"],
  ["roastedWeight", "Roasted weight"],
  ["duration", "Roast duration"],
  ["firstCrack", "First crack (optional)"],
  ["level", "Roast level"],
  ["notes", "Roast notes (optional)"],
  ["taster", "Taster"],
  ["tastedAt", "Tasting date"],
  ["score", "Overall score"],
  ["aroma", "Aroma"],
  ["acidity", "Acidity"],
  ["sweetness", "Sweetness"],
  ["body", "Body"],
  ["finish", "Finish"],
  ["tastingNotes", "Tasting notes"],
];
const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const aliases: Record<string, string[]> = {
  externalId: ["roastid", "batchid", "externalid"],
  name: ["roastname", "name"],
  coffee: ["coffee", "bean", "coffeename", "lot"],
  profile: ["profile", "profilename"],
  roastedAt: ["roastdate", "roastedat", "date"],
  greenWeight: ["greenweight", "greenweightg", "greenweightkg", "inputweight"],
  roastedWeight: [
    "roastedweight",
    "roastedweightg",
    "roastedweightkg",
    "outputweight",
  ],
  duration: ["duration", "roasttime", "roastduration"],
  firstCrack: ["firstcrack", "fc"],
  level: ["level", "roastlevel"],
  notes: ["notes", "roastnotes"],
  taster: ["taster", "author"],
  tastedAt: ["tastedat", "tastingdate", "cuppingdate"],
  score: ["score", "overallscore"],
  tastingNotes: ["tastingnotes", "cuppingnotes"],
};
export default function HistoryImporter({
  state,
  onSaved,
}: {
  state: State;
  onSaved: () => Promise<void>;
}) {
  const [step, setStep] = useState(0),
    [table, setTable] = useState<CsvTable | null>(null),
    [preview, setPreview] = useState<Preview | null>(null),
    [batches, setBatches] = useState<Batch[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [dirty, setDirty] = useState(false);
  const [options, setOptions] = useState<ImportOptions>({
    fileId:
      state.files.find((f) => f.name.toLowerCase().endsWith(".csv"))?.id || "",
    dataset: "Roast history",
    delimiter: ",",
    mapping: {},
    coffeeMap: {},
    profileMap: {},
    dateFormat: "ISO",
    offsetMinutes: 0,
    weightUnit: "g",
    durationUnit: "seconds",
    decimal: ".",
    excludedRows: [],
  });
  const fileInput = useRef<HTMLInputElement>(null);
  const loadBatches = () => api<Batch[]>("/imports").then(setBatches);
  useEffect(() => {
    loadBatches().catch((e) => setError(e.message));
  }, []);
  const update = (patch: Partial<ImportOptions>) => {
    setOptions((old) => ({ ...old, ...patch }));
    setDirty(true);
  };
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const read = () =>
    run(async () => {
      const t = await api<CsvTable>("/imports/csv/read", {
        fileId: options.fileId,
        delimiter: options.delimiter,
      });
      setTable(t);
      const mapping = Object.fromEntries(
        fieldList.map(([key]) => [
          key,
          t.headers.find((h) =>
            (aliases[key] || [key]).includes(normalize(h)),
          ) || "",
        ]),
      );
      update({ mapping, coffeeMap: {}, profileMap: {}, excludedRows: [] });
      setPreview(null);
      setStep(1);
    });
  const distinct = (key: string) =>
    table
      ? [
          ...new Set(
            table.rows.map((r) => {
              const index = table.headers.indexOf(options.mapping[key]);
              return index >= 0 ? r.cells[index].trim() : "";
            }),
          ),
        ]
      : [];
  async function makePreview() {
    await run(async () => {
      const p = await api<Preview>("/imports/csv/preview", options);
      setPreview(p);
      setDirty(false);
      setStep(2);
    });
  }
  const csvFiles = state.files.filter((f) => /\.csv$/i.test(f.name));
  return (
    <div className="history-importer">
      <div className="import-intro">
        <FileSpreadsheet size={25} />
        <div>
          <h2>Bring your old notebook along.</h2>
          <p>
            Upload a CSV export from Google Sheets, map your columns, and review
            every record before importing. Existing originals stay untouched.
          </p>
        </div>
      </div>
      {error && (
        <div className="notice error" role="alert">
          {error}
        </div>
      )}
      {message && (
        <div className="notice" role="status">
          <Check size={17} />
          {message}
        </div>
      )}
      <div className="import-steps">
        {["Choose a file", "Map & resolve", "Review & import"].map(
          (name, i) => (
            <span className={step === i ? "active" : ""} key={name}>
              <b>{i + 1}</b>
              {name}
            </span>
          ),
        )}
      </div>
      <section className="panel padded">
        {step === 0 && (
          <>
            <div className="form-grid compact-form">
              <Field label="Archived CSV">
                <select
                  value={options.fileId}
                  onChange={(e) => update({ fileId: e.target.value })}
                >
                  <option value="">Select an archived CSV</option>
                  {csvFiles.map((f) => (
                    <option value={f.id} key={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Column delimiter">
                <select
                  value={options.delimiter}
                  onChange={(e) => update({ delimiter: e.target.value })}
                >
                  <option value=",">Comma</option>
                  <option value=";">Semicolon</option>
                  <option value={"\t"}>Tab</option>
                </select>
              </Field>
            </div>
            <div className="button-row">
              <button
                className="button"
                disabled={busy}
                onClick={() => fileInput.current?.click()}
              >
                <Upload size={15} /> Upload CSV
              </button>
              <button
                className="button primary"
                disabled={busy || !options.fileId}
                onClick={read}
              >
                Read columns <ArrowRight size={15} />
              </button>
            </div>
            <p className="form-note import-hint">
              UTF-8 CSV · up to 2,000 data rows · quoted commas and multiline
              notes supported. The file is archived before parsing.
            </p>
            <input
              className="sr-only"
              type="file"
              accept=".csv"
              ref={fileInput}
              aria-label="Upload history CSV"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file)
                  void run(async () => {
                    if (file.size > 10 * 1024 * 1024)
                      throw Error("Maximum file size is 10 MB.");
                    const result = await upload(file);
                    await onSaved();
                    update({ fileId: result.id });
                    setMessage(
                      "CSV archived. Choose its delimiter, then read columns.",
                    );
                  });
              }}
            />
          </>
        )}
        {step === 1 && table && (
          <>
            <h3>Match your columns</h3>
            <p className="form-note">
              Suggested matches are shown below for review. No rows are saved at
              this stage. A source roast ID lets multiple tasting rows refer to
              the same roast.
            </p>
            <div className="mapping-grid">
              {fieldList.map(([key, label]) => (
                <Field key={key} label={label}>
                  <select
                    value={options.mapping[key] || ""}
                    onChange={(e) =>
                      update({
                        mapping: { ...options.mapping, [key]: e.target.value },
                      })
                    }
                  >
                    <option value="">Not mapped</option>
                    {table.headers.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </Field>
              ))}
            </div>
            <h3 className="subheading">Dates, units & identity</h3>
            <div className="form-grid compact-form">
              <Field label="Dataset name">
                <input
                  value={options.dataset}
                  onChange={(e) => update({ dataset: e.target.value })}
                />
              </Field>
              <Field label="Date format">
                <select
                  value={options.dateFormat}
                  onChange={(e) => update({ dateFormat: e.target.value })}
                >
                  <option value="ISO">
                    ISO · YYYY-MM-DD / timestamp with timezone
                  </option>
                  <option value="DMY">Day / month / year</option>
                  <option value="MDY">Month / day / year</option>
                </select>
              </Field>
              <Field label="UTC offset for dates without a timezone (minutes)">
                <input
                  type="number"
                  step="15"
                  min="-720"
                  max="840"
                  value={options.offsetMinutes}
                  onChange={(e) =>
                    update({ offsetMinutes: Number(e.target.value) })
                  }
                />
              </Field>
              <Field label="Weight unit">
                <select
                  value={options.weightUnit}
                  onChange={(e) => update({ weightUnit: e.target.value })}
                >
                  <option value="g">Grams</option>
                  <option value="kg">Kilograms</option>
                </select>
              </Field>
              <Field label="Time unit (duration and first crack)">
                <select
                  value={options.durationUnit}
                  onChange={(e) => update({ durationUnit: e.target.value })}
                >
                  <option value="seconds">Seconds</option>
                  <option value="minutes">Decimal minutes</option>
                  <option value="mm:ss">Minutes:seconds</option>
                </select>
              </Field>
              <Field label="Decimal separator">
                <select
                  value={options.decimal}
                  onChange={(e) => update({ decimal: e.target.value })}
                >
                  <option value=".">Dot · 86.5</option>
                  <option value=",">Comma · 86,5</option>
                </select>
              </Field>
            </div>
            <p className="form-note">
              Use 60 for UTC+01:00 or 120 for UTC+02:00. The offset is fixed for
              this import; split batches spanning daylight-saving changes or use
              ISO timestamps with explicit offsets. Date-only values are
              interpreted as midnight at the chosen offset. Thousands separators
              are not accepted.
            </p>
            <h3 className="subheading">
              Resolve coffees and profile revisions
            </h3>
            <p className="form-note">
              Choose existing records explicitly. Create missing coffee lots or
              profiles in their library first. Historical imports never consume
              current stock.
            </p>
            <div className="resolution-grid">
              <div>
                {distinct("coffee").map((value) => (
                  <Field key={value} label={`Coffee: ${value || "(all rows)"}`}>
                    <select
                      value={options.coffeeMap[value] || ""}
                      onChange={(e) =>
                        update({
                          coffeeMap: {
                            ...options.coffeeMap,
                            [value]: e.target.value,
                          },
                        })
                      }
                    >
                      <option value="">Choose coffee lot</option>
                      {state.beans.map((b) => (
                        <option value={b.id} key={b.id}>
                          {b.name}
                          {b.demo ? " (sample)" : ""}
                        </option>
                      ))}
                    </select>
                  </Field>
                ))}
              </div>
              <div>
                {distinct("profile").map((value) => (
                  <Field
                    key={value}
                    label={`Profile: ${value || "(all rows)"}`}
                  >
                    <select
                      value={options.profileMap[value] || ""}
                      onChange={(e) =>
                        update({
                          profileMap: {
                            ...options.profileMap,
                            [value]: e.target.value,
                          },
                        })
                      }
                    >
                      <option value="">Choose exact profile revision</option>
                      {state.versions.map((v) => (
                        <option value={v.id} key={v.id}>
                          {v.name} · v{v.number}
                          {v.demo ? " (sample)" : ""}
                        </option>
                      ))}
                    </select>
                  </Field>
                ))}
              </div>
            </div>
            <details className="source-preview">
              <summary>Original data · {table.rows.length} rows</summary>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      {table.headers.map((h) => (
                        <th key={h}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {table.rows.slice(0, 10).map((r) => (
                      <tr key={r.row}>
                        {r.cells.map((c, i) => (
                          <td key={i}>{c}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <small>
                First 10 rows shown. The complete source remains in the archive.
              </small>
            </details>
            <div className="button-row">
              <button
                className="button"
                disabled={busy}
                onClick={() => setStep(0)}
              >
                <ArrowLeft size={15} /> Source file
              </button>
              <button
                className="button primary"
                disabled={busy}
                onClick={makePreview}
              >
                Preview {table.rows.length} rows <ArrowRight size={15} />
              </button>
            </div>
          </>
        )}
        {step === 2 && preview && (
          <>
            <div className="import-counts">
              {Object.entries(preview.counts).map(([k, v]) => (
                <div key={k}>
                  <strong>{v}</strong>
                  <span>{k}</span>
                </div>
              ))}
            </div>
            <p className="notice">
              No inventory changes. Empty tasting scores/attributes remain
              unknown; dates and authors are retained. All included rows must be
              valid before this batch can be saved.
            </p>
            <div className="table-scroll import-preview">
              <table>
                <thead>
                  <tr>
                    <th>Include</th>
                    <th>CSV row</th>
                    <th>Status / roast</th>
                    <th>Converted values</th>
                    <th>Tasting / issue</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map((r) => (
                    <tr key={r.row}>
                      <td>
                        <input
                          type="checkbox"
                          aria-label={`Include CSV row ${r.row}`}
                          checked={!options.excludedRows.includes(r.row)}
                          onChange={(e) =>
                            update({
                              excludedRows: e.target.checked
                                ? options.excludedRows.filter(
                                    (n) => n !== r.row,
                                  )
                                : [...options.excludedRows, r.row],
                            })
                          }
                        />
                      </td>
                      <td>{r.row}</td>
                      <td>
                        <span
                          className={`badge ${r.status === "error" ? "amber" : "green"}`}
                        >
                          {r.status}
                        </span>
                        <small>{r.roast?.name}</small>
                      </td>
                      <td>
                        {r.roast && (
                          <>
                            <span>{r.roast.roastedAt}</span>
                            <small>
                              {r.roast.greenWeight} g → {r.roast.roastedWeight}{" "}
                              g · {r.roast.duration} s · L{r.roast.level}
                            </small>
                          </>
                        )}
                      </td>
                      <td className="wrap-value">
                        {r.error ||
                          (r.tasting &&
                            `${r.tasting.taster} · ${r.tasting.tastedAt} · ${r.tasting.score ?? "No score"}`) ||
                          "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="button-row">
              <button
                className="button"
                disabled={busy}
                onClick={() => setStep(1)}
              >
                <ArrowLeft size={15} /> Adjust mapping
              </button>
              <button className="button" disabled={busy} onClick={makePreview}>
                Refresh preview
              </button>
              <button
                className="button primary"
                disabled={
                  busy ||
                  dirty ||
                  !!preview.counts.error ||
                  !preview.counts.ready
                }
                onClick={() =>
                  run(async () => {
                    const batch = await api<Batch>("/imports/csv/commit", {
                      draftId: preview.draftId,
                    });
                    await onSaved();
                    await loadBatches();
                    setStep(0);
                    setPreview(null);
                    setMessage(
                      `Imported ${batch.records.length} new records. Original files were preserved.`,
                    );
                  })
                }
              >
                Import reviewed batch <Check size={15} />
              </button>
            </div>
            {dirty && (
              <p className="form-note import-hint">
                Selection changed. Refresh the preview to validate it before
                importing.
              </p>
            )}
          </>
        )}
      </section>
      <section className="panel padded import-history">
        <h2>Import history</h2>
        <p className="form-note">
          Rollback removes only unchanged records created by that batch. It is
          blocked if later work depends on them. Original files always remain in
          the archive.
        </p>
        {!batches.length ? (
          <p>No imports yet.</p>
        ) : (
          batches.map((b) => (
            <div className="sync-row" key={b.id}>
              <span>
                <strong>{b.fileName}</strong>
                <small>
                  {b.type} · {new Date(b.createdAt).toLocaleString()} ·{" "}
                  {b.records.length} records · {b.status}
                </small>
              </span>
              <button
                className="button"
                disabled={busy || b.status !== "committed"}
                onClick={() =>
                  run(async () => {
                    await api(`/imports/${b.id}/rollback`, {});
                    await onSaved();
                    await loadBatches();
                    setMessage("Import rolled back. Original file retained.");
                  })
                }
              >
                <Undo2 size={14} /> Roll back
              </button>
            </div>
          ))
        )}
      </section>
    </div>
  );
}
