import { useState } from "react";
import type { DeviceRun, Roast } from "./types";
import { clock } from "./Chart";
export function RunHistory({
  runs,
  roasts,
  onInspect,
  onTaste,
  onEdit,
}: {
  runs: DeviceRun[];
  roasts: Roast[];
  onInspect: (id: string) => void;
  onTaste: (id: string) => void;
  onEdit: (roast: Roast) => void;
}) {
  const [category, setCategory] = useState("recorded");
  if (!runs.length) return null;
  const rows = runs
    .filter((r) => category === "all" || r.category === category)
    .sort((a, b) => (b.roastedAt || "").localeCompare(a.roastedAt || ""));
  return (
    <section className="panel journal-list" style={{ marginBottom: 24 }}>
      <div className="section-heading">
        <h2>
          Recorded device runs <span className="count">{runs.length}</span>
        </h2>
      </div>
      <p className="form-note" style={{ padding: "0 24px" }}>
        Manual entries and archived roast logs. Add details or attach a log to a
        manual entry at any time. Coffee assignments and actual weights remain
        unconfirmed until supplied. Short runs are under 60 seconds; incomplete
        runs have no recorded end. Alternate files from the same recorded
        session stay grouped and preserved.
      </p>
      <div className="table-toolbar">
        <div className="tabs" aria-label="Filter device runs">
          {[
            ["recorded", "Recorded roasts"],
            ["short", "Short runs"],
            ["incomplete", "Incomplete logs"],
            ["all", "All runs"],
          ].map(([v, l]) => (
            <button
              key={v}
              className={category === v ? "active" : ""}
              onClick={() => setCategory(v)}
            >
              {l} · {runs.filter((r) => v === "all" || r.category === v).length}
            </button>
          ))}
        </div>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Run / source</th>
              <th>Date</th>
              <th>Duration / level</th>
              <th>Notebook details</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const linked = roasts.find(
                (roast) =>
                  roast.id === r.roastId ||
                  r.files.some((f) => f.id === roast.fileId),
              );
              return (
                <tr key={r.id}>
                  <td>
                    <strong>{r.name}</strong>
                    <small className="muted" style={{ display: "block" }}>
                      {r.files.map((f) => f.name).join(" · ") ||
                        "Manual entry · log not attached"}
                    </small>
                  </td>
                  <td>
                    {r.roastedAt
                      ? new Date(r.roastedAt).toLocaleString()
                      : "Date unknown"}
                  </td>
                  <td>
                    {r.duration === null ? "No end event" : clock(r.duration)}
                    <small className="muted" style={{ display: "block" }}>
                      Level {r.level ?? "unknown"}
                    </small>
                  </td>
                  <td>
                    {linked
                      ? "Logged in notebook"
                      : "Coffee & weights unconfirmed"}
                  </td>
                  <td>
                    {r.sourceFileId && (
                      <button
                        className="button"
                        onClick={() => onInspect(r.sourceFileId!)}
                      >
                        {linked ? "View dashboard" : "View roast"}
                      </button>
                    )}
                    {linked && (
                      <button className="button" onClick={() => onEdit(linked)}>
                        {r.sourceFileId ? "Edit details" : "Add details / log"}
                      </button>
                    )}
                    <button
                      className="button"
                      onClick={() => onTaste(linked?.id || r.id)}
                    >
                      Record tasting
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
