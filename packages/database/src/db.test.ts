import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Pool } from "pg";
import { beforeEach, describe, expect, it } from "vitest";
import { applyMigrations, Db } from "./db.js";
import { LocalObjectStore } from "./storage.js";
import { Store } from "./store.js";

/**
 * 迁移执行器的行为可以完全用一个记录调用序列的假 pool 验证，无需真实 Postgres：
 * 关注点是「顺序、跳过已执行、单事务、失败回滚」而非 SQL 语义。
 */
interface Recorded {
  sql: string;
  params?: unknown[];
}

function createFakePool(options: { appliedNames?: string[]; failOn?: (sql: string) => boolean }) {
  const applied = new Set(options.appliedNames ?? []);
  const calls: Recorded[] = [];
  const clientCalls: Recorded[] = [];
  let released = 0;

  const query = async (sql: string, params?: unknown[]) => {
    clientCalls.push({ sql, params });
    if (options.failOn?.(sql)) throw new Error("boom");
    if (sql.startsWith("SELECT name FROM schema_migrations")) {
      const name = params?.[0] as string;
      return { rowCount: applied.has(name) ? 1 : 0, rows: [] };
    }
    if (sql.startsWith("INSERT INTO schema_migrations")) {
      applied.add(params?.[0] as string);
      return { rowCount: 1, rows: [] };
    }
    return { rowCount: 0, rows: [] };
  };

  const pool = {
    query: async (sql: string, params?: unknown[]) => {
      calls.push({ sql, params });
      return { rowCount: 0, rows: [] };
    },
    connect: async () => ({
      query,
      release: () => {
        released += 1;
      },
    }),
  } as unknown as Pool;

  return {
    pool,
    calls,
    clientCalls,
    applied,
    releasedCount: () => released,
  };
}

async function fixtureDir(files: string[]): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "migrations-"));
  for (const name of files) {
    await writeFile(join(dir, name), `-- ${name}\nSELECT 1;`, "utf8");
  }
  return dir;
}

describe("applyMigrations", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await fixtureDir(["0002_second.sql", "0001_init.sql", "0010_tenth.sql", "notes.md"]);
  });

  it("按文件名排序执行，且忽略非 .sql 文件", async () => {
    const fake = createFakePool({});
    const applied = await applyMigrations(fake.pool, dir);
    // 0010 必须排在 0002 之后：零填充命名保证字典序等于数值序
    expect(applied).toEqual(["0001_init.sql", "0002_second.sql", "0010_tenth.sql"]);
    expect(applied).not.toContain("notes.md");
  });

  it("先确保 schema_migrations 表存在", async () => {
    const fake = createFakePool({});
    await applyMigrations(fake.pool, dir);
    expect(fake.calls[0]?.sql).toContain("CREATE TABLE IF NOT EXISTS schema_migrations");
  });

  it("跳过已记录的迁移", async () => {
    const fake = createFakePool({ appliedNames: ["0001_init.sql", "0002_second.sql"] });
    const applied = await applyMigrations(fake.pool, dir);
    expect(applied).toEqual(["0010_tenth.sql"]);
  });

  it("重复执行是幂等的：第二次不再应用任何迁移", async () => {
    const fake = createFakePool({});
    await applyMigrations(fake.pool, dir);
    const second = await applyMigrations(fake.pool, dir);
    expect(second).toEqual([]);
  });

  it("每个迁移包裹在事务内并提交", async () => {
    const fake = createFakePool({});
    await applyMigrations(fake.pool, dir);
    const statements = fake.clientCalls.map((c) => c.sql);
    expect(statements.filter((s) => s === "BEGIN")).toHaveLength(3);
    expect(statements.filter((s) => s === "COMMIT")).toHaveLength(3);
  });

  it("迁移失败时回滚并抛出含文件名的错误", async () => {
    // 让第二个迁移的正文执行失败
    const fake = createFakePool({ failOn: (sql) => sql.includes("0002_second.sql") });
    await expect(applyMigrations(fake.pool, dir)).rejects.toThrow(/0002_second\.sql/);
    expect(fake.clientCalls.map((c) => c.sql)).toContain("ROLLBACK");
    // 失败的迁移不得写入记录表，否则下次会被误跳过
    expect(fake.applied.has("0002_second.sql")).toBe(false);
  });

  it("无论成功或失败都释放连接", async () => {
    const ok = createFakePool({});
    await applyMigrations(ok.pool, dir);
    expect(ok.releasedCount()).toBe(3);

    const bad = createFakePool({ failOn: (sql) => sql.includes("0001_init.sql") });
    await expect(applyMigrations(bad.pool, dir)).rejects.toThrow();
    expect(bad.releasedCount()).toBe(1);
  });
});

