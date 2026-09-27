import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  readFile,
  writeFile,
  mkdir,
  symlink,
  rm,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb } from "../server/db.js";
import { createApp } from "../server/app.js";
import { StudioFolderAdapter } from "../server/device.js";
import { archiveFile } from "../server/files.js";
const profile = {
  name: "Test filter",
  description: "Research only",
  level: 2.1,
  points: [
    { time: 0, temperature: 25 },
    { time: 540, temperature: 220 },
  ],
  changeNote: "Initial profile",
};
async function setup(t) {
  const s = openDb(":memory:");
  const server = createApp(s).listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  t.after(async () => {
    await new Promise((r) => server.close(r));
    s.db.close();
  });
  const request = async (path, body, method) => {
    const r = await fetch(
      `http://127.0.0.1:${server.address().port}/api${path}`,
      {
        method: method || (body === undefined ? "GET" : "POST"),
        headers: { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      },
    );
    return { status: r.status, data: await r.json() };
  };
  return { s, request, server };
}
async function prerequisites(request) {
  const b = await request("/beans", {
    name: "Test lot",
    origin: "Ethiopia",
    process: "Natural",
    variety: "Gesha",
    stock: 1000,
  });
  const p = await request("/profiles", profile);
  return { bean: b.data, profile: p.data.profile, version: p.data.version };
}
const roast = (b, v) => ({
  name: "Test roast",
  beanId: b.id,
  profileVersionId: v.id,
  roastedAt: new Date().toISOString(),
  greenWeight: 100,
  roastedWeight: 86,
  duration: 540,
  firstCrack: 430,
  level: 2.1,
});
test("roasts retain immutable revisions, consume stock, and accept multiple tastings", async (t) => {
  const { request } = await setup(t);
  const p = await prerequisites(request);
  const r = await request("/roasts", roast(p.bean, p.version));
  assert.equal(r.status, 201);
  const v2 = await request(`/profiles/${p.profile.id}/versions`, {
    ...profile,
    level: 2.4,
    changeNote: "More development",
  });
  assert.equal(v2.data.number, 2);
  let state = (await request("/state")).data;
  assert.equal(state.roasts[0].profileVersionId, p.version.id);
  assert.equal(state.beans[0].stock, 900);
  assert.equal(state.versions.find((v) => v.id === p.version.id).level, 2.1);
  for (const name of ["Andrea", "Partner"])
    assert.equal(
      (
        await request("/cuppings", {
          roastId: r.data.id,
          taster: name,
          tastedAt: new Date().toISOString(),
          score: 86,
          aroma: 8,
          acidity: 8,
          sweetness: 8,
          body: 8,
          finish: 8,
          notes: "Peach",
        })
      ).status,
      201,
    );
  state = (await request("/state")).data;
  assert.equal(state.cuppings.length, 2);
});
test("failed roast writes roll back stock and reject broken relationships or impossible values", async (t) => {
  const { request } = await setup(t);
  const p = await prerequisites(request);
  for (const invalid of [
    { greenWeight: 1001 },
    { roastedWeight: 101 },
    { firstCrack: 600 },
    { beanId: "missing" },
    {
      points: [
        { time: 0, temperature: 20 },
        { time: 600, temperature: 220 },
      ],
    },
  ])
    assert.ok(
      (await request("/roasts", { ...roast(p.bean, p.version), ...invalid }))
        .status >= 400,
    );
  const r = await request("/roasts", roast(p.bean, p.version));
  const update = await request(
    `/roasts/${r.data.id}`,
    { ...roast(p.bean, p.version), greenWeight: 1000, roastedWeight: 860 },
    "PUT",
  );
  assert.equal(update.status, 200);
  assert.equal(
    (await request("/roasts", roast(p.bean, p.version))).status,
    400,
  );
  assert.equal((await request("/state")).data.beans[0].stock, 0);
});
test("editing a roast on a different lot restores the original inventory atomically", async (t) => {
  const { request } = await setup(t);
  const p = await prerequisites(request);
  const b2 = (
    await request("/beans", {
      name: "Other",
      origin: "Brazil",
      process: "Natural",
      stock: 50,
    })
  ).data;
  const r = (await request("/roasts", roast(p.bean, p.version))).data;
  assert.equal(
    (await request(`/roasts/${r.id}`, { ...roast(b2, p.version) }, "PUT"))
      .status,
    400,
  );
  const state = (await request("/state")).data;
  assert.equal(state.beans.find((b) => b.id === p.bean.id).stock, 900);
  assert.equal(state.beans.find((b) => b.id === b2.id).stock, 50);
});
test("archive deduplicates by content, downloads exact bytes, and exports backup", async (t) => {
  const { request, server } = await setup(t);
  const bytes = Buffer.from([0, 255, 254, 65, 10]);
  const a = await request("/files", {
    name: "original.klog",
    base64: bytes.toString("base64"),
  });
  const b = await request("/files", {
    name: "copy.klog",
    base64: bytes.toString("base64"),
  });
  assert.equal(a.data.id, b.data.id);
  assert.equal(b.data.duplicate, true);
  const downloaded = await fetch(
    `http://127.0.0.1:${server.address().port}/api/files/${a.data.id}/download`,
  );
  assert.deepEqual(Buffer.from(await downloaded.arrayBuffer()), bytes);
  const backup = (await request("/backup")).data;
  assert.equal(backup.format, "dialed-backup");
  assert.equal(backup.files[0].content, bytes.toString("base64"));
  assert.equal(
    (await request("/files", { name: "../escape.kpro", base64: "YQ==" }))
      .status,
    400,
  );
  assert.equal(
    (await request("/files", { name: "bad.klog", base64: "invalid***" }))
      .status,
    400,
  );
});
test("Dialed JSON profile export and import round trip; unknown native files stay archived", async (t) => {
  const { request } = await setup(t);
  const p = await prerequisites(request);
  const exported = (await request(`/versions/${p.version.id}/export`)).data;
  const f = (
    await request("/files", {
      name: "profile.json",
      base64: Buffer.from(JSON.stringify(exported)).toString("base64"),
    })
  ).data;
  const imported = await request("/profiles/import", { fileId: f.id });
  assert.equal(imported.status, 201);
  assert.deepEqual(imported.data.points, profile.points);
  const raw = (
    await request("/files", {
      name: "native.kpro",
      base64: Buffer.from("unknown native format").toString("base64"),
    })
  ).data;
  assert.equal(
    (await request("/profiles/import", { fileId: raw.id })).status,
    400,
  );
  assert.equal((await request("/state")).data.files.length, 2);
});
test("simulator requires connection, syncs idempotently, and keeps an audit trail", async (t) => {
  const { request } = await setup(t);
  const p = await prerequisites(request);
  assert.equal(
    (await request("/device/sync", { versionId: p.version.id })).status,
    409,
  );
  await request("/device/connect", {});
  assert.equal(
    (await request("/device/sync", { versionId: p.version.id })).data.status,
    "simulated",
  );
  assert.equal(
    (await request("/device/sync", { versionId: p.version.id })).data.status,
    "unchanged",
  );
  const v2 = (
    await request(`/profiles/${p.profile.id}/versions`, {
      ...profile,
      level: 2.4,
    })
  ).data;
  await request("/device/sync", { versionId: v2.id });
  const d = (await request("/device")).data;
  assert.equal(d.profiles.length, 1);
  assert.equal(d.jobs.length, 2);
  assert.equal(d.hardwareVerified, false);
  await request("/device/disconnect", {});
  assert.equal(
    (await request("/device/sync", { versionId: v2.id })).status,
    409,
  );
});
test("sample cleanup cannot delete data referenced by user records", async (t) => {
  const { request } = await setup(t);
  await request("/demo", {});
  await request("/demo", {});
  assert.equal((await request("/state")).data.roasts.length, 6);
  const s = (await request("/state")).data;
  await request("/roasts", roast(s.beans[0], s.versions[0]));
  assert.equal((await request("/demo", undefined, "DELETE")).status, 409);
  assert.equal((await request("/state")).data.roasts.length, 7);
});
test("unreferenced sample cleanup preserves unrelated user data", async (t) => {
  const { request } = await setup(t);
  await prerequisites(request);
  await request("/demo", {});
  assert.equal((await request("/demo", undefined, "DELETE")).status, 200);
  const state = (await request("/state")).data;
  assert.equal(state.beans.length, 1);
  assert.equal(state.profiles.length, 1);
  assert.equal(state.roasts.length, 0);
});
test("localhost API blocks foreign origins", async (t) => {
  const { server } = await setup(t);
  const r = await fetch(`http://127.0.0.1:${server.address().port}/api/demo`, {
    method: "POST",
    headers: {
      Origin: "https://evil.example",
      "Content-Type": "application/json",
    },
    body: "{}",
  });
  assert.equal(r.status, 403);
});
test("data and archived bytes survive reopening the database", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "dialed-db-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const path = join(dir, "test.sqlite");
  const s = openDb(path);
  const b = s.put("bean", { name: "Persistent lot", stock: 100 });
  const f = archiveFile(s, "test.klog", Buffer.from("keep me"));
  s.db.close();
  const next = openDb(path);
  assert.equal(next.get(b.id, "bean").name, "Persistent lot");
  assert.equal(
    Buffer.from(
      next.db.prepare("SELECT content FROM files WHERE id=?").get(f.id).content,
    ).toString(),
    "keep me",
  );
  next.db.close();
});
test("folder adapter imports once, skips symlinks, preserves native bytes and refuses overwrite", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "dialed-folder-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const input = join(dir, "input");
  const out = join(dir, "out");
  await mkdir(input);
  await mkdir(out);
  await writeFile(join(input, "one.kpro"), Buffer.from([255, 1, 2, 3]));
  await writeFile(join(dir, "secret.klog"), "outside");
  await symlink(join(dir, "secret.klog"), join(input, "link.klog"));
  const s = openDb(":memory:");
  t.after(() => s.db.close());
  const adapter = new StudioFolderAdapter(s, { readDir: input, writeDir: out });
  assert.equal((await adapter.scan()).imported, 1);
  assert.equal((await adapter.scan()).duplicates, 1);
  const file = s.db.prepare("SELECT * FROM files").get();
  assert.equal((await adapter.stage(file.id)).status, "staged");
  assert.deepEqual(
    await readFile(join(out, "one.kpro")),
    Buffer.from([255, 1, 2, 3]),
  );
  await assert.rejects(() => adapter.stage(file.id), /already exists/);
});
test("profile validation rejects unsorted curves and out of range levels", async (t) => {
  const { request } = await setup(t);
  assert.equal(
    (await request("/profiles", { ...profile, level: 6 })).status,
    400,
  );
  assert.equal(
    (
      await request("/profiles", {
        ...profile,
        points: [
          { time: 100, temperature: 100 },
          { time: 50, temperature: 150 },
        ],
      })
    ).status,
    400,
  );
});

