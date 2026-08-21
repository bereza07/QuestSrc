import type { Repositories } from "@/data/repositories";
import type { StatReward } from "@/types";
import type { AIAction, AIResponse, ValidatedActions } from "@/types/ai";
import { AIError, type AIProvider, type AIProviderConfig, type AIReply, type AIToolCall, type AITool, type ChatMessage } from "./provider";
import { createDeepSeekProvider } from "./deepseek";
import { buildSystemPrompt } from "./systemPrompt";
import { buildAIContext } from "./contextBuilder";
import { validateActions } from "@/domain/aiValidation";
import { secretStore } from "./secretStore";
import { createTask as svcCreateTask, complete as svcComplete, reschedule as svcReschedule, deleteTask as svcDeleteTask } from "@/services/tasks/taskService";
import { createStat as svcCreateStat } from "@/services/character/statService";
import type { Lang } from "@/i18n";

const DEFAULTS = {
  provider: "deepseek",
  model: "deepseek-chat",
  baseUrl: "https://api.deepseek.com",
};

export async function getAIConfig(repos: Repositories): Promise<AIProviderConfig> {
  const all = await repos.settings.getAll();
  return {
    provider: all["ai.provider"] ?? DEFAULTS.provider,
    model: all["ai.model"] ?? DEFAULTS.model,
    baseUrl: all["ai.baseUrl"] ?? DEFAULTS.baseUrl,
    apiKey: secretStore.getApiKey() ?? "",
  };
}

export function isAIConfigured(): boolean {
  return secretStore.hasApiKey();
}

function makeProvider(config: AIProviderConfig): AIProvider {
  // deepseek / openai / custom are all OpenAI-compatible chat-completions.
  return createDeepSeekProvider(config);
}

/** Robustly pull a JSON object out of a possibly-fenced/prousty model reply. */
function parseResponse(raw: string): AIResponse {
  let s = raw.trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start >= 0 && end > start) s = s.slice(start, end + 1);

  let obj: unknown;
  try {
    obj = JSON.parse(s);
  } catch {
    // Model replied with plain prose — treat it all as a chat message.
    return { message: raw.trim(), actions: [] };
  }
  const rec = obj as { message?: unknown; actions?: unknown; reply?: unknown; text?: unknown };
  const actions = Array.isArray(rec.actions) ? (rec.actions as AIAction[]) : [];
  // Accept a few common field names; never end up with an empty bubble when
  // there are no actions — fall back to the raw text so the user always sees it.
  let message =
    typeof rec.message === "string"
      ? rec.message
      : typeof rec.reply === "string"
        ? rec.reply
        : typeof rec.text === "string"
          ? rec.text
          : "";
  if (!message.trim() && actions.length === 0) message = raw.trim();
  return { message, actions };
}

