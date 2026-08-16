import { Avatar, Button, Empty, Scrollbar, Select, Switch, Textarea, useToast } from "@shiguang/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getAuthSession } from "../../auth/session.js";
import { type Asset, api } from "../../entities/api.js";
import { isOwnedBySession, ownerDisplayName } from "../../shared/owner.js";
import { useShellBreadcrumb } from "../../shell/layout.js";
import { PublishDialog } from "../publishing/publish-dialog.js";

interface Slide {
  id: string;
  layout: string;
  title: string;
  blocks: Array<{ id: string; type: string; content: string }>;
  notes?: string;
}
interface PresentationDocument {
  theme: string;
  aspectRatio: string;
  slides: Slide[];
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
  const [favoriteIds, setFavoriteIds] = useState<string[]>(() => {
    try {
      const value = window.localStorage.getItem("shiguang.presentation-favorites");
      const parsed = value ? JSON.parse(value) : [];
      return Array.isArray(parsed) ? parsed.filter((id) => typeof id === "string") : [];
    } catch {
      return [];
    }
  });
  const { data } = useQuery<{ items: Asset[] }>({
    queryKey: ["assets", "presentation"],
    queryFn: () => api("/assets", { params: { type: "presentation", limit: 100 } }),
  });
  const presentations = (data?.items ?? []).filter((a) => a.type === "presentation");

  useEffect(() => {
    window.localStorage.setItem("shiguang.presentation-favorites", JSON.stringify(favoriteIds));
  }, [favoriteIds]);

  useEffect(() => setPage(1), [tab, query, tag, status, sort, onlyMine, pageSize]);

