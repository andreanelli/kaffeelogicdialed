import { useEffect, useId, useMemo, useState } from "react";
import type { NativeDocument } from "./NativeFiles";
import { clock } from "./Chart";
type Series = {
  key: string;
  label: string;
  color: string;
  dash?: string;
  values: [number, number | null][];
};
const format = (v: number | null | undefined, unit = "") =>
  v == null ? "—" : `${v.toFixed(unit === " RPM" ? 0 : 1)}${unit}`;
export function RoastDashboard({ doc }: { doc: NativeDocument }) {
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(max-width: 760px)");
    const update = () => setCompact(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  const plotId = useId().replace(/:/g, "");
  const [fullRor, setFullRor] = useState(false);
  const [cooling, setCooling] = useState(false),
    [cursor, setCursor] = useState<number | null>(null),
    [hidden, setHidden] = useState<string[]>([]);
  const end = doc.summary.duration ?? null,
    fc = doc.summary.firstCrack ?? null;
  const colour = Number(
    doc.events.filter((e) => e.key === "colour_change").at(-1)?.value ?? NaN,
  );
  const last = doc.rows.at(-1)?.[0] ?? 0;
  const maxTime = Math.max(1, cooling || end === null ? last : end);
  const time = Math.min(maxTime, Math.max(0, cursor ?? end ?? last));
  const series = useMemo(() => {
    const measured = (
      key: string,
      label: string,
      color: string,
      dash?: string,
    ): Series => ({
      key,
      label,
      color,
      dash,
      values: doc.rows.map((r) => [
        r[0]!,
        doc.channels.find((c) => c.key === key)
          ? r[doc.channels.find((c) => c.key === key)!.index]
          : null,
      ]),
    });
    return [
      {
        title: "Temperature",
        unit: "°C",
        hint: "Measured temperature against the recorded target",
        series: [
          measured("temp", "Temperature", "#b04b2e"),
          measured("profile", "Target", "#263e50", "7 4"),
          measured("mean_temp", "Mean", "#71824c"),
          measured("spot_temp", "Spot", "#ad8194", "2 4"),
        ],
      },
      {
        title: "Rate of rise",
        unit: "°C/min",
        hint: "Recorded temperature change per minute",
        series: [
          measured("actual_ROR", "Actual RoR", "#1b737b"),
          measured("profile_ROR", "Target RoR", "#263e50", "7 4"),
          measured("desired_ROR", "Controller desired", "#9e7440", "2 4"),
        ],
      },
      {
        title: "Heater power",
        unit: "kW",
        hint: "Recorded heater output",
        series: [measured("power_kW", "Power", "#b17c22")],
      },
      {
        title: "Fan speed",
        unit: "RPM",
        hint: "Measured fan speed and embedded profile",
        series: [
          measured("actual_fan_RPM", "Actual fan", "#65528c"),
          {
            key: "fan-target",
            label: "Profile fan",
            color: "#829267",
            dash: "7 4",
            values: (doc.curves.fan_profile?.points || []).map(
              (p) => [p.time, p.temperature] as [number, number],
            ),
          },
        ],
      },
    ];
  }, [doc]);
  const at = (s: Series) =>
    s.values.reduce<[number, number | null] | null>(
      (best, p) =>
        p[1] === null || p[0] > maxTime
          ? best
          : !best || Math.abs(p[0] - time) < Math.abs(best[0] - time)
            ? p
            : best,
      null,
    );
  const temp = series[0].series[0];
  const endSample = temp.values
    .filter((p) => p[1] !== null && end !== null && p[0] <= end)
    .at(-1);
  const development =
    end !== null && fc !== null && fc > 0 && fc < end ? end - fc : null;
  const events = [
    { time: colour, label: "Colour change", short: "Colour", color: "#9d7826" },
    { time: fc, label: "First crack", short: "FC", color: "#ab5334" },
    { time: end, label: "Roast end", short: "End", color: "#374e5a" },
  ].filter(
    (e) => e.time !== null && Number.isFinite(e.time) && e.time >= 0,
  ) as { time: number; label: string; short: string; color: string }[];
  const phases =
    end !== null &&
    Number.isFinite(colour) &&
    fc !== null &&
    colour > 0 &&
    fc > colour &&
    end > fc
      ? [
          { label: "Before colour change", duration: colour, color: "#d8c99c" },
          {
            label: "Colour → first crack",
            duration: fc - colour,
            color: "#c29164",
          },
          { label: "Development", duration: end - fc, color: "#ad5a3e" },
        ]
      : [];
  return (
    <section className="roast-dashboard" aria-label="Roast analysis dashboard">
      <div className="roast-dash-heading">
        <div>
          <div className="eyebrow">ROAST ANALYSIS</div>
          <h2>{doc.summary.name || "Recorded roast"}</h2>
          <p>
            {doc.summary.roastedAt
              ? new Date(doc.summary.roastedAt).toLocaleString()
              : "Start date not recorded"}{" "}
            · {doc.rows.length.toLocaleString()} samples
          </p>
        </div>
        <div className="tabs">
          <button
            className={!cooling ? "active" : ""}
            onClick={() => setCooling(false)}
          >
            Roast only
          </button>
          <button
            className={cooling ? "active" : ""}
            onClick={() => setCooling(true)}
          >
            Include cooling
          </button>
        </div>
      </div>
      <div className="roast-kpis">
        {[
          [
            "Roast duration",
            end === null ? "—" : clock(end),
            "Recorded end event",
          ],
          ["First crack", fc === null ? "—" : clock(fc), "Recorded event"],
          [
            "Development",
            development === null
              ? "—"
              : `${clock(development)} / ${((100 * development) / end!).toFixed(1)}%`,
            "Time after first crack",
          ],
          [
            "End temperature",
            format(endSample?.[1], " °C"),
            "Last measured sample before end",
          ],
          ["Roast level", format(doc.summary.level), "Recorded setting"],
        ].map(([label, value, note]) => (
          <div key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
            <small>{note}</small>
          </div>
        ))}
      </div>
      {phases.length > 0 ? (
        <div className="roast-phases" aria-label="Roast phase durations">
          {phases.map((p) => (
            <div
              key={p.label}
              style={{ flex: p.duration, borderTopColor: p.color }}
            >
              <span>{p.label}</span>
              <strong>
                {clock(p.duration)}{" "}
                <small>{((p.duration / end!) * 100).toFixed(1)}%</small>
              </strong>
            </div>
          ))}
        </div>
      ) : (
        <p className="form-note">
          Phase breakdown needs colour-change, first-crack and end events in
          chronological order. Missing events are not estimated.
        </p>
      )}
      <div className="roast-cursor">
        <div>
          <span className="eyebrow">INSPECT AT</span>
          <strong>{clock(time)}</strong>
        </div>
        <label>
          Move across all charts
          <input
            aria-label="Inspect roast time"
            type="range"
            min="0"
            max={maxTime}
            step="1"
            value={time}
            onChange={(e) => setCursor(Number(e.target.value))}
          />
        </label>
        <span>Shared time axis · nearest recorded samples</span>
      </div>
      <div className="roast-plots">
        {series.map((panel, pi) => {
          const available = panel.series.filter((s) =>
            s.values.some((p) => p[1] !== null),
          );
          const visible = available.filter((s) => !hidden.includes(s.key));
          const numbers = visible.flatMap((s) =>
            s.values
              .filter((p) => p[0] >= 0 && p[0] <= maxTime && p[1] !== null)
              .map((p) => p[1]!),
          );
          const lo =
              pi === 3 && numbers.length
                ? Math.min(...numbers)
                : Math.min(0, ...numbers),
            hi = Math.max(1, ...numbers),
            pad = Math.max(
              (hi - lo) * 0.08,
              pi === 3 ? 100 : pi === 2 ? 0.05 : 1,
            );
          const min =
              pi === 1 && !fullRor
                ? -10
                : pi === 3
                  ? Math.max(0, lo - pad)
                  : lo < 0
                    ? lo - pad
                    : 0,
            max = pi === 1 && !fullRor ? 50 : hi + pad;
          const clipped = numbers.filter((v) => v < min || v > max).length;
          const W = compact ? 420 : 1000,
            H = pi === 0 ? 260 : 165,
            L = 68,
            R = 18,
            T = 24,
            B = 29;
          const x = (t: number) => L + (t / maxTime) * (W - L - R),
            y = (v: number) => H - B - ((v - min) / (max - min)) * (H - T - B);
          const path = (s: Series) => {
            let connected = false;
            return s.values
              .map(([t, v]) => {
                if (v === null || t < 0 || t > maxTime) {
                  connected = false;
                  return "";
                }
                const p = `${connected ? "L" : "M"}${x(t).toFixed(2)},${y(v).toFixed(2)}`;
                connected = true;
                return p;
              })
              .join(" ");
          };
          return (
            <article className="roast-plot" key={panel.title}>
              <header>
                <div>
                  <h3>
                    {panel.title} <small>{panel.unit}</small>
                  </h3>
                  <p>{panel.hint}</p>
                  {pi === 1 && (
                    <button
                      className="ror-scale"
                      onClick={() => setFullRor(!fullRor)}
                    >
                      {fullRor
                        ? "Full range · switch to detail"
                        : `Detail scale −10 to 50 · ${clipped} off-scale values · show full range`}
                    </button>
                  )}
                </div>
                <div className="roast-legend">
                  {panel.series.map((s) => {
                    const value = at(s),
                      exists = available.includes(s);
                    return (
                      <button
                        key={s.key}
                        disabled={!exists}
                        aria-pressed={!hidden.includes(s.key) && exists}
                        onClick={() =>
                          setHidden((prev) =>
                            prev.includes(s.key)
                              ? prev.filter((k) => k !== s.key)
                              : [...prev, s.key],
                          )
                        }
                        style={
                          { "--series-color": s.color } as React.CSSProperties
                        }
                      >
                        <i
                          style={{
                            borderTopStyle: s.dash ? "dashed" : "solid",
                          }}
                        />
                        <span>{s.label}</span>
                        <strong>
                          {exists
                            ? format(
                                value?.[1],
                                panel.unit === "RPM" ? " RPM" : "",
                              )
                            : "Not recorded"}
                        </strong>
                      </button>
                    );
                  })}
                </div>
              </header>
              <svg
                viewBox={`0 0 ${W} ${H}`}
                role="img"
                aria-label={`${panel.title} in ${panel.unit}, shared elapsed time; use Inspect roast time slider for values`}
                onPointerMove={(e) => {
                  const r = e.currentTarget.getBoundingClientRect();
                  setCursor(
                    Math.max(
                      0,
                      Math.min(
                        maxTime,
                        ((((e.clientX - r.left) / r.width) * W - L) /
                          (W - L - R)) *
                          maxTime,
                      ),
                    ),
                  );
                }}
              >
                <defs>
                  <clipPath id={`${plotId}-${pi}`}>
                    <rect x={L} y={T} width={W - L - R} height={H - T - B} />
                  </clipPath>
                </defs>
                {events
                  .filter((e) => e.time <= maxTime)
                  .map((e, i) => (
                    <rect
                      key={e.label}
                      x={x(i ? events[i - 1].time : 0)}
                      y={T}
                      width={Math.max(
                        0,
                        x(e.time) - x(i ? events[i - 1].time : 0),
                      )}
                      height={H - T - B}
                      fill={e.color}
                      opacity=".035"
                    />
                  ))}
                {Array.from(
                  { length: 5 },
                  (_, i) => min + ((max - min) * i) / 4,
                ).map((v) => (
                  <g key={v}>
                    <line
                      x1={L}
                      x2={W - R}
                      y1={y(v)}
                      y2={y(v)}
                      stroke="#e4e4dc"
                    />
                    <text x={L - 12} y={y(v) + 4} textAnchor="end">
                      {panel.unit === "RPM"
                        ? Math.round(v).toLocaleString()
                        : v.toFixed(panel.unit === "kW" ? 1 : 0)}
                    </text>
                  </g>
                ))}
                {Array.from(
                  { length: compact ? 4 : 7 },
                  (_, i) => (maxTime * i) / (compact ? 3 : 6),
                ).map((t) => (
                  <g key={t}>
                    <line
                      x1={x(t)}
                      x2={x(t)}
                      y1={T}
                      y2={H - B}
                      stroke="#eeeee7"
                    />
                    <text x={x(t)} y={H - 7} textAnchor="middle">
                      {clock(t)}
                    </text>
                  </g>
                ))}
                {visible.map((s) => (
                  <path
                    key={s.key}
                    clipPath={`url(#${plotId}-${pi})`}
                    d={path(s)}
                    fill="none"
                    stroke={s.color}
                    strokeWidth={s.dash ? 1.6 : 2.2}
                    strokeDasharray={s.dash}
                    strokeLinejoin="round"
                  />
                ))}
                {events
                  .filter((e) => e.time <= maxTime)
                  .map((e) => (
                    <g key={e.label}>
                      <line
                        x1={x(e.time)}
                        x2={x(e.time)}
                        y1={T}
                        y2={H - B}
                        stroke={e.color}
                        strokeDasharray="3 5"
                        opacity=".65"
                      />
                      {pi === 0 && (
                        <text
                          x={x(e.time) - 4}
                          y={13}
                          textAnchor="end"
                          fill={e.color}
                        >
                          {e.short}
                          {!compact && ` · ${clock(e.time)}`}
                        </text>
                      )}
                    </g>
                  ))}
                <line
                  x1={x(time)}
                  x2={x(time)}
                  y1={T}
                  y2={H - B}
                  stroke="#23373d"
                  opacity=".65"
                />
                {pi === 1 &&
                  !fullRor &&
                  visible.map((s) => (
                    <g key={`clipped-${s.key}`}>
                      {s.values
                        .filter(
                          ([t, v]) =>
                            t >= 0 &&
                            t <= maxTime &&
                            v !== null &&
                            (v < min || v > max),
                        )
                        .map(([t, v], i) => (
                          <path
                            key={i}
                            d={`M${x(t) - 2},${v! > max ? T + 5 : H - B - 5} L${x(t)},${v! > max ? T : H - B} L${x(t) + 2},${v! > max ? T + 5 : H - B - 5}`}
                            stroke={s.color}
                            fill="none"
                          />
                        ))}
                    </g>
                  ))}
                {visible.map((s) => {
                  const point = at(s);
                  return point && point[1] !== null ? (
                    <circle
                      key={s.key}
                      cx={x(point[0])}
                      cy={y(Math.min(max, Math.max(min, point[1])))}
                      r="3.5"
                      fill={s.color}
                      stroke="white"
                      strokeWidth="1.5"
                    />
                  ) : null;
                })}
                {!numbers.length && (
                  <text x={W / 2} y={H / 2} textAnchor="middle">
                    {available.length
                      ? "All curves hidden"
                      : "No measurements recorded for this channel"}
                  </text>
                )}
              </svg>
            </article>
          );
        })}
      </div>
      <div className="roast-event-ledger">
        {events.map((e) => (
          <div key={e.label}>
            <i style={{ background: e.color }} />
            <span>{e.label}</span>
            <strong>{clock(e.time)}</strong>
          </div>
        ))}
      </div>
      <p className="roast-data-note">
        All curves use recorded time and their own labeled units.{" "}
        {doc.timingNote || "No smoothing or derived measurements are applied."}{" "}
        Values are nearest available samples; the fan target is the embedded
        profile curve. These plots describe the recorded run, not cup quality.
      </p>
      <details className="roast-technical">
        <summary>Channel coverage & timing offsets</summary>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Channel</th>
                <th>Unit</th>
                <th>Recorded offset (not applied)</th>
              </tr>
            </thead>
            <tbody>
              {doc.channels
                .filter((c) => c.index > 0)
                .map((c) => (
                  <tr key={c.key}>
                    <td>{c.label}</td>
                    <td>{c.unit}</td>
                    <td>{c.recordedOffset ?? "Not provided"}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}
