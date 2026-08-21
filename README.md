# QuestForge

An AI-powered RPG productivity system. Turn real work into a quest: describe
what you need to do, and (from Phase 5) an AI Quest Master helps break it into
measurable tasks with XP and deadlines. Completing tasks levels up your
character and their stats.

Everything runs **locally** and stores data on your machine. Core productivity
features work fully **offline**; only the AI features (later phases) need
internet.

> **Status: Phase 1 (Core).** Character, stats, tasks, an idempotent XP/level
> engine, and the dashboard are implemented and tested. Later phases add
> planning, streaks, a focus timer, and the AI assistant — see the roadmap
> below. The app is runnable after every phase.

---

## Requirements

- **Node.js 20+** (developed on Node 24). The test suite uses the built-in
  `node:sqlite`, which needs Node 22.5+.
- **npm 10+**
- For the **desktop app** only: the **Rust toolchain** (`rustup`) and, on
  Windows, the MSVC C++ build tools. Not needed to run the web version or tests.

## Installation

```bash
npm install
```

## Running locally

QuestForge can run two ways. Both use real SQLite and persist your data.

### 1. Web (no Rust required)

```bash
npm run dev
```

Open http://localhost:1420. In the browser, data is stored with SQLite compiled
to WebAssembly (`sql.js`) and persisted to the browser's IndexedDB. Great for
quick use and UI iteration.

### 2. Desktop app (Tauri)

Requires Rust once. Install it from https://rustup.rs, then:

```bash
# generate the platform icon set from the source icon (first time only)
npm run tauri icon src-tauri/app-icon.png

# launch the desktop app
npm run tauri dev
```

The desktop app stores data in a native SQLite file (`questforge.db`) in the
app's data directory. To build a distributable binary:

```bash
npm run tauri build
```

## Database

- Schema lives in versioned migrations under
  [`src/data/migrations`](src/data/migrations). The **same migration code** runs
  in the desktop app, the web build, and the test suite.
- The database is opened and migrated automatically on first launch.
- XP is stored in an **append-only ledger** (`xp_transactions`); character and
  stat totals are caches recomputed from it. See
  [ARCHITECTURE.md](ARCHITECTURE.md) for why this makes task completion
  idempotent.
- Example data for demos/tests: `seedExampleData(repos)` in
  [`src/data/seed.ts`](src/data/seed.ts).

## Environment variables

The DeepSeek API key is **not** read from a file — from Phase 5 it is entered in
**Settings → AI** and stored in your OS secure credential store (never in the
database, a file, or git). See [`.env.example`](.env.example) for the optional,
non-secret build/dev overrides.

## DeepSeek configuration (from Phase 5)

QuestForge talks to an OpenAI-compatible API through a provider abstraction, so
DeepSeek, OpenAI, Anthropic, or a local LLM can be swapped in. Defaults:

```
Provider: deepseek
Model:    deepseek-chat
Base URL: https://api.deepseek.com
```

You configure these under **Settings → AI**. (The API key field is enabled in
Phase 5.)

## Testing

```bash
npm test          # run once
npm run test:watch
npm run typecheck  # tsc --noEmit
```

The suite covers XP calculation, level calculation, the XP economy bands, task
completion **idempotency** (completing a task twice awards XP only once),
database persistence across a close/reopen cycle, and migration idempotency.

## Build

```bash
npm run build      # typecheck + Vite production build (web assets)
npm run tauri build  # desktop binary (requires Rust)
```

## LAN sync + installing on iPhone (Phase 8)

QuestForge is offline-first: everything works on one device with no server. To
**sync between your devices on the same network**, run the bundled sync server on
one always-on machine (e.g. your PC). It stores each account's full dataset (the
same JSON as Export) and devices upload/download it. Multiple accounts are
supported — each gets isolated data.

### Run the server

```bash
npm run build      # produce dist/ (the app the server will serve)
npm run server     # start the sync server on http://0.0.0.0:4000
```

- Data is stored in `server/data/server.sqlite` (override with `QF_DATA_DIR`).
- Port via `QF_PORT` (default 4000). The server also **serves the built app**, so
  other devices can open `http://<your-PC-IP>:4000` directly.
- Find your PC's LAN IP (`ipconfig` on Windows) — e.g. `192.168.1.50`.

### Connect a device

On each device, open the app → **Settings → Sync across devices** → set the
server address (e.g. `http://192.168.1.50:4000`), then **Create account** (first
time) or **Sign in**. Turn on **Auto-sync** to pull on open and upload after
changes. Use **Upload / Download** for manual control.

> Sync is whole-dataset, last-write-wins — ideal for one person across a few
> devices. Keep Auto-sync on so each device pulls the latest on open.

### Install as an app on iPhone (PWA) — step by step

