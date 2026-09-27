import type { Brew, State, Cupping, Experiment } from "./types";
import type { Editor } from "./Forms";
const measurement = (value: number | null | undefined, unit: string) =>
  value == null ? "Unknown" : `${value} ${unit}`;
export function BrewSummary({ brew }: { brew: Brew }) {
  return (
    <>
      <p>
        {brew.method} · {new Date(brew.brewedAt).toLocaleString()} · rest{" "}
        {measurement(
          brew.restHours == null ? null : Math.round(brew.restHours * 10) / 10,
          "h",
        )}
      </p>
      <dl className="brew-facts">
        <div>
          <dt>Coffee dose</dt>
          <dd>{measurement(brew.doseG, "g")}</dd>
        </div>
        <div>
          <dt>Total water</dt>
          <dd>{measurement(brew.waterInputG, "g")}</dd>
        </div>
        <div>
          <dt>Beverage yield</dt>
          <dd>{measurement(brew.beverageYieldG, "g")}</dd>
        </div>
        <div>
          <dt>Bypass</dt>
          <dd>{measurement(brew.bypassWaterG, "g")}</dd>
        </div>
        <div>
          <dt>Temperature</dt>
          <dd>
            {measurement(brew.temperatureC, "°C")} {brew.temperatureLocation}
          </dd>
        </div>
        <div>
          <dt>Duration</dt>
          <dd>
            {measurement(brew.durationS, "s")} {brew.timingOrigin}
          </dd>
        </div>
      </dl>
      <details>
        <summary>Equipment, water and preparation</summary>
        {(["brewer", "grinder"] as const).map((k) => {
          const e = brew.equipmentSnapshot[k];
          return (
            <p key={k}>
              <strong>{k}: </strong>
              {e
                ? `${e.name} · ${e.brand} ${e.model}. ${e.configuration} ${e.calibration}`
                : "Unknown"}
            </p>
          );
        })}
        <p>
          Grind: {brew.grindSetting || "Unknown"} · Filter/basket:{" "}
          {brew.filter || "Unknown"}
        </p>
        <p>
          Water: {brew.waterSource || "Unknown"}; hardness{" "}
          {measurement(brew.hardnessMgLCaCO3, "mg/L as CaCO₃")}; alkalinity{" "}
          {measurement(brew.alkalinityMgLCaCO3, "mg/L as CaCO₃")}
        </p>
        <p>
          TDS: {measurement(brew.tdsPercent, "%")} · Pressure:{" "}
          {measurement(brew.pressureBar, "bar")}
        </p>
        <p>Storage: {brew.storage || "Unknown"}</p>
        <p>{brew.protocol || "Preparation steps not recorded."}</p>
        <p>{brew.notes}</p>
      </details>
    </>
  );
}
export function BrewingPage({
  state,
  onEdit,
}: {
  state: State;
  onEdit: (e: Editor) => void;
}) {
  return (
    <div className="cupping-grid">
      {state.brews.length ? (
        state.brews.map((b) => (
          <section className="panel padded" key={b.id}>
            <span className="eyebrow">
              {state.roasts.find((r) => r.id === b.roastId)?.name ||
                state.deviceRuns.find((r) => r.id === b.roastId)?.name ||
                "Recorded roast"}
            </span>
            <h2>{b.name}</h2>
            <BrewSummary brew={b} />
            <p>
              {state.cuppings.filter((c) => c.brewId === b.id).length} tasting
              assessments
            </p>
            <button
              className="button"
              onClick={() =>
                onEdit({ type: "cupping", roastId: b.roastId, brewId: b.id })
              }
            >
              Taste this brew
            </button>
          </section>
        ))
      ) : (
        <section className="panel padded">
          <h2>Connect the roast to the cup.</h2>
          <p>
            Add your equipment, then record a preparation with its dose, water,
            grind and timing.
          </p>
          <button className="button" onClick={() => onEdit({ type: "brew" })}>
            Record a brew
          </button>
        </section>
      )}
    </div>
  );
}
export function EquipmentPage({ state }: { state: State }) {
  return (
    <div className="cupping-grid">
      {state.equipment.length ? (
        state.equipment.map((e) => (
          <section className="panel padded" key={e.id}>
            <span className="eyebrow">{e.category}</span>
            <h2>{e.name}</h2>
            <p>
              {e.brand} · {e.model}
            </p>
            <p>{e.configuration || "Configuration not recorded."}</p>
            <p>{e.calibration || "Calibration not recorded."}</p>
          </section>
        ))
      ) : (
        <section className="panel padded">
          <h2>Your equipment, precisely recorded.</h2>
          <p>
            Add a named brewer and grinder, including burr configuration and
            zero point. Each brew preserves the setup it used.
          </p>
        </section>
      )}
    </div>
  );
}
export function TastingContext({ cup, state }: { cup: Cupping; state: State }) {
  const brew = state.brews.find((b) => b.id === cup.brewId);
  return (
    <div className="tasting-context">
      <p>
        {cup.blindCode ? `Sample ${cup.blindCode} · ` : ""}Liking:{" "}
        {measurement(cup.liking, "/ 5")} · Target match:{" "}
        {measurement(cup.targetMatch, "/ 5")}
      </p>
      {cup.descriptors && <p>{cup.descriptors}</p>}
      {brew ? (
        <details>
          <summary>Brew: {brew.name}</summary>
          <BrewSummary brew={brew} />
        </details>
      ) : (
        <p className="muted">Brew conditions unknown</p>
      )}
    </div>
  );
}
export function PilotProgress({
  experiment,
  state,
  onEdit,
}: {
  experiment: Experiment;
  state: State;
  onEdit: (e: Editor) => void;
}) {
  const p = experiment.pilot;
  if (!p) return null;
  return (
    <details className="pilot-progress">
      <summary>
        Controlled pilot ·{" "}
        {
          p.trials.filter((t) =>
            state.roasts.some(
              (r) =>
                r.experimentId === experiment.id && r.pilotTrialId === t.id,
            ),
          ).length
        }{" "}
        / 9 batches logged
      </summary>
      <p>
        {p.method} · {p.batchSizeG} g per roast · {p.restHours} h planned rest
      </p>
      <p>{p.controls}</p>
      {p.trials.map((t) => {
        const r = state.roasts.find(
          (r) => r.experimentId === experiment.id && r.pilotTrialId === t.id,
        );
        const brews = r ? state.brews.filter((b) => b.roastId === r.id) : [];
        const cups = state.cuppings.filter((c) =>
          brews.some((b) => b.id === c.brewId),
        );
        return (
          <div className="pilot-trial" key={t.id}>
            <strong>
              {t.id} · {state.beans.find((b) => b.id === t.beanId)?.name} ·{" "}
              {t.condition}
            </strong>
            <small>
              {r
                ? `${brews.length} brews · ${cups.length} linked assessments`
                : "Planned"}
            </small>
            <button
              className="button"
              onClick={() =>
                onEdit(
                  r
                    ? { type: "brew", roastId: r.id }
                    : {
                        type: "roast",
                        preset: {
                          beanId: t.beanId,
                          experimentId: experiment.id,
                          pilotTrialId: t.id,
                          name: `${experiment.name} / ${t.id} ${t.condition}`,
                          greenWeight: p.batchSizeG,
                        },
                      },
                )
              }
            >
              {r ? "Record brew" : "Log trial roast"}
            </button>
          </div>
        );
      })}
    </details>
  );
}
