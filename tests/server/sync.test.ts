import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PORT = 4321;
const BASE = `http://127.0.0.1:${PORT}`;
let proc: ChildProcess;
let dataDir: string;

async function wait(url: string, tries = 40, gap = 100): Promise<void> {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, gap));
  }
  throw new Error(`server did not come up: ${url}`);
}

beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), "qf-sync-test-"));
  proc = spawn(process.execPath, ["server/server.mjs"], {
    env: { ...process.env, QF_PORT: String(PORT), QF_DATA_DIR: dataDir },
    stdio: "ignore",
  });
  await wait(`${BASE}/health`);
}, 15_000);

afterAll(() => {
  proc?.kill();
  try {
    rmSync(dataDir, { recursive: true, force: true });
  } catch {
    /* best-effort */
  }
});

async function post(path: string, body: unknown, token?: string): Promise<Response> {
  return fetch(BASE + path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}
async function put(path: string, body: unknown, token: string): Promise<Response> {
  return fetch(BASE + path, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
}
async function get(path: string, token?: string): Promise<Response> {
  return fetch(BASE + path, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}

describe("sync server", () => {
  it("health", async () => {
    const res = await get("/health");
    expect(res.status).toBe(200);
    // /health also advertises registration policy so the client can show the
    // invite-code field only when the server actually requires one.
    expect(await res.json()).toEqual({
      ok: true,
      registrationEnabled: true,
      inviteRequired: false,
    });
  });

  it("register → login → put/get dataset roundtrip", async () => {
    const email = `a+${Date.now()}@example.com`;
    const reg = await post("/auth/register", { email, password: "secret6" });
    expect(reg.status).toBe(200);
    const { token } = (await reg.json()) as { token: string };
    expect(token).toBeTruthy();

    // No data yet
    const empty = await get("/data", token);
    expect(empty.status).toBe(204);

    const dataset = { app: "questforge", version: 1, tables: { character: [{ id: "c1", name: "Aria" }] } };
    const wr = await put("/data", { dataset }, token);
    expect(wr.status).toBe(200);

    const rd = await get("/data", token);
    expect(rd.status).toBe(200);
    const body = (await rd.json()) as { dataset: typeof dataset };
    expect(body.dataset.tables.character[0].name).toBe("Aria");

    // Login returns a new working token
    const li = await post("/auth/login", { email, password: "secret6" });
    expect(li.status).toBe(200);
    const { token: t2 } = (await li.json()) as { token: string };
    const rd2 = await get("/data", t2);
    expect(rd2.status).toBe(200);
  });

  it("rejects missing auth, dup email, wrong password", async () => {
    expect((await get("/data")).status).toBe(401);
    const email = `dup+${Date.now()}@example.com`;
    expect((await post("/auth/register", { email, password: "secret6" })).status).toBe(200);
    expect((await post("/auth/register", { email, password: "secret6" })).status).toBe(409);
    expect((await post("/auth/login", { email, password: "wrong" })).status).toBe(401);
  });

  it("validates input", async () => {
    expect((await post("/auth/register", { email: "no-at", password: "x" })).status).toBe(400);
    expect((await post("/auth/register", { email: "a@b.c", password: "123" })).status).toBe(400);
  });

  it("returns 409 on stale baseUpdatedAt (concurrent write protection)", async () => {
    const email = `c+${Date.now()}@example.com`;
    const { token } = (await (await post("/auth/register", { email, password: "secret6" })).json()) as { token: string };

    const dataset = { app: "questforge", version: 1, tables: { character: [{ id: "c1", name: "v1" }] } };
    // First push with no baseUpdatedAt (fresh)
    const first = await put("/data", { dataset, baseUpdatedAt: null }, token);
    expect(first.status).toBe(200);
    const { updatedAt: t1 } = (await first.json()) as { updatedAt: string };

    // A concurrent second device pushes without knowing about t1
    const second = await put("/data", { dataset, baseUpdatedAt: null }, token);
    expect(second.status).toBe(409);
    const body = (await second.json()) as { error: string; serverUpdatedAt: string };
    expect(body.error).toBe("Conflict");
    expect(body.serverUpdatedAt).toBe(t1);

    // Correct base succeeds
    const third = await put("/data", { dataset, baseUpdatedAt: t1 }, token);
    expect(third.status).toBe(200);
  });
});
