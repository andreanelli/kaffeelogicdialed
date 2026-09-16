import express from "express";
import { resolve } from "node:path";
import { z } from "zod";
import { SimulatorAdapter, StudioFolderAdapter } from "./device.js";
import { registerNotebookRoutes } from "./notebook-routes.js";
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
  registerNotebookRoutes(app, store, { ...config, device, folder });
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
