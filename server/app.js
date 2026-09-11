import { registerImportRoutes } from "./import-routes.js";
import express from "express";
import { resolve } from "node:path";
import { z } from "zod";
import {
  beanSchema,
  profileSchema,
  roastSchema,
  cuppingSchema,
  experimentSchema,
} from "./schema.js";
import { archiveFile, listFiles } from "./files.js";
import { SimulatorAdapter, StudioFolderAdapter } from "./device.js";
import { seedDemo } from "./seed.js";
const fail = (message, status = 400) =>
  Object.assign(new Error(message), { status });
export function createApp(store, config = {}) {
  const app = express();
  const device = new SimulatorAdapter(store);
  const folder = new StudioFolderAdapter(store, config);
  app.disable("x-powered-by");
  app.use((req, res, next) => {
    const host = req.hostname;
    if (!["127.0.0.1", "localhost", "[::1]", "::1"].includes(host))
      return res
        .status(403)
        .json({ error: "Dialed currently accepts localhost requests only." });
    const origin = req.headers.origin;
    if (
      origin &&
      !/^http:\/\/(localhost|127\.0\.0\.1)(:5173|:3001)?$/.test(origin)
    )
      return res.status(403).json({ error: "Origin is not allowed" });
    res.setHeader("X-Content-Type-Options", "nosniff");
    next();
  });
  app.use(express.json({ limit: "15mb" }));
  const need = (id, kind) => {
    const value = store.get(id, kind);
    if (!value) throw fail(`${kind} not found`, 404);
    return value;
  };
  registerImportRoutes(app, store);
  app.get("/api/health", (_, res) => res.json({ ok: true }));
  app.get("/api/state", (_, res) =>
    res.json(
      Object.fromEntries(
        ["bean", "profile", "version", "roast", "cupping", "experiment"]
          .map((k) => [k + "s", store.list(k)])
          .concat([["files", listFiles(store)]]),
      ),
    ),
  );
  app.post("/api/demo", (_, res) => {
    seedDemo(store);
    res.json({ ok: true });
  });
  app.delete("/api/demo", (_, res) => {
    const demoIds = store.db
      .prepare("SELECT id FROM entities WHERE json_extract(data,'$.demo')=1")
      .all()
      .map((r) => r.id);
    const referenced = new Set(
      store.db
        .prepare(
          "SELECT data FROM entities WHERE COALESCE(json_extract(data,'$.demo'),0)!=1",
        )
        .all()
        .flatMap((r) => {
          const d = JSON.parse(r.data);
          return [
            d.beanId,
            d.profileVersionId,
            d.profileId,
            d.experimentId,
            d.roastId,
            d.versionId,
          ];
        }),
    );
    if (demoIds.some((id) => referenced.has(id)))
      throw fail(
        "Some of your records reference sample data. Keep the samples to preserve their history.",
        409,
      );
    store.transaction(() => {
      store.db
        .prepare("DELETE FROM entities WHERE json_extract(data,'$.demo')=1")
        .run();
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
    const file = store.db
      .prepare("SELECT * FROM files WHERE id=?")
      .get(z.string().parse(req.body.fileId));
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
    if (
      data.fileId &&
      !store.db.prepare("SELECT id FROM files WHERE id=?").get(data.fileId)
    )
      throw fail("File not found", 404);
  };
  app.post("/api/roasts", (req, res) => {
    const data = roastSchema.parse(req.body);
    checkRoast(data);
    res.status(201).json(
      store.transaction(() => {
        const bean = need(data.beanId, "bean");
        if (bean.stock < data.greenWeight)
          throw fail("Not enough green coffee in this lot.");
        store.put(
          "bean",
          { ...bean, stock: bean.stock - data.greenWeight },
          bean.id,
        );
        return store.put("roast", data);
      }),
    );
  });
  app.put("/api/roasts/:id", (req, res) => {
    const old = need(req.params.id, "roast");
    const data = roastSchema.parse(req.body);
    checkRoast(data);
    res.json(
      store.transaction(() => {
        // Sample roasts did not consume stock when seeded.
        if (!old.demo && old.inventoryConsumed !== false) {
          const original = need(old.beanId, "bean");
          store.put(
            "bean",
            { ...original, stock: original.stock + old.greenWeight },
            original.id,
          );
        }
        if (old.inventoryConsumed !== false) {
          const bean = need(data.beanId, "bean");
          if (bean.stock < data.greenWeight)
            throw fail("Not enough green coffee in this lot.");
          store.put(
            "bean",
            { ...bean, stock: bean.stock - data.greenWeight },
            bean.id,
          );
        }
        return store.put("roast", { ...old, ...data, demo: false }, old.id);
      }),
    );
  });
  app.post("/api/cuppings", (req, res) => {
    const data = cuppingSchema.parse(req.body);
    need(data.roastId, "roast");
    res.status(201).json(store.put("cupping", data));
  });
  app.post("/api/experiments", (req, res) =>
    res
      .status(201)
      .json(store.put("experiment", experimentSchema.parse(req.body))),
  );
  app.put("/api/experiments/:id", (req, res) => {
    const old = need(req.params.id, "experiment");
    res.json(
      store.put(
        "experiment",
        { ...old, ...experimentSchema.parse(req.body), demo: false },
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
    const f = store.db
      .prepare("SELECT * FROM files WHERE id=?")
      .get(req.params.id);
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
    const records = store.db
      .prepare("SELECT kind,data FROM entities")
      .all()
      .map((r) => ({ kind: r.kind, data: JSON.parse(r.data) }));
    const files = store.db
      .prepare("SELECT * FROM files")
      .all()
      .map((f) => ({
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
  app.use("/api", (_, res) =>
    res.status(404).json({ error: "Endpoint not found" }),
  );
  app.use(express.static(resolve("dist")));
  app.get("/{*path}", (_, res) => res.sendFile(resolve("dist/index.html")));
  app.use((err, req, res, next) => {
    if (err instanceof z.ZodError)
      return res.status(400).json({
        error: err.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; "),
      });
    const status = err.status || 500;
    if (status >= 500) console.error(err);
    res.status(status).json({
      error:
        status >= 500
          ? "An internal error occurred. See the backend log."
          : err.message,
    });
  });
  return app;
}
