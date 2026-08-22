import {
  addPage as astAddPage,
  duplicatePage as astDuplicatePage,
  movePage as astMovePage,
  removePage as astRemovePage,
  setTheme as astSetTheme,
  listEditableElements,
  listPages,
  parsePresentationHtml,
  serializePresentationHtml,
  setDataAttribute,
  updateImageSrc,
  updateLinkHref,
  updateTextContent,
} from "@shiguang/content";
import { Empty, Scrollbar, useToast } from "@shiguang/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Input, Modal, Select } from "antd";
import {
  ChevronLeft,
  ChevronRight,
  Eye,
  FileText,
  Grid2X2,
  Import,
  LayoutList,
  MoreHorizontal,
  Play,
  Search,
  Share2,
  Sparkles,
  Star,
  ThumbsUp,
  Trash2,
  TrendingUp,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getAuthSession } from "../../auth/session.js";
import { type Asset, api, type Publish, type PublishStatsSummary } from "../../entities/api.js";
import { AppTable } from "../../shared/AppTable.js";
import { AppTabs } from "../../shared/AppTabs.js";
import { OwnerAvatar } from "../../shared/OwnerAvatar.js";
import { isOwnedBySession, ownerDisplayName } from "../../shared/owner.js";
import { useShellBreadcrumb } from "../../shell/layout.js";
import { PublishDialog } from "../publishing/publish-dialog.js";

/** 命令历史：所有人工/AI 编辑都经过 set，支持 Undo/Redo（对应设计文档 Editor Command 与 Undo/Redo）。 */
function useHistory<T>(initial: T) {
  const [history, setHistory] = useState({ past: [] as T[], present: initial, future: [] as T[] });
  const set = useCallback((updater: T | ((prev: T) => T)) => {
    setHistory((h) => {
      const present = typeof updater === "function" ? (updater as (p: T) => T)(h.present) : updater;
      return { past: [...h.past, h.present], present, future: [] };
    });
  }, []);
  const reset = useCallback((value: T) => {
    setHistory({ past: [], present: value, future: [] });
  }, []);
  const undo = useCallback(() => {
    setHistory((h) => {
      if (h.past.length === 0) return h;
      const previous = h.past[h.past.length - 1];
      return { past: h.past.slice(0, -1), present: previous, future: [h.present, ...h.future] };
    });
  }, []);
  const redo = useCallback(() => {
    setHistory((h) => {
      if (h.future.length === 0) return h;
      const next = h.future[0];
      return { past: [...h.past, h.present], present: next, future: h.future.slice(1) };
    });
  }, []);
  return {
    present: history.present,
    set,
    reset,
    undo,
    redo,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
  };
}

/** 在预览 iframe 内注入「点击选中 + 高亮」桥接脚本（不改动存储的 HTML 本体）。 */
const SG_EDIT_BRIDGE = `<script>
(function () {
  var CSS = ".sg-editor-selected{outline:2px solid var(--sg-primary,#7c5cff) !important;outline-offset:3px;box-shadow:0 0 0 9999px rgba(124,92,255,0.06)}";
  var st = document.createElement("style"); st.textContent = CSS; document.head.appendChild(st);
  document.addEventListener("click", function (e) {
    var el = e.target && e.target.closest ? e.target.closest("[data-sg-id]") : null;
    if (el) { window.parent.postMessage({ source: "sg-editor-preview", type: "select", id: el.getAttribute("data-sg-id") }, "*"); }
  });
  window.addEventListener("message", function (ev) {
    var d = ev.data || {};
    if (d.source !== "sg-editor" || d.type !== "highlight") return;
    document.querySelectorAll(".sg-editor-selected").forEach(function (x) { x.classList.remove("sg-editor-selected"); });
    if (d.id) { var t = document.querySelector("[data-sg-id=\\"" + d.id + "\\"]"); if (t) t.classList.add("sg-editor-selected"); }
  });
})();
</script>`;

/** 预览 srcDoc：在原 HTML 末尾注入选中桥接。 */
function buildPreviewSrcDoc(html: string): string {
  if (html.includes("</body>")) return html.replace("</body>", `${SG_EDIT_BRIDGE}</body>`);
  return `${html}${SG_EDIT_BRIDGE}`;
}

/** 单页缩略图 srcDoc：截取第 pageIndex 页，按 16:9 缩放到 240×135 的小窗口。 */
function buildThumbnailSrcDoc(html: string, pageIndex: number): string {
  try {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const sections = Array.from(doc.querySelectorAll("[data-sg-page]"));
    const styles = Array.from(doc.querySelectorAll("style"))
      .map((s) => s.textContent ?? "")
      .join("\n");
    const section = sections[pageIndex];
    if (!section) return "<!doctype html><html><body></body></html>";
    return `<!doctype html>
<html data-sg-mode="scroll">
<head><meta charset="utf-8"><style>
${styles}
html,body{margin:0;padding:0;overflow:hidden;width:240px;height:135px}
.page-scaler{width:960px;height:540px;transform:scale(0.25);transform-origin:top left}
.page-scaler [data-sg-page]{display:flex !important;height:540px !important;min-height:540px !important;overflow:hidden;padding:32px !important}
</style></head>
<body><div class="page-scaler">${section.outerHTML}</div></body></html>`;
  } catch {
    return "<!doctype html><html><body></body></html>";
  }
}

