import { Empty, Field, Loading, Scrollbar, useToast } from "@shiguang/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { MenuProps } from "antd";
import { App, Button, Dropdown, Input, Modal, Segmented, Select } from "antd";
import { createStyles } from "antd-style";
import {
  BarChart3,
  Check,
  ChevronDown,
  ChevronRight,
  Clock3,
  FileStack,
  FileText,
  Folder,
  FolderOpen,
  FolderPlus,
  Globe,
  Grid2X2,
  Link2,
  List,
  Lock,
  MonitorPlay,
  MoreHorizontal,
  PenLine,
  Plus,
  Search,
  Send,
  Share2,
  Sparkles,
  Star,
  Trash2,
  Users,
} from "lucide-react";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getAuthSession } from "../../auth/session.js";
import { type Asset, api, publishedShortUrl } from "../../entities/api.js";
import { AppPagination } from "../../shared/AppPagination.js";
import { AppTable } from "../../shared/AppTable.js";
import {
  legacyFolderNames,
  readLegacyFolderMigration,
} from "../../shared/document-folder-migration.js";
import {
  type DocumentFolder,
  fileNameOf,
  folderDisplayPath,
  folderPathOf,
  isInFolder,
  joinFolderPath,
  leafFromTitle,
  mergeFolderTree,
  normalizeFolderPath,
  ROOT_FOLDER_ID,
  rewriteFolderPrefix,
} from "../../shared/document-path.js";
import { OwnerAvatar } from "../../shared/OwnerAvatar.js";
import { isOwnedBySession, ownerDisplayName } from "../../shared/owner.js";
import { useDeleteConfirm } from "../../shared/useDeleteConfirm";
import { useShellBreadcrumb, useShellDocumentActions } from "../../shell/layout.js";
import { PublishDialog } from "../publishing/publish-dialog.js";

const useDocumentsPageStyles = createStyles(() => ({
  recentHeader: {
    marginBottom: 12,
  },
  allHeader: {
    marginBottom: 10,
  },
  sectionTitle: {
    margin: 0,
  },
  relationBadge: {
    marginRight: 6,
  },
  folderDepth0: { paddingLeft: 4 },
  folderDepth1: { paddingLeft: 20 },
  folderDepth2: { paddingLeft: 36 },
  folderDepth3: { paddingLeft: 52 },
  folderDepth4: { paddingLeft: 68 },
  folderDepth5: { paddingLeft: 84 },
  folderDepth6: { paddingLeft: 100 },
  folderDepth7: { paddingLeft: 116 },
  folderDepth8: { paddingLeft: 132 },
  moveDepth0: { paddingLeft: 14 },
  moveDepth1: { paddingLeft: 36 },
  moveDepth2: { paddingLeft: 58 },
  moveDepth3: { paddingLeft: 80 },
  moveDepth4: { paddingLeft: 102 },
  moveDepth5: { paddingLeft: 124 },
  moveDepth6: { paddingLeft: 146 },
  moveDepth7: { paddingLeft: 168 },
  moveDepth8: { paddingLeft: 190 },
}));

const ME = "dev-user";
const FAVORITES_STORAGE_KEY = "shiguang.document-favorites";

const DEMO_DOCUMENTS: Asset[] = [
  {
    id: "demo-ev-report",
    workspaceId: "demo",
    ownerSubject: ME,
    type: "document",
    title: "2024 新能源汽车行业研究报告",
    path: "研究/行业报告/2024 新能源汽车行业研究报告",
    description: "深入分析全球新能源汽车市场趋势，竞争格局与技术...",
    visibility: "public",
    status: "ready",
    sourceType: "manual",
    currentVersionId: "demo-1",
    lockVersion: 1,
    deletedAt: null,
    publishedUrl: "https://example.com/demo-ev-report",
    createdAt: "2026-08-01T09:00:00+08:00",
    updatedAt: "2026-08-15T10:24:00+08:00",
  },
  {
    id: "demo-vietnam-finance",
    workspaceId: "demo",
    ownerSubject: ME,
    type: "report",
    title: "越南消费金融市场分析",
    path: "研究/行业报告/越南消费金融市场分析",
    description: "聚焦越南消费金融市场现状与未来机遇，包含市场...",
    visibility: "link",
    status: "ready",
    sourceType: "research",
    currentVersionId: "demo-2",
    lockVersion: 1,
    deletedAt: null,
    publishedUrl: null,
    createdAt: "2026-07-28T09:00:00+08:00",
    updatedAt: "2026-08-14T16:48:00+08:00",
  },
  {
    id: "demo-agent-guide",
    workspaceId: "demo",
    ownerSubject: ME,
    type: "document",
    title: "AI Agent 产品设计规范",
    path: "产品/设计规范/AI Agent 产品设计规范",
    description: "定义 AI Agent 产品的设计原则、功能模块与交互...",
    visibility: "link",
    status: "ready",
    sourceType: "manual",
    currentVersionId: "demo-3",
    lockVersion: 1,
    deletedAt: null,
    publishedUrl: null,
    createdAt: "2026-07-21T09:00:00+08:00",
    updatedAt: "2026-08-13T11:32:00+08:00",
  },
  {
    id: "demo-prd",
    workspaceId: "demo",
    ownerSubject: ME,
    type: "document",
    title: "Shiguang Lab 产品需求文档",
    path: "产品/需求文档/Shiguang Lab 产品需求文档",
    description: "Shiguang Lab 核心功能需求、用户场景与验收标...",
    visibility: "link",
    status: "ready",
    sourceType: "manual",
    currentVersionId: "demo-4",
    lockVersion: 1,
    deletedAt: null,
    publishedUrl: null,
    createdAt: "2026-05-01T09:00:00+08:00",
    updatedAt: "2026-05-12T09:15:00+08:00",
  },
  {
    id: "demo-dashboard",
    workspaceId: "demo",
    ownerSubject: ME,
    type: "document",
    title: "行业数据 Dashboard",
    path: "数据与看板/行业数据 Dashboard",
    description: "可视化展示行业关键指标与趋势数据，支持多维度...",
    visibility: "public",
    status: "ready",
    sourceType: "manual",
    currentVersionId: "demo-5",
    lockVersion: 1,
    deletedAt: null,
    publishedUrl: null,
    createdAt: "2026-05-01T09:00:00+08:00",
    updatedAt: "2026-05-10T18:07:00+08:00",
  },
];

