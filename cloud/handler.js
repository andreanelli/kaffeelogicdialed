import { registerNotebookRoutes } from "../server/notebook-routes.js";
import { createCloudStore, changes } from "./store.js";
const fail = (message, status) => Object.assign(new Error(message), { status });
const json = (value, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
export async function handleRequest(request, env, fetcher = fetch) {
  try {
    for (const key of [
      "SUPABASE_URL",
      "SUPABASE_ANON_KEY",
      "SUPABASE_SERVICE_ROLE_KEY",
      "DIALED_WORKSPACE_ID",
    ])
      if (!env[key]) throw fail("Cloud workspace is not configured.", 503);
    const url = new URL(request.url);
    if (
      request.headers.get("Origin") &&
      request.headers.get("Origin") !== url.origin
    )
      throw fail("Origin is not allowed.", 403);
    const bearer = request.headers.get("Authorization");
    if (!/^Bearer \S+$/.test(bearer || ""))
      throw fail("Sign in to open Dialed.", 401);
    const base = env.SUPABASE_URL.replace(/\/$/, "");
    const userResponse = await fetcher(`${base}/auth/v1/user`, {
      headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: bearer },
    });
    if (!userResponse.ok)
      throw fail("Your session expired. Sign in again.", 401);
    const user = await userResponse.json();
    if (!user.id) throw fail("Invalid session.", 401);
    async function rpc(name, body, service = false) {
      const result = await fetcher(`${base}/rest/v1/rpc/${name}`, {
        method: "POST",
        headers: {
          apikey: service
            ? env.SUPABASE_SERVICE_ROLE_KEY
            : env.SUPABASE_ANON_KEY,
          Authorization: service
            ? `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`
            : bearer,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      if (!result.ok) {
        const e = await result.json().catch(() => ({}));
        if (e.code === "40001")
          throw fail(
            "Someone updated the notebook. Refresh and try again.",
            409,
          );
        if (e.code === "42501")
          throw fail("This account does not have access to Dialed.", 403);
        throw fail("Cloud database request failed.", 502);
      }
      return result.json();
    }
    const snapshot = await rpc("dialed_snapshot", {
      workspace: env.DIALED_WORKSPACE_ID,
    });
    const store = createCloudStore(snapshot);
    const routes = [];
    const router = {};
    for (const method of ["get", "post", "put", "delete"])
      router[method] = (path, fn) =>
        routes.push({
          method: method.toUpperCase(),
          parts: path.split("/"),
          fn,
        });
    const unavailable = () => {
      throw fail(
        "Roaster connection and Studio folders are available only in the local app. Download profiles here and open them in Kaffelogic Studio.",
        409,
      );
    };
    registerNotebookRoutes(router, store, {
      device: {
        status: () => ({
          connected: false,
          mode: "cloud",
          name: "Local connection required",
          profiles: [],
          jobs: [],
        }),
        connect: unavailable,
        disconnect: unavailable,
        sync: unavailable,
      },
      folder: { scan: unavailable, stage: unavailable },
    });
    const parts = url.pathname.split("/");
    const route = routes.find(
      (r) =>
        r.method === request.method &&
        r.parts.length === parts.length &&
        r.parts.every((p, i) => p.startsWith(":") || p === parts[i]),
    );
    if (!route) throw fail("API route not found.", 404);
    let body;
    if (!["GET", "HEAD"].includes(request.method)) {
      if (!request.headers.get("Content-Type")?.startsWith("application/json"))
        throw fail("Expected JSON.", 415);
      const reader = request.body?.getReader();
      const chunks = [];
      let size = 0;
      if (reader)
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.length;
          if (size > 15 * 1024 * 1024) {
            await reader.cancel();
            throw fail("Request exceeds 15 MB.", 413);
          }
          chunks.push(value);
        }
      try {
        body = JSON.parse(Buffer.concat(chunks).toString() || "{}");
      } catch {
        throw fail("Invalid JSON.", 400);
      }
    }
    const headers = new Headers({ "Cache-Control": "no-store" });
    let status = 200,
      payload;
    const res = {
      status(n) {
        status = n;
        return res;
      },
      type(t) {
        headers.set("Content-Type", t);
        return res;
      },
      attachment(name) {
        headers.set(
          "Content-Disposition",
          `attachment; filename="${name.replace(/[^\w. -]/g, "_")}"`,
        );
        return res;
      },
      json(v) {
        headers.set("Content-Type", "application/json");
        payload = JSON.stringify(v);
        return res;
      },
      send(v) {
        payload = v;
        return res;
      },
    };
    const params = Object.fromEntries(
      route.parts.flatMap((p, i) =>
        p.startsWith(":") ? [[p.slice(1), decodeURIComponent(parts[i])]] : [],
      ),
    );
    await route.fn({ body, params }, res);
    if (request.method !== "GET") {
      const delta = changes(snapshot, store.snapshot());
      if (Object.values(delta).some((d) => d.upsert.length || d.delete.length))
        await rpc(
          "dialed_commit",
          {
            workspace: env.DIALED_WORKSPACE_ID,
            actor: user.id,
            expected_revision: snapshot.revision,
            delta,
          },
          true,
        );
    }
    return new Response(payload, { status, headers });
  } catch (e) {
    return json(
      {
        error:
          e.name === "ZodError"
            ? "Please check the entered values."
            : e.status
              ? e.message
              : "Unexpected server error.",
      },
      e.name === "ZodError" ? 400 : e.status || 500,
    );
  }
}
