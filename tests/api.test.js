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