describe("Store.permanentDelete", () => {
  const actor = {
    workspaceId: "ws_1",
    workspaceType: "personal" as const,
    workspaceRole: "owner" as const,
    subject: "user_1",
    displayName: "测试用户",
    requestId: "req_test_1",
    tokenScopes: ["read", "write"] as ("read" | "write")[],
    isService: false,
  };

  it("在事务中按子表到主表顺序清理发布、权限、补丁、关系和版本记录", async () => {
    const clientCalls: Recorded[] = [];
    let released = 0;
    const pool = {
      connect: async () => ({
        query: async (sql: string, params?: unknown[]) => {
          clientCalls.push({ sql, params });
          if (sql.startsWith("SELECT id FROM assets")) {
            return { rowCount: 1, rows: [{ id: "ast_1" }] };
          }
          return { rowCount: 0, rows: [] };
        },
        release: () => {
          released += 1;
        },
      }),
    } as unknown as Pool;

    const store = new Store(new Db(pool), new LocalObjectStore(tmpdir()));
    await store.permanentDelete(actor, "ast_1");

    const sqls = clientCalls.map((c) => c.sql);
    expect(sqls[0]).toBe("BEGIN");
    expect(sqls.at(-1)).toBe("COMMIT");
    expect(released).toBe(1);

    const idx = (fragment: string) => sqls.findIndex((sql) => sql.includes(fragment));
    expect(idx("DELETE FROM publish_comments")).toBeLessThan(idx("DELETE FROM publishes"));
    expect(idx("DELETE FROM publish_visitors")).toBeLessThan(idx("DELETE FROM publishes"));
    expect(idx("DELETE FROM publish_access_events")).toBeLessThan(idx("DELETE FROM publishes"));
    expect(idx("DELETE FROM short_links")).toBeLessThan(idx("DELETE FROM publishes"));
    expect(idx("DELETE FROM publish_releases")).toBeLessThan(idx("DELETE FROM publishes"));
    expect(idx("DELETE FROM publishes")).toBeLessThan(idx("DELETE FROM assets"));
    expect(idx("DELETE FROM asset_acl")).toBeLessThan(idx("DELETE FROM assets"));
    expect(idx("DELETE FROM proposed_patches")).toBeLessThan(idx("DELETE FROM assets"));
    expect(idx("DELETE FROM asset_relations")).toBeLessThan(idx("DELETE FROM assets"));
    expect(idx("DELETE FROM asset_blobs")).toBeLessThan(idx("DELETE FROM asset_versions"));
    expect(idx("DELETE FROM asset_versions")).toBeLessThan(idx("DELETE FROM assets"));
  });

  it("删除子表失败时回滚事务并释放连接", async () => {
    const clientCalls: Recorded[] = [];
    let released = 0;
    const pool = {
      connect: async () => ({
        query: async (sql: string, params?: unknown[]) => {
          clientCalls.push({ sql, params });
          if (sql.startsWith("SELECT id FROM assets")) {
            return { rowCount: 1, rows: [{ id: "ast_1" }] };
          }
          if (sql.includes("DELETE FROM publishes")) {
            throw new Error("fk boom");
          }
          return { rowCount: 0, rows: [] };
        },
        release: () => {
          released += 1;
        },
      }),
    } as unknown as Pool;

    const store = new Store(new Db(pool), new LocalObjectStore(tmpdir()));
    await expect(store.permanentDelete(actor, "ast_1")).rejects.toThrow("fk boom");

    const sqls = clientCalls.map((c) => c.sql);
    expect(sqls).toContain("ROLLBACK");
    expect(sqls).not.toContain("COMMIT");
    expect(sqls.some((sql) => sql.includes("DELETE FROM assets"))).toBe(false);
    expect(released).toBe(1);
  });
});

