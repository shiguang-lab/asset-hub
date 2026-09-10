import { describe, expect, it } from "vitest";
import {
  deriveFolderTree,
  fileNameOf,
  folderDisplayPath,
  folderPathOf,
  folderSubtreeIds,
  isInFolder,
  leafFromTitle,
  mergeFolderTree,
  moveToFolderPath,
  normalizeFolderPath,
  rewriteFolderPrefix,
} from "./document-path.js";

describe("normalizeFolderPath", () => {
  it("去掉首尾斜杠与空段", () => {
    expect(normalizeFolderPath("/产品//需求文档/")).toBe("产品/需求文档");
  });

  it("丢弃 . 与 .. 段，避免路径穿越", () => {
    expect(normalizeFolderPath("产品/../研究/./报告")).toBe("产品/研究/报告");
    expect(normalizeFolderPath("../..")).toBe("");
  });

  it("把 NFD 中文规范化为 NFC", () => {
    const nfd = "\u4ea7\u54c1\u002f\u9700\u8981".normalize("NFD");
    expect(normalizeFolderPath(nfd)).toBe("产品/需要");
  });

  it("修剪每段两侧的空白", () => {
    expect(normalizeFolderPath(" 产品 / 需求文档 ")).toBe("产品/需求文档");
  });
});

describe("派生目录与文件名", () => {
  it("多级路径取所属目录与文件名", () => {
    expect(folderPathOf("产品/需求文档/PRD")).toBe("产品/需求文档");
    expect(fileNameOf("产品/需求文档/PRD")).toBe("PRD");
  });

  it("根目录文档没有所属目录", () => {
    expect(folderPathOf("README")).toBe("");
    expect(fileNameOf("README")).toBe("README");
  });

  it("空路径两头都是空串", () => {
    expect(folderPathOf("")).toBe("");
    expect(fileNameOf("")).toBe("");
  });
});

describe("leafFromTitle", () => {
  it("把标题里的斜杠替换掉，避免变成多级路径", () => {
    expect(leafFromTitle("2026/Q1 复盘")).toBe("2026-Q1 复盘");
  });

  it("空标题得到空文件名", () => {
    expect(leafFromTitle("   ")).toBe("");
  });
});

describe("isInFolder", () => {
  it("包含自身与各级子目录", () => {
    expect(isInFolder("产品/需求文档/PRD", "产品")).toBe(true);
    expect(isInFolder("产品/需求文档/PRD", "产品/需求文档")).toBe(true);
  });

  it("不把同名前缀当成同一目录", () => {
    // 「产品规划」不属于「产品」，前缀匹配必须停在分隔符上。
    expect(isInFolder("产品规划/PRD", "产品")).toBe(false);
  });

  it("同级文档不算在目录内", () => {
    expect(isInFolder("README", "产品")).toBe(false);
  });

  it("空目录表示全部", () => {
    expect(isInFolder("", "")).toBe(true);
    expect(isInFolder("产品/PRD", "")).toBe(true);
  });
});

describe("moveToFolderPath", () => {
  it("换目录但保留文件名", () => {
    expect(moveToFolderPath("产品/需求文档/PRD", "研究/行业报告")).toBe("研究/行业报告/PRD");
  });

  it("移动到全部文档时退化为顶层文件名", () => {
    expect(moveToFolderPath("产品/需求文档/PRD", "")).toBe("PRD");
  });
});

describe("rewriteFolderPrefix", () => {
  it("重命名改写整个子树的路径前缀", () => {
    expect(rewriteFolderPrefix("产品/需求文档/PRD", "产品", "商品")).toBe("商品/需求文档/PRD");
    expect(rewriteFolderPrefix("产品/需求文档/PRD", "产品/需求文档", "商品")).toBe("商品/PRD");
  });

  it("上提到父目录", () => {
    expect(rewriteFolderPrefix("产品/需求文档/PRD", "产品/需求文档", "产品")).toBe("产品/PRD");
    expect(rewriteFolderPrefix("产品/PRD", "产品", "")).toBe("PRD");
  });

  it("不相关或同名的同级文档返回 null", () => {
    expect(rewriteFolderPrefix("研究/行业报告/X", "产品", "商品")).toBeNull();
    expect(rewriteFolderPrefix("产品", "产品", "商品")).toBeNull();
    expect(rewriteFolderPrefix("产品规划/PRD", "产品", "商品")).toBeNull();
  });

  it("空源目录不做任何改写", () => {
    expect(rewriteFolderPrefix("产品/PRD", "", "商品")).toBeNull();
  });
});

describe("deriveFolderTree", () => {
  it("把路径前缀展开成目录，且父目录先于子目录", () => {
    const tree = deriveFolderTree([
      { path: "产品/需求文档/PRD" },
      { path: "产品/设计规范/规范" },
      { path: "研究/行业报告/新能源" },
    ]);
    expect(tree.map((folder) => folder.id)).toEqual([
      "产品",
      "产品/设计规范",
      "产品/需求文档",
      "研究",
      "研究/行业报告",
    ]);
    expect(tree.find((folder) => folder.id === "产品/需求文档")).toEqual({
      id: "产品/需求文档",
      name: "需求文档",
      parentId: "产品",
    });
    expect(tree.find((folder) => folder.id === "产品")?.parentId).toBeNull();
  });

  it("根目录文档与空路径不产生目录", () => {
    expect(deriveFolderTree([{ path: "README" }, { path: "" }, {}])).toEqual([]);
  });

  it("多个文档共享前缀时目录不重复", () => {
    const tree = deriveFolderTree([{ path: "产品/A" }, { path: "产品/B" }]);
    expect(tree).toEqual([{ id: "产品", name: "产品", parentId: null }]);
  });

  it("同名段但不同层级的目录互不干扰", () => {
    const tree = deriveFolderTree([{ path: "产品/产品/A" }]);
    expect(tree.map((folder) => folder.id)).toEqual(["产品", "产品/产品"]);
  });
});

describe("mergeFolderTree", () => {
  it("保留空目录并补齐父目录", () => {
    expect(mergeFolderTree([], ["产品/待整理"]).map((folder) => folder.id)).toEqual([
      "产品",
      "产品/待整理",
    ]);
  });

  it("合并文档投影时不产生重复目录", () => {
    expect(mergeFolderTree([{ path: "产品/PRD" }], ["产品"]).map((folder) => folder.id)).toEqual([
      "产品",
    ]);
  });
});

describe("folderSubtreeIds", () => {
  it("收集自身与各级子目录", () => {
    const folders = deriveFolderTree([{ path: "产品/需求文档/A" }, { path: "研究/B" }]);
    expect([...folderSubtreeIds(folders, "产品")].sort()).toEqual(["产品", "产品/需求文档"]);
  });
});

describe("folderDisplayPath", () => {
  it("拼出面包屑并防成环", () => {
    const folders = deriveFolderTree([{ path: "产品/需求文档/A" }]);
    expect(folderDisplayPath(folders, "产品/需求文档")).toBe("产品 / 需求文档");
    expect(folderDisplayPath(folders, "不存在")).toBe("");
  });
});
