import {
  readdir,
  readFile,
  realpath,
  lstat,
  open,
  unlink,
} from "node:fs/promises";
import { resolve, relative, isAbsolute, join } from "node:path";
import { createHash } from "node:crypto";
import { archiveFile } from "./files.js";
const fail = (msg, status = 400) => Object.assign(new Error(msg), { status });
/** Studio owns USB transport. This adapter accesses only explicitly configured folders. */
export class StudioFolderAdapter {
  constructor(store, { readDir, writeDir } = {}) {
    this.store = store;
    this.readDir = readDir;
    this.writeDir = writeDir;
  }
  async scan() {
    if (!this.readDir)
      throw fail(
        "Set DIALED_IMPORT_DIR on the backend to enable folder import.",
      );
    const root = await realpath(this.readDir);
    let imported = 0,
      duplicates = 0;
    const errors = [];
    let visited = 0;
    const walk = async (dir, depth = 0) => {
      if (depth > 5) return;
      for (const entry of await readdir(dir, { withFileTypes: true })) {
        if (++visited > 2000)
          throw fail(
            "Folder scan exceeded 2,000 entries. Choose a smaller import folder.",
          );
        const path = join(dir, entry.name);
        if (entry.isSymbolicLink()) continue;
        if (entry.isDirectory()) {
          await walk(path, depth + 1);
          continue;
        }
        if (!entry.isFile() || !/\.(kpro|kpro2|klog)$/i.test(entry.name))
          continue;
        try {
          const canonical = await realpath(path);
          const rel = relative(root, canonical);
          if (rel.startsWith("..") || isAbsolute(rel)) continue;
          if ((await lstat(canonical)).size > 10 * 1024 * 1024)
            throw fail("File exceeds 10 MB");
          const result = archiveFile(
            this.store,
            entry.name,
            await readFile(canonical),
          );
          result.duplicate ? duplicates++ : imported++;
        } catch (e) {
          errors.push({ name: entry.name, error: e.message });
        }
      }
    };
    await walk(root);
    return { imported, duplicates, errors };
  }
  async stage(fileId) {
    if (!this.writeDir)
      throw fail(
        "Set DIALED_PROFILE_OUTBOX on the backend to enable profile staging.",
      );
    const file = this.store.file(fileId);
    if (!file) throw fail("File not found", 404);
    if (!/\.(kpro|kpro2)$/i.test(file.name))
      throw fail("Only original Kaffelogic profile files can be staged.");
    const root = await realpath(this.writeDir);
    const destination = resolve(root, file.name);
    if (relative(root, destination) !== file.name)
      throw fail("Invalid filename");
    let handle;
    try {
      handle = await open(destination, "wx", 0o600);
    } catch (e) {
      if (e.code === "EEXIST")
        throw fail(
          "A file with this name already exists. Nothing was overwritten.",
          409,
        );
      throw e;
    }
    try {
      await handle.writeFile(file.content);
      await handle.sync();
    } catch (e) {
      await handle.close();
      await unlink(destination);
      throw e;
    }
    await handle.close();
    const actual = createHash("sha256")
      .update(await readFile(destination))
      .digest("hex");
    if (actual !== file.sha256)
      throw fail("Staged file checksum did not match", 500);
    return {
      name: file.name,
      status: "staged",
      message:
        "Original file copied to the outbox. Roaster delivery is not confirmed.",
    };
  }
}
export class SimulatorAdapter {
  constructor(store) {
    this.store = store;
    this.connected = false;
  }
  status() {
    return {
      mode: "simulator",
      connected: this.connected,
      hardwareVerified: false,
      profiles: this.store.list("deviceProfile"),
      jobs: this.store.list("syncJob").slice(0, 30),
    };
  }
  connect() {
    this.connected = true;
    return this.status();
  }
  disconnect() {
    this.connected = false;
    return this.status();
  }
  sync(versionId) {
    if (!this.connected) throw fail("Connect the simulator first.", 409);
    const version = this.store.get(versionId, "version");
    if (!version) throw fail("Profile revision not found", 404);
    const hash = createHash("sha256")
      .update(JSON.stringify(version))
      .digest("hex");
    const existing = this.store
      .list("deviceProfile")
      .find((p) => p.profileId === version.profileId);
    if (existing?.hash === hash)
      return {
        status: "unchanged",
        message: "This exact revision is already in the simulator.",
      };
    return this.store.transaction(() => {
      this.store.put(
        "deviceProfile",
        {
          profileId: version.profileId,
          versionId,
          hash,
          name: version.name,
          syncedAt: new Date().toISOString(),
        },
        existing?.id,
      );
      return this.store.put("syncJob", {
        versionId,
        name: version.name,
        status: "simulated",
        hash,
        completedAt: new Date().toISOString(),
      });
    });
  }
}
