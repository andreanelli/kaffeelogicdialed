import { resolve } from "node:path";
import { openDb } from "./db.js";
import { createApp } from "./app.js";
const store = openDb(
  resolve(process.env.DIALED_DATA_DIR || "data", "dialed.sqlite"),
);
const app = createApp(store, {
  readDir: process.env.DIALED_IMPORT_DIR,
  writeDir: process.env.DIALED_PROFILE_OUTBOX,
});
const server = app.listen(3001, "127.0.0.1", () =>
  console.log("Dialed API → http://127.0.0.1:3001"),
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () =>
    server.close(() => {
      store.db.close();
      process.exit(0);
    }),
  );
