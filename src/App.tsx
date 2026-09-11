import HistoryImporter from "./HistoryImporter";
import { NativeInspector, NativeEditor } from "./NativeFiles";
import { useEffect, useRef, useState } from "react";
import {
  Activity,
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  Beaker,
  BookOpen,
  Check,
  ChevronRight,
  Coffee,
  Download,
  FileArchive,
  FileSpreadsheet,
  FlaskConical,
  Leaf,
  Loader2,
  Plus,
  Search,
  Settings2,
  SlidersHorizontal,
  Upload,
  Usb,
  X,
} from "lucide-react";
import { api, upload } from "./api";
import { Chart, clock } from "./Chart";
import { EditorDialog, type Editor } from "./Forms";
import type { Device, Roast, State, Version } from "./types";
const pages = [
  { id: "journal", label: "Roast journal", icon: BookOpen },
  { id: "profiles", label: "Profiles", icon: SlidersHorizontal },
  { id: "experiments", label: "Experiments", icon: FlaskConical },
  { id: "cupping", label: "Cupping table", icon: Coffee },
  { id: "beans", label: "Green coffee", icon: Leaf },
  { id: "archive", label: "File archive", icon: FileArchive },
  { id: "imports", label: "Import history", icon: FileSpreadsheet },
] as const;
type Page = (typeof pages)[number]["id"] | "device" | "settings";
const empty: State = {
  beans: [],
  profiles: [],
  versions: [],
  roasts: [],
  cuppings: [],
  experiments: [],
  files: [],
};
const date = (d: string) =>
  new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
const fullDate = (d: string) =>
  new Date(d).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
