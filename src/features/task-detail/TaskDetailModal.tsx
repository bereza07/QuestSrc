import { useCallback, useEffect, useMemo, useState } from "react";
import { useAppStore } from "@/stores/appStore";
import { useT } from "@/i18n";
import { Modal } from "@/components/Modal";
import { ImageViewer } from "@/components/ImageViewer";
import { IconCheck, IconPlus, IconTrash } from "@/components/icons";
import {
  DIFFICULTIES,
  TASK_PRIORITIES,
  type Difficulty,
  type Task,
  type TaskPriority,
  type StatReward,
} from "@/types";
import type { Criterion } from "@/data/repositories/criteriaRepo";
import type { TaskImage } from "@/data/repositories/taskImageRepo";
import { XP_BANDS, totalXpFromRewards, normalizeStatRewards } from "@/domain/xp";

export function TaskDetailModal({ task, onClose }: { task: Task; onClose: () => void }) {
  const t = useT();
  const repos = useAppStore((s) => s.repos);
  const stats = useAppStore((s) => s.stats);
  const projects = useAppStore((s) => s.projects);
  const goals = useAppStore((s) => s.goals);
  const updateTask = useAppStore((s) => s.updateTask);
  const setStatRewards = useAppStore((s) => s.setStatRewards);
  const completeTask = useAppStore((s) => s.completeTask);
  const reopenTask = useAppStore((s) => s.reopenTask);
  const cancelTask = useAppStore((s) => s.cancelTask);
  const deleteTask = useAppStore((s) => s.deleteTask);
  const createTask = useAppStore((s) => s.createTask);
  const activeTasks = useAppStore((s) => s.activeTasks);
  const refresh = useAppStore((s) => s.refresh);

  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? "");
  const [difficulty, setDifficulty] = useState<Difficulty>(task.difficulty);
  const [priority, setPriority] = useState<TaskPriority>(task.priority);
  const [plannedDate, setPlannedDate] = useState(task.plannedDate ?? "");
  const [estimated, setEstimated] = useState(
    task.estimatedMinutes != null ? String(task.estimatedMinutes) : "",
  );
  const [projectId, setProjectId] = useState(task.projectId ?? "");
  const [goalId, setGoalId] = useState(task.goalId ?? "");
  const [rewards, setRewards] = useState<Record<string, number>>(
    Object.fromEntries(task.statRewards.map((r) => [r.statId, r.xp])),
  );

  const [criteria, setCriteria] = useState<Criterion[]>([]);
  const [newCriterion, setNewCriterion] = useState("");
  const [subtasks, setSubtasks] = useState<Task[]>([]);
  const [newSubtask, setNewSubtask] = useState("");
  const [images, setImages] = useState<TaskImage[]>([]);
  const [viewer, setViewer] = useState<string | null>(null);
  const [imageUrlInput, setImageUrlInput] = useState("");
  const [saving, setSaving] = useState(false);

  const done = task.status === "COMPLETED";

  const reload = useCallback(async () => {
    if (!repos) return;
    const [crit, subs, imgs] = await Promise.all([
      repos.criteria.listForTask(task.id),
      repos.tasks.list({ parentTaskId: task.id, includeCompleted: true }),
      repos.taskImages.listForTask(task.id),
    ]);
    setCriteria(crit);
    setSubtasks(subs);
    setImages(imgs);
  }, [repos, task.id]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const rewardList: StatReward[] = Object.entries(rewards).map(([statId, xp]) => ({
    statId,
    xp,
  }));
  const rawTotal = totalXpFromRewards(rewardList);
  const clampedTotal = totalXpFromRewards(normalizeStatRewards(rewardList, difficulty));

  function toggleStat(statId: string) {
    setRewards((prev) => {
      const next = { ...prev };
      if (statId in next) delete next[statId];
      else next[statId] = XP_BANDS[difficulty].suggested;
      return next;
    });
  }

  async function saveMeta() {
    setSaving(true);
    try {
      await updateTask(task.id, {
        title: title.trim() || task.title,
        description: description.trim() || null,
        difficulty,
        priority,
        plannedDate: plannedDate || null,
        estimatedMinutes: estimated ? Number(estimated) : null,
        projectId: projectId || null,
        goalId: goalId || null,
      });
      await setStatRewards(task.id, rewardList, difficulty);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  async function addCriterion() {
    const text = newCriterion.trim();
    if (!text || !repos) return;
    await repos.criteria.add(task.id, text);
    setNewCriterion("");
    await reload();
  }

  async function toggleCriterion(c: Criterion) {
    if (!repos) return;
    await repos.criteria.setDone(c.id, !c.done);
    await reload();
  }

  async function removeCriterion(c: Criterion) {
    if (!repos) return;
    await repos.criteria.remove(c.id);
    await reload();
  }

  async function addSubtask() {
    const stitle = newSubtask.trim();
    if (!stitle) return;
    await createTask({
      title: stitle,
      parentTaskId: task.id,
      projectId: task.projectId,
      goalId: task.goalId,
      plannedDate: task.plannedDate,
      difficulty: "EASY",
    });
    setNewSubtask("");
    await reload();
  }

  // #12 — attach an already-existing quest as a sub-quest of this one.
  async function attachExisting(childId: string) {
    if (!repos || !childId) return;
    await repos.tasks.update(childId, { parentTaskId: task.id });
    await reload();
    await refresh();
  }
  async function detachSubtask(childId: string) {
    if (!repos) return;
    await repos.tasks.update(childId, { parentTaskId: null });
    await reload();
    await refresh();
  }

  // Candidates: top-level open quests other than this one, its current
  // subtasks, and its own parent (avoids the obvious cycle).
  const subtaskIds = new Set(subtasks.map((s) => s.id));
  const attachable = activeTasks.filter(
    (tk) =>
      tk.id !== task.id &&
      !tk.parentTaskId &&
      !subtaskIds.has(tk.id) &&
      tk.id !== task.parentTaskId,
  );

  const criteriaProgress = useMemo(() => {
    const doneN = criteria.filter((c) => c.done).length;
    return { done: doneN, total: criteria.length };
  }, [criteria]);

  return (
    <Modal title={t("tasks.details")} onClose={onClose} wide>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="qf-input text-base font-medium"
      />
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        onPaste={async (e) => {
          const item = Array.from(e.clipboardData.items).find((i) =>
            i.type.startsWith("image/"),
          );
          if (!item || !repos) return;
          const file = item.getAsFile();
          if (!file) return;
          e.preventDefault();
          const reader = new FileReader();
          reader.onload = async () => {
            await repos.taskImages.add(task.id, String(reader.result));
            await reload();
          };
          reader.readAsDataURL(file);
        }}
        placeholder={t("tasks.notesPlaceholder")}
        rows={2}
        className="qf-input mt-3 resize-none"
      />

      {/* Images */}
      <div className="mt-3">
        <label className="qf-label">{t("tasks.images")}</label>
        {images.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-3">
            {images.map((img) => (
              <div key={img.id} className="group relative">
                <button
                  type="button"
                  onClick={() => setViewer(img.url)}
                  title={t("tasks.imageOpen")}
                  className="block overflow-hidden rounded-md border border-border transition hover:border-accent"
                >
                  <img
                    src={img.url}
                    alt=""
                    className="h-32 w-32 cursor-zoom-in object-cover sm:h-40 sm:w-40"
                    loading="lazy"
                  />
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    if (!repos) return;
                    await repos.taskImages.remove(img.id);
                    await reload();
                  }}
                  className="absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full border border-border bg-bg text-xs text-ink-soft opacity-0 transition group-hover:opacity-100 hover:text-danger"
                  aria-label={t("common.delete")}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
        {viewer && <ImageViewer src={viewer} onClose={() => setViewer(null)} />}
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
            onClick={async () => {
              if (!repos) return;
              const v = imageUrlInput.trim();
              if (!/^https?:\/\//i.test(v)) return;
              await repos.taskImages.add(task.id, v);
              setImageUrlInput("");
              await reload();
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
                if (!file || !repos) return;
                const reader = new FileReader();
                reader.onload = async () => {
                  await repos.taskImages.add(task.id, String(reader.result));
                  await reload();
                };
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
                {t(`difficulty.${d}`)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="qf-label">{t("tasks.priority")}</label>
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value as TaskPriority)}
            className="qf-input mt-1"
          >
            {TASK_PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {t(`priority.${p}`)}
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
            className="qf-input mt-1"
          />
        </div>
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
      </div>

      {/* Stat rewards */}
      <div className="mt-4">
        <label className="qf-label">{t("tasks.statRewards")}</label>
        {stats.length === 0 ? (
          <div className="mt-1 text-xs text-ink-faint">{t("tasks.noStatsYet")}</div>
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
                        ? "border-accent bg-accent/15 text-accent-glow"
                        : "border-border text-ink-soft hover:border-ink-faint"
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
                        setRewards((prev) => ({
                          ...prev,
                          [stat.id]: Number(e.target.value),
                        }))
                      }
                      className="w-16 rounded-lg border border-border bg-bg-soft px-2 py-1 text-xs text-ink"
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}
        <div className="mt-2 text-xs text-ink-faint">
          {t("tasks.totalXp")}: <span className="font-mono text-accent">{clampedTotal}</span>
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
      <div className="mt-5">
        <div className="qf-label">
          {t("tasks.definitionOfDone")}{" "}
          {criteriaProgress.total > 0 && (
            <span className="ml-1 font-mono text-ink-faint">
              {criteriaProgress.done}/{criteriaProgress.total}
            </span>
          )}
        </div>
        <div className="mt-2 space-y-1">
          {criteria.length === 0 && (
            <div className="text-xs text-ink-faint">{t("tasks.noCriteria")}</div>
          )}
          {criteria.map((c) => (
            <div key={c.id} className="group flex items-center gap-2">
              <button
                onClick={() => toggleCriterion(c)}
                className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                  c.done
                    ? "border-success bg-success/20 text-success"
                    : "border-ink-faint text-transparent hover:border-accent"
                }`}
              >
                <IconCheck size={11} />
              </button>
              <span
                className={`flex-1 text-sm ${
                  c.done ? "text-ink-faint line-through" : "text-ink-soft"
                }`}
              >
                {c.text}
              </span>
              <button
                onClick={() => removeCriterion(c)}
                className="text-ink-faint opacity-0 transition group-hover:opacity-100 hover:text-danger"
              >
                <IconTrash size={14} />
              </button>
            </div>
          ))}
        </div>
        <div className="mt-2 flex gap-2">
          <input
            value={newCriterion}
            onChange={(e) => setNewCriterion(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addCriterion()}
            placeholder={t("tasks.addCriterion")}
            className="qf-input flex-1 text-sm"
          />
          <button className="qf-btn-ghost" onClick={addCriterion}>
            <IconPlus size={14} />
          </button>
        </div>
      </div>

      {/* Subtasks */}
      <div className="mt-5">
        <div className="qf-label">{t("tasks.subtasks")}</div>
        <div className="mt-2 space-y-1">
          {subtasks.length === 0 && (
            <div className="text-xs text-ink-faint">{t("tasks.noSubtasks")}</div>
          )}
          {subtasks.map((s) => (
            <div key={s.id} className="group flex items-center gap-2">
              <button
                onClick={() => completeTask(s.id).then(reload)}
                disabled={s.status === "COMPLETED"}
                className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                  s.status === "COMPLETED"
                    ? "border-success bg-success/20 text-success"
                    : "border-ink-faint text-transparent hover:border-accent"
                }`}
              >
                <IconCheck size={11} />
              </button>
              <span
                className={`flex-1 text-sm ${
                  s.status === "COMPLETED" ? "text-ink-faint line-through" : "text-ink-soft"
                }`}
              >
                {s.title}
              </span>
              {s.xpReward > 0 && (
                <span className="font-mono text-xs text-accent">+{s.xpReward}</span>
              )}
              <button
                onClick={() => detachSubtask(s.id)}
                title={t("common.delete")}
                className="text-ink-faint opacity-0 transition group-hover:opacity-100 hover:text-danger"
              >
                <IconTrash size={13} />
              </button>
            </div>
          ))}
        </div>
        <div className="mt-2 flex gap-2">
          <input
            value={newSubtask}
            onChange={(e) => setNewSubtask(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addSubtask()}
            placeholder={t("tasks.addSubtask")}
            className="qf-input flex-1 text-sm"
          />
          <button className="qf-btn-ghost" onClick={addSubtask}>
            <IconPlus size={14} />
          </button>
        </div>
        {attachable.length > 0 && (
          <select
            value=""
            onChange={(e) => attachExisting(e.target.value)}
            className="qf-input mt-2 text-sm"
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

      {/* Actions */}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4">
        <div className="flex gap-2">
          {done ? (
            <button className="qf-btn-ghost" onClick={() => reopenTask(task.id).then(onClose)}>
              {t("tasks.reopen")}
            </button>
          ) : (
            <button
              className="qf-btn-primary"
              onClick={() => completeTask(task.id).then(onClose)}
            >
              <IconCheck size={14} /> {t("tasks.completed")}
            </button>
          )}
          <button className="qf-btn-ghost" onClick={() => cancelTask(task.id).then(onClose)}>
            {t("tasks.cancelQuest")}
          </button>
        </div>
        <div className="flex gap-2">
          <button
            className="qf-btn-danger"
            onClick={() => deleteTask(task.id).then(onClose)}
          >
            <IconTrash size={14} /> {t("common.delete")}
          </button>
          <button className="qf-btn-primary" onClick={saveMeta} disabled={saving}>
            {t("tasks.saveChanges")}
          </button>
        </div>
      </div>
    </Modal>
  );
}
