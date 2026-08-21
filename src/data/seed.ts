// Example seed data. Handy for demos and manual testing. Not run automatically
// — call seedExampleData(repos) from a dev console or a test. It is a no-op if
// a character already exists, so it never clobbers real data.

import type { Repositories } from "@/data/repositories";
import { createCharacter } from "@/services/character/characterService";
import { createTask } from "@/services/tasks/taskService";
import { todayKey, addDays } from "@/utils/date";

export async function seedExampleData(repos: Repositories): Promise<void> {
  const existing = await repos.character.get();
  if (existing) return;

  await createCharacter(repos, {
    name: "Vlad",
    characterClass: "Gameplay Engineer",
    mainQuest: "Become an Unreal gameplay programmer",
    startingStats: [
      { name: "Programming", description: "Writing and debugging code." },
      { name: "Gameplay", description: "Designing feel and mechanics." },
      { name: "Engineering", description: "Systems and architecture." },
      { name: "Discipline", description: "Showing up and shipping." },
    ],
  });

  const stats = await repos.stats.list();
  const byName = (n: string) => stats.find((s) => s.name === n)!;

  await createTask(repos, {
    title: "Fix camera collision in narrow corridors",
    description:
      "DoD: camera no longer clips walls; test left/right shoulder and while sprinting.",
    difficulty: "MEDIUM",
    plannedDate: todayKey(),
    estimatedMinutes: 60,
    statRewards: [
      { statId: byName("Programming").id, xp: 30 },
      { statId: byName("Gameplay").id, xp: 15 },
    ],
  });

  await createTask(repos, {
    title: "Implement GenerateLoot() and test on 10 seeds",
    difficulty: "HARD",
    plannedDate: todayKey(),
    estimatedMinutes: 90,
    statRewards: [
      { statId: byName("Programming").id, xp: 50 },
      { statId: byName("Engineering").id, xp: 25 },
    ],
  });

  await createTask(repos, {
    title: "Add hit-feedback flash to enemies",
    difficulty: "EASY",
    plannedDate: addDays(todayKey(), 1),
    estimatedMinutes: 30,
    statRewards: [{ statId: byName("Gameplay").id, xp: 18 }],
  });

  await createTask(repos, {
    title: "Write a 20-minute daily standup note",
    difficulty: "TRIVIAL",
    plannedDate: todayKey(),
    estimatedMinutes: 20,
    statRewards: [{ statId: byName("Discipline").id, xp: 8 }],
  });
}
