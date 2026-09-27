import { parseNative } from "./codecs/native.js";
const fail = (message) => Object.assign(new Error(message), { status: 409 });
export function runFromRoast(roast) {
  return {
    id: `roast-run-${roast.id}`,
    createdAt: roast.createdAt,
    roastId: roast.id,
    name: roast.name,
    roastedAt: roast.roastedAt,
    duration: roast.duration,
    level: roast.level,
    firstCrack: roast.firstCrack,
    category: roast.duration < 60 ? "short" : "recorded",
    sourceFileId: null,
    files: [],
    beanId: roast.beanId,
    greenWeight: roast.greenWeight,
    roastedWeight: roast.roastedWeight,
  };
}
export function syncRoastRun(store, roast) {
  const file = roast.fileId ? store.file(roast.fileId) : null;
  const matches = store
    .list("deviceRun")
    .filter((r) => r.files.some((f) => f.id === roast.fileId));
  if (
    file &&
    store
      .list("roast")
      .some(
        (r) =>
          r.id !== roast.id &&
          (r.fileId === file.id ||
            matches.some((run) => run.files.some((f) => f.id === r.fileId))),
      )
  )
    throw fail(
      "This log is already linked to another roast. Edit that roast instead.",
    );
  const old = store.list("deviceRun").find((r) => r.roastId === roast.id);
  const base = runFromRoast(roast);
  const id = old?.id || matches[0]?.id || base.id;
  const files = file
    ? [
        ...new Map(
          [
            ...matches.flatMap((r) => r.files),
            { id: file.id, name: file.name, sha256: file.sha256 },
          ].map((f) => [f.id, f]),
        ).values(),
      ]
    : [];
  let parsed;
  if (file && /\.klog$/i.test(file.name)) {
    parsed = parseNative(file.content, file.name);
    if (parsed.kind !== "log" || parsed.status === "unsupported")
      throw Object.assign(
        new Error("Attach a supported Kaffelogic roast log."),
        { status: 400 },
      );
  }
  for (const match of matches) {
    for (const kind of ["cupping", "brew"])
      for (const record of store.list(kind))
        if (record.roastId === match.id)
          store.put(kind, { ...record, roastId: roast.id }, record.id);
    if (match.id !== id) store.remove(match.id);
  }
  return store.put(
    "deviceRun",
    {
      ...base,
      sourceFileId: file?.id || null,
      files,
      diagnostics: parsed?.diagnostics || [],
      origin: "manual",
    },
    id,
  );
}
export function notebookRuns(store) {
  const runs = store.list("deviceRun");
  return [
    ...runs,
    ...store
      .list("roast")
      .filter(
        (r) =>
          !r.demo &&
          !(store.meta("deletedDeviceRuns") || []).includes(
            `roast-run-${r.id}`,
          ) &&
          !runs.some(
            (run) =>
              run.roastId === r.id || run.files.some((f) => f.id === r.fileId),
          ),
      )
      .map((roast) => {
        const run = runFromRoast(roast);
        const file = roast.fileId ? store.file(roast.fileId) : null;
        return file
          ? {
              ...run,
              sourceFileId: file.id,
              files: [{ id: file.id, name: file.name, sha256: file.sha256 }],
            }
          : run;
      }),
  ];
}
