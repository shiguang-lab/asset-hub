import { Button, Empty, Field, Modal, Select, Input as UiInput, useToast } from "@shiguang/ui";
import { useDeleteConfirm } from "../../shared/useDeleteConfirm";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Dropdown, Input, Tooltip } from "antd";
import {
  BarChart3,
  Check,
  ChevronDown,
  ChevronLeft,
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
import {
  type Dispatch,
  type ReactNode,
  type SetStateAction,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useNavigate } from "react-router-dom";
import { getAuthSession } from "../../auth/session.js";
import { type Asset, api, publishedShortUrl } from "../../entities/api.js";
import { isOwnedBySession, ownerDisplayName } from "../../shared/owner.js";
import {
  type DocumentImportResult,
  useShellBreadcrumb,
  useShellDocumentActions,
} from "../../shell/layout.js";
import { PublishDialog } from "../publishing/publish-dialog.js";

const ME = "dev-user";
const FAVORITES_STORAGE_KEY = "shiguang.document-favorites";
const FOLDERS_STORAGE_KEY = "shiguang.document-folders";
const FOLDER_ASSIGNMENTS_STORAGE_KEY = "shiguang.document-folder-assignments";

type DocumentFolder = { id: string; name: string; parentId: string | null };

function OwnerAvatar({ name }: { name: string }) {
  return (
    <span className="sg-owner-stack">
      <Tooltip title={name}>
        <span className="sg-owner-avatar" role="img" aria-label={`所有者：${name}`}>
          {name.slice(0, 1)}
        </span>
      </Tooltip>
    </span>
  );
}

const DEFAULT_DOCUMENT_FOLDERS: DocumentFolder[] = [
  { id: "product", name: "产品", parentId: null },
  { id: "product-planning", name: "产品规划", parentId: "product" },
  { id: "product-requirements", name: "需求文档", parentId: "product" },
  { id: "product-design", name: "设计规范", parentId: "product" },
  { id: "research", name: "研究", parentId: null },
  { id: "research-industry", name: "行业报告", parentId: "research" },
  { id: "research-competitor", name: "竞品分析", parentId: "research" },
  { id: "data", name: "数据与看板", parentId: null },
];

const DEMO_DOCUMENTS: Asset[] = [
  {
    id: "demo-ev-report",
    workspaceId: "demo",
    ownerSubject: ME,
    type: "document",
    title: "2024 新能源汽车行业研究报告",
    description: "深入分析全球新能源汽车市场趋势，竞争格局与技术...",
    visibility: "public",
    status: "ready",
    tags: ["行业研究", "新能源汽车"],
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
    description: "聚焦越南消费金融市场现状与未来机遇，包含市场...",
    visibility: "link",
    status: "ready",
    tags: ["消费金融", "越南市场"],
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
    description: "定义 AI Agent 产品的设计原则、功能模块与交互...",
    visibility: "link",
    status: "ready",
    tags: ["产品设计", "AI Agent"],
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
    description: "Shiguang Lab 核心功能需求、用户场景与验收标...",
    visibility: "link",
    status: "ready",
    tags: ["PRD", "产品需求"],
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
    description: "可视化展示行业关键指标与趋势数据，支持多维度...",
    visibility: "public",
    status: "ready",
    tags: ["数据可视化", "Dashboard"],
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

function readStoredFolders(): DocumentFolder[] {
  if (typeof window === "undefined") return DEFAULT_DOCUMENT_FOLDERS;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(FOLDERS_STORAGE_KEY) ?? "null");
    if (Array.isArray(parsed)) {
      const folders = parsed.flatMap((folder): DocumentFolder[] => {
        if (!folder || typeof folder.id !== "string" || typeof folder.name !== "string") return [];
        return [
          {
            id: folder.id,
            name: folder.name,
            parentId: typeof folder.parentId === "string" ? folder.parentId : null,
          },
        ];
      });
      if (folders.length > 0) {
        const merged = new Map(DEFAULT_DOCUMENT_FOLDERS.map((folder) => [folder.id, folder]));
        for (const folder of folders) merged.set(folder.id, folder);
        return [...merged.values()];
      }
    }
  } catch {
    // Fall back to the built-in folders when local storage is unavailable or corrupt.
  }
  return DEFAULT_DOCUMENT_FOLDERS;
}

function readFolderAssignments(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const parsed = JSON.parse(window.localStorage.getItem(FOLDER_ASSIGNMENTS_STORAGE_KEY) ?? "{}");
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const assignments: Record<string, string> = {};
      for (const [documentId, folderId] of Object.entries(parsed)) {
        if (typeof folderId === "string") assignments[documentId] = folderId;
      }
      return assignments;
    }
  } catch {
    // Use the root directory if local storage is unavailable or corrupt.
  }
  return {};
}