// Rescue path: parse a "Добавляю задачу 'X' — MEDIUM, 90 мин, 20 августа" claim
// into a real CREATE_TASK action when the model narrated in prose but forgot
// (again) to emit the structured action.
function tryExtractCreateTask(text: string): AIAction | null {
  if (!text) return null;
  // Title: any of these quote pairs after the "add/добавляю" verb, or plain
  // capitalized phrase.
  const titleMatch =
    text.match(/[«"'‘“]([^»"'’”]{2,120})[»"'’”]/) ??
    text.match(/(?:задач[уи]|task)\s+["'«‘“]?([^"'»’”\n.]{2,120})["'»’”]?/i);
  const title = titleMatch?.[1]?.trim();
  if (!title) return null;

  // Difficulty — accept English or Russian synonyms. Uses Unicode-friendly
  // char classes so ё/й are treated as letters (default \w* excludes them).
  const dm = text.match(
    /(TRIVIAL|EASY|MEDIUM|HARD|EPIC|тривиальн[а-яё]*|л[её]гк[а-яё]*|средн[а-яё]*|тяж[её]л[а-яё]*|сложн[а-яё]*|эпическ[а-яё]*)/i,
  );
  const diffMap: Record<string, "TRIVIAL" | "EASY" | "MEDIUM" | "HARD" | "EPIC"> = {
    trivial: "TRIVIAL", тривиальная: "TRIVIAL", тривиальный: "TRIVIAL",
    easy: "EASY", лёгкая: "EASY", легкая: "EASY", лёгкий: "EASY", легкий: "EASY",
    medium: "MEDIUM", средняя: "MEDIUM", средний: "MEDIUM",
    hard: "HARD", тяжелая: "HARD", тяжёлая: "HARD", сложная: "HARD", сложный: "HARD",
    epic: "EPIC", эпическая: "EPIC", эпический: "EPIC",
  };
  const difficulty = dm ? diffMap[dm[1].toLowerCase()] ?? undefined : undefined;

  const em = text.match(/(\d{1,3})\s*(?:мин|минут|min|minute)/i);
  const estimatedMinutes = em ? Number(em[1]) : undefined;

  // Explicit ISO date preferred; else month-name date.
  const isoDate = text.match(/\b(20\d{2}-\d{2}-\d{2})\b/)?.[1];
  const monthName = text.match(
    /\b(\d{1,2})\s+(январ|феврал|март|апрел|ма[йя]|июн|июл|август|сентябр|октябр|ноябр|декабр)/i,
  );
  const monthIdx = monthName
    ? ["январ", "феврал", "март", "апрел", "ма", "июн", "июл", "август", "сентябр", "октябр", "ноябр", "декабр"]
        .findIndex((m) => monthName[2].toLowerCase().startsWith(m))
    : -1;
  let plannedDate: string | undefined = isoDate;
  if (!plannedDate && monthName && monthIdx >= 0) {
    const day = Number(monthName[1]);
    const year = new Date().getFullYear();
    plannedDate = `${year}-${String(monthIdx + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  return {
    type: "CREATE_TASK",
    title,
    difficulty,
    estimatedMinutes,
    plannedDate,
  } as AIAction;
}

// Detects when the model claims to have performed an action — matches BOTH
// past tense (added / addded / готово) and narrative present ("adding…" /
// "добавляю…") in EN and RU. Shared between envelope and agent modes.
// Detects when the model says "waiting for your answer to the questions above"
// without actually asking anything in this reply — a hallucination we retry out.
const PHANTOM_QUESTIONS_REGEX =
  /(жд[уи]\s+(?:твоего\s+)?ответ|отв[её]т(?:ь|ьте)?\s+на\s+вопрос|как\s+я\s+спраш|выше\s+я\s+спросил|waiting\s+for\s+(?:your\s+)?(?:answer|reply)|answer\s+the\s+questions|as\s+i\s+asked)/i;

const CLAIM_REGEX = new RegExp(
  "(" +
    "доба́?вил[аи]?|созда́?л[аи]?|обнови[лвш]|перен[её]с|поста́?вил[аи]?|запланирова[лвш]|распредели[лвш]|назначи[лвш]|помести[лвш]|" +
    "добавля[юе]|ста́?в(?:лю|ит)|созда(?:ю|[её]т)|обновля[юе]|планиру[юе]|распредел[юе]|распределя[юе]|назнача[юе]|помеща[юе]|" +
    "готов[оа]\\b|сде́?лан[оаы]|выполне́?н[оаы]|" +
    "added|created|updated|moved|scheduled|assigned|placed|completed|done|" +
    "\\b(adding|setting|creating|updating|moving|scheduling|assigning|placing|completing)\\b" +
  ")",
  "i",
);

// ─── Agent-mode tool schemas ─────────────────────────────────────────────────
// One tool per action type. Model MUST call a tool to change data — no more
// prose-only "Добавляю…" replies without a real action.
const DIFFICULTY = { type: "string", enum: ["TRIVIAL", "EASY", "MEDIUM", "HARD", "EPIC"] };
const PRIORITY = { type: "string", enum: ["LOW", "NORMAL", "HIGH", "CRITICAL"] };

export const AI_TOOLS: AITool[] = [
  {
    name: "create_task",
    description:
      "Create a new quest (task). Use for ANY request to add / create / plan a task. " +
      "Provide as many fields as the user specified; the app will fill sensible defaults.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "Concrete, measurable title." },
        description: { type: "string" },
        difficulty: DIFFICULTY,
        priority: PRIORITY,
        estimatedMinutes: { type: "integer", minimum: 1 },
        plannedDate: { type: "string", description: "YYYY-MM-DD" },
        deadline: { type: "string", description: "YYYY-MM-DD" },
        projectId: {
          type: "string",
          description: "Real project id from CONTEXT.projects, or empty to leave unassigned.",
        },
        goalId: {
          type: "string",
          description:
            "Real goal id from CONTEXT.goals, OR the string 'new:<slug>' matching a " +
            "create_goal call in the SAME turn — the app resolves it to the real id " +
            "on apply. Use this to link decomposed sub-quests to a fresh goal.",
        },
        statRewards: {
          type: "array",
          items: {
            type: "object",
            properties: { statName: { type: "string" }, xp: { type: "integer", minimum: 1 } },
            required: ["statName", "xp"],
          },
        },
        definitionOfDone: { type: "array", items: { type: "string" } },
        parentTaskId: {
          type: "string",
          description:
            "Real id from CONTEXT.activeTasks. Setting this makes the new quest a " +
            "SUB-QUEST of that existing quest (breakdown). Use when the user asks " +
            "to split / decompose an existing task.",
        },
      },
      required: ["title"],
    },
  },
  {
    name: "create_goal",
    description: "Create a long-term goal.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string" },
        description: { type: "string" },
        deadline: { type: "string", description: "YYYY-MM-DD" },
        isMainQuest: { type: "boolean" },
        projectId: {
          type: "string",
          description:
            "Attach this goal to a project. Real id from CONTEXT.projects OR " +
            "'new:<slug>' matching a create_project call in the SAME turn. If " +
            "you are creating a goal to group tasks that all belong to project X, " +
            "set this to X's id — the app also copies it to child tasks by default.",
        },
      },
      required: ["title"],
    },
  },
  {
    name: "create_project",
    description:
      "Create a new project (a container for related quests, e.g. 'SpellCrafter', " +
      "'University'). Use when the user names a project not present in " +
      "CONTEXT.projects. Sub-quests in the same batch should reference this new " +
      "project via `projectId: \"new:<slug>\"` — the app resolves the placeholder " +
      "to the real id at apply time.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string" },
        description: { type: "string" },
        color: { type: "string", description: "Optional hex, e.g. #6f8cff" },
      },
      required: ["name"],
    },
  },
  {
    name: "create_stat",
    description: "Create a new character stat.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string" },
        description: { type: "string" },
        icon: { type: "string" },
      },
      required: ["name"],
    },
  },
  {
    name: "create_achievement",
    description: "Propose a custom achievement tied to a metric threshold.",
    parameters: {
      type: "object",
      properties: {
        key: { type: "string", description: "slug, e.g. first_boss_slain" },
        name: { type: "string" },
        description: { type: "string" },
        icon: { type: "string" },
        condition: {
          type: "object",
          properties: {
            metric: {
              type: "string",
              enum: [
                "completedCount",
                "currentStreak",
                "longestStreak",
                "characterLevel",
                "focusedSeconds",
              ],
            },
            atLeast: { type: "number" },
          },
          required: ["metric", "atLeast"],
        },
      },
      required: ["key", "name", "description", "condition"],
    },
  },
  {
    name: "move_task",
    description: "Reschedule an existing quest to a new planned date (or clear it).",
    parameters: {
      type: "object",
      properties: {
        taskId: { type: "string" },
        plannedDate: { type: ["string", "null"], description: "YYYY-MM-DD or null" },
      },
      required: ["taskId", "plannedDate"],
    },
  },
  {
    name: "update_task",
    description: "Update fields of an existing quest.",
    parameters: {
      type: "object",
      properties: {
        taskId: { type: "string" },
        fields: {
          type: "object",
          properties: {
            title: { type: "string" },
            description: { type: "string" },
            difficulty: DIFFICULTY,
            priority: PRIORITY,
            estimatedMinutes: { type: "integer", minimum: 0 },
            plannedDate: { type: "string" },
            deadline: { type: "string" },
            goalId: {
              type: "string",
              description:
                "Attach to this goal. Real id from CONTEXT.goals, or " +
                "'new:<slug>' matching a create_goal call in the same turn, or " +
                "empty string to detach.",
            },
            projectId: {
              type: "string",
              description:
                "Attach to this project. Real id from CONTEXT.projects, or " +
                "'new:<slug>' matching a create_project call in the same turn, or " +
                "empty string to detach.",
            },
          },
        },
      },
      required: ["taskId", "fields"],
    },
  },
  {
    name: "complete_task",
    description: "Mark an existing quest as completed.",
    parameters: {
      type: "object",
      properties: { taskId: { type: "string" } },
      required: ["taskId"],
    },
  },
  {
    name: "delete_task",
    description: "Delete an existing quest.",
    parameters: {
      type: "object",
      properties: { taskId: { type: "string" } },
      required: ["taskId"],
    },
  },
  {
    name: "ask_choices",
    description:
      "Ask the user 1-6 short questions with pre-defined options (multiple choice). " +
      "USE THIS INSTEAD of asking in prose whenever you have concrete choices to " +
      "offer — the app renders a proper form modal (radio / checkbox / 'Other'). " +
      "Do NOT also propose create/update actions in the same turn.",
    parameters: {
      type: "object",
      properties: {
        questions: {
          type: "array",
          minItems: 1,
          maxItems: 6,
          items: {
            type: "object",
            properties: {
              prompt: { type: "string", description: "The question text." },
              options: {
                type: "array",
                items: { type: "string" },
                description: "Available choices (empty for a free-text question).",
              },
              allowMultiple: {
                type: "boolean",
                description: "true = checkboxes (multi-select); default = radio.",
              },
              allowCustom: {
                type: "boolean",
                description: "true = show an 'Other…' free-text field. Default true.",
              },
            },
            required: ["prompt"],
          },
        },
      },
      required: ["questions"],
    },
  },
  {
    name: "create_rule",
    description:
      "Add a persistent rule to the user's AI assistant preferences (a limit or " +
      "constraint the AI should always respect, e.g. 'no more than 12 hours of " +
      "focus tasks per day'). Store the rule as a short one-sentence instruction.",
    parameters: {
      type: "object",
      properties: {
        text: {
          type: "string",
          description: "Single sentence, imperative, ≤500 chars, in the user's language.",
        },
      },
      required: ["text"],
    },
  },
  {
    name: "update_rule",
    description: "Change the text of an existing rule (use its id from CONTEXT.rules).",
    parameters: {
      type: "object",
      properties: {
        ruleId: { type: "string" },
        text: { type: "string" },
      },
      required: ["ruleId", "text"],
    },
  },
  {
    name: "delete_rule",
    description: "Delete an existing rule (use its id from CONTEXT.rules).",
    parameters: {
      type: "object",
      properties: { ruleId: { type: "string" } },
      required: ["ruleId"],
    },
  },
];

