import { describe, expect, it } from "vitest";
import { legacyFolderNames, readLegacyFolderMigration } from "./document-folder-migration.js";

const FOLDERS_KEY = "shiguang.document-folders";
const ASSIGNMENTS_KEY = "shiguang.document-folder-assignments";

function storage(seed: Record<string, unknown>): Pick<Storage, "getItem"> {
  const data = new Map(Object.entries(seed).map(([key, value]) => [key, JSON.stringify(value)]));
  return { getItem: (key: string) => data.get(key) ?? null };
}

const LEGACY_FOLDERS = [
  { id: "product", name: "产品", parentId: null },
  { id: "product-requirements", name: "需求文档", parentId: "product" },
  { id: "data", name: "数据与看板", parentId: null },
];

describe("readLegacyFolderMigration", () => {
  it("把旧目录归属换算成多级 path", () => {
    const migration = readLegacyFolderMigration(
      storage({
        [FOLDERS_KEY]: LEGACY_FOLDERS,
        [ASSIGNMENTS_KEY]: { ast_1: "product-requirements", ast_2: "data" },
      }),
      [
        { id: "ast_1", title: "Shiguang Lab 产品需求文档", path: "" },
        { id: "ast_2", title: "行业数据 Dashboard", path: "" },
      ],
    );
    expect(migration?.updates).toEqual([
      { id: "ast_1", path: "产品/需求文档/Shiguang Lab 产品需求文档" },
      { id: "ast_2", path: "数据与看板/行业数据 Dashboard" },
    ]);
    expect(migration?.keys).toEqual([FOLDERS_KEY, ASSIGNMENTS_KEY]);
  });

  it("root 归属与未知文档不写 path", () => {
    const migration = readLegacyFolderMigration(
      storage({
        [FOLDERS_KEY]: LEGACY_FOLDERS,
        [ASSIGNMENTS_KEY]: { ast_1: "root", ast_missing: "data", ast_2: "已删除的目录" },
      }),
      [
        { id: "ast_1", title: "顶层文档", path: "" },
        { id: "ast_2", title: "孤儿", path: "" },
      ],
    );
    expect(migration).toBeNull();
  });

  it("服务端已有目录数据时不再迁移", () => {
    const migration = readLegacyFolderMigration(
      storage({
        [FOLDERS_KEY]: LEGACY_FOLDERS,
        [ASSIGNMENTS_KEY]: { ast_1: "data" },
      }),
      [
        { id: "ast_1", title: "A", path: "" },
        { id: "ast_2", title: "B", path: "产品/B" },
      ],
    );
    expect(migration).toBeNull();
  });

  it("没有旧归属时返回 null", () => {
    expect(readLegacyFolderMigration(storage({ [FOLDERS_KEY]: LEGACY_FOLDERS }), [])).toBeNull();
    expect(readLegacyFolderMigration(storage({}), [])).toBeNull();
  });

  it("损坏的 JSON 不抛错", () => {
    const broken: Pick<Storage, "getItem"> = { getItem: () => "{不是 JSON" };
    expect(readLegacyFolderMigration(broken, [])).toBeNull();
  });

  it("目录链断裂时退化为目录自身名字", () => {
    const migration = readLegacyFolderMigration(
      storage({
        [FOLDERS_KEY]: [{ id: "orphan", name: "游离子目录", parentId: "不见了" }],
        [ASSIGNMENTS_KEY]: { ast_1: "orphan" },
      }),
      [{ id: "ast_1", title: "A", path: "" }],
    );
    expect(migration?.updates).toEqual([{ id: "ast_1", path: "游离子目录/A" }]);
  });
});

describe("legacyFolderNames", () => {
  it("列出旧目录的完整路径", () => {
    expect(legacyFolderNames(storage({ [FOLDERS_KEY]: LEGACY_FOLDERS }))).toEqual([
      "产品",
      "产品/需求文档",
      "数据与看板",
    ]);
  });
});
