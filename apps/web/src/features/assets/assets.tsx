import { Empty, formatRelative, Loading, useToast } from "@shiguang/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Dropdown, Input, Progress, Select, Tooltip } from "antd";
import {
  BookOpen,
  ChartNoAxesCombined,
  ChevronLeft,
  ChevronRight,
  Clock,
  Code2,
  Database,
  FileText,
  FileUp,
  Globe,
  Image as ImageIcon,
  Link2,
  Lock,
  MonitorPlay,
  MoreHorizontal,
  Plus,
  Search,
  Star,
  Trash2,
  Upload,
  User,
  Users,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { canWriteWorkspace, getAuthSession } from "../../auth/session.js";
import { type Asset, api } from "../../entities/api.js";
import { AppTabs } from "../../shared/AppTabs.js";
import { isOwnedBySession, ownerDisplayName } from "../../shared/owner.js";
import { useDeleteConfirm } from "../../shared/useDeleteConfirm";

const TYPE_ORDER = [
  { id: "all", label: "全部" },
  { id: "document", label: "文档" },
  { id: "html", label: "HTML" },
  { id: "dataset", label: "数据" },
  { id: "report", label: "报告" },
  { id: "presentation", label: "在线演示" },
  { id: "knowledge", label: "知识库" },
  { id: "image", label: "图片" },
  { id: "other", label: "其他" },
];

const TYPE_META: Record<
  string,
  {
    label: string;
    icon: typeof FileText;
    tone: "violet" | "blue" | "green" | "teal" | "orange" | "purple" | "red" | "gray" | "cyan";
  }
> = {
  document: { label: "文档", icon: FileText, tone: "violet" },
  html: { label: "HTML", icon: Code2, tone: "blue" },
  dataset: { label: "数据", icon: Database, tone: "green" },
  report: { label: "报告", icon: ChartNoAxesCombined, tone: "orange" },
  presentation: { label: "在线演示", icon: MonitorPlay, tone: "purple" },
  knowledge: { label: "知识库", icon: BookOpen, tone: "teal" },
  image: { label: "图片", icon: ImageIcon, tone: "cyan" },
  source: { label: "来源", icon: Link2, tone: "blue" },
  file: { label: "文件", icon: FileUp, tone: "gray" },
  other: { label: "其他", icon: FileText, tone: "gray" },
};

function typeOf(a: Asset): string {
  return TYPE_META[a.type] ? a.type : "other";
}

function statusOf(a: Asset): { label: string; tone: "ok" | "warn" | "muted" | "err" } {
  if (a.deletedAt) return { label: "已删除", tone: "err" };
  if (a.publishedUrl) return { label: "已发布", tone: "ok" };
  switch (a.status) {
    case "ready":
    case "normal":
    case "updated":
      return { label: "已更新", tone: "ok" };
    case "indexing":
    case "indexed":
      return { label: "已索引", tone: "ok" };
    case "completed":
      return { label: "已完成", tone: "ok" };
    case "draft":
      return { label: "草稿", tone: "warn" };
    case "pending":
    case "queued":
    case "planning":
    case "processing":
    case "running":
    case "parsing":
      return { label: "处理中", tone: "warn" };
    case "failed":
    case "error":
      return { label: "失败", tone: "err" };
    case "archived":
      return { label: "已归档", tone: "muted" };
    default:
      return { label: "已更新", tone: "ok" };
  }
}

const QUICK_FILTERS = [
  { id: "mine", label: "我创建的", icon: User },
  { id: "shared", label: "我参与的", icon: Users },
  { id: "recent", label: "最近打开", icon: Clock },
  { id: "favorites", label: "收藏", icon: Star },
  { id: "trash", label: "回收站", icon: Trash2 },
] as const;

type QuickId = "all" | (typeof QUICK_FILTERS)[number]["id"];

interface AssetPage {
  items: Asset[];
  total: number;
  nextCursor?: string | null;
}

interface StorageUsage {
  usedBytes: number;
  quotaBytes: number;
}

function formatStorageBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

async function loadAssetSet(includeDeleted: boolean): Promise<Asset[]> {
  const items: Asset[] = [];
  let cursor: string | undefined;
  do {
    const page = await api<AssetPage>("/assets", {
      params: { includeDeleted, limit: 100, cursor },
    });
    items.push(...page.items);
    cursor = page.nextCursor ?? undefined;
  } while (cursor);
  return items;
}

async function loadAllAssets(): Promise<Asset[]> {
  const [active, deleted] = await Promise.all([loadAssetSet(false), loadAssetSet(true)]);
  return [...active, ...deleted];
}

function withinDays(iso: string, days: number): boolean {
  return Date.now() - new Date(iso).getTime() < days * 24 * 3600 * 1000;
}

export function AssetsPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const { confirmDelete } = useDeleteConfirm();
  const queryClient = useQueryClient();
  const authSession = getAuthSession();
  const workspaceWritable = canWriteWorkspace(authSession);
  const [type, setType] = useState("all");
  const [q, setQ] = useState("");
  const [visibility, setVisibility] = useState("all");
  const [owner, setOwner] = useState("all");
  const [modified, setModified] = useState("all");
  const [tagFilter, setTagFilter] = useState("all");
  const [quick, setQuick] = useState<QuickId>("all");
  const [sort, setSort] = useState("updatedAt");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [tagInput, setTagInput] = useState("");

  const includeDeleted = quick === "trash";

  const { data, isLoading } = useQuery<Asset[]>({
    queryKey: ["assets", "all"],
    queryFn: loadAllAssets,
  });
  const { data: storage } = useQuery<StorageUsage>({
    queryKey: ["assets", "storage"],
    queryFn: () => api<StorageUsage>("/assets/storage"),
  });

  const batchMutation = useMutation({
    mutationFn: (input: { action: "delete" | "restore" | "tag"; ids: string[]; tags?: string[] }) =>
      api("/assets:batch", { method: "POST", body: input }),
    onSuccess: () => {
      toast("success", "批量操作成功");
      setSelected(new Set());
      void queryClient.invalidateQueries({ queryKey: ["assets"] });
      void queryClient.invalidateQueries({ queryKey: ["assets", "storage"] });
      void queryClient.invalidateQueries({ queryKey: ["home"] });
    },
  });

  const confirmDeleteAssets = (targets: { id: string; title: string }[]) => {
    const count = targets.length;
    confirmDelete({
      title: count > 1 ? `删除 ${count} 个资产？` : `删除资产「${targets[0]?.title}」？`,
      content: "删除后可在回收站恢复。",
      onConfirm: () => batchMutation.mutate({ action: "delete", ids: targets.map((t) => t.id) }),
    });
  };

  const all = useMemo(() => data ?? [], [data]);

  const items = useMemo(() => {
    return all
      .filter((a) => (includeDeleted ? !!a.deletedAt : !a.deletedAt))
      .filter((a) =>
        quick === "mine"
          ? isOwnedBySession(a, authSession)
          : quick === "shared"
            ? !isOwnedBySession(a, authSession)
            : true,
      )
      .filter((a) => (quick === "recent" ? withinDays(a.updatedAt, 7) : true))
      .filter((a) =>
        type === "all" ? true : type === "other" ? !TYPE_META[a.type] : a.type === type,
      )
      .filter((a) => (visibility === "all" ? true : a.visibility === visibility))
      .filter((a) =>
        owner === "all"
          ? true
          : owner === "mine"
            ? isOwnedBySession(a, authSession)
            : !isOwnedBySession(a, authSession),
      )
      .filter((a) => {
        if (modified === "all") return true;
        if (modified === "today") return withinDays(a.updatedAt, 1);
        if (modified === "7d") return withinDays(a.updatedAt, 7);
        return withinDays(a.updatedAt, 30);
      })
      .filter((a) => (tagFilter === "all" ? true : a.tags.includes(tagFilter)))
      .filter((a) =>
        q.trim()
          ? `${a.title} ${a.description} ${a.tags.join(" ")}`
              .toLowerCase()
              .includes(q.toLowerCase())
          : true,
      )
      .sort((a, b) =>
        sort === "title"
          ? a.title.localeCompare(b.title)
          : new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      );
  }, [
    all,
    authSession,
    includeDeleted,
    quick,
    type,
    visibility,
    owner,
    modified,
    tagFilter,
    q,
    sort,
  ]);

  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const paged = useMemo(
    () => items.slice((page - 1) * pageSize, page * pageSize),
    [items, page, pageSize],
  );

  useEffect(() => {
    setPage(1);
  }, [type, q, visibility, owner, modified, tagFilter, quick, pageSize]);

  const typeCount = (id: string) =>
    all.filter((a) =>
      id === "all"
        ? !a.deletedAt
        : id === "other"
          ? !TYPE_META[a.type] && !a.deletedAt
          : a.type === id && !a.deletedAt,
    ).length;

  const quickCount = (id: QuickId): number => {
    if (id === "all") return all.filter((a) => !a.deletedAt).length;
    if (id === "mine")
      return all.filter((a) => !a.deletedAt && isOwnedBySession(a, authSession)).length;
    if (id === "shared")
      return all.filter((a) => !a.deletedAt && !isOwnedBySession(a, authSession)).length;
    if (id === "recent")
      return all.filter((a) => !a.deletedAt && withinDays(a.updatedAt, 7)).length;
    if (id === "trash") return all.filter((a) => !!a.deletedAt).length;
    return 0; // favorites
  };

  const tagCloud = useMemo(() => {
    const count = new Map<string, number>();
    for (const a of all) for (const t of a.tags.slice(0, 4)) count.set(t, (count.get(t) ?? 0) + 1);
    return [...count.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
  }, [all]);

  const recentOpen = useMemo(
    () =>
      all
        .filter((a) => !a.deletedAt)
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
        .slice(0, 5),
    [all],
  );

  const assetSummary = useMemo(() => {
    const active = all.filter((a) => !a.deletedAt).length;
    return { active, deleted: all.length - active };
  }, [all]);

  const storageSummary = useMemo(() => {
    const usedBytes = Math.max(0, storage?.usedBytes ?? 0);
    const quotaBytes = Math.max(1, storage?.quotaBytes ?? 100 * 1024 * 1024);
    return {
      used: formatStorageBytes(usedBytes),
      quota: formatStorageBytes(quotaBytes),
      pct: Math.min(100, Math.round((usedBytes / quotaBytes) * 100)),
    };
  }, [storage]);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const pageButtons = useMemo(() => {
    const out: Array<number | "…"> = [];
    if (pageCount <= 7) {
      for (let i = 1; i <= pageCount; i++) out.push(i);
      return out;
    }
    out.push(1);
    const start = Math.max(2, page - 1);
    const end = Math.min(pageCount - 1, page + 1);
    if (start > 2) out.push("…");
    for (let i = start; i <= end; i++) out.push(i);
    if (end < pageCount - 1) out.push("…");
    out.push(pageCount);
    return out;
  }, [page, pageCount]);

  const visibleType = (a: Asset) => {
    if (a.visibility === "public") return { icon: Globe, cls: "public", label: "公开" };
    if (a.visibility === "link") return { icon: Link2, cls: "link", label: "知道链接的人" };
    return { icon: Lock, cls: "private", label: "私有" };
  };

  return (
    <div className="sg-assets">
      <div className="sg-assets-body">
        <div className="sg-assets-list">
          <div className="sg-assets-head">
            <div>
              <h1 className="sg-h1">资产中心</h1>
              <p className="sg-assets-sub">统一管理你的所有内容</p>
            </div>
            <div className="sg-row" style={{ gap: 8 }}>
              <Button className="sg-assets-head-btn" onClick={() => navigate("/documents/new")}>
                <Plus size={15} /> 新建
              </Button>
              <Button className="sg-assets-head-btn" onClick={() => navigate("/knowledge/new")}>
                <Upload size={14} /> 导入
              </Button>
            </div>
          </div>

          <AppTabs
            items={TYPE_ORDER.map((t) => ({ key: t.id, label: t.label, count: typeCount(t.id) }))}
            activeKey={type}
            onChange={(key) => {
              setType(key);
              setSelected(new Set());
            }}
          />

          <div className="sg-assets-toolbar">
            <Input
              className="sg-assets-search"
              placeholder="搜索文件名、内容、标签…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              prefix={<Search size={15} />}
              allowClear
            />
            <Select
              value={owner}
              onChange={setOwner}
              className="sg-assets-select"
              options={[
                { value: "all", label: "所有者" },
                { value: "mine", label: "我" },
                { value: "others", label: "其他成员" },
              ]}
            />
            <Select
              value={modified}
              onChange={setModified}
              className="sg-assets-select"
              options={[
                { value: "all", label: "修改时间" },
                { value: "today", label: "今天" },
                { value: "7d", label: "近 7 天" },
                { value: "30d", label: "近 30 天" },
              ]}
            />
            <Select
              value={tagFilter}
              onChange={setTagFilter}
              className="sg-assets-select"
              options={[
                { value: "all", label: "标签" },
                ...tagCloud.slice(0, 8).map(([t]) => ({ value: t, label: t })),
              ]}
            />
            <Select
              value={visibility}
              onChange={setVisibility}
              className="sg-assets-select"
              options={[
                { value: "all", label: "可见性" },
                { value: "private", label: "私有" },
                { value: "link", label: "链接" },
                { value: "public", label: "公开" },
              ]}
            />
            <Select
              value={sort}
              onChange={setSort}
              className="sg-assets-select"
              options={[
                { value: "updatedAt", label: "更新时间" },
                { value: "title", label: "名称" },
              ]}
            />
            {selected.size > 0 && (
              <div className="sg-row sg-assets-batch">
                {!includeDeleted && (
                  <>
                    <Input
                      placeholder="输入标签后回车"
                      value={tagInput}
                      onChange={(e) => setTagInput(e.target.value)}
                      style={{ width: 140 }}
                    />
                    <Button
                      size="small"
                      onClick={() =>
                        tagInput &&
                        batchMutation.mutate({
                          action: "tag",
                          ids: [...selected],
                          tags: [tagInput],
                        })
                      }
                    >
                      加标签
                    </Button>
                    <Button
                      size="small"
                      type="primary"
                      danger
                      onClick={() =>
                        confirmDeleteAssets(
                          all
                            .filter((a) => selected.has(a.id))
                            .map((a) => ({ id: a.id, title: a.title })),
                        )
                      }
                    >
                      删除
                    </Button>
                  </>
                )}
                {includeDeleted && (
                  <Button
                    size="small"
                    onClick={() => batchMutation.mutate({ action: "restore", ids: [...selected] })}
                  >
                    恢复
                  </Button>
                )}
                <Button size="small" type="text" onClick={() => setSelected(new Set())}>
                  取消
                </Button>
              </div>
            )}
          </div>

          {isLoading ? (
            <Loading loading minHeight={320} />
          ) : paged.length === 0 ? (
            <Empty
              title={
                includeDeleted
                  ? "回收站为空"
                  : quick === "favorites"
                    ? "暂无收藏"
                    : "没有匹配的资产"
              }
              hint="创建文档、上传文件或发起调研后，资产会出现在这里。"
            />
          ) : (
            <div className="sg-assets-table-wrap">
              <table className="sg-assets-table">
                <thead>
                  <tr>
                    <th className="c-check" />
                    <th>名称</th>
                    <th className="c-type">类型</th>
                    <th className="c-owner">所有者</th>
                    <th className="c-time">更新时间</th>
                    <th className="c-status">状态</th>
                    <th className="c-vis">可见性</th>
                    <th className="c-menu" />
                  </tr>
                </thead>
                <tbody>
                  {paged.map((asset) => {
                    const meta = TYPE_META[typeOf(asset)];
                    const Icon = meta.icon;
                    const st = statusOf(asset);
                    const vis = visibleType(asset);
                    const VisIcon = vis.icon;
                    return (
                      <tr
                        key={asset.id}
                        className="sg-assets-row"
                        onClick={(e) => {
                          if ((e.target as HTMLElement).closest("label, .ant-dropdown, button"))
                            return;
                          navigate(assetHref(asset));
                        }}
                      >
                        <td className="c-check">
                          <label className="sg-asset-check">
                            <input
                              type="checkbox"
                              checked={selected.has(asset.id)}
                              onChange={() => toggle(asset.id)}
                              onClick={(e) => e.stopPropagation()}
                            />
                          </label>
                        </td>
                        <td>
                          <div className="sg-asset-name">
                            <span className={`sg-asset-icn ${meta.tone}`}>
                              <Icon size={16} strokeWidth={1.9} />
                            </span>
                            <span className="sg-asset-name-copy">
                              <span className="sg-asset-title">{asset.title}</span>
                              <span className="sg-asset-tags">
                                {asset.tags.slice(0, 3).map((t) => (
                                  <span key={t} className="sg-tag sg-asset-tag">
                                    {t}
                                  </span>
                                ))}
                              </span>
                            </span>
                          </div>
                        </td>
                        <td className="c-type sg-subtle">{meta.label}</td>
                        <td className="c-owner">
                          <span className="sg-owner-stack">
                            <Tooltip title={ownerDisplayName(asset, authSession)}>
                              <span
                                className="sg-owner-avatar"
                                role="img"
                                aria-label={`所有者：${ownerDisplayName(asset, authSession)}`}
                              >
                                {ownerDisplayName(asset, authSession).slice(0, 1)}
                              </span>
                            </Tooltip>
                          </span>
                        </td>
                        <td className="c-time sg-subtle">{formatRelative(asset.updatedAt)}</td>
                        <td className="c-status">
                          <span className="sg-status">
                            <span className={`sg-status-dot ${st.tone}`} />
                            {st.label}
                          </span>
                        </td>
                        <td className="c-vis">
                          <span className={`sg-vis ${vis.cls}`}>
                            <VisIcon size={13} />
                            {vis.label}
                          </span>
                        </td>
                        <td className="c-menu">
                          <Dropdown
                            trigger={["click"]}
                            placement="bottomRight"
                            popupRender={() => (
                              <div className="sg-asset-menu" onClick={(e) => e.stopPropagation()}>
                                <button type="button" onClick={() => navigate(assetHref(asset))}>
                                  打开资产
                                </button>
                                {workspaceWritable && !includeDeleted ? (
                                  <button
                                    type="button"
                                    onClick={() => navigate(`/assets/${asset.id}/edit`)}
                                  >
                                    编辑资产
                                  </button>
                                ) : null}
                                {!includeDeleted ? (
                                  <button
                                    type="button"
                                    className="danger"
                                    onClick={() =>
                                      confirmDeleteAssets([{ id: asset.id, title: asset.title }])
                                    }
                                  >
                                    删除
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      batchMutation.mutate({ action: "restore", ids: [asset.id] })
                                    }
                                  >
                                    恢复
                                  </button>
                                )}
                              </div>
                            )}
                          >
                            <button
                              type="button"
                              className="sg-asset-more"
                              onClick={(e) => e.stopPropagation()}
                              aria-label="更多操作"
                            >
                              <MoreHorizontal size={16} />
                            </button>
                          </Dropdown>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {!isLoading && paged.length > 0 && (
            <div className="sg-pager">
              <span className="sg-pager-total">共 {items.length} 项</span>
              <div className="sg-pager-pages">
                <button
                  type="button"
                  className="sg-page-btn"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                  aria-label="上一页"
                >
                  <ChevronLeft size={15} />
                </button>
                {pageButtons.map((p, i) =>
                  p === "…" ? (
                    <span key={`e-${i}`} className="sg-page-ellipsis">
                      …
                    </span>
                  ) : (
                    <button
                      key={p}
                      type="button"
                      className={`sg-page-btn ${page === p ? "active" : ""}`}
                      onClick={() => setPage(p)}
                    >
                      {p}
                    </button>
                  ),
                )}
                <button
                  type="button"
                  className="sg-page-btn"
                  disabled={page >= pageCount}
                  onClick={() => setPage((p) => p + 1)}
                  aria-label="下一页"
                >
                  <ChevronRight size={15} />
                </button>
              </div>
              <span className="sg-pager-size">
                每页
                <Select
                  value={String(pageSize)}
                  onChange={(v: string) => setPageSize(Number(v))}
                  className="sg-pager-size-select"
                  options={[
                    { value: "10", label: "10 项" },
                    { value: "20", label: "20 项" },
                    { value: "50", label: "50 项" },
                  ]}
                />
              </span>
            </div>
          )}
        </div>

        <aside className="sg-assets-side">
          <div className="sg-side-card">
            <h3 className="sg-h3 sg-side-title">快捷筛选</h3>
            <div className="sg-qf-list">
              {QUICK_FILTERS.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  className={`sg-qf-item ${quick === id ? "active" : ""}`}
                  onClick={() => {
                    setQuick(quick === id ? "all" : id);
                    setSelected(new Set());
                  }}
                >
                  <span className="sg-qf-icn">
                    <Icon size={14} />
                  </span>
                  {label}
                  <span className="sg-qf-count">{quickCount(id)}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="sg-side-card">
            <div className="sg-row-between">
              <h3 className="sg-h3 sg-side-title">存储空间</h3>
              <span className="sg-subtle">{storageSummary.pct}%</span>
            </div>
            <div className="sg-storage-num">
              {storageSummary.used} <em>/ {storageSummary.quota}</em>
            </div>
            <div className="sg-storage-bar">
              <Progress percent={Math.max(0, Math.min(100, storageSummary.pct))} />
            </div>
            <div className="sg-subtle">
              {assetSummary.active} 个资产 · 回收站 {assetSummary.deleted} 个
            </div>
          </div>

          <div className="sg-side-card">
            <h3 className="sg-h3 sg-side-title">最近打开</h3>
            <div className="sg-recent-list">
              {recentOpen.map((a) => {
                const meta = TYPE_META[typeOf(a)];
                const Icon = meta.icon;
                return (
                  <button
                    key={a.id}
                    type="button"
                    className="sg-recent-item"
                    onClick={() => navigate(assetHref(a))}
                  >
                    <span className={`sg-asset-icn ${meta.tone} sm`}>
                      <Icon size={13} strokeWidth={1.9} />
                    </span>
                    <span className="sg-recent-name">{a.title}</span>
                    <span className="sg-recent-time">{formatRelative(a.updatedAt)}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="sg-side-card">
            <h3 className="sg-h3 sg-side-title">标签云</h3>
            <div className="sg-tag-cloud">
              {tagCloud.map(([tag, n]) => (
                <button key={tag} type="button" className="sg-tag" onClick={() => setQ(tag)}>
                  {tag} <em>{n}</em>
                </button>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function assetHref(asset: Asset): string {
  return `/assets/${asset.id}`;
}
