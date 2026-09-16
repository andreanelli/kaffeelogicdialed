import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { api } from "./api";
type Entry = {
  id: string;
  kind: string;
  name: string;
  createdAt: string;
  detail?: string;
};
const labels: Record<string, string> = {
  bean: "Green coffee",
  profile: "Profile",
  version: "Profile revision",
  roast: "Roast",
  deviceRun: "Recorded run",
  experiment: "Experiment",
  cupping: "Cupping",
  file: "Original file",
  deviceProfile: "Simulator profile",
  syncJob: "Sync history",
};
export function RecordManager({ onSaved }: { onSaved: () => Promise<void> }) {
  const [entries, setEntries] = useState<Entry[]>([]),
    [kind, setKind] = useState("all"),
    [search, setSearch] = useState(""),
    [selected, setSelected] = useState<Entry | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const load = () => api<Entry[]>("/records").then(setEntries);
  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);
  async function remove() {
    if (!selected) return;
    setBusy(true);
    setError("");
    try {
      await api(
        `/records/${selected.kind}/${selected.id}`,
        undefined,
        "DELETE",
      );
      setMessage(`Deleted ${selected.name}.`);
      setSelected(null);
      await onSaved();
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel padded">
      <h2>Manage your notebook</h2>
      <p>
        Delete individual entries here. Linked records must be deleted or
        unlinked first. Deleting a profile also deletes its unused revisions.
        Deleting a roast restores only the stock originally deducted; original
        files stay in the archive unless deleted separately.
      </p>
      {message && (
        <p role="status" className="notice">
          {message}
        </p>
      )}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      {selected && (
        <section className="notice" aria-label="Confirm deletion">
          <h3>Delete “{selected.name}”?</h3>
          <p>
            This permanently removes this {labels[selected.kind].toLowerCase()}
            {selected.kind === "profile" ? " and its unused revisions" : ""}.
            Export a workspace backup first if you want a copy.
          </p>
          <div className="button-row">
            <button
              className="button"
              disabled={busy}
              onClick={() => {
                setSelected(null);
                setError("");
              }}
            >
              Cancel deletion
            </button>
            <button className="button primary" disabled={busy} onClick={remove}>
              {busy ? "Deleting…" : "Delete permanently"}
            </button>
          </div>
        </section>
      )}
      <div className="table-toolbar">
        <label>
          Category
          <select value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="all">All entries</option>
            {Object.entries(labels).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Search entries
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Name or ID"
          />
        </label>
        <a className="button" href="/api/backup">
          Export backup
        </a>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Entry</th>
              <th>Category</th>
              <th>Date</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {entries
              .filter(
                (e) =>
                  (kind === "all" || kind === e.kind) &&
                  `${e.name} ${e.id}`
                    .toLowerCase()
                    .includes(search.toLowerCase()),
              )
              .map((e) => (
                <tr key={`${e.kind}-${e.id}`}>
                  <td>
                    <strong>{e.name}</strong>
                    <small className="muted" style={{ display: "block" }}>
                      {e.id}
                    </small>
                  </td>
                  <td>{labels[e.kind]}</td>
                  <td>
                    {new Date(e.detail || e.createdAt).toLocaleDateString()}
                  </td>
                  <td>
                    <button
                      className="button"
                      disabled={busy}
                      onClick={() => {
                        setSelected(e);
                        setError("");
                        setMessage("");
                      }}
                      aria-label={`Delete ${labels[e.kind]} ${e.name}`}
                    >
                      <Trash2 size={14} /> Delete
                    </button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
