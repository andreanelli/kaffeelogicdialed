import { useEffect, useRef, useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import { api, upload } from "./api";
import { Chart } from "./Chart";
import type { Bean, Experiment, Roast, State, Version, Point } from "./types";
export type Editor =
  | { type: "roast"; item?: Roast }
  | { type: "bean"; item?: Bean }
  | { type: "profile"; item?: Version }
  | { type: "experiment"; item?: Experiment }
  | { type: "cupping"; roastId?: string };
export function Field({
  label,
  children,
  wide = false,
}: {
  label: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <label className={`field ${wide ? "wide" : ""}`}>
      <span>{label}</span>
      {children}
    </label>
  );
}
const localDate = (iso?: string) => {
  const d = iso ? new Date(iso) : new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
};
export function EditorDialog({
  editor,
  state,
  onClose,
  onSaved,
}: {
  editor: Editor;
  state: State;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [attachment, setAttachment] = useState(
    editor.type === "roast" ? editor.item?.fileId || "" : "",
  );
  const [newFiles, setNewFiles] = useState<{ id: string; name: string }[]>([]);
  const initial = editor.type === "profile" ? editor.item?.points : undefined;
  const [points, setPoints] = useState<Point[]>(
    initial || [
      { time: 0, temperature: 25, fan: 15000 },
      { time: 120, temperature: 140, fan: 14500 },
      { time: 300, temperature: 190, fan: 14000 },
      { time: 540, temperature: 220, fan: 13000 },
    ],
  );
  const [curveText, setCurveText] = useState("");
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  const item = "item" in editor ? editor.item : undefined;
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const f = new FormData(e.currentTarget);
    const s = (k: string) => String(f.get(k) || "");
    const n = (k: string) => Number(f.get(k));
    try {
      if (editor.type === "bean")
        await api(
          `/beans${item ? "/" + item.id : ""}`,
          {
            name: s("name"),
            origin: s("origin"),
            process: s("process"),
            variety: s("variety"),
            stock: String(f.get("stock") ?? "").trim() ? n("stock") : null,
            notes: s("notes"),
          },
          item ? "PUT" : "POST",
        );
      if (editor.type === "experiment")
        await api(
          `/experiments${item ? "/" + item.id : ""}`,
          {
            name: s("name"),
            hypothesis: s("hypothesis"),
            variable: s("variable"),
            status: s("status"),
            conclusion: s("conclusion"),
          },
          item ? "PUT" : "POST",
        );
      if (editor.type === "profile")
        await api(
          `/profiles${editor.item ? "/" + editor.item.profileId + "/versions" : ""}`,
          {
            name: s("name"),
            description: s("description"),
            level: n("level"),
            points,
            changeNote: s("changeNote"),
          },
        );
      if (editor.type === "roast") {
        let parsed: Point[] | null = editor.item?.points || null;
        if (curveText.trim())
          parsed = curveText
            .trim()
            .split("\n")
            .map((line) => {
              const [time, temperature] = line.split(",").map(Number);
              if (!Number.isFinite(time) || !Number.isFinite(temperature))
                throw new Error(
                  "Use time in seconds, temperature in °C on each curve row.",
                );
              return { time, temperature };
            });
        await api(
          `/roasts${item ? "/" + item.id : ""}`,
          {
            name: s("name"),
            beanId: s("beanId"),
            profileVersionId: s("profileVersionId"),
            experimentId: s("experimentId") || null,
            roastedAt: new Date(s("roastedAt")).toISOString(),
            greenWeight: n("greenWeight"),
            roastedWeight: n("roastedWeight"),
            duration: n("duration"),
            firstCrack: s("firstCrack") ? n("firstCrack") : null,
            level: n("level"),
            notes: s("notes"),
            points: parsed,
            fileId: attachment || null,
          },
          item ? "PUT" : "POST",
        );
      }
      if (editor.type === "cupping")
        await api("/cuppings", {
          roastId: s("roastId"),
          taster: s("taster"),
          tastedAt: new Date(s("tastedAt")).toISOString(),
          score: n("score"),
          aroma: n("aroma"),
          acidity: n("acidity"),
          sweetness: n("sweetness"),
          body: n("body"),
          finish: n("finish"),
          notes: s("notes"),
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
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
      className="editor"
    >
      <form onSubmit={submit}>
        <header className="dialog-heading">
          <div>
            <div className="eyebrow">DIALED / LAB NOTEBOOK</div>
            <h2>
              {editor.type === "profile"
                ? item
                  ? "Save a new revision"
                  : "Create a profile"
                : editor.type === "cupping"
                  ? "Record a tasting"
                  : `${item ? "Edit" : "New"} ${editor.type === "bean" ? "coffee lot" : editor.type}`}
            </h2>
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label="Close dialog"
            onClick={onClose}
            disabled={busy}
          >
            <X size={21} />
          </button>
        </header>
        <div className="form-grid">
          {editor.type === "bean" && (
            <>
              <Field label="Coffee name" wide>
                <input
                  name="name"
                  required
                  defaultValue={editor.item?.name}
                  placeholder="e.g. Gesha Village"
                  maxLength={200}
                />
              </Field>
              <Field label="Origin / region">
                <input
                  name="origin"
                  required
                  defaultValue={editor.item?.origin}
                  placeholder="Ethiopia · Bench Maji"
                />
              </Field>
              <Field label="Process">
                <input
                  name="process"
                  required
                  defaultValue={editor.item?.process}
                  placeholder="Natural"
                />
              </Field>
              <Field label="Variety">
                <input name="variety" defaultValue={editor.item?.variety} />
              </Field>
              <Field label="Available green coffee (g)">
                <input
                  name="stock"
                  type="number"
                  min="0"
                  max="1000000"
                  step="0.1"
                  placeholder="Unknown — leave blank"
                  defaultValue={editor.item?.stock ?? ""}
                />
              </Field>
              <Field label="Lot notes" wide>
                <textarea
                  name="notes"
                  defaultValue={editor.item?.notes}
                  placeholder="Producer, harvest, supplier, moisture…"
                />
              </Field>
            </>
          )}
          {editor.type === "experiment" && (
            <>
              <Field label="Experiment name" wide>
                <input
                  name="name"
                  required
                  defaultValue={editor.item?.name}
                  placeholder="Finding the sweet spot"
                />
              </Field>
              <Field label="Hypothesis" wide>
                <textarea
                  name="hypothesis"
                  required
                  defaultValue={editor.item?.hypothesis}
                  placeholder="What do you expect to change in the cup, and why?"
                />
              </Field>
              <Field label="Variable to change">
                <input
                  name="variable"
                  required
                  defaultValue={editor.item?.variable}
                  placeholder="Roast level: 2.1 → 2.4"
                />
              </Field>
              <Field label="Status">
                <select
                  name="status"
                  defaultValue={editor.item?.status || "planned"}
                >
                  <option value="planned">Planned</option>
                  <option value="active">Active</option>
                  <option value="complete">Complete</option>
                </select>
              </Field>
              <Field label="Conclusion" wide>
                <textarea
                  name="conclusion"
                  defaultValue={editor.item?.conclusion}
                  placeholder="What did you learn? What will you try next?"
                />
              </Field>
            </>
          )}
          {editor.type === "profile" && (
            <>
              <p className="form-note wide">
                Dialed research profile. These curves can be versioned,
                compared, and exported as Dialed JSON. Native Kaffelogic
                encoding and hardware validation are still pending.
              </p>
              <Field label="Profile name">
                <input
                  name="name"
                  required
                  defaultValue={editor.item?.name}
                  placeholder="Gentle / filter"
                />
              </Field>
              <Field label="Recommended level">
                <input
                  name="level"
                  type="number"
                  min="0.1"
                  max="5.9"
                  step="0.1"
                  required
                  defaultValue={editor.item?.level || 2.1}
                />
              </Field>
              <Field label="Description" wide>
                <textarea
                  name="description"
                  defaultValue={editor.item?.description}
                />
              </Field>
              <div className="wide">
                <Chart points={points} />
                <div className="point-heading">
                  <span>Time (s)</span>
                  <span>Temperature (°C)</span>
                  <span>Fan (RPM)</span>
                  <span />
                </div>
                <div className="point-list">
                  {points.map((p, i) => (
                    <div className="point-row" key={i}>
                      {(["time", "temperature", "fan"] as const).map((key) => (
                        <input
                          key={key}
                          aria-label={`Point ${i + 1} ${key}`}
                          type="number"
                          min="0"
                          max={
                            key === "time"
                              ? 3600
                              : key === "temperature"
                                ? 350
                                : 30000
                          }
                          step={key === "temperature" ? ".1" : "1"}
                          value={p[key] ?? 0}
                          onChange={(e) =>
                            setPoints(
                              points.map((p, j) =>
                                j === i
                                  ? { ...p, [key]: Number(e.target.value) }
                                  : p,
                              ),
                            )
                          }
                          required
                        />
                      ))}
                      <button
                        type="button"
                        className="icon-button"
                        aria-label={`Remove point ${i + 1}`}
                        disabled={points.length <= 2}
                        onClick={() =>
                          setPoints(points.filter((_, j) => j !== i))
                        }
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  className="text-button"
                  onClick={() =>
                    setPoints([
                      ...points,
                      {
                        time: (points.at(-1)?.time || 0) + 60,
                        temperature: 220,
                        fan: 13000,
                      },
                    ])
                  }
                >
                  <Plus size={15} /> Add point
                </button>
              </div>
              <Field label="Revision note" wide>
                <input
                  name="changeNote"
                  required
                  placeholder="What changed, and why?"
                  defaultValue={item ? "" : "Initial profile"}
                />
              </Field>
            </>
          )}
          {editor.type === "roast" && (
            <>
              <Field label="Roast name" wide>
                <input
                  name="name"
                  required
                  defaultValue={editor.item?.name}
                  placeholder="Gesha, a little sweeter"
                />
              </Field>
              <Field label="Coffee lot">
                <select
                  name="beanId"
                  required
                  defaultValue={editor.item?.beanId || ""}
                >
                  <option value="" disabled>
                    Select coffee
                  </option>
                  {state.beans.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name} ·{" "}
                      {b.stock === null
                        ? "stock unknown"
                        : `${b.stock} g available`}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Profile revision">
                <select
                  name="profileVersionId"
                  required
                  defaultValue={editor.item?.profileVersionId || ""}
                >
                  <option value="" disabled>
                    Select revision
                  </option>
                  {state.versions.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name} · v{v.number}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Roasted at">
                <input
                  name="roastedAt"
                  type="datetime-local"
                  required
                  defaultValue={localDate(editor.item?.roastedAt)}
                />
              </Field>
              <Field label="Roast level">
                <input
                  name="level"
                  type="number"
                  min=".1"
                  max="5.9"
                  step=".1"
                  required
                  defaultValue={editor.item?.level || 2.1}
                />
              </Field>
              <Field label="Green weight (g)">
                <input
                  name="greenWeight"
                  type="number"
                  min=".1"
                  max="1000"
                  step=".1"
                  required
                  defaultValue={editor.item?.greenWeight || 100}
                />
              </Field>
              <Field label="Roasted weight (g)">
                <input
                  name="roastedWeight"
                  type="number"
                  min=".1"
                  max="1000"
                  step=".1"
                  required
                  defaultValue={editor.item?.roastedWeight || 86}
                />
              </Field>
              <Field label="Total roast time (seconds)">
                <input
                  name="duration"
                  type="number"
                  min="1"
                  max="3600"
                  required
                  defaultValue={editor.item?.duration || 540}
                />
              </Field>
              <Field label="First crack (seconds, optional)">
                <input
                  name="firstCrack"
                  type="number"
                  min="1"
                  max="3600"
                  defaultValue={editor.item?.firstCrack ?? ""}
                />
              </Field>
              <Field label="Experiment">
                <select
                  name="experimentId"
                  defaultValue={editor.item?.experimentId || ""}
                >
                  <option value="">Independent roast</option>
                  {state.experiments.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Original log attachment">
                <select
                  name="fileId"
                  value={attachment}
                  onChange={(e) => setAttachment(e.target.value)}
                >
                  <option value="">No file attached</option>
                  {[...state.files, ...newFiles]
                    .filter((f) => /\.(klog|csv|json)$/i.test(f.name))
                    .map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name}
                      </option>
                    ))}
                </select>
              </Field>
              <Field label="Upload a roast log (.klog)" wide>
                <input
                  type="file"
                  accept=".klog"
                  disabled={busy}
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    setBusy(true);
                    setError("");
                    try {
                      const saved = await upload(file);
                      setNewFiles((old) => [
                        ...old.filter((f) => f.id !== saved.id),
                        { id: saved.id, name: file.name },
                      ]);
                      setAttachment(saved.id);
                    } catch (err) {
                      setError((err as Error).message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                />
                <small>
                  Save the roast to attach the uploaded log. Your entered
                  details and tasting history stay with the same run.
                </small>
              </Field>
              <Field label="Roast observations" wide>
                <textarea
                  name="notes"
                  defaultValue={editor.item?.notes}
                  placeholder="Aroma, first crack, adjustments, what to try next…"
                />
              </Field>
              <details className="wide">
                <summary>Optional measured temperature curve</summary>
                <p className="form-note">
                  Paste one time_seconds,temperature_celsius pair per line.
                  Attached Kaffelogic logs provide their measured curves in the
                  run dashboard.{" "}
                  {editor.item?.points
                    ? "Leave blank to retain the existing curve."
                    : ""}
                </p>
                <textarea
                  aria-label="Measured temperature curve"
                  value={curveText}
                  onChange={(e) => setCurveText(e.target.value)}
                  placeholder={"0,25\n120,140\n300,190\n540,220"}
                />
              </details>
            </>
          )}
          {editor.type === "cupping" && (
            <>
              <Field label="Roast" wide>
                <select
                  name="roastId"
                  required
                  defaultValue={editor.roastId || ""}
                >
                  <option value="" disabled>
                    Select a roast or recorded run
                  </option>
                  {state.roasts.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                  {(state.deviceRuns || [])
                    .filter(
                      (run) =>
                        !state.roasts.some(
                          (r) =>
                            r.id === run.roastId ||
                            run.files.some((f) => f.id === r.fileId),
                        ),
                    )
                    .map((run) => (
                      <option key={run.id} value={run.id}>
                        {run.name} · {run.files[0]?.name} ·{" "}
                        {run.roastedAt
                          ? new Date(run.roastedAt).toLocaleDateString()
                          : "Date unknown"}
                        {run.category !== "recorded"
                          ? ` · ${run.category}`
                          : ""}
                      </option>
                    ))}
                </select>
              </Field>
              <Field label="Taster">
                <input name="taster" required placeholder="Your name" />
              </Field>
              <Field label="Tasted at">
                <input
                  name="tastedAt"
                  type="datetime-local"
                  required
                  defaultValue={localDate()}
                />
              </Field>
              <Field label="Overall score / 100">
                <input
                  name="score"
                  type="number"
                  min="0"
                  max="100"
                  step=".25"
                  defaultValue="85"
                  required
                />
              </Field>
              {["aroma", "acidity", "sweetness", "body", "finish"].map((k) => (
                <Field
                  key={k}
                  label={`${k[0].toUpperCase() + k.slice(1)} / 10`}
                >
                  <input
                    name={k}
                    type="number"
                    min="0"
                    max="10"
                    step=".25"
                    defaultValue="8"
                    required
                  />
                </Field>
              ))}
              <Field label="In the cup" wide>
                <textarea
                  name="notes"
                  placeholder="Flavours, texture, brew recipe, rest time, and your next adjustment…"
                />
              </Field>
              <p className="form-note wide">
                A personal tasting rubric. Overall score is entered
                independently of the five attributes.
              </p>
            </>
          )}
        </div>
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        <footer className="dialog-footer">
          <button
            className="button"
            type="button"
            disabled={busy}
            onClick={onClose}
          >
            Cancel
          </button>
          <button className="button primary" type="submit" disabled={busy}>
            {busy
              ? "Saving…"
              : editor.type === "profile"
                ? "Save revision"
                : "Save to notebook"}
          </button>
        </footer>
      </form>
    </dialog>
  );
}