test("editing a sample lot or experiment preserves user changes during sample cleanup", async (t) => {
  const { request } = await setup(t);
  await request("/demo", {});
  const initial = (await request("/state")).data;
  const bean = initial.beans[0];
  const experiment = initial.experiments[0];
  await request(
    `/beans/${bean.id}`,
    { ...bean, notes: "User-owned lot notes" },
    "PUT",
  );
  await request(
    `/experiments/${experiment.id}`,
    { ...experiment, conclusion: "User-owned conclusion" },
    "PUT",
  );
  assert.equal((await request("/demo", undefined, "DELETE")).status, 200);
  const after = (await request("/state")).data;
  assert.equal(after.beans.length, 1);
  assert.equal(after.beans[0].notes, "User-owned lot notes");
  assert.equal(after.experiments[0].conclusion, "User-owned conclusion");
  await request("/demo", {});
  const reloaded = (await request("/state")).data;
  assert.equal(
    reloaded.beans.find((b) => b.id === bean.id).notes,
    "User-owned lot notes",
  );
  assert.equal(
    reloaded.experiments.find((e) => e.id === experiment.id).conclusion,
    "User-owned conclusion",
  );
});

test("native revisions export selective patches and preserve immutable originals", async (t) => {
  const { request, server } = await setup(t);
  const content =
    "profile_schema_version:1.6\nprofile_short_name:Fixture\nrecommended_level:2.1\nunknown_setting:preserve\nroast_profile:0,20,0,0,100,100,600,220,500,200,0,0\nfan_profile:0,15000,0,0,100,15000,600,14000,500,14000,0,0\n";
  const file = (
    await request("/files", {
      name: "fixture.kpro",
      base64: Buffer.from(content).toString("base64"),
    })
  ).data;
  const v = (await request("/imports/native-profile", { fileId: file.id }))
    .data;
  const rev = await request(`/versions/${v.id}/native-revision`, {
    patch: { recommended_level: "2.4" },
    changeNote: "Test change",
  });
  assert.equal(rev.status, 201);
  assert.equal(rev.data.number, 2);
  const exported = await fetch(
    `http://127.0.0.1:${server.address().port}/api/versions/${rev.data.id}/native-export`,
  );
  assert.equal(
    await exported.text(),
    content.replace("recommended_level:2.1", "recommended_level:2.4"),
  );
  const original = (await request(`/versions/${v.id}/native`)).data;
  assert.equal(original.summary.recommendedLevel, 2.1);
  assert.equal(
    (await request(`/profiles/${v.profileId}/versions`, profile)).status,
    400,
  );
  assert.equal(
    (
      await request(`/versions/${rev.data.id}/native-revision`, {
        patch: { unknown_setting: "change" },
        changeNote: "Invalid",
      })
    ).status,
    400,
  );
});
test("editing a historical roast does not debit present stock", async (t) => {
  const { request, s } = await setup(t);
  const p = await prerequisites(request);
  const historic = s.put("roast", {
    ...roast(p.bean, p.version),
    inventoryConsumed: false,
    source: { kind: "csv" },
  });
  const updated = await request(
    `/roasts/${historic.id}`,
    { ...historic, greenWeight: 200, roastedWeight: 170 },
    "PUT",
  );
  assert.equal(updated.status, 200);
  assert.equal((await request("/state")).data.beans[0].stock, 1000);
  assert.equal(s.get(historic.id, "roast").inventoryConsumed, false);
});