/** Turn provider tool_calls into our AIAction union (validator runs after). */
export function toolCallsToActions(calls: AIToolCall[]): AIAction[] {
  const out: AIAction[] = [];
  for (const c of calls) {
    const a = c.arguments;
    switch (c.name) {
      case "create_task":
        out.push({ type: "CREATE_TASK", ...(a as object) } as AIAction);
        break;
      case "create_goal":
        out.push({ type: "CREATE_GOAL", ...(a as object) } as AIAction);
        break;
      case "create_project":
        out.push({ type: "CREATE_PROJECT", ...(a as object) } as AIAction);
        break;
      case "ask_choices":
        out.push({ type: "ASK_CHOICES", ...(a as object) } as AIAction);
        break;
      case "create_stat":
        out.push({ type: "CREATE_STAT", ...(a as object) } as AIAction);
        break;
      case "create_achievement":
        out.push({ type: "CREATE_ACHIEVEMENT", ...(a as object) } as AIAction);
        break;
      case "move_task":
        out.push({ type: "MOVE_TASK", ...(a as object) } as AIAction);
        break;
      case "update_task":
        out.push({ type: "UPDATE_TASK", ...(a as object) } as AIAction);
        break;
      case "complete_task":
        out.push({ type: "COMPLETE_TASK", ...(a as object) } as AIAction);
        break;
      case "delete_task":
        out.push({ type: "DELETE_TASK", ...(a as object) } as AIAction);
        break;
      case "create_rule":
        out.push({ type: "CREATE_RULE", ...(a as object) } as AIAction);
        break;
      case "update_rule":
        out.push({ type: "UPDATE_RULE", ...(a as object) } as AIAction);
        break;
      case "delete_rule":
        out.push({ type: "DELETE_RULE", ...(a as object) } as AIAction);
        break;
      /* Unknown tool name → skip; validator would also drop it. */
    }
  }
  return out;
}

export interface AITurnResult {
  message: string;
  validated: ValidatedActions;
}

