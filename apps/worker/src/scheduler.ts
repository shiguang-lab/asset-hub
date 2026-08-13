import type { Logger } from "@shiguang/observability";
import type { ApiClient } from "./api-client.js";

interface DueSchedule {
  id: string;
  workspaceId: string;
  name: string;
  goal: string;
  spec: Record<string, unknown>;
}

export class Scheduler {
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly api: ApiClient,
    private readonly logger: Logger,
    private readonly intervalMs = 30_000,
  ) {}

  start(): void {
    this.timer = setInterval(() => void this.poll(), this.intervalMs);
    void this.poll();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private async poll(): Promise<void> {
    try {
      const { schedules } = await this.api.getInternal<{ schedules: DueSchedule[] }>(
        "/internal/v1/schedules/due",
      );
      for (const schedule of schedules) {
        this.logger.info(
          { schedule: schedule.name, goal: schedule.goal },
          "schedule due, creating task",
        );
        await this.api.postInternal("/internal/v1/tasks:create", {
          workspaceId: schedule.workspaceId,
          type: "research",
          goal: schedule.goal,
          spec: schedule.spec,
        });
        await this.api
          .postInternal(`/internal/v1/schedules/${schedule.id}/run`, {})
          .catch(() => undefined);
      }
    } catch (err) {
      this.logger.warn({ err: String(err) }, "scheduler poll failed");
    }
  }
}