test("unknown coffee stock stays unknown when logging and editing a roast", async (t) => {
  const { request } = await setup(t);
  const p = await prerequisites(request);
  await request(`/beans/${p.bean.id}`, { ...p.bean, stock: null }, "PUT");
  const r = await request("/roasts", roast(p.bean, p.version));
  assert.equal(r.status, 201);
  assert.equal(r.data.inventoryConsumed, false);
  await request(`/roasts/${r.data.id}`, { ...r.data, greenWeight: 110 }, "PUT");
  assert.equal((await request("/state")).data.beans[0].stock, null);
});

test("cupping accepts recorded runs and deletion blocks dependent tastings", async (t) => {
  const { s, request } = await setup(t);
  const run = s.put("deviceRun", {
    name: "Historical run",
    files: [],
    category: "recorded",
  });
  const cup = await request("/cuppings", {
    roastId: run.id,
    taster: "Tester",
    tastedAt: new Date().toISOString(),
    score: 85,
    aroma: 8,
    acidity: 8,
    sweetness: 8,
    body: 8,
    finish: 8,
    notes: "Recorded without invented weights",
  });
  assert.equal(cup.status, 201);
  assert.equal(
    (await request(`/records/deviceRun/${run.id}`, undefined, "DELETE")).status,
    409,
  );
  assert.equal(
    (await request(`/records/cupping/${cup.data.id}`, undefined, "DELETE"))
      .status,
    200,
  );
  assert.equal(
    (await request(`/records/deviceRun/${run.id}`, undefined, "DELETE")).status,
    200,
  );
  assert.ok(s.meta("deletedDeviceRuns").includes(run.id));
  assert.equal(
    (await request("/cuppings", { ...cup.data, roastId: "missing" })).status,
    404,
  );
});
test("deleting a roast restores inventory once and protects linked records", async (t) => {
  const { s, request } = await setup(t);
  const p = await prerequisites(request);
  const r = (await request("/roasts", roast(p.bean, p.version))).data;
  assert.equal(
    (await request(`/records/bean/${p.bean.id}`, undefined, "DELETE")).status,
    409,
  );
  assert.equal(
    (await request(`/records/profile/${p.profile.id}`, undefined, "DELETE"))
      .status,
    409,
  );
  assert.equal(
    (await request(`/records/roast/${r.id}`, undefined, "DELETE")).status,
    200,
  );
  assert.equal(s.get(p.bean.id, "bean").stock, 1000);
  assert.equal(
    (await request(`/records/roast/${r.id}`, undefined, "DELETE")).status,
    404,
  );
  assert.equal(s.get(p.bean.id, "bean").stock, 1000);
  assert.equal(
    (await request(`/records/version/${p.version.id}`, undefined, "DELETE"))
      .status,
    409,
  );
  assert.equal(
    (await request(`/records/profile/${p.profile.id}`, undefined, "DELETE"))
      .status,
    200,
  );
  assert.equal(s.list("version").length, 0);
  assert.equal(
    (await request(`/records/bean/${p.bean.id}`, undefined, "DELETE")).status,
    200,
  );
});
test("deletion preserves historical stock and enforces experiment and file dependencies", async (t) => {
  const { s, request } = await setup(t);
  const p = await prerequisites(request);
  const experiment = s.put("experiment", { name: "History" });
  const file = archiveFile(s, "original.klog", Buffer.from("original"));
  const r = s.put("roast", {
    ...roast(p.bean, p.version),
    experimentId: experiment.id,
    fileId: file.id,
    inventoryConsumed: false,
  });
  assert.equal(
    (await request(`/records/experiment/${experiment.id}`, undefined, "DELETE"))
      .status,
    409,
  );
  assert.equal(
    (await request(`/records/file/${file.id}`, undefined, "DELETE")).status,
    409,
  );
  await request(`/records/roast/${r.id}`, undefined, "DELETE");
  assert.equal(s.get(p.bean.id, "bean").stock, 1000);
  assert.equal(
    (await request(`/records/experiment/${experiment.id}`, undefined, "DELETE"))
      .status,
    200,
  );
  assert.equal(
    (await request(`/records/file/${file.id}`, undefined, "DELETE")).status,
    200,
  );
});

