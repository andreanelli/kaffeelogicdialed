import { z } from "zod";
const text = z.string().trim().min(1).max(200);
const optionalText = z.string().trim().max(2000).default("");
const number = (max) =>
  z.number().finite().min(0).max(max).nullable().default(null);
export const methods = [
  "cupping",
  "espresso",
  "pour-over",
  "immersion",
  "aeropress",
  "other",
];
export const equipmentSchema = z.object({
  name: text,
  category: z.enum(["brewer", "grinder", "roaster", "scale", "other"]),
  brand: text,
  model: text,
  configuration: optionalText,
  calibration: optionalText,
});
export const brewSchema = z
  .object({
    name: text,
    roastId: text,
    brewedAt: z.string().datetime({ offset: true }),
    method: z.enum(methods),
    brewerId: text.nullable().default(null),
    grinderId: text.nullable().default(null),
    grindSetting: optionalText,
    filter: optionalText,
    doseG: number(1000),
    waterInputG: number(10000),
    beverageYieldG: number(10000),
    bypassWaterG: number(10000),
    temperatureC: number(110),
    temperatureLocation: optionalText,
    durationS: number(86400),
    timingOrigin: optionalText,
    pressureBar: number(20),
    waterSource: optionalText,
    hardnessMgLCaCO3: number(2000),
    alkalinityMgLCaCO3: number(2000),
    tdsPercent: number(30),
    storage: optionalText,
    protocol: optionalText,
    notes: z.string().max(10000).default(""),
  })
  .superRefine((b, ctx) => {
    for (const key of ["doseG", "waterInputG", "beverageYieldG"]) {
      if (b[key] === 0)
        ctx.addIssue({
          code: "custom",
          path: [key],
          message: "Use a positive measurement or leave unknown",
        });
    }
    if (
      b.bypassWaterG !== null &&
      b.waterInputG !== null &&
      b.bypassWaterG > b.waterInputG
    )
      ctx.addIssue({
        code: "custom",
        path: ["bypassWaterG"],
        message: "Bypass is part of total water input and cannot exceed it",
      });
  });
const fail = (message, status = 400) =>
  Object.assign(new Error(message), { status });
export function resolveRoast(store, id) {
  const roast = store.get(id, "roast");
  if (roast) return roast;
  const run = store.get(id, "deviceRun");
  if (!run) throw fail("Roast not found", 404);
  return (
    (run.roastId ? store.get(run.roastId, "roast") : null) ||
    store.list("roast").find((r) => run.files.some((f) => f.id === r.fileId)) ||
    run
  );
}
export function registerBrewingRoutes(app, store) {
  app.post("/api/equipment", (req, res) =>
    res
      .status(201)
      .json(store.put("equipment", equipmentSchema.parse(req.body))),
  );
  app.post("/api/brews", (req, res) => {
    const data = brewSchema.parse(req.body);
    const roast = resolveRoast(store, data.roastId);
    data.roastId = roast.id;
    const snapshots = {};
    for (const [key, category] of [
      ["brewerId", "brewer"],
      ["grinderId", "grinder"],
    ]) {
      if (!data[key]) {
        snapshots[category] = null;
        continue;
      }
      const equipment = store.get(data[key], "equipment");
      if (!equipment) throw fail("Equipment not found", 404);
      if (equipment.category !== category)
        throw fail(`Choose a ${category} for ${key}`);
      snapshots[category] = equipment;
    }
    const restHours = roast.roastedAt
      ? (Date.parse(data.brewedAt) - Date.parse(roast.roastedAt)) / 3600000
      : null;
    if (restHours !== null && restHours < 0)
      throw fail("Brew time must not precede roasting");
    res.status(201).json(
      store.put("brew", {
        ...data,
        equipmentSnapshot: snapshots,
        roastSnapshot: roast,
        roastedAtSnapshot: roast.roastedAt || null,
        restHours,
        schemaVersion: 1,
      }),
    );
  });
  app.post("/api/experiments/pilot", (req, res) => {
    const data = z
      .object({
        name: text,
        lotIds: z
          .array(text)
          .length(3)
          .refine(
            (ids) => new Set(ids).size === 3,
            "Choose three different lots",
          ),
        target: optionalText.refine(
          (s) => s.length > 0,
          "Describe your target cup",
        ),
        method: z.enum(methods),
        batchSizeG: z.number().finite().positive().max(1000),
        restHours: z.number().finite().min(0).max(8760),
        controls: optionalText.refine(
          (s) => s.length > 0,
          "Record the fixed brew and equipment conditions",
        ),
      })
      .parse(req.body);
    for (const id of data.lotIds)
      if (!store.get(id, "bean")) throw fail("Coffee lot not found", 404);
    const trials = data.lotIds.flatMap((beanId, i) =>
      ["reference", "alternative", "reference-repeat"].map((condition, j) => ({
        id: `${i + 1}-${j + 1}`,
        beanId,
        condition,
      })),
    );
    res.status(201).json(
      store.put("experiment", {
        name: data.name,
        hypothesis: data.target,
        variable: "One roast choice per lot; repeat the reference",
        status: "planned",
        conclusion: "",
        pilot: { ...data, trials },
        demo: false,
      }),
    );
  });
}
export function checkPilotTrial(store, data, existingId) {
  if (!data.pilotTrialId) return;
  const experiment =
    data.experimentId && store.get(data.experimentId, "experiment");
  const trial = experiment?.pilot?.trials.find(
    (t) => t.id === data.pilotTrialId,
  );
  if (!trial || trial.beanId !== data.beanId)
    throw fail("Pilot trial must match the selected experiment and coffee lot");
  if (
    store
      .list("roast")
      .some(
        (r) =>
          r.id !== existingId &&
          r.experimentId === data.experimentId &&
          r.pilotTrialId === data.pilotTrialId,
      )
  )
    throw fail("This pilot trial already has a roast", 409);
}