/** Send one user turn and get back the assistant message + validated actions. */
export async function sendAIMessage(
  repos: Repositories,
  lang: Lang,
  history: ChatMessage[],
  userText: string,
  scopeProjectId: string | null = null,
): Promise<AITurnResult> {
  const config = await getAIConfig(repos);
  if (!config.apiKey) throw new AIError("Missing API key", "no-key");

  const all = await repos.settings.getAll();
  const thoroughness = Number(all["ai.thoroughness"]);
  const mode: "envelope" | "agent" = all["ai.mode"] === "agent" ? "agent" : "envelope";
  const context = await buildAIContext(repos);

  // When the user pinned an "active project" in the chat header, tell the model
  // to route new quests into it by default. Model can still override for a task
  // that is obviously about a different project.
  let scopeHint = "";
  if (scopeProjectId) {
    const proj = (await repos.projects.list()).find((p) => p.id === scopeProjectId);
    if (proj) {
      scopeHint =
        `\n\n=== ACTIVE PROJECT SCOPE (highest priority) ===\n` +
        `The user has pinned project "${proj.name}" (id ${proj.id}) in the chat header.\n` +
        `RULES for this and every following turn until the scope changes:\n` +
        `• DO NOT ASK "в какой проект / which project?" — the answer is already "${proj.name}".\n` +
        `• Set projectId="${proj.id}" on EVERY create_task and every update_task fields.projectId you emit — do not omit it.\n` +
        `• Also inherit this projectId for any new GOAL that groups these tasks (create_goal.projectId="${proj.id}").\n` +
        `• Only override with a different project if the user's message explicitly names another one.\n`;
    }
  }

  // If the user's turn looks like a bare affirmative to a prior proposal, add
  // an inline nudge so the model doesn't just reply "готово" without actions —
  // the most common failure mode we saw in prod (see chat logs Aug 17).
  // Users express "yes, do it" many ways — anything containing an affirmation
  // token AND no more than ~4 short words counts. Catches: "да", "ok", "ну
  // добавь", "давай, добавь", "поехали", "сделай", "го", "confirm please".
  const AFFIRM_TOKEN =
    /\b(да|ага|ок(?:ей)?|подтверждаю|подойд[её]т|давай(?:те)?|добав[ьи]|создай|поставь|поехали|сдела[йем]|го|yes+|yep|yeah|ok+|okay|sure|go ahead|do it|confirm)\b/i;
  const trimmed = userText.trim();
  const wordCount = trimmed.split(/\s+/).length;
  const AFFIRM = { test: (s: string) => wordCount <= 6 && AFFIRM_TOKEN.test(s) };
  const lastAssistant = [...history].reverse().find((m) => m.role === "assistant");
  const shouldNudge =
    AFFIRM.test(userText) &&
    lastAssistant &&
    lastAssistant.content.trim().length > 0 &&
    // last assistant turn had no actions — otherwise Confirm would've been used
    !/"actions"\s*:\s*\[[^\]]+\]/.test(lastAssistant.content);
  const nudgedUser = shouldNudge
    ? `${userText}\n\n[System note: the user has just confirmed your previous plan. RETURN THE ACTIONS from your previous message as real action objects in this turn. Do not reply with "done"/"добавил"/"готово" without actions — the app can't add anything without them.]`
    : userText;

  // Per-turn reminder injected RIGHT BEFORE the user message. In long chats the
  // main system prompt can drift; a short reminder next to the current turn
  // keeps action-vs-chat behaviour reliable. Localised so the model doesn't
  // drift to English when a big English block is the last system message.
  const langHint =
    lang === "ru"
      ? "Отвечай пользователю только на русском языке."
      : "Reply to the user in English only.";
  const reminder: ChatMessage = {
    role: "system",
    content:
      langHint +
      "\n\nREMINDER for this turn:\n" +
      "1) If the user's request names a concrete action (add/create/schedule/move/complete/delete/rename a quest, goal, stat), " +
      "RETURN the corresponding action object / tool call. Do NOT just say 'добавляю/ставлю/готово/adding' in the message — the action must be emitted structurally.\n" +
      "2) If the user typed 'да/ок/подтверждаю/подойдёт/yes' AFTER your previous proposal in the SAME conversation, EMIT the actions from that proposal now.\n" +
      "3) IGNORE past assistant messages tagged `[Proposed actions were APPLIED/DISMISSED]` — those are DONE. Do NOT emit their actions again. Focus ONLY on the LATEST user message.\n" +
      "4) Never ask 'подтверждаешь?/confirm?' in text — the app renders Confirm buttons whenever actions are present.\n" +
      "5) The `actions` field is REQUIRED in every response (may be an empty array only for pure chat questions).\n" +
      "6) NEVER say 'жду ответа на вопросы' / 'waiting for your answer' / 'ответь на вопросы выше' unless YOU actually listed concrete questions IN THIS REPLY (each ending with '?'). Never reference imaginary earlier questions.\n" +
      "7) ASK-XOR-ACT: if your message contains ANY question ('?'), your `actions` MUST be empty. NEVER ask for clarification AND propose a create/move/update in the same turn — the user would confirm blindly before answering. If you have enough info to act, act (no question). If you need to ask, ask ONLY (no actions)." +
      scopeHint,
  };

  const messages: ChatMessage[] = [
    {
      role: "system",
      content: buildSystemPrompt(
        lang,
        Number.isFinite(thoroughness) ? thoroughness : 50,
        mode,
      ),
    },
    // User-set rules go BEFORE context so they read as commands, not data.
    ...(context.rulesBlock ? [{ role: "system" as const, content: context.rulesBlock }] : []),
    // Active project scope is a hard commitment — put it as its own system
    // message so a long chat can't dilute it. Also duplicated in reminder.
    ...(scopeHint ? [{ role: "system" as const, content: scopeHint }] : []),
    { role: "system", content: context.contextJson },
    ...history,
    reminder,
    { role: "user", content: nudgedUser },
  ];

  const provider = makeProvider(config);

  // AGENT MODE: use OpenAI-compatible tool calling. Any structural change goes
  // through a function call — model physically cannot claim "готово" without
  // returning a real action object. Configured per user in Settings.
  if (mode === "agent") {
    let reply = await provider.chat(messages, { tools: AI_TOOLS });
    let actions = toolCallsToActions(reply.toolCalls);
    let messageText = reply.text;

    // Some models ignore the tool API and dump a legacy JSON envelope into the
    // text ({"message":"…","actions":[…]}). Extract it as a graceful fallback,
    // and strip the JSON from the visible message so the user doesn't see it.
    if (!actions.length && messageText.includes('"actions"')) {
      const envelope = parseResponse(messageText);
      if (envelope.actions.length || envelope.message.trim()) {
        actions = envelope.actions;
        messageText = envelope.message || "";
      }
    }
    // Strip stray English "think-out-loud" that appears BEFORE a code block
    // containing JSON — models often preface tool calls with a monologue.
    messageText = messageText.replace(/```(?:json)?[\s\S]*?```/g, "").trim();
    // Strip any stray tool-envelope JSON that leaked into the message text.
    messageText = messageText.replace(/\{[\s\S]*?"actions"[\s\S]*?\}/g, "").trim();

    // AGENT-MODE CLAIM CHECK: if the model wrote "Ставлю задачу…" / "Adding…"
    // but returned zero tool_calls AND no envelope actions, force a retry that
    // tells it EXPLICITLY to call the tool. This is the same safety net that
    // the envelope branch has — without it, the user sees the "no changes
    // proposed" hint even though the model verbally promised to do it.
    if (actions.length === 0 && CLAIM_REGEX.test(messageText)) {
      const correction: ChatMessage = {
        role: "system",
        content:
          "Your last reply CLAIMED you performed an action but you did NOT call any tool. " +
          "You have no other way to change data. Reply again and CALL THE APPROPRIATE TOOL " +
          "(create_task / move_task / create_rule / …) with the fields you described. " +
          "If you truly cannot yet act, say so plainly instead of pretending.",
      };
      reply = await provider.chat(
        [...messages, correction, { role: "assistant", content: messageText }],
        { tools: AI_TOOLS, toolChoice: "auto" },
      );
      actions = toolCallsToActions(reply.toolCalls);
      messageText =
        (reply.text || "").replace(/```(?:json)?[\s\S]*?```/g, "").trim() ||
        messageText;
      // Second-round envelope fallback.
      if (!actions.length && reply.text && reply.text.includes('"actions"')) {
        const env2 = parseResponse(reply.text);
        if (env2.actions.length) {
          actions = env2.actions;
          messageText = env2.message || "";
        }
      }
      // Local synthesis as last resort — same trick the envelope branch uses.
      if (actions.length === 0) {
        const synth = tryExtractCreateTask(messageText);
        if (synth) actions = [synth];
      }
    }

    // PHANTOM QUESTIONS CHECK (agent mode). Model says "waiting for your reply"
    // but never actually asked anything in this turn. Retry with a correction.
    if (
      actions.length === 0 &&
      PHANTOM_QUESTIONS_REGEX.test(messageText) &&
      !messageText.includes("?")
    ) {
      const correction: ChatMessage = {
        role: "system",
        content:
          "You referenced questions you supposedly asked earlier, but there are NO " +
          "such questions in the transcript. Either: (a) ASK 1–3 concrete questions " +
          "RIGHT NOW as a numbered list (each ending in '?'), OR (b) pick sensible " +
          "defaults and CALL the appropriate tool. Do not stall by pretending you " +
          "already asked.",
      };
      const rp = await provider.chat(
        [...messages, correction, { role: "assistant", content: messageText }],
        { tools: AI_TOOLS, toolChoice: "auto" },
      );
      const newActions = toolCallsToActions(rp.toolCalls);
      const newText = (rp.text || "").replace(/```(?:json)?[\s\S]*?```/g, "").trim();
      if (newActions.length || newText.includes("?") || newText) {
        actions = newActions.length ? newActions : actions;
        messageText = newText || messageText;
      }
    }

    // Drop actions that reference tasks the model made up (task_id not in the
    // current context) — most often a re-emission of an already-applied call.
    const taskIdSet = new Set<string>();
    const activeBlock = context.contextJson.match(/"activeTasks":\s*\[(.*?)\]/s);
    if (activeBlock) {
      for (const idMatch of activeBlock[1].matchAll(/"id":\s*"([^"]+)"/g)) {
        taskIdSet.add(idMatch[1]);
      }
    }
    actions = actions.filter((a) => {
      if ("taskId" in a && a.taskId && !taskIdSet.has(a.taskId)) return false;
      return true;
    });

    // ASK-XOR-ACT (agent mode). If the model asked a question in this turn AND
    // also proposed actions, drop the actions — the user would confirm blindly
    // before answering. The action was requested by the model without full info.
    // We only strip when it's *only* create/mutate actions; the rare "?" in a
    // deletion confirmation is unlikely here.
    // ASK_CHOICES is a form — also asking, so it acts as a "question".
    const looksLikeQuestion = /[?？]/.test(messageText) || actions.some((a) => a.type === "ASK_CHOICES");
    if (looksLikeQuestion && actions.some((a) =>
      a.type === "CREATE_TASK" || a.type === "CREATE_GOAL" || a.type === "CREATE_PROJECT" ||
      a.type === "CREATE_STAT" || a.type === "CREATE_ACHIEVEMENT" ||
      a.type === "MOVE_TASK" || a.type === "UPDATE_TASK"
    )) {
      actions = actions.filter((a) =>
        // Keep ASK_CHOICES and rule mutations — both are safe / user-requested.
        a.type === "ASK_CHOICES" ||
        a.type === "CREATE_RULE" || a.type === "UPDATE_RULE" || a.type === "DELETE_RULE"
      );
    }

    // RULES VERIFIER (agent mode). Rules are user-set and the main model tends
    // to ignore them ("no more than 12h/day" was violated in practice). Run a
    // second, focused LLM pass whose ONLY job is to reject or adjust actions
    // that violate any rule. Skipped when there are no rules or no mutating
    // actions to check.
    const mutating = actions.filter((a) =>
      a.type === "CREATE_TASK" || a.type === "MOVE_TASK" || a.type === "UPDATE_TASK",
    );
    if (context.rulesBlock && mutating.length > 0) {
      const verdict = await verifyActionsAgainstRules({
        provider,
        lang,
        rulesBlock: context.rulesBlock,
        contextJson: context.contextJson,
        actions,
      });
      if (verdict) {
        actions = verdict.actions;
        if (verdict.notes) {
          const prefix = lang === "ru" ? "🛡 " : "🛡 ";
          messageText = (messageText ? messageText.trim() + "\n\n" : "") + prefix + verdict.notes;
        }
      }
    }

    // Programmatic dedup: drop any CREATE_TASK / CREATE_GOAL / CREATE_PROJECT
    // whose title matches an existing entity (same projectId for tasks). The
    // model periodically re-emits an already-applied batch when asked to
    // "link them to a goal" instead of switching to update_task.
    {
      const dedup = await dedupExistingCreations(repos, actions, lang);
      if (dedup.notes) {
        messageText =
          (messageText ? messageText.trim() + "\n\n" : "") + "🛡 " + dedup.notes;
      }
      actions = dedup.actions;
    }

    const validated = validateActions(actions);
    // If the model produced no text AND no actions, ask it to say something.
    const message =
      messageText.trim() ||
      (actions.length ? "" : lang === "ru" ? "(нет ответа)" : "(no reply)");
    return { message, validated };
  }

  // Legacy path: JSON envelope. Retry once in plain text if the envelope is empty.
  let reply = await provider.chat(messages);
  let raw = reply.text;
  let parsed = parseResponse(raw);
  if (!parsed.message.trim() && parsed.actions.length === 0) {
    reply = await provider.chat(messages, { jsonMode: false });
    raw = reply.text;
    parsed = parseResponse(raw);
  }

  // The model sometimes lies: says "готово / добавляю / ставлю / distributing…"
  // with an empty actions array. Catch BOTH past and present tense (Russian
  // narrative present = pretending to act), retry once with a correction, and
  // if it still lies, replace the message with a warning to the user.
  const CLAIM = CLAIM_REGEX;
  if (parsed.actions.length === 0 && CLAIM.test(parsed.message)) {
    const correction: ChatMessage = {
      role: "system",
      content:
        "Your last reply CLAIMED you performed an action but returned an empty `actions` array. " +
        "You cannot modify anything without action objects. Reply again — either RETURN THE ACTIONS " +
        "you intended, or clearly say you didn't add anything.",
    };
    const reply2 = await provider.chat([...messages, correction, { role: "assistant", content: raw }]);
    const parsed2 = parseResponse(reply2.text);
    if (parsed2.actions.length > 0 || !CLAIM.test(parsed2.message)) {
      parsed = parsed2;
    } else {
      // Last-resort: extract an action locally from the claim text. If the model
      // wrote "Добавляю задачу 'X' — MEDIUM, 90 минут, четверг 20 августа" we
      // have enough to synthesize the CREATE_TASK it should have returned.
      const synth = tryExtractCreateTask(parsed2.message || parsed.message);
      if (synth) {
        parsed = { message: parsed2.message || parsed.message, actions: [synth] };
      } else {
        parsed.message =
          (lang === "ru"
            ? "⚠ Ассистент сказал, что выполнил действие, но не вернул конкретных изменений. Попробуй переформулировать: «добавь квест X на дату Y».\n\nОригинальный ответ:\n"
            : "⚠ The assistant claimed an action but returned no changes. Try rephrasing: “add quest X on date Y”.\n\nOriginal reply:\n") +
          parsed.message;
      }
    }
  }

  // PHANTOM QUESTIONS CHECK (envelope mode). Same guard as agent mode: retry once
  // with an explicit correction if the model referenced imaginary earlier questions.
  if (
    parsed.actions.length === 0 &&
    PHANTOM_QUESTIONS_REGEX.test(parsed.message) &&
    !parsed.message.includes("?")
  ) {
    const correction: ChatMessage = {
      role: "system",
      content:
        "You referenced questions you supposedly asked earlier, but there are NO " +
        "such questions in the transcript. Either: (a) ASK 1–3 concrete questions " +
        "RIGHT NOW as a numbered list (each ending in '?'), OR (b) pick sensible " +
        "defaults and return the corresponding action. Do not stall by pretending " +
        "you already asked.",
    };
    const rp = await provider.chat([...messages, correction, { role: "assistant", content: parsed.message }]);
    const p2 = parseResponse(rp.text);
    if (p2.actions.length || p2.message.includes("?") || p2.message.trim()) {
      parsed = p2;
    }
  }

  // ASK-XOR-ACT (envelope mode) — same guard as agent mode. Don't let the model
  // both ask a clarifying question and propose actions in one turn.
  const envAsking = /[?？]/.test(parsed.message) || parsed.actions.some((a) => a.type === "ASK_CHOICES");
  if (envAsking && parsed.actions.some((a) =>
    a.type === "CREATE_TASK" || a.type === "CREATE_GOAL" || a.type === "CREATE_PROJECT" ||
    a.type === "CREATE_STAT" || a.type === "CREATE_ACHIEVEMENT" ||
    a.type === "MOVE_TASK" || a.type === "UPDATE_TASK"
  )) {
    parsed.actions = parsed.actions.filter((a) =>
      a.type === "ASK_CHOICES" ||
      a.type === "CREATE_RULE" || a.type === "UPDATE_RULE" || a.type === "DELETE_RULE"
    );
  }

  // Rules verifier for envelope mode too — same reason as agent path.
  const envMutating = parsed.actions.filter((a) =>
    a.type === "CREATE_TASK" || a.type === "MOVE_TASK" || a.type === "UPDATE_TASK",
  );
  if (context.rulesBlock && envMutating.length > 0) {
    const verdict = await verifyActionsAgainstRules({
      provider,
      lang,
      rulesBlock: context.rulesBlock,
      contextJson: context.contextJson,
      actions: parsed.actions,
    });
    if (verdict) {
      parsed.actions = verdict.actions;
      if (verdict.notes) {
        parsed.message = (parsed.message ? parsed.message.trim() + "\n\n" : "") + "🛡 " + verdict.notes;
      }
    }
  }

  // Programmatic dedup — see agent-mode branch for rationale.
  {
    const dedup = await dedupExistingCreations(repos, parsed.actions, lang);
    if (dedup.notes) {
      parsed.message = (parsed.message ? parsed.message.trim() + "\n\n" : "") + "🛡 " + dedup.notes;
    }
    parsed.actions = dedup.actions;
  }

  const validated = validateActions(parsed.actions);
  return { message: parsed.message, validated };
}

