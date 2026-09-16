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
  const existing = store.fileByHash(sha256);
  const old = existing
    ? {
        id: existing.id,
        name: existing.name,
        sha256: existing.sha256,
        createdAt: existing.created_at,
      }
    : null;
  if (old) return { ...old, duplicate: true };
  const data = {
    id: randomUUID(),
    name,
    sha256,
    createdAt: new Date().toISOString(),
  };
  store.addFile({
    id: data.id,
    name,
    sha256,
    content,
    created_at: data.createdAt,
  });
  return { ...data, duplicate: false };
}
export function listFiles(store) {
  return store
    .allFiles()
    .map((f) => ({
      id: f.id,
      name: f.name,
      sha256: f.sha256,
      size: f.content.length,
      createdAt: f.created_at,
    }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