const DEMO_RELATIONS: Record<string, string[]> = {
  "demo-ev-report": ["已加入知识库"],
  "demo-vietnam-finance": ["已生成在线演示"],
  "demo-agent-guide": ["已加入知识库"],
  "demo-dashboard": ["已生成在线演示"],
};

const FILTERS = [
  { id: "all", label: "全部文档" },
  { id: "recent", label: "最近编辑" },
  { id: "mine", label: "我的文档" },
  { id: "shared", label: "与我共享" },
  { id: "favorites", label: "收藏" },
  { id: "published", label: "已发布" },
  { id: "trash", label: "回收站" },
] as const;

type FilterId = (typeof FILTERS)[number]["id"];

interface RelationRow {
  relation: { relationType: string; targetAssetId: string };
  asset: Asset | null;
  direction: "in" | "out";
}

interface AssetPage {
  items: Asset[];
  total: number | string;
  nextCursor?: string | null;
}

async function loadDocumentAssets(
  includeDeleted = false,
): Promise<{ items: Asset[]; total: number }> {
  const groups = await Promise.all(
    ["document", "report"].map(async (assetType) => {
      const collected: Asset[] = [];
      let cursor: string | undefined;
      do {
        const page = await api<AssetPage>("/assets", {
          params: { type: assetType, includeDeleted, limit: 100, cursor },
        });
        collected.push(...page.items);
        cursor = page.nextCursor ?? undefined;
      } while (cursor);
      return collected;
    }),
  );
  const items = groups.flat();
  return { items, total: items.length };
}

function withinDays(iso: string, days: number): boolean {
  return Date.now() - new Date(iso).getTime() < days * 24 * 3600 * 1000;
}

function displayDate(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const dayStart = (value: Date) =>
    new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
  const days = Math.round((dayStart(now) - dayStart(date)) / 86_400_000);
  const time = date.toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  if (days === 0) return `今天 ${time}`;
  if (days === 1) return `昨天 ${time}`;
  if (days === 2) return `前天 ${time}`;
  return `${date.getMonth() + 1}月${date.getDate()}日 ${time}`;
}

function documentIcon(title: string) {
  if (title.includes("Dashboard")) return BarChart3;
  if (title.includes("新能源") || title.includes("PRD")) return FileText;
  if (title.includes("消费金融") || title.includes("Agent")) return MonitorPlay;
  return FileText;
}

function documentTone(title: string): string {
  if (title.includes("Dashboard")) return "orange";
  if (title.includes("消费金融") || title.includes("Agent")) return "violet";
  if (title.includes("PRD")) return "blue";
  return "blue";
}

/** 移动目标路径：优先沿用已有文件名，尚未归类的文档用标题兜底。 */
function destinationPath(document: Asset, folderPath: string): string {
  const leaf = fileNameOf(document.path) || leafFromTitle(document.title) || document.id;
  return joinFolderPath(folderPath, leaf);
}

/** 目录树的两个 id 语义：真实目录用路径本身，全部文档用哨兵。 */
function toFolderScope(activeFolderId: string): string {
  return activeFolderId === ROOT_FOLDER_ID ? "" : activeFolderId;
}

function visMeta(a: Asset): { icon: typeof Globe; cls: string; label: string } {
  if (a.visibility === "public") return { icon: Globe, cls: "public", label: "公开" };
  if (a.visibility === "link") return { icon: Link2, cls: "link", label: "团队可见" };
  return { icon: Lock, cls: "private", label: "私有" };
}

function relationBadges(relations: RelationRow[] | undefined): string[] {
  const badges = new Set<string>();
  for (const r of relations ?? []) {
    if (r.direction !== "out") continue;
    if (r.relation.relationType === "generated_from") badges.add("已生成在线演示");
    if (r.relation.relationType === "knowledge_source_of") badges.add("已加入知识库");
    if (r.relation.relationType === "source_of") badges.add("已生成内容");
  }
  return [...badges];
}