/**
 * Drop CREATE_TASK / CREATE_GOAL / CREATE_PROJECT actions that would duplicate
 * an entity already in the DB (same title, case-insensitive; for tasks, also
 * same projectId when both sides have one). Returns the pruned list plus a
 * short note listing what was dropped so the user sees why the preview shrank.
 */
async function dedupExistingCreations(
  repos: Repositories,
  actions: AIAction[],
  lang: Lang,
): Promise<{ actions: AIAction[]; notes: string }> {
  const [existingTasks, existingGoals, existingProjects] = await Promise.all([
    repos.tasks.list({ includeCompleted: true }),
    repos.goals.list(),
    repos.projects.list(),
  ]);
  const norm = (s: string) => s.trim().toLowerCase();
  // Tasks are keyed by "title|projectId" so a same-titled quest in a different
  // project is still allowed.
  const taskKeys = new Set(
    existingTasks.map((t) => `${norm(t.title)}|${t.projectId ?? ""}`),
  );
  const goalTitles = new Set(existingGoals.map((g) => norm(g.title)));
  const projectNames = new Set(existingProjects.map((p) => norm(p.name)));

  const dropped: string[] = [];
  const out: AIAction[] = [];
  for (const a of actions) {
    if (a.type === "CREATE_TASK") {
      // We only dedup against real project ids the model may have sent; when it
      // used a "new:<slug>" placeholder for a project being created now, allow
      // it (that's a genuine new task in a genuinely new project).
      const proj = typeof a.projectId === "string" && !a.projectId.startsWith("new:")
        ? a.projectId : "";
      const key = `${norm(a.title || "")}|${proj}`;
      if (taskKeys.has(key)) {
        dropped.push(`«${a.title}»`);
        continue;
      }
    } else if (a.type === "CREATE_GOAL") {
      if (goalTitles.has(norm(a.title || ""))) {
        dropped.push(`«${a.title}»`);
        continue;
      }
    } else if (a.type === "CREATE_PROJECT") {
      if (projectNames.has(norm(a.name || ""))) {
        dropped.push(`«${a.name}»`);
        continue;
      }
    }
    out.push(a);
  }

  if (dropped.length === 0) return { actions, notes: "" };
  const list = dropped.slice(0, 5).join(", ") + (dropped.length > 5 ? "…" : "");
  const notes = lang === "ru"
    ? `Пропущено уже существующее: ${list}. Если нужно изменить эти сущности — попроси «привяжи к цели / перенеси / переименуй».`
    : `Skipped (already exist): ${list}. To modify these, ask "link to goal / move / rename" instead.`;
  return { actions: out, notes };
}

