import { RoastDashboard } from "./RoastDashboard";
import { useEffect, useRef, useState } from "react";
import { Download, X, FileCheck2 } from "lucide-react";
import { api } from "./api";
import { Chart } from "./Chart";
import { Field } from "./Forms";
import type { Point, State, Version } from "./types";
export type NativeDocument = {
  codecVersion: string;
  kind: string;
  status: string;
  sha256: string;
  diagnostics: string[];
  canEdit: boolean;
  timingNote?: string;
  metadata: { key: string; value: string; line: number }[];
  events: { key: string; value: string; line: number }[];
  channels: {
    key: string;
    label: string;
    unit: string;
    index: number;
    recordedOffset: number | null;
  }[];
  rows: (number | null)[][];
  curves: Record<
    string,
    {
      points: Point[];
      nodes: {
        time: number;
        value: number;
        inTime: number;
        inValue: number;
        outTime: number;
        outValue: number;
      }[];
    }
  >;
  summary: {
    name?: string;
    description?: string;
    profileSchema?: string;
    logSchema?: string;
    firmware?: string;
    roastedAt?: string | null;
    endedAt?: string | null;
    duration?: number | null;
    firstCrack?: number | null;
    level?: number | null;
    recommendedLevel?: number | null;
  };
};
function Modal({
  title,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      className={`editor import-dialog ${wide ? "roast-analysis-dialog" : ""}`}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <header className="dialog-heading">
        <div>
          <div className="eyebrow">DIALED / NATIVE FILE WORKBENCH</div>
          <h2>{title}</h2>
        </div>
        <button
          className="icon-button"
          aria-label="Close native workbench"
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </header>
      {children}
    </dialog>
  );
}
const localInput = (iso?: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  return new Date(+d - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 19);
};
export function NativeInspector({
  fileId,
  state,
  onClose,
  onSaved,
}: {
  fileId: string;
  state: State;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [doc, setDoc] = useState<NativeDocument | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [tab, setTab] = useState("overview");
  useEffect(() => {
    api<NativeDocument>(`/files/${fileId}/inspect`)
      .then(setDoc)
      .catch((e) => setError(e.message));
  }, [fileId]);
  const file = state.files.find((f) => f.id === fileId);
  async function save(e?: React.FormEvent<HTMLFormElement>) {
    e?.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (doc?.kind === "profile")
        await api("/imports/native-profile", { fileId });
      else {
        const f = new FormData(e!.currentTarget);
        const s = (k: string) => String(f.get(k) || "");
        await api("/imports/native-log", {
          fileId,
          fields: {
            name: s("name"),
            beanId: s("beanId"),
            roastedAt: new Date(s("roastedAt")).toISOString(),
            greenWeight: Number(s("greenWeight")),
            roastedWeight: Number(s("roastedWeight")),
            duration: Number(s("duration")),
            firstCrack: s("firstCrack") ? Number(s("firstCrack")) : null,
            level: Number(s("level")),
            notes: s("notes"),
          },
        });
      }
      await onSaved();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      wide={doc?.kind === "log"}
      title={file?.name || "Native file"}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <div className="native-body">
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        {!doc ? (
          <p>Reading original file…</p>
        ) : (
          <>
            <div className="button-row">
              <span
                className={`badge ${doc.status === "supported" ? "green" : "amber"}`}
              >
                {doc.status}
              </span>
              <span className="mono muted">
                {doc.kind} · profile schema{" "}
                {doc.summary.profileSchema || "unknown"}
                {doc.summary.logSchema ? ` / log ${doc.summary.logSchema}` : ""}
              </span>
              <a className="text-button" href={`/api/files/${fileId}/download`}>
                <Download size={14} /> Original
              </a>
            </div>
            {doc.diagnostics.length > 0 && (
              <div className="notice">
                <ul>
                  {doc.diagnostics.map((d, i) => (
                    <li key={i}>{d}</li>
                  ))}
                </ul>
              </div>
            )}
            <div className="tabs import-tabs">
              {["overview", "settings", "events", "import"].map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={tab === t ? "active" : ""}
                >
                  {t === "import"
                    ? "Add to notebook"
                    : t === "overview" && doc.kind === "log"
                      ? "Dashboard"
                      : t}
                </button>
              ))}
            </div>
            {tab === "overview" && (
              <>
                {doc.kind !== "log" && <h2>{doc.summary.name}</h2>}
                <p className="preserve-lines">{doc.summary.description}</p>
                {doc.kind === "log" ? (
                  <RoastDashboard doc={doc} />
                ) : (
                  doc.curves.roast_profile && (
                    <>
                      <h3>Native temperature curve · Bézier</h3>
                      <Chart points={doc.curves.roast_profile.points} />
                      <p className="form-note">
                        The native anchor and handle geometry is preserved. The
                        display samples the curve for plotting.
                      </p>
                    </>
                  )
                )}
                <dl className="native-facts">
                  <div>
                    <dt>Codec</dt>
                    <dd>{doc.codecVersion}</dd>
                  </div>
                  <div>
                    <dt>Firmware recorded</dt>
                    <dd>{doc.summary.firmware || "Not recorded"}</dd>
                  </div>
                  <div>
                    <dt>Roast start (UTC)</dt>
                    <dd>{doc.summary.roastedAt || "Not recorded"}</dd>
                  </div>
                  <div>
                    <dt>End-date event (UTC)</dt>
                    <dd>{doc.summary.endedAt || "Not recorded"}</dd>
                  </div>
                  <div>
                    <dt>Original checksum</dt>
                    <dd className="checksum">{doc.sha256}</dd>
                  </div>
                </dl>
              </>
            )}
            {tab === "settings" && (
              <>
                <p className="form-note">
                  Every metadata field is retained verbatim, including unknown
                  settings. Log and profile fields are kept separately from
                  event markers.
                </p>
                <div className="table-scroll native-metadata">
                  <table>
                    <thead>
                      <tr>
                        <th>Native key</th>
                        <th>Original value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {doc.metadata.map((m, i) => (
                        <tr key={i}>
                          <td>{m.key}</td>
                          <td className="wrap-value">{m.value}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
            {tab === "events" && (
              <>
                <p className="form-note">
                  Event values are shown as recorded. A later roast_date event
                  never replaces the start date.
                </p>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Event</th>
                        <th>Value</th>
                        <th>Line</th>
                      </tr>
                    </thead>
                    <tbody>
                      {doc.events.map((m, i) => (
                        <tr key={i}>
                          <td>{m.key}</td>
                          <td>{m.value}</td>
                          <td>{m.line}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {!doc.events.length && <p>No event markers in this file.</p>}
              </>
            )}
            {tab === "import" &&
              (doc.kind === "profile" ? (
                <>
                  <h3>Add this native profile</h3>
                  <p>
                    The original bytes, all settings, Bézier handles, schema
                    version, and provenance stay attached to revision 1.
                    Reimporting the same file won’t duplicate the profile.
                  </p>
                  <button
                    className="button primary"
                    disabled={busy || !doc.canEdit}
                    onClick={() => save()}
                  >
                    <FileCheck2 size={16} />
                    {busy ? "Importing…" : "Import native profile"}
                  </button>
                </>
              ) : doc.kind === "log" && doc.status !== "unsupported" ? (
                <form onSubmit={save}>
                  <p className="notice">
                    Historical import — current green stock will not change.
                    Verify dates and timing; enter actual batch weights. An
                    exact embedded profile snapshot will be linked
                    automatically.
                  </p>
                  <div className="form-grid compact-form">
                    <Field label="Roast name" wide>
                      <input
                        name="name"
                        required
                        defaultValue={`${doc.summary.name} / ${file?.name}`}
                      />
                    </Field>
                    <Field label="Coffee lot">
                      <select name="beanId" required defaultValue="">
                        <option value="" disabled>
                          Choose an existing lot
                        </option>
                        {state.beans.map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.name}
                            {b.demo ? " (sample)" : ""}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Roast start (your local time)">
                      <input
                        name="roastedAt"
                        type="datetime-local"
                        step="1"
                        required
                        defaultValue={localInput(doc.summary.roastedAt)}
                      />
                    </Field>
                    <Field label="Green weight (g)">
                      <input
                        name="greenWeight"
                        type="number"
                        min=".1"
                        step=".1"
                        max="1000"
                        required
                      />
                    </Field>
                    <Field label="Roasted weight (g)">
                      <input
                        name="roastedWeight"
                        type="number"
                        min=".1"
                        step=".1"
                        max="1000"
                        required
                      />
                    </Field>
                    <Field label="Roast duration (seconds)">
                      <input
                        name="duration"
                        type="number"
                        min=".001"
                        step="any"
                        max="3600"
                        required
                        defaultValue={doc.summary.duration ?? ""}
                      />
                    </Field>
                    <Field label="First crack (seconds)">
                      <input
                        name="firstCrack"
                        type="number"
                        min=".001"
                        step="any"
                        defaultValue={doc.summary.firstCrack ?? ""}
                      />
                    </Field>
                    <Field label="Roast level">
                      <input
                        name="level"
                        type="number"
                        min=".1"
                        step=".1"
                        max="5.9"
                        required
                        defaultValue={doc.summary.level ?? ""}
                      />
                    </Field>
                    <Field label="Observations" wide>
                      <textarea name="notes" />
                    </Field>
                  </div>
                  <button
                    className="button primary"
                    disabled={busy || !state.beans.length}
                  >
                    {busy ? "Importing…" : "Import historical roast"}
                  </button>
                  {!state.beans.length && <p>Create a coffee lot first.</p>}
                </form>
              ) : (
                <p>
                  This file cannot be imported into the notebook. Its original
                  bytes remain archived.
                </p>
              ))}
          </>
        )}
      </div>
    </Modal>
  );
}
const numericKeys = [
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
];
export function NativeEditor({
  version,
  onClose,
  onSaved,
}: {
  version: Version;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [doc, setDoc] = useState<NativeDocument | null>(null),
    [values, setValues] = useState<Record<string, string>>({}),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    api<NativeDocument>(`/versions/${version.id}/native`)
      .then((d) => {
        setDoc(d);
        setValues(Object.fromEntries(d.metadata.map((m) => [m.key, m.value])));
      })
      .catch((e) => setError(e.message));
  }, [version.id]);
  const change = (k: string, v: string) =>
    setValues((old) => ({ ...old, [k]: v }));
  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const note = String(new FormData(e.currentTarget).get("changeNote") || "");
    try {
      const patch = Object.fromEntries(
        Object.entries(values).filter(
          ([k, v]) => v !== doc?.metadata.find((m) => m.key === k)?.value,
        ),
      );
      await api(`/versions/${version.id}/native-revision`, {
        patch,
        changeNote: note,
      });
      await onSaved();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={`Native revision · ${version.name}`}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form onSubmit={save}>
        <div className="native-body">
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          {!doc ? (
            <p>Loading native settings…</p>
          ) : (
            <>
              <p className="notice">
                Edits create a new revision. Unedited bytes, unknown fields, and
                native curve handles are retained. Native exports still require
                verification in Studio before use on the roaster.
              </p>
              <div className="form-grid compact-form">
                {["profile_short_name", "profile_designer"]
                  .filter((k) => k in values)
                  .map((k) => (
                    <Field key={k} label={k.replaceAll("_", " ")}>
                      <input
                        required
                        maxLength={k === "profile_short_name" ? 30 : 200}
                        value={values[k]}
                        onChange={(e) => change(k, e.target.value)}
                      />
                    </Field>
                  ))}
                {"profile_description" in values && (
                  <Field label="Profile description" wide>
                    <textarea
                      value={values.profile_description.replace(/\\v/g, "\n")}
                      onChange={(e) =>
                        change(
                          "profile_description",
                          e.target.value.replace(/\n/g, "\\v"),
                        )
                      }
                    />
                  </Field>
                )}
                {numericKeys
                  .filter((k) => k in values)
                  .map((k) => (
                    <Field key={k} label={k.replaceAll("_", " ")}>
                      <input
                        type="number"
                        step="any"
                        required
                        value={values[k]}
                        onChange={(e) => change(k, e.target.value)}
                      />
                    </Field>
                  ))}
              </div>
              {["roast_profile", "fan_profile"].map((k) => (
                <details key={k} className="native-curve-edit">
                  <summary>
                    {k === "roast_profile" ? "Temperature" : "Fan"} Bézier
                    anchors & handles
                  </summary>
                  <p className="form-note">
                    Each group is anchor time/value, incoming-handle time/value,
                    outgoing-handle time/value. Times are seconds; values are{" "}
                    {k === "roast_profile" ? "°C" : "RPM"}. Edit the original
                    geometry directly.
                  </p>
                  <textarea
                    aria-label={`${k} Bézier data`}
                    rows={6}
                    value={values[k] || ""}
                    onChange={(e) => change(k, e.target.value)}
                  />
                </details>
              ))}
              <Field label="Revision note" wide>
                <input
                  name="changeNote"
                  required
                  placeholder="What changed, and why?"
                />
              </Field>
            </>
          )}
        </div>
        <footer className="dialog-footer">
          <button
            className="button"
            type="button"
            disabled={busy}
            onClick={onClose}
          >
            Cancel
          </button>
          <button className="button primary" disabled={busy || !doc?.canEdit}>
            {busy ? "Saving…" : "Save native revision"}
          </button>
        </footer>
      </form>
    </Modal>
  );
}