iOS installs a PWA only over **HTTPS** (Safari refuses to register a service
worker over plain http). On a LAN that means we make our own trusted cert with
[mkcert](https://github.com/FiloSottile/mkcert). The whole thing is one-time.

**On the PC (Windows PowerShell):**

```powershell
# 1. Install mkcert once (via Chocolatey; scoop/winget also work)
choco install mkcert -y

# 2. Create + trust a local root CA (once per PC)
mkcert -install

# 3. Make a cert for your PC's LAN IP AND its Windows hostname.
#    Run `ipconfig` and grab the IPv4 address (e.g. 192.168.1.50).
mkcert 192.168.1.50 questforge.local localhost 127.0.0.1
#   → produces 192.168.1.50+3.pem and 192.168.1.50+3-key.pem

# 4. Start the server with those files. The server picks up TLS
#    when both env vars are set and the files exist.
$env:QF_TLS_CERT = "192.168.1.50+3.pem"
$env:QF_TLS_KEY  = "192.168.1.50+3-key.pem"
npm run serve       # builds + serves HTTPS on port 4000
```

You should see `QuestForge sync server on https://0.0.0.0:4000` (note the **s**).

**Let the iPhone trust your PC's root CA (once):**

1. On the PC, run `mkcert -CAROOT` — it prints a folder path.
2. AirDrop / email / put on iCloud Drive the file `rootCA.pem` from that folder
   to your iPhone and open it.
3. iPhone: **Settings → General → VPN & Device Management** → tap the profile
   → **Install**.
4. Then **Settings → General → About → Certificate Trust Settings** →
   **enable** full trust for the "mkcert development CA" you just installed.
   *(This step is mandatory — without it Safari still refuses the cert.)*

**Install the app:**

- Make sure the iPhone is on the same Wi-Fi as the PC.
- Open Safari → `https://192.168.1.50:4000` (your PC's IP).
- Tap **Share (□↑)** → **Add to Home Screen** → the QuestForge icon appears.
- Launch from the icon → **Settings → Sync** → Sign in with the account you
  created on the PC. Turn on **Auto-sync**.

Now iPhone works fully offline and syncs whenever it can reach the PC.

## Deploying to a VPS (public access from anywhere)

The LAN setup above stops working once you leave home. If you want to reach
QuestForge from any device / anywhere, put the sync server on a VPS with a
domain and Let's Encrypt HTTPS. **All your data will live on your VPS**
(SQLite file at `server/data/server.sqlite`) — the app on each device still
has its own local copy for offline use, but the source of truth is the server.

### 1. Provision a small VPS

A cheapest tier is enough (1 vCPU, 512 MB RAM, 10 GB disk). Point a domain like
`questforge.example.com` at its public IP (A-record).

**Install prerequisites (Ubuntu example):**

```bash
sudo apt update && sudo apt install -y git nginx
# Node 20+ (need node:sqlite):
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
```

### 2. Build and run QuestForge

```bash
git clone <your-fork-of-questforge> /opt/questforge
cd /opt/questforge
npm install
npm run build              # produces dist/
# Persistent data dir outside the repo, so redeploys don't wipe it:
sudo mkdir -p /var/lib/questforge
sudo chown -R $USER /var/lib/questforge

# Run once to test:
QF_PORT=4000 QF_DATA_DIR=/var/lib/questforge npm run server
```

### 3. Keep it running with systemd

Create `/etc/systemd/system/questforge.service`:

```ini
[Unit]
Description=QuestForge sync server
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/questforge
Environment=QF_PORT=4000
Environment=QF_DATA_DIR=/var/lib/questforge
ExecStart=/usr/bin/node server/server.mjs
Restart=on-failure
User=www-data

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now questforge
sudo systemctl status questforge
```

### 4. HTTPS with nginx + Let's Encrypt

Put nginx in front so the server gets a real cert (much simpler than TLS in
Node, and works well with Certbot):

```nginx
# /etc/nginx/sites-available/questforge
server {
  listen 80;
  server_name questforge.example.com;

  client_max_body_size 30M;   # backups can be a few MB
  location / {
    proxy_pass http://127.0.0.1:4000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/questforge /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# Free trusted cert (auto-renews):
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d questforge.example.com
```

Now `https://questforge.example.com` serves QuestForge with a real cert.
On any phone / laptop: open it in Safari/Chrome → **Add to Home Screen** →
sign in in Settings → Sync — and you're done. Same account = same data
everywhere.

### 5. Data safety

- The server DB is one SQLite file at `QF_DATA_DIR/server.sqlite` — back it up
  with cron: `cp /var/lib/questforge/server.sqlite /var/backups/qf-$(date +%F).sqlite`.
- The app's built-in **Export data** (Settings) also works — makes a JSON file
  of your account's dataset from any signed-in device.
- Rotate your DeepSeek API key if you paste it anywhere it might have been
  logged; it's encrypted at rest on each device with a browser-generated
  key that can't be extracted.

### 6. Security notes for a public server

- Behind nginx as above, the server itself only needs to bind `127.0.0.1`
  instead of `0.0.0.0`. If you want that, change the `listen` call in
  `server/server.mjs` — currently it listens on all interfaces so LAN also
  works out of the box.
- The included auth uses email/password with scrypt hashing and session tokens.
  Passwords aren't stored in plain text, but there is no rate-limiting or 2FA
  yet — use strong passwords, and consider running the server behind Cloudflare
  or a fail2ban rule if it's public.

## Troubleshooting

- **"Database unavailable" screen in the browser** — this only appears if the
  sql.js WebAssembly fails to load. Make sure `npm install` completed and try a
  hard refresh.
- **`npm run tauri dev` fails to compile** — install the Rust toolchain
  (https://rustup.rs) and, on Windows, the "Desktop development with C++"
  workload from the Visual Studio Build Tools.
- **Icons missing on `tauri build`** — run
  `npm run tauri icon src-tauri/app-icon.png` to generate the platform icon set.
- **Reset your data** — Settings → Danger Zone → Reset progress (type `RESET`).
  In the browser you can also clear the site's IndexedDB.

## Project layout

```
src/
  components/   reusable UI
  pages/        Dashboard, Tasks, Character, Settings, …
  stores/       zustand state (app data, toasts)
  services/     application logic (xp, tasks, character, system)
  domain/       pure logic: leveling & XP formulas (fully unit-tested)
  data/         Database interface, adapters, migrations, repositories
  types/        shared TypeScript types
  utils/        date & formatting helpers
src-tauri/      Tauri v2 desktop shell (Rust)
tests/          Vitest suite
```

See [ARCHITECTURE.md](ARCHITECTURE.md) for the layering and design decisions.
