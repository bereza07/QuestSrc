import { useEffect, useState } from "react";
import { useAppStore } from "@/stores/appStore";
import { useT } from "@/i18n";
import { ProgressBar } from "@/components/ProgressBar";
import { IconPlus, IconGoals, IconTrash, IconCheck, IconEdit, IconX } from "@/components/icons";
import { relativeDayLabel } from "@/utils/date";
import { useI18nStore } from "@/i18n";
import type { Goal } from "@/data/repositories/goalRepo";

export function Goals() {
  const t = useT();
  const lang = useI18nStore((s) => s.lang);
  const repos = useAppStore((s) => s.repos);
  const goals = useAppStore((s) => s.goals);
  const projects = useAppStore((s) => s.projects);
  const refresh = useAppStore((s) => s.refresh);

  const [progress, setProgress] = useState<Map<string, { done: number; total: number }>>(
    new Map(),
  );
  const [showGoalForm, setShowGoalForm] = useState(false);
  // Hide completed goals by default so the list stays focused on active ones.
  // Persisted so the preference survives navigation.
  const [showCompleted, setShowCompleted] = useState<boolean>(() => {
    try {
      return localStorage.getItem("qf.goals.showCompleted") === "1";
    } catch {
      return false;
    }
  });
  function toggleShowCompleted() {
    setShowCompleted((v) => {
      const next = !v;
      try {
        localStorage.setItem("qf.goals.showCompleted", next ? "1" : "0");
      } catch { /* ignore */ }
      return next;
    });
  }

  // Search + project filter — live-filtered, no debounce needed at these sizes.
  const [query, setQuery] = useState("");
  const [projectFilter, setProjectFilter] = useState<string>("");
  const [editing, setEditing] = useState<string | null>(null);
  const q = query.trim().toLowerCase();
  const matchesQuery = (g: (typeof goals)[number]) =>
    !q || g.title.toLowerCase().includes(q) || (g.description ?? "").toLowerCase().includes(q);
  const matchesProject = (g: (typeof goals)[number]) =>
    !projectFilter ||
    (projectFilter === "__none__" ? g.projectId == null : g.projectId === projectFilter);
  const filteredGoals = goals.filter((g) => matchesQuery(g) && matchesProject(g));
  const visibleGoals = showCompleted ? filteredGoals : filteredGoals.filter((g) => !g.completedAt);
  const completedCount = filteredGoals.length - filteredGoals.filter((g) => !g.completedAt).length;

  useEffect(() => {
    if (!repos) return;
    repos.goals.progressByGoal().then(setProgress);
  }, [repos, goals]);

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-fg">{t("goals.title")}</h1>
        <div className="flex items-center gap-3">
          {completedCount > 0 && (
            <button
              type="button"
              className="text-xs text-fg-3 hover:text-fg-2"
              onClick={toggleShowCompleted}
            >
              {showCompleted
                ? t("goals.hideCompleted", { count: completedCount })
                : t("goals.showCompleted", { count: completedCount })}
            </button>
          )}
          <button className="qf-btn-primary" onClick={() => setShowGoalForm((v) => !v)}>
            <IconPlus size={16} /> {t("goals.newGoal")}
          </button>
        </div>
      </div>

      <ProjectsCard />

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("goals.searchPlaceholder")}
          className="qf-input flex-1 min-w-[12rem]"
        />
        <select
          value={projectFilter}
          onChange={(e) => setProjectFilter(e.target.value)}
          // Native <select> needs extra right padding so the chevron doesn't
          // sit on top of the text, and no fixed h-N so the label isn't clipped.
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

      {showGoalForm && <NewGoalForm onDone={() => setShowGoalForm(false)} />}

      <div className="mt-6 space-y-3">
        {visibleGoals.length === 0 && !showGoalForm && (
          <div className="qf-card py-16 text-center text-sm text-fg-3">
            {goals.length === 0 ? t("goals.empty") : t("goals.allDone")}
          </div>
        )}
        {visibleGoals.map((g) => {
          const p = progress.get(g.id) ?? { done: 0, total: 0 };
          const frac = p.total > 0 ? p.done / p.total : 0;
          const project = projects.find((pr) => pr.id === g.projectId);
          return (
            <section key={g.id} className="qf-card p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    {g.isMainQuest && (
                      <span className="rounded-full bg-accent-bg px-2 py-0.5 text-[11px] uppercase tracking-wider text-accent">
                        ★ {t("goals.mainQuest")}
                      </span>
                    )}
                    <IconGoals size={16} className="text-fg-3" />
                    <h2 className={`truncate text-base font-medium ${g.completedAt ? "text-fg-3 line-through" : "text-fg"}`}>
                      {g.title}
                    </h2>
                    {g.completedAt && (
                      <span className="rounded-full bg-success-bg px-2 py-0.5 text-[10px] uppercase tracking-wider text-success">
                        ✓ {t("goals.completed")}
                      </span>
                    )}
                  </div>
                  {g.description && (
                    <p className="mt-1 text-sm text-fg-2">{g.description}</p>
                  )}
                  <div className="mt-1 flex flex-wrap gap-3 text-xs text-fg-3">
                    {project && <span>· {project.name}</span>}
                    {g.deadline && (
                      <span>
                        {t("goals.deadline")}: {relativeDayLabel(g.deadline, t, lang)}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 gap-1">
                  <button
                    className="qf-btn-ghost text-xs"
                    onClick={() => setEditing((cur) => (cur === g.id ? null : g.id))}
                  >
                    {editing === g.id ? t("common.cancel") : t("common.edit")}
                  </button>
                  {!g.isMainQuest && !g.completedAt && (
                    <button
                      className="qf-btn-ghost text-xs"
                      onClick={() => repos?.goals.setMainQuest(g.id).then(refresh)}
                    >
                      {t("goals.setAsMainQuest")}
                    </button>
                  )}
                  <button
                    className={`qf-btn-ghost text-xs ${g.completedAt ? "" : "text-success"}`}
                    onClick={() =>
                      repos?.goals.setCompleted(g.id, !g.completedAt).then(refresh)
                    }
                  >
                    {g.completedAt ? t("goals.reopen") : (
                      <><IconCheck size={12} /> {t("goals.markComplete")}</>
                    )}
                  </button>
                  <button
                    className="rounded-md p-2 text-fg-3 hover:text-danger"
                    onClick={() => repos?.goals.delete(g.id).then(refresh)}
                    aria-label={t("common.delete")}
                  >
                    <IconTrash size={16} />
                  </button>
                </div>
              </div>

              <div className="mt-3">
                <div className="mb-1 flex justify-between text-xs text-fg-3">
                  <span>{t("goals.progress")}</span>
                  <span className="font-mono">
                    {t("goals.completedOf", { done: p.done, total: p.total })}
                  </span>
                </div>
                <ProgressBar value={frac} height={6} />
              </div>

              {editing === g.id && (
                <EditGoalForm
                  goal={g}
                  onDone={() => setEditing(null)}
                />
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}

function ProjectsCard() {
  const t = useT();
  const repos = useAppStore((s) => s.repos);
  const projects = useAppStore((s) => s.projects);
  const refresh = useAppStore((s) => s.refresh);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  // Editing a project's description in place — lets the user tell the AI what
  // this project is about so it can auto-route tasks correctly.
  const [editingDesc, setEditingDesc] = useState<string | null>(null);
  const [descDraft, setDescDraft] = useState("");

  async function add() {
    const n = name.trim();
    if (!n || !repos) return;
    await repos.projects.create({ name: n, description: description.trim() || null });
    setName("");
    setDescription("");
    await refresh();
  }

  async function saveDesc(id: string) {
    if (!repos) return;
    await repos.projects.update(id, { description: descDraft.trim() || null });
    setEditingDesc(null);
    await refresh();
  }

  return (
    <section className="qf-card mt-4 p-5">
      <div className="qf-label">{t("projects.title")}</div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {projects.length === 0 && (
          <span className="text-xs text-fg-3">{t("projects.empty")}</span>
        )}
        {projects.map((p) => (
          <span
            key={p.id}
            className="group flex items-center gap-1 rounded-full border border-border px-3 py-1 text-sm text-fg-2"
            title={p.description ?? ""}
          >
            {p.name}
            <button
              onClick={() => {
                setDescDraft(p.description ?? "");
                setEditingDesc((cur) => (cur === p.id ? null : p.id));
              }}
              className="ml-1 text-fg-3 opacity-70 hover:text-accent"
              aria-label={t("common.edit")}
            >
              <IconEdit size={12} />
            </button>
            <button
              onClick={() => repos?.projects.delete(p.id).then(refresh)}
              className="text-fg-3 opacity-0 transition group-hover:opacity-100 hover:text-danger"
              aria-label={t("common.delete")}
            >
              <IconX size={12} />
            </button>
          </span>
        ))}
      </div>

      {editingDesc && (
        <div className="mt-3 rounded-lg border border-border bg-surface-2 p-3">
          <label className="qf-label">{t("projects.descriptionLabel")}</label>
          <textarea
            value={descDraft}
            onChange={(e) => setDescDraft(e.target.value)}
            placeholder={t("projects.descriptionPlaceholder")}
            rows={2}
            className="qf-input mt-1 resize-none text-sm"
          />
          <div className="mt-2 flex justify-end gap-2">
            <button className="qf-btn-ghost text-xs" onClick={() => setEditingDesc(null)}>
              {t("common.cancel")}
            </button>
            <button className="qf-btn-primary text-xs" onClick={() => saveDesc(editingDesc)}>
              {t("common.save")}
            </button>
          </div>
        </div>
      )}

      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder={t("projects.namePlaceholder")}
          className="qf-input flex-1 text-sm"
        />
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={t("projects.descriptionPlaceholder")}
          className="qf-input flex-[2] text-sm"
        />
        <button className="qf-btn-ghost" onClick={add}>
          <IconPlus size={14} /> {t("projects.newProject")}
        </button>
      </div>
    </section>
  );
}

function NewGoalForm({ onDone }: { onDone: () => void }) {
  const t = useT();
  const repos = useAppStore((s) => s.repos);
  const projects = useAppStore((s) => s.projects);
  const refresh = useAppStore((s) => s.refresh);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [deadline, setDeadline] = useState("");
  const [projectId, setProjectId] = useState("");
  const [isMainQuest, setIsMainQuest] = useState(false);
  const [busy, setBusy] = useState(false);

  async function save() {
    const ttl = title.trim();
    if (!ttl || !repos) return;
    setBusy(true);
    try {
      await repos.goals.create({
        title: ttl,
        description: description.trim() || null,
        deadline: deadline || null,
        projectId: projectId || null,
        isMainQuest,
      });
      await refresh();
      onDone();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="qf-card mt-4 p-5">
      <input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={t("goals.titlePlaceholder")}
        className="qf-input"
      />
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder={t("goals.descPlaceholder")}
        rows={2}
        className="qf-input mt-3 resize-none"
      />
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="qf-label">{t("goals.deadline")}</label>
          <input
            type="date"
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
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
      </div>
      <label className="mt-3 flex items-center gap-2 text-sm text-fg-2">
        <input
          type="checkbox"
          checked={isMainQuest}
          onChange={(e) => setIsMainQuest(e.target.checked)}
        />
        {t("goals.setAsMainQuest")}
      </label>
      <div className="mt-4 flex justify-end gap-2">
        <button className="qf-btn-ghost" onClick={onDone} disabled={busy}>
          {t("common.cancel")}
        </button>
        <button className="qf-btn-primary" onClick={save} disabled={busy}>
          {t("common.create")}
        </button>
      </div>
    </div>
  );
}

// Inline edit form for an existing goal. Fields: title, description, deadline,
// project. Saved via goalRepo.update — no re-create, keeps linked tasks.
function EditGoalForm({ goal, onDone }: { goal: Goal; onDone: () => void }) {
  const t = useT();
  const repos = useAppStore((s) => s.repos);
  const projects = useAppStore((s) => s.projects);
  const refresh = useAppStore((s) => s.refresh);

  const [title, setTitle] = useState(goal.title);
  const [description, setDescription] = useState(goal.description ?? "");
  const [deadline, setDeadline] = useState(goal.deadline ?? "");
  const [projectId, setProjectId] = useState(goal.projectId ?? "");
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!repos || !title.trim()) return;
    setBusy(true);
    try {
      await repos.goals.update(goal.id, {
        title: title.trim(),
        description: description.trim() || null,
        deadline: deadline || null,
        projectId: projectId || null,
      });
      await refresh();
      onDone();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 rounded-lg border border-border bg-surface-2 p-3">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={t("goals.titlePlaceholder")}
        className="qf-input"
      />
      <input
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder={t("goals.descPlaceholder")}
        className="qf-input mt-2"
      />
      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div>
          <label className="qf-label">{t("goals.deadline")}</label>
          <input
            type="date"
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
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
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <button className="qf-btn-ghost text-xs" onClick={onDone} disabled={busy}>
          {t("common.cancel")}
        </button>
        <button className="qf-btn-primary text-xs" onClick={save} disabled={busy || !title.trim()}>
          {t("common.save")}
        </button>
      </div>
    </div>
  );
}
