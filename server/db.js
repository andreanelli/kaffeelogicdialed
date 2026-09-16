import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
export function openDb(path) {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS entities (id TEXT PRIMARY KEY, kind TEXT NOT NULL, data TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS entities_kind ON entities(kind);
    CREATE TABLE IF NOT EXISTS files (id TEXT PRIMARY KEY, name TEXT NOT NULL, sha256 TEXT UNIQUE NOT NULL, content BLOB NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    PRAGMA user_version=1;`);
  const store = {
    db,
    list(kind) {
      return db
        .prepare(
          "SELECT data FROM entities WHERE kind=? ORDER BY created_at DESC, rowid DESC",
        )
        .all(kind)
        .map((r) => JSON.parse(r.data));
    },
    get(id, kind) {
      const r = db
        .prepare("SELECT data FROM entities WHERE id=? AND kind=?")
        .get(id, kind);
      return r ? JSON.parse(r.data) : null;
    },
    put(kind, data, id = randomUUID()) {
      const old = store.get(id, kind);
      const value = {
        ...data,
        id,
        createdAt: old?.createdAt || new Date().toISOString(),
      };
      db.prepare(
        "INSERT INTO entities VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data",
      ).run(id, kind, JSON.stringify(value), value.createdAt);
      return value;
    },
    transaction(fn) {
      db.exec("BEGIN IMMEDIATE");
      try {
        const out = fn();
        db.exec("COMMIT");
        return out;
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    },
    meta(key, value) {
      if (value !== undefined)
        db.prepare(
          "INSERT INTO meta VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
        ).run(key, JSON.stringify(value));
      const row = db.prepare("SELECT value FROM meta WHERE key=?").get(key);
      return row ? JSON.parse(row.value) : null;
    },
  };
  Object.assign(store, {
    initImports() {
      db.exec(
        "CREATE TABLE IF NOT EXISTS import_keys (key TEXT PRIMARY KEY, entity_id TEXT NOT NULL, fingerprint TEXT NOT NULL, batch_id TEXT NOT NULL)",
      );
    },
    allEntities: () =>
      db
        .prepare("SELECT id,kind,data,created_at FROM entities ORDER BY rowid")
        .all(),
    allFiles: () => db.prepare("SELECT * FROM files ORDER BY rowid").all(),
    file: (id) => db.prepare("SELECT * FROM files WHERE id=?").get(id),
    fileByHash: (hash) =>
      db.prepare("SELECT * FROM files WHERE sha256=?").get(hash),
    addFile: (f) =>
      db
        .prepare("INSERT INTO files VALUES (?,?,?,?,?)")
        .run(f.id, f.name, f.sha256, f.content, f.created_at),
    remove: (id) => db.prepare("DELETE FROM entities WHERE id=?").run(id),
    removeFile: (id) => db.prepare("DELETE FROM files WHERE id=?").run(id),
    importKey: (key) =>
      db.prepare("SELECT * FROM import_keys WHERE key=?").get(key),
    addImportKey: (key, id, hash, batch) =>
      db
        .prepare("INSERT INTO import_keys VALUES (?,?,?,?)")
        .run(key, id, hash, batch),
    removeImportKeys: (field, value) => {
      if (!["entity_id", "batch_id"].includes(field))
        throw new Error("Invalid key field");
      db.prepare(`DELETE FROM import_keys WHERE ${field}=?`).run(value);
    },
  });
  return store;
}
