import type { TaskStreamEvent } from "../../entities/api.js";

export interface PlanningStream {
  reasoning: string;
  content: string;
}

export function latestPlanningStream(
  events: TaskStreamEvent[],
  startedAt?: string,
): PlanningStream | null {
  const planningEvents = events.filter(
    (event) => event.phase === "planning" && (!startedAt || event.createdAt >= startedAt),
  );
  if (!planningEvents.length) return null;
  const latestEvent = planningEvents.reduce((latest, event) =>
    event.createdAt > latest.createdAt ? event : latest,
  );
  const currentRunEvents = planningEvents
    .filter((event) => event.runId === latestEvent.runId)
    .sort((left, right) => left.sequence - right.sequence);
  const reasoning = currentRunEvents
    .filter((event) => event.activity === "reasoning")
    .map((event) => event.delta)
    .join("")
    .trimStart();
  const content = currentRunEvents
    .filter((event) => event.activity === "content")
    .map((event) => event.delta)
    .join("")
    .replace(/^\s*```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/, "")
    .trimStart();
  return reasoning || content ? { reasoning, content } : null;
}