/** 定位元素所属页面 id（用于点击预览选中时同步左侧高亮）。 */
function locateElementPage(html: string, elementId: string): string | null {
  try {
    const tree = parsePresentationHtml(html);
    for (const page of listPages(tree)) {
      if (listEditableElements(tree, page.id).some((el) => el.id === elementId)) return page.id;
    }
  } catch {
    // ignore
  }
  return null;
}

interface AssetPage {
  items: Asset[];
  nextCursor?: string | null;
}

async function loadPresentationSet(includeDeleted: boolean): Promise<Asset[]> {
  const items: Asset[] = [];
  let cursor: string | undefined;
  do {
    const page = await api<AssetPage>("/assets", {
      params: { type: "presentation", includeDeleted, limit: 100, cursor },
    });
    items.push(...page.items);
    cursor = page.nextCursor ?? undefined;
  } while (cursor);
  return items;
}

async function loadPresentations(): Promise<Asset[]> {
  const [active, deleted] = await Promise.all([
    loadPresentationSet(false),
    loadPresentationSet(true),
  ]);
  return [...active, ...deleted];
}

export function PresentationsPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const authSession = getAuthSession();
  const [tab, setTab] = useState<"all" | "mine" | "shared" | "favorites" | "trash">("all");
  const [query, setQuery] = useState("");
  const [tag, setTag] = useState("all");
  const [status, setStatus] = useState("all");
  const [sort, setSort] = useState("updated");
  const [onlyMine, setOnlyMine] = useState(false);
  const [view, setView] = useState<"list" | "grid">("list");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [publishTarget, setPublishTarget] = useState<Asset | null>(null);
  const [favoriteIds, setFavoriteIds] = useState<string[]>(() => {
    try {
      const value = window.localStorage.getItem("shiguang.presentation-favorites");
      const parsed = value ? JSON.parse(value) : [];
      return Array.isArray(parsed) ? parsed.filter((id) => typeof id === "string") : [];
    } catch {
      return [];
    }
  });
  const { data } = useQuery<Asset[]>({
    queryKey: ["assets", "presentation"],
    queryFn: loadPresentations,
  });
  const { data: publishes = [] } = useQuery<Publish[]>({
    queryKey: ["publishes"],
    queryFn: () => api<Publish[]>("/publishes"),
  });
  const { data: analytics } = useQuery<PublishStatsSummary>({
    queryKey: ["publishes", "stats", "presentation"],
    queryFn: () =>
      api<PublishStatsSummary>("/publishes/stats/summary", {
        params: { assetType: "presentation" },
      }),
  });
  const presentations = useMemo(
    () => (data ?? []).filter((a) => a.type === "presentation"),
    [data],
  );
  const activePresentations = useMemo(
    () => presentations.filter((item) => !item.deletedAt),
    [presentations],
  );
  const activePresentationIds = useMemo(
    () => new Set(activePresentations.map((item) => item.id)),
    [activePresentations],
  );
  const presentationPublishes = useMemo(
    () => publishes.filter((item) => activePresentationIds.has(item.assetId)),
    [activePresentationIds, publishes],
  );
  const viewsByAsset = useMemo(() => {
    const result = new Map<string, number>();
    for (const publish of presentationPublishes) {
      result.set(publish.assetId, (result.get(publish.assetId) ?? 0) + publish.viewCount);
    }
    return result;
  }, [presentationPublishes]);
  const viewCount = useCallback((asset: Asset) => viewsByAsset.get(asset.id) ?? 0, [viewsByAsset]);
  const totalViews = useMemo(
    () => presentationPublishes.reduce((sum, item) => sum + item.viewCount, 0),
    [presentationPublishes],
  );
  const averageLikes = analytics?.averageLikes ?? 0;
  const uniqueVisitors = analytics?.uniqueVisitors ?? 0;
  const averageWatchTime = formatWatchTime(analytics?.averageWatchSeconds ?? 0);

  useEffect(() => {
    window.localStorage.setItem("shiguang.presentation-favorites", JSON.stringify(favoriteIds));
  }, [favoriteIds]);

  useEffect(() => setPage(1), [tab, query, tag, status, sort, onlyMine, pageSize]);

  const tags = useMemo(
    () => [...new Set(presentations.flatMap((item) => item.tags ?? []))].sort(),
    [presentations],
  );
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return presentations
      .filter((item) => {
        if (tab === "mine" && !isOwnedBySession(item, authSession)) return false;
        if (tab === "shared" && isOwnedBySession(item, authSession)) return false;
        if (tab === "favorites" && !favoriteIds.includes(item.id)) return false;
        if (tab === "trash" && !item.deletedAt) return false;
        if (tab !== "trash" && item.deletedAt) return false;
        if (onlyMine && !isOwnedBySession(item, authSession)) return false;
        if (tag !== "all" && !item.tags?.includes(tag)) return false;
        if (status !== "all" && item.status !== status) return false;
        if (
          normalized &&
          !`${item.title} ${item.description ?? ""} ${(item.tags ?? []).join(" ")}`
            .toLowerCase()
            .includes(normalized)
        )
          return false;
        return true;
      })
      .sort((a, b) => {
        if (sort === "title") return a.title.localeCompare(b.title, "zh-CN");
        if (sort === "views") return viewCount(b) - viewCount(a);
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      });
  }, [authSession, favoriteIds, onlyMine, presentations, query, sort, status, tab, tag, viewCount]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageItems = filtered.slice((page - 1) * pageSize, page * pageSize);
  const topPresentations = [...activePresentations]
    .filter((item) => viewCount(item) > 0)
    .sort((a, b) => viewCount(b) - viewCount(a))
    .slice(0, 3);
  const monthly = activePresentations.filter((item) => {
    const created = new Date(item.createdAt);
    const now = new Date();
    return created.getFullYear() === now.getFullYear() && created.getMonth() === now.getMonth();
  }).length;
  const tabs = [
    { id: "all", label: "全部演示" },
    { id: "mine", label: "我创建的" },
    { id: "shared", label: "分享给我的" },
    { id: "favorites", label: "收藏" },
    { id: "trash", label: "回收站" },
  ] as const;
  const sharePresentation = (asset: Asset) => {
    setPublishTarget(asset);
  };
  const toggleFavorite = (id: string) => {
    setFavoriteIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  };

  return (
    <div className="sg-presentation-page">
      <section className="sg-presentation-heading">
        <div className="sg-presentation-title">
          <span>
            <Play size={18} />
          </span>
          <div>
            <h1>在线演示</h1>
            <p>将报告、文档、调研内容转化为精美的 H5 演示，支持在线播放与分享。</p>
          </div>
        </div>
        <div className="sg-presentation-heading-actions">
          <Button onClick={() => navigate("/presentations/new?source=document")}>
            <Import size={14} />
            导入文档生成演示
          </Button>
          <Button onClick={() => setTab("trash")}>
            <Trash2 size={14} />
            演示回收站
          </Button>
        </div>
      </section>

      <div className="sg-presentation-layout">
        <main>
          <section className="sg-presentation-stats">
            {[
              {
                label: "全部演示",
                value: activePresentations.length,
                icon: FileText,
                tone: "violet",
              },
              {
                label: "本月创建",
                value: monthly,
                icon: Play,
                tone: "blue",
              },
              {
                label: "总浏览量",
                value: totalViews.toLocaleString("zh-CN"),
                delta: "21%",
                icon: Eye,
                tone: "cyan",
              },
              {
                label: "平均点赞",
                value: averageLikes.toLocaleString("zh-CN"),
                delta: "18%",
                icon: ThumbsUp,
                tone: "orange",
              },
            ].map((item) => {
              const StatIcon = item.icon;
              return (
                <article key={item.label}>
                  <span className={item.tone}>
                    <StatIcon size={20} />
                  </span>
                  <div>
                    <small>{item.label}</small>
                    <strong>{item.value}</strong>
                    <p>
                      较上月 <TrendingUp size={11} /> {"delta" in item ? item.delta : "16%"}
                    </p>
                  </div>
                </article>
              );
            })}
          </section>

          <AppTabs
            items={tabs.map((item) => ({ key: item.id, label: item.label }))}
            activeKey={tab}
            onChange={(key) => setTab(key as typeof tab)}
          />

          <section className="sg-presentation-toolbar">
            <label className="sg-presentation-search">
              <Search size={14} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索演示标题或描述..."
              />
            </label>
            <Select
              value={tag}
              onChange={setTag}
              options={[
                { value: "all", label: "全部标签" },
                ...tags.map((item) => ({ value: item, label: item })),
              ]}
              className="sg-presentation-select"
            />
            <Select
              value={status}
              onChange={setStatus}
              options={[
                { value: "all", label: "全部状态" },
                { value: "ready", label: "已完成" },
                { value: "draft", label: "草稿" },
                { value: "processing", label: "生成中" },
              ]}
              className="sg-presentation-select"
            />
            <Select
              value={sort}
              onChange={setSort}
              options={[
                { value: "updated", label: "更新时间" },
                { value: "views", label: "浏览量" },
                { value: "title", label: "标题" },
              ]}
              className="sg-presentation-select"
            />
            <label className="sg-presentation-own">
              <input
                type="checkbox"
                checked={onlyMine}
                onChange={(event) => setOnlyMine(event.target.checked)}
              />
              仅看我创建
            </label>
            <fieldset className="sg-presentation-view-switch">
              <legend>视图模式</legend>
              <button
                type="button"
                className={view === "grid" ? "active" : ""}
                aria-label="卡片视图"
                title="卡片视图"
                onClick={() => setView("grid")}
              >
                <Grid2X2 size={14} />
              </button>
              <button
                type="button"
                className={view === "list" ? "active" : ""}
                aria-label="列表视图"
                title="列表视图"
                onClick={() => setView("list")}
              >
                <LayoutList size={14} />
              </button>
            </fieldset>
          </section>

          {pageItems.length === 0 ? (
            <div className="sg-presentation-empty">
              <Empty
                title={tab === "trash" ? "回收站为空" : "没有匹配的演示"}
                hint={
                  tab === "trash" ? "删除的演示会保留 30 天。" : "调整筛选条件或创建新的在线演示。"
                }
                action={
                  tab !== "trash" ? (
                    <Button type="primary" onClick={() => navigate("/presentations/new")}>
                      新建在线演示
                    </Button>
                  ) : undefined
                }
              />
            </div>
          ) : view === "list" ? (
            <div className="sg-presentation-table-wrap">
              <AppTable<Asset>
                rowKey="id"
                dataSource={pageItems}
                pagination={false}
                size="middle"
                columns={[
                  {
                    title: "演示标题",
                    dataIndex: "title",
                    width: "47%",
                    render: (_v, item, index) => (
                      <div className="sg-presentation-name">
                        <PresentationThumbnail title={item.title} tone={index} />
                        <div>
                          <button
                            type="button"
                            onClick={() => navigate(`/presentations/${item.id}`)}
                          >
                            {item.title}
                          </button>
                          <span>
                            {(item.tags ?? []).slice(0, 2).map((itemTag) => (
                              <small key={itemTag}>{itemTag}</small>
                            ))}
                          </span>
                        </div>
                        <button
                          type="button"
                          className={`sg-presentation-favorite${favoriteIds.includes(item.id) ? " active" : ""}`}
                          aria-label={favoriteIds.includes(item.id) ? "取消收藏" : "收藏"}
                          onClick={() => toggleFavorite(item.id)}
                        >
                          <Star size={13} />
                        </button>
                      </div>
                    ),
                  },
                  {
                    title: "来源类型",
                    dataIndex: "sourceType",
                    width: 120,
                    render: (_v, item) => (
                      <span className="sg-presentation-source">
                        <FileText size={13} />
                        {item.sourceType === "manual" ? "文档" : "报告"}
                      </span>
                    ),
                  },
                  {
                    title: "创建者",
                    dataIndex: "ownerDisplayName",
                    width: 120,
                    render: (_v, item) => (
                      <OwnerAvatar name={ownerDisplayName(item, authSession)} />
                    ),
                  },
                  {
                    title: "更新时间",
                    dataIndex: "updatedAt",
                    width: 160,
                    render: (v) => new Date(v).toLocaleString("zh-CN", { hour12: false }),
                  },
                  {
                    title: "浏览量",
                    dataIndex: "viewCount",
                    width: 90,
                    render: (_v, item) => viewCount(item).toLocaleString("zh-CN"),
                  },
                  {
                    title: "操作",
                    key: "actions",
                    width: 120,
                    render: (_v, item) => (
                      <div className="sg-presentation-row-actions">
                        <button
                          type="button"
                          aria-label={`播放 ${item.title}`}
                          title="播放"
                          onClick={() => navigate(`/presentations/${item.id}/play`)}
                        >
                          <Play size={13} />
                        </button>
                        <button
                          type="button"
                          aria-label={`分享 ${item.title}`}
                          title="分享"
                          onClick={() => void sharePresentation(item)}
                        >
                          <Share2 size={13} />
                        </button>
                        <button
                          type="button"
                          aria-label={`${item.title} 更多操作`}
                          title="更多操作"
                          onClick={() => toast("info", "可在演示编辑器中管理更多设置")}
                        >
                          <MoreHorizontal size={14} />
                        </button>
                      </div>
                    ),
                  },
                ]}
              />
            </div>
          ) : (
            <div className="sg-presentation-grid">
              {pageItems.map((item, index) => (
                <article key={item.id}>
                  <PresentationThumbnail title={item.title} tone={index} />
                  <div>
                    <button type="button" onClick={() => navigate(`/presentations/${item.id}`)}>
                      {item.title}
                    </button>
                    <p>{item.description || "在线演示内容"}</p>
                    <span>
                      <Eye size={12} /> {viewCount(item).toLocaleString("zh-CN")}
                    </span>
                  </div>
                </article>
              ))}
            </div>
          )}

          <div className="sg-presentation-pagination">
            <span>共 {filtered.length} 条</span>
            <div>
              <button
                type="button"
                aria-label="上一页"
                disabled={page === 1}
                onClick={() => setPage(page - 1)}
              >
                <ChevronLeft size={14} />
              </button>
              {Array.from({ length: Math.min(5, pageCount) }, (_, index) => index + 1).map(
                (value) => (
                  <button
                    type="button"
                    className={page === value ? "active" : ""}
                    key={value}
                    onClick={() => setPage(value)}
                  >
                    {value}
                  </button>
                ),
              )}
              <button
                type="button"
                aria-label="下一页"
                disabled={page === pageCount}
                onClick={() => setPage(page + 1)}
              >
                <ChevronRight size={14} />
              </button>
            </div>
            <Select
              value={String(pageSize)}
              onChange={(value) => setPageSize(Number(value))}
              options={[
                { value: "10", label: "10 条/页" },
                { value: "20", label: "20 条/页" },
                { value: "50", label: "50 条/页" },
              ]}
              className="sg-presentation-page-size"
            />
          </div>

          <section className="sg-presentation-quickstart">
            <div>
              <Sparkles size={17} />
              <strong>快速开始</strong>
            </div>
            <ol>
              {[
                ["选择来源", "从报告、文档或空白开始"],
                ["AI 生成大纲", "智能提炼核心观点"],
                ["一键生成", "自动生成精美 H5 演示"],
                ["编辑发布", "在线编辑并分享"],
              ].map(([title, description], index) => (
                <li key={title}>
                  <span>{index + 1}</span>
                  <div>
                    <b>{title}</b>
                    <small>{description}</small>
                  </div>
                  {index < 3 && <ChevronRight size={14} />}
                </li>
              ))}
            </ol>
          </section>
        </main>

        <aside className="sg-presentation-side">
          <section className="sg-presentation-analytics">
            <div className="sg-presentation-side-title">
              <h2>演示数据概览</h2>
              <Select
                value="30"
                onChange={() => undefined}
                options={[{ value: "30", label: "近 30 天" }]}
                className="sg-presentation-range"
              />
            </div>
            <PresentationTrendChart daily={analytics?.daily ?? []} />
            <dl>
              <div>
                <dt>浏览量</dt>
                <dd>{totalViews.toLocaleString("zh-CN")}</dd>
                <small>↑ 21%</small>
              </div>
              <div>
                <dt>独立访客</dt>
                <dd>{uniqueVisitors.toLocaleString("zh-CN")}</dd>
                <small>↑ 18%</small>
              </div>
              <div>
                <dt>平均观看时长</dt>
                <dd>{averageWatchTime}</dd>
                <small>↑ 12%</small>
              </div>
            </dl>
          </section>
          <section>
            <div className="sg-presentation-side-title">
              <h2>热门演示 TOP 3</h2>
              <button type="button" onClick={() => setSort("views")}>
                查看全部
              </button>
            </div>
            {topPresentations.length === 0 ? (
              <p className="sg-subtle">暂无发布访问记录</p>
            ) : (
              <ol className="sg-presentation-top-list">
                {topPresentations.map((item, index) => (
                  <li key={item.id}>
                    <b>{index + 1}</b>
                    <button type="button" onClick={() => navigate(`/presentations/${item.id}`)}>
                      {item.title}
                    </button>
                    <span>
                      <Eye size={11} /> {viewCount(item).toLocaleString("zh-CN")}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </section>
          <section>
            <div className="sg-presentation-side-title">
              <h2>最近更新</h2>
              <button type="button" onClick={() => setSort("updated")}>
                查看全部
              </button>
            </div>
            <div className="sg-presentation-recent">
              {[...presentations]
                .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
                .slice(0, 6)
                .map((item, index) => (
                  <button
                    type="button"
                    key={item.id}
                    onClick={() => navigate(`/presentations/${item.id}`)}
                  >
                    <PresentationThumbnail title={item.title} tone={index} />
                    <span>
                      <b>{item.title}</b>
                      <small>
                        {new Date(item.updatedAt).toLocaleString("zh-CN", { hour12: false })}
                      </small>
                    </span>
                  </button>
                ))}
            </div>
          </section>
        </aside>
      </div>
      {publishTarget && (
        <PublishDialog asset={publishTarget} open onClose={() => setPublishTarget(null)} />
      )}
    </div>
  );
}

function PresentationThumbnail({ title, tone }: { title: string; tone: number }) {
  return (
    <span className={`sg-presentation-thumb tone-${tone % 4}`} aria-hidden="true">
      <i />
      <b>{title.slice(0, 12)}</b>
      <small>SHIGUANG LAB</small>
    </span>
  );
}

function formatWatchTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "00:00";
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.floor(seconds % 60);
  return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

function PresentationTrendChart({
  daily,
}: {
  daily: Array<{ day: string; views: number; uniqueVisitors: number }>;
}) {
  const points = daily.slice(-30);
  const max = Math.max(1, ...points.map((item) => item.views));
  const coordinates = (points.length > 1 ? points : [{ day: "", views: 0, uniqueVisitors: 0 }]).map(
    (item, index, source) => {
      const x = source.length === 1 ? 130 : (index / (source.length - 1)) * 260;
      const y = 110 - (item.views / max) * 95;
      return { x, y, day: item.day };
    },
  );
  const line = coordinates.map((point) => `${point.x},${point.y}`).join(" ");
  const area = `M${coordinates[0]?.x ?? 0} 120 L${line} L${coordinates.at(-1)?.x ?? 260} 120 Z`;
  const labels = [0, 0.25, 0.5, 0.75, 1].map((ratio) => {
    const point = points[Math.min(points.length - 1, Math.round((points.length - 1) * ratio))];
    return point?.day.slice(5) ?? "--";
  });
  return (
    <div className="sg-presentation-chart" role="img" aria-label="近 30 天浏览趋势">
      <span>{max.toLocaleString("zh-CN")}</span>
      <span>{Math.round(max * 0.75).toLocaleString("zh-CN")}</span>
      <span>{Math.round(max * 0.5).toLocaleString("zh-CN")}</span>
      <span>{Math.round(max * 0.25).toLocaleString("zh-CN")}</span>
      <span>0</span>
      <svg viewBox="0 0 260 120" aria-hidden="true">
        <defs>
          <linearGradient id="presentation-area" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#7c3cff" stopOpacity="0.35" />
            <stop offset="1" stopColor="#7c3cff" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#presentation-area)" />
        <polyline points={line} fill="none" stroke="#8f63ff" strokeWidth="2" />
      </svg>
      <div>
        {labels.map((label, index) => (
          <small key={`${label}-${index}`}>{label}</small>
        ))}
      </div>
    </div>
  );
}

export function PresentationEditorPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();
  const {
    present: html,
    set: setHtml,
    reset: resetHtml,
    undo,
    redo,
    canUndo,
    canRedo,
  } = useHistory<string>("");
  const [activePageId, setActivePageId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [publishOpen, setPublishOpen] = useState(false);
  const [aiEditOpen, setAiEditOpen] = useState(false);
  const [aiScope, setAiScope] = useState<"page" | "presentation">("page");
  const [aiInstruction, setAiInstruction] = useState("");
  const [aiProposal, setAiProposal] = useState<string | null>(null);
  const previewRef = useRef<HTMLIFrameElement>(null);

  const { data } = useQuery<{ asset: Asset; html: string }>({
    queryKey: ["presentation", id],
    queryFn: () => api(`/presentations/${id}`),
  });

  useShellBreadcrumb("在线演示", data?.asset.title ?? "未命名演示");

  useEffect(() => {
    if (data) resetHtml(data.html);
  }, [data]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      if (e.key.toLowerCase() === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if ((e.key.toLowerCase() === "z" && e.shiftKey) || e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo]);

  // 预览 iframe 点击选中元素 → 同步高亮 + 左侧/右侧定位
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      const data = e.data as { source?: string; type?: string; id?: string } | null;
      if (data?.source !== "sg-editor-preview" || data.type !== "select" || !data.id) return;
      setSelectedId(data.id);
      const pageId = locateElementPage(html, data.id);
      if (pageId) setActivePageId(pageId);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [html]);

  // 高亮选中元素（发送到预览 iframe）
  useEffect(() => {
    previewRef.current?.contentWindow?.postMessage(
      { source: "sg-editor", type: "highlight", id: selectedId },
      "*",
    );
  }, [selectedId, html]);

  const pages = useMemo(() => {
    try {
      return listPages(parsePresentationHtml(html));
    } catch {
      return [];
    }
  }, [html]);

  const applyAst = (fn: (tree: ReturnType<typeof parsePresentationHtml>) => void) => {
    try {
      const tree = parsePresentationHtml(html);
      fn(tree);
      setHtml(serializePresentationHtml(tree));
    } catch (error) {
      toast("error", error instanceof Error ? error.message : "HTML 解析失败");
    }
  };

  const addPage = () => {
    const nid = `slide-${Date.now().toString(36)}`;
    applyAst((tree) => astAddPage(tree, { id: nid, layout: "content", title: "新页面" }));
    setActivePageId(`page-${nid}`);
  };
  const removeActivePage = () => {
    if (!activePageId) return;
    applyAst((tree) => astRemovePage(tree, activePageId));
    setActivePageId(null);
  };
  const moveActivePage = (direction: -1 | 1) => {
    if (activePageId) applyAst((tree) => astMovePage(tree, activePageId, direction));
  };
  const duplicateActivePage = () => {
    if (!activePageId) return;
    const nid = `page-${Date.now().toString(36)}`;
    applyAst((tree) => astDuplicatePage(tree, activePageId, nid));
  };

  const [theme, setTheme] = useState("light");
  const elements = useMemo(() => {
    if (!activePageId) return [];
    try {
      return listEditableElements(parsePresentationHtml(html), activePageId);
    } catch {
      return [];
    }
  }, [html, activePageId]);

  const applyTheme = (value: string) => {
    setTheme(value);
    applyAst((tree) => astSetTheme(tree, value));
  };
  const editText = (elementId: string, value: string) =>
    applyAst((tree) => updateTextContent(tree, elementId, value));
  const editImage = (elementId: string, value: string) =>
    applyAst((tree) => updateImageSrc(tree, elementId, value));
  const editLink = (elementId: string, value: string) =>
    applyAst((tree) => updateLinkHref(tree, elementId, value));
  const editAttr = (elementId: string, name: string, value: string) =>
    applyAst((tree) => setDataAttribute(tree, elementId, name, value || null));

  const saveMutation = useMutation({
    mutationFn: () => api(`/presentations/${id}`, { method: "PUT", body: { html } }),
    onSuccess: () => {
      toast("success", "已保存");
      void queryClient.invalidateQueries({ queryKey: ["presentation", id] });
    },
  });

  const aiEdit = useMutation({
    mutationFn: () =>
      api<{ proposal: string }>(`/presentations/${id}/ai-edit`, {
        method: "POST",
        body: {
          scope: aiScope,
          targetId: aiScope === "page" ? activePageId : undefined,
          instruction: aiInstruction || "让内容更精炼、更有冲击力",
        },
      }),
    onSuccess: (res) => setAiProposal(res.proposal),
    onError: (error) => toast("error", error instanceof Error ? error.message : "AI 修改失败"),
  });

  const openAiEdit = (scope: "page" | "presentation") => {
    setAiScope(scope);
    setAiInstruction("");
    setAiProposal(null);
    setAiEditOpen(true);
  };

  const applyAiProposal = () => {
    if (aiProposal == null) return;
    setHtml(aiProposal);
    setAiProposal(null);
    setAiEditOpen(false);
    toast("success", "AI 修改已应用");
  };

  if (!data) return <Empty title="加载中…" />;

  return (
    <div>
      <div className="sg-row-between sg-mb">
        <div>
          <span className="sg-subtle">
            已自动保存 · {new Date().toLocaleTimeString("zh-CN", { hour12: false })}
          </span>
        </div>
        <div className="sg-row">
          <Button size="small" disabled={!canUndo} onClick={undo} aria-label="撤销">
            ↺ 撤销
          </Button>
          <Button size="small" disabled={!canRedo} onClick={redo} aria-label="重做">
            ↻ 重做
          </Button>
          <Button size="small" onClick={() => openAiEdit("presentation")}>
            ✦ AI 整篇
          </Button>
          <Button size="small" onClick={() => openAiEdit("page")}>
            ✦ AI 本页
          </Button>
          <Button size="small" onClick={() => saveMutation.mutate()}>
            保存
          </Button>
          <Button size="small" onClick={() => navigate(`/presentations/${id}/play`)}>
            ▶ 播放
          </Button>
          <Button size="small" type="primary" onClick={() => setPublishOpen(true)}>
            发布
          </Button>
        </div>
      </div>

      <div className="sg-slide-editor">
        <Scrollbar className="sg-slide-list">
          <div className="sg-row-between" style={{ padding: "4px 4px 10px" }}>
            <strong style={{ fontSize: 13 }}>页面（{pages.length}）</strong>
            <div className="sg-row">
              <Button size="small" type="text" onClick={addPage} aria-label="新增页面">
                +
              </Button>
              <Button
                size="small"
                type="text"
                disabled={!activePageId}
                onClick={() => moveActivePage(-1)}
                aria-label="上移"
              >
                ↑
              </Button>
              <Button
                size="small"
                type="text"
                disabled={!activePageId}
                onClick={() => moveActivePage(1)}
                aria-label="下移"
              >
                ↓
              </Button>
              <Button
                size="small"
                type="text"
                disabled={!activePageId}
                onClick={duplicateActivePage}
                aria-label="复制页面"
              >
                ⧉
              </Button>
              <Button
                size="small"
                type="text"
                disabled={!activePageId}
                onClick={removeActivePage}
                aria-label="删除页面"
              >
                ×
              </Button>
            </div>
          </div>
          {pages.map((p, i) => (
            <button
              type="button"
              key={p.id}
              className={`sg-slide-thumb ${activePageId === p.id ? "active" : ""}`}
              onClick={() => {
                setActivePageId(p.id);
                setSelectedId(null);
              }}
            >
              <span className="sg-slide-thumb-no">{String(i + 1).padStart(2, "0")}</span>
              <iframe
                title={p.title || `第 ${i + 1} 页`}
                className="sg-slide-thumb-frame"
                sandbox=""
                srcDoc={buildThumbnailSrcDoc(html, i)}
                tabIndex={-1}
              />
              <span className="sg-slide-thumb-label">{p.title || "未命名"}</span>
            </button>
          ))}
        </Scrollbar>

        <div className="sg-col">
          <div className="sg-editor-hint" style={{ marginBottom: 8 }}>
            <span>点击预览中的元素可选中，右侧面板实时编辑文字/图片/链接/动画。</span>
          </div>
          <iframe
            ref={previewRef}
            title="演示预览"
            sandbox="allow-scripts allow-forms allow-popups allow-modals"
            srcDoc={buildPreviewSrcDoc(html)}
            style={{
              width: "100%",
              minHeight: 560,
              border: "1px solid var(--sg-border)",
              borderRadius: 8,
              background: "#fff",
            }}
          />
        </div>

        <Scrollbar className="sg-editor-right">
          <h4>主题</h4>
          <Select
            value={theme}
            onChange={applyTheme}
            options={[
              { value: "light", label: "明亮" },
              { value: "dark", label: "深色" },
              { value: "brand", label: "商务" },
              { value: "minimal", label: "简约" },
              { value: "gradient", label: "渐变" },
            ]}
            className=""
          />

          <h4 style={{ marginTop: 16 }}>当前页元素（{elements.length}）</h4>
          {selectedId && (
            <p className="sg-hint" style={{ color: "var(--sg-primary)" }}>
              已选中：{selectedId}（点击其它元素或空白处切换）
            </p>
          )}
          {activePageId && elements.length === 0 ? (
            <p className="sg-hint">当前页没有带 data-sg-id 的可编辑元素。</p>
          ) : (
            elements.map((el) => (
              <div
                key={el.id}
                className={`sg-el-editor ${selectedId === el.id ? "selected" : ""}`}
                style={{ gap: 6, marginBottom: 12, padding: 8, borderRadius: 8 }}
                onClick={() => setSelectedId(el.id)}
              >
                <strong style={{ fontSize: 12, cursor: "pointer" }}>
                  {el.kind === "image"
                    ? "图片"
                    : el.kind === "link"
                      ? "链接"
                      : el.kind === "chart"
                        ? "图表"
                        : "文本"}{" "}
                  <span className="sg-subtle">{el.id}</span>
                </strong>
                {el.kind === "image" ? (
                  <input
                    className="sg-input"
                    value={el.src ?? ""}
                    onChange={(e) => editImage(el.id, e.target.value)}
                    placeholder="图片 URL"
                  />
                ) : el.kind === "link" ? (
                  <>
                    <input
                      className="sg-input"
                      value={el.href ?? ""}
                      onChange={(e) => editLink(el.id, e.target.value)}
                      placeholder="链接 URL"
                    />
                    <Input.TextArea
                      value={el.text}
                      onChange={(e) => editText(el.id, e.target.value)}
                      placeholder="链接文本"
                      style={{ minHeight: 44 }}
                    />
                  </>
                ) : (
                  <Input.TextArea
                    value={el.text}
                    onChange={(e) => editText(el.id, e.target.value)}
                    placeholder="文本内容"
                    style={{ minHeight: 44 }}
                  />
                )}
                <div className="sg-row">
                  <Select
                    value={el.enter ?? "none"}
                    onChange={(v) => editAttr(el.id, "data-sg-enter", v === "none" ? "" : v)}
                    options={[
                      { value: "none", label: "无动画" },
                      { value: "fade", label: "淡入" },
                      { value: "fade-up", label: "上浮" },
                      { value: "slide", label: "滑入" },
                      { value: "scale", label: "缩放" },
                    ]}
                    className=""
                    style={{ flex: 1 }}
                  />
                  <Select
                    value={el.hover ?? "none"}
                    onChange={(v) => editAttr(el.id, "data-sg-hover", v === "none" ? "" : v)}
                    options={[
                      { value: "none", label: "无 Hover" },
                      { value: "lift", label: "上浮" },
                      { value: "glow", label: "发光" },
                      { value: "scale", label: "缩放" },
                      { value: "border", label: "描边" },
                    ]}
                    className=""
                    style={{ flex: 1 }}
                  />
                </div>
              </div>
            ))
          )}
          <p className="sg-hint" style={{ marginTop: 12 }}>
            {pages.length} 页 · 点击预览或右侧列表选中元素，即可编辑文字/图片/链接/动画/Hover；
            页面增删排序走左侧缩略图。
          </p>
        </Scrollbar>
      </div>

      {publishOpen && data && (
        <PublishDialog asset={data.asset} open onClose={() => setPublishOpen(false)} />
      )}

      <Modal
        open={aiEditOpen}
        onCancel={() => setAiEditOpen(false)}
        title={aiScope === "page" ? "AI 重写本页" : "AI 修改整篇演示"}
        footer={
          <div className="sg-row">
            <Button onClick={() => setAiEditOpen(false)}>取消</Button>
            {aiProposal == null ? (
              <Button type="primary" disabled={aiEdit.isPending} onClick={() => aiEdit.mutate()}>
                {aiEdit.isPending ? "生成中…" : "生成"}
              </Button>
            ) : (
              <Button type="primary" onClick={applyAiProposal}>
                应用修改
              </Button>
            )}
          </div>
        }
        destroyOnHidden
      >
        <div className="sg-col" style={{ gap: 12 }}>
          <div className="sg-option-row">
            <span>作用范围</span>
            <span>{aiScope === "page" ? "当前页" : "整个演示"}</span>
          </div>
          <Input.TextArea
            value={aiInstruction}
            onChange={(e) => setAiInstruction(e.target.value)}
            placeholder="例如：让内容更精炼、更有冲击力"
            style={{ minHeight: 70 }}
          />
          {aiProposal != null && (
            <div className="sg-col" style={{ gap: 6 }}>
              <strong style={{ fontSize: 12 }}>AI 建议（应用后可用撤销回退）</strong>
              <pre
                style={{
                  fontSize: 12,
                  maxHeight: 240,
                  overflow: "auto",
                  whiteSpace: "pre-wrap",
                  background: "var(--sg-surface)",
                  padding: 12,
                  borderRadius: 8,
                }}
              >
                {aiProposal}
              </pre>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}

export function PresentationPlayerPage() {
  const { id } = useParams<{ id: string }>();
  const { data } = useQuery<{ asset: Asset; html: string }>({
    queryKey: ["presentation", id],
    queryFn: () => api(`/presentations/${id}`),
  });

  if (!data) return <Empty title="加载中…" />;

  // 播放器渲染 HTML Artifact，并运行在独立 opaque origin 沙箱中（对应设计文档 Preview Sandbox）。
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 400, background: "#000" }}>
      <iframe
        title={data.asset.title}
        sandbox="allow-scripts allow-forms allow-popups allow-modals"
        srcDoc={data.html}
        style={{ width: "100%", height: "100%", border: "none", display: "block" }}
      />
    </div>
  );
}
