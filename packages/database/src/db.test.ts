import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Pool } from "pg";
import { beforeEach, describe, expect, it } from "vitest";
import { applyMigrations } from "./db.js";

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