test("manual roast creates one editable run; late log attachment merges catalog entry without duplicating stock or tastings", async (t) => {
  const { s, request } = await setup(t);
  const p = await prerequisites(request);
  const created = await request("/roasts", roast(p.bean, p.version));
  assert.equal(created.status, 201);
  const originalRun = s.list("deviceRun")[0];
  assert.equal(originalRun.roastId, created.data.id);
  assert.equal(originalRun.sourceFileId, null);
  const bytes = Buffer.from(
    "profile_schema_version:1.6\nprofile_short_name:Fixture\nrecommended_level:2.1\nroast_profile:0,20,0,0,100,100,600,220,500,200,0,0\nfan_profile:0,15000,0,0,100,15000,600,14000,500,14000,0,0\nnative_schema_version:1.8\nroast_date:06/09/2026 15:00:00 UTC\ntime\t#=temp\n0\t25\n200\t180\n!roast_end:220\n",
  );
  const file = archiveFile(s, "late.klog", bytes);
  await request("/imports/catalog-runs", {});
  const nativeRun = s.list("deviceRun").find((r) => r.id !== originalRun.id);
  const cup = s.put("cupping", { roastId: nativeRun.id, taster: "QA" });
  const updated = await request(
    "/roasts/" + created.data.id,
    { ...created.data, fileId: file.id, notes: "Added after roasting" },
    "PUT",
  );
  assert.equal(updated.status, 200);
  assert.equal(s.list("deviceRun").length, 1);
  assert.equal(s.list("deviceRun")[0].id, originalRun.id);
  assert.equal(s.list("deviceRun")[0].sourceFileId, file.id);
  assert.equal(s.get(cup.id, "cupping").roastId, created.data.id);
  assert.equal(s.get(p.bean.id, "bean").stock, 900);
  await request("/imports/catalog-runs", {});
  assert.equal(s.list("deviceRun").length, 1);
  const duplicate = await request("/roasts", {
    ...roast(p.bean, p.version),
    fileId: file.id,
  });
  assert.equal(duplicate.status, 409);
  assert.equal(s.get(p.bean.id, "bean").stock, 900);
  s.remove(cup.id);
  assert.equal(
    (await request("/records/roast/" + created.data.id, undefined, "DELETE"))
      .status,
    200,
  );
  assert.equal(s.list("deviceRun").length, 0);
  assert.equal(s.get(p.bean.id, "bean").stock, 1000);
  assert.deepEqual(Buffer.from(s.file(file.id).content), bytes);
});
test("existing manual roasts appear in run history without changing inventory", async (t) => {
  const { s, request } = await setup(t);
  const p = await prerequisites(request);
  const r = s.put("roast", roast(p.bean, p.version));
  const state = (await request("/state")).data;
  assert.equal(
    state.deviceRuns.find((run) => run.roastId === r.id).sourceFileId,
    null,
  );
  assert.equal(s.get(p.bean.id, "bean").stock, 1000);
});

