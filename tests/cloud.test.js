import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { createCloudStore, changes } from "../cloud/store.js";
import { handleRequest } from "../cloud/handler.js";
const empty = () => ({
  revision: 0,
  entities: [],
  files: [],
  keys: [],
  meta: [],
});
const env = {
  SUPABASE_URL: "https://test.supabase.co",
  SUPABASE_ANON_KEY: "public",
  SUPABASE_SERVICE_ROLE_KEY: "private",
  DIALED_WORKSPACE_ID: "workspace",
};
test("cloud unit of work rolls back files, records, keys and metadata together", () => {
  const s = createCloudStore(empty());
  assert.throws(() =>
    s.transaction(() => {
      s.put("bean", { name: "Test" }, "bean");
      s.addFile({ id: "f", sha256: "hash", content: Buffer.from("bytes") });
      s.addImportKey("k", "bean", "hash", "batch");
      s.meta("tombstone", true);
      throw Error("cancel");
    }),
  );
  assert.deepEqual(s.snapshot(), {
    entities: [],
    files: [],
    keys: [],
    meta: [],
  });
  s.addFile({ id: "f", sha256: "hash", content: Buffer.from([0, 255, 128]) });
  assert.deepEqual(
    createCloudStore(s.snapshot()).file("f").content,
    Buffer.from([0, 255, 128]),
  );
});
test("cloud API fails closed before database access", async () => {
  const noNetwork = () => {
    throw Error("Must not fetch");
  };
  assert.equal(
    (
      await handleRequest(
        new Request("https://dialed.test/api/state"),
        {},
        noNetwork,
      )
    ).status,
    503,
  );
  assert.equal(
    (
      await handleRequest(
        new Request("https://dialed.test/api/state"),
        env,
        noNetwork,
      )
    ).status,
    401,
  );
  assert.equal(
    (
      await handleRequest(
        new Request("https://dialed.test/api/state", {
          headers: { Origin: "https://evil.test" },
        }),
        env,
        noNetwork,
      )
    ).status,
    403,
  );
});
test("authenticated cloud routes commit only on successful mutations and surface conflicts", async () => {
  let snapshot = empty(),
    conflict = false,
    commits = 0;
  const fake = async (url, options) => {
    if (url.endsWith("/user")) return Response.json({ id: "user" });
    if (url.endsWith("/dialed_snapshot")) {
      assert.equal(options.headers.Authorization, "Bearer token");
      return Response.json(snapshot);
    }
    assert.equal(options.headers.Authorization, "Bearer private");
    commits++;
    if (conflict) return Response.json({ code: "40001" }, { status: 409 });
    const args = JSON.parse(options.body);
    assert.equal(args.actor, "user");
    assert.equal(args.expected_revision, snapshot.revision);
    snapshot.entities.push(...args.delta.entities.upsert);
    snapshot.revision++;
    return Response.json({ revision: snapshot.revision });
  };
  const request = (path, body) =>
    new Request(`https://dialed.test/api${path}`, {
      method: body ? "POST" : "GET",
      headers: {
        Authorization: "Bearer token",
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  let response = await handleRequest(request("/state"), env, fake);
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).beans, []);
  assert.equal(commits, 0);
  response = await handleRequest(request("/knowledge"), env, fake);
  assert.equal((await response.json()).counts.curated, 37);
  response = await handleRequest(
    request("/knowledge/search", { query: "Kenya" }),
    env,
    fake,
  );
  assert.ok((await response.json()).results.length > 0);
  assert.equal(commits, 0);
  response = await handleRequest(request("/beans", { name: "" }), env, fake);
  assert.equal(response.status, 400);
  assert.equal(commits, 0);
  const data = {
    name: "San Sebastian",
    origin: "Colombia",
    variety: "Caturra",
    process: "Washed",
    stock: null,
    notes: "",
  };
  response = await handleRequest(request("/beans", data), env, fake);
  assert.equal(response.status, 201);
  assert.equal(commits, 1);
  assert.equal(
    (await (await handleRequest(request("/state"), env, fake)).json()).beans
      .length,
    1,
  );
  conflict = true;
  assert.equal(
    (await handleRequest(request("/beans", data), env, fake)).status,
    409,
  );
  assert.equal(
    (await handleRequest(request("/device/connect", {}), env, fake)).status,
    409,
  );
});
test("Postgres RLS isolates members and commit RPC enforces role, membership and revision", async () => {
  const db = new PGlite();
  try {
    await db.exec(
      `create role anon; create role authenticated; create role service_role; create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;`,
    );
    await db.exec(
      readFileSync(
        new URL(
          "../supabase/migrations/202609160001_notebook.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    const workspace = "11111111-1111-1111-1111-111111111111",
      member = "22222222-2222-2222-2222-222222222222",
      outsider = "33333333-3333-3333-3333-333333333333";
    await db.query("insert into auth.users values ($1),($2)", [
      member,
      outsider,
    ]);
    await db.query(
      "insert into dialed_workspaces(id,name) values ($1,'Dialed')",
      [workspace],
    );
    await db.query("insert into dialed_members values ($1,$2)", [
      workspace,
      member,
    ]);
    await db.exec("set role authenticated");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
      outsider,
    ]);
    assert.equal(
      (await db.query("select * from dialed_workspaces")).rows.length,
      0,
    );
    await assert.rejects(
      db.query("select dialed_snapshot($1)", [workspace]),
      /Not a member/,
    );
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
      member,
    ]);
    assert.equal(
      (await db.query("select * from dialed_workspaces")).rows.length,
      1,
    );
    const initial = (
      await db.query("select dialed_snapshot($1) as data", [workspace])
    ).rows[0].data;
    assert.deepEqual(initial, empty());
    await assert.rejects(
      db.query(
        "insert into dialed_records(workspace_id,collection,key,payload) values ($1,'entities','x','{}')",
        [workspace],
      ),
      /permission denied/,
    );
    const delta = changes(empty(), {
      ...empty(),
      entities: [
        { id: "x", kind: "bean", data: '{"id":"x"}', created_at: "2026-09-16" },
      ],
    });
    await assert.rejects(
      db.query("select dialed_commit($1,$2,0,$3)", [workspace, member, delta]),
      /permission denied/,
    );
    await db.exec("reset role; set role service_role");
    await assert.rejects(
      db.query("select dialed_commit($1,$2,0,$3)", [
        workspace,
        outsider,
        delta,
      ]),
      /Not a member/,
    );
    await db.query("select dialed_commit($1,$2,0,$3)", [
      workspace,
      member,
      delta,
    ]);
    await assert.rejects(
      db.query("select dialed_commit($1,$2,0,$3)", [workspace, member, delta]),
      /Revision conflict/,
    );
    await db.exec("reset role; set role authenticated");
    const result = (
      await db.query("select dialed_snapshot($1) as data", [workspace])
    ).rows[0].data;
    assert.equal(result.revision, 1);
    assert.equal(result.entities.length, 1);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
      outsider,
    ]);
    assert.equal(
      (await db.query("select * from dialed_records")).rows.length,
      0,
    );
    await db.exec("reset role; set role anon");
    await assert.rejects(
      db.query("select dialed_snapshot($1)", [workspace]),
      /permission denied/,
    );
  } finally {
    await db.close();
  }
});

