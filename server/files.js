import { createHash, randomUUID } from "node:crypto";
import { basename } from "node:path";
export function archiveFile(store, name, content) {
  if (
    !name ||
    name !== basename(name) ||
    /[\\/\x00-\x1f]/.test(name) ||
    name.length > 200
  )
    throw Object.assign(
      new Error("Use a plain filename, without directories"),
      { status: 400 },
    );
  if (!/\.(kpro|kpro2|klog|json|csv)$/i.test(name))
    throw Object.assign(
      new Error("Supported files: .kpro, .kpro2, .klog, .json, .csv"),
      { status: 400 },
    );
  if (!content.length || content.length > 10 * 1024 * 1024)
    throw Object.assign(new Error("Files must be between 1 byte and 10 MB"), {
      status: 400,
    });
  const sha256 = createHash("sha256").update(content).digest("hex");
  const old = store.db
    .prepare(
      "SELECT id,name,sha256,created_at AS createdAt FROM files WHERE sha256=?",
    )
    .get(sha256);
  if (old) return { ...old, duplicate: true };
  const data = {
    id: randomUUID(),
    name,
    sha256,
    createdAt: new Date().toISOString(),
  };
  store.db
    .prepare("INSERT INTO files VALUES (?,?,?,?,?)")
    .run(data.id, name, sha256, content, data.createdAt);
  return { ...data, duplicate: false };
}
export function listFiles(store) {
  return store.db
    .prepare(
      "SELECT id,name,sha256,length(content) AS size,created_at AS createdAt FROM files ORDER BY created_at DESC",
    )
    .all();
}