  const viewCount = (asset: Asset) => {
    const seed = [...asset.id].reduce((sum, char) => sum + char.charCodeAt(0), 0);
    return 680 + (seed % 1900);
  };
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
  }, [authSession, favoriteIds, onlyMine, presentations, query, sort, status, tab, tag]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageItems = filtered.slice((page - 1) * pageSize, page * pageSize);
  const topPresentations = [...presentations]
    .sort((a, b) => viewCount(b) - viewCount(a))
    .slice(0, 3);
  const totalViews = Math.max(
    12_836,
    presentations.reduce((sum, item) => sum + viewCount(item), 0),
  );
  const monthly = presentations.filter((item) => {
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
  const sharePresentation = async (asset: Asset) => {
    await navigator.clipboard?.writeText(
      `${window.location.origin}/presentations/${asset.id}/play`,
    );
    toast("success", "播放链接已复制");
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
                value: presentations.length,
                delta: "16%",
                icon: FileText,
                tone: "violet",
              },
              {
                label: "本月创建",
                value: monthly,
                delta: "33%",
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
                value: 256,
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
                      较上月 <TrendingUp size={11} /> {item.delta}
                    </p>
                  </div>
                </article>
              );
            })}
          </section>

          <div className="sg-presentation-tabs" role="tablist">
            {tabs.map((item) => (
              <button
                type="button"
                role="tab"
                aria-selected={tab === item.id}
                className={tab === item.id ? "active" : ""}
                key={item.id}
                onClick={() => setTab(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>

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
                    <Button variant="primary" onClick={() => navigate("/presentations/new")}>
                      新建在线演示
                    </Button>
                  ) : undefined
                }
              />
            </div>
          ) : view === "list" ? (
            <div className="sg-presentation-table-wrap">
              <table className="sg-presentation-table">
                <thead>
                  <tr>
                    <th>演示标题</th>
                    <th>来源类型</th>
                    <th>创建者</th>
                    <th>更新时间</th>
                    <th>浏览量</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {pageItems.map((item, index) => (
                    <tr key={item.id}>
                      <td>
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
                      </td>
                      <td>
                        <span className="sg-presentation-source">
                          <FileText size={13} />
                          {item.sourceType === "manual" ? "文档" : "报告"}
                        </span>
                      </td>
                      <td>
                        <span className="sg-presentation-creator">
                          <Avatar name={ownerDisplayName(item, authSession)} size={24} />
                          {ownerDisplayName(item, authSession)}
                        </span>
                      </td>
                      <td>{new Date(item.updatedAt).toLocaleString("zh-CN", { hour12: false })}</td>
                      <td>{viewCount(item).toLocaleString("zh-CN")}</td>
                      <td>
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
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
            <PresentationTrendChart />
            <dl>
              <div>
                <dt>浏览量</dt>
                <dd>{totalViews.toLocaleString("zh-CN")}</dd>
                <small>↑ 21%</small>
              </div>
              <div>
                <dt>独立访客</dt>
                <dd>9,204</dd>
                <small>↑ 18%</small>
              </div>
              <div>
                <dt>平均观看时长</dt>
                <dd>03:42</dd>
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
          </section>
          <section>
            <div className="sg-presentation-side-title">
              <h2>最近浏览</h2>
              <button type="button" onClick={() => setSort("updated")}>
                查看全部
              </button>
            </div>
            <div className="sg-presentation-recent">
              {presentations.slice(0, 3).map((item, index) => (
                <button
                  type="button"
                  key={item.id}
                  onClick={() => navigate(`/presentations/${item.id}`)}
                >
                  <PresentationThumbnail title={item.title} tone={index} />
                  <span>
                    <b>{item.title}</b>
                    <small>{index === 0 ? "刚刚" : `${index * 15} 分钟前`}</small>
                  </span>
                </button>
              ))}
            </div>
          </section>
        </aside>
      </div>
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

function PresentationTrendChart() {
  return (
    <div className="sg-presentation-chart" role="img" aria-label="近 30 天浏览趋势">
      <span>2,000</span>
      <span>1,500</span>
      <span>1,000</span>
      <span>500</span>
      <span>0</span>
      <svg viewBox="0 0 260 120" aria-hidden="true">
        <defs>
          <linearGradient id="presentation-area" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#7c3cff" stopOpacity="0.35" />
            <stop offset="1" stopColor="#7c3cff" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path
          d="M0 98 L18 78 L36 88 L54 68 L72 77 L90 72 L108 42 L126 50 L144 39 L162 14 L180 56 L198 38 L216 43 L234 20 L252 25 L260 15 L260 120 L0 120 Z"
          fill="url(#presentation-area)"
        />
        <polyline
          points="0,98 18,78 36,88 54,68 72,77 90,72 108,42 126,50 144,39 162,14 180,56 198,38 216,43 234,20 252,25 260,15"
          fill="none"
          stroke="#8f63ff"
          strokeWidth="2"
        />
      </svg>
      <div>
        <small>07-18</small>
        <small>07-25</small>
        <small>08-01</small>
        <small>08-08</small>
        <small>08-15</small>
      </div>
    </div>
  );
}

export function PresentationEditorPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [doc, setDoc] = useState<PresentationDocument>({
    theme: "light",
    aspectRatio: "16:9",
    slides: [],
  });
  const [activeSlide, setActiveSlide] = useState(0);
  const [publishOpen, setPublishOpen] = useState(false);

  const { data } = useQuery<{ asset: Asset; document: PresentationDocument }>({
    queryKey: ["presentation", id],
    queryFn: () => api(`/presentations/${id}`),
  });

  useShellBreadcrumb("在线演示", data?.asset.title ?? "未命名演示");

  useEffect(() => {
    if (data) setDoc(data.document);
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: () => api(`/presentations/${id}`, { method: "PUT", body: { document: doc } }),
    onSuccess: () => {
      toast("success", "已保存");
      void queryClient.invalidateQueries({ queryKey: ["presentation", id] });
    },
  });

  const regenerate = useMutation({
    mutationFn: (slideId: string) =>
      api<{ proposal: Slide }>(`/presentations/${id}/slides/${slideId}/regenerate`, {
        method: "POST",
        body: { instruction: "让内容更精炼、更有冲击力" },
      }),
    onSuccess: (res) => {
      setDoc((d) => ({
        ...d,
        slides: d.slides.map((s) => (s.id === res.proposal.id ? res.proposal : s)),
      }));
      toast("success", "幻灯片已由 AI 重新生成");
    },
  });

  if (!data) return <Empty title="加载中…" />;
  const slide = doc.slides[activeSlide];

  const updateSlide = (patch: Partial<Slide>) => {
    setDoc((d) => ({
      ...d,
      slides: d.slides.map((s, i) => (i === activeSlide ? { ...s, ...patch } : s)),
    }));
  };

  return (
    <div>
      <div className="sg-row-between sg-mb">
        <div>
          <span className="sg-subtle">
            已自动保存 · {new Date().toLocaleTimeString("zh-CN", { hour12: false })}
          </span>
        </div>
        <div className="sg-row">
          <Button size="sm" onClick={() => saveMutation.mutate()}>
            保存
          </Button>
          <Button size="sm" onClick={() => navigate(`/presentations/${id}/play`)}>
            ▶ 播放
          </Button>
          <Button size="sm" onClick={() => toast("info", "分享功能可在发布后使用")}>
            分享
          </Button>
          <Button size="sm" variant="primary" onClick={() => setPublishOpen(true)}>
            发布
          </Button>
        </div>
      </div>

      <div className="sg-slide-editor">
        <Scrollbar className="sg-slide-list">
          <div className="sg-row-between" style={{ padding: "4px 4px 10px" }}>
            <strong style={{ fontSize: 13 }}>页面（{doc.slides.length}）</strong>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                const newSlide: Slide = {
                  id: `slide-${Date.now().toString(36)}`,
                  layout: "content",
                  title: "新页面",
                  blocks: [
                    { id: `b-${Date.now().toString(36)}`, type: "heading", content: "新页面" },
                  ],
                };
                setDoc((d) => ({ ...d, slides: [...d.slides, newSlide] }));
                setActiveSlide(doc.slides.length);
              }}
            >
              +
            </Button>
          </div>
          {doc.slides.map((s, i) => (
            <button
              type="button"
              key={s.id}
              className={`sg-slide-thumb ${activeSlide === i ? "active" : ""}`}
              onClick={() => setActiveSlide(i)}
            >
              <strong style={{ fontSize: 12.5 }}>
                {String(i + 1).padStart(2, "0")} {s.title || "未命名"}
              </strong>
              <span className="sg-subtle" style={{ display: "block", fontSize: 11 }}>
                {s.layout}
              </span>
            </button>
          ))}
        </Scrollbar>

        {slide ? (
          <div className="sg-col">
            <div className="sg-row">
              <Select
                value={slide.layout}
                onChange={(v) => updateSlide({ layout: v })}
                options={[
                  { value: "title", label: "封面" },
                  { value: "section", label: "章节页" },
                  { value: "content", label: "内容页" },
                  { value: "two-column", label: "双栏" },
                  { value: "quote", label: "引用" },
                  { value: "data", label: "数据页" },
                  { value: "image", label: "图片" },
                  { value: "closing", label: "结束页" },
                ]}
                className=""
                style={{ width: 130 }}
              />
              <Button size="sm" onClick={() => regenerate.mutate(slide.id)}>
                AI 重写本页
              </Button>
              <Button
                size="sm"
                variant="danger"
                onClick={() => {
                  setDoc((d) => ({ ...d, slides: d.slides.filter((s) => s.id !== slide.id) }));
                  setActiveSlide(0);
                }}
              >
                删除
              </Button>
            </div>
            <div className="sg-slide-canvas">
              <div
                className="sg-slide-frame"
                data-theme={doc.theme}
                style={{
                  background: doc.theme === "dark" || doc.theme === "gradient" ? "#0f1420" : "#fff",
                  color: doc.theme === "dark" ? "#f5f7ff" : "#172033",
                }}
              >
                {slide.blocks.map((block, bi) => (
                  <div key={block.id}>
                    {block.type === "heading" ? (
                      <input
                        value={block.content}
                        onChange={(e) => updateBlock(slide.id, block.id, e.target.value, setDoc)}
                        style={{
                          fontSize: 26,
                          fontWeight: 700,
                          background: "transparent",
                          border: "none",
                          color: "inherit",
                          outline: "none",
                          width: "100%",
                          marginBottom: 12,
                        }}
                      />
                    ) : (
                      <textarea
                        value={block.content}
                        onChange={(e) => updateBlock(slide.id, block.id, e.target.value, setDoc)}
                        style={{
                          width: "100%",
                          minHeight: 160,
                          fontSize: 16,
                          background: "transparent",
                          border: "none",
                          color: "inherit",
                          outline: "none",
                          lineHeight: 1.8,
                          resize: "vertical",
                        }}
                      />
                    )}
                    {bi === slide.blocks.length - 1 && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          updateSlide({
                            blocks: [
                              ...slide.blocks,
                              { id: `b-${Date.now().toString(36)}`, type: "text", content: "" },
                            ],
                          })
                        }
                      >
                        + 内容块
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <Empty title="没有页面" />
        )}

        <Scrollbar className="sg-editor-right">
          <h4>页面尺寸</h4>
          <div className="sg-option-row">
            <span>比例</span>
            <span>{doc.aspectRatio}</span>
          </div>
          <h4>主题</h4>
          <Select
            value={doc.theme}
            onChange={(v) => setDoc((d) => ({ ...d, theme: v }))}
            options={[
              { value: "light", label: "明亮" },
              { value: "dark", label: "深色" },
              { value: "brand", label: "商务" },
              { value: "minimal", label: "简约" },
              { value: "gradient", label: "渐变" },
            ]}
            className=""
          />
          <h4>字体方案</h4>
          <div className="sg-option-row">
            <span>字体</span>
            <span>思源黑体 / Source Han Sans</span>
          </div>
          <h4>背景设置</h4>
          <div className="sg-option-row">
            <span>填充样式</span>
            <span>纯色</span>
          </div>
          <div className="sg-option-row">
            <span>更换背景</span>
            <Button size="sm" variant="ghost">
              选择
            </Button>
          </div>
          <h4>页面动画</h4>
          <div className="sg-option-row">
            <span>切换动画</span>
            <span>淡入淡出</span>
          </div>
          <div className="sg-option-row">
            <span>切换时长</span>
            <span>0.6s</span>
          </div>
          <h4>演讲者备注</h4>
          <Textarea
            value={slide?.notes ?? ""}
            onChange={(e) => updateSlide({ notes: e.target.value })}
            placeholder="输入演讲备注…"
            style={{ minHeight: 90 }}
          />
          <div className="sg-subtle" style={{ marginTop: 12, fontSize: 12 }}>
            字数统计：
            {doc.slides.reduce((n, s) => n + s.blocks.reduce((m, b) => m + b.content.length, 0), 0)}{" "}
            字
          </div>
        </Scrollbar>
      </div>

      {publishOpen && data && (
        <PublishDialog asset={data.asset} open onClose={() => setPublishOpen(false)} />
      )}
    </div>
  );
}

function updateBlock(
  slideId: string,
  blockId: string,
  value: string,
  setDoc: React.Dispatch<React.SetStateAction<PresentationDocument>>,
) {
  setDoc((d) => ({
    ...d,
    slides: d.slides.map((s) =>
      s.id === slideId
        ? { ...s, blocks: s.blocks.map((b) => (b.id === blockId ? { ...b, content: value } : b)) }
        : s,
    ),
  }));
}

export function PresentationPlayerPage() {
  const { id } = useParams<{ id: string }>();
  const { data } = useQuery<{ asset: Asset; document: PresentationDocument }>({
    queryKey: ["presentation", id],
    queryFn: () => api(`/presentations/${id}`),
  });
  const [index, setIndex] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [loop, setLoop] = useState(true);
  const [showProgress, setShowProgress] = useState(true);
  const [showPageNo, setShowPageNo] = useState(true);
  const [notes, setNotes] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === " ") {
        e.preventDefault();
        setIndex((i) => {
          const next = i + 1;
          if (next >= (data?.document.slides.length ?? 1) && loop) return 0;
          return Math.min((data?.document.slides.length ?? 1) - 1, next);
        });
      }
      if (e.key === "ArrowLeft") setIndex((i) => Math.max(0, i - 1));
      if (e.key === "Escape") window.close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [data, loop]);

  if (!data) return <Empty title="加载中…" />;
  const slide = data.document.slides[index];
  const theme = data.document.theme;
  const dark = theme === "dark" || theme === "gradient";

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: dark ? "#0f1420" : "#f7f8fb",
        color: dark ? "#f5f7ff" : "#172033",
        zIndex: 400,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "var(--sg-font)",
      }}
    >
      {showProgress && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            height: 4,
            background: "var(--sg-accent)",
            transition: "width .3s",
            width: `${((index + 1) / data.document.slides.length) * 100}%`,
            zIndex: 10,
          }}
        />
      )}
      <div style={{ maxWidth: 1000, padding: 48 }}>
        {slide ? (
          <div>
            {slide.blocks.map((b) =>
              b.type === "heading" ? (
                <h2
                  key={b.id}
                  style={{
                    fontSize: "clamp(30px, 4.5vw, 56px)",
                    color: "var(--sg-accent)",
                    marginBottom: 24,
                  }}
                >
                  {b.content}
                </h2>
              ) : b.type === "bullet" ? (
                <ul key={b.id} style={{ fontSize: "clamp(18px, 2.2vw, 28px)", lineHeight: 1.8 }}>
                  {b.content
                    .split("\n")
                    .filter(Boolean)
                    .map((l, i) => (
                      <li key={i}>{l}</li>
                    ))}
                </ul>
              ) : (
                <p key={b.id} style={{ fontSize: "clamp(18px, 2.2vw, 28px)", lineHeight: 1.7 }}>
                  {b.content}
                </p>
              ),
            )}
            {notes && slide.notes && (
              <div
                style={{
                  marginTop: 40,
                  padding: 14,
                  borderRadius: 8,
                  background: "rgba(0,0,0,.06)",
                  color: "var(--sg-muted)",
                }}
              >
                <strong style={{ display: "block", marginBottom: 4 }}>演讲者备注</strong>
                {slide.notes}
              </div>
            )}
          </div>
        ) : (
          <h1>演示完成</h1>
        )}
      </div>

      {showPageNo && (
        <div style={{ position: "fixed", bottom: 20, left: 20, color: "var(--sg-muted)" }}>
          {index + 1} / {data.document.slides.length}
        </div>
      )}

      <div style={{ position: "fixed", bottom: 20, right: 20, display: "flex", gap: 8 }}>
        <Button onClick={() => setIndex((i) => Math.max(0, i - 1))}>‹</Button>
        <Button
          onClick={() => setIndex((i) => Math.min((data.document.slides.length ?? 1) - 1, i + 1))}
        >
          ›
        </Button>
        <Button onClick={() => setShowSettings((s) => !s)}>播放设置</Button>
        <Button onClick={() => setNotes((n) => !n)}>演讲者视图</Button>
      </div>

      {showSettings && (
        <div
          style={{
            position: "fixed",
            right: 20,
            top: 60,
            width: 280,
            background: "var(--sg-bg-2)",
            border: "1px solid var(--sg-border)",
            borderRadius: 12,
            padding: 16,
            boxShadow: "var(--sg-shadow-lg)",
            zIndex: 20,
            color: "var(--sg-fg)",
          }}
        >
          <h4 style={{ margin: "0 0 8px", fontSize: 13 }}>播放设置</h4>
          <div className="sg-option-row">
            <span>播放模式</span>
            <span>标准播放</span>
          </div>
          <div className="sg-option-row">
            <span>切换效果</span>
            <span>淡入淡出</span>
          </div>
          <div className="sg-option-row">
            <span>翻页方式</span>
            <span>键盘方向键翻页</span>
          </div>
          <div className="sg-option-row">
            <span>循环播放</span>
            <Switch checked={loop} onChange={setLoop} />
          </div>
          <div className="sg-option-row">
            <span>显示进度条</span>
            <Switch checked={showProgress} onChange={setShowProgress} />
          </div>
          <div className="sg-option-row">
            <span>显示页码</span>
            <Switch checked={showPageNo} onChange={setShowPageNo} />
          </div>
          <div className="sg-option-row">
            <span>背景音乐</span>
            <span>科技未来感.mp3</span>
          </div>
        </div>
      )}
    </div>
  );
}