function folderIdForImportPath(prefix: string, path: string): string {
  return `${prefix}-${path
    .split("/")
    .map((part) => part.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 32))
    .join("-")}`;
}

function restoreImportedDocumentFolders(
  result: DocumentImportResult,
  activeFolderId: string,
  setFolders: Dispatch<SetStateAction<DocumentFolder[]>>,
  setFolderAssignments: Dispatch<SetStateAction<Record<string, string>>>,
  setExpandedFolderIds: Dispatch<SetStateAction<string[]>>,
): void {
  if (typeof window === "undefined") return;
  try {
    const rootParentId = activeFolderId === "root" ? null : activeFolderId;
    const prefix = activeFolderId === "root" ? "import" : `import-${activeFolderId}`;
    const folderIdByPath = new Map<string, string>();

    setFolders((current) => {
      const existingIds = new Set(current.map((folder) => folder.id));
      const newFolders: DocumentFolder[] = [];
      for (const path of result.folders) {
        const parts = path.split("/").filter(Boolean);
        let parentPath = "";
        let parentId = rootParentId;
        for (const name of parts) {
          const currentPath = parentPath ? `${parentPath}/${name}` : name;
          const id = folderIdForImportPath(prefix, currentPath);
          folderIdByPath.set(currentPath, id);
          if (!existingIds.has(id) && !newFolders.some((folder) => folder.id === id)) {
            newFolders.push({ id, name, parentId });
            existingIds.add(id);
          }
          parentPath = currentPath;
          parentId = id;
        }
      }
      if (newFolders.length === 0) return current;
      const merged = new Map(current.map((folder) => [folder.id, folder]));
      for (const folder of newFolders) merged.set(folder.id, folder);
      return [...merged.values()];
    });

    const nextAssignments: Record<string, string> = {};
    for (const entry of result.entries) {
      const directory = entry.path.split("/").slice(0, -1).join("/");
      const folderId = directory ? folderIdByPath.get(directory) : rootParentId;
      if (folderId) {
        nextAssignments[entry.asset.id] = folderId;
      }
    }
    if (Object.keys(nextAssignments).length > 0) {
      setFolderAssignments((current) => ({ ...current, ...nextAssignments }));
    }
    if (rootParentId) {
      setExpandedFolderIds((current) =>
        current.includes(rootParentId) ? current : [...current, rootParentId],
      );
    }
  } catch {
    // Folder restoration is a UI enhancement; importing the assets still succeeds.
  }
}