/**
 * Post-verifier: a second, focused LLM pass that ONLY re-checks proposed
 * mutating actions against user rules and current day load. Returns an
 * adjusted list plus a short human-readable note about anything changed or
 * dropped. Fails safe: if the verifier itself misbehaves, we keep the original
 * actions unchanged.
 */
async function verifyActionsAgainstRules({
  provider,
  lang,
  rulesBlock,
  contextJson,
  actions,
}: {
  provider: AIProvider;
  lang: Lang;
  rulesBlock: string;
  contextJson: string;
  actions: AIAction[];
}): Promise<{ actions: AIAction[]; notes: string } | null> {
  const langLine =
    lang === "ru"
      ? "Пиши `notes` на русском."
      : "Write `notes` in English.";
  const sys: ChatMessage = {
    role: "system",
    content:
      "You are the RULES VERIFIER. You are NOT a chatbot. Your ONLY job is to " +
      "read the user's persistent rules and the proposed structural actions, " +
      "then output a corrected list.\n\n" +
      "For each action: if it VIOLATES any rule (e.g. daily focus-time limit, " +
      "minimum density, group-by-theme, no work on some weekday, forbidden " +
      "difficulty, etc.), do EXACTLY ONE of:\n" +
      "  (a) MODIFY the action so it complies (change plannedDate to a lighter " +
      "day, reduce/increase estimatedMinutes, merge date across tasks, set/change " +
      "goalId or projectId to group with related tasks, etc.), or\n" +
      "  (b) DROP the action if it cannot be made compliant.\n\n" +
      "For MAX daily limits ('no more than N hours/day'): ADD the action's " +
      "estimatedMinutes to context.upcomingDays[date].plannedMinutes; if total " +
      "would exceed N*60, MOVE the action to a day with capacity OR drop it.\n\n" +
      "For MIN daily density ('at least N hours/day'): if the batch spreads " +
      "similar tasks across several sparse days that would each stay below the " +
      "minimum, GROUP them onto fewer days so each is at least N*60 minutes " +
      "(as long as no MAX rule is broken).\n\n" +
      "For GROUP-BY-THEME rules ('group similar tasks on one day', 'one theme per " +
      "day'): plannedDates of related tasks (same goalId, projectId or clearly " +
      "same subject) should MATCH. If they don't, align them to one day.\n\n" +
      "Output STRICTLY this JSON shape and nothing else:\n" +
      '{"actions": [ ...possibly-adjusted action objects... ], ' +
      '"notes": "one short sentence explaining what you changed or dropped, or empty if unchanged"}\n\n' +
      langLine,
  };
  const usr: ChatMessage = {
    role: "user",
    content:
      rulesBlock +
      "\n\n" +
      contextJson +
      "\n\nPROPOSED_ACTIONS (JSON):\n" +
      JSON.stringify(actions),
  };
  let reply: AIReply;
  try {
    reply = await provider.chat([sys, usr]);
  } catch {
    return null; // network / auth error — don't punish the user, keep original
  }
  const text = (reply.text ?? "").trim();
  if (!text) return null;
  // Robust JSON extraction — accepts fenced ```json blocks or bare braces.
  let raw = text.replace(/```(?:json)?\s*([\s\S]*?)```/i, "$1").trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start >= 0 && end > start) raw = raw.slice(start, end + 1);
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  const rec = parsed as { actions?: unknown; notes?: unknown };
  const outActions = Array.isArray(rec.actions) ? (rec.actions as AIAction[]) : null;
  if (!outActions) return null;
  return {
    actions: outActions,
    notes: typeof rec.notes === "string" ? rec.notes.trim() : "",
  };
}

