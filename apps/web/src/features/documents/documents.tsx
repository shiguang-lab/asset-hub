import { Empty, Field, Loading, Scrollbar, useToast } from "@shiguang/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { MenuProps } from "antd";
import { App, Button, Dropdown, Input, Modal, Select } from "antd";
import { createStyles } from "antd-style";
import {
  BarChart3,
  Check,
  ChevronDown,
  Code2,
  FileStack,
  FileText,
  Folder,
  FolderOpen,
  Globe,
  Grid2X2,
  Link2,
  List,
  Lock,
  MonitorPlay,
  MoreHorizontal,
  Plus,
  Search,
  Share2,
  Sparkles,
  Star,
  X,
} from "lucide-react";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getAuthSession } from "../../auth/session.js";
import { type Asset, api, publishedShortUrl } from "../../entities/api.js";
import { AppPagination } from "../../shared/AppPagination.js";
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
import { AssetMiniPreview } from "../../shared/studio-visuals.js";
import { useDeleteConfirm } from "../../shared/useDeleteConfirm";
import { useShellBreadcrumb, useShellDocumentActions } from "../../shell/layout.js";
import { PublishDialog } from "../publishing/publish-dialog.js";

const useDocumentsPageStyles = createStyles(() => ({
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
    description: "深入分析全球新能源汽车市场趋势、竞争格局与供应链策略",
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
    description: "聚焦越南消费金融市场现状与机遇，包含头部持牌机构对比",
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
    description: "定义 AI Agent 产品的设计原则、多轮协同模块与交互边界",
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
    description: "Shiguang Lab 核心功能需求、C 端创作工作流与验收标准",
    visibility: "private",
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
    description: "可视化展示行业关键指标与趋势数据，支持多维度漏斗分析",
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

const FOLDER_COLORS = ["#F59E0B", "#818CF8", "#34D399", "#38BDF8", "#F472B6", "#C084FC"];

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
    ["document", "report", "html"].map(async (assetType) => {
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
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

function documentHref(doc: Pick<Asset, "id" | "type">): string {
  return doc.type === "html" ? `/html/${doc.id}` : `/documents/${doc.id}`;
}

function documentPreviewHref(doc: Pick<Asset, "id" | "type">): string {
  return doc.type === "html" ? `/html/${doc.id}?preview=1` : `/documents/${doc.id}/preview`;
}

function documentIcon(doc: Pick<Asset, "type" | "title">) {
  if (doc.type === "html") return Code2;
  if (doc.title.includes("Dashboard")) return BarChart3;
  if (doc.title.includes("消费金融") || doc.title.includes("Agent")) return MonitorPlay;
  return FileText;
}

function documentTone(doc: Pick<Asset, "type" | "title">): string {
  if (doc.type === "html") return "sky";
  if (doc.title.includes("Dashboard")) return "amber";
  if (doc.title.includes("消费金融") || doc.title.includes("Agent")) return "violet";
  return "indigo";
}

function destinationPath(document: Asset, folderPath: string): string {
  const leaf = fileNameOf(document.path) || leafFromTitle(document.title) || document.id;
  return joinFolderPath(folderPath, leaf);
}

function toFolderScope(activeFolderId: string): string {
  return activeFolderId === ROOT_FOLDER_ID ? "" : activeFolderId;
}

function visMeta(a: Asset): { icon: typeof Globe; pillTone: string; label: string } {
  if (a.visibility === "public") return { icon: Globe, pillTone: "emerald", label: "公开" };
  if (a.visibility === "link") return { icon: Link2, pillTone: "sky", label: "链接可见" };
  return { icon: Lock, pillTone: "neutral", label: "私有" };
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

function relationPillTone(label: string): string {
  if (label.includes("演示")) return "violet";
  if (label.includes("知识库")) return "indigo";
  if (label === "草稿") return "neutral";
  return "emerald";
}

export function DocumentsPage() {
  const navigate = useNavigate();
  const { styles } = useDocumentsPageStyles();
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
  const [sort, setSort] = useState("updated");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(18);
  const [viewMode, setViewMode] = useState<"list" | "grid">("grid");
  const [activeFolderId, setActiveFolderId] = useState(ROOT_FOLDER_ID);
  const [openFolderMenuId, setOpenFolderMenuId] = useState<string | null>(null);
  const [folderDialog, setFolderDialog] = useState<
    { mode: "create"; parentPath: string } | { mode: "rename"; folderId: string } | null
  >(null);
  const [moveDialog, setMoveDialog] = useState<{
    documentId: string;
    documentTitle: string;
    folderId: string;
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
  const newDocumentHref = folderScope
    ? `/documents/new?folder=${encodeURIComponent(folderScope)}`
    : "/documents/new";
  const newHtmlHref = folderScope
    ? `/html/new?folder=${encodeURIComponent(folderScope)}`
    : "/html/new";
  const createMenuItems: MenuProps["items"] = [
    { key: "markdown", icon: <FileText size={15} />, label: "Markdown 文档" },
    { key: "html", icon: <Code2 size={15} />, label: "交互式 HTML 页面" },
  ];
  const onCreateMenuClick: MenuProps["onClick"] = ({ key }) => {
    navigate(key === "html" ? newHtmlHref : newDocumentHref);
  };

  useEffect(() => {
    if (activeFolderId === ROOT_FOLDER_ID) return;
    if (folders.some((folder) => folder.id === activeFolderId)) return;
    setActiveFolderId(ROOT_FOLDER_ID);
  }, [activeFolderId, folders]);

  const liveDocs = useMemo(() => all.filter((a) => !a.deletedAt), [all]);

  const filterCounts = useMemo<Record<FilterId, number>>(
    () => ({
      all: liveDocs.length,
      recent: liveDocs.filter((a) => withinDays(a.updatedAt, 30)).length,
      mine: liveDocs.filter((a) => isOwnedBySession(a, authSession)).length,
      shared: liveDocs.filter((a) => !isOwnedBySession(a, authSession)).length,
      favorites: liveDocs.filter((a) => favoriteIds.includes(a.id)).length,
      published: liveDocs.filter((a) => Boolean(a.publishedUrl)).length,
      trash: deleted.filter((a) => Boolean(a.deletedAt)).length,
    }),
    [authSession, deleted, favoriteIds, liveDocs],
  );

  const items = useMemo(() => {
    const base = filter === "trash" ? deleted.filter((a) => Boolean(a.deletedAt)) : liveDocs;
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
  }, [authSession, deleted, favoriteIds, filter, folderScope, liveDocs, q, sort]);

  useEffect(() => {
    setPage(1);
  }, [activeFolderId, filter, q, sort, pageSize]);

  const stats = useMemo(() => {
    if (demoMode) return { total: 28, weekCreated: 6, published: 8 };
    return {
      total: liveDocs.length,
      weekCreated: liveDocs.filter((a) => withinDays(a.createdAt, 7)).length,
      published: liveDocs.filter((a) => Boolean(a.publishedUrl)).length,
    };
  }, [demoMode, liveDocs]);

  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  useEffect(() => {
    setPage((current) => Math.min(current, pageCount));
  }, [pageCount]);
  const paged = useMemo(
    () => items.slice((page - 1) * pageSize, page * pageSize),
    [items, page, pageSize],
  );

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
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(shortUrl);
    }
    toast("success", "链接已复制");
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

  const moveToFolder = async (documentId: string, folderPath: string) => {
    const document = all.find((item) => item.id === documentId);
    if (!document) return;
    const next = destinationPath(document, folderPath);
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
      toast("success", `目录「${fileNameOf(path)}」已创建`);
    } catch (error) {
      toast("error", error instanceof Error ? error.message : "目录创建失败");
    }
  };

  const removeFolder = async (path: string) => {
    try {
      await api("/document-folders", { method: "DELETE", params: { path } });
      refreshFolders();
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
    if (key === "open") navigate(documentHref(document));
    if (key === "preview") navigate(documentPreviewHref(document));
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
  };

  const selectFolder = (folderId: string) => {
    setFilter("all");
    setActiveFolderId(folderId);
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

  // Visible folder chips: top-level folders + direct children of active folder
  const visibleFolders = useMemo(() => {
    const roots = folders.filter((f) => f.parentId === null);
    if (activeFolderId === ROOT_FOLDER_ID) return roots;
    const children = folders.filter((f) => f.parentId === activeFolderId);
    const activeNode = folders.find((f) => f.id === activeFolderId);
    const merged = new Map<string, DocumentFolder>();
    for (const r of roots) merged.set(r.id, r);
    if (activeNode) merged.set(activeNode.id, activeNode);
    for (const c of children) merged.set(c.id, c);
    return [...merged.values()];
  }, [activeFolderId, folders]);

  const folderDocCount = (folderPath: string) =>
    liveDocs.filter((d) => isInFolder(d.path ?? "", folderPath)).length;

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
    <div className="zx-doc-studio">
      <div className="zx-studio-top">
        <div>
          <div className="zx-title-pack">
            <h1>文档</h1>
            <div className="zx-whisper-metrics tabular">
              <span>
                共 <b>{stats.total}</b> 篇
              </span>
              <span>·</span>
              <span>
                本周新建 <b>{stats.weekCreated}</b>
              </span>
              <span>·</span>
              <span>
                已发布 <b>{stats.published}</b>
              </span>
            </div>
          </div>
          <p className="zx-studio-sub">
            沉浸式 Markdown、交互式 HTML 与 AI 协同创作空间，支持多级目录整理与一键短链分享
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
          <button
            type="button"
            className="zx-btn-glass"
            onClick={() => documentActions?.openDocumentFilePicker({ pathPrefix: folderScope })}
          >
            <FileText size={14} /> 导入文件
          </button>
          <button
            type="button"
            className="zx-btn-glass"
            onClick={() => documentActions?.openDocumentFolderPicker({ pathPrefix: folderScope })}
          >
            <FolderOpen size={14} /> 导入目录
          </button>
          <Dropdown
            trigger={["click"]}
            placement="bottomRight"
            menu={{ items: createMenuItems, onClick: onCreateMenuClick }}
          >
            <button type="button" className="zx-btn-cta">
              <Plus size={15} strokeWidth={2.3} /> 新建文档{" "}
              <ChevronDown size={13} style={{ marginLeft: -2, opacity: 0.85 }} />
            </button>
          </Dropdown>
        </div>
      </div>

      <div className="zx-filter-deck">
        <div className="zx-scope-bar">
          <div className="zx-seg-tabs tabular" role="tablist" aria-label="文档筛选范围">
            {FILTERS.map((view) => {
              const active = filter === view.id && activeFolderId === ROOT_FOLDER_ID;
              return (
                <button
                  key={view.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  className={`zx-seg-tab ${active ? "active" : ""}`}
                  onClick={() => selectSystemView(view.id)}
                >
                  <span>{view.label}</span>
                  <small>{filterCounts[view.id]}</small>
                </button>
              );
            })}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
            <div className="zx-doc-search-pill">
              <Search size={14} />
              <input
                placeholder="筛选文档标题…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                aria-label="筛选文档标题"
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

            <div className="zx-seg-tabs" style={{ borderRadius: 999, padding: 3 }}>
              <button
                type="button"
                className={`zx-seg-tab ${viewMode === "grid" ? "active" : ""}`}
                style={{ borderRadius: 999, padding: "0 11px", height: 28 }}
                onClick={() => setViewMode("grid")}
              >
                <Grid2X2 size={14} /> 画廊
              </button>
              <button
                type="button"
                className={`zx-seg-tab ${viewMode === "list" ? "active" : ""}`}
                style={{ borderRadius: 999, padding: "0 11px", height: 28 }}
                onClick={() => setViewMode("list")}
              >
                <List size={14} /> 列表
              </button>
            </div>
          </div>
        </div>

        <div className="zx-folder-strip">
          <div className="zx-folder-chips tabular">
            <div
              className={`zx-f-chip-wrap ${activeFolderId === ROOT_FOLDER_ID ? "active" : ""}`}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                const documentId = event.dataTransfer.getData("application/x-shiguang-document");
                if (documentId) void moveToFolder(documentId, "");
              }}
            >
              <button
                type="button"
                className="zx-f-chip"
                style={{ paddingRight: 13 }}
                onClick={() => setActiveFolderId(ROOT_FOLDER_ID)}
              >
                全部目录
              </button>
            </div>

            {visibleFolders.map((folder, index) => {
              const isActive = activeFolderId === folder.id;
              const color = FOLDER_COLORS[index % FOLDER_COLORS.length];
              const label = folder.parentId ? folderDisplayPath(folders, folder.id) : folder.name;
              return (
                <div
                  key={folder.id}
                  className={`zx-f-chip-wrap ${isActive ? "active" : ""}`}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    event.preventDefault();
                    const documentId = event.dataTransfer.getData(
                      "application/x-shiguang-document",
                    );
                    if (documentId) void moveToFolder(documentId, folder.id);
                  }}
                >
                  <button
                    type="button"
                    className="zx-f-chip"
                    onClick={() => selectFolder(folder.id)}
                  >
                    <Folder size={13.5} fill={color} color={color} />
                    <span>{label}</span>
                    <span style={{ opacity: 0.72 }}>· {folderDocCount(folder.id)}</span>
                  </button>
                  <Dropdown
                    trigger={["click"]}
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
                        setOpenFolderMenuId(null);
                        if (key === "create-child") openCreateFolder(folder.id);
                        if (key === "rename") openRenameFolder(folder);
                        if (key === "delete") deleteFolder(folder);
                      },
                    }}
                  >
                    <button
                      type="button"
                      className="zx-f-chip-more"
                      onClick={(e) => e.stopPropagation()}
                      aria-label={`${folder.name}目录操作`}
                    >
                      <MoreHorizontal size={13} />
                    </button>
                  </Dropdown>
                </div>
              );
            })}

            <button
              type="button"
              className="zx-f-chip-create"
              onClick={() => openCreateFolder(folderScope)}
            >
              + 新建目录
            </button>
          </div>

          <Select
            value={sort}
            onChange={setSort}
            variant="borderless"
            style={{ minWidth: 136 }}
            options={[
              { value: "updated", label: "按最近更新排序" },
              { value: "created", label: "按最近创建排序" },
              { value: "title", label: "按标题字母排序" },
            ]}
          />
        </div>
      </div>

      {listLoading ? (
        <Loading loading minHeight={360} />
      ) : paged.length === 0 ? (
        <Empty
          title={
            filter === "trash"
              ? "回收站为空"
              : filter === "favorites"
                ? "暂无收藏文档"
                : "没有匹配的文档"
          }
          hint="创建文档、上传文件或发起调研后，文档会展示在这里。"
          action={
            filter !== "trash" ? (
              <Dropdown
                trigger={["click"]}
                placement="bottom"
                menu={{ items: createMenuItems, onClick: onCreateMenuClick }}
              >
                <button type="button" className="zx-btn-cta">
                  <Plus size={15} /> 新建文档{" "}
                  <ChevronDown size={13} style={{ marginLeft: -2, opacity: 0.85 }} />
                </button>
              </Dropdown>
            ) : undefined
          }
        />
      ) : viewMode === "grid" ? (
        <div className="zx-doc-gallery">
          {paged.map((d) => {
            const vis = visMeta(d);
            const VisIcon = vis.icon;
            const badges = demoMode ? (DEMO_RELATIONS[d.id] ?? []) : relationBadges(relMap?.[d.id]);
            const primaryRel = badges[0] ?? (d.publishedUrl ? "已发布" : "草稿");
            const isStarred = favoriteIds.includes(d.id);

            return (
              <article
                key={d.id}
                className="zx-paper-card"
                draggable
                onDragStart={(event) => {
                  event.dataTransfer.setData("application/x-shiguang-document", d.id);
                  event.dataTransfer.effectAllowed = "move";
                }}
                onClick={() => navigate(documentHref(d))}
              >
                <div className="zx-paper-preview">
                  <AssetMiniPreview asset={d} />
                  <span className={`zx-float-vis zx-pill ${vis.pillTone}`}>
                    <VisIcon size={12} /> {vis.label}
                  </span>
                  <div className="zx-float-acts">
                    <button
                      type="button"
                      className="zx-mini-act ai"
                      title={
                        d.type === "html" ? "进入 HTML 代码与预览工作台" : "进入 AI 协同编辑器"
                      }
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(documentHref(d));
                      }}
                    >
                      {d.type === "html" ? <Code2 size={13.5} /> : <Sparkles size={13.5} />}
                    </button>
                    <button
                      type="button"
                      className="zx-mini-act"
                      title="发布 / 分享"
                      onClick={(e) => {
                        e.stopPropagation();
                        shareDocument(d);
                      }}
                    >
                      <Share2 size={13} />
                    </button>
                    <Dropdown
                      trigger={["click"]}
                      placement="bottomRight"
                      open={openDocumentMenuId === d.id}
                      onOpenChange={(open) => setOpenDocumentMenuId(open ? d.id : null)}
                      menu={{
                        items: documentMenuItems(d),
                        onClick: ({ key, domEvent }) => {
                          domEvent.stopPropagation();
                          onDocumentMenuClick(d, key);
                        },
                      }}
                    >
                      <button
                        type="button"
                        className="zx-mini-act"
                        aria-label="更多操作"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <MoreHorizontal size={14} />
                      </button>
                    </Dropdown>
                  </div>
                </div>

                <div className="zx-paper-body">
                  <div className="zx-paper-title">
                    <span>{d.title}</span>
                    {d.type === "html" && (
                      <span className="zx-pill sky" style={{ fontSize: 10.5, padding: "1px 7px" }}>
                        HTML
                      </span>
                    )}
                    {isStarred && (
                      <Star size={13.5} fill="#F59E0B" color="#F59E0B" style={{ flexShrink: 0 }} />
                    )}
                  </div>
                  <p className="zx-paper-desc">
                    {d.description ||
                      (d.type === "html"
                        ? "交互式 HTML 页面，支持实时源码编辑与沙箱运行预览"
                        : "点击进入沉浸式编辑器撰写正文与引用知识库")}
                  </p>
                  <div className="zx-paper-foot tabular">
                    <div style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}>
                      <OwnerAvatar name={ownerDisplayName(d, authSession)} />
                      <span>{displayDate(d.updatedAt)}</span>
                    </div>
                    <span className={`zx-pill ${relationPillTone(primaryRel)}`}>{primaryRel}</span>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="zx-doc-strip-list">
          {paged.map((d) => {
            const vis = visMeta(d);
            const VisIcon = vis.icon;
            const Icon = documentIcon(d);
            const badges = demoMode ? (DEMO_RELATIONS[d.id] ?? []) : relationBadges(relMap?.[d.id]);
            const primaryRel = badges[0] ?? (d.publishedUrl ? "已发布" : "草稿");
            const folderLabel = folderPathOf(d.path ?? "") || "未归类";

            return (
              <div
                key={d.id}
                className="zx-doc-strip"
                draggable
                onDragStart={(event) => {
                  event.dataTransfer.setData("application/x-shiguang-document", d.id);
                  event.dataTransfer.effectAllowed = "move";
                }}
                onClick={(e) => {
                  if ((e.target as HTMLElement).closest("button, .ant-dropdown")) return;
                  navigate(documentHref(d));
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 13, minWidth: 0 }}>
                  <span className={`zx-jewel ${documentTone(d)}`} style={{ width: 38, height: 38 }}>
                    <Icon size={16} strokeWidth={1.9} />
                  </span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <strong
                        style={{
                          fontSize: 14,
                          fontWeight: 680,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {d.title}
                      </strong>
                      {d.type === "html" && (
                        <span
                          className="zx-pill sky"
                          style={{ fontSize: 10.5, padding: "1px 7px" }}
                        >
                          HTML
                        </span>
                      )}
                      {favoriteIds.includes(d.id) && (
                        <Star size={13} fill="#F59E0B" color="#F59E0B" style={{ flexShrink: 0 }} />
                      )}
                    </div>
                    {d.description && (
                      <div
                        style={{
                          fontSize: 12,
                          color: "var(--sg-muted)",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          marginTop: 2,
                        }}
                      >
                        {d.description}
                      </div>
                    )}
                  </div>
                </div>

                <div className="hide-md">
                  <span className="zx-pill neutral">{folderLabel}</span>
                </div>

                <div className="hide-md">
                  <span className={`zx-pill ${relationPillTone(primaryRel)}`}>{primaryRel}</span>
                </div>

                <div>
                  <span className={`zx-pill ${vis.pillTone}`}>
                    <VisIcon size={12} /> {vis.label}
                  </span>
                </div>

                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 7,
                    fontSize: 12,
                    color: "var(--sg-muted)",
                  }}
                  className="tabular"
                >
                  <OwnerAvatar name={ownerDisplayName(d, authSession)} />
                  <span>{displayDate(d.updatedAt)}</span>
                </div>

                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "flex-end",
                    gap: 4,
                  }}
                >
                  <Button
                    size="small"
                    type="text"
                    className="sg-list-action-btn ai"
                    title={d.type === "html" ? "HTML 代码与预览" : "AI 协同编辑"}
                    onClick={() => navigate(documentHref(d))}
                  >
                    {d.type === "html" ? <Code2 size={15} /> : <Sparkles size={15} />}
                  </Button>
                  <Button
                    size="small"
                    type="text"
                    className="sg-list-action-btn"
                    title="发布 / 分享"
                    onClick={() => shareDocument(d)}
                  >
                    <Share2 size={14} />
                  </Button>
                  <Dropdown
                    trigger={["click"]}
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
                      aria-label="更多操作"
                    >
                      <MoreHorizontal size={15} />
                    </Button>
                  </Dropdown>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!listLoading && paged.length > 0 && (
        <AppPagination
          total={items.length}
          current={page}
          pageSize={pageSize}
          pageSizeOptions={[18, 36, 54, 72]}
          onChange={setPage}
          onPageSizeChange={setPageSize}
        />
      )}

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
                    ? { ...current, folderId: "", newFolderPath: event.target.value }
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
