import { registerKnowledgeRoutes, evidenceFor } from "./knowledge.js";
import {
  registerBrewingRoutes,
  resolveRoast,
  checkPilotTrial,
} from "./brewing.js";
import { syncRoastRun, notebookRuns } from "./roast-runs.js";
import { registerRecordRoutes } from "./records.js";
import { registerImportRoutes } from "./import-routes.js";
import { z } from "zod";
import {
  beanSchema,
  profileSchema,
  roastSchema,
  cuppingSchema,
  experimentSchema,
} from "./schema.js";
import { archiveFile, listFiles } from "./files.js";
import { seedDemo } from "./seed.js";
const fail = (message, status = 400) =>
  Object.assign(new Error(message), { status });
export function registerNotebookRoutes(
  app,
  store,
  { device, folder, ...config },
) {
  const need = (id, kind) => {
    const value = store.get(id, kind);
    if (!value) throw fail(`${kind} not found`, 404);
    return value;
  };
  registerKnowledgeRoutes(app);
  registerBrewingRoutes(app, store);
  registerImportRoutes(app, store);
  registerRecordRoutes(app, store);
  app.get("/api/health", (_, res) => res.json({ ok: true }));
  app.get("/api/state", (_, res) =>
    res.json(
      Object.fromEntries(
        ["bean", "profile", "version", "roast", "cupping", "experiment", "brew"]
          .map((k) => [k + "s", store.list(k)])
          .concat([
            ["files", listFiles(store)],
            ["equipment", store.list("equipment")],
            ["deviceRuns", notebookRuns(store)],
          ]),
      ),
    ),
  );
  app.post("/api/demo", (_, res) => {
    seedDemo(store);
    res.json({ ok: true });
  });
  app.delete("/api/demo", (_, res) => {
    const demoIds = store
      .allEntities()
      .filter((r) => JSON.parse(r.data).demo)
      .map((r) => r.id);
    const referenced = new Set(
      store
        .allEntities()
        .filter((r) => !JSON.parse(r.data).demo)
        .flatMap((r) => {
          const d = JSON.parse(r.data);
          return [
            d.beanId,
            d.profileVersionId,
            d.profileId,
            d.experimentId,
            d.roastId,
            d.versionId,
            d.brewId,
            d.brewerId,
            d.grinderId,
            ...(d.pilot?.lotIds || []),
          ];
        }),
    );
    if (demoIds.some((id) => referenced.has(id)))
      throw fail(
        "Some of your records reference sample data. Keep the samples to preserve their history.",
        409,
      );
    store.transaction(() => {
      for (const id of demoIds) store.remove(id);
      store.meta("demoSeeded", false);
    });
    res.json({ ok: true });
  });
  app.post("/api/beans", (req, res) =>
    res.status(201).json(store.put("bean", beanSchema.parse(req.body))),
  );
  app.put("/api/beans/:id", (req, res) => {
    const old = need(req.params.id, "bean");
    res.json(
      store.put(
        "bean",
        { ...old, ...beanSchema.parse(req.body), demo: false },
        old.id,
      ),
    );
  });
  app.post("/api/profiles", (req, res) => {
    const data = profileSchema.parse(req.body);
    res.status(201).json(
      store.transaction(() => {
        const p = store.put("profile", {
          name: data.name,
          description: data.description,
        });
        const v = store.put("version", { ...data, profileId: p.id, number: 1 });
        return { profile: p, version: v };
      }),
    );
  });
  app.post("/api/profiles/:id/versions", (req, res) => {
    const p = need(req.params.id, "profile");
    if (store.list("version").some((v) => v.profileId === p.id && v.native))
      throw fail(
        "Use the native revision editor to preserve the original settings.",
      );
    const data = profileSchema.parse(req.body);
    res.status(201).json(
      store.transaction(() => {
        const number =
          1 +
          Math.max(
            0,
            ...store
              .list("version")
              .filter((v) => v.profileId === p.id)
              .map((v) => v.number),
          );
        const v = store.put("version", { ...data, profileId: p.id, number });
        store.put(
          "profile",
          { ...p, name: data.name, description: data.description },
          p.id,
        );
        return v;
      }),
    );
  });
  app.get("/api/versions/:id/export", (req, res) => {
    const v = need(req.params.id, "version");
    res.attachment(`dialed-profile-v${v.number}.json`).json({
      format: "dialed-profile",
      formatVersion: 1,
      profile: {
        name: v.name,
        description: v.description,
        level: v.level,
        points: v.points,
        changeNote: v.changeNote,
      },
    });
  });
  app.post("/api/profiles/import", (req, res) => {
    const file = store.file(z.string().parse(req.body.fileId));
    if (!file) throw fail("File not found", 404);
    let parsed;
    try {
      parsed = JSON.parse(Buffer.from(file.content).toString("utf8"));
    } catch {
      throw fail(
        "This is not a Dialed JSON profile. Native files are archived intact; decoding is not yet supported.",
      );
    }
    if (parsed.format !== "dialed-profile" || parsed.formatVersion !== 1)
      throw fail("Expected a Dialed profile JSON, version 1.");
    const data = profileSchema.parse(parsed.profile);
    res.status(201).json(
      store.transaction(() => {
        const p = store.put("profile", {
          name: data.name,
          description: data.description,
        });
        return store.put("version", {
          ...data,
          profileId: p.id,
          number: 1,
          sourceFileId: file.id,
        });
      }),
    );
  });
  const checkRoast = (data) => {
    need(data.beanId, "bean");
    need(data.profileVersionId, "version");
    if (data.experimentId) need(data.experimentId, "experiment");
    if (data.fileId && !store.file(data.fileId))
      throw fail("File not found", 404);
  };
  app.post("/api/roasts", (req, res) => {
    const data = roastSchema.parse(req.body);
    checkRoast(data);
    checkPilotTrial(store, data);
    res.status(201).json(
      store.transaction(() => {
        const bean = need(data.beanId, "bean");
        if (bean.stock !== null && bean.stock < data.greenWeight)
          throw fail("Not enough green coffee in this lot.");
        store.put(
          "bean",
          {
            ...bean,
            stock: bean.stock === null ? null : bean.stock - data.greenWeight,
          },
          bean.id,
        );
        const roast = store.put("roast", {
          ...data,
          inventoryConsumed: bean.stock !== null,
        });
        syncRoastRun(store, roast);
        return roast;
      }),
    );
  });
  app.put("/api/roasts/:id", (req, res) => {
    const old = need(req.params.id, "roast");
    const data = roastSchema.parse(req.body);
    checkRoast(data);
    checkPilotTrial(store, data, old.id);
    if (
      store.list("brew").some((b) => b.roastId === old.id) &&
      ["beanId", "profileVersionId", "roastedAt"].some(
        (k) => old[k] !== data[k],
      )
    )
      throw fail(
        "This roast has brews. Its coffee, profile revision and roast time must stay unchanged to preserve tasting history.",
        409,
      );
    res.json(
      store.transaction(() => {
        // Sample roasts did not consume stock when seeded.
        if (!old.demo && old.inventoryConsumed !== false) {
          const original = need(old.beanId, "bean");
          store.put(
            "bean",
            {
              ...original,
              stock:
                original.stock === null
                  ? null
                  : original.stock + old.greenWeight,
            },
            original.id,
          );
        }
        if (old.inventoryConsumed !== false) {
          const bean = need(data.beanId, "bean");
          if (bean.stock !== null && bean.stock < data.greenWeight)
            throw fail("Not enough green coffee in this lot.");
          store.put(
            "bean",
            {
              ...bean,
              stock: bean.stock === null ? null : bean.stock - data.greenWeight,
            },
            bean.id,
          );
        }
        const roast = store.put(
          "roast",
          { ...old, ...data, demo: false },
          old.id,
        );
        syncRoastRun(store, roast);
        return roast;
      }),
    );
  });
  app.post("/api/cuppings", (req, res) => {
    const data = cuppingSchema.parse(req.body);
    data.roastId = resolveRoast(store, data.roastId).id;
    if (data.brewId) {
      const brew = need(data.brewId, "brew");
      if (brew.roastId !== data.roastId)
        throw fail("Tasting and brew must refer to the same roast");
      if (Date.parse(data.tastedAt) < Date.parse(brew.brewedAt))
        throw fail("Tasting time must not precede brewing");
    }
    res.status(201).json(store.put("cupping", data));
  });
  app.post("/api/experiments", (req, res) => {
    const data = experimentSchema.parse(req.body);
    res.status(201).json(
      store.put("experiment", {
        ...data,
        evidence: evidenceFor(data.referenceIds),
      }),
    );
  });
  app.put("/api/experiments/:id", (req, res) => {
    const old = need(req.params.id, "experiment");
    const data = experimentSchema.parse(req.body);
    if (req.body.referenceIds === undefined)
      data.referenceIds = old.referenceIds || [];
    res.json(
      store.put(
        "experiment",
        {
          ...old,
          ...data,
          evidence: evidenceFor(data.referenceIds, old.evidence || []),
          demo: false,
        },
        old.id,
      ),
    );
  });
  app.post("/api/files", (req, res) => {
    const data = z
      .object({
        name: z.string(),
        base64: z
          .string()
          .min(1)
          .max(14000000)
          .regex(
            /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/,
          ),
      })
      .parse(req.body);
    const result = archiveFile(
      store,
      data.name,
      Buffer.from(data.base64, "base64"),
    );
    res.status(result.duplicate ? 200 : 201).json(result);
  });
  app.get("/api/files/:id/download", (req, res) => {
    const f = store.file(req.params.id);
    if (!f) throw fail("File not found", 404);
    res
      .attachment(f.name)
      .type("application/octet-stream")
      .send(Buffer.from(f.content));
  });
  app.get("/api/device", (_, res) =>
    res.json({
      ...device.status(),
      folder: { canImport: !!config.readDir, canStage: !!config.writeDir },
    }),
  );
  app.post("/api/device/connect", (_, res) => res.json(device.connect()));
  app.post("/api/device/disconnect", (_, res) => res.json(device.disconnect()));
  app.post("/api/device/sync", (req, res) =>
    res.json(device.sync(z.string().parse(req.body.versionId))),
  );
  app.post("/api/device/import-folder", async (_, res) =>
    res.json(await folder.scan()),
  );
  app.post("/api/device/stage", async (req, res) =>
    res.json(await folder.stage(z.string().parse(req.body.fileId))),
  );
  app.get("/api/backup", (_, res) => {
    const records = store
      .allEntities()
      .map((r) => ({ kind: r.kind, data: JSON.parse(r.data) }));
    const files = store.allFiles().map((f) => ({
      ...f,
      content: Buffer.from(f.content).toString("base64"),
    }));
    res
      .attachment(`dialed-backup-${new Date().toISOString().slice(0, 10)}.json`)
      .json({
        format: "dialed-backup",
        version: 1,
        exportedAt: new Date().toISOString(),
        records,
        files,
      });
  });
}
