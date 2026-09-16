import { parseNative } from "./codecs/native.js";
import { fingerprint } from "./imports.js";

// Group alternate source files by recorded session identity; retain every file.
export function catalogRuns(store) {
  const groups = new Map();
  for (const file of store.allFiles()) {
    if (!/\.klog$/i.test(file.name)) continue;
    const p = parseNative(file.content, file.name);
    if (p.kind !== "log") continue;
    const identity = p.summary.roastedAt
      ? [
          p.summary.roastedAt,
          p.summary.name,
          p.summary.firmware,
          p.summary.level,
        ]
      : [file.sha256];
    const id =
      store.list("deviceRun").find((r) => r.files.some((f) => f.id === file.id))
        ?.id || `native-run-${fingerprint(identity)}`;
    if ((store.meta("deletedDeviceRuns") || []).includes(id)) continue;
    const entry = { file, p };
    groups.set(id, [...(groups.get(id) || []), entry]);
  }
  return store.transaction(() =>
    [...groups].map(([id, entries]) => {
      entries.sort((a, b) => b.p.rows.length - a.p.rows.length);
      const { file, p } = entries[0];
      const old = store.get(id, "deviceRun");
      return store.put(
        "deviceRun",
        {
          ...old,
          name: p.summary.name,
          roastedAt: p.summary.roastedAt,
          duration: p.summary.duration,
          level: p.summary.level,
          firstCrack: p.summary.firstCrack,
          category:
            p.summary.duration === null
              ? "incomplete"
              : p.summary.duration < 60
                ? "short"
                : "recorded",
          sourceFileId: file.id,
          files: entries.map((e) => ({
            id: e.file.id,
            name: e.file.name,
            sha256: e.file.sha256,
          })),
          diagnostics: p.diagnostics,
          beanId: old?.beanId ?? null,
          greenWeight: old?.greenWeight ?? null,
          roastedWeight: old?.roastedWeight ?? null,
        },
        id,
      );
    }),
  );
}