export function DocumentsPage() {
  const navigate = useNavigate();
  const { styles } = useDocumentsPageStyles();
  const folderDepthClasses = [
    styles.folderDepth0,
    styles.folderDepth1,
    styles.folderDepth2,
    styles.folderDepth3,
    styles.folderDepth4,
    styles.folderDepth5,
    styles.folderDepth6,
    styles.folderDepth7,
    styles.folderDepth8,
  ];
  const moveDepthClasses = [
    styles.moveDepth0,
    styles.moveDepth1,
    styles.moveDepth2,
    styles.moveDepth3,
    styles.moveDepth4,
    styles.moveDepth5,
    styles.moveDepth6,
    styles.moveDepth7,
    styles.moveDepth8,
  ];
  const documentActions = useShellDocumentActions();
  const toast = useToast();
  const { modal } = App.useApp();
  const { confirmDelete } = useDeleteConfirm();
  const queryClient = useQueryClient();
  const authSession = getAuthSession();
  const migrationCheckedRef = useRef(false);
  const [filter, setFilter] = useState<FilterId>("all");
  const [q, setQ] = useState("");
  const [type, setType] = useState("all");
  const [sort, setSort] = useState("updated");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");
  const [activeFolderId, setActiveFolderId] = useState(ROOT_FOLDER_ID);
  const [treePanelOpen, setTreePanelOpen] = useState(false);
  const [expandedFolderIds, setExpandedFolderIds] = useState<string[]>([]);
  const [openFolderMenuId, setOpenFolderMenuId] = useState<string | null>(null);
  const [folderDialog, setFolderDialog] = useState<
    { mode: "create"; parentPath: string } | { mode: "rename"; folderId: string } | null
  >(null);
  const [moveDialog, setMoveDialog] = useState<{
    documentId: string;
    documentTitle: string;
    /** 选中的已有目录，空串代表「全部文档」。 */
    folderId: string;
    /** 直接输入的新目录路径，非空时优先于上面的选择。 */
    newFolderPath: string;
  } | null>(null);
  const [openDocumentMenuId, setOpenDocumentMenuId] = useState<string | null>(null);
  const [publishTarget, setPublishTarget] = useState<Asset | null>(null);
  const [newFolderName, setNewFolderName] = useState("");
  const [favoriteIds, setFavoriteIds] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const saved = window.localStorage.getItem(FAVORITES_STORAGE_KEY);
      const parsed = saved ? JSON.parse(saved) : [];
      return Array.isArray(parsed)
        ? parsed.filter((id): id is string => typeof id === "string")
        : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    window.localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(favoriteIds));
  }, [favoriteIds]);

  useEffect(() => {
    if (!documentActions?.registerImportHandler) return;
    // 导入的目录结构由服务端按导入路径写入 `path`，前端只需刷新列表。
    return documentActions.registerImportHandler(() => {
      void queryClient.invalidateQueries({ queryKey: ["assets", "document"] });
      void queryClient.invalidateQueries({ queryKey: ["home"] });
    });
  }, [documentActions, queryClient]);

  const { data: docs, isLoading: documentsLoading } = useQuery<{
    items: Asset[];
    total: number;
  }>({
    queryKey: ["assets", "document"],
    queryFn: () => loadDocumentAssets(),
  });

  const { data: trashed, isLoading: trashedLoading } = useQuery<{
    items: Asset[];
    total: number;
  }>({
    queryKey: ["assets", "document", "trash"],
    queryFn: () => loadDocumentAssets(true),
  });

  const { data: persistedFolders } = useQuery<{ items: Array<{ path: string }> }>({
    queryKey: ["document-folders"],
    queryFn: () => api("/document-folders"),
  });

  const batchMutation = useMutation({
    mutationFn: (input: { action: "delete" | "restore"; ids: string[] }) =>
      api("/assets:batch", { method: "POST", body: input }),
    onSuccess: () => {
      toast("success", "操作成功");
      void queryClient.invalidateQueries({ queryKey: ["assets", "document"] });
      void queryClient.invalidateQueries({ queryKey: ["home"] });
    },
  });

  const confirmDeleteDocument = (doc: Asset) => {
    confirmDelete({
      title: `删除文档「${doc.title}」？`,
      content: "删除后可在回收站恢复。",
      onConfirm: () => batchMutation.mutate({ action: "delete", ids: [doc.id] }),
    });
  };

  const demoMode = import.meta.env.DEV && (docs?.items?.length ?? 0) === 0;
  const all = useMemo(() => (demoMode ? DEMO_DOCUMENTS : (docs?.items ?? [])), [demoMode, docs]);
  const deleted = useMemo(() => trashed?.items ?? [], [trashed]);
  const listLoading = filter === "trash" ? trashedLoading : documentsLoading;
  const folders = useMemo(
    () =>
      mergeFolderTree(
        all,
        (persistedFolders?.items ?? []).map((folder) => folder.path),
      ),
    [all, persistedFolders],
  );
  const folderScope = toFolderScope(activeFolderId);
  // 在当前目录下新建文档：新建时就把 `path` 定下来，文档不会凭空落到根目录。
  const newDocumentHref = folderScope
    ? `/documents/new?folder=${encodeURIComponent(folderScope)}`
    : "/documents/new";

  // 目录是文档路径的投影，最后一批文档被移走后目录会消失，此时退回全部文档。
  useEffect(() => {
    if (activeFolderId === ROOT_FOLDER_ID) return;
    if (folders.some((folder) => folder.id === activeFolderId)) return;
    setActiveFolderId(ROOT_FOLDER_ID);
  }, [activeFolderId, folders]);

  const items = useMemo(() => {
    const base =
      filter === "trash"
        ? deleted.filter((a) => Boolean(a.deletedAt))
        : all.filter((a) => !a.deletedAt);
    return base
      .filter((a) =>
        filter === "mine"
          ? isOwnedBySession(a, authSession)
          : filter === "shared"
            ? !isOwnedBySession(a, authSession)
            : filter === "recent"
              ? withinDays(a.updatedAt, 30)
              : filter === "favorites"
                ? favoriteIds.includes(a.id)
                : filter === "published"
                  ? Boolean(a.publishedUrl)
                  : true,
      )
      .filter((a) =>
        type === "all"
          ? true
          : type === "document"
            ? a.type === "document" || a.type === "report"
            : a.type === type,
      )
      .filter((a) => isInFolder(a.path ?? "", folderScope))
      .filter((a) =>
        q.trim() ? `${a.title} ${a.description}`.toLowerCase().includes(q.toLowerCase()) : true,
      )
      .sort((a, b) =>
        sort === "title"
          ? a.title.localeCompare(b.title)
          : sort === "created"
            ? new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
            : new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      );
  }, [all, authSession, deleted, favoriteIds, filter, type, q, sort, folderScope]);

  useEffect(() => {
    setPage(1);
  }, [activeFolderId, filter, q, type, sort, pageSize]);

  const stats = useMemo(() => {
    if (demoMode) return { total: 128, weekCreated: 12, weekEdited: 23, published: 18 };
    const live = all.filter((a) => !a.deletedAt);
    return {
      total: live.length,
      weekCreated: live.filter((a) => withinDays(a.createdAt, 7)).length,
      weekEdited: live.filter((a) => withinDays(a.updatedAt, 7)).length,
      published: live.filter((a) => Boolean(a.publishedUrl)).length,
    };
  }, [all, demoMode]);

  const recent = useMemo(
    () =>
      all
        .filter((a) => !a.deletedAt)
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
        .slice(0, 3),
    [all],
  );

  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  useEffect(() => {
    setPage((current) => Math.min(current, pageCount));
  }, [pageCount]);
  const paged = useMemo(
    () => items.slice((page - 1) * pageSize, page * pageSize),
    [items, page, pageSize],
  );

  // Batch-load relations for the current page so the "关联" column is accurate.
  const { data: relMap } = useQuery<Record<string, RelationRow[]>>({
    queryKey: ["doc-relations", paged.map((d) => d.id).join(",")],
    queryFn: async () => {
      const entries = await Promise.all(
        paged.map(
          async (d) => [d.id, await api<RelationRow[]>(`/assets/${d.id}/relations`)] as const,
        ),
      );
      return Object.fromEntries(entries);
    },
    enabled: paged.length > 0 && !demoMode,
  });

  const copyLink = async (d: Asset) => {
    const shortUrl = await publishedShortUrl(d.id);
    if (!shortUrl) {
      toast("info", "该文档尚未发布，请先发布后再复制链接");
      return;
    }
    const done = () => toast("success", "链接已复制");
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(shortUrl);
      done();
    } else {
      done();
    }
  };

  const shareDocument = (document: Asset) => {
    setPublishTarget(document);
  };

  const toggleFavorite = (id: string) => {
    setFavoriteIds((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    );
    toast("success", favoriteIds.includes(id) ? "已取消收藏" : "已加入收藏");
  };

  /** 文档移动仍以 `path` 为同步真源；目录 CRUD 由独立接口持久化空目录。 */
  const assignPaths = useCallback(
    async (
      updates: Array<{ id: string; lockVersion: number; path: string }>,
    ): Promise<string[]> => {
      const failures: string[] = [];
      for (const update of updates) {
        try {
          await api<Asset>(`/assets/${update.id}`, {
            method: "PATCH",
            headers: { "if-match": `"${update.lockVersion}"` },
            body: { path: update.path },
          });
        } catch (error) {
          failures.push(error instanceof Error ? error.message : "未知错误");
        }
      }
      if (updates.length > failures.length) {
        void queryClient.invalidateQueries({ queryKey: ["assets", "document"] });
        void queryClient.invalidateQueries({ queryKey: ["home"] });
      }
      return failures;
    },
    [queryClient],
  );

  const pathUpdatesFor = (from: string, to: string) =>
    all.flatMap((document) => {
      const next = rewriteFolderPrefix(document.path ?? "", from, to);
      return next === null
        ? []
        : [{ id: document.id, lockVersion: document.lockVersion, path: next }];
    });

  /** 展开某目录的所有上级，改名或移动后仍能看到它。 */
  const expandAncestors = (folderPath: string) => {
    const ancestors: string[] = [];
    let current = folderPathOf(folderPath);
    while (current) {
      ancestors.push(current);
      current = folderPathOf(current);
    }
    if (ancestors.length === 0) return;
    setExpandedFolderIds((current) => [...new Set([...current, ...ancestors])]);
  };

  const moveToFolder = async (documentId: string, folderPath: string) => {
    const document = all.find((item) => item.id === documentId);
    if (!document) return;
    const next = destinationPath(document, folderPath);
    // 服务端以 `path` 唯一，落到同一个路径会报 ASSET_PATH_CONFLICT。
    if (next === (document.path ?? "")) {
      toast("info", "文档已在该目录下");
      return;
    }
    const failures = await assignPaths([
      { id: document.id, lockVersion: document.lockVersion, path: next },
    ]);
    if (failures.length > 0) {
      toast("error", failures[0] as string);
      return;
    }
    expandAncestors(folderPath);
    toast("success", folderPath ? `已移动到「${folderPath}」` : "已移到全部文档");
  };

  const refreshFolders = () => {
    void queryClient.invalidateQueries({ queryKey: ["document-folders"] });
    void queryClient.invalidateQueries({ queryKey: ["assets", "document"] });
  };

  const createFolder = async (path: string) => {
    try {
      await api("/document-folders", { method: "POST", body: { path } });
      refreshFolders();
      expandAncestors(path);
      setExpandedFolderIds((current) => [...new Set([...current, folderPathOf(path)])]);
      toast("success", `目录「${fileNameOf(path)}」已创建`);
    } catch (error) {
      toast("error", error instanceof Error ? error.message : "目录创建失败");
    }
  };

  const removeFolder = async (path: string) => {
    try {
      await api("/document-folders", { method: "DELETE", params: { path } });
      refreshFolders();
      setExpandedFolderIds((current) => current.filter((id) => id !== path));
      if (activeFolderId === path) setActiveFolderId(folderPathOf(path) || ROOT_FOLDER_ID);
      toast("success", `目录「${fileNameOf(path)}」已删除`);
    } catch (error) {
      toast("error", error instanceof Error ? error.message : "目录删除失败");
    }
  };

  const openMoveDialog = (document: Asset) => {
    setOpenDocumentMenuId(null);
    setMoveDialog({
      documentId: document.id,
      documentTitle: document.title,
      folderId: folderPathOf(document.path ?? ""),
      newFolderPath: "",
    });
  };

  const documentMenuItems = (document: Asset): MenuProps["items"] => [
    { key: "open", label: "打开" },
    { key: "preview", label: "文档预览" },
    { key: "copy", label: "复制链接" },
    { key: "favorite", label: favoriteIds.includes(document.id) ? "取消收藏" : "收藏" },
    { key: "move", label: "移动到目录" },
    filter !== "trash"
      ? { key: "delete", label: "删除", danger: true }
      : { key: "restore", label: "恢复" },
  ];

  const onDocumentMenuClick = (document: Asset, key: string) => {
    setOpenDocumentMenuId(null);
    if (key === "open") navigate(`/documents/${document.id}`);
    if (key === "preview") navigate(`/documents/${document.id}/preview`);
    if (key === "copy") void copyLink(document);
    if (key === "favorite") toggleFavorite(document.id);
    if (key === "move") openMoveDialog(document);
    if (key === "delete") confirmDeleteDocument(document);
    if (key === "restore") batchMutation.mutate({ action: "restore", ids: [document.id] });
  };

  const confirmMoveToFolder = async () => {
    if (!moveDialog) return;
    const typed = normalizeFolderPath(moveDialog.newFolderPath);
    const target = typed || moveDialog.folderId;
    setMoveDialog(null);
    await moveToFolder(moveDialog.documentId, target);
  };

  const activeFolderPath = useMemo(() => {
    if (activeFolderId === ROOT_FOLDER_ID) {
      return FILTERS.find((item) => item.id === filter)?.label ?? "全部文档";
    }
    return folderDisplayPath(folders, activeFolderId) || "全部文档";
  }, [activeFolderId, filter, folders]);
  useShellBreadcrumb("文档", activeFolderPath);

  const selectSystemView = (nextFilter: FilterId) => {
    setFilter(nextFilter);
    setActiveFolderId(ROOT_FOLDER_ID);
    setTreePanelOpen(false);
  };

  const selectFolder = (folderId: string) => {
    setFilter("all");
    setActiveFolderId(folderId);
    setTreePanelOpen(false);
  };

  const toggleFolder = (folderId: string) => {
    setExpandedFolderIds((current) =>
      current.includes(folderId) ? current.filter((id) => id !== folderId) : [...current, folderId],
    );
  };

  const openRenameFolder = (folder: DocumentFolder) => {
    setNewFolderName(folder.name);
    setFolderDialog({ mode: "rename", folderId: folder.id });
  };

  const openCreateFolder = (parentPath = "") => {
    setNewFolderName("");
    setFolderDialog({ mode: "create", parentPath });
  };

  const saveFolder = async () => {
    const name = normalizeFolderPath(newFolderName);
    if (!name || !folderDialog) return;
    if (name.includes("/")) {
      toast("error", "目录名称不能包含斜杠");
      return;
    }
    const from = folderDialog.mode === "rename" ? folderDialog.folderId : "";
    const parent =
      folderDialog.mode === "create"
        ? folderDialog.parentPath
        : folderPathOf(folderDialog.folderId);
    const target = joinFolderPath(parent, name);
    setFolderDialog(null);
    setNewFolderName("");
    if (folderDialog.mode === "create") {
      await createFolder(target);
      return;
    }
    try {
      await api("/document-folders", { method: "PATCH", body: { from, to: target } });
      refreshFolders();
      if (activeFolderId === from) setActiveFolderId(target);
      else if (isInFolder(activeFolderId, from)) {
        setActiveFolderId(rewriteFolderPrefix(activeFolderId, from, target) ?? ROOT_FOLDER_ID);
      }
      expandAncestors(target);
      toast("success", `目录已重命名为「${fileNameOf(target)}」`);
    } catch (error) {
      toast("error", error instanceof Error ? error.message : "目录重命名失败");
    }
  };

  const deleteFolder = (folder: DocumentFolder) => {
    const affected = pathUpdatesFor(folder.id, folderPathOf(folder.id)).length;
    const hasChildren = folders.some((candidate) => candidate.parentId === folder.id);
    if (affected || hasChildren) {
      toast("info", "该目录包含文档或子目录，请先移走内容后再删除");
      return;
    }
    confirmDelete({
      title: `删除目录「${folder.name}」？`,
      content: "删除空目录后无法恢复。",
      okText: "删除目录",
      onConfirm: () => void removeFolder(folder.id),
    });
  };

  // 目录归属曾经只存在本机 localStorage，这里做一次上传，避免改造变成静默丢数据。
  useEffect(() => {
    if (migrationCheckedRef.current || !docs) return;
    migrationCheckedRef.current = true;
    const migration = readLegacyFolderMigration(window.localStorage, docs.items);
    if (!migration) return;
    const legacyNames = legacyFolderNames(window.localStorage).slice(0, 4).join("、");
    modal.confirm({
      title: "检测到本地目录数据",
      content: `旧版本的目录（${legacyNames}）只保存在本机。上传后这些目录会对 Web 端与 Obsidian 插件同时可见。`,
      okText: "上传到云端",
      cancelText: "暂不处理",
      onOk: async () => {
        const byId = new Map(docs.items.map((item) => [item.id, item]));
        const updates = migration.updates.flatMap((update) => {
          const asset = byId.get(update.id);
          return asset
            ? [{ id: update.id, lockVersion: asset.lockVersion, path: update.path }]
            : [];
        });
        const failures = await assignPaths(updates);
        if (failures.length > 0) {
          toast("error", `${failures.length} 篇文档未能上传：${failures[0]}`);
          return;
        }
        for (const key of migration.keys) window.localStorage.removeItem(key);
        toast("success", `已上传 ${updates.length} 篇文档的目录`);
      },
    });
  }, [assignPaths, docs, modal, toast]);

  const renderFolderTree = (parentId: string | null, depth = 0): ReactNode =>
    folders
      .filter((folder) => folder.parentId === parentId)
      .map((folder) => {
        const hasChildren = folders.some((candidate) => candidate.parentId === folder.id);
        const expanded = expandedFolderIds.includes(folder.id);
        return (
          <div key={folder.id} className="sg-docs-tree-branch">
            <div
              className={`sg-docs-tree-row ${activeFolderId === folder.id ? "active" : ""} ${folderDepthClasses[Math.min(depth, folderDepthClasses.length - 1)]}`}
              role="treeitem"
              aria-selected={activeFolderId === folder.id}
              aria-expanded={hasChildren ? expanded : undefined}
              tabIndex={-1}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                const documentId = event.dataTransfer.getData("application/x-shiguang-document");
                if (documentId) moveToFolder(documentId, folder.id);
              }}
            >
              {hasChildren ? (
                <button
                  type="button"
                  className="sg-docs-tree-toggle"
                  onClick={() => toggleFolder(folder.id)}
                  aria-label={expanded ? `收起${folder.name}` : `展开${folder.name}`}
                >
                  {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                </button>
              ) : (
                <span className="sg-docs-tree-toggle" />
              )}
              <button
                type="button"
                className="sg-docs-tree-label"
                onClick={() => selectFolder(folder.id)}
              >
                {activeFolderId === folder.id ? <FolderOpen size={15} /> : <Folder size={15} />}
                <span>{folder.name}</span>
              </button>
              <Dropdown
                trigger={["hover"]}
                mouseEnterDelay={0}
                mouseLeaveDelay={0.15}
                placement="bottomRight"
                open={openFolderMenuId === folder.id}
                onOpenChange={(open) => setOpenFolderMenuId(open ? folder.id : null)}
                menu={{
                  items: [
                    { key: "create-child", label: "新建子目录" },
                    { key: "rename", label: "重命名" },
                    { key: "delete", label: "删除目录", danger: true },
                  ],
                  onClick: ({ key }) => {
                    if (key === "create-child") openCreateFolder(folder.id);
                    if (key === "rename") openRenameFolder(folder);
                    if (key === "delete") deleteFolder(folder);
                  },
                }}
              >
                <Button
                  size="small"
                  type="text"
                  className="sg-list-action-btn sg-docs-tree-more"
                  onFocus={() => setOpenFolderMenuId(folder.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") setOpenFolderMenuId(null);
                  }}
                  aria-label={`${folder.name}目录操作`}
                >
                  <MoreHorizontal size={14} />
                </Button>
              </Dropdown>
            </div>
            {hasChildren && expanded && renderFolderTree(folder.id, depth + 1)}
          </div>
        );
      });

  const renderMoveFolderOptions = (parentId: string | null, depth = 0): ReactNode =>
    folders
      .filter((folder) => folder.parentId === parentId)
      .map((folder) => {
        const selected = moveDialog?.folderId === folder.id;
        return (
          <div key={folder.id} className="sg-docs-move-folder-branch">
            <button
              type="button"
              role="radio"
              aria-checked={selected}
              className={`sg-docs-move-folder ${selected ? "selected" : ""} ${moveDepthClasses[Math.min(depth, moveDepthClasses.length - 1)]}`}
              onClick={() =>
                setMoveDialog((current) =>
                  current ? { ...current, folderId: folder.id, newFolderPath: "" } : current,
                )
              }
            >
              <Folder size={17} />
              <span>{folder.name}</span>
              {selected ? <Check className="sg-docs-move-folder-check" size={17} /> : null}
            </button>
            {renderMoveFolderOptions(folder.id, depth + 1)}
          </div>
        );
      });

  return (
    <div className="sg-docs">
      <div className="sg-assets-head">
        <div>
          <h1 className="sg-h1">文档</h1>
          <p className="sg-assets-sub">创建、管理和整理你的在线文档</p>
        </div>
        <div className="sg-docs-head-actions">
          <Button
            className="sg-assets-head-btn"
            onClick={() => documentActions?.openDocumentFilePicker({ pathPrefix: folderScope })}
          >
            <FileText size={15} /> 导入文件
          </Button>
          <Button
            className="sg-assets-head-btn"
            onClick={() => documentActions?.openDocumentFolderPicker({ pathPrefix: folderScope })}
          >
            <FolderOpen size={15} /> 导入目录
          </Button>
          <Button type="primary" onClick={() => navigate(newDocumentHref)}>
            <Plus size={15} /> 新建文档
          </Button>
        </div>
      </div>

      <div className="sg-docs-stats">
        {[
          { label: "全部文档", value: stats.total, icon: FileStack, tone: "blue" },
          { label: "本周创建", value: stats.weekCreated, icon: FolderPlus, tone: "violet" },
          { label: "最近编辑", value: stats.weekEdited, icon: PenLine, tone: "green" },
          { label: "已发布", value: stats.published, icon: Send, tone: "orange" },
        ].map((s) => (
          <div key={s.label} className="sg-docs-stat">
            <span className={`sg-docs-stat-icon ${s.tone}`}>
              <s.icon size={21} strokeWidth={1.9} />
            </span>
            <span className="sg-docs-stat-copy">
              <span className="label">{s.label}</span>
              <span className="value">{s.value}</span>
            </span>
          </div>
        ))}
      </div>

      <div className="sg-docs-workspace">
        <aside
          className={`sg-docs-tree-panel ${treePanelOpen ? "open" : ""}`}
          aria-label="文档目录树"
        >
          <div className="sg-docs-tree-heading">
            <strong>文档目录</strong>
            <div>
              <button
                type="button"
                className="sg-docs-tree-collapse"
                onClick={() => setTreePanelOpen((current) => !current)}
                aria-label={treePanelOpen ? "收起目录面板" : "展开目录面板"}
              >
                {treePanelOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
              </button>
            </div>
          </div>
          <Scrollbar className="sg-docs-tree-scroll">
            <nav className="sg-docs-system-views" aria-label="文档系统视图">
              {[
                { id: "all", label: "全部文档", icon: FileStack },
                { id: "recent", label: "最近编辑", icon: Clock3 },
                { id: "mine", label: "我的文档", icon: FileText },
                { id: "shared", label: "与我共享", icon: Users },
                { id: "favorites", label: "收藏", icon: Star },
                { id: "published", label: "已发布", icon: Send },
                { id: "trash", label: "回收站", icon: Trash2 },
              ].map((view) => (
                <button
                  key={view.id}
                  type="button"
                  className={filter === view.id && activeFolderId === "root" ? "active" : ""}
                  onClick={() => selectSystemView(view.id as FilterId)}
                >
                  <view.icon size={15} />
                  <span>{view.label}</span>
                </button>
              ))}
            </nav>
            <div className="sg-docs-tree-divider" />
            <div className="sg-docs-tree-subheading">
              <span>我的目录</span>
              <Button
                type="text"
                size="small"
                icon={<FolderPlus size={14} />}
                onClick={() => openCreateFolder()}
                aria-label="新建目录"
                title="新建目录"
              />
            </div>
            <div className="sg-docs-tree" role="tree" aria-label="我的目录">
              {renderFolderTree(null)}
            </div>
          </Scrollbar>
        </aside>

        <div className="sg-docs-main">
          <div className="sg-docs-location">
            <div>
              <span>当前位置</span>
              <strong>{activeFolderPath}</strong>
            </div>
            <span>共 {items.length} 项</span>
          </div>

          <div className="sg-assets-toolbar">
            <Input
              className="sg-assets-search"
              placeholder="搜索文档"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              prefix={<Search size={15} />}
              allowClear
            />
            <Select
              value={type}
              onChange={setType}
              className="sg-assets-select"
              options={[
                { value: "all", label: "全部类型" },
                { value: "document", label: "Markdown 文档" },
                { value: "report", label: "调研报告" },
              ]}
            />
            <Select
              value={sort}
              onChange={setSort}
              className="sg-assets-select"
              options={[
                { value: "updated", label: "最近更新" },
                { value: "created", label: "最近创建" },
                { value: "title", label: "名称" },
              ]}
            />
            <Segmented
              className="sg-docs-view-toggle"
              aria-label="显示方式"
              value={viewMode}
              onChange={(value) => setViewMode(value as typeof viewMode)}
              options={[
                {
                  value: "list",
                  icon: <List size={17} aria-hidden="true" />,
                  tooltip: "列表视图",
                },
                {
                  value: "grid",
                  icon: <Grid2X2 size={17} aria-hidden="true" />,
                  tooltip: "网格视图",
                },
              ]}
            />
          </div>

          {listLoading ? <Loading loading minHeight={360} /> : null}

          {!listLoading && filter === "all" && activeFolderId === ROOT_FOLDER_ID && (
            <section className="sg-docs-recent-section">
              <div className={`sg-row-between ${styles.recentHeader}`}>
                <h2 className={`sg-h3 ${styles.sectionTitle}`}>最近编辑</h2>
                <button
                  type="button"
                  className="sg-side-link"
                  onClick={() => {
                    setFilter("all");
                    requestAnimationFrame(() =>
                      document
                        .querySelector(".sg-docs-all-section")
                        ?.scrollIntoView({ behavior: "smooth" }),
                    );
                  }}
                >
                  查看全部
                </button>
              </div>
              {recent.length === 0 ? (
                <Empty
                  title="还没有文档"
                  hint="创建第一份 Markdown 文档，或从模板快速开始。"
                  action={
                    <Button type="primary" onClick={() => navigate(newDocumentHref)}>
                      <Plus size={15} /> 新建文档
                    </Button>
                  }
                />
              ) : (
                <div className="sg-docs-recent-grid">
                  {recent.map((d) => (
                    <button
                      key={d.id}
                      type="button"
                      className="sg-docs-recent-card"
                      onClick={() => navigate(`/documents/${d.id}`)}
                    >
                      <span className={`sg-asset-icn ${documentTone(d.title)}`}>
                        {(() => {
                          const Icon = documentIcon(d.title);
                          return <Icon size={19} strokeWidth={1.9} />;
                        })()}
                      </span>
                      <span className="sg-docs-recent-copy">
                        <span className="sg-docs-recent-title">{d.title}</span>
                        <span className="sg-docs-recent-meta">
                          <OwnerAvatar name={ownerDisplayName(d, authSession)} />
                          <span>{displayDate(d.updatedAt)}</span>
                          <span className="sg-badge sg-badge-accent">文档</span>
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </section>
          )}

          <section className="sg-docs-all-section">
            <div className={`sg-row-between ${styles.allHeader}`}>
              <h2 className={`sg-h3 ${styles.sectionTitle}`}>{activeFolderPath}</h2>
              <span className="sg-subtle">共 {items.length} 项</span>
            </div>

            {listLoading ? (
              <Loading loading minHeight={300} />
            ) : paged.length === 0 ? (
              <Empty
                title={
                  filter === "trash"
                    ? "回收站为空"
                    : filter === "favorites"
                      ? "暂无收藏"
                      : "没有匹配的文档"
                }
                hint="创建文档、上传文件或发起调研后，文档会出现在这里。"
              />
            ) : viewMode === "grid" ? (
              <div className="sg-docs-grid">
                {paged.map((d) => {
                  const vis = visMeta(d);
                  const VisIcon = vis.icon;
                  const badges = demoMode
                    ? (DEMO_RELATIONS[d.id] ?? [])
                    : relationBadges(relMap?.[d.id]);
                  const Icon = documentIcon(d.title);
                  return (
                    <article
                      key={d.id}
                      className="sg-doc-card"
                      draggable
                      onDragStart={(event) => {
                        event.dataTransfer.setData("application/x-shiguang-document", d.id);
                        event.dataTransfer.effectAllowed = "move";
                      }}
                    >
                      <div className="sg-doc-card-head">
                        <span className={`sg-asset-icn ${documentTone(d.title)}`}>
                          <Icon size={20} strokeWidth={1.9} />
                        </span>
                        <span className="sg-doc-card-type">
                          {d.type === "report" ? "调研报告" : "文档"}
                        </span>
                        <Dropdown
                          trigger={["hover"]}
                          mouseEnterDelay={0}
                          mouseLeaveDelay={0.15}
                          placement="bottomRight"
                          open={openDocumentMenuId === d.id}
                          onOpenChange={(open) => setOpenDocumentMenuId(open ? d.id : null)}
                          menu={{
                            items: documentMenuItems(d),
                            onClick: ({ key }) => onDocumentMenuClick(d, key),
                          }}
                        >
                          <Button
                            size="small"
                            type="text"
                            className="sg-list-action-btn"
                            onClick={(e) => e.stopPropagation()}
                            onFocus={() => setOpenDocumentMenuId(d.id)}
                            onKeyDown={(event) => {
                              if (event.key === "Escape") setOpenDocumentMenuId(null);
                            }}
                            aria-label="更多操作"
                          >
                            <MoreHorizontal size={16} />
                          </Button>
                        </Dropdown>
                      </div>
                      <div className="sg-doc-card-body">
                        <button
                          type="button"
                          className="sg-doc-card-title"
                          onClick={() => navigate(`/documents/${d.id}`)}
                        >
                          {d.title}
                        </button>
                        {d.description ? <p className="sg-doc-card-desc">{d.description}</p> : null}
                      </div>
                      <div className="sg-doc-card-meta">
                        <OwnerAvatar name={ownerDisplayName(d, authSession)} />
                        <span className="sg-subtle">{displayDate(d.updatedAt)}</span>
                      </div>
                      <div className="sg-doc-card-foot">
                        <span className={`sg-vis ${vis.cls}`}>
                          <VisIcon size={13} />
                          {vis.label}
                        </span>
                        <span className="sg-doc-card-relations">
                          {badges.slice(0, 1).map((b) => (
                            <span key={b} className="sg-badge sg-badge-success">
                              {b}
                            </span>
                          ))}
                        </span>
                        <div className="sg-docs-actions">
                          <Button
                            size="small"
                            type="text"
                            className="sg-list-action-btn ai"
                            title="AI 助手"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/documents/${d.id}`);
                            }}
                          >
                            <Sparkles size={16} />
                          </Button>
                          <Button
                            size="small"
                            type="text"
                            className="sg-list-action-btn"
                            title="分享"
                            onClick={(e) => {
                              e.stopPropagation();
                              shareDocument(d);
                            }}
                          >
                            <Share2 size={15} />
                          </Button>
                          <Button
                            size="small"
                            type="text"
                            className="sg-list-action-btn"
                            title={d.publishedUrl ? "复制发布链接" : "发布"}
                            aria-label={d.publishedUrl ? "复制发布链接" : "发布"}
                            onClick={(e) => {
                              e.stopPropagation();
                              shareDocument(d);
                            }}
                          >
                            <Send size={15} />
                          </Button>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <Scrollbar className="sg-docs-table-wrap">
                <AppTable<Asset>
                  rowKey="id"
                  dataSource={paged}
                  pagination={false}
                  size="middle"
                  onRow={(d) => ({
                    draggable: true,
                    style: { cursor: "pointer" },
                    onDragStart: (event) => {
                      event.dataTransfer.setData("application/x-shiguang-document", d.id);
                      event.dataTransfer.effectAllowed = "move";
                    },
                    onClick: (e) => {
                      if ((e.target as HTMLElement).closest("button, .ant-dropdown")) return;
                      navigate(`/documents/${d.id}`);
                    },
                  })}
                  columns={[
                    {
                      title: "名称",
                      dataIndex: "title",
                      render: (_v, d) => (
                        <div className="sg-asset-name">
                          <span className={`sg-asset-icn ${documentTone(d.title)}`}>
                            {(() => {
                              const Icon = documentIcon(d.title);
                              return <Icon size={16} strokeWidth={1.9} />;
                            })()}
                          </span>
                          <span className="sg-asset-name-copy">
                            <span className="sg-asset-title">{d.title}</span>
                            {d.description ? (
                              <span className="sg-docs-desc">{d.description}</span>
                            ) : null}
                          </span>
                        </div>
                      ),
                    },
                    {
                      title: "所有者",
                      dataIndex: "ownerDisplayName",
                      width: 120,
                      render: (_v, d) => <OwnerAvatar name={ownerDisplayName(d, authSession)} />,
                    },
                    {
                      title: "更新时间",
                      dataIndex: "updatedAt",
                      width: 160,
                      render: (v) => <span className="sg-subtle">{displayDate(v)}</span>,
                    },
                    {
                      title: "可见范围",
                      dataIndex: "visibility",
                      width: 140,
                      render: (_v, d) => {
                        const vis = visMeta(d);
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
                      title: "关联",
                      dataIndex: "relations",
                      width: 160,
                      render: (_v, d) => {
                        const badges = demoMode
                          ? (DEMO_RELATIONS[d.id] ?? [])
                          : relationBadges(relMap?.[d.id]);
                        return badges.length === 0 ? (
                          <span className="sg-subtle">—</span>
                        ) : (
                          badges.map((b) => (
                            <span
                              key={b}
                              className={`sg-badge sg-badge-success ${styles.relationBadge}`}
                            >
                              {b}
                            </span>
                          ))
                        );
                      },
                    },
                    {
                      title: "操作",
                      key: "menu",
                      width: 180,
                      render: (_v, d) => (
                        <div className="sg-docs-actions">
                          <Button
                            size="small"
                            type="text"
                            className="sg-list-action-btn ai"
                            title="AI 助手"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/documents/${d.id}`);
                            }}
                          >
                            <Sparkles size={16} />
                          </Button>
                          <Button
                            size="small"
                            type="text"
                            className="sg-list-action-btn"
                            title="分享"
                            onClick={(e) => {
                              e.stopPropagation();
                              shareDocument(d);
                            }}
                          >
                            <Share2 size={15} />
                          </Button>
                          <Button
                            size="small"
                            type="text"
                            className="sg-list-action-btn"
                            title={d.publishedUrl ? "复制发布链接" : "发布"}
                            aria-label={d.publishedUrl ? "复制发布链接" : "发布"}
                            onClick={(e) => {
                              e.stopPropagation();
                              shareDocument(d);
                            }}
                          >
                            <Send size={15} />
                          </Button>
                          <Dropdown
                            trigger={["hover"]}
                            mouseEnterDelay={0}
                            mouseLeaveDelay={0.15}
                            placement="bottomRight"
                            open={openDocumentMenuId === d.id}
                            onOpenChange={(open) => setOpenDocumentMenuId(open ? d.id : null)}
                            menu={{
                              items: documentMenuItems(d),
                              onClick: ({ key }) => onDocumentMenuClick(d, key),
                            }}
                          >
                            <Button
                              size="small"
                              type="text"
                              className="sg-list-action-btn"
                              onClick={(e) => e.stopPropagation()}
                              onFocus={() => setOpenDocumentMenuId(d.id)}
                              onKeyDown={(event) => {
                                if (event.key === "Escape") setOpenDocumentMenuId(null);
                              }}
                              aria-label="更多操作"
                            >
                              <MoreHorizontal size={16} />
                            </Button>
                          </Dropdown>
                        </div>
                      ),
                    },
                  ]}
                />
              </Scrollbar>
            )}

            {paged.length > 0 && (
              <AppPagination
                total={items.length}
                current={page}
                pageSize={pageSize}
                onChange={setPage}
                onPageSizeChange={setPageSize}
              />
            )}
          </section>
        </div>
      </div>

      <Modal
        open={Boolean(moveDialog)}
        onCancel={() => setMoveDialog(null)}
        title="移动到目录"
        footer={
          <div className="sg-docs-move-footer">
            <Button onClick={() => setMoveDialog(null)}>取消</Button>
            <Button type="primary" onClick={confirmMoveToFolder}>
              移动
            </Button>
          </div>
        }
        destroyOnHidden
      >
        <div className="sg-docs-move-dialog">
          <p className="sg-docs-move-hint">
            选择“{moveDialog?.documentTitle ?? "文档"}”要移动到的目录
          </p>
          <Field label="目标目录">
            <Input
              value={moveDialog?.newFolderPath ?? ""}
              onChange={(event) =>
                setMoveDialog((current) =>
                  current
                    ? // 输入新目录时清掉列表选中，避免两处同时看起来生效
                      { ...current, folderId: "", newFolderPath: event.target.value }
                    : current,
                )
              }
              placeholder="留空则用下面的选择；也可直接输入新目录，如「产品/客户项目」"
              allowClear
            />
          </Field>
          <Scrollbar className="sg-docs-move-tree" role="radiogroup" aria-label="目标目录">
            <button
              type="button"
              role="radio"
              aria-checked={moveDialog?.folderId === ""}
              className={`sg-docs-move-folder ${moveDialog?.folderId === "" ? "selected" : ""}`}
              onClick={() =>
                setMoveDialog((current) =>
                  current ? { ...current, folderId: "", newFolderPath: "" } : current,
                )
              }
            >
              <FileStack size={17} />
              <span>全部文档</span>
              {moveDialog?.folderId === "" ? (
                <Check className="sg-docs-move-folder-check" size={17} />
              ) : null}
            </button>
            {renderMoveFolderOptions(null)}
          </Scrollbar>
        </div>
      </Modal>

      {publishTarget ? (
        <PublishDialog asset={publishTarget} open onClose={() => setPublishTarget(null)} />
      ) : null}

      <Modal
        open={Boolean(folderDialog)}
        onCancel={() => setFolderDialog(null)}
        title={folderDialog?.mode === "create" ? "新建目录" : "重命名目录"}
        footer={
          <Button type="primary" disabled={!newFolderName.trim()} onClick={saveFolder}>
            {folderDialog?.mode === "create" ? "创建" : "保存"}
          </Button>
        }
        destroyOnHidden
      >
        <Field label="目录名称">
          <Input
            value={newFolderName}
            onChange={(event) => setNewFolderName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") saveFolder();
            }}
            placeholder="例如：客户项目、产品规划"
            autoFocus
          />
        </Field>
      </Modal>
    </div>
  );
}
