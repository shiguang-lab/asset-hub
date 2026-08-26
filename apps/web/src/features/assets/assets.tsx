import { Empty, formatRelative, Loading, useToast } from "@shiguang/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { MenuProps } from "antd";
import { Button, Dropdown, Input, Progress, Select } from "antd";
import { createStyles } from "antd-style";
import {
  BookOpen,
  ChartNoAxesCombined,
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
import { AppPagination } from "../../shared/AppPagination.js";
import { AppTable } from "../../shared/AppTable.js";
import { AppTabs } from "../../shared/AppTabs.js";
import { OwnerAvatar } from "../../shared/OwnerAvatar.js";
import { isOwnedBySession, ownerDisplayName } from "../../shared/owner.js";
import { useDeleteConfirm } from "../../shared/useDeleteConfirm";

const useAssetsPageStyles = createStyles(() => ({
  headerActions: {
    gap: 8,
  },
}));

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
  const { styles } = useAssetsPageStyles();
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
  const [quick, setQuick] = useState<QuickId>("all");
  const [sort, setSort] = useState("updatedAt");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openAssetMenuId, setOpenAssetMenuId] = useState<string | null>(null);

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
    mutationFn: (input: { action: "delete" | "restore"; ids: string[] }) =>
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
      .filter((a) =>
        q.trim() ? `${a.title} ${a.description}`.toLowerCase().includes(q.toLowerCase()) : true,
      )
      .sort((a, b) =>
        sort === "title"
          ? a.title.localeCompare(b.title)
          : new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      );
  }, [all, authSession, includeDeleted, quick, type, visibility, owner, modified, q, sort]);

  const paged = useMemo(
    () => items.slice((page - 1) * pageSize, page * pageSize),
    [items, page, pageSize],
  );

  useEffect(() => {
    setPage(1);
  }, [type, q, visibility, owner, modified, quick, pageSize]);

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
            <div className={`sg-row ${styles.headerActions}`}>
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
              placeholder="搜索文件名、内容…"
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
              <AppTable<Asset>
                rowKey="id"
                dataSource={paged}
                pagination={false}
                size="middle"
                rowSelection={{
                  selectedRowKeys: [...selected],
                  onChange: (keys) => setSelected(new Set(keys as string[])),
                }}
                onRow={(asset) => ({
                  style: { cursor: "pointer" },
                  onClick: (e) => {
                    if ((e.target as HTMLElement).closest("label, .ant-dropdown, button")) return;
                    navigate(assetHref(asset));
                  },
                })}
                columns={[
                  {
                    title: "名称",
                    dataIndex: "title",
                    render: (_v, asset) => {
                      const meta = TYPE_META[typeOf(asset)];
                      const Icon = meta.icon;
                      return (
                        <div className="sg-asset-name">
                          <span className={`sg-asset-icn ${meta.tone}`}>
                            <Icon size={16} strokeWidth={1.9} />
                          </span>
                          <span className="sg-asset-name-copy">
                            <span className="sg-asset-title">{asset.title}</span>
                          </span>
                        </div>
                      );
                    },
                  },
                  {
                    title: "类型",
                    dataIndex: "type",
                    width: 96,
                    render: (_v, asset) => (
                      <span className="sg-subtle">{TYPE_META[typeOf(asset)].label}</span>
                    ),
                  },
                  {
                    title: "所有者",
                    dataIndex: "ownerDisplayName",
                    width: 72,
                    render: (_v, asset) => (
                      <OwnerAvatar name={ownerDisplayName(asset, authSession)} />
                    ),
                  },
                  {
                    title: "更新时间",
                    dataIndex: "updatedAt",
                    width: 104,
                    render: (v) => <span className="sg-subtle">{formatRelative(v)}</span>,
                  },
                  {
                    title: "状态",
                    dataIndex: "status",
                    width: 104,
                    render: (_v, asset) => {
                      const st = statusOf(asset);
                      return (
                        <span className="sg-status">
                          <span className={`sg-status-dot ${st.tone}`} />
                          {st.label}
                        </span>
                      );
                    },
                  },
                  {
                    title: "可见性",
                    dataIndex: "visibility",
                    width: 128,
                    render: (_v, asset) => {
                      const vis = visibleType(asset);
                      const VisIcon = vis.icon;
                      return (
                        <span className={`sg-vis ${vis.cls}`}>
                          <VisIcon size={13} />
                          {vis.label}
                        </span>
                      );
                    },
                  },
                  {
                    title: "",
                    key: "menu",
                    width: 60,
                    render: (_v, asset) => (
                      <Dropdown
                        trigger={["hover"]}
                        mouseEnterDelay={0}
                        mouseLeaveDelay={0.15}
                        placement="bottomRight"
                        open={openAssetMenuId === asset.id}
                        onOpenChange={(open) => setOpenAssetMenuId(open ? asset.id : null)}
                        menu={{
                          items: [
                            { key: "open", label: "打开资产" },
                            ...(workspaceWritable && !includeDeleted
                              ? [{ key: "edit", label: "编辑资产" }]
                              : []),
                            includeDeleted
                              ? { key: "restore", label: "恢复" }
                              : { key: "delete", label: "删除", danger: true },
                          ] satisfies MenuProps["items"],
                          onClick: ({ key }) => {
                            if (key === "open") navigate(assetHref(asset));
                            if (key === "edit") navigate(`/assets/${asset.id}/edit`);
                            if (key === "delete") {
                              confirmDeleteAssets([{ id: asset.id, title: asset.title }]);
                            }
                            if (key === "restore") {
                              batchMutation.mutate({ action: "restore", ids: [asset.id] });
                            }
                          },
                        }}
                      >
                        <Button
                          size="small"
                          type="text"
                          className="sg-list-action-btn"
                          onClick={(e) => e.stopPropagation()}
                          onFocus={() => setOpenAssetMenuId(asset.id)}
                          onKeyDown={(e) => {
                            if (e.key === "Escape") setOpenAssetMenuId(null);
                          }}
                          aria-label="更多操作"
                        >
                          <MoreHorizontal size={16} />
                        </Button>
                      </Dropdown>
                    ),
                  },
                ]}
              />
            </div>
          )}

          {!isLoading && paged.length > 0 && (
            <AppPagination
              total={items.length}
              current={page}
              pageSize={pageSize}
              onChange={setPage}
              onPageSizeChange={setPageSize}
            />
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
        </aside>
      </div>
    </div>
  );
}

function assetHref(asset: Asset): string {
  return `/assets/${asset.id}`;
}
