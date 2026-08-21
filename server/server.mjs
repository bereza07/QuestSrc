// QuestForge LAN sync server.
//
// Dependency-free (only Node built-ins). Stores, per user account, the full
// QuestForge dataset (the same JSON produced by the app's Export). Devices pull
// the dataset on open and push it after changes — last-write-wins at the whole-
// dataset level, which is plenty for one person/household across a few devices
// on a LAN. The app keeps working fully offline against its local DB; the server
// is only the sync point.
//
// Run:  node server/server.mjs           (defaults: port 4000, data in ./server/data)
// Env:  QF_PORT, QF_DATA_DIR, QF_MAX_BODY_MB
//
// Endpoints:
//   GET  /health                      -> { ok: true }
//   POST /auth/register {email,pw}    -> { token, email }
//   POST /auth/login    {email,pw}    -> { token, email }
//   GET  /data           (Bearer)     -> { dataset, updatedAt }   (204 if none)
//   PUT  /data {dataset} (Bearer)     -> { updatedAt }
//   (any other GET)                   -> static file from ./dist (the built app)

import { createServer as createHttpServer } from "node:http";
import { createServer as createHttpsServer } from "node:https";
import { DatabaseSync } from "node:sqlite";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join, extname, normalize, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const PORT = Number(process.env.QF_PORT || 4000);
const DATA_DIR = process.env.QF_DATA_DIR || join(__dirname, "data");
const MAX_BODY = Number(process.env.QF_MAX_BODY_MB || 25) * 1024 * 1024;
const DIST_DIR = join(ROOT, "dist");

if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });

// --- Database ---------------------------------------------------------------
const db = new DatabaseSync(join(DATA_DIR, "server.sqlite"));
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id         TEXT PRIMARY KEY,
    email      TEXT NOT NULL UNIQUE,
    salt       TEXT NOT NULL,
    hash       TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token      TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS datasets (
    user_id    TEXT PRIMARY KEY,
    json       TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`);

// --- Helpers ----------------------------------------------------------------
function hashPassword(password, salt) {
  return scryptSync(password, salt, 64).toString("hex");
}
function verifyPassword(password, salt, expectedHex) {
  const got = Buffer.from(hashPassword(password, salt), "hex");
  const exp = Buffer.from(expectedHex, "hex");
  return got.length === exp.length && timingSafeEqual(got, exp);
}
function newId() {
  return randomBytes(16).toString("hex");
}
function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function send(res, status, body, headers = {}) {
  const payload = body == null ? "" : JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
    ...headers,
  });
  res.end(payload);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new Error("Body too large"));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
    req.on("error", reject);
  });
}

function userForToken(req) {
  const auth = req.headers["authorization"] || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return null;
  const row = db.prepare("SELECT user_id FROM sessions WHERE token = ?").get(token);
  return row ? row.user_id : null;
}

// --- Static file serving (the built app) ------------------------------------
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".webmanifest": "application/manifest+json",
  ".woff2": "font/woff2",
};

async function serveStatic(req, res) {
  if (!existsSync(DIST_DIR)) {
    return send(res, 404, { error: "App not built. Run `npm run build`." });
  }
  let urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
  if (urlPath === "/") urlPath = "/index.html";
  const safe = normalize(urlPath).replace(/^(\.\.[/\\])+/, "");
  let filePath = join(DIST_DIR, safe);
  if (!filePath.startsWith(DIST_DIR)) filePath = join(DIST_DIR, "index.html");
  if (!existsSync(filePath)) filePath = join(DIST_DIR, "index.html"); // SPA fallback
  try {
    const data = await readFile(filePath);
    res.writeHead(200, { "Content-Type": MIME[extname(filePath)] || "application/octet-stream" });
    res.end(data);
  } catch {
    send(res, 404, { error: "Not found" });
  }
}

// --- Routes -----------------------------------------------------------------
async function handle(req, res) {
  const method = req.method || "GET";
  const path = (req.url || "/").split("?")[0];

  if (method === "OPTIONS") return send(res, 204, null);
  if (path === "/health") return send(res, 200, { ok: true });

  if (path === "/auth/register" && method === "POST") {
    const body = await readBody(req);
    const email = normalizeEmail(body.email);
    const password = String(body.password || "");
    if (!email || !email.includes("@")) return send(res, 400, { error: "Invalid email" });
    if (password.length < 6) return send(res, 400, { error: "Password too short (min 6)" });
    if (db.prepare("SELECT 1 FROM users WHERE email = ?").get(email)) {
      return send(res, 409, { error: "Email already registered" });
    }
    const id = newId();
    const salt = randomBytes(16).toString("hex");
    db.prepare("INSERT INTO users (id, email, salt, hash, created_at) VALUES (?, ?, ?, ?, ?)").run(
      id, email, salt, hashPassword(password, salt), new Date().toISOString(),
    );
    const token = newId() + newId();
    db.prepare("INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)").run(
      token, id, new Date().toISOString(),
    );
    return send(res, 200, { token, email });
  }

  if (path === "/auth/login" && method === "POST") {
    const body = await readBody(req);
    const email = normalizeEmail(body.email);
    const password = String(body.password || "");
    const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
    if (!user || !verifyPassword(password, user.salt, user.hash)) {
      return send(res, 401, { error: "Wrong email or password" });
    }
    const token = newId() + newId();
    db.prepare("INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)").run(
      token, user.id, new Date().toISOString(),
    );
    return send(res, 200, { token, email });
  }

  if (path === "/data") {
    const userId = userForToken(req);
    if (!userId) return send(res, 401, { error: "Not authenticated" });

    if (method === "GET") {
      const row = db.prepare("SELECT json, updated_at FROM datasets WHERE user_id = ?").get(userId);
      if (!row) return send(res, 204, null);
      return send(res, 200, { dataset: JSON.parse(row.json), updatedAt: row.updated_at });
    }
    if (method === "PUT") {
      const body = await readBody(req);
      if (!body || typeof body.dataset !== "object") {
        return send(res, 400, { error: "Missing dataset" });
      }
      // Optimistic concurrency: if the client sent `baseUpdatedAt`, refuse the
      // write when the server has moved on (another device already pushed).
      // Client can then pull, merge in its head, and try again.
      if (typeof body.baseUpdatedAt === "string" || body.baseUpdatedAt === null) {
        const row = db.prepare("SELECT updated_at FROM datasets WHERE user_id = ?").get(userId);
        const server = row ? row.updated_at : null;
        const expected = body.baseUpdatedAt ?? null;
        if (server !== expected) {
          return send(res, 409, { error: "Conflict", serverUpdatedAt: server });
        }
      }
      const updatedAt = new Date().toISOString();
      db.prepare(
        `INSERT INTO datasets (user_id, json, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET json = excluded.json, updated_at = excluded.updated_at`,
      ).run(userId, JSON.stringify(body.dataset), updatedAt);
      return send(res, 200, { updatedAt });
    }
    if (method === "DELETE") {
      // Wipe THIS account's stored dataset. Sessions and account stay so the
      // user can immediately push fresh data. Used by the app's Reset flow so a
      // reset device doesn't re-download the state it just discarded.
      db.prepare("DELETE FROM datasets WHERE user_id = ?").run(userId);
      return send(res, 200, { ok: true });
    }
  }

  if (path === "/account" && method === "DELETE") {
    // Full account wipe: dataset + sessions + user. Requires re-registration.
    const userId = userForToken(req);
    if (!userId) return send(res, 401, { error: "Not authenticated" });
    db.prepare("DELETE FROM datasets WHERE user_id = ?").run(userId);
    db.prepare("DELETE FROM sessions WHERE user_id = ?").run(userId);
    db.prepare("DELETE FROM users WHERE id = ?").run(userId);
    return send(res, 200, { ok: true });
  }

  // Anything else: serve the built app (so LAN devices can load QuestForge).
  if (method === "GET") return serveStatic(req, res);
  return send(res, 404, { error: "Not found" });
}

const onRequest = (req, res) => {
  handle(req, res).catch((err) => {
    send(res, 400, { error: err?.message || "Bad request" });
  });
};

// HTTPS when QF_TLS_KEY + QF_TLS_CERT point at a key/cert (e.g. from mkcert).
// iOS needs HTTPS to install a PWA and run a service worker over the LAN.
const TLS_KEY = process.env.QF_TLS_KEY;
const TLS_CERT = process.env.QF_TLS_CERT;
let server;
let scheme = "http";
if (TLS_KEY && TLS_CERT && existsSync(TLS_KEY) && existsSync(TLS_CERT)) {
  server = createHttpsServer(
    { key: readFileSync(TLS_KEY), cert: readFileSync(TLS_CERT) },
    onRequest,
  );
  scheme = "https";
} else {
  server = createHttpServer(onRequest);
}

server.listen(PORT, "0.0.0.0", () => {
  console.log(`QuestForge sync server on ${scheme}://0.0.0.0:${PORT}`);
  console.log(`Data dir: ${DATA_DIR}`);
  if (scheme === "http") {
    console.log("TLS off — set QF_TLS_KEY and QF_TLS_CERT for HTTPS (needed for iPhone PWA install).");
  }
  console.log(existsSync(DIST_DIR) ? "Serving built app from ./dist" : "No ./dist yet — run `npm run build` to serve the app over LAN.");
});
