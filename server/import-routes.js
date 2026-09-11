import { z } from "zod";
import { parseNative, patchNative, CODEC_VERSION } from "./codecs/native.js";
import {
  initImports,
  getFile,
  readCsv,
  createDraft,
  commitCsv,
  rollbackBatch,
  importNativeProfile,
  importNativeLog,
  fail,
  fingerprint,
} from "./imports.js";
export function registerImportRoutes(app, s) {
  initImports(s);
  app.get("/api/files/:id/inspect", (req, res) => {
    const file = getFile(s, req.params.id);
    res.json(parseNative(file.content, file.name));
  });
  app.get("/api/imports", (_, res) => res.json(s.list("importBatch")));
  app.post("/api/imports/csv/read", (req, res) => {
    const input = z
      .object({
        fileId: z.string(),
        delimiter: z.enum([",", ";", "\t"]).default(","),
      })
      .parse(req.body);
    res.json(readCsv(getFile(s, input.fileId), input.delimiter));
  });
  app.post("/api/imports/csv/preview", (req, res) =>
    res.json(createDraft(s, req.body)),
  );
  app.post("/api/imports/csv/commit", (req, res) =>
    res.json(commitCsv(s, z.string().parse(req.body.draftId))),
  );
  app.post("/api/imports/:id/rollback", (req, res) =>
    res.json(rollbackBatch(s, req.params.id)),
  );
  app.post("/api/imports/native-profile", (req, res) =>
    res
      .status(201)
      .json(importNativeProfile(s, z.string().parse(req.body.fileId))),
  );
  app.post("/api/imports/native-log", (req, res) =>
    res
      .status(201)
      .json(
        importNativeLog(
          s,
          z.string().parse(req.body.fileId),
          z.record(z.unknown()).parse(req.body.fields),
        ),
      ),
  );
  const getVersion = (id) => {
    const v = s.get(id, "version");
    if (!v) throw fail("Revision not found", 404);
    return v;
  };
  const bytes = (v) => {
    if (v.native?.kind !== "profile")
      throw fail("Only imported native profiles have a native export.");
    const file = getFile(s, v.sourceFileId);
    if (file.sha256 !== v.native.sourceHash)
      throw fail("Source checksum mismatch.", 409);
    return patchNative(file.content, v.native.patch);
  };
  app.get("/api/versions/:id/native", (req, res) => {
    const v = getVersion(req.params.id);
    res.json(
      parseNative(
        v.native?.kind === "log"
          ? getFile(s, v.sourceFileId).content
          : bytes(v),
      ),
    );
  });
  app.get("/api/versions/:id/native-export", (req, res) => {
    const v = getVersion(req.params.id);
    const data = bytes(v);
    res
      .attachment(`dialed-native-v${v.number}.kpro`)
      .type("application/octet-stream")
      .send(data);
  });
  app.post("/api/versions/:id/native-revision", (req, res) => {
    const parent = getVersion(req.params.id);
    bytes(parent);
    const input = z
      .object({
        patch: z.record(z.string().max(10000)),
        changeNote: z.string().trim().min(1).max(1000),
      })
      .parse(req.body);
    const patch = { ...parent.native.patch, ...input.patch };
    const original = getFile(s, parent.sourceFileId);
    const content = patchNative(original.content, patch);
    const parsed = parseNative(content);
    if (!parsed.canEdit)
      throw fail("The edited profile failed native parsing.");
    res.status(201).json(
      s.transaction(() => {
        const number =
          1 +
          Math.max(
            ...s
              .list("version")
              .filter((v) => v.profileId === parent.profileId)
              .map((v) => v.number),
          );
        const v = s.put("version", {
          profileId: parent.profileId,
          number,
          name: parsed.summary.name,
          description: parsed.summary.description,
          level: parsed.summary.recommendedLevel,
          points: parsed.curves.roast_profile.points,
          changeNote: input.changeNote,
          sourceFileId: parent.sourceFileId,
          native: { ...parent.native, patch, codecVersion: CODEC_VERSION },
          parentVersionId: parent.id,
        });
        const p = s.get(parent.profileId, "profile");
        s.put(
          "profile",
          { ...p, name: v.name, description: v.description },
          p.id,
        );
        return v;
      }),
    );
  });
}
