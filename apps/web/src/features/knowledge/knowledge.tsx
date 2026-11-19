import { Empty, Field, formatRelative, Loading, StatusBadge, useToast } from "@shiguang/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { MenuProps } from "antd";
import { Button, Card, Dropdown, Input, Select, Tabs } from "antd";
import { createStyles } from "antd-style";
import {
  BarChart3,
  BookOpen,
  ChevronRight,
  Code2,
  Database,
  FileText,
  Globe,
  HelpCircle,
  MoreHorizontal,
  Plus,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Star,
  Upload,
  Users,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  type Asset,
  api,
  type KnowledgeBase,
  type KnowledgeSource,
  uploadFile,
} from "../../entities/api.js";
import { AppPagination } from "../../shared/AppPagination.js";
import { Markdown } from "../../shared/markdown.js";

type KnowledgeScope = "mine" | "team" | "public";

const useKnowledgeDetailStyles = createStyles(({ token }) => ({
  newDescription: {
    minHeight: 90,
  },
  askLayout: {
    gridTemplateColumns: "2fr 1fr",
    "@media (max-width: 760px)": { gridTemplateColumns: "1fr" },
  },
  citation: {
    marginTop: 8,
    padding: 12,
  },
  citationExcerpt: {
    margin: "6px 0 0",
  },
  resultHeading: {
    margin: "6px 0 0",
  },
  resultText: {
    margin: "8px 0 0",
  },
  sourceType: {
    width: 140,
  },
  sourceGrow: {
    flex: 1,
  },
  sourceError: {
    color: token.colorError,
    margin: "6px 0 0",
  },
}));

type KnowledgeListItem = KnowledgeBase & {
  accent: "violet" | "sky" | "emerald" | "amber" | "rose" | "indigo";
  category: "document" | "technical" | "analysis" | "feedback" | "internal";
  ownerNames: string[];
  visibility: "available" | "restricted";
  storageLabel: string;
  citations: number;
  teamName: string;
  scope: KnowledgeScope;
  demo?: boolean;
};

const AVATAR_BG = ["#6366F1", "#EC4899", "#0EA5E9", "#10B981", "#F59E0B", "#64748B"];

const DEMO_KNOWLEDGE_BASES: KnowledgeListItem[] = [
  {
    id: "demo-vietnam-finance",
    workspaceId: "demo",
    name: "越南消费金融市场研究",
    description: "越南消费金融行业的市场规模、竞争格局、持牌头部机构对比与监管演进研究。",
    status: "ready",
    sourceCount: 128,
    chunkCount: 3246,
    createdAt: "2026-05-10T09:30:00+08:00",
    updatedAt: "2026-05-20T14:30:00+08:00",
    accent: "violet",
    category: "document",
    ownerNames: ["张伟", "李然", "+2"],
    visibility: "available",
    storageLabel: "2.34 GB",
    citations: 3842,
    teamName: "市场研究组",
    scope: "mine",
    demo: true,
  },
  {
    id: "demo-product",
    workspaceId: "demo",
    name: "公司产品知识库",
    description: "核心产品架构文档、功能说明、发布说明与常见问题等结构化资料沉淀。",
    status: "ready",
    sourceCount: 96,
    chunkCount: 2180,
    createdAt: "2026-04-12T10:00:00+08:00",
    updatedAt: "2026-05-19T16:20:00+08:00",
    accent: "sky",
    category: "document",
    ownerNames: ["周宁", "林知夏", "+5"],
    visibility: "available",
    storageLabel: "1.86 GB",
    citations: 4120,
    teamName: "产品团队",
    scope: "mine",
    demo: true,
  },
  {
    id: "demo-technical",
    workspaceId: "demo",
    name: "技术文档与工程规范",
    description: "前后端开发规范、API 契约、技术架构评审方案与线上排障手册库。",
    status: "ready",
    sourceCount: 84,
    chunkCount: 1924,
    createdAt: "2026-03-18T09:00:00+08:00",
    updatedAt: "2026-05-18T10:15:00+08:00",
    accent: "emerald",
    category: "technical",
    ownerNames: ["陈默", "张伟", "+3"],
    visibility: "available",
    storageLabel: "1.42 GB",
    citations: 1980,
    teamName: "研发架构组",
    scope: "mine",
    demo: true,
  },
  {
    id: "demo-competitors",
    workspaceId: "demo",
    name: "竞品分析资料库",
    description: "东南亚与全球 AI 知识工具的产品体验拆解、定价策略与商业化壁垒对比。",
    status: "ready",
    sourceCount: 54,
    chunkCount: 1680,
    createdAt: "2026-03-06T09:00:00+08:00",
    updatedAt: "2026-05-17T09:40:00+08:00",
    accent: "amber",
    category: "analysis",
    ownerNames: ["林知夏", "李然"],
    visibility: "available",
    storageLabel: "1.18 GB",
    citations: 960,
    teamName: "战略分析组",
    scope: "mine",
    demo: true,
  },
  {
    id: "demo-feedback",
    workspaceId: "demo",
    name: "客户访谈与需求洞察",
    description: "深度用户访谈录音纪要、核心痛点清单、场景画像与需求验证结论沉淀。",
    status: "ready",
    sourceCount: 40,
    chunkCount: 856,
    createdAt: "2026-02-22T09:00:00+08:00",
    updatedAt: "2026-05-16T18:30:00+08:00",
    accent: "rose",
    category: "feedback",
    ownerNames: ["张伟"],
    visibility: "available",
    storageLabel: "820 MB",
    citations: 518,
    teamName: "用户研究组",
    scope: "mine",
    demo: true,
  },
  {
    id: "demo-internal",
    workspaceId: "demo",
    name: "东南亚宏观与央行年报库",
    description: "越南 SBV、印尼 OJK 等监管机构公开年报、征信渗透率统计与行业白皮书。",
    status: "ready",
    sourceCount: 62,
    chunkCount: 1088,
    createdAt: "2026-01-16T09:00:00+08:00",
    updatedAt: "2026-05-15T11:20:00+08:00",
    accent: "indigo",
    category: "internal",
    ownerNames: ["张伟", "周宁"],
    visibility: "available",
    storageLabel: "960 MB",
    citations: 1290,
    teamName: "宏观研究组",
    scope: "mine",
    demo: true,
  },
];