function inferredFolderId(document: Asset): string {
  if (document.title.includes("Dashboard")) return "data";
  if (
    document.title.includes("消费金融") ||
    document.title.includes("新能源") ||
    document.sourceType === "research"
  ) {
    return "research-industry";
  }
  if (document.title.includes("Agent") || document.tags.includes("产品设计")) {
    return "product-design";
  }
  if (
    document.title.includes("PRD") ||
    document.tags.includes("PRD") ||
    document.tags.includes("产品需求")
  ) {
    return "product-requirements";
  }
  return "root";
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
  const documentActions = useShellDocumentActions();
  const toast = useToast();
  const { confirmDelete } = useDeleteConfirm();
  const queryClient = useQueryClient();
  const authSession = getAuthSession();
  const [filter, setFilter] = useState<FilterId>("all");
  const [q, setQ] = useState("");
  const [type, setType] = useState("all");
  const [tagFilter, setTagFilter] = useState("all");
  const [sort, setSort] = useState("updated");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");
  const [folders, setFolders] = useState<DocumentFolder[]>(readStoredFolders);
  const [folderAssignments, setFolderAssignments] =
    useState<Record<string, string>>(readFolderAssignments);
  const [activeFolderId, setActiveFolderId] = useState("root");
  const [treePanelOpen, setTreePanelOpen] = useState(false);
  const [expandedFolderIds, setExpandedFolderIds] = useState<string[]>(["product", "research"]);
  const [folderDialog, setFolderDialog] = useState<{
    mode: "create" | "rename";
    parentId: string | null;
    folderId?: string;
  } | null>(null);
  const [moveDialog, setMoveDialog] = useState<{
    documentId: string;
    documentTitle: string;
    folderId: string;
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
    window.localStorage.setItem(FOLDERS_STORAGE_KEY, JSON.stringify(folders));
  }, [folders]);

  useEffect(() => {
    window.localStorage.setItem(FOLDER_ASSIGNMENTS_STORAGE_KEY, JSON.stringify(folderAssignments));
  }, [folderAssignments]);

  useEffect(() => {
    if (!documentActions?.registerImportHandler) return;
    return documentActions.registerImportHandler((result) => {
      restoreImportedDocumentFolders(
        result,
        activeFolderId,
        setFolders,
        setFolderAssignments,
        setExpandedFolderIds,
      );
      void queryClient.invalidateQueries({ queryKey: ["assets", "document"] });
      void queryClient.invalidateQueries({ queryKey: ["home"] });
    });
  }, [
    documentActions,
    activeFolderId,
    setFolders,
    setFolderAssignments,
    setExpandedFolderIds,
    queryClient,
  ]);

  const { data: docs } = useQuery<{ items: Asset[]; total: number }>({
    queryKey: ["assets", "document"],
    queryFn: () => loadDocumentAssets(),
  });

  const { data: trashed } = useQuery<{ items: Asset[]; total: number }>({
    queryKey: ["assets", "document", "trash"],
    queryFn: () => loadDocumentAssets(true),
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
  const visibleFolderIds = useMemo(() => {
    if (activeFolderId === "root") return null;
    const ids = new Set([activeFolderId]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const folder of folders) {
        if (folder.parentId && ids.has(folder.parentId) && !ids.has(folder.id)) {
          ids.add(folder.id);
          changed = true;
        }
      }
    }
    return ids;
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
      .filter((a) => (tagFilter === "all" ? true : a.tags.includes(tagFilter)))
      .filter((a) =>
        visibleFolderIds === null
          ? true
          : visibleFolderIds.has(folderAssignments[a.id] ?? inferredFolderId(a)),
      )
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
          : sort === "created"
            ? new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
            : new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      );
  }, [
    all,
    authSession,
    deleted,
    favoriteIds,
    filter,
    type,
    tagFilter,
    q,
    sort,
    folderAssignments,
    visibleFolderIds,
  ]);

  useEffect(() => {
    setPage(1);
  }, [activeFolderId, filter, q, type, tagFilter, sort, pageSize]);

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

  const tags = useMemo(() => {
    const count = new Map<string, number>();
    for (const a of all) for (const t of a.tags.slice(0, 4)) count.set(t, (count.get(t) ?? 0) + 1);
    return [...count.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([t]) => t);
  }, [all]);

  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  useEffect(() => {
    setPage((current) => Math.min(current, pageCount));
  }, [pageCount]);
  const paged = useMemo(
    () => items.slice((page - 1) * pageSize, page * pageSize),
    [items, page, pageSize],
  );

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

  const moveToFolder = (documentId: string, folderId: string) => {
    setFolderAssignments((current) => ({ ...current, [documentId]: folderId }));
    const folderName = folders.find((folder) => folder.id === folderId)?.name ?? "全部文档";
    toast("success", `已移动到${folderName}`);
  };

  const openMoveDialog = (document: Asset) => {
    setOpenDocumentMenuId(null);
    setMoveDialog({
      documentId: document.id,
      documentTitle: document.title,
      folderId: folderAssignments[document.id] ?? inferredFolderId(document),
    });
  };

  const confirmMoveToFolder = () => {
    if (!moveDialog) return;
    moveToFolder(moveDialog.documentId, moveDialog.folderId);
    setMoveDialog(null);
  };

  const activeFolderPath = useMemo(() => {
    if (activeFolderId === "root") {
      return FILTERS.find((item) => item.id === filter)?.label ?? "全部文档";
    }
    const path: string[] = [];
    let current = folders.find((folder) => folder.id === activeFolderId);
    const visited = new Set<string>();
    while (current && !visited.has(current.id)) {
      path.unshift(current.name);
      visited.add(current.id);
      current = current.parentId
        ? folders.find((folder) => folder.id === current?.parentId)
        : undefined;
    }
    return path.join(" / ") || "全部文档";
  }, [activeFolderId, filter, folders]);
  useShellBreadcrumb("文档", activeFolderPath);

  const selectSystemView = (nextFilter: FilterId) => {
    setFilter(nextFilter);
    setActiveFolderId("root");
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

  const openCreateFolder = (parentId: string | null) => {
    setNewFolderName("");
    setFolderDialog({ mode: "create", parentId });
  };

  const openRenameFolder = (folder: DocumentFolder) => {
    setNewFolderName(folder.name);
    setFolderDialog({ mode: "rename", parentId: folder.parentId, folderId: folder.id });
  };

  const saveFolder = () => {
    const name = newFolderName.trim();
    if (!name || !folderDialog) return;
    if (folderDialog.mode === "rename" && folderDialog.folderId) {
      setFolders((current) =>
        current.map((folder) =>
          folder.id === folderDialog.folderId ? { ...folder, name } : folder,
        ),
      );
      toast("success", `目录已重命名为“${name}”`);
      setFolderDialog(null);
      setNewFolderName("");
      return;
    }
    const id = `folder-${Date.now()}`;
    setFolders((current) => [...current, { id, name, parentId: folderDialog.parentId }]);
    if (folderDialog.parentId) {
      setExpandedFolderIds((current) =>
        current.includes(folderDialog.parentId as string)
          ? current
          : [...current, folderDialog.parentId as string],
      );
    }
    setActiveFolderId(id);
    setFilter("all");
    setNewFolderName("");
    setFolderDialog(null);
    toast("success", `目录“${name}”已创建`);
  };

  const deleteFolder = (folder: DocumentFolder) => {
    if (!window.confirm(`删除目录“${folder.name}”及其子目录？文档将移到全部文档。`)) return;
    const deletedIds = new Set([folder.id]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const candidate of folders) {
        if (
          candidate.parentId &&
          deletedIds.has(candidate.parentId) &&
          !deletedIds.has(candidate.id)
        ) {
          deletedIds.add(candidate.id);
          changed = true;
        }
      }
    }
    setFolders((current) => current.filter((candidate) => !deletedIds.has(candidate.id)));
    setFolderAssignments((current) =>
      Object.fromEntries(
        Object.entries(current).filter(([, folderId]) => !deletedIds.has(folderId)),
      ),
    );
    setExpandedFolderIds((current) => current.filter((id) => !deletedIds.has(id)));
    if (deletedIds.has(activeFolderId)) setActiveFolderId("root");
    toast("success", "目录已删除，文档已移到全部文档");
  };

  const renderFolderTree = (parentId: string | null, depth = 0): ReactNode =>
    folders
      .filter((folder) => folder.parentId === parentId)
      .map((folder) => {
        const hasChildren = folders.some((candidate) => candidate.parentId === folder.id);
        const expanded = expandedFolderIds.includes(folder.id);
        return (
          <div key={folder.id} className="sg-docs-tree-branch">
            <div
              className={`sg-docs-tree-row ${activeFolderId === folder.id ? "active" : ""}`}
              role="treeitem"
              aria-selected={activeFolderId === folder.id}
              aria-expanded={hasChildren ? expanded : undefined}
              tabIndex={-1}
              style={{ paddingLeft: 8 + depth * 16 }}
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
                trigger={["click"]}
                placement="bottomRight"
                popupRender={() => (
                  <div className="sg-asset-menu">
                    <button type="button" onClick={() => openCreateFolder(folder.id)}>
                      新建子目录
                    </button>
                    <button type="button" onClick={() => openRenameFolder(folder)}>
                      重命名
                    </button>
                    <button type="button" className="danger" onClick={() => deleteFolder(folder)}>
                      删除目录
                    </button>
                  </div>
                )}
              >
                <button
                  type="button"
                  className="sg-docs-tree-more"
                  aria-label={`${folder.name}目录操作`}
                >
                  <MoreHorizontal size={14} />
                </button>
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
              className={`sg-docs-move-folder ${selected ? "selected" : ""}`}
              style={{ paddingLeft: 14 + depth * 22 }}
              onClick={() =>
                setMoveDialog((current) =>
                  current ? { ...current, folderId: folder.id } : current,
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
            onClick={() => documentActions?.openDocumentFilePicker()}
          >
            <FileText size={15} /> 导入文件
          </Button>
          <Button
            className="sg-assets-head-btn"
            onClick={() => documentActions?.openDocumentFolderPicker()}
          >
            <FolderOpen size={15} /> 导入目录
          </Button>
          <Button variant="primary" onClick={() => navigate("/documents/new")}>
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
              <button type="button" onClick={() => openCreateFolder(null)} aria-label="新建根目录">
                <FolderPlus size={15} />
              </button>
            </div>
          </div>
          <div className="sg-docs-tree-content">
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
            <div className="sg-docs-tree-subheading">我的目录</div>
            <div className="sg-docs-tree" role="tree" aria-label="我的目录">
              {renderFolderTree(null)}
            </div>
          </div>
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
              value={tagFilter}
              onChange={setTagFilter}
              className="sg-assets-select"
              options={[
                { value: "all", label: "全部标签" },
                ...tags.map((t) => ({ value: t, label: t })),
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
            <div className="sg-docs-view-toggle">
              <button
                type="button"
                className={viewMode === "list" ? "active" : ""}
                aria-label="列表视图"
                aria-pressed={viewMode === "list"}
                onClick={() => setViewMode("list")}
              >
                <List size={18} />
              </button>
              <button
                type="button"
                className={viewMode === "grid" ? "active" : ""}
                aria-label="网格视图"
                aria-pressed={viewMode === "grid"}
                onClick={() => setViewMode("grid")}
              >
                <Grid2X2 size={17} />
              </button>
            </div>
          </div>

          {filter === "all" && activeFolderId === "root" && (
            <section className="sg-docs-recent-section">
              <div className="sg-row-between" style={{ marginBottom: 12 }}>
                <h2 className="sg-h3" style={{ margin: 0 }}>
                  最近编辑
                </h2>
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
                    <Button variant="primary" onClick={() => navigate("/documents/new")}>
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
            <div className="sg-row-between" style={{ marginBottom: 10 }}>
              <h2 className="sg-h3" style={{ margin: 0 }}>
                {activeFolderPath}
              </h2>
              <span className="sg-subtle">共 {items.length} 项</span>
            </div>

            {paged.length === 0 ? (
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
                          trigger={["click"]}
                          placement="bottomRight"
                          open={openDocumentMenuId === d.id}
                          onOpenChange={(open) => setOpenDocumentMenuId(open ? d.id : null)}
                          popupRender={() => (
                            <div className="sg-asset-menu">
                              <button type="button" onClick={() => navigate(`/documents/${d.id}`)}>
                                打开
                              </button>
                              <button type="button" onClick={() => navigate(`/assets/${d.id}`)}>
                                详情
                              </button>
                              <button type="button" onClick={() => copyLink(d)}>
                                复制链接
                              </button>
                              <button type="button" onClick={() => toggleFavorite(d.id)}>
                                {favoriteIds.includes(d.id) ? "取消收藏" : "收藏"}
                              </button>
                              <button type="button" onClick={() => openMoveDialog(d)}>
                                移动到目录
                              </button>
                              {filter !== "trash" ? (
                                <button
                                  type="button"
                                  className="danger"
                                  onClick={() => confirmDeleteDocument(d)}
                                >
                                  删除
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() =>
                                    batchMutation.mutate({ action: "restore", ids: [d.id] })
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
                      </div>
                      <div className="sg-doc-card-body">
                        <button
                          type="button"
                          className="sg-doc-card-title"
                          onClick={() => navigate(`/documents/${d.id}`)}
                        >
                          {d.title}
                        </button>
                        {d.description ? (
                          <p className="sg-doc-card-desc">{d.description}</p>
                        ) : (
                          <div className="sg-asset-tags">
                            {d.tags.slice(0, 3).map((t) => (
                              <span key={t} className="sg-tag sg-asset-tag">
                                {t}
                              </span>
                            ))}
                          </div>
                        )}
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
                            size="sm"
                            variant="ghost"
                            className="sg-docs-action-btn ai"
                            title="AI 助手"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/documents/${d.id}`);
                            }}
                          >
                            <Sparkles size={16} />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="sg-docs-action-btn"
                            title="分享"
                            onClick={(e) => {
                              e.stopPropagation();
                              shareDocument(d);
                            }}
                          >
                            <Share2 size={15} />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="sg-docs-action-btn"
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
              <div className="sg-docs-table-wrap">
                <table className="sg-docs-table">
                  <thead>
                    <tr>
                      <th>名称</th>
                      <th className="c-owner">所有者</th>
                      <th className="c-time">更新时间</th>
                      <th className="c-vis">可见范围</th>
                      <th className="c-rel">关联</th>
                      <th className="c-menu">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paged.map((d) => {
                      const vis = visMeta(d);
                      const VisIcon = vis.icon;
                      const badges = demoMode
                        ? (DEMO_RELATIONS[d.id] ?? [])
                        : relationBadges(relMap?.[d.id]);
                      return (
                        <tr
                          key={d.id}
                          draggable
                          onDragStart={(event) => {
                            event.dataTransfer.setData("application/x-shiguang-document", d.id);
                            event.dataTransfer.effectAllowed = "move";
                          }}
                          onClick={(e) => {
                            if ((e.target as HTMLElement).closest("button, .ant-dropdown")) return;
                            navigate(`/documents/${d.id}`);
                          }}
                        >
                          <td>
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
                                ) : (
                                  <span className="sg-asset-tags">
                                    {d.tags.slice(0, 3).map((t) => (
                                      <span key={t} className="sg-tag sg-asset-tag">
                                        {t}
                                      </span>
                                    ))}
                                  </span>
                                )}
                              </span>
                            </div>
                          </td>
                          <td className="c-owner">
                            <OwnerAvatar name={ownerDisplayName(d, authSession)} />
                          </td>
                          <td className="c-time sg-subtle">{displayDate(d.updatedAt)}</td>
                          <td className="c-vis">
                            <span className={`sg-vis ${vis.cls}`}>
                              <VisIcon size={13} />
                              {vis.label}
                            </span>
                          </td>
                          <td className="c-rel">
                            {badges.length === 0 ? (
                              <span className="sg-subtle">—</span>
                            ) : (
                              badges.map((b) => (
                                <span
                                  key={b}
                                  className="sg-badge sg-badge-success"
                                  style={{ marginRight: 6 }}
                                >
                                  {b}
                                </span>
                              ))
                            )}
                          </td>
                          <td className="c-menu">
                            <div className="sg-docs-actions">
                              <Button
                                size="sm"
                                variant="ghost"
                                className="sg-docs-action-btn ai"
                                title="AI 助手"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  navigate(`/documents/${d.id}`);
                                }}
                              >
                                <Sparkles size={16} />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="sg-docs-action-btn"
                                title="分享"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  shareDocument(d);
                                }}
                              >
                                <Share2 size={15} />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="sg-docs-action-btn"
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
                                trigger={["click"]}
                                placement="bottomRight"
                                open={openDocumentMenuId === d.id}
                                onOpenChange={(open) => setOpenDocumentMenuId(open ? d.id : null)}
                                popupRender={() => (
                                  <div className="sg-asset-menu">
                                    <button
                                      type="button"
                                      onClick={() => navigate(`/documents/${d.id}`)}
                                    >
                                      打开
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => navigate(`/assets/${d.id}`)}
                                    >
                                      详情
                                    </button>
                                    <button type="button" onClick={() => copyLink(d)}>
                                      复制链接
                                    </button>
                                    <button type="button" onClick={() => toggleFavorite(d.id)}>
                                      {favoriteIds.includes(d.id) ? "取消收藏" : "收藏"}
                                    </button>
                                    <button type="button" onClick={() => openMoveDialog(d)}>
                                      移动到目录
                                    </button>
                                    {filter !== "trash" ? (
                                    <button
                                      type="button"
                                      className="danger"
                                      onClick={() => confirmDeleteDocument(d)}
                                    >
                                      删除
                                    </button>
                                    ) : (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          batchMutation.mutate({ action: "restore", ids: [d.id] })
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
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {paged.length > 0 && (
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
                    onChange={(v) => setPageSize(Number(v))}
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
          </section>
        </div>
      </div>

      <Modal
        open={Boolean(moveDialog)}
        onClose={() => setMoveDialog(null)}
        title="移动到目录"
        footer={
          <div className="sg-docs-move-footer">
            <Button onClick={() => setMoveDialog(null)}>取消</Button>
            <Button variant="primary" onClick={confirmMoveToFolder}>
              移动
            </Button>
          </div>
        }
      >
        <div className="sg-docs-move-dialog">
          <p className="sg-docs-move-hint">
            选择“{moveDialog?.documentTitle ?? "文档"}”要移动到的目录
          </p>
          <div className="sg-docs-move-tree" role="radiogroup" aria-label="目标目录">
            <button
              type="button"
              role="radio"
              aria-checked={moveDialog?.folderId === "root"}
              className={`sg-docs-move-folder ${moveDialog?.folderId === "root" ? "selected" : ""}`}
              onClick={() =>
                setMoveDialog((current) => (current ? { ...current, folderId: "root" } : current))
              }
            >
              <FileStack size={17} />
              <span>全部文档</span>
              {moveDialog?.folderId === "root" ? (
                <Check className="sg-docs-move-folder-check" size={17} />
              ) : null}
            </button>
            {renderMoveFolderOptions(null)}
          </div>
        </div>
      </Modal>

      {publishTarget ? (
        <PublishDialog asset={publishTarget} open onClose={() => setPublishTarget(null)} />
      ) : null}

      <Modal
        open={Boolean(folderDialog)}
        onClose={() => setFolderDialog(null)}
        title={folderDialog?.mode === "rename" ? "重命名目录" : "新建目录"}
        footer={
          <Button variant="primary" disabled={!newFolderName.trim()} onClick={saveFolder}>
            {folderDialog?.mode === "rename" ? "保存" : "创建目录"}
          </Button>
        }
      >
        <Field label="目录名称">
          <UiInput
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
