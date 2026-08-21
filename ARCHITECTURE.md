# QuestForge — Architecture

Priority order that guides every decision: **Reliable > Simple > Maintainable >
Beautiful > Feature-rich.** The app must really work locally and never lose or
corrupt data.

## Layers

```
UI (React)          components/, pages/     — no SQL, no direct AI calls
Application          stores/, services/      — orchestration & use-cases
Domain               domain/                 — pure logic, no I/O (100% testable)
Data                 data/                   — the only layer touching SQLite
AI (from Phase 5)    services/ai/            — isolated; app works if it's down
```

Rule: React never imports from `data/` directly — only through application
services/stores. Domain functions are pure, which is why the riskiest logic
(XP, leveling) is the most heavily tested.

## Database abstraction & adapters

All repositories and migrations talk to one small `Database` interface
(`src/data/db.ts`) with `execute` / `select` / `transaction`. Three adapters
implement it, so the **same SQL, migrations, and repositories** run everywhere:

| Adapter | Used by | Backing store |
|---|---|---|
| `tauriSql` | desktop app | native SQLite via `tauri-plugin-sql` (file) |
| `sqlJs` | web build | SQLite compiled to WASM + IndexedDB persistence |
| `nodeSqlite` | test suite | Node 24 built-in `node:sqlite` (no native build) |

SQL is authored with `?` positional placeholders; each adapter adapts as needed.

## The reliability core: idempotent XP

Requirement: completing a task must award XP **exactly once**, even if the
button is double-clicked, the app restarts mid-write, or the same code runs
twice.

Design:

1. **XP is an append-only ledger** (`xp_transactions`). Character and stat
   totals are *caches* recomputed as `SUM(amount)` from the ledger.
2. A **partial unique index** `(task_id, stat_id, kind)` means the database
   itself refuses to record the same task's completion XP for the same stat
   twice. Inserts use `INSERT OR IGNORE`.
3. `completeTask` also guards on task status (an already-`COMPLETED` task is a
   no-op) for correct UI feedback.

Because totals are derived from the ledger and the ledger is idempotent, the
whole operation is **idempotent and self-healing**: a partial failure re-heals
on the next run, and re-completing never double-counts. This is proven in
`tests/services/completion.test.ts` (complete a task 5× → one ledger row, XP
awarded once).

### A note on transactions

`tauri-plugin-sql` runs on a connection *pool*, so a `BEGIN` on one call may not
land on the same physical connection as the next — making cross-call
transactions unreliable there. Rather than depend on that, correctness comes
from the append-only + derived-totals design above. The `nodeSqlite` and `sqlJs`
adapters use real single-connection transactions, so the transactional path is
still exercised in tests.

## Leveling & XP economy (pure domain)

- `domain/leveling.ts` — `xpForLevel(level) = round(baseXP · level^1.5)`, plus
  `levelFromTotalXp` (its inverse) and progress helpers. One source of truth;
  the UI never re-derives the formula.
- `domain/xp.ts` — difficulty→XP bands (`TRIVIAL … EPIC`) and
  `normalizeStatRewards`, which clamps/scales proposed rewards into the band so
  the economy can't be broken. The AI (later) *proposes*; these rules *enforce*.

## State management

`zustand` stores (`src/stores`) hold app data outside React components. This
matters for later phases (the focus timer must survive navigation and
re-renders, req #74) and keeps side-effects out of the view layer.

## Security

- No API keys in code or git. From Phase 5 the DeepSeek key lives in OS secure
  storage, entered via Settings. `.gitignore` excludes `.env`, local secret
  stores, and `*.sqlite` data files.

## Roadmap

| Phase | Scope |
|---|---|
| **1 — Core** ✅ | DB + migrations, character, stats, tasks, XP/level engine, dashboard |
| 2 — Planning | projects, goals, Main Quest, subtasks, Definition of Done, calendar, drag-and-drop |
| 3 — Streak | daily activity, daily goal (XP/time), rest days, streak freeze |
| 4 — Focus Timer | TimerService, work sessions, pause/persistence, restart recovery, focus history |
| 5 — AI Core | provider abstraction, DeepSeek, chat, context builder, decomposition, structured actions + confirmation |
| 6 — AI Planning | scheduling, overload detection, rebalance, stat/XP suggestions, weekly/monthly review |
| 7 — Polish | achievements, statistics + charts + heatmap, animations, undo, export/import |

(Phase 4 — the focus timer — is scheduled before AI planning because its
actual-vs-estimated time data is what the AI planner needs.)