describe("Store V2 安全性与并发修复", () => {
  it("claimOutbox 使用 FOR UPDATE SKIP LOCKED 原子抢占任务", async () => {
    const calls: Recorded[] = [];
    const pool = {
      query: async (sql: string, params?: unknown[]) => {
        calls.push({ sql, params });
        return {
          rowCount: 1,
          rows: [
            {
              id: "obx_1",
              event_type: "task.created",
              payload_json: JSON.stringify({ taskId: "tsk_1" }),
              status: "claimed",
              attempt: 1,
              claimed_at: new Date().toISOString(),
              created_at: new Date().toISOString(),
            },
          ],
        };
      },
    } as unknown as Pool;

    const store = new Store(new Db(pool), new LocalObjectStore(tmpdir()));
    const claimed = await store.claimOutbox(5, 60);

    expect(claimed).toHaveLength(1);
    expect(calls[0]?.sql).toContain("UPDATE outbox_events");
    expect(calls[0]?.sql).toContain("FOR UPDATE SKIP LOCKED");
    expect(calls[0]?.sql).toContain("RETURNING *");
    expect(calls[0]?.params).toContain(5);
  });

  it("readContent 在传入 versionId 时必须校验 asset_versions.asset_id 归属", async () => {
    const calls: Recorded[] = [];
    const now = new Date().toISOString();
    const pool = {
      query: async (sql: string, params?: unknown[]) => {
        calls.push({ sql, params });
        if (sql.includes("FROM assets")) {
          return {
            rowCount: 1,
            rows: [
              {
                id: "ast_target",
                workspace_id: "ws_1",
                owner_subject: "user_1",
                type: "document",
                title: "doc",
                path: "",
                description: "",
                visibility: "private",
                status: "normal",
                source_type: "manual",
                current_version_id: "ver_own",
                lock_version: 1,
                deleted_at: null,
                published_url: null,
                created_at: now,
                updated_at: now,
              },
            ],
          };
        }
        return { rowCount: 0, rows: [] };
      },
    } as unknown as Pool;

    const store = new Store(new Db(pool), new LocalObjectStore(tmpdir()));
    const result = await store.readContent("ast_target", "ver_foreign");

    expect(result).toBeNull();
    const blobQuery = calls.find((c) => c.sql.includes("ab.role = 'content'"));
    expect(blobQuery).toBeDefined();
    expect(blobQuery?.sql).toContain("JOIN asset_versions av ON av.id = ab.version_id");
    expect(blobQuery?.sql).toContain("av.asset_id =");
    expect(blobQuery?.params).toEqual(["ver_foreign", "ast_target"]);
  });

  it("applyProposedPatch 原子校验 status = 'pending' 防止重复应用", async () => {
    const calls: Recorded[] = [];
    let callCount = 0;
    const pool = {
      query: async (sql: string, params?: unknown[]) => {
        calls.push({ sql, params });
        callCount += 1;
        if (callCount === 1) {
          return { rowCount: 1, rows: [{ proposed: "new content" }] };
        }
        return { rowCount: 0, rows: [] };
      },
    } as unknown as Pool;

    const store = new Store(new Db(pool), new LocalObjectStore(tmpdir()));
    const first = await store.applyProposedPatch("ast_1", "pat_1");
    expect(first).toBe("new content");
    expect(calls[0]?.sql).toContain("WHERE id = $1 AND asset_id = $2 AND status = 'pending'");
    expect(calls[0]?.sql).toContain("RETURNING proposed");

    await expect(store.applyProposedPatch("ast_1", "pat_1")).resolves.toBeNull();
  });

  it("updateUserProfile 与 createSchedule 使用原生布尔值并持久化 avatarUrl", async () => {
    const calls: Recorded[] = [];
    const pool = {
      query: async (sql: string, params?: unknown[]) => {
        calls.push({ sql, params });
        if (sql.includes("FROM users")) {
          return {
            rowCount: 1,
            rows: [
              {
                subject: "user_1",
                name: "新昵称",
                email: "u@example.com",
                avatar_url: "https://example.com/a.png",
                default_quality: "balanced",
                default_language: "zh-CN",
                notify_email: false,
                workspace_id: "ws_1",
                created_at: new Date().toISOString(),
              },
            ],
          };
        }
        return { rowCount: 1, rows: [] };
      },
    } as unknown as Pool;

    const store = new Store(new Db(pool), new LocalObjectStore(tmpdir()));
    await store.updateUserProfile("user_1", {
      avatarUrl: "https://example.com/a.png",
      notifyEmail: false,
    });
    const updateCall = calls.find((c) => c.sql.includes("UPDATE users"));
    expect(updateCall?.params).toContain(false);
    expect(updateCall?.params).toContain("https://example.com/a.png");

    await store.createSchedule("ws_1", {
      name: "每日简报",
      taskType: "research",
      goal: "汇总动态",
      spec: {},
      cron: "daily 09:00",
    });
    const insertSched = calls.find((c) => c.sql.includes("INSERT INTO task_schedules"));
    expect(insertSched?.sql).toContain("TRUE");
  });
});
