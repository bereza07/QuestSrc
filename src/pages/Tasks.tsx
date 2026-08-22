import { useMemo, useState } from "react";
import { useAppStore } from "@/stores/appStore";
import { useT, useI18nStore } from "@/i18n";
import { TaskItem } from "@/components/TaskItem";
import { Collapse } from "@/components/Collapse";
import { IconPlus, IconSearch, IconChevronDown } from "@/components/icons";
import { DIFFICULTIES, type Difficulty, type StatReward } from "@/types";
import { XP_BANDS, totalXpFromRewards, normalizeStatRewards } from "@/domain/xp";
import { overdueTasks } from "@/services/statistics/statisticsService";
import { todayKey, relativeDayLabel } from "@/utils/date";

export function Tasks() {
  const t = useT();
  const lang = useI18nStore((s) => s.lang);
  const activeTasks = useAppStore((s) => s.activeTasks);
  const projects = useAppStore((s) => s.projects);
  const [showForm, setShowForm] = useState(false);

  // Toolbar filters: search over titles + project select.
  const [search, setSearch] = useState("");
  const [filterProject, setFilterProject] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return activeTasks.filter((task) => {
      if (q && !task.title.toLowerCase().includes(q)) return false;
      if (filterProject === "__none__" && task.projectId != null) return false;
      if (filterProject && filterProject !== "__none__" && task.projectId !== filterProject)
        return false;
      return true;
    });
  }, [activeTasks, search, filterProject]);

  const overdue = useMemo(() => overdueTasks(filtered), [filtered]);
  const overdueIds = useMemo(() => new Set(overdue.map((o) => o.id)), [overdue]);

  const groups = useMemo(() => {
    const map = new Map<string, typeof filtered>();
    for (const task of filtered) {
      if (overdueIds.has(task.id)) continue;
      const key = task.plannedDate ?? "none";
      const list = map.get(key) ?? [];
      list.push(task);
      map.set(key, list);
    }
    return Array.from(map.entries()).sort(([a], [b]) => {
      if (a === "none") return 1;
      if (b === "none") return -1;
      return a < b ? -1 : 1;
    });
  }, [filtered, overdueIds]);

  return (
    <div>
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-fg">{t("tasks.title")}</h1>
          <p className="mt-0.5 text-sm text-fg-3">
            {t("tasks.openCount", { n: activeTasks.length })}
          </p>
        </div>
        <button className="qf-btn-primary" onClick={() => setShowForm((v) => !v)}>
          <IconPlus size={14} /> {t("tasks.newQuest")}
        </button>
      </div>

      {/* Toolbar: search + project filter */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[14rem]">
          <IconSearch
            size={13}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-3"
          />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("tasks.searchPlaceholder")}
            className="qf-input pl-8"
          />
        </div>
        <select
          value={filterProject}
          onChange={(e) => setFilterProject(e.target.value)}
          className="qf-input w-auto min-w-[10rem] max-w-full pr-8"
        >
          <option value="">{t("goals.allProjects")}</option>
          <option value="__none__">{t("goals.noProject")}</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      <Collapse open={showForm}>
        <NewQuestForm onDone={() => setShowForm(false)} />
      </Collapse>

      {overdue.length > 0 && <OverdueSection tasks={overdue} />}

      <div className="mt-4">
        {filtered.length === 0 && !showForm && (
          <div className="qf-card py-16 text-center text-sm text-fg-3">
            {activeTasks.length === 0 ? t("tasks.noOpenQuests") : t("tasks.noMatch")}
          </div>
        )}
        {groups.map(([key, tasks]) => (
          <QuestGroup
            key={key}
            label={key === "none" ? t("common.someday") : relativeDayLabel(key, t, lang)}
            tasks={tasks}
          />
        ))}
      </div>
    </div>
  );
}

// Collapsible section header + task rows. Section titles are quiet (small caps,
// muted) so the task rows themselves lead the eye.
function QuestGroup({ label, tasks }: { label: string; tasks: import("@/types").Task[] }) {
  const [open, setOpen] = useState(true);
  if (tasks.length === 0) return null;
  return (
    <div className="mb-5">
      <button
        onClick={() => setOpen(!open)}
        className="mb-1.5 flex w-full items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-fg-3 transition-colors hover:text-fg"
      >
        <IconChevronDown
          size={12}
          className={`transition-transform ${open ? "" : "-rotate-90"}`}
        />
        {label}
        <span className="ml-1 font-mono normal-case tracking-normal">
          {tasks.length}
        </span>
      </button>
      <Collapse open={open}>
        <div>
          {tasks.map((task) => (
            <TaskItem key={task.id} task={task} />
          ))}
        </div>
      </Collapse>
    </div>
  );
}

