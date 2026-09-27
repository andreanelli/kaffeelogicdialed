import type { State } from "./types";
const Field = ({
  label,
  children,
  wide = false,
}: {
  label: string;
  children: React.ReactNode;
  wide?: boolean;
}) => (
  <label className={`field ${wide ? "wide" : ""}`}>
    <span>{label}</span>
    {children}
  </label>
);
const methods = [
  "cupping",
  "espresso",
  "pour-over",
  "immersion",
  "aeropress",
  "other",
];
const Method = () => (
  <Field label="Preparation method">
    <select name="method" required>
      <option value="">Choose method</option>
      {methods.map((m) => (
        <option key={m}>{m}</option>
      ))}
    </select>
  </Field>
);
export function EquipmentFields() {
  return (
    <>
      <p className="form-note wide">
        Give each physical unit a name. Record a new entry when its burrs or
        calibration change, so past brews keep their original setup.
      </p>
      <Field label="Equipment name">
        <input
          name="name"
          required
          placeholder="Kitchen grinder"
          maxLength={200}
        />
      </Field>
      <Field label="Category">
        <select name="category">
          <option value="brewer">Brewer</option>
          <option value="grinder">Grinder</option>
          <option value="roaster">Roaster</option>
          <option value="scale">Scale</option>
          <option value="other">Other</option>
        </select>
      </Field>
      <Field label="Brand">
        <input name="brand" required maxLength={200} />
      </Field>
      <Field label="Model">
        <input name="model" required maxLength={200} />
      </Field>
      <Field label="Configuration" wide>
        <textarea
          name="configuration"
          placeholder="Burr model, standard or Red Clix axle, basket, firmware…"
          maxLength={2000}
        />
      </Field>
      <Field label="Calibration / zero point" wide>
        <textarea
          name="calibration"
          placeholder="How you establish zero; calibration date and method"
          maxLength={2000}
        />
      </Field>
    </>
  );
}
export function BrewingFields({
  state,
  roastId,
  date,
}: {
  state: State;
  roastId?: string;
  date: string;
}) {
  return (
    <>
      <p className="form-note wide">
        Record what you used. Blank measurements stay unknown. Saved
        preparations are kept unchanged; add a new brew for another attempt.
      </p>
      <Field label="Brew name">
        <input
          name="name"
          required
          placeholder="Morning V60 / sample A"
          maxLength={200}
        />
      </Field>
      <Field label="Roast">
        <select name="roastId" required defaultValue={roastId || ""}>
          <option value="">Select roast</option>
          {state.roasts.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
          {state.deviceRuns
            .filter(
              (r) =>
                !r.roastId &&
                !state.roasts.some((x) =>
                  r.files.some((f) => f.id === x.fileId),
                ),
            )
            .map((r) => (
              <option key={r.id} value={r.id}>
                {r.name} · recorded run
              </option>
            ))}
        </select>
      </Field>
      <Field label="Brewed at">
        <input
          name="brewedAt"
          type="datetime-local"
          required
          defaultValue={date}
        />
      </Field>
      <Method />
      {(
        [
          ["brewerId", "Brewer", "brewer"],
          ["grinderId", "Grinder", "grinder"],
        ] as const
      ).map(([name, label, category]) => (
        <Field key={name} label={label}>
          <select name={name}>
            <option value="">Unknown / not recorded</option>
            {state.equipment
              .filter((e) => e.category === category)
              .map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name} · {e.brand} {e.model}
                </option>
              ))}
          </select>
          <small>Add your setup under Equipment.</small>
        </Field>
      ))}
      <Field label="Grind setting">
        <input
          name="grindSetting"
          placeholder="23 clicks from calibrated zero"
        />
      </Field>
      <Field label="Filter / basket">
        <input name="filter" placeholder="Brand, size, material" />
      </Field>
      {(
        [
          ["doseG", "Dry coffee dose (g)", 1000],
          ["waterInputG", "Total water added, including bypass (g)", 10000],
          ["beverageYieldG", "Final beverage yield (g)", 10000],
          ["bypassWaterG", "Bypass water (g)", 10000],
          ["temperatureC", "Water temperature (°C)", 110],
          ["durationS", "Brew duration (seconds)", 86400],
        ] as const
      ).map(([name, label, max]) => (
        <Field key={name} label={label}>
          <input
            name={name}
            type="number"
            min="0"
            max={max}
            step="any"
            placeholder="Unknown"
          />
        </Field>
      ))}
      <Field label="Temperature location">
        <input
          name="temperatureLocation"
          placeholder="Kettle setpoint, slurry, group head…"
        />
      </Field>
      <Field label="Timer starts at">
        <input
          name="timingOrigin"
          placeholder="First pour, pump on, first drop…"
        />
      </Field>
      <Field label="Water source / recipe" wide>
        <input
          name="waterSource"
          placeholder="Tap + filter, mineral recipe or bottled brand"
        />
      </Field>
      <details className="wide">
        <summary>Water measurements and pressure</summary>
        <div className="form-grid">
          {(
            [
              ["hardnessMgLCaCO3", "Hardness (mg/L as CaCO₃)", 2000],
              ["alkalinityMgLCaCO3", "Alkalinity (mg/L as CaCO₃)", 2000],
              ["tdsPercent", "Beverage TDS (%)", 30],
              ["pressureBar", "Pressure (bar)", 20],
            ] as const
          ).map(([name, label, max]) => (
            <Field key={name} label={label}>
              <input
                name={name}
                type="number"
                min="0"
                max={max}
                step="any"
                placeholder="Not measured"
              />
            </Field>
          ))}
        </div>
      </details>
      <Field label="Storage since roasting" wide>
        <input
          name="storage"
          placeholder="Sealed bag at room temperature; opened today…"
        />
      </Field>
      <Field label="Preparation steps / protocol" wide>
        <textarea
          name="protocol"
          placeholder="Pour schedule, bloom, agitation, preinfusion, dilution, protocol version…"
          maxLength={2000}
        />
      </Field>
      <Field label="Notes / deviations" wide>
        <textarea
          name="notes"
          placeholder="What differed from the plan? Measurement instruments and calibration…"
        />
      </Field>
    </>
  );
}
export function PilotFields({ state }: { state: State }) {
  return (
    <>
      <p className="form-note wide">
        Plan nine batches: a reference, an alternative, and a repeat of the
        reference for each of three lots. Hold brewing conditions and rest time
        fixed. Taste blind in a randomized serving order.
      </p>
      <Field label="Pilot name" wide>
        <input
          name="name"
          defaultValue="Three-lot roast pilot"
          required
          maxLength={200}
        />
      </Field>
      {[1, 2, 3].map((n) => (
        <Field key={n} label={`Coffee lot ${n}`}>
          <select name={`lot${n}`} required>
            <option value="">Choose a different lot</option>
            {state.beans.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </Field>
      ))}
      <Method />
      <Field label="Batch size per roast (g)">
        <input
          name="batchSizeG"
          type="number"
          min=".1"
          max="1000"
          step=".1"
          required
          placeholder="Within your verified profile limits"
        />
      </Field>
      <Field label="Fixed rest before brewing (hours)">
        <input
          name="restHours"
          type="number"
          min="0"
          max="8760"
          step=".1"
          required
        />
      </Field>
      <Field label="Target cup and acceptance rule" wide>
        <textarea
          name="target"
          required
          maxLength={2000}
          placeholder="Desired flavours, dislikes and what counts as success"
        />
      </Field>
      <Field label="Fixed conditions and planned roast comparison" wide>
        <textarea
          name="controls"
          required
          maxLength={2000}
          placeholder="Per lot: reference profile/revision and level, one alternative. Fixed brewer, grinder, dose, water, temperature and recipe. Define blind codes and randomized serving order separately."
        />
      </Field>
    </>
  );
}
