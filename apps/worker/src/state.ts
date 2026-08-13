import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

export class WorkerState {
  private readonly db: DatabaseSync;

  constructor(path: string) {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS worker_inbox (
        event_id TEXT PRIMARY KEY,
        workflow TEXT NOT NULL,
        processed_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS worker_runs (
        run_id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL,
        workflow TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'running',
        checkpoint_json TEXT,
        started_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
  }

  hasEvent(eventId: string): boolean {
    return (
      this.db.prepare("SELECT event_id FROM worker_inbox WHERE event_id = ?").get(eventId) !==
      undefined
    );
  }

  markEvent(eventId: string, workflow: string): void {
    this.db
      .prepare(
        "INSERT OR IGNORE INTO worker_inbox (event_id, workflow, processed_at) VALUES (?, ?, ?)",
      )
      .run(eventId, workflow, new Date().toISOString());
  }

  startRun(runId: string, taskId: string, workflow: string): void {
    const now = new Date().toISOString();
    this.db
      .prepare(
        "INSERT OR REPLACE INTO worker_runs (run_id, task_id, workflow, status, checkpoint_json, started_at, updated_at) VALUES (?, ?, ?, 'running', NULL, ?, ?)",
      )
      .run(runId, taskId, workflow, now, now);
  }

  finishRun(runId: string, status: string): void {
    this.db
      .prepare("UPDATE worker_runs SET status = ?, updated_at = ? WHERE run_id = ?")
      .run(status, new Date().toISOString(), runId);
  }

  checkpoint(runId: string, data: Record<string, unknown>): void {
    this.db
      .prepare("UPDATE worker_runs SET checkpoint_json = ?, updated_at = ? WHERE run_id = ?")
      .run(JSON.stringify(data), new Date().toISOString(), runId);
  }

  close(): void {
    this.db.close();
  }
}