test("brews preserve equipment and unknown values; tastings validate their brew and roast", async (t) => {
  const { s, request } = await setup(t);
  const p = await prerequisites(request);
  const r = (
    await request("/roasts", {
      ...roast(p.bean, p.version),
      roastedAt: "2026-09-01T08:00:00Z",
    })
  ).data;
  const brewer = (
    await request("/equipment", {
      name: "V60 kitchen",
      category: "brewer",
      brand: "Hario",
      model: "V60",
      configuration: "Plastic 02",
    })
  ).data;
  const grinder = (
    await request("/equipment", {
      name: "Hand grinder",
      category: "grinder",
      brand: "Comandante",
      model: "C40",
      configuration: "Standard axle",
      calibration: "Burr touch zero",
    })
  ).data;
  const input = {
    name: "Reference brew",
    roastId: r.id,
    brewedAt: "2026-09-04T08:00:00Z",
    method: "pour-over",
    brewerId: brewer.id,
    grinderId: grinder.id,
    doseG: 15,
    waterInputG: 250,
  };
  const result = await request("/brews", input);
  assert.equal(result.status, 201);
  assert.equal(result.data.restHours, 72);
  assert.equal(result.data.beverageYieldG, null);
  assert.equal(result.data.tdsPercent, null);
  s.put("equipment", { ...grinder, configuration: "Changed" }, grinder.id);
  assert.equal(
    s.get(result.data.id, "brew").equipmentSnapshot.grinder.configuration,
    "Standard axle",
  );
  assert.equal(
    (await request("/brews", { ...input, brewerId: grinder.id })).status,
    400,
  );
  assert.equal(
    (await request("/brews", { ...input, grinderId: "missing" })).status,
    404,
  );
  assert.equal(
    (await request("/brews", { ...input, brewedAt: "2026-08-01T08:00:00Z" }))
      .status,
    400,
  );
  assert.equal(
    (await request("/brews", { ...input, bypassWaterG: 300 })).status,
    400,
  );
  assert.equal((await request("/brews", { ...input, doseG: 0 })).status, 400);
  const cup = {
    roastId: r.id,
    brewId: result.data.id,
    taster: "Taster",
    tastedAt: "2026-09-04T08:10:00Z",
    liking: 4,
    targetMatch: 3,
    descriptors: "peach",
    blindCode: "A",
  };
  const c = await request("/cuppings", cup);
  assert.equal(c.status, 201);
  assert.equal(c.data.score, null);
  assert.equal(c.data.aroma, null);
  assert.equal(
    (await request("/cuppings", { ...cup, taster: "Second taster" })).status,
    201,
  );
  assert.equal(
    (await request("/cuppings", { ...cup, tastedAt: "2026-09-03T08:10:00Z" }))
      .status,
    400,
  );
  const r2 = (await request("/roasts", roast(p.bean, p.version))).data;
  assert.equal(
    (await request("/cuppings", { ...cup, roastId: r2.id })).status,
    400,
  );
  assert.equal(
    (await request("/cuppings", { ...cup, brewId: "missing" })).status,
    404,
  );
  assert.equal(
    (await request(`/records/brew/${result.data.id}`, undefined, "DELETE"))
      .status,
    409,
  );
  assert.equal(
    (await request(`/records/equipment/${brewer.id}`, undefined, "DELETE"))
      .status,
    409,
  );
  assert.equal(
    (await request(`/records/roast/${r.id}`, undefined, "DELETE")).status,
    409,
  );
  assert.equal(
    (
      await request(
        `/roasts/${r.id}`,
        { ...r, roastedAt: "2026-09-02T08:00:00Z" },
        "PUT",
      )
    ).status,
    409,
  );
  const backup = (await request("/backup")).data;
  assert.ok(
    backup.records.some(
      (x) => x.kind === "brew" && x.data.id === result.data.id,
    ),
  );
  const state = (await request("/state")).data;
  assert.equal(state.brews.length, 1);
  assert.equal(state.equipment.length, 2);
});

