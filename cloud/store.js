import { randomUUID } from "node:crypto";
// Request-scoped unit of work. PostgreSQL commits its changes with an optimistic
// workspace revision check; no process-global state is shared between users.
export function createCloudStore(snapshot) {
  let entities = new Map(
    snapshot.entities.map((r) => [r.id, structuredClone(r)]),
  );
  let files = new Map(
    snapshot.files.map((f) => [
      f.id,
      { ...f, content: Buffer.from(f.content, "base64") },
    ]),
  );
  let keys = new Map(snapshot.keys.map((k) => [k.key, { ...k }]));
  let metadata = new Map(
    snapshot.meta.map((m) => [m.key, structuredClone(m.value)]),
  );
  const store = {
    initImports() {},
    allEntities: () => [...entities.values()],
    allFiles: () => [...files.values()],
    list: (kind) =>
      [...entities.values()]
        .filter((r) => r.kind === kind)
        .reverse()
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .map((r) => JSON.parse(r.data)),
    get: (id, kind) =>
      entities.get(id)?.kind === kind
        ? JSON.parse(entities.get(id).data)
        : null,
    put(kind, data, id = randomUUID()) {
      const old = store.get(id, kind);
      if (entities.has(id) && !old) throw new Error("Record identity conflict");
      const value = {
        ...data,
        id,
        createdAt: old?.createdAt || new Date().toISOString(),
      };
      entities.set(id, {
        id,
        kind,
        data: JSON.stringify(value),
        created_at: value.createdAt,
      });
      return value;
    },
    file: (id) => files.get(id),
    fileByHash: (hash) => [...files.values()].find((f) => f.sha256 === hash),
    addFile: (f) => {
      if (files.has(f.id) || store.fileByHash(f.sha256))
        throw new Error("Duplicate file");
      files.set(f.id, { ...f, content: Buffer.from(f.content) });
    },
    remove: (id) => entities.delete(id),
    removeFile: (id) => files.delete(id),
    importKey: (key) => keys.get(key),
    addImportKey(key, id, hash, batch) {
      if (keys.has(key)) throw new Error("Duplicate import key");
      keys.set(key, { key, entity_id: id, fingerprint: hash, batch_id: batch });
    },
    removeImportKeys(field, value) {
      if (!["entity_id", "batch_id"].includes(field))
        throw new Error("Invalid key field");
      for (const [k, v] of keys) if (v[field] === value) keys.delete(k);
    },
    meta(key, value) {
      if (value !== undefined) metadata.set(key, structuredClone(value));
      return structuredClone(metadata.get(key) ?? null);
    },
    transaction(fn) {
      const before = store.snapshot();
      try {
        return fn();
      } catch (e) {
        const restored = createCloudStore(before);
        entities = new Map(restored.allEntities().map((r) => [r.id, r]));
        files = new Map(restored.allFiles().map((f) => [f.id, f]));
        keys = new Map(before.keys.map((k) => [k.key, k]));
        metadata = new Map(before.meta.map((m) => [m.key, m.value]));
        throw e;
      }
    },
    snapshot: () => ({
      entities: [...entities.values()],
      files: [...files.values()].map((f) => ({
        ...f,
        content: Buffer.from(f.content).toString("base64"),
      })),
      keys: [...keys.values()],
      meta: [...metadata].map(([key, value]) => ({ key, value })),
    }),
  };
  return store;
}
export function changes(before, after) {
  const diff = (oldRows, newRows, key) => {
    const old = new Map(oldRows.map((r) => [r[key], JSON.stringify(r)]));
    const fresh = new Map(newRows.map((r) => [r[key], r]));
    return {
      upsert: newRows.filter((r) => old.get(r[key]) !== JSON.stringify(r)),
      delete: [...old.keys()].filter((k) => !fresh.has(k)),
    };
  };
  return {
    entities: diff(before.entities, after.entities, "id"),
    files: diff(before.files, after.files, "id"),
    keys: diff(before.keys, after.keys, "key"),
    meta: diff(before.meta, after.meta, "key"),
  };
}
