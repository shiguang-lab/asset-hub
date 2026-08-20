import { Avatar, Empty, Field, formatRelative, StatusBadge, useToast } from "@shiguang/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Card, Input, Select, Tabs } from "antd";
import {
  BarChart3,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Code2,
  Database,
  FileText,
  Folder,
  Grid2X2,
  HelpCircle,
  List,
  Lock,
  MoreHorizontal,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Star,
  Users,
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
import { Markdown } from "../../shared/markdown.js";

type KnowledgeScope = "mine" | "team" | "public";
type KnowledgeView = "list" | "compact" | "grid";

type KnowledgeListItem = KnowledgeBase & {
  accent: "violet" | "blue" | "green" | "orange" | "rose";
  category: "document" | "technical" | "analysis" | "feedback" | "internal";
  tags: string[];
  ownerNames: string[];
  visibility: "available" | "restricted";
  storageLabel: string;
  citations: number;
  teamName: string;
  scope: KnowledgeScope;
  demo?: boolean;
};

const DEMO_KNOWLEDGE_BASES: KnowledgeListItem[] = [
  {
    id: "demo-vietnam-finance",
    workspaceId: "demo",
    name: "越南消费金融市场研究",
    description: "越南消费金融行业的市场规模、竞争格局、主要玩家、产品特征与发展趋势研究",
    status: "ready",
    sourceCount: 128,
    chunkCount: 3246,
    createdAt: "2024-05-10T09:30:00+08:00",
    updatedAt: "2024-05-20T14:30:00+08:00",
    accent: "violet",
    category: "document",
    tags: ["调研报告", "越南市场", "消费金融", "+2"],
    ownerNames: ["张伟", "李然", "+2"],
    visibility: "available",
    storageLabel: "2.34 GB",
    citations: 3842,
    teamName: "市场研究团队",
    scope: "mine",
    demo: true,
  },
  {
    id: "demo-product",
    workspaceId: "demo",
    name: "公司产品知识库",
    description: "公司产品文档、功能说明、使用指南、常见问题等",
    status: "ready",
    sourceCount: 96,
    chunkCount: 2180,
    createdAt: "2024-04-12T10:00:00+08:00",
    updatedAt: "2024-05-19T16:20:00+08:00",
    accent: "blue",
    category: "document",
    tags: ["产品", "文档", "说明书", "+1"],
    ownerNames: ["张伟", "周宁", "+5"],
    visibility: "available",
    storageLabel: "1.86 GB",
    citations: 2961,
    teamName: "产品团队",
    scope: "mine",
    demo: true,
  },
  {
    id: "demo-technical",
    workspaceId: "demo",
    name: "技术文档与规范",
    description: "开发规范、技术方案、API 文档、架构设计等",
    status: "ready",
    sourceCount: 74,
    chunkCount: 1924,
    createdAt: "2024-03-18T09:00:00+08:00",
    updatedAt: "2024-05-18T10:15:00+08:00",
    accent: "green",
    category: "technical",
    tags: ["技术", "开发", "API", "+3"],
    ownerNames: ["张伟", "陈敏", "+3"],
    visibility: "available",
    storageLabel: "1.42 GB",
    citations: 2350,
    teamName: "研发团队",
    scope: "mine",
    demo: true,
  },
  {
    id: "demo-competitors",
    workspaceId: "demo",
    name: "竞品分析资料库",
    description: "行业竞品的产品信息、功能对比、用户评价、商业模式等",
    status: "ready",
    sourceCount: 63,
    chunkCount: 1680,
    createdAt: "2024-03-06T09:00:00+08:00",
    updatedAt: "2024-05-17T09:40:00+08:00",
    accent: "orange",
    category: "analysis",
    tags: ["竞品", "分析", "对比", "+1"],
    ownerNames: ["张伟", "李然", "+1"],
    visibility: "available",
    storageLabel: "1.18 GB",
    citations: 1836,
    teamName: "战略分析团队",
    scope: "mine",
    demo: true,
  },
  {
    id: "demo-feedback",
    workspaceId: "demo",
    name: "客户反馈与需求",
    description: "用户反馈、需求收集、调研结果、用户画像等",
    status: "ready",
    sourceCount: 41,
    chunkCount: 856,
    createdAt: "2024-02-22T09:00:00+08:00",
    updatedAt: "2024-05-16T18:30:00+08:00",
    accent: "rose",
    category: "feedback",
    tags: ["用户研究", "反馈", "需求", "+1"],
    ownerNames: ["张伟"],
    visibility: "available",
    storageLabel: "820 MB",
    citations: 1124,
    teamName: "用户研究团队",
    scope: "mine",
    demo: true,
  },
  {
    id: "demo-internal",
    workspaceId: "demo",
    name: "内部资料库",
    description: "公司内部管理资料、制度流程、培训资料等",
    status: "ready",
    sourceCount: 52,
    chunkCount: 1088,
    createdAt: "2024-01-16T09:00:00+08:00",
    updatedAt: "2024-05-15T11:20:00+08:00",
    accent: "violet",
    category: "internal",
    tags: ["内部", "管理", "培训"],
    ownerNames: ["张伟"],
    visibility: "restricted",
    storageLabel: "960 MB",
    citations: 964,
    teamName: "Shiguang Lab",
    scope: "mine",
    demo: true,
  },
];

const CATEGORY_ICON = {
  document: Folder,
  technical: Code2,
  analysis: BarChart3,
  feedback: Users,
  internal: Lock,
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
  const accents: KnowledgeListItem["accent"][] = ["violet", "blue", "green", "orange", "rose"];
  return {
    ...kb,
    accent: accents[index % accents.length],
    category: "document",
    tags: [],
    ownerNames: ["张伟"],
    visibility: ["failed", "error", "disabled", "restricted"].includes(kb.status)
      ? "restricted"
      : "available",
    storageLabel: "--",
    citations: 0,
    teamName: "当前工作区",
    scope: "mine",
  };
}

export function KnowledgePage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [scope, setScope] = useState<KnowledgeScope>("mine");
  const [category, setCategory] = useState("all");
  const [status, setStatus] = useState("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("updated");
  const [view, setView] = useState<KnowledgeView>("list");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState("overview");
  const { data } = useQuery<KnowledgeBase[]>({
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
        .filter((item) => category === "all" || item.category === category)
        .filter(
          (item) =>
            status === "all" ||
            (status === "available" && item.visibility === "available") ||
            (status === "restricted" && item.visibility === "restricted"),
        )
        .filter((item) =>
          query.trim()
            ? `${item.name} ${item.description} ${item.tags.join(" ")}`
                .toLowerCase()
                .includes(query.trim().toLowerCase())
            : true,
        )
        .sort((a, b) =>
          sort === "name"
            ? a.name.localeCompare(b.name, "zh-CN")
            : sort === "documents"
              ? b.sourceCount - a.sourceCount
              : new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
        ),
    [all, category, query, scope, sort, status],
  );

  const pageSize = view === "grid" ? 6 : 5;
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paged = useMemo(
    () => filtered.slice((page - 1) * pageSize, page * pageSize),
    [filtered, page, pageSize],
  );

  useEffect(() => setPage(1), [category, query, scope, sort, status, view]);
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
        { id: "demo-pdf", title: "越南消费金融市场规模与趋势分析.pdf", sourceType: "upload" },
        { id: "demo-xlsx", title: "越南主要消费金融公司对比分析.xlsx", sourceType: "upload" },
        { id: "demo-docx", title: "越南消费金融监管政策解读.docx", sourceType: "asset" },
        { id: "demo-pptx", title: "越南用户画像与需求分析.pptx", sourceType: "asset" },
        { id: "demo-html", title: "越南消费金融行业新闻汇总.html", sourceType: "url" },
      ]
    : (liveDetail?.sources ?? []);

  const stats = demoMode
    ? [
        { label: "知识库总数", value: "28", note: "比上月 +4", icon: BookOpen, tone: "violet" },
        { label: "文档总数", value: "12,842", note: "比上月 +1,284", icon: FileText, tone: "blue" },
        {
          label: "已使用存储",
          value: "86.3 GB",
          note: "总计 100 MB",
          icon: Database,
          tone: "green",
        },
        {
          label: "被引用次数",
          value: "24,731",
          note: "比上月 +18.6%",
          icon: BarChart3,
          tone: "orange",
        },
      ]
    : [
        {
          label: "知识库总数",
          value: String(all.length),
          note: "当前工作区",
          icon: BookOpen,
          tone: "violet",
        },
        {
          label: "文档总数",
          value: String(all.reduce((sum, item) => sum + item.sourceCount, 0)),
          note: "已接入来源",
          icon: FileText,
          tone: "blue",
        },
        { label: "已使用存储", value: "--", note: "存储统计中", icon: Database, tone: "green" },
        {
          label: "被引用次数",
          value: String(all.reduce((sum, item) => sum + item.citations, 0)),
          note: "累计引用",
          icon: BarChart3,
          tone: "orange",
        },
      ];

  const openSelected = () => {
    if (!selected) return;
    if (selected.demo) {
      toast("info", "这是开发环境演示数据，创建知识库后即可管理真实资料");
      return;
    }
    navigate(`/knowledge/${selected.id}`);
  };

  return (
    <div className="sg-knowledge-page">
      <div className="sg-knowledge-head">
        <div>
          <h1 className="sg-h1">知识库</h1>
          <p>集中管理企业知识资产，让 AI 更懂你的业务</p>
        </div>
        <button
          type="button"
          className="sg-knowledge-help"
          onClick={() => toast("info", "将文档、文件或网页导入知识库后，即可进行检索与 AI 问答")}
        >
          <HelpCircle size={15} /> 如何使用知识库？
        </button>
      </div>

      <section className="sg-knowledge-stats" aria-label="知识库统计">
        {stats.map((item) => {
          const Icon = item.icon;
          return (
            <article key={item.label} className="sg-knowledge-stat">
              <span className={`sg-knowledge-stat-icon ${item.tone}`}>
                <Icon size={24} />
              </span>
              <span className="sg-knowledge-stat-copy">
                <span>{item.label}</span>
                <strong>{item.value}</strong>
                <small>{item.note}</small>
              </span>
            </article>
          );
        })}
      </section>

      <div className="sg-knowledge-scope-tabs" role="tablist" aria-label="知识库范围">
        {(
          [
            ["mine", "我的知识库"],
            ["team", "团队知识库"],
            ["public", "公开知识库"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={scope === id}
            className={scope === id ? "active" : ""}
            onClick={() => setScope(id)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="sg-knowledge-workspace">
        <section className="sg-knowledge-main">
          <div className="sg-knowledge-toolbar">
            <Select
              value={category}
              onChange={setCategory}
              options={[
                { value: "all", label: "全部类型" },
                { value: "document", label: "文档知识库" },
                { value: "technical", label: "技术知识库" },
                { value: "analysis", label: "分析资料库" },
                { value: "feedback", label: "反馈资料库" },
                { value: "internal", label: "内部资料库" },
              ]}
              className="sg-knowledge-select"
            />
            <Select
              value={status}
              onChange={setStatus}
              options={[
                { value: "all", label: "全部状态" },
                { value: "available", label: "可用" },
                { value: "restricted", label: "仅团队可见" },
              ]}
              className="sg-knowledge-select"
            />
            <label className="sg-knowledge-search">
              <Search size={16} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索知识库"
                aria-label="搜索知识库"
              />
            </label>
            <div className="sg-knowledge-toolbar-tail">
              <fieldset className="sg-knowledge-view-toggle" aria-label="显示方式">
                <button
                  type="button"
                  className={view === "grid" ? "active" : ""}
                  onClick={() => setView("grid")}
                  title="卡片视图"
                  aria-label="卡片视图"
                >
                  <Grid2X2 size={15} />
                </button>
                <button
                  type="button"
                  className={view === "list" ? "active" : ""}
                  onClick={() => setView("list")}
                  title="列表视图"
                  aria-label="列表视图"
                >
                  <List size={16} />
                </button>
                <button
                  type="button"
                  className={view === "compact" ? "active" : ""}
                  onClick={() => setView("compact")}
                  title="紧凑视图"
                  aria-label="紧凑视图"
                >
                  <SlidersHorizontal size={15} />
                </button>
              </fieldset>
              <Select
                value={sort}
                onChange={setSort}
                options={[
                  { value: "updated", label: "最近更新" },
                  { value: "name", label: "名称排序" },
                  { value: "documents", label: "文档数量" },
                ]}
                className="sg-knowledge-sort"
              />
            </div>
          </div>

          {paged.length === 0 ? (
            <div className="sg-knowledge-empty">
              <BookOpen size={32} />
              <strong>没有匹配的知识库</strong>
              <span>调整筛选条件，或在 Header 右侧新建知识库。</span>
            </div>
          ) : view === "grid" ? (
            <div className="sg-knowledge-grid">
              {paged.map((item) => {
                const Icon = CATEGORY_ICON[item.category];
                return (
                  <button
                    type="button"
                    key={item.id}
                    className={`sg-knowledge-grid-card ${selectedId === item.id ? "selected" : ""}`}
                    onClick={() => setSelectedId(item.id)}
                  >
                    <div className="sg-knowledge-grid-head">
                      <span className={`sg-knowledge-item-icon ${item.accent}`}>
                        <Icon size={21} />
                      </span>
                      <span className="sg-knowledge-card-more" aria-hidden="true">
                        <MoreHorizontal size={17} />
                      </span>
                    </div>
                    <strong>{item.name}</strong>
                    <p>{item.description || "暂无描述"}</p>
                    <div className="sg-knowledge-tags">
                      {item.tags.slice(0, 3).map((tag) => (
                        <span key={tag}>{tag}</span>
                      ))}
                    </div>
                    <div className="sg-knowledge-grid-meta">
                      <span>{item.sourceCount} 个文档</span>
                      <span>{formatRelative(item.updatedAt)}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className={`sg-knowledge-list ${view === "compact" ? "compact" : ""}`}>
              {paged.map((item) => {
                const Icon = CATEGORY_ICON[item.category];
                return (
                  <button
                    type="button"
                    key={item.id}
                    className={`sg-knowledge-row ${selectedId === item.id ? "selected" : ""}`}
                    onClick={() => setSelectedId(item.id)}
                  >
                    <div className="sg-knowledge-row-primary">
                      <span className={`sg-knowledge-item-icon ${item.accent}`}>
                        <Icon size={21} />
                      </span>
                      <span className="sg-knowledge-row-copy">
                        <strong>
                          {item.name}
                          {item.name.includes("越南") && <Star size={13} fill="currentColor" />}
                          {item.visibility === "restricted" && <Lock size={13} />}
                        </strong>
                        <span>{item.description || "暂无描述"}</span>
                        {view !== "compact" && (
                          <span className="sg-knowledge-tags">
                            {item.tags.map((tag) => (
                              <i key={tag}>{tag}</i>
                            ))}
                          </span>
                        )}
                      </span>
                    </div>
                    <div className="sg-knowledge-owner">
                      <span>所有者</span>
                      <div>
                        {item.ownerNames.map((owner) =>
                          owner.startsWith("+") ? (
                            <i key={owner}>{owner}</i>
                          ) : (
                            <Avatar key={owner} name={owner} size={27} />
                          ),
                        )}
                      </div>
                    </div>
                    <div className="sg-knowledge-updated">
                      <span>更新时间</span>
                      <time>{knowledgeDate(item.updatedAt)}</time>
                    </div>
                    <div className={`sg-knowledge-status ${item.visibility}`}>
                      <span>状态</span>
                      <b>
                        <i />
                        {item.visibility === "available" ? "可用" : "仅团队可见"}
                      </b>
                    </div>
                    <span className="sg-knowledge-more" aria-hidden="true">
                      <MoreHorizontal size={18} />
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {filtered.length > 0 && (
            <nav className="sg-knowledge-pagination" aria-label="知识库分页">
              <button
                type="button"
                disabled={page === 1}
                onClick={() => setPage((current) => current - 1)}
                aria-label="上一页"
              >
                <ChevronLeft size={16} />
              </button>
              {Array.from({ length: pageCount }, (_, index) => index + 1).map((value) => (
                <button
                  key={value}
                  type="button"
                  className={page === value ? "active" : ""}
                  onClick={() => setPage(value)}
                >
                  {value}
                </button>
              ))}
              <button
                type="button"
                disabled={page === pageCount}
                onClick={() => setPage((current) => current + 1)}
                aria-label="下一页"
              >
                <ChevronRight size={16} />
              </button>
            </nav>
          )}
        </section>

        <aside className="sg-knowledge-detail" aria-label="知识库详情">
          {selected ? (
            <>
              <div className="sg-knowledge-detail-head">
                <div>
                  <strong>{selected.name}</strong>
                  {selected.name.includes("越南") && <Star size={14} fill="currentColor" />}
                </div>
                <span className={`sg-knowledge-availability ${selected.visibility}`}>
                  <i />
                  {selected.visibility === "available" ? "可用" : "仅团队可见"}
                </span>
                <button
                  type="button"
                  aria-label="更多操作"
                  title="更多操作"
                  onClick={() => toast("info", "更多管理操作请进入知识库详情")}
                >
                  <MoreHorizontal size={18} />
                </button>
              </div>
              <div className="sg-knowledge-detail-tabs" role="tablist">
                {[
                  ["overview", "概览"],
                  ["documents", "文档"],
                  ["permissions", "权限"],
                  ["settings", "设置"],
                  ["activity", "操作日志"],
                ].map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    aria-selected={detailTab === id}
                    className={detailTab === id ? "active" : ""}
                    onClick={() => setDetailTab(id)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="sg-knowledge-detail-body">
                {detailTab === "overview" && (
                  <>
                    <p className="sg-knowledge-detail-description">
                      {selected.description || "暂无描述"}
                    </p>
                    <button type="button" className="sg-knowledge-edit-link" onClick={openSelected}>
                      编辑描述
                    </button>
                    <dl className="sg-knowledge-meta-grid">
                      <div>
                        <dt>创建时间</dt>
                        <dd>{knowledgeDate(selected.createdAt)}</dd>
                      </div>
                      <div>
                        <dt>更新时间</dt>
                        <dd>{knowledgeDate(selected.updatedAt)}</dd>
                      </div>
                      <div>
                        <dt>所有者</dt>
                        <dd>
                          <Avatar name={selected.ownerNames[0]} size={20} />
                          {selected.ownerNames[0]}
                        </dd>
                      </div>
                      <div>
                        <dt>团队</dt>
                        <dd>
                          <Users size={15} />
                          {selected.teamName}
                        </dd>
                      </div>
                      <div>
                        <dt>文档数量</dt>
                        <dd>
                          <FileText size={15} />
                          {selected.sourceCount} 个
                        </dd>
                      </div>
                      <div>
                        <dt>存储大小</dt>
                        <dd>
                          <Folder size={15} />
                          {selected.storageLabel}
                        </dd>
                      </div>
                      <div>
                        <dt>被引用次数</dt>
                        <dd>
                          <Sparkles size={15} />
                          {selected.citations.toLocaleString("zh-CN")} 次
                        </dd>
                      </div>
                      <div>
                        <dt>索引分块</dt>
                        <dd>
                          <Database size={15} />
                          {selected.chunkCount.toLocaleString("zh-CN")} 个
                        </dd>
                      </div>
                    </dl>
                    <div className="sg-knowledge-detail-tags">
                      <h3>标签</h3>
                      <div>
                        {selected.tags.map((tag) => (
                          <span key={tag}>{tag}</span>
                        ))}
                      </div>
                    </div>
                    <div className="sg-knowledge-distribution">
                      <h3>文档类型分布</h3>
                      <div className="sg-knowledge-chart">
                        <i />
                        <ul>
                          <li>
                            <b className="pdf" />
                            PDF 文档 <span>45 (35%)</span>
                          </li>
                          <li>
                            <b className="word" />
                            Word 文档 <span>32 (25%)</span>
                          </li>
                          <li>
                            <b className="excel" />
                            Excel 表格 <span>18 (14%)</span>
                          </li>
                          <li>
                            <b className="ppt" />
                            PPT 演示 <span>12 (9%)</span>
                          </li>
                          <li>
                            <b className="web" />
                            网页链接 <span>11 (9%)</span>
                          </li>
                          <li>
                            <b className="other" />
                            其他 <span>10 (8%)</span>
                          </li>
                        </ul>
                      </div>
                    </div>
                    <div className="sg-knowledge-recent">
                      <div>
                        <h3>最近更新的文档</h3>
                        <button type="button" onClick={() => setDetailTab("documents")}>
                          查看全部
                        </button>
                      </div>
                      {selectedSources.slice(0, 5).map((source, index) => (
                        <button type="button" key={source.id} onClick={openSelected}>
                          <span className={`type-${index % 5}`}>
                            <FileText size={13} />
                          </span>
                          <b>{source.title}</b>
                          <time>
                            {index === 0 ? "14:30" : index === 1 ? "昨天" : `05-${18 - index}`}
                          </time>
                        </button>
                      ))}
                    </div>
                  </>
                )}
                {detailTab === "documents" && (
                  <div className="sg-knowledge-panel-list">
                    <h3>已导入文档</h3>
                    {selectedSources.length ? (
                      selectedSources.map((source) => (
                        <button type="button" key={source.id} onClick={openSelected}>
                          <FileText size={16} />
                          <span>
                            <b>{source.title}</b>
                            <small>{source.sourceType}</small>
                          </span>
                          <ChevronRight size={15} />
                        </button>
                      ))
                    ) : (
                      <p>还没有导入文档</p>
                    )}
                  </div>
                )}
                {detailTab === "permissions" && (
                  <div className="sg-knowledge-panel-message">
                    <ShieldCheck size={27} />
                    <strong>权限管理</strong>
                    <p>
                      {selected.visibility === "available"
                        ? "当前工作区成员可访问此知识库。"
                        : "仅指定团队成员可以访问。"}
                    </p>
                    <Button size="small" onClick={openSelected}>
                      管理权限
                    </Button>
                  </div>
                )}
                {detailTab === "settings" && (
                  <div className="sg-knowledge-panel-message">
                    <SlidersHorizontal size={27} />
                    <strong>知识库设置</strong>
                    <p>管理名称、描述、索引策略与知识库状态。</p>
                    <Button size="small" onClick={openSelected}>
                      进入设置
                    </Button>
                  </div>
                )}
                {detailTab === "activity" && (
                  <div className="sg-knowledge-activity">
                    <h3>最近操作</h3>
                    <p>
                      <i />
                      更新了知识库索引<time>{formatRelative(selected.updatedAt)}</time>
                    </p>
                    <p>
                      <i />
                      导入了 {selected.sourceCount} 个文档
                      <time>{knowledgeDate(selected.createdAt)}</time>
                    </p>
                  </div>
                )}
              </div>
              <div className="sg-knowledge-detail-actions">
                <Button onClick={openSelected}>导入文档</Button>
                <Button
                  type="primary"
                  onClick={() => navigate(`/documents/new?knowledgeBaseId=${selected.id}`)}
                >
                  新建文档
                </Button>
              </div>
            </>
          ) : (
            <div className="sg-knowledge-detail-empty">
              <BookOpen size={30} />
              <strong>选择一个知识库</strong>
              <span>查看概览、文档和权限信息</span>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

export function KnowledgeNewPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
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
            style={{ minHeight: 90 }}
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

  if (!kb) return <Empty title="加载中…" />;

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
        <div className="sg-grid" style={{ gridTemplateColumns: "2fr 1fr" }}>
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
                      <div key={c.index} className="sg-card" style={{ marginTop: 8, padding: 12 }}>
                        <div className="sg-row">
                          <span className="sg-badge sg-badge-accent">[{c.index}]</span>
                          <strong>{c.sourceTitle}</strong>
                        </div>
                        <p className="sg-subtle" style={{ margin: "6px 0 0" }}>
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
                  <p className="sg-subtle" style={{ margin: "6px 0 0" }}>
                    {r.chunk.headingPath}
                  </p>
                  <p style={{ margin: "8px 0 0" }}>{r.chunk.text.slice(0, 300)}…</p>
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
                className=""
                style={{ width: 140 }}
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
                  style={{ flex: 1 }}
                />
              )}
              {sourceType === "url" && (
                <Input
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://…"
                  style={{ flex: 1 }}
                />
              )}
              {sourceType === "upload" && (
                <input
                  type="file"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  style={{ flex: 1 }}
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
                    {s.error && (
                      <p
                        className="sg-subtle"
                        style={{ color: "var(--sg-danger)", margin: "6px 0 0" }}
                      >
                        {s.error}
                      </p>
                    )}
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