const CATEGORY_ICON = {
  document: BookOpen,
  technical: Code2,
  analysis: BarChart3,
  feedback: Users,
  internal: Globe,
} as const;

function knowledgeDate(iso: string): string {
  return new Date(iso).toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function toKnowledgeListItem(kb: KnowledgeBase, index: number): KnowledgeListItem {
  const accents: KnowledgeListItem["accent"][] = [
    "violet",
    "sky",
    "emerald",
    "amber",
    "rose",
    "indigo",
  ];
  return {
    ...kb,
    accent: accents[index % accents.length],
    category: "document",
    ownerNames: ["我"],
    visibility: ["failed", "error", "disabled", "restricted"].includes(kb.status)
      ? "restricted"
      : "available",
    storageLabel: "--",
    citations: 0,
    teamName: "当前工作区",
    scope: "mine",
  };
}

function KnowledgeMoreMenu({
  item,
  onAction,
}: {
  item: KnowledgeListItem;
  onAction: (
    item: KnowledgeListItem,
    action: "open" | "documents" | "new-document" | "copy",
  ) => void;
}) {
  const [open, setOpen] = useState(false);
  const menu: MenuProps = {
    items: [
      { key: "open", label: "打开知识库" },
      { key: "documents", label: "查看文档" },
      { key: "new-document", label: "新建关联文档" },
      { key: "copy", label: "复制链接" },
    ],
    onClick: ({ key, domEvent }) => {
      domEvent.stopPropagation();
      setOpen(false);
      if (key === "open" || key === "documents" || key === "new-document" || key === "copy") {
        onAction(item, key);
      }
    },
  };

  return (
    <Dropdown
      trigger={["click"]}
      placement="bottomRight"
      open={open}
      onOpenChange={setOpen}
      menu={menu}
    >
      <Button
        size="small"
        type="text"
        className="sg-list-action-btn"
        aria-label="更多操作"
        title="更多操作"
        onClick={(event) => event.stopPropagation()}
      >
        <MoreHorizontal size={15} />
      </Button>
    </Dropdown>
  );
}

export function KnowledgePage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [scope, setScope] = useState<KnowledgeScope>("mine");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState("overview");
  const [quickQuestion, setQuickQuestion] = useState("");
  const [quickAnswer, setQuickAnswer] = useState("");

  const { data, isLoading } = useQuery<KnowledgeBase[]>({
    queryKey: ["knowledge"],
    queryFn: () => api<KnowledgeBase[]>("/knowledge-bases"),
  });

  const demoMode = import.meta.env.DEV && (data?.length ?? 0) === 0;
  const all = useMemo<KnowledgeListItem[]>(
    () => (demoMode ? DEMO_KNOWLEDGE_BASES : (data ?? []).map(toKnowledgeListItem)),
    [data, demoMode],
  );
  const filtered = useMemo(
    () =>
      all
        .filter((item) => item.scope === scope)
        .filter((item) =>
          query.trim()
            ? `${item.name} ${item.description}`.toLowerCase().includes(query.trim().toLowerCase())
            : true,
        )
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()),
    [all, query, scope],
  );

  const pageSize = 6;
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paged = useMemo(
    () => filtered.slice((page - 1) * pageSize, page * pageSize),
    [filtered, page],
  );

  useEffect(() => setPage(1), [query, scope]);
  useEffect(() => setPage((current) => Math.min(current, pageCount)), [pageCount]);
  useEffect(() => {
    if (filtered.length === 0) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !filtered.some((item) => item.id === selectedId)) {
      setSelectedId(filtered[0].id);
    }
  }, [filtered, selectedId]);

  const selected = all.find((item) => item.id === selectedId) ?? null;
  const { data: liveDetail } = useQuery<KnowledgeBase & { sources: KnowledgeSource[] }>({
    queryKey: ["knowledge", "overview", selectedId],
    queryFn: () => api(`/knowledge-bases/${selectedId}`),
    enabled: Boolean(selectedId && !selected?.demo),
  });

  const selectedSources = selected?.demo
    ? [
        { id: "demo-pdf", title: "越南消费金融市场规模与趋势.pdf", sourceType: "upload" },
        { id: "demo-xlsx", title: "头部消金机构财务对比矩阵.xlsx", sourceType: "upload" },
        { id: "demo-docx", title: "SBV 零售信贷监管政策解读.docx", sourceType: "asset" },
      ]
    : (liveDetail?.sources ?? []);

  const quickAskMutation = useMutation({
    mutationFn: async (qText: string) => {
      if (!selected) throw new Error("未选择知识库");
      if (selected.demo) {
        return {
          answer: `根据《${selectedSources[0]?.title ?? selected.name}》：头部持牌机构合计占据约 67% 份额，征信交叉核验后不良率已回落 1.8% [1]。`,
        };
      }
      return api<{ answer: string }>(`/knowledge-bases/${selected.id}/ask`, {
        method: "POST",
        body: { query: qText, topK: 4 },
      });
    },
    onSuccess: (res) => {
      setQuickAnswer(res.answer);
    },
    onError: (err: Error) => toast("error", err.message),
  });

  const summaryMetrics = useMemo(() => {
    if (demoMode) {
      return { spaces: "28", docs: "402", cites: "11,420" };
    }
    return {
      spaces: String(all.length),
      docs: String(all.reduce((sum, item) => sum + item.sourceCount, 0)),
      cites: all.reduce((sum, item) => sum + item.citations, 0).toLocaleString("zh-CN"),
    };
  }, [all, demoMode]);

  const openSelected = () => {
    if (!selected) return;
    if (selected.demo) {
      toast("info", "这是开发环境演示数据，创建真实知识库后即可进入完整问答与资料管理台");
      return;
    }
    navigate(`/knowledge/${selected.id}`);
  };

  const handleKnowledgeMenuAction = async (
    item: KnowledgeListItem,
    action: "open" | "documents" | "new-document" | "copy",
  ) => {
    if (action === "open") {
      setSelectedId(item.id);
      if (item.demo) {
        toast("info", "这是开发环境演示数据，创建知识库后即可管理真实资料");
      } else {
        navigate(`/knowledge/${item.id}`);
      }
      return;
    }
    if (action === "documents") {
      setSelectedId(item.id);
      setDetailTab("documents");
      return;
    }
    if (action === "new-document") {
      navigate(`/documents/new?knowledgeBaseId=${item.id}`);
      return;
    }
    const link = `${window.location.origin}/knowledge/${item.id}`;
    try {
      await navigator.clipboard?.writeText(link);
      toast("success", "知识库链接已复制");
    } catch {
      toast("error", "复制链接失败");
    }
  };

  return (
    <div className="zx-kb-studio">
      <div className="zx-kb-top">
        <div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 14, flexWrap: "wrap" }}>
            <h1>知识库</h1>
            <span className="zx-whisper-metrics tabular">
              已沉淀 <b>{summaryMetrics.spaces}</b> 座空间 · <b>{summaryMetrics.docs}</b> 篇源文档 ·
              累计 <b>{summaryMetrics.cites}</b> 次溯源引用
            </span>
          </div>
          <p className="zx-studio-sub">
            把多源文档、研报与网页沉淀为可溯源 AI 笔记本，随时发起 Citation 问答
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <button
            type="button"
            className="zx-btn-glass"
            onClick={() =>
              toast("info", "将文档、文件或网页导入知识库后，即可进行检索与 Citation 溯源问答")
            }
          >
            <HelpCircle size={14} /> 使用指南
          </button>
          <button type="button" className="zx-btn-cta" onClick={() => navigate("/knowledge/new")}>
            <Plus size={15} strokeWidth={2.3} /> 新建知识库
          </button>
        </div>
      </div>

      {isLoading && !demoMode ? (
        <Loading loading minHeight={320} />
      ) : (
        <div className="zx-kb-split">
          <div className="zx-kb-shelf-col">
            <div className="zx-kb-filter-row">
              <div className="zx-seg-tabs" role="tablist" aria-label="知识库范围">
                {(
                  [
                    ["mine", "我的知识库"],
                    ["team", "团队共享"],
                    ["public", "公开空间"],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    aria-selected={scope === id}
                    className={`zx-seg-tab ${scope === id ? "active" : ""}`}
                    onClick={() => setScope(id)}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="zx-doc-search-pill" style={{ width: 232 }}>
                <Search size={14} />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="搜索知识库名称…"
                  aria-label="搜索知识库"
                />
                {query && (
                  <button
                    type="button"
                    style={{
                      border: 0,
                      background: "transparent",
                      color: "var(--sg-muted)",
                      cursor: "pointer",
                      padding: 0,
                      display: "flex",
                    }}
                    onClick={() => setQuery("")}
                    aria-label="清空搜索"
                  >
                    <X size={13} />
                  </button>
                )}
              </div>
            </div>

            {paged.length === 0 ? (
              <Empty
                title="没有匹配的知识库"
                hint="调整筛选条件，或右上角新建一座知识空间。"
                action={
                  <button
                    type="button"
                    className="zx-btn-cta"
                    onClick={() => navigate("/knowledge/new")}
                  >
                    <Plus size={15} /> 新建知识库
                  </button>
                }
              />
            ) : (
              <div className="zx-notebook-grid">
                {paged.map((item) => {
                  const Icon = CATEGORY_ICON[item.category];
                  const isSelected = selectedId === item.id;
                  return (
                    <article
                      key={item.id}
                      className={`zx-nb-card ${isSelected ? "selected" : ""}`}
                      onClick={() => {
                        setSelectedId(item.id);
                        setQuickAnswer("");
                      }}
                      onDoubleClick={() => {
                        if (!item.demo) navigate(`/knowledge/${item.id}`);
                      }}
                    >
                      <div>
                        <div className="zx-nb-head">
                          <span
                            className={`zx-jewel ${item.accent}`}
                            style={{ width: 42, height: 42, borderRadius: 13 }}
                          >
                            <Icon size={18} strokeWidth={1.9} />
                          </span>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <span
                              className={`zx-pill ${item.visibility === "available" ? "emerald" : "amber"}`}
                            >
                              ● {item.visibility === "available" ? "可用" : "仅团队可见"}
                            </span>
                            <KnowledgeMoreMenu item={item} onAction={handleKnowledgeMenuAction} />
                          </div>
                        </div>

                        <div className="zx-nb-title">
                          <span>{item.name}</span>
                          {item.name.includes("越南") && (
                            <Star
                              size={13.5}
                              fill="#F59E0B"
                              color="#F59E0B"
                              style={{ flexShrink: 0 }}
                            />
                          )}
                        </div>
                        <p className="zx-nb-desc">{item.description || "暂无描述"}</p>
                      </div>

                      <div className="zx-nb-foot tabular">
                        <div className="zx-av-group">
                          {item.ownerNames.map((owner, idx) => (
                            <span
                              key={owner}
                              className="zx-avatar-xs"
                              style={{
                                background: owner.startsWith("+")
                                  ? "#475569"
                                  : AVATAR_BG[idx % AVATAR_BG.length],
                                border: "2px solid var(--zx-canvas-solid)",
                              }}
                            >
                              {owner.startsWith("+") ? owner : owner.slice(0, 1)}
                            </span>
                          ))}
                        </div>
                        <span>
                          {item.sourceCount} 篇文档 · {item.citations.toLocaleString("zh-CN")}{" "}
                          次引用
                        </span>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}

            {filtered.length > pageSize && (
              <AppPagination
                total={filtered.length}
                current={page}
                pageSize={pageSize}
                onChange={setPage}
              />
            )}
          </div>

          <aside className="zx-kb-inspector" aria-label="知识库详情">
            {selected ? (
              <>
                <div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 8,
                    }}
                  >
                    <div
                      style={{
                        fontSize: 17,
                        fontWeight: 760,
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        minWidth: 0,
                      }}
                    >
                      <span
                        style={{
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {selected.name}
                      </span>
                      {selected.name.includes("越南") && (
                        <Star size={14} fill="#F59E0B" color="#F59E0B" style={{ flexShrink: 0 }} />
                      )}
                    </div>
                    <button
                      type="button"
                      className="sg-list-action-btn"
                      style={{
                        border: 0,
                        background: "transparent",
                        color: "var(--sg-muted)",
                        cursor: "pointer",
                      }}
                      onClick={openSelected}
                      title="进入知识库管理"
                    >
                      <MoreHorizontal size={16} />
                    </button>
                  </div>

                  <div className="zx-kb-subtabs">
                    {(
                      [
                        ["overview", "概览"],
                        ["documents", `文档 (${selected.sourceCount})`],
                        ["permissions", "权限"],
                        ["settings", "设置"],
                        ["activity", "日志"],
                      ] as const
                    ).map(([id, label]) => (
                      <button
                        key={id}
                        type="button"
                        className={`zx-kb-subtab ${detailTab === id ? "active" : ""}`}
                        onClick={() => setDetailTab(id)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  {detailTab === "overview" && (
                    <>
                      <div className="zx-ask-box">
                        <div
                          style={{
                            fontSize: 12.5,
                            fontWeight: 700,
                            color: "var(--sg-fg)",
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                          }}
                        >
                          <Sparkles size={14} color="#C084FC" />
                          基于 {selected.chunkCount.toLocaleString("zh-CN")} 个索引分块溯源问答
                        </div>
                        <form
                          className="zx-ask-form"
                          onSubmit={(e) => {
                            e.preventDefault();
                            const text = quickQuestion.trim() || "核心竞争格局与市场份额";
                            quickAskMutation.mutate(text);
                          }}
                        >
                          <input
                            value={quickQuestion}
                            onChange={(e) => setQuickQuestion(e.target.value)}
                            placeholder="向该知识库提问，支持精确引用标注…"
                            aria-label="向知识库提问"
                          />
                          <button
                            type="submit"
                            className="zx-ask-submit"
                            disabled={quickAskMutation.isPending}
                          >
                            {quickAskMutation.isPending ? "…" : "Ask"}
                          </button>
                        </form>
                        {quickAnswer && <div className="zx-ask-answer">{quickAnswer}</div>}
                      </div>

                      <div className="zx-chip-4 tabular">
                        <div className="zx-stat-chip">
                          <small>文档数量 / 大小</small>
                          <strong>
                            {selected.sourceCount} 篇 · {selected.storageLabel}
                          </strong>
                        </div>
                        <div className="zx-stat-chip">
                          <small>被引用 / 分块</small>
                          <strong>
                            {selected.citations.toLocaleString("zh-CN")} 次 ·{" "}
                            {selected.chunkCount.toLocaleString("zh-CN")}
                          </strong>
                        </div>
                        <div className="zx-stat-chip">
                          <small>负责人</small>
                          <strong>
                            {selected.ownerNames[0]} · {selected.teamName}
                          </strong>
                        </div>
                        <div className="zx-stat-chip">
                          <small>最近同步</small>
                          <strong>{knowledgeDate(selected.updatedAt)}</strong>
                        </div>
                      </div>

                      <div style={{ marginTop: 16 }}>
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            fontSize: 12.5,
                            fontWeight: 700,
                          }}
                        >
                          <span>源文档构成</span>
                          <span
                            style={{ fontWeight: 500, color: "var(--sg-muted)" }}
                            className="tabular"
                          >
                            PDF 35% · Word 25% · 表格/PPT 28%
                          </span>
                        </div>
                        <div className="zx-dist-bar">
                          <i style={{ width: "35%", background: "#6366F1" }} />
                          <i style={{ width: "25%", background: "#0EA5E9" }} />
                          <i style={{ width: "16%", background: "#10B981" }} />
                          <i style={{ width: "12%", background: "#A855F7" }} />
                          <i style={{ width: "12%", background: "#F59E0B" }} />
                        </div>
                      </div>

                      <div style={{ marginTop: 14 }}>
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            fontSize: 12.5,
                            fontWeight: 700,
                            marginBottom: 4,
                          }}
                        >
                          <span>最近收录文档</span>
                          <button
                            type="button"
                            style={{
                              border: 0,
                              background: "transparent",
                              color: "var(--zx-brand)",
                              fontSize: 12,
                              cursor: "pointer",
                              padding: 0,
                            }}
                            onClick={() => setDetailTab("documents")}
                          >
                            全部 →
                          </button>
                        </div>
                        {selectedSources.slice(0, 3).map((source, index) => {
                          const tones = ["rose", "emerald", "sky"] as const;
                          return (
                            <button
                              key={source.id}
                              type="button"
                              className="zx-src-item"
                              onClick={openSelected}
                            >
                              <span
                                className={`zx-jewel ${tones[index % 3]}`}
                                style={{ width: 26, height: 26, borderRadius: 7 }}
                              >
                                {index === 1 ? <Database size={13} /> : <FileText size={13} />}
                              </span>
                              <span
                                style={{
                                  flex: 1,
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {source.title}
                              </span>
                              <span
                                style={{ color: "var(--sg-muted)", fontSize: 11.5 }}
                                className="tabular"
                              >
                                {index === 0 ? "14:30" : index === 1 ? "昨天" : "05-16"}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </>
                  )}

                  {detailTab === "documents" && (
                    <div style={{ paddingTop: 10 }}>
                      {selectedSources.length ? (
                        selectedSources.map((source) => (
                          <button
                            type="button"
                            key={source.id}
                            className="zx-src-item"
                            onClick={openSelected}
                          >
                            <span
                              className="zx-jewel indigo"
                              style={{ width: 28, height: 28, borderRadius: 8 }}
                            >
                              <FileText size={14} />
                            </span>
                            <span
                              style={{
                                flex: 1,
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {source.title}
                            </span>
                            <ChevronRight size={14} color="var(--sg-muted)" />
                          </button>
                        ))
                      ) : (
                        <p
                          style={{
                            color: "var(--sg-muted)",
                            fontSize: 12.5,
                            padding: "24px 0",
                            textAlign: "center",
                          }}
                        >
                          还没有导入源文档
                        </p>
                      )}
                    </div>
                  )}

                  {detailTab === "permissions" && (
                    <div
                      style={{
                        padding: "36px 12px",
                        textAlign: "center",
                        color: "var(--sg-muted)",
                      }}
                    >
                      <ShieldCheck size={28} color="#C084FC" style={{ marginBottom: 8 }} />
                      <strong style={{ display: "block", color: "var(--sg-fg)", fontSize: 13.5 }}>
                        权限管理
                      </strong>
                      <p style={{ fontSize: 12.5, margin: "6px 0 14px" }}>
                        {selected.visibility === "available"
                          ? "当前工作区成员均可检索与引用此知识库。"
                          : "仅指定团队成员可以访问。"}
                      </p>
                      <button type="button" className="zx-btn-glass" onClick={openSelected}>
                        管理权限
                      </button>
                    </div>
                  )}

                  {detailTab === "settings" && (
                    <div
                      style={{
                        padding: "36px 12px",
                        textAlign: "center",
                        color: "var(--sg-muted)",
                      }}
                    >
                      <SlidersHorizontal size={28} color="#C084FC" style={{ marginBottom: 8 }} />
                      <strong style={{ display: "block", color: "var(--sg-fg)", fontSize: 13.5 }}>
                        知识库设置
                      </strong>
                      <p style={{ fontSize: 12.5, margin: "6px 0 14px" }}>
                        管理名称、描述、分块索引策略与同步状态。
                      </p>
                      <button type="button" className="zx-btn-glass" onClick={openSelected}>
                        进入设置
                      </button>
                    </div>
                  )}

                  {detailTab === "activity" && (
                    <div
                      style={{
                        paddingTop: 12,
                        display: "flex",
                        flexDirection: "column",
                        gap: 10,
                        fontSize: 12.5,
                      }}
                    >
                      <div className="zx-stat-chip">
                        <strong style={{ fontSize: 13 }}>更新了向量与分块索引</strong>
                        <small style={{ marginTop: 3 }}>{formatRelative(selected.updatedAt)}</small>
                      </div>
                      <div className="zx-stat-chip">
                        <strong style={{ fontSize: 13 }}>
                          导入了 {selected.sourceCount} 篇源文档
                        </strong>
                        <small style={{ marginTop: 3 }}>{knowledgeDate(selected.createdAt)}</small>
                      </div>
                    </div>
                  )}
                </div>

                <div
                  style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 8 }}
                >
                  <button type="button" className="zx-btn-glass" onClick={openSelected}>
                    <Upload size={14} /> 导入文档
                  </button>
                  <button type="button" className="zx-btn-cta" onClick={openSelected}>
                    <Sparkles size={14} /> 进入问答台
                  </button>
                </div>
              </>
            ) : (
              <div style={{ padding: "80px 16px", textAlign: "center", color: "var(--sg-muted)" }}>
                <BookOpen size={40} style={{ marginBottom: 10, opacity: 0.6 }} />
                <strong style={{ display: "block", color: "var(--sg-fg)" }}>选择一个知识库</strong>
                <span style={{ fontSize: 12.5 }}>查看索引概览并发起溯源问答</span>
              </div>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}

export function KnowledgeNewPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const { styles } = useKnowledgeDetailStyles();
  const mutation = useMutation({
    mutationFn: () =>
      api<KnowledgeBase>("/knowledge-bases", { method: "POST", body: { name, description } }),
    onSuccess: (kb) => {
      toast("success", "知识库已创建");
      navigate(`/knowledge/${kb.id}`);
    },
  });
  return (
    <div className="sg-workflow-page sg-form-workflow">
      <h1 className="sg-h1 sg-mb">新建知识库</h1>
      <Card>
        <Field label="名称" hint="例如：越南消费金融市场资料库">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="知识库名称" />
        </Field>
        <Field label="描述（可选）">
          <Input.TextArea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="这个知识库用来做什么？"
            className={styles.newDescription}
          />
        </Field>
        <Button type="primary" disabled={!name.trim()} onClick={() => mutation.mutate()}>
          创建
        </Button>
      </Card>
    </div>
  );
}

export function KnowledgeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState("ask");
  const [sourceType, setSourceType] = useState("asset");
  const [assetId, setAssetId] = useState("");
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [askQuery, setAskQuery] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const { styles } = useKnowledgeDetailStyles();

  const { data: kb } = useQuery<KnowledgeBase & { sources: KnowledgeSource[] }>({
    queryKey: ["knowledge", id],
    queryFn: () => api(`/knowledge-bases/${id}`),
  });
  const { data: assets } = useQuery<{ items: Asset[] }>({
    queryKey: ["assets"],
    queryFn: () => api("/assets", { params: { limit: 50 } }),
  });
  const { data: searchResults } = useQuery<
    Array<{
      chunk: { text: string; headingPath: string; ordinal: number };
      source: KnowledgeSource;
      score: number;
    }>
  >({
    queryKey: ["knowledge-search", id, searchQuery],
    queryFn: () =>
      api(`/knowledge-bases/${id}/search`, {
        method: "POST",
        body: { query: searchQuery, limit: 10 },
      }),
    enabled: searchQuery.trim().length > 0,
  });
  const { data: askResult } = useQuery<{
    answer: string;
    insufficient: boolean;
    citations: Array<{ index: number; sourceTitle: string; excerpt: string; headingPath: string }>;
  }>({
    queryKey: ["knowledge-ask", id, askQuery],
    queryFn: () =>
      api(`/knowledge-bases/${id}/ask`, { method: "POST", body: { query: askQuery, topK: 6 } }),
    enabled: askQuery.trim().length > 0,
  });

  const addSource = useMutation({
    mutationFn: async () => {
      if (sourceType === "upload" && file) {
        return uploadFile<KnowledgeSource>(`/knowledge-bases/${id}/sources`, file);
      }
      if (sourceType === "url") {
        return api<KnowledgeSource>(`/knowledge-bases/${id}/sources`, {
          method: "POST",
          body: { sourceType: "url", url },
        });
      }
      return api<KnowledgeSource>(`/knowledge-bases/${id}/sources`, {
        method: "POST",
        body: { sourceType: "asset", assetId },
      });
    },
    onSuccess: () => {
      toast("success", "来源已添加，正在后台解析索引");
      setFile(null);
      setUrl("");
      setAssetId("");
      void queryClient.invalidateQueries({ queryKey: ["knowledge", id] });
    },
    onError: (e: Error) => toast("error", e.message),
  });

  const retrySource = useMutation({
    mutationFn: (sid: string) =>
      api(`/knowledge-bases/${id}/sources/${sid}/retry`, { method: "POST" }),
    onSuccess: () => {
      toast("success", "已重新加入队列");
      void queryClient.invalidateQueries({ queryKey: ["knowledge", id] });
    },
  });

  const removeSource = useMutation({
    mutationFn: (sid: string) => api(`/knowledge-bases/${id}/sources/${sid}`, { method: "DELETE" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["knowledge", id] });
    },
  });

  if (!kb) return <Loading loading />;

  return (
    <div>
      <div className="sg-row-between sg-mb">
        <div>
          <h1 className="sg-h1">{kb.name}</h1>
          <p className="sg-subtle">
            {kb.description} · {kb.sourceCount} 个来源 · {kb.chunkCount} 个分块
          </p>
        </div>
        <Button type="primary" onClick={() => setTab("sources")}>
          + 添加来源
        </Button>
      </div>

      <Tabs
        items={[
          { key: "ask", label: "Ask 问答" },
          { key: "search", label: "搜索资料" },
          { key: "sources", label: `资料管理 (${kb.sourceCount})` },
        ]}
        activeKey={tab}
        onChange={setTab}
      />

      {tab === "ask" && (
        <div className={`sg-grid ${styles.askLayout}`}>
          <Card>
            <div className="sg-row">
              <Input
                value={askQuery}
                onChange={(e) => setAskQuery(e.target.value)}
                placeholder="基于知识库提问，例如：越南消费金融的主要玩家有哪些？"
              />
              <Button
                type="primary"
                onClick={() => setAskQuery(askQuery)}
                disabled={!askQuery.trim()}
              >
                提问
              </Button>
            </div>
            {askResult && (
              <div className="sg-mt">
                <Markdown source={askResult.answer} />
                {askResult.insufficient && (
                  <p className="sg-hint">当前资料不足以回答，建议补充来源。</p>
                )}
                {askResult.citations.length > 0 && (
                  <div className="sg-mt">
                    <strong className="sg-h3">引用来源</strong>
                    {askResult.citations.map((c) => (
                      <div key={c.index} className={`sg-card ${styles.citation}`}>
                        <div className="sg-row">
                          <span className="sg-badge sg-badge-accent">[{c.index}]</span>
                          <strong>{c.sourceTitle}</strong>
                        </div>
                        <p className={`sg-subtle ${styles.citationExcerpt}`}>
                          {c.headingPath || "正文"} · {c.excerpt.slice(0, 120)}…
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </Card>
          <Card>
            <h3 className="sg-h3">使用建议</h3>
            <ul className="sg-subtle">
              <li>问题越具体，答案越准确。</li>
              <li>点击引用可定位到原文片段。</li>
              <li>没有足够依据时会明确说明。</li>
            </ul>
          </Card>
        </div>
      )}

      {tab === "search" && (
        <Card>
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="输入关键词检索资料…"
          />
          {searchResults && (
            <div className="sg-col sg-mt">
              {searchResults.map((r) => (
                <div key={r.chunk.ordinal + r.source.id} className="sg-card">
                  <div className="sg-row-between">
                    <strong>{r.source.title}</strong>
                    <span className="sg-subtle">相关度 {(1 - r.score).toFixed(2)}</span>
                  </div>
                  <p className={`sg-subtle ${styles.resultHeading}`}>{r.chunk.headingPath}</p>
                  <p className={styles.resultText}>{r.chunk.text.slice(0, 300)}…</p>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {tab === "sources" && (
        <div className="sg-col">
          <Card>
            <div className="sg-row sg-mb">
              <Select
                value={sourceType}
                onChange={setSourceType}
                options={[
                  { value: "asset", label: "已有资产" },
                  { value: "upload", label: "上传文件" },
                  { value: "url", label: "URL 抓取" },
                ]}
                className={styles.sourceType}
              />
              {sourceType === "asset" && (
                <Select
                  value={assetId}
                  onChange={setAssetId}
                  options={[
                    { value: "", label: "选择资产…" },
                    ...(assets?.items ?? []).map((a) => ({
                      value: a.id,
                      label: `${a.title} (${a.type})`,
                    })),
                  ]}
                  className={styles.sourceGrow}
                />
              )}
              {sourceType === "url" && (
                <Input
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://…"
                  className={styles.sourceGrow}
                />
              )}
              {sourceType === "upload" && (
                <input
                  type="file"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  className={styles.sourceGrow}
                />
              )}
              <Button
                type="primary"
                disabled={addSource.isPending}
                onClick={() => addSource.mutate()}
              >
                添加
              </Button>
            </div>
          </Card>

          {(kb.sources?.length ?? 0) === 0 ? (
            <Empty title="还没有来源" hint="添加文档、文件或 URL，解析完成后即可搜索和 Ask。" />
          ) : (
            kb.sources?.map((s) => (
              <Card key={s.id}>
                <div className="sg-row-between">
                  <div>
                    <strong>{s.title}</strong>
                    <div className="sg-row sg-mt-sm">
                      <StatusBadge status={s.status} />
                      <span className="sg-badge">{s.sourceType}</span>
                      {s.chunkCount > 0 && (
                        <span className="sg-badge sg-badge-accent">{s.chunkCount} 分块</span>
                      )}
                    </div>
                    {s.error && <p className={`sg-subtle ${styles.sourceError}`}>{s.error}</p>}
                  </div>
                  <div className="sg-row">
                    {s.status === "failed" && (
                      <Button size="small" onClick={() => retrySource.mutate(s.id)}>
                        重试
                      </Button>
                    )}
                    <Button
                      size="small"
                      type="primary"
                      danger
                      onClick={() => removeSource.mutate(s.id)}
                    >
                      移除
                    </Button>
                  </div>
                </div>
              </Card>
            ))
          )}
        </div>
      )}
    </div>
  );
}