test("pilot planning creates no observations or stock changes, checks slots and protects lots", async (t) => {
  const { request } = await setup(t);
  const p = await prerequisites(request);
  const lotIds = [p.bean.id];
  for (const name of ["Second", "Third"])
    lotIds.push(
      (
        await request("/beans", {
          name,
          origin: "Test",
          process: "Washed",
          stock: 1000,
        })
      ).data.id,
    );
  const body = {
    name: "Pilot",
    lotIds,
    target: "Sweet peach; match at least 4/5",
    method: "pour-over",
    batchSizeG: 100,
    restHours: 72,
    controls: "Same recipe and water. Compare levels on one revision.",
  };
  assert.equal(
    (
      await request("/experiments/pilot", {
        ...body,
        lotIds: [lotIds[0], lotIds[0], lotIds[1]],
      })
    ).status,
    400,
  );
  const pilot = await request("/experiments/pilot", body);
  assert.equal(pilot.status, 201);
  assert.equal(pilot.data.pilot.trials.length, 9);
  let state = (await request("/state")).data;
  assert.equal(state.roasts.length, 0);
  assert.equal(state.brews.length, 0);
  assert.ok(state.beans.every((b) => b.stock === 1000));
  assert.equal(
    (await request(`/records/bean/${lotIds[1]}`, undefined, "DELETE")).status,
    409,
  );
  const trial = {
    ...roast(p.bean, p.version),
    experimentId: pilot.data.id,
    pilotTrialId: "1-1",
  };
  assert.equal(
    (await request("/roasts", { ...trial, pilotTrialId: "2-1" })).status,
    400,
  );
  assert.equal((await request("/roasts", trial)).status, 201);
  assert.equal((await request("/roasts", trial)).status, 409);
  state = (await request("/state")).data;
  assert.equal(state.beans.find((b) => b.id === p.bean.id).stock, 900);
});