export interface ApplyResult {
  created: number;
  updated: number;
  completed: number;
  deleted: number;
}

/** Apply confirmed actions in a safe order (stats → goals → tasks → mutations). */
export async function applyAIActions(
  repos: Repositories,
  actions: AIAction[],
): Promise<ApplyResult> {
  const result: ApplyResult = { created: 0, updated: 0, completed: 0, deleted: 0 };

  // 1) New stats first, so subsequent task rewards can reference them.
  for (const a of actions) {
    if (a.type !== "CREATE_STAT") continue;
    try {
      await svcCreateStat(repos, {
        name: a.name,
        description: a.description ?? undefined,
        icon: a.icon ?? undefined,
      });
      result.created++;
    } catch {
      /* duplicate stat name — ignore */
    }
  }

  // 1b) Custom achievements — record definition; the eval loop will unlock them
  //     when their condition first becomes true.
  for (const a of actions) {
    if (a.type !== "CREATE_ACHIEVEMENT") continue;
    await repos.achievements.addCustom({
      key: a.key,
      name: a.name,
      description: a.description,
      icon: a.icon ?? null,
      metric: a.condition.metric,
      threshold: a.condition.atLeast,
    });
    result.created++;
  }

  const stats = await repos.stats.list(true);
  const statIdByName = new Map(stats.map((s) => [s.name.toLowerCase(), s.id]));

  // 2) Goals. Track real ids by placeholder key so that CREATE_TASK actions in
  //    the same turn can reference a goal that didn't exist yet when the model
  //    proposed the batch. Model uses `goalId: "new:<slug>"` on both the goal
  //    and its tasks — we swap the placeholder for the real id here.
  // Multi-step apply: goals are created FIRST so we know their real ids before
  // any CREATE_TASK runs. Also lets us auto-fix goal.projectId after the fact
  // if the model forgot (single fresh project in batch, or single project used
  // by all sibling tasks).
  const goalIdByPlaceholder = new Map<string, string>();
  const goalRecords: { id: string; requestedProjectRaw: string | null }[] = [];
  for (const a of actions) {
    if (a.type !== "CREATE_GOAL") continue;
    // NOTE: goal's projectId is resolved LATER in a fix-up pass so it can see
    // both goalIdByPlaceholder and projectIdByPlaceholder (the latter is filled
    // only after this loop).
    const goal = await repos.goals.create({
      title: a.title,
      description: a.description ?? null,
      deadline: a.deadline ?? null,
      isMainQuest: a.isMainQuest ?? false,
    });
    const slug = a.title.toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 40);
    goalIdByPlaceholder.set(`new:${slug}`, goal.id);
    goalIdByPlaceholder.set(a.title.trim().toLowerCase(), goal.id);
    goalRecords.push({ id: goal.id, requestedProjectRaw: a.projectId ?? null });
    result.created++;
  }

  // Also index existing goals by title so a lazy model that referenced a goal
  // by name (not id) still gets linked correctly.
  const existingGoals = await repos.goals.list();
  const goalIdByTitle = new Map(existingGoals.map((g) => [g.title.trim().toLowerCase(), g.id]));

  // Real ids of goals that exist AFTER this batch's CREATE_GOAL calls.
  const validGoalIds = new Set<string>([
    ...existingGoals.map((g) => g.id),
    ...goalIdByPlaceholder.values(),
  ]);

  function resolveGoalId(raw: string | null | undefined): string | null {
    if (!raw) return null;
    if (raw.startsWith("new:")) {
      return goalIdByPlaceholder.get(raw) ?? null;
    }
    const key = raw.trim().toLowerCase();
    if (goalIdByPlaceholder.has(key)) return goalIdByPlaceholder.get(key)!;
    if (goalIdByTitle.has(key)) return goalIdByTitle.get(key)!;
    // Only accept as-is if it's a REAL existing id — otherwise the model made
    // it up (bare slug, hallucinated uuid). Return null so the safety-net can
    // auto-attach to the freshly-created sole goal.
    return validGoalIds.has(raw) ? raw : null;
  }

  // 2b) Projects — same placeholder mechanism as goals so tasks in the same
  //     batch can reference a project that is being created now.
  const projectIdByPlaceholder = new Map<string, string>();
  for (const a of actions) {
    if (a.type !== "CREATE_PROJECT") continue;
    const project = await repos.projects.create({
      name: a.name,
      description: a.description ?? null,
      color: a.color ?? null,
    });
    const slug = a.name.toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 40);
    projectIdByPlaceholder.set(`new:${slug}`, project.id);
    projectIdByPlaceholder.set(a.name.trim().toLowerCase(), project.id);
    result.created++;
  }
  const existingProjects = await repos.projects.list();
  const projectIdByName = new Map(
    existingProjects.map((p) => [p.name.trim().toLowerCase(), p.id]),
  );
  const validProjectIds = new Set<string>([
    ...existingProjects.map((p) => p.id),
    ...projectIdByPlaceholder.values(),
  ]);

  function resolveProjectId(raw: string | null | undefined): string | null {
    if (!raw) return null;
    if (raw.startsWith("new:")) return projectIdByPlaceholder.get(raw) ?? null;
    const key = raw.trim().toLowerCase();
    if (projectIdByPlaceholder.has(key)) return projectIdByPlaceholder.get(key)!;
    if (projectIdByName.has(key)) return projectIdByName.get(key)!;
    return validProjectIds.has(raw) ? raw : null;
  }

  // 2c) SAFETY-NET auto-attach: if this batch created exactly ONE goal (and/or
  //     ONE project), and any CREATE_TASK in the same batch has an empty
  //     goalId (or projectId), attach it to that fresh entity. The model often
  //     "forgets" to link — this covers it without silently over-linking when
  //     the batch is ambiguous (multiple new goals/projects).
  const freshGoalIds = Array.from(new Set(goalIdByPlaceholder.values()));
  const freshProjectIds = Array.from(new Set(projectIdByPlaceholder.values()));
  const soleFreshGoal = freshGoalIds.length === 1 ? freshGoalIds[0] : null;
  const soleFreshProject = freshProjectIds.length === 1 ? freshProjectIds[0] : null;

  // 2d) FIX-UP: resolve goal.projectId now that both placeholder maps are ready.
  //     If the model set create_goal.projectId, resolve and persist it. If it
  //     didn't but there's a single fresh project in the batch OR all sibling
  //     tasks agree on one existing project, use that — this fixes "модель
  //     создала цель без проекта" without needing another API round-trip.
  const taskProjectsInBatch = new Set<string>();
  for (const a of actions) {
    if (a.type !== "CREATE_TASK") continue;
    const p = resolveProjectId(a.projectId);
    if (p) taskProjectsInBatch.add(p);
  }
  const soleTaskProject = taskProjectsInBatch.size === 1
    ? [...taskProjectsInBatch][0]
    : null;
  for (const rec of goalRecords) {
    let target = resolveProjectId(rec.requestedProjectRaw);
    if (!target) target = soleFreshProject ?? soleTaskProject;
    if (target) await repos.goals.update(rec.id, { projectId: target });
  }

  // Real task ids at apply time — used to accept parentTaskId only when it
  // matches a real existing quest (drops model hallucinations).
  const existingTasks = await repos.tasks.list({ includeCompleted: true });
  const validTaskIds = new Set(existingTasks.map((t) => t.id));

  // Positional attach map: for each CREATE_TASK index in the batch, remember
  // which fresh goal was most recently declared BEFORE it (by title lookup, as
  // ids are only in goalIdByPlaceholder). If the model called create_goal then
  // 3 create_tasks in that order — every task's intended parent is that goal,
  // regardless of what junk it may have put in `goalId`.
  const positionalGoalForTask = new Map<number, string>();
  {
    let lastFreshGoal: string | null = null;
    actions.forEach((a, idx) => {
      if (a.type === "CREATE_GOAL") {
        lastFreshGoal =
          goalIdByPlaceholder.get(a.title.trim().toLowerCase()) ?? lastFreshGoal;
      } else if (a.type === "CREATE_TASK" && lastFreshGoal) {
        positionalGoalForTask.set(idx, lastFreshGoal);
      }
    });
  }

  // 3) Everything else.
  let batchIdx = -1;
  for (const a of actions) {
    batchIdx++;
    switch (a.type) {
      case "CREATE_TASK": {
        const rewards: StatReward[] = (a.statRewards ?? [])
          .map((r) => {
            const statId = statIdByName.get(r.statName.toLowerCase());
            return statId ? { statId, xp: r.xp } : null;
          })
          .filter((r): r is StatReward => r !== null);
        // Goal resolution cascade — try increasingly permissive fallbacks so a
        // task always ends up under its intended parent, even if the model
        // wrote garbage in goalId or forgot it entirely.
        //   1) Explicit resolve (real id / matched placeholder / matched title).
        //   2) Positional: last CREATE_GOAL declared before this task in batch.
        //   3) Only-one fresh goal in batch → use it.
        //   4) Multiple fresh goals → pick the one whose projectId matches
        //      this task's projectId (intended parent).
        let resolvedGoal: string | null = resolveGoalId(a.goalId);
        if (!resolvedGoal) resolvedGoal = positionalGoalForTask.get(batchIdx) ?? null;
        if (!resolvedGoal) resolvedGoal = soleFreshGoal;
        if (!resolvedGoal && freshGoalIds.length > 1) {
          const taskProject = resolveProjectId(a.projectId) ?? soleFreshProject ?? soleTaskProject;
          if (taskProject) {
            for (const rec of goalRecords) {
              const target =
                resolveProjectId(rec.requestedProjectRaw) ?? soleFreshProject ?? soleTaskProject;
              if (target === taskProject) {
                resolvedGoal = rec.id;
                break;
              }
            }
          }
        }
        // Same idea for project — if the model's projectId is garbage / empty,
        // fall back to a single fresh project in batch, or a single project
        // used by sibling tasks in the same batch.
        let resolvedProject: string | null = resolveProjectId(a.projectId);
        if (!resolvedProject) resolvedProject = soleFreshProject ?? soleTaskProject;
        const task = await svcCreateTask(repos, {
          title: a.title,
          description: a.description ?? null,
          difficulty: a.difficulty,
          priority: a.priority,
          estimatedMinutes: a.estimatedMinutes ?? null,
          plannedDate: a.plannedDate ?? null,
          deadline: a.deadline ?? null,
          projectId: resolvedProject,
          goalId: resolvedGoal,
          // Only accept parentTaskId if it references an existing task in the
          // current context — otherwise ignore (model might hallucinate an id).
          parentTaskId:
            a.parentTaskId && validTaskIds.has(a.parentTaskId) ? a.parentTaskId : null,
          statRewards: rewards,
        });
        for (const c of a.definitionOfDone ?? []) {
          if (c.trim()) await repos.criteria.add(task.id, c.trim());
        }
        result.created++;
        break;
      }
      case "MOVE_TASK":
        await svcReschedule(repos, a.taskId, a.plannedDate);
        result.updated++;
        break;
      case "UPDATE_TASK": {
        // Resolve goal/project placeholders the same way we do for creation, so
        // update_task can retroactively attach an existing quest to a fresh
        // goal/project created in the same batch. Empty string ("") means
        // detach — pass it through as null.
        const fields: typeof a.fields = { ...a.fields };
        if ("goalId" in fields) {
          const g = fields.goalId;
          fields.goalId = g === "" || g === null ? null : resolveGoalId(g);
        }
        if ("projectId" in fields) {
          const p = fields.projectId;
          fields.projectId = p === "" || p === null ? null : resolveProjectId(p);
        }
        await repos.tasks.update(a.taskId, fields);
        result.updated++;
        break;
      }
      case "COMPLETE_TASK":
        await svcComplete(repos, a.taskId);
        result.completed++;
        break;
      case "DELETE_TASK":
        await svcDeleteTask(repos, a.taskId);
        result.deleted++;
        break;
      case "CREATE_RULE":
        await repos.aiRules.add(a.text);
        result.created++;
        break;
      case "UPDATE_RULE":
        await repos.aiRules.update(a.ruleId, a.text);
        result.updated++;
        break;
      case "DELETE_RULE":
        await repos.aiRules.remove(a.ruleId);
        result.deleted++;
        break;
      case "ASK_CHOICES":
        // Questionnaires are UI-only; never applied. The Confirm button doesn't
        // fire for them anyway, but count it as a no-op for completeness.
        break;
      default:
        break; // stats/goals/achievements already handled
    }
  }

  return result;
}