const mean = (values: (number | null)[]) => {
  const known = values.filter((v): v is number => v !== null);
  return known.length ? known.reduce((a, b) => a + b, 0) / known.length : null;
};
function Badge({
  children,
  tone = "",
}: {
  children: React.ReactNode;
  tone?: string;
}) {
  return <span className={`badge ${tone}`}>{children}</span>;
}
function Empty({
  title,
  children,
  action,
}: {
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="empty-state">
      <Beaker size={29} strokeWidth={1.2} />
      <h3>{title}</h3>
      <p>{children}</p>
      {action}
    </div>
  );
}
export default function App() {
  const [state, setState] = useState<State>(empty);
  const [device, setDevice] = useState<Device | null>(null);
  const [page, setPage] = useState<Page>("journal");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");
  const [error, setError] = useState("");
  const [inspectedFile, setInspectedFile] = useState<string | null>(null);
  const [nativeVersion, setNativeVersion] = useState<Version | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [selected, setSelected] = useState<string | null>(null);
  const [compare, setCompare] = useState("");
  const [profileId, setProfileId] = useState("");
  const [versionId, setVersionId] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const refresh = async () => {
    const [s, d] = await Promise.all([
      api<State>("/state"),
      api<Device>("/device"),
    ]);
    setState(s);
    setDevice(d);
    setLoadError("");
  };
  useEffect(() => {
    refresh()
      .catch((e) => setLoadError(e.message))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 4500);
    return () => clearTimeout(timer);
  }, [toast]);
  const run = async (fn: () => Promise<unknown>, message: string) => {
    setBusy(true);
    setError("");
    try {
      await fn();
      await refresh();
      setToast(message);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const navigate = (p: Page) => {
    setPage(p);
    setSearch("");
    setFilter("all");
    setSelected(null);
    setCompare("");
  };
  const bean = (r: Roast) => state.beans.find((b) => b.id === r.beanId);
  const version = (r: Roast) =>
    state.versions.find((v) => v.id === r.profileVersionId);
  const cups = (r: Roast) => state.cuppings.filter((c) => c.roastId === r.id);
  const score = (r: Roast) => mean(cups(r).map((c) => c.score));
  const roasts = [...state.roasts].sort((a, b) =>
    b.roastedAt.localeCompare(a.roastedAt),
  );
  const filtered = roasts.filter(
    (r) =>
      (filter !== "uncupped" || !cups(r).length) &&
      (filter !== "cupped" || !!cups(r).length) &&
      `${r.name} ${bean(r)?.name} ${bean(r)?.origin}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const featured = state.roasts.find((r) => r.id === selected) || roasts[0];
  const comparison = state.roasts.find((r) => r.id === compare);
  const chosenProfile =
    state.profiles.find((p) => p.id === profileId) || state.profiles[0];
  const revisions = state.versions
    .filter((v) => v.profileId === chosenProfile?.id)
    .sort((a, b) => b.number - a.number);
  const chosenVersion =
    revisions.find((v) => v.id === versionId) || revisions[0];
  const pending = roasts.filter((r) => !cups(r).length);
  const average = mean(state.cuppings.map((c) => c.score));
  const hasDemo = [
    ...state.beans,
    ...state.profiles,
    ...state.roasts,
    ...state.experiments,
    ...state.cuppings,
  ].some((record) => record.demo);
  const title =
    pages.find((p) => p.id === page)?.label ||
    (page === "device" ? "Device & sync" : "Workspace");
  const actionLabel = (
    {
      journal: "Log a roast",
      profiles: "New profile",
      experiments: "New experiment",
      cupping: "Record a tasting",
      beans: "Add coffee",
      archive: "Import files",
    } as Record<string, string>
  )[page];
  const add = () => {
    if (page === "archive") fileInput.current?.click();
    else
      setEditor({
        type: (
          {
            journal: "roast",
            profiles: "profile",
            experiments: "experiment",
            cupping: "cupping",
            beans: "bean",
          } as Record<string, Editor["type"]>
        )[page],
      } as Editor);
  };
  async function importFiles(files: FileList | null) {
    if (!files) return;
    const list = Array.from(files);
    await run(async () => {
      let duplicates = 0;
      const failures: string[] = [];
      for (const file of list) {
        try {
          if (file.size > 10 * 1024 * 1024)
            throw new Error("Maximum 10 MB per file");
          const result = await upload(file);
          if (result.duplicate) duplicates++;
        } catch (e) {
          failures.push(`${file.name}: ${(e as Error).message}`);
        }
      }
      if (failures.length)
        throw new Error(
          `${list.length - failures.length} archived or already present. ${failures.join("; ")}`,
        );
      setToast(
        `${list.length - duplicates} files archived, ${duplicates} already present.`,
      );
    }, "File archive updated.");
    await refresh();
  }
  function RoastTable({ rows }: { rows: Roast[] }) {
    return (
      <div className="table-scroll">
        <table className="roast-table">
          <thead>
            <tr>
              <th>Roast / coffee</th>
              <th>Date</th>
              <th>Profile</th>
              <th>Batch</th>
              <th>In the cup</th>
              <th>
                <span className="sr-only">Open</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className={selected === r.id ? "selected" : ""}>
                <td>
                  <button
                    className="roast-link"
                    onClick={() => {
                      setSelected(r.id);
                      setCompare("");
                    }}
                  >
                    <span
                      className={`bean-mark tone-${
                        Math.max(
                          0,
                          state.beans.findIndex((b) => b.id === r.beanId),
                        ) % 3
                      }`}
                    >
                      <span />
                    </span>
                    <span>
                      <strong>{r.name}</strong>
                      <small>
                        {bean(r)?.name || "Unknown coffee"} · {bean(r)?.process}
                      </small>
                    </span>
                  </button>
                </td>
                <td className="mono muted">{date(r.roastedAt)}</td>
                <td>
                  {version(r)?.name}
                  <small className="muted">
                    v{version(r)?.number} · level {r.level.toFixed(1)}
                  </small>
                </td>
                <td className="mono">
                  {r.greenWeight} <span className="muted">g</span>
                </td>
                <td>
                  {score(r) !== null ? (
                    <span className="score">
                      {score(r)!.toFixed(1)} <small>/ 100</small>
                    </span>
                  ) : cups(r).length ? (
                    <Badge>Tasted · no score</Badge>
                  ) : (
                    <button
                      className="badge amber"
                      onClick={() =>
                        setEditor({ type: "cupping", roastId: r.id })
                      }
                    >
                      Awaiting tasting
                    </button>
                  )}
                </td>
                <td>
                  <button
                    className="icon-button"
                    aria-label={`View ${r.name}`}
                    onClick={() => {
                      setSelected(r.id);
                      setCompare("");
                    }}
                  >
                    <ArrowUpRight size={17} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  const profileActions = (v: Version) => (
    <div className="button-row">
      {v.native?.kind === "log" ? (
        <button
          className="button"
          onClick={() => setInspectedFile(v.sourceFileId!)}
        >
          Inspect source log
        </button>
      ) : (
        <button
          className="button primary"
          onClick={() =>
            v.native
              ? setNativeVersion(v)
              : setEditor({ type: "profile", item: v })
          }
        >
          <SlidersHorizontal size={15} /> Edit as new revision
        </button>
      )}
      {v.native?.kind === "profile" && (
        <a
          className="button"
          href={`/api/versions/${v.id}/native-export`}
          download
        >
          <Download size={15} /> Export for Studio review
        </a>
      )}
      {!v.native && (
        <a className="button" href={`/api/versions/${v.id}/export`} download>
          <Download size={15} /> Export JSON
        </a>
      )}
    </div>
  );
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a
          href="#"
          className="brand"
          onClick={(e) => {
            e.preventDefault();
            navigate("journal");
          }}
        >
          dialed<span className="brand-dot">●</span>
          <span className="brand-line">THE HOME ROASTING LAB</span>
        </a>
        <div className="workspace-label">
          <span className="workspace-monogram">d.</span>
          <span>
            Dialed workspace<small>Personal roast lab</small>
          </span>
        </div>
        <div className="nav-caption">THE NOTEBOOK</div>
        <nav aria-label="Main navigation">
          {pages.map((p) => (
            <button
              key={p.id}
              className={`nav-item ${page === p.id ? "active" : ""}`}
              aria-current={page === p.id ? "page" : undefined}
              onClick={() => navigate(p.id)}
            >
              <p.icon size={18} strokeWidth={1.7} />
              {p.label}
              {p.id === "cupping" && pending.length > 0 && (
                <span className="nav-count">{pending.length}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <button
            className={`nav-item ${page === "device" ? "active" : ""}`}
            onClick={() => navigate("device")}
          >
            <Usb size={18} />
            Device & sync
          </button>
          <button
            className={`nav-item ${page === "settings" ? "active" : ""}`}
            onClick={() => navigate("settings")}
          >
            <Settings2 size={18} />
            Workspace
          </button>
          <div className="machine-status">
            <span
              className={`status-dot ${device?.connected ? "green" : ""}`}
            />
            <span>
              Nano 7
              <small>
                {device?.connected
                  ? "Simulator connected"
                  : "Hardware not connected"}
              </small>
            </span>
            <ChevronRight size={15} />
          </div>
          <div className="sidebar-foot">SMALL BATCHES. BETTER QUESTIONS.</div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            Workspace <ChevronRight size={13} /> <span>{title}</span>
          </div>
          <div className="topbar-right">
            <span className="local-indicator">
              <span className="status-dot green" /> Local workspace
            </span>
            <span className="avatar">D.</span>
          </div>
        </header>
        <main>
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                DIALED /{" "}
                {page === "journal"
                  ? "THE ROASTING NOTEBOOK"
                  : title.toUpperCase()}
              </div>
              <h1>
                {page === "journal" ? "Good coffee is a process." : title}
              </h1>
              <p>
                {
                  (
                    {
                      journal:
                        "Every roast, every adjustment, every little discovery. In one place.",
                      profiles:
                        "A library of ideas. A clear history of every adjustment.",
                      experiments:
                        "Change one thing. Taste carefully. Keep what you learn.",
                      cupping: "The roast is only half the story.",
                      beans: "Know your coffee, from the first green bean.",
                      archive: "Original files, safely kept and always yours.",
                      imports:
                        "Your old notebook, with a clear path into the new one.",
                      device: "Your notebook meets your Nano 7.",
                      settings: "A little housekeeping for your roasting lab.",
                    } as Record<Page, string>
                  )[page]
                }
              </p>
            </div>
            {actionLabel && (
              <button className="button primary" onClick={add} disabled={busy}>
                <Plus size={17} />
                {actionLabel}
              </button>
            )}
          </div>
          {error && (
            <div role="alert" className="notice error">
              <span>{error}</span>
              <button
                aria-label="Dismiss error"
                className="icon-button"
                onClick={() => setError("")}
              >
                <X size={16} />
              </button>
            </div>
          )}
          {hasDemo && (
            <div className="sample-banner">
              <span>
                <Beaker size={15} /> You’re exploring sample data. Sample
                records are labeled in your notebook.
              </span>
              <button
                className="text-button"
                onClick={() => navigate("settings")}
              >
                Manage sample data <ArrowRight size={14} />
              </button>
            </div>
          )}
          {loading ? (
            <Empty title="Opening your notebook…">
              <Loader2 className="spinner" />
            </Empty>
          ) : loadError ? (
            <Empty
              title="The notebook couldn’t connect"
              action={
                <button
                  className="button"
                  onClick={() => run(refresh, "Connected.")}
                >
                  Try again
                </button>
              }
            >
              {loadError} · Start the backend with npm run dev.
            </Empty>
          ) : (
            <>
              {page === "journal" && (
                <>
                  <div className="stats-row">
                    <div>
                      <span className="stat-label">ROASTS LOGGED</span>
                      <strong>
                        {String(roasts.length).padStart(2, "0")}
                        <BookOpen size={18} />
                      </strong>
                      <small>
                        {(
                          roasts.reduce((a, r) => a + r.greenWeight, 0) / 1000
                        ).toFixed(2)}{" "}
                        kg of green coffee explored
                      </small>
                    </div>
                    <div>
                      <span className="stat-label">ACTIVE EXPERIMENTS</span>
                      <strong>
                        {String(
                          state.experiments.filter((e) => e.status === "active")
                            .length,
                        ).padStart(2, "0")}
                        <FlaskConical size={18} />
                      </strong>
                      <small>One variable at a time</small>
                    </div>
                    <div>
                      <span className="stat-label">AVERAGE CUP SCORE</span>
                      <strong>
                        {average?.toFixed(1) || "—"}
                        <Coffee size={18} />
                      </strong>
                      <small>{state.cuppings.length} recorded tastings</small>
                    </div>
                    <div>
                      <span className="stat-label">READY FOR THE CUP</span>
                      <strong>
                        {String(pending.length).padStart(2, "0")}
                        <span className="stat-dot" />
                      </strong>
                      <small>Roasts awaiting your first tasting</small>
                    </div>
                  </div>
                  {featured ? (
                    <>
                      <div className="journal-grid">
                        <section className="panel featured-panel">
                          <div className="section-heading">
                            <div>
                              <div className="eyebrow">
                                {selected ? "SELECTED ROAST" : "LATEST ROAST"}{" "}
                                {featured.demo && " / SAMPLE"}
                              </div>
                              <h2>{featured.name}</h2>
                              <p>
                                {bean(featured)?.origin}{" "}
                                <span className="separator">/</span>{" "}
                                {bean(featured)?.process}
                              </p>
                            </div>
                            <button
                              className="icon-button bordered"
                              aria-label="Edit selected roast"
                              onClick={() =>
                                setEditor({ type: "roast", item: featured })
                              }
                            >
                              <ArrowUpRight size={18} />
                            </button>
                          </div>
                          <div className="curve-controls">
                            <div className="legend">
                              <span className="line-key" />
                              {featured.points
                                ? featured.demo
                                  ? "Sample temperature curve"
                                  : "Measured temperature"
                                : "No measured curve"}
                              {comparison?.points && (
                                <>
                                  <span className="line-key comparison" />
                                  Comparison
                                </>
                              )}
                            </div>
                            <select
                              aria-label="Compare roast"
                              value={compare}
                              onChange={(e) => setCompare(e.target.value)}
                            >
                              <option value="">Compare roast…</option>
                              {roasts
                                .filter((r) => r.id !== featured.id && r.points)
                                .map((r) => (
                                  <option key={r.id} value={r.id}>
                                    {r.name}
                                  </option>
                                ))}
                            </select>
                          </div>
                          {featured.points ? (
                            <Chart
                              points={featured.points}
                              comparison={comparison?.points || undefined}
                              firstCrack={featured.firstCrack}
                            />
                          ) : (
                            <div className="no-curve">
                              No measured temperature data yet.
                              <small>
                                Attach your log or add a measured curve when
                                editing this roast.
                              </small>
                            </div>
                          )}
                          <div className="roast-metrics">
                            <div>
                              <span>ROAST TIME</span>
                              <strong>
                                {clock(featured.duration)} <small>min</small>
                              </strong>
                            </div>
                            <div>
                              <span>DEVELOPMENT</span>
                              <strong>
                                {featured.firstCrack
                                  ? (
                                      ((featured.duration -
                                        featured.firstCrack) /
                                        featured.duration) *
                                      100
                                    ).toFixed(1)
                                  : "—"}{" "}
                                <small>{featured.firstCrack ? "%" : ""}</small>
                              </strong>
                            </div>
                            <div>
                              <span>WEIGHT LOSS</span>
                              <strong>
                                {(
                                  ((featured.greenWeight -
                                    featured.roastedWeight) /
                                    featured.greenWeight) *
                                  100
                                ).toFixed(1)}{" "}
                                <small>%</small>
                              </strong>
                            </div>
                            <div>
                              <span>ROAST LEVEL</span>
                              <strong>{featured.level.toFixed(1)}</strong>
                            </div>
                          </div>
                          {selected && (
                            <div className="selected-notes">
                              <p>{featured.notes}</p>
                              {featured.inventoryConsumed === false && (
                                <p className="form-note">
                                  Historical import · current stock was not
                                  consumed. {featured.source?.timingNote}
                                </p>
                              )}
                              {featured.source?.kind === "native-log" &&
                                featured.fileId && (
                                  <button
                                    className="text-button"
                                    onClick={() =>
                                      setInspectedFile(featured.fileId)
                                    }
                                  >
                                    Inspect native measurements & settings
                                  </button>
                                )}
                              <div className="button-row">
                                <button
                                  className="text-button"
                                  onClick={() =>
                                    setEditor({
                                      type: "cupping",
                                      roastId: featured.id,
                                    })
                                  }
                                >
                                  <Coffee size={14} /> Record a tasting
                                </button>
                                {featured.fileId && (
                                  <a
                                    className="text-button"
                                    href={`/api/files/${featured.fileId}/download`}
                                  >
                                    Download original log
                                  </a>
                                )}
                              </div>
                            </div>
                          )}
                        </section>
                        <aside className="journal-aside">
                          <section className="lab-note">
                            <div className="eyebrow">
                              <FlaskConical size={15} /> ON THE LAB BENCH
                            </div>
                            {state.experiments.find(
                              (e) => e.status === "active",
                            ) ? (
                              <>
                                <h2>
                                  {
                                    state.experiments.find(
                                      (e) => e.status === "active",
                                    )!.name
                                  }
                                </h2>
                                <p>
                                  {
                                    state.experiments.find(
                                      (e) => e.status === "active",
                                    )!.hypothesis
                                  }
                                </p>
                                <div className="note-rule" />
                                <span className="micro-label">
                                  THE VARIABLE
                                </span>
                                <p className="variable">
                                  {
                                    state.experiments.find(
                                      (e) => e.status === "active",
                                    )!.variable
                                  }
                                </p>
                                <button
                                  className="text-button"
                                  onClick={() => navigate("experiments")}
                                >
                                  Open experiment <ArrowRight size={15} />
                                </button>
                              </>
                            ) : (
                              <>
                                <h2>Follow your curiosity.</h2>
                                <p>
                                  A question, a small adjustment, and an honest
                                  tasting. Start your next experiment.
                                </p>
                                <button
                                  className="text-button"
                                  onClick={() =>
                                    setEditor({ type: "experiment" })
                                  }
                                >
                                  Start an experiment <ArrowRight size={15} />
                                </button>
                              </>
                            )}
                          </section>
                          <section className="device-note">
                            <div>
                              <Usb size={18} />
                              <strong>Kaffelogic Nano 7</strong>
                            </div>
                            <p>
                              {device?.connected
                                ? "Your simulator is ready for profile sync."
                                : "Away from the roaster? The lab stays open."}
                            </p>
                            <button
                              className="text-button"
                              onClick={() => navigate("device")}
                            >
                              {device?.connected
                                ? "Open simulator"
                                : "Explore device simulator"}{" "}
                              <ArrowRight size={14} />
                            </button>
                          </section>
                        </aside>
                      </div>
                      <section className="panel journal-list">
                        <div className="section-heading">
                          <h2>
                            The roast journal{" "}
                            <span className="count">{roasts.length}</span>
                          </h2>
                          <button
                            className="text-button"
                            onClick={() => {
                              navigate("archive");
                              fileInput.current?.click();
                            }}
                          >
                            <Upload size={15} /> Import logs
                          </button>
                        </div>
                        <div className="table-toolbar">
                          <div className="tabs" aria-label="Filter roasts">
                            {[
                              ["all", "All roasts"],
                              ["uncupped", "Awaiting tasting"],
                              ["cupped", "Tasted"],
                            ].map(([value, label]) => (
                              <button
                                key={value}
                                className={filter === value ? "active" : ""}
                                onClick={() => setFilter(value)}
                              >
                                {label}
                              </button>
                            ))}
                          </div>
                          <label className="search">
                            <Search size={16} />
                            <input
                              aria-label="Search roasts"
                              placeholder="Find a roast or coffee…"
                              value={search}
                              onChange={(e) => setSearch(e.target.value)}
                            />
                          </label>
                        </div>
                        {filtered.length ? (
                          <RoastTable rows={filtered} />
                        ) : (
                          <Empty title="No matching roasts">
                            Try a different search or filter.
                          </Empty>
                        )}
                      </section>
                    </>
                  ) : (
                    <Empty
                      title="Your roasting story starts here."
                      action={
                        <div className="button-row">
                          <button
                            className="button primary"
                            onClick={() => setEditor({ type: "bean" })}
                          >
                            <Plus size={16} /> Add your first coffee
                          </button>
                          <button
                            className="button"
                            disabled={busy}
                            onClick={() =>
                              run(
                                () => api("/demo", {}),
                                "Sample notebook loaded.",
                              )
                            }
                          >
                            <Beaker size={16} /> Explore sample notebook
                          </button>
                        </div>
                      }
                    >
                      Add a coffee lot and a profile, then log your first roast.
                      Or explore a sample notebook to get a feel for the lab.
                    </Empty>
                  )}
                </>
              )}
              {page === "profiles" &&
                (state.profiles.length ? (
                  <div className="library-grid">
                    <div className="profile-list">
                      {state.profiles.map((p) => {
                        const v = state.versions
                          .filter((v) => v.profileId === p.id)
                          .sort((a, b) => b.number - a.number)[0];
                        return (
                          <button
                            className={`profile-card ${chosenProfile?.id === p.id ? "active" : ""}`}
                            key={p.id}
                            onClick={() => {
                              setProfileId(p.id);
                              setVersionId("");
                            }}
                          >
                            <div>
                              <span className="eyebrow">
                                {p.demo ? "SAMPLE / " : ""}
                                {v.native
                                  ? "NATIVE PROFILE"
                                  : "RESEARCH PROFILE"}
                              </span>
                              <Badge>v{v.number}</Badge>
                            </div>
                            <h2>{p.name}</h2>
                            <p>{p.description}</p>
                            <Chart points={v.points} mini />
                            <footer>
                              <span>Level {v.level.toFixed(1)}</span>
                              <ArrowUpRight size={17} />
                            </footer>
                          </button>
                        );
                      })}
                    </div>
                    {chosenVersion && (
                      <section className="panel profile-detail">
                        <div className="section-heading">
                          <div>
                            <div className="eyebrow">PROFILE WORKBENCH</div>
                            <h2>{chosenVersion.name}</h2>
                          </div>
                          <select
                            aria-label="Profile revision"
                            value={chosenVersion.id}
                            onChange={(e) => setVersionId(e.target.value)}
                          >
                            {revisions.map((v) => (
                              <option value={v.id} key={v.id}>
                                Revision {v.number}
                              </option>
                            ))}
                          </select>
                        </div>
                        <p>{chosenVersion.description}</p>
                        <Chart points={chosenVersion.points} />
                        <div className="notice">
                          {chosenVersion.native
                            ? chosenVersion.native.kind === "log"
                              ? "Embedded log snapshot · original settings retained with the source log."
                              : "Native settings preserved · verify edited exports in Studio before use."
                            : "Research curve · export uses Dialed JSON."}
                        </div>
                        {profileActions(chosenVersion)}
                        <h3 className="subheading">Revision history</h3>
                        <div className="timeline">
                          {revisions.map((v) => (
                            <div key={v.id}>
                              <span className="timeline-dot" />
                              <div>
                                <strong>Revision {v.number}</strong>
                                <p>{v.changeNote}</p>
                                <small>{fullDate(v.createdAt)}</small>
                              </div>
                            </div>
                          ))}
                        </div>
                      </section>
                    )}
                  </div>
                ) : (
                  <Empty
                    title="Make room for your next idea."
                    action={
                      <button className="button primary" onClick={add}>
                        Create a profile
                      </button>
                    }
                  >
                    Build and version research curves here. Existing Kaffelogic
                    profiles can be stored in the file archive.
                  </Empty>
                ))}
              {page === "experiments" &&
                (state.experiments.length ? (
                  <div className="experiment-grid">
                    {state.experiments.map((e) => {
                      const runs = roasts.filter(
                        (r) => r.experimentId === e.id,
                      );
                      return (
                        <section className="panel experiment-card" key={e.id}>
                          <div className="section-heading">
                            <Badge tone={e.status === "active" ? "green" : ""}>
                              {e.status}
                            </Badge>
                            <button
                              className="icon-button"
                              aria-label={`Edit ${e.name}`}
                              onClick={() =>
                                setEditor({ type: "experiment", item: e })
                              }
                            >
                              <ArrowUpRight size={18} />
                            </button>
                          </div>
                          <h2>{e.name}</h2>
                          <p>{e.hypothesis}</p>
                          <div className="experiment-variable">
                            <span className="eyebrow">ONE THING TO CHANGE</span>
                            <strong>{e.variable}</strong>
                          </div>
                          <h3>{runs.length} linked roasts</h3>
                          {runs.map((r) => (
                            <button
                              className="experiment-roast"
                              key={r.id}
                              onClick={() => {
                                navigate("journal");
                                setSelected(r.id);
                              }}
                            >
                              <span>
                                {r.name}
                                <small>
                                  Level {r.level} · {clock(r.duration)}
                                </small>
                              </span>
                              <span>
                                {score(r)?.toFixed(1) || "Untasted"}
                                <ChevronRight size={15} />
                              </span>
                            </button>
                          ))}
                          {e.conclusion && (
                            <blockquote>{e.conclusion}</blockquote>
                          )}
                          <button
                            className="text-button"
                            onClick={() =>
                              setEditor({ type: "experiment", item: e })
                            }
                          >
                            {e.conclusion
                              ? "Update conclusion"
                              : "Add your conclusion"}{" "}
                            <ArrowRight size={15} />
                          </button>
                        </section>
                      );
                    })}
                  </div>
                ) : (
                  <Empty
                    title="Start with a question."
                    action={
                      <button className="button primary" onClick={add}>
                        New experiment
                      </button>
                    }
                  >
                    Record a hypothesis, choose a variable, and link your roasts
                    to see what changes in the cup.
                  </Empty>
                ))}
              {page === "cupping" && (
                <>
                  {pending.length > 0 && (
                    <section className="panel pending-panel">
                      <div className="section-heading">
                        <h2>Ready for a first impression</h2>
                        <Badge tone="amber">{pending.length} untasted</Badge>
                      </div>
                      <div className="pending-grid">
                        {pending.map((r) => (
                          <div key={r.id}>
                            <Coffee size={22} />
                            <strong>{r.name}</strong>
                            <small>
                              {bean(r)?.name} · roasted {date(r.roastedAt)}
                            </small>
                            <button
                              className="text-button"
                              onClick={() =>
                                setEditor({ type: "cupping", roastId: r.id })
                              }
                            >
                              Taste this roast <ArrowRight size={15} />
                            </button>
                          </div>
                        ))}
                      </div>
                    </section>
                  )}
                  {state.cuppings.length ? (
                    <div className="cupping-grid">
                      {state.cuppings.map((c) => (
                        <section className="panel cup-card" key={c.id}>
                          <div className="section-heading">
                            <div>
                              <span className="eyebrow">
                                {c.taster} / {date(c.tastedAt)}
                                {c.demo ? " / SAMPLE" : ""}
                              </span>
                              <h2>
                                {
                                  state.roasts.find((r) => r.id === c.roastId)
                                    ?.name
                                }
                              </h2>
                            </div>
                            <div className="big-score">
                              {c.score?.toFixed(1) ?? "—"}
                              <small>/ 100</small>
                            </div>
                          </div>
                          <p>{c.notes || "No tasting notes recorded."}</p>
                          <div className="taste-bars">
                            {(
                              [
                                "aroma",
                                "acidity",
                                "sweetness",
                                "body",
                                "finish",
                              ] as const
                            ).map((k) => (
                              <div key={k}>
                                <span>{k}</span>
                                <div>
                                  <i
                                    style={{ width: `${(c[k] ?? 0) * 10}%` }}
                                  />
                                </div>
                                <strong>{c[k] ?? "—"}</strong>
                              </div>
                            ))}
                          </div>
                        </section>
                      ))}
                    </div>
                  ) : (
                    !pending.length && (
                      <Empty
                        title="Let the cup have its say."
                        action={
                          <button className="button primary" onClick={add}>
                            Record a tasting
                          </button>
                        }
                      >
                        Add a roast first, then record flavours, scores, and
                        your next adjustment.
                      </Empty>
                    )
                  )}
                </>
              )}
              {page === "beans" &&
                (state.beans.length ? (
                  <div className="coffee-grid">
                    {state.beans.map((b, i) => (
                      <section className="panel coffee-card" key={b.id}>
                        <div className={`coffee-art tone-${i % 3}`}>
                          <span className="coffee-origin">
                            {b.origin.split(" · ")[0]}
                          </span>
                          <div className="big-bean" />
                          <span className="coffee-art-caption">
                            DIALED / GREEN COFFEE {b.demo ? "/ SAMPLE" : ""}
                          </span>
                        </div>
                        <div className="coffee-content">
                          <div className="section-heading">
                            <div>
                              <h2>{b.name}</h2>
                              <p>{b.origin}</p>
                            </div>
                            <button
                              className="icon-button"
                              aria-label={`Edit ${b.name}`}
                              onClick={() =>
                                setEditor({ type: "bean", item: b })
                              }
                            >
                              <ArrowUpRight size={18} />
                            </button>
                          </div>
                          <div className="coffee-tags">
                            <Badge>{b.process}</Badge>
                            {b.variety && <Badge>{b.variety}</Badge>}
                          </div>
                          <div className="coffee-stock">
                            <span>IN THE CUPBOARD</span>
                            <strong>
                              {b.stock.toLocaleString()} <small>g</small>
                            </strong>
                          </div>
                          {b.notes && <p className="muted">{b.notes}</p>}
                        </div>
                      </section>
                    ))}
                  </div>
                ) : (
                  <Empty
                    title="What’s in your cupboard?"
                    action={
                      <button className="button primary" onClick={add}>
                        Add a coffee lot
                      </button>
                    }
                  >
                    Keep origin, process, variety, and remaining green weight
                    together. Logging a roast automatically uses stock.
                  </Empty>
                ))}
              {page === "imports" && (
                <HistoryImporter state={state} onSaved={refresh} />
              )}
              {page === "archive" && (
                <>
                  <div
                    className="upload-zone"
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (!busy) void importFiles(e.dataTransfer.files);
                    }}
                  >
                    <Upload size={27} />
                    <h2>Give your files a home.</h2>
                    <p>
                      Drop Studio logs, native profiles, CSVs, or Dialed JSON
                      here.
                    </p>
                    <button
                      className="button"
                      disabled={busy}
                      onClick={() => fileInput.current?.click()}
                    >
                      {busy ? "Importing…" : "Choose files"}
                    </button>
                    <small>
                      10 MB per file · byte-for-byte preservation · duplicate
                      detection
                    </small>
                  </div>
                  <div className="notice">
                    <span>
                      Inspect native curves, measurements, settings, and events
                      before adding a file to your notebook.
                    </span>
                    <button
                      className="text-button"
                      onClick={() => navigate("imports")}
                    >
                      Import CSV history <ArrowRight size={15} />
                    </button>
                  </div>
                  {state.files.length > 0 && (
                    <section className="panel">
                      <div className="table-scroll">
                        <table>
                          <thead>
                            <tr>
                              <th>Original file</th>
                              <th>Archived</th>
                              <th>Size / SHA-256</th>
                              <th>Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {state.files.map((f) => (
                              <tr key={f.id}>
                                <td>
                                  <strong>{f.name}</strong>
                                </td>
                                <td>{date(f.createdAt)}</td>
                                <td className="mono">
                                  {(f.size / 1024).toFixed(1)} KB
                                  <small title={f.sha256}>
                                    {f.sha256.slice(0, 16)}…
                                  </small>
                                </td>
                                <td>
                                  <div className="button-row">
                                    <a
                                      className="icon-button"
                                      aria-label={`Download ${f.name}`}
                                      href={`/api/files/${f.id}/download`}
                                    >
                                      <Download size={17} />
                                    </a>
                                    {/\.(kpro|kpro2|klog)$/i.test(f.name) && (
                                      <button
                                        className="text-button"
                                        onClick={() => setInspectedFile(f.id)}
                                      >
                                        Inspect & import
                                      </button>
                                    )}
                                    {/\.json$/i.test(f.name) && (
                                      <button
                                        className="text-button"
                                        disabled={busy}
                                        onClick={() =>
                                          run(
                                            () =>
                                              api("/profiles/import", {
                                                fileId: f.id,
                                              }),
                                            "Profile imported.",
                                          )
                                        }
                                      >
                                        Import JSON profile
                                      </button>
                                    )}
                                    {/\.csv$/i.test(f.name) && (
                                      <button
                                        className="text-button"
                                        onClick={() => navigate("imports")}
                                      >
                                        Map CSV
                                      </button>
                                    )}
                                    {/\.(kpro|kpro2)$/i.test(f.name) && (
                                      <button
                                        className="text-button"
                                        disabled={
                                          busy || !device?.folder.canStage
                                        }
                                        onClick={() =>
                                          run(
                                            () =>
                                              api("/device/stage", {
                                                fileId: f.id,
                                              }),
                                            "Original staged; roaster delivery unconfirmed.",
                                          )
                                        }
                                      >
                                        Stage original
                                      </button>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </section>
                  )}
                </>
              )}
              {page === "device" && (
                <>
                  <section className="panel device-hero">
                    <div className="device-illustration">
                      <div className="roaster-lid" />
                      <div className="roaster-body">
                        <span>kaffelogic</span>
                        <div className="roaster-display">
                          DIALED
                          <br />
                          SIMULATOR
                        </div>
                        <div className="roaster-buttons">− ◉ +</div>
                      </div>
                      <div className="roaster-base" />
                    </div>
                    <div>
                      <span className="eyebrow">DEVICE WORKBENCH</span>
                      <h2>Kaffelogic Nano 7</h2>
                      <Badge tone={device?.connected ? "green" : "amber"}>
                        {device?.connected
                          ? "Simulator connected"
                          : "Simulator disconnected"}
                      </Badge>
                      <p>
                        Try the profile synchronization workflow without your
                        roaster. Simulator writes stay in your local database.
                      </p>
                      <button
                        className="button primary"
                        disabled={busy}
                        onClick={() =>
                          run(
                            () =>
                              api(
                                `/device/${device?.connected ? "disconnect" : "connect"}`,
                                {},
                              ),
                            device?.connected
                              ? "Simulator disconnected."
                              : "Simulator connected.",
                          )
                        }
                      >
                        <Usb size={16} />
                        {device?.connected
                          ? "Disconnect simulator"
                          : "Connect simulator"}
                      </button>
                      <small className="hardware-note">
                        Direct USB transport is not implemented. No real
                        hardware connection is claimed.
                      </small>
                    </div>
                  </section>
                  <div className="two-column">
                    <section className="panel padded">
                      <div className="section-heading">
                        <h2>Profile synchronization</h2>
                        <Badge>SIMULATED</Badge>
                      </div>
                      <p className="muted">
                        Sync a specific revision. Repeating a sync is safe and
                        won’t duplicate it.
                      </p>
                      {state.profiles.map((p) => {
                        const v = state.versions
                          .filter((v) => v.profileId === p.id)
                          .sort((a, b) => b.number - a.number)[0];
                        const synced = device?.profiles.some(
                          (d) => d.versionId === v.id,
                        );
                        return (
                          <div className="sync-row" key={p.id}>
                            <span>
                              <strong>{p.name}</strong>
                              <small>Latest revision · v{v.number}</small>
                            </span>
                            <button
                              className="button"
                              disabled={busy || !device?.connected}
                              onClick={() =>
                                run(
                                  () =>
                                    api("/device/sync", { versionId: v.id }),
                                  "Simulator profile is up to date.",
                                )
                              }
                            >
                              {synced ? (
                                <Check size={15} />
                              ) : (
                                <ArrowDownToLine size={15} />
                              )}{" "}
                              {synced ? "Synced" : "Sync"}
                            </button>
                          </div>
                        );
                      })}
                      {!state.profiles.length && (
                        <p>Create a profile in the library first.</p>
                      )}
                    </section>
                    <section className="panel padded">
                      <h2>Studio folder bridge</h2>
                      <p>
                        Import native logs and profiles from a folder on this
                        computer. Studio still handles communication with USB-C
                        roasters.
                      </p>
                      <div className="config-status">
                        <span>Import folder</span>
                        <Badge>
                          {device?.folder.canImport
                            ? "Configured"
                            : "Not configured"}
                        </Badge>
                      </div>
                      <div className="config-status">
                        <span>Profile outbox</span>
                        <Badge>
                          {device?.folder.canStage
                            ? "Configured"
                            : "Not configured"}
                        </Badge>
                      </div>
                      <p className="form-note">
                        Set DIALED_IMPORT_DIR and DIALED_PROFILE_OUTBOX when
                        starting the backend. Outbox writes preserve original
                        bytes and refuse to overwrite existing files.
                      </p>
                      <button
                        className="button"
                        disabled={busy || !device?.folder.canImport}
                        onClick={() =>
                          run(async () => {
                            const r = await api<{
                              imported: number;
                              duplicates: number;
                              errors: { name: string; error: string }[];
                            }>("/device/import-folder", {});
                            if (r.errors.length)
                              throw new Error(
                                `${r.imported} imported, ${r.duplicates} duplicates. ${r.errors.map((e) => `${e.name}: ${e.error}`).join("; ")}`,
                              );
                          }, "Folder scanned. New originals are in the archive.")
                        }
                      >
                        <Download size={16} /> Import folder
                      </button>
                    </section>
                  </div>
                  <section className="panel padded activity-panel">
                    <h2>Sync history</h2>
                    {device?.jobs.length ? (
                      device.jobs.map((j) => (
                        <div className="sync-row" key={j.id}>
                          <span>
                            <strong>{j.name}</strong>
                            <small>{fullDate(j.completedAt)}</small>
                          </span>
                          <Badge tone="green">
                            Simulated · checksum stored
                          </Badge>
                        </div>
                      ))
                    ) : (
                      <p className="muted">
                        Your simulated synchronization history will appear here.
                      </p>
                    )}
                  </section>
                </>
              )}
              {page === "settings" && (
                <div className="settings-stack">
                  <section className="panel padded">
                    <span className="eyebrow">YOUR DATA, YOUR NOTEBOOK</span>
                    <h2>Local, persistent, portable.</h2>
                    <p>
                      Roasts, revisions, tastings, and original files live in a
                      SQLite database on this computer. Download a complete JSON
                      export, including original files, for an additional copy.
                    </p>
                    <a className="button primary" href="/api/backup" download>
                      <Download size={16} /> Export complete workspace
                    </a>
                    <p className="form-note">
                      For a restorable backup, stop the backend and copy the
                      entire data folder. JSON restore and shared accounts are
                      planned; this release is local and single-workspace.
                    </p>
                  </section>
                  <section className="panel padded">
                    <h2>Sample notebook</h2>
                    <p>
                      Explore an illustrative set of coffees, roasts, research
                      profiles, and tasting notes. Samples are labeled
                      throughout the application.
                    </p>
                    <div className="button-row">
                      <button
                        className="button"
                        disabled={busy || hasDemo}
                        onClick={() =>
                          run(() => api("/demo", {}), "Sample notebook loaded.")
                        }
                      >
                        <Beaker size={16} /> Load sample data
                      </button>
                      <button
                        className="button"
                        disabled={busy || !hasDemo}
                        onClick={() =>
                          run(
                            () => api("/demo", undefined, "DELETE"),
                            "Sample data removed.",
                          )
                        }
                      >
                        Remove sample data
                      </button>
                    </div>
                    <p className="form-note">
                      Removing samples preserves your own records. If your
                      records refer to sample entities, removal is blocked to
                      protect those references.
                    </p>
                  </section>
                  <section className="panel padded">
                    <h2>What’s next for the lab</h2>
                    <ol className="roadmap-list">
                      <li>
                        <strong>Native compatibility verification</strong>
                        <span>
                          Native inspection and revisions are available. Verify
                          edited exports in Studio before using them to roast.
                        </span>
                      </li>
                      <li>
                        <strong>Verified Nano 7 connection</strong>
                        <span>
                          Identify the device transport, then test discovery,
                          disconnect recovery, transfers, and hardware
                          acknowledgments.
                        </span>
                      </li>
                      <li>
                        <strong>A shared Dialed workspace</strong>
                        <span>
                          Accounts, team access, hosted storage, and a local
                          device companion.
                        </span>
                      </li>
                      <li>
                        <strong>Your existing notebook</strong>
                        <span>
                          Use Import history to map a CSV export of your sheet,
                          review dates and units, and import historical tastings.
                        </span>
                      </li>
                    </ol>
                  </section>
                </div>
              )}
            </>
          )}
          <footer className="page-footer">
            <span>
              DIALED <span className="footer-slash">/</span> A LITTLE MORE
              INTENTIONAL, EVERY ROAST.
            </span>
            <span>
              Roast. Taste. Refine. <Activity size={13} />
            </span>
          </footer>
        </main>
      </div>
      <input
        ref={fileInput}
        className="sr-only"
        type="file"
        multiple
        accept=".klog,.kpro,.kpro2,.json,.csv"
        aria-label="Import original files"
        onChange={(e) => {
          void importFiles(e.target.files);
          e.target.value = "";
        }}
      />
      {inspectedFile && (
        <NativeInspector
          fileId={inspectedFile}
          state={state}
          onClose={() => setInspectedFile(null)}
          onSaved={refresh}
        />
      )}
      {nativeVersion && (
        <NativeEditor
          version={nativeVersion}
          onClose={() => setNativeVersion(null)}
          onSaved={refresh}
        />
      )}
      {editor && (
        <EditorDialog
          editor={editor}
          state={state}
          onClose={() => setEditor(null)}
          onSaved={async () => {
            await refresh();
            setToast("Saved to your notebook.");
          }}
        />
      )}
      {toast && (
        <div className="toast" role="status">
          <Check size={17} />
          {toast}
        </div>
      )}
    </div>
  );
}