function OverdueSection({ tasks }: { tasks: ReturnType<typeof overdueTasks> }) {
  const t = useT();
  const lang = useI18nStore((s) => s.lang);
  const reschedule = useAppStore((s) => s.rescheduleTask);
  const cancelTask = useAppStore((s) => s.cancelTask);
  const completeTask = useAppStore((s) => s.completeTask);

  return (
    <section className="qf-card mt-4 border-danger p-5">
      <div className="qf-label text-danger">{t("tasks.overdue")}</div>
      <p className="mt-0.5 text-[11px] text-fg-3">{t("tasks.overdueHint")}</p>
      <div className="mt-3 space-y-2">
        {tasks.map((task) => (
          <div
            key={task.id}
            className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2"
          >
            <span className="flex-1 text-sm text-fg">{task.title}</span>
            <span className="text-[11px] text-danger">
              {relativeDayLabel(task.plannedDate, t, lang)}
            </span>
            <div className="flex gap-1.5">
              <button
                className="rounded-md border border-border px-2 py-1 text-xs text-fg-2 hover:border-accent hover:text-accent"
                onClick={() => reschedule(task.id, todayKey())}
              >
                {t("tasks.moveToToday")}
              </button>
              <button
                className="rounded-md border border-success px-2 py-1 text-xs text-success hover:bg-success-bg"
                onClick={() => completeTask(task.id)}
              >
                ✓
              </button>
              <button
                className="rounded-md border border-border px-2 py-1 text-xs text-fg-3 hover:border-danger hover:text-danger"
                onClick={() => cancelTask(task.id)}
              >
                {t("tasks.markCancelled")}
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function NewQuestForm({ onDone }: { onDone: () => void }) {
  const t = useT();
  const stats = useAppStore((s) => s.stats);
  const projects = useAppStore((s) => s.projects);
  const goals = useAppStore((s) => s.goals);
  const activeTasks = useAppStore((s) => s.activeTasks);
  const createTask = useAppStore((s) => s.createTask);
  const repos = useAppStore((s) => s.repos);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [difficulty, setDifficulty] = useState<Difficulty>("MEDIUM");
  const [plannedDate, setPlannedDate] = useState(todayKey());
  const [estimated, setEstimated] = useState("");
  const [projectId, setProjectId] = useState("");
  const [goalId, setGoalId] = useState("");
  const [rewards, setRewards] = useState<Record<string, number>>({});
  const [criteria, setCriteria] = useState<string[]>([]);
  const [criterionInput, setCriterionInput] = useState("");
  const [subtasks, setSubtasks] = useState<string[]>([]); // new sub-quest titles
  const [subtaskInput, setSubtaskInput] = useState("");
  const [attachIds, setAttachIds] = useState<string[]>([]); // existing task ids
  const [images, setImages] = useState<string[]>([]); // data-URL or http(s) URL
  const [imageUrlInput, setImageUrlInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function addCriterion() {
    const v = criterionInput.trim();
    if (v) setCriteria((p) => [...p, v]);
    setCriterionInput("");
  }
  function addSubtask() {
    const v = subtaskInput.trim();
    if (v) setSubtasks((p) => [...p, v]);
    setSubtaskInput("");
  }
  const attachable = activeTasks.filter(
    (tk) => !tk.parentTaskId && !attachIds.includes(tk.id),
  );

  function toggleStat(statId: string) {
    setRewards((prev) => {
      const next = { ...prev };
      if (statId in next) delete next[statId];
      else next[statId] = XP_BANDS[difficulty].suggested;
      return next;
    });
  }

  function setRewardXp(statId: string, xp: number) {
    setRewards((prev) => ({ ...prev, [statId]: xp }));
  }

  const rewardList: StatReward[] = Object.entries(rewards).map(
    ([statId, xp]) => ({ statId, xp }),
  );
  const rawTotal = totalXpFromRewards(rewardList);
  const clampedTotal = totalXpFromRewards(
    normalizeStatRewards(rewardList, difficulty),
  );

  async function save() {
    setError(null);
    if (!title.trim()) {
      setError(t("tasks.errorTitleRequired"));
      return;
    }
    setBusy(true);
    try {
      const task = await createTask({
        title: title.trim(),
        description: description.trim() || null,
        difficulty,
        plannedDate: plannedDate || null,
        estimatedMinutes: estimated ? Number(estimated) : null,
        projectId: projectId || null,
        goalId: goalId || null,
        statRewards: rewardList,
      });
      // Definition of Done + sub-quests + images, attached to the fresh quest.
      if (repos) {
        for (const c of criteria) await repos.criteria.add(task.id, c);
        for (const id of attachIds) {
          await repos.tasks.update(id, { parentTaskId: task.id });
        }
        for (const url of images) await repos.taskImages.add(task.id, url);
      }
      for (const st of subtasks) {
        await createTask({
          title: st,
          parentTaskId: task.id,
          projectId: projectId || null,
          goalId: goalId || null,
          plannedDate: plannedDate || null,
          difficulty: "EASY",
        });
      }
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create quest.");
      setBusy(false);
    }
  }

  return (
    <div className="qf-card mt-4 p-5">
      <input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={t("tasks.questTitlePlaceholder")}
        className="qf-input"
      />
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        onPaste={(e) => {
          // Paste an image from the clipboard directly into the quest.
          const item = Array.from(e.clipboardData.items).find((i) =>
            i.type.startsWith("image/"),
          );
          if (!item) return;
          const file = item.getAsFile();
          if (!file) return;
          e.preventDefault();
          const reader = new FileReader();
          reader.onload = () =>
            setImages((prev) => [...prev, String(reader.result)]);
          reader.readAsDataURL(file);
        }}
        placeholder={t("tasks.notesPlaceholder")}
        rows={2}
        className="qf-input mt-3 resize-none"
      />

      <div className="mt-3">
        <label className="qf-label">{t("tasks.images")}</label>
        <p className="mt-0.5 text-[11px] text-fg-3">{t("tasks.imagesHint")}</p>
        {images.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {images.map((src, i) => (
              <div key={i} className="relative">
                <img
                  src={src}
                  alt=""
                  className="h-16 w-16 rounded-md border border-border object-cover"
                />
                <button
                  type="button"
                  onClick={() => setImages((p) => p.filter((_, j) => j !== i))}
                  className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full border border-border bg-bg text-[10px] text-fg-2 hover:text-danger"
                  aria-label="remove"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="mt-2 flex gap-2">
          <input
            value={imageUrlInput}
            onChange={(e) => setImageUrlInput(e.target.value)}
            placeholder="https://…"
            className="qf-input flex-1"
          />
          <button
            type="button"
            className="qf-btn-ghost"
            onClick={() => {
              const v = imageUrlInput.trim();
              if (/^https?:\/\//i.test(v)) {
                setImages((p) => [...p, v]);
                setImageUrlInput("");
              }
            }}
          >
            {t("common.add")}
          </button>
          <label className="qf-btn-ghost cursor-pointer">
            {t("tasks.imagesUpload")}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (!file) return;
                const reader = new FileReader();
                reader.onload = () =>
                  setImages((prev) => [...prev, String(reader.result)]);
                reader.readAsDataURL(file);
              }}
            />
          </label>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div>
          <label className="qf-label">{t("tasks.difficulty")}</label>
          <select
            value={difficulty}
            onChange={(e) => setDifficulty(e.target.value as Difficulty)}
            className="qf-input mt-1"
          >
            {DIFFICULTIES.map((d) => (
              <option key={d} value={d}>
                {t(`difficulty.${d}`)} ({XP_BANDS[d].min}–{XP_BANDS[d].max} XP)
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="qf-label">{t("tasks.plannedDate")}</label>
          <input
            type="date"
            value={plannedDate}
            onChange={(e) => setPlannedDate(e.target.value)}
            className="qf-input mt-1"
          />
        </div>
        <div>
          <label className="qf-label">{t("tasks.estMinutes")}</label>
          <input
            type="number"
            min={0}
            value={estimated}
            onChange={(e) => setEstimated(e.target.value)}
            placeholder="60"
            className="qf-input mt-1"
          />
        </div>
        {projects.length > 0 && (
          <div>
            <label className="qf-label">{t("tasks.project")}</label>
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="qf-input mt-1"
            >
              <option value="">{t("tasks.none")}</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        )}
        {goals.length > 0 && (
          <div>
            <label className="qf-label">{t("tasks.goal")}</label>
            <select
              value={goalId}
              onChange={(e) => setGoalId(e.target.value)}
              className="qf-input mt-1"
            >
              <option value="">{t("tasks.none")}</option>
              {goals.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.title}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="mt-4">
        <label className="qf-label">{t("tasks.statRewards")}</label>
        {stats.length === 0 ? (
          <div className="mt-1 text-xs text-fg-3">
            {t("tasks.noStatsYet")}
          </div>
        ) : (
          <div className="mt-2 flex flex-wrap gap-2">
            {stats.map((stat) => {
              const on = stat.id in rewards;
              return (
                <div key={stat.id} className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => toggleStat(stat.id)}
                    className={`rounded-full border px-3 py-1 text-sm transition ${
                      on
                        ? "border-accent bg-accent-bg text-accent"
                        : "border-border text-fg-2 hover:border-border-strong"
                    }`}
                  >
                    {stat.name}
                  </button>
                  {on && (
                    <input
                      type="number"
                      min={1}
                      value={rewards[stat.id]}
                      onChange={(e) =>
                        setRewardXp(stat.id, Number(e.target.value))
                      }
                      className="w-16 rounded-lg border border-border bg-surface-2 px-2 py-1 text-xs text-fg"
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}
        <div className="mt-2 text-xs text-fg-3">
          {t("tasks.totalXp")}:{" "}
          <span className="font-mono text-accent">{clampedTotal}</span>
          {rawTotal !== clampedTotal && (
            <span className="ml-1 text-warn">
              {t("tasks.clampedFrom", {
                raw: rawTotal,
                difficulty: t(`difficulty.${difficulty}`),
              })}
            </span>
          )}
        </div>
      </div>

      {/* Definition of Done */}
      <div className="mt-4">
        <label className="qf-label">{t("tasks.definitionOfDone")}</label>
        {criteria.length > 0 && (
          <ul className="mt-2 space-y-1">
            {criteria.map((c, i) => (
              <li key={i} className="flex items-center gap-2 text-sm text-fg-2">
                <span className="text-fg-3">☐</span>
                <span className="flex-1">{c}</span>
                <button
                  type="button"
                  className="text-fg-3 hover:text-danger"
                  onClick={() => setCriteria((p) => p.filter((_, j) => j !== i))}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-2 flex gap-2">
          <input
            value={criterionInput}
            onChange={(e) => setCriterionInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addCriterion();
              }
            }}
            placeholder={t("tasks.addCriterion")}
            className="qf-input flex-1"
          />
          <button type="button" className="qf-btn-ghost" onClick={addCriterion}>
            <IconPlus size={14} />
          </button>
        </div>
      </div>

      {/* Sub-quests */}
      <div className="mt-4">
        <label className="qf-label">{t("tasks.subtasks")}</label>
        <p className="mt-0.5 text-[11px] text-fg-3">{t("tasks.subtasksHint")}</p>
        {(subtasks.length > 0 || attachIds.length > 0) && (
          <ul className="mt-2 space-y-1">
            {subtasks.map((s, i) => (
              <li key={`n${i}`} className="flex items-center gap-2 text-sm text-fg-2">
                <span className="text-accent">＋</span>
                <span className="flex-1">{s}</span>
                <button
                  type="button"
                  className="text-fg-3 hover:text-danger"
                  onClick={() => setSubtasks((p) => p.filter((_, j) => j !== i))}
                >
                  ✕
                </button>
              </li>
            ))}
            {attachIds.map((id) => {
              const tk = activeTasks.find((x) => x.id === id);
              return (
                <li key={id} className="flex items-center gap-2 text-sm text-fg-2">
                  <span className="text-accent">↳</span>
                  <span className="flex-1">{tk?.title ?? id}</span>
                  <button
                    type="button"
                    className="text-fg-3 hover:text-danger"
                    onClick={() => setAttachIds((p) => p.filter((x) => x !== id))}
                  >
                    ✕
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <div className="mt-2 flex gap-2">
          <input
            value={subtaskInput}
            onChange={(e) => setSubtaskInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addSubtask();
              }
            }}
            placeholder={t("tasks.addSubtask")}
            className="qf-input flex-1"
          />
          <button type="button" className="qf-btn-ghost" onClick={addSubtask}>
            <IconPlus size={14} />
          </button>
        </div>
        {attachable.length > 0 && (
          <select
            value=""
            onChange={(e) => {
              if (e.target.value) setAttachIds((p) => [...p, e.target.value]);
            }}
            className="qf-input mt-2"
          >
            <option value="">{t("tasks.attachExisting")}</option>
            {attachable.map((tk) => (
              <option key={tk.id} value={tk.id}>
                {tk.title}
              </option>
            ))}
          </select>
        )}
      </div>

      {error && <div className="mt-3 text-sm text-danger">{error}</div>}

      <div className="mt-4 flex justify-end gap-2">
        <button className="qf-btn-ghost" onClick={onDone} disabled={busy}>
          {t("common.cancel")}
        </button>
        <button className="qf-btn-primary" onClick={save} disabled={busy}>
          {busy ? t("tasks.creating") : t("tasks.createQuest")}
        </button>
      </div>
    </div>
  );
}