test("attaching a log retains both brew and tasting links even when the run ID is reused", async (t) => {
  const { s, request } = await setup(t);
  const p = await prerequisites(request);
  const file = archiveFile(s, "history.json", Buffer.from("{}"));
  const run = s.put("deviceRun", {
    name: "Native run",
    roastedAt: "2026-09-01T08:00:00Z",
    files: [{ id: file.id, name: "history.json" }],
    category: "recorded",
  });
  const b = await request("/brews", {
    name: "Cup",
    method: "cupping",
    roastId: run.id,
    brewedAt: "2026-09-02T08:00:00Z",
  });
  assert.equal(b.status, 201);
  const c = await request("/cuppings", {
    roastId: run.id,
    brewId: b.data.id,
    taster: "A",
    tastedAt: "2026-09-02T08:15:00Z",
  });
  assert.equal(c.status, 201);
  const r = await request("/roasts", {
    ...roast(p.bean, p.version),
    roastedAt: "2026-09-01T08:00:00Z",
    fileId: file.id,
  });
  assert.equal(r.status, 201);
  assert.equal(s.get(b.data.id, "brew").roastId, r.data.id);
  assert.equal(s.get(c.data.id, "cupping").roastId, r.data.id);
  assert.equal(
    (
      await request("/cuppings", {
        roastId: r.data.id,
        brewId: b.data.id,
        taster: "B",
        tastedAt: "2026-09-02T08:20:00Z",
      })
    ).status,
    201,
  );
});

