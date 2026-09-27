const kinds = new Set([
  "bean",
  "profile",
  "version",
  "roast",
  "deviceRun",
  "experiment",
  "cupping",
  "brew",
  "equipment",
  "file",
  "deviceProfile",
  "syncJob",
]);
const fail = (message, status = 400) =>
  Object.assign(new Error(message), { status });
export function deleteRecord(s, kind, id) {
  if (!kinds.has(kind)) throw fail("Unsupported record category.");
  return s.transaction(() => {
    const record = kind === "file" ? s.file(id) : s.get(id, kind);
    if (!record) throw fail("Record not found.", 404);
    if (
      kind === "version" &&
      s.list("version").filter((v) => v.profileId === record.profileId)
        .length === 1
    )
      throw fail(
        "This is the profile's only revision. Delete the profile instead.",
        409,
      );
    const ids = new Set([id]);
    if (kind === "roast")
      for (const run of s.list("deviceRun"))
        if (run.roastId === id) ids.add(run.id);
    if (kind === "profile")
      for (const v of s.list("version")) if (v.profileId === id) ids.add(v.id);
    const references = [
      "brewId",
      "brewerId",
      "grinderId",
      "beanId",
      "profileId",
      "profileVersionId",
      "roastId",
      "experimentId",
      "versionId",
      "parentVersionId",
      "sourceFileId",
      "fileId",
    ];
    const blockers = [];
    for (const row of s.allEntities()) {
      if (ids.has(row.id) || ["importBatch", "importDraft"].includes(row.kind))
        continue;
      const data = JSON.parse(row.data);
      if (
        references.some((k) => ids.has(data[k])) ||
        (data.pilot?.lotIds || []).some((id) => ids.has(id)) ||
        (data.files || []).some((f) => ids.has(f.id)) ||
        ids.has(data.source?.fileId)
      )
        blockers.push(`${row.kind}: ${data.name || data.taster || row.id}`);
    }
    if (blockers.length)
      throw fail(
        `Delete or unlink dependent records first: ${blockers.slice(0, 6).join("; ")}${blockers.length > 6 ? " …" : ""}`,
        409,
      );
    if (
      kind === "roast" &&
      !record.demo &&
      record.inventoryConsumed !== false
    ) {
      const bean = s.get(record.beanId, "bean");
      if (bean && bean.stock !== null)
        s.put(
          "bean",
          { ...bean, stock: bean.stock + record.greenWeight },
          bean.id,
        );
    }
    if (kind === "deviceRun")
      s.meta("deletedDeviceRuns", [
        ...new Set([
          ...(s.meta("deletedDeviceRuns") || []),
          id,
          ...(record.roastId ? [`roast-run-${record.roastId}`] : []),
        ]),
      ]);
    for (const target of ids) {
      s.remove(target);
      s.removeImportKeys("entity_id", target);
    }
    if (kind === "file") s.removeFile(id);
    // Preserve the audit trail but invalidate rollback after explicit deletions.
    for (const batch of s.list("importBatch"))
      if (batch.fileId === id || batch.records.some((r) => ids.has(r.id)))
        s.put(
          "importBatch",
          {
            ...batch,
            status: "modified",
            deletionNote:
              "Records explicitly deleted; batch rollback unavailable.",
          },
          batch.id,
        );
    for (const draft of s.list("importDraft"))
      if (
        draft.options?.fileId === id ||
        (draft.batchId &&
          s.get(draft.batchId, "importBatch")?.status === "modified")
      )
        s.remove(draft.id);
    return { ok: true, deleted: ids.size };
  });
}
export function registerRecordRoutes(app, s) {
  app.get("/api/records", (_, res) =>
    res.json([
      ...[...kinds]
        .filter((k) => k !== "file")
        .flatMap((kind) =>
          s.list(kind).map((r) => ({
            id: r.id,
            kind,
            name: r.name || r.taster || `Revision ${r.number}`,
            createdAt: r.createdAt,
            detail: r.roastedAt || r.tastedAt || r.brewedAt || "",
          })),
        ),
      ...s
        .allFiles()
        .map((f) => ({ id: f.id, name: f.name, createdAt: f.created_at }))
        .map((f) => ({ ...f, kind: "file" })),
    ]),
  );
  app.delete("/api/records/:kind/:id", (req, res) =>
    res.json(deleteRecord(s, req.params.kind, req.params.id)),
  );
}