test("cloud persists brew snapshots, pilot plans and linked tasting assessments", async () => {
  let snapshot = empty();
  let commits = 0;
  const fake = async (url, options) => {
    if (url.endsWith("/user")) return Response.json({ id: "user" });
    if (url.endsWith("/dialed_snapshot")) return Response.json(snapshot);
    const { delta } = JSON.parse(options.body);
    commits++;
    for (const [key, id] of [
      ["entities", "id"],
      ["files", "id"],
      ["keys", "key"],
      ["meta", "key"],
    ]) {
      const rows = new Map(snapshot[key].map((r) => [r[id], r]));
      for (const v of delta[key].delete) rows.delete(v);
      for (const v of delta[key].upsert) rows.set(v[id], v);
      snapshot[key] = [...rows.values()];
    }
    snapshot.revision++;
    return Response.json({ revision: snapshot.revision });
  };
  const request = async (path, body) => {
    const r = await handleRequest(
      new Request(`https://dialed.test/api${path}`, {
        method: body ? "POST" : "GET",
        headers: {
          Authorization: "Bearer token",
          "Content-Type": "application/json",
        },
        body: body ? JSON.stringify(body) : undefined,
      }),
      env,
      fake,
    );
    return { status: r.status, data: await r.json() };
  };
  const lotIds = [];
  for (const name of ["A", "B", "C"])
    lotIds.push(
      (
        await request("/beans", {
          name,
          origin: "Test",
          process: "washed",
          stock: null,
        })
      ).data.id,
    );
  const profile = (
    await request("/profiles", {
      name: "Reference",
      level: 2,
      points: [
        { time: 0, temperature: 25 },
        { time: 500, temperature: 220 },
      ],
      changeNote: "Initial",
    })
  ).data;
  const pilot = (
    await request("/experiments/pilot", {
      name: "Pilot",
      lotIds,
      target: "Sweet and clean",
      method: "cupping",
      batchSizeG: 100,
      restHours: 48,
      controls: "Same water and dose",
    })
  ).data;
  const roast = (
    await request("/roasts", {
      name: "A1",
      beanId: lotIds[0],
      profileVersionId: profile.version.id,
      experimentId: pilot.id,
      pilotTrialId: "1-1",
      roastedAt: "2026-09-01T00:00:00Z",
      greenWeight: 100,
      roastedWeight: 85,
      duration: 500,
      level: 2,
    })
  ).data;
  const equipment = (
    await request("/equipment", {
      name: "Cupping bowl",
      category: "brewer",
      brand: "Test",
      model: "Bowl",
    })
  ).data;
  const brew = (
    await request("/brews", {
      name: "Reference cup",
      roastId: roast.id,
      brewedAt: "2026-09-03T00:00:00Z",
      method: "cupping",
      brewerId: equipment.id,
    })
  ).data;
  const cup = await request("/cuppings", {
    roastId: roast.id,
    brewId: brew.id,
    taster: "A",
    tastedAt: "2026-09-03T00:15:00Z",
  });
  assert.equal(cup.status, 201);
  assert.equal(cup.data.score, null);
  const group = await request("/cuppings", {
    roastId: roast.id,
    brewId: brew.id,
    tastedAt: "2026-09-03T00:15:00Z",
    votes: [
      { taster: "A", score: 80, body: 0 },
      { taster: "B", score: 90, body: 8 },
    ],
  });
  assert.equal(group.status, 201);
  assert.equal(group.data.score, 85);
  assert.equal(group.data.body, 4);
  const savedGroup = (await request("/state")).data.cuppings.find(
    (c) => c.id === group.data.id,
  );
  assert.deepEqual(savedGroup.votes, group.data.votes);
  const before = commits;
  assert.equal(
    (
      await request("/cuppings", {
        roastId: roast.id,
        brewId: "missing",
        taster: "B",
        tastedAt: "2026-09-03T00:15:00Z",
      })
    ).status,
    404,
  );
  assert.equal(commits, before);
  const state = (await request("/state")).data;
  assert.equal(state.brews[0].equipmentSnapshot.brewer.model, "Bowl");
  assert.equal(state.brews[0].restHours, 48);
  assert.equal(state.cuppings[0].brewId, brew.id);
  assert.equal(state.experiments[0].pilot.trials.length, 9);
});