test("a pilot referencing sample lots blocks cleanup until the unused plan is removed", async (t) => {
  const { request } = await setup(t);
  await request("/demo", {});
  const state = (await request("/state")).data;
  const plan = await request("/experiments/pilot", {
    name: "Real plan",
    lotIds: state.beans.slice(0, 3).map((b) => b.id),
    target: "Test target",
    method: "cupping",
    batchSizeG: 100,
    restHours: 48,
    controls: "Same recipe",
  });
  assert.equal(plan.status, 201);
  assert.equal((await request("/demo", undefined, "DELETE")).status, 409);
  assert.equal(
    (await request(`/records/experiment/${plan.data.id}`, undefined, "DELETE"))
      .status,
    200,
  );
  assert.equal((await request("/demo", undefined, "DELETE")).status, 200);
});

test("knowledge search separates leads and persists trusted experiment evidence", async (t) => {
  const { request, s } = await setup(t);
  const metadata = await request("/knowledge");
  assert.deepEqual(metadata.data.counts, {
    curated: 37,
    discovery: 7,
    sources: 30,
  });
  const browse = await request("/knowledge/search", {});
  assert.equal(browse.data.results.length, 37);
  const all = await request("/knowledge/search", { includeDiscovery: true });
  assert.equal(all.data.results.length, 44);
  const first = browse.data.results[0];
  const filtered = await request("/knowledge/search", {
    sourceId: first.sourceId,
    kind: first.kind,
  });
  assert.ok(filtered.data.results.length);
  assert.ok(
    filtered.data.results.every(
      (r) => r.sourceId === first.sourceId && r.kind === first.kind,
    ),
  );
  assert.equal(
    (await request("/knowledge/search", { query: "zzzznonsense" })).data.results
      .length,
    0,
  );
  assert.equal(
    (await request("/knowledge/search", { densityGL: 725 })).data.results
      .length,
    2,
  );
  assert.equal(
    (await request("/knowledge/search", { densityGL: -2 })).status,
    400,
  );
  const draft = {
    name: "Reference trial",
    hypothesis: "Test sweetness",
    variable: "Roast level",
    status: "planned",
    conclusion: "",
    referenceIds: [first.id],
  };
  const created = await request("/experiments", draft);
  assert.equal(created.status, 201);
  assert.equal(created.data.evidence[0].source.url, first.source.url);
  assert.deepEqual(created.data.evidence[0].fields, first.fields);
  const legacyUpdate = { ...draft };
  delete legacyUpdate.referenceIds;
  const updated = await request(
    "/experiments/" + created.data.id,
    legacyUpdate,
    "PUT",
  );
  assert.deepEqual(updated.data.evidence, created.data.evidence);
  assert.equal(s.list("roast").length, 0);
  assert.equal(s.list("brew").length, 0);
  const lead = all.data.results.find((r) => r.status === "discovery");
  assert.equal(
    (await request("/experiments", { ...draft, referenceIds: [lead.id] }))
      .status,
    400,
  );
  assert.equal(
    (await request("/experiments", { ...draft, referenceIds: ["invented"] }))
      .status,
    400,
  );
  const removed = await request(
    "/experiments/" + created.data.id,
    { ...draft, referenceIds: [] },
    "PUT",
  );
  assert.deepEqual(removed.data.evidence, []);
});
