import { Empty, formatRelative, Loading, useToast } from "@shiguang/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { MenuProps } from "antd";
import { Button, Dropdown, Select } from "antd";
import {
  BookOpen,
  ChartNoAxesCombined,
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
  Upload,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { canWriteWorkspace, getAuthSession } from "../../auth/session.js";
import { type Asset, api } from "../../entities/api.js";
import { AppPagination } from "../../shared/AppPagination.js";
import { OwnerAvatar } from "../../shared/OwnerAvatar.js";
import { isOwnedBySession, ownerDisplayName } from "../../shared/owner.js";
import { AssetMiniPreview } from "../../shared/studio-visuals.js";
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
    tone: string;
  }
> = {
  document: { label: "文档", icon: FileText, tone: "indigo" },
  html: { label: "HTML", icon: Code2, tone: "sky" },
  dataset: { label: "数据集", icon: Database, tone: "emerald" },
  report: { label: "调研报告", icon: ChartNoAxesCombined, tone: "amber" },
  presentation: { label: "在线演示", icon: MonitorPlay, tone: "violet" },
  knowledge: { label: "知识库", icon: BookOpen, tone: "indigo" },
  image: { label: "图片", icon: ImageIcon, tone: "sky" },
  source: { label: "来源", icon: Link2, tone: "sky" },
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

type QuickId = "all" | "mine" | "shared" | "trash";

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

export function AssetsPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const { confirmDelete } = useDeleteConfirm();
  const queryClient = useQueryClient();
  const authSession = getAuthSession();
  const workspaceWritable = canWriteWorkspace(authSession);
  const [type, setType] = useState("all");
  const [q, setQ] = useState("");
  const [quick, setQuick] = useState<QuickId>("all");
  const [sort, setSort] = useState("updatedAt");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
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
      toast("success", "操作成功");
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
      .filter((a) => (includeDeleted ? Boolean(a.deletedAt) : !a.deletedAt))
      .filter((a) =>
        quick === "mine"
          ? isOwnedBySession(a, authSession)
          : quick === "shared"
            ? !isOwnedBySession(a, authSession)
            : true,
      )
      .filter((a) =>
        type === "all" ? true : type === "other" ? !TYPE_META[a.type] : a.type === type,
      )
      .filter((a) =>
        q.trim() ? `${a.title} ${a.description}`.toLowerCase().includes(q.toLowerCase()) : true,
      )
      .sort((a, b) =>
        sort === "title"
          ? a.title.localeCompare(b.title)
          : new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      );
  }, [all, authSession, includeDeleted, q, quick, sort, type]);

  const paged = useMemo(
    () => items.slice((page - 1) * pageSize, page * pageSize),
    [items, page, pageSize],
  );

  useEffect(() => {
    setPage(1);
  }, [type, q, quick, pageSize]);

  const typeCount = (id: string) =>
    all.filter((a) =>
      id === "all"
        ? !a.deletedAt
        : id === "other"
          ? !TYPE_META[a.type] && !a.deletedAt
          : a.type === id && !a.deletedAt,
    ).length;

  const quickCount = (id: QuickId): number => {
    if (id === "mine")
      return all.filter((a) => !a.deletedAt && isOwnedBySession(a, authSession)).length;
    if (id === "shared")
      return all.filter((a) => !a.deletedAt && !isOwnedBySession(a, authSession)).length;
    if (id === "trash") return all.filter((a) => Boolean(a.deletedAt)).length;
    return all.filter((a) => !a.deletedAt).length;
  };

  const recentOpen = useMemo(
    () =>
      all
        .filter((a) => !a.deletedAt)
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
        .slice(0, 3),
    [all],
  );

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
    if (a.visibility === "public") return { icon: Globe, tone: "emerald", label: "公开" };
    if (a.visibility === "link") return { icon: Link2, tone: "sky", label: "链接可见" };
    return { icon: Lock, tone: "neutral", label: "私有" };
  };

  const showSpotlight =
    !isLoading && quick === "all" && type === "all" && !q.trim() && recentOpen.length > 0;

  return (
    <div className="zx-ast-studio">
      <div className="zx-ast-head">
        <div>
          <h1>资产中心</h1>
          <p>跨形态收纳文档、交互式 HTML、数据集、调研报告、演示文稿与知识库</p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div className="zx-storage-pill tabular" title={`存储已用 ${storageSummary.pct}%`}>
            <span>
              空间 <b>{storageSummary.used}</b> / {storageSummary.quota}
            </span>
            <span className="zx-mini-meter">
              <i style={{ width: `${Math.max(4, storageSummary.pct)}%` }} />
            </span>
          </div>
          <button type="button" className="zx-btn-glass" onClick={() => navigate("/knowledge/new")}>
            <Upload size={14} /> 导入
          </button>
          <button type="button" className="zx-btn-cta" onClick={() => navigate("/documents/new")}>
            <Plus size={15} strokeWidth={2.3} /> 新建资产
          </button>
        </div>
      </div>

      <div className="zx-type-bar tabular">
        <div className="zx-type-seg" role="tablist" aria-label="资产类型筛选">
          {TYPE_ORDER.filter((t) => t.id !== "other" || typeCount("other") > 0).map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={type === t.id}
              className={`zx-t-pill ${type === t.id ? "active" : ""}`}
              onClick={() => setType(t.id)}
            >
              <span>{t.label}</span>
              <small>{typeCount(t.id)}</small>
            </button>
          ))}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          {(
            [
              { id: "mine", label: "我创建的" },
              { id: "shared", label: "我参与的" },
              { id: "trash", label: "回收站" },
            ] as const
          ).map((qf) => (
            <button
              key={qf.id}
              type="button"
              className={`zx-qf-pill ${quick === qf.id ? "active" : ""}`}
              onClick={() => setQuick(quick === qf.id ? "all" : qf.id)}
            >
              {qf.label} · {quickCount(qf.id)}
            </button>
          ))}

          <div className="zx-doc-search-pill" style={{ width: 204, height: 34 }}>
            <Search size={14} />
            <input
              placeholder="搜索资产…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              aria-label="搜索资产"
            />
            {q && (
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
                onClick={() => setQ("")}
                aria-label="清空搜索"
              >
                <X size={13} />
              </button>
            )}
          </div>
        </div>
      </div>

      {showSpotlight && (
        <section>
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--sg-fg-2)", marginBottom: 10 }}>
            最近打开
          </div>
          <div className="zx-spot-grid">
            {recentOpen.map((a) => {
              const meta = TYPE_META[typeOf(a)];
              return (
                <button
                  key={a.id}
                  type="button"
                  className="zx-spot-card"
                  onClick={() => navigate(assetHref(a))}
                >
                  <div className="zx-spot-thumb">
                    <AssetMiniPreview asset={a} />
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: 700,
                        color: "var(--sg-fg)",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {a.title}
                    </div>
                    <div
                      style={{
                        marginTop: 7,
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        fontSize: 12,
                        color: "var(--sg-muted)",
                      }}
                      className="tabular"
                    >
                      <span className={`zx-pill ${meta.tone}`}>{meta.label}</span>
                      <span>{formatRelative(a.updatedAt)}</span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {isLoading ? (
        <Loading loading minHeight={320} />
      ) : paged.length === 0 ? (
        <Empty
          title={includeDeleted ? "回收站为空" : "没有匹配的资产"}
          hint="创建文档、上传文件或发起调研后，资产会出现在这里。"
        />
      ) : (
        <div className="zx-strip-list">
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              fontSize: 13,
              fontWeight: 700,
              color: "var(--sg-fg-2)",
              marginBottom: 2,
            }}
          >
            <span>{includeDeleted ? "回收站资产" : "全部资产流"}</span>
            <Select
              value={sort}
              onChange={setSort}
              variant="borderless"
              style={{ minWidth: 120 }}
              options={[
                { value: "updatedAt", label: "按最近更新" },
                { value: "title", label: "按名称排序" },
              ]}
            />
          </div>

          {paged.map((asset) => {
            const meta = TYPE_META[typeOf(asset)];
            const Icon = meta.icon;
            const st = statusOf(asset);
            const vis = visibleType(asset);
            const VisIcon = vis.icon;

            return (
              <div
                key={asset.id}
                className="zx-asset-strip"
                onClick={(e) => {
                  if ((e.target as HTMLElement).closest(".ant-dropdown, button")) return;
                  navigate(assetHref(asset));
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 13, minWidth: 0 }}>
                  <span className={`zx-jewel ${meta.tone}`} style={{ width: 38, height: 38 }}>
                    <Icon size={16} strokeWidth={1.9} />
                  </span>
                  <strong
                    style={{
                      fontSize: 14,
                      fontWeight: 660,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {asset.title}
                  </strong>
                </div>

                <div>
                  <span className={`zx-pill ${meta.tone}`}>{meta.label}</span>
                </div>

                <div className="hide-md">
                  <span className="sg-status" style={{ fontSize: 12.5, color: "var(--sg-fg-2)" }}>
                    <span className={`sg-status-dot ${st.tone}`} />
                    {st.label}
                  </span>
                </div>

                <div>
                  <span className={`zx-pill ${vis.tone}`}>
                    <VisIcon size={12} /> {vis.label}
                  </span>
                </div>

                <div
                  className="hide-md tabular"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 7,
                    fontSize: 12,
                    color: "var(--sg-muted)",
                  }}
                >
                  <OwnerAvatar name={ownerDisplayName(asset, authSession)} />
                  <span>{formatRelative(asset.updatedAt)}</span>
                </div>

                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <Dropdown
                    trigger={["click"]}
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
                        setOpenAssetMenuId(null);
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
                      aria-label="更多操作"
                    >
                      <MoreHorizontal size={16} />
                    </Button>
                  </Dropdown>
                </div>
              </div>
            );
          })}
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
  );
}

function assetHref(asset: Asset): string {
  return `/assets/${asset.id}`;
}
