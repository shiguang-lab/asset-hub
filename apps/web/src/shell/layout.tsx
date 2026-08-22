import { cx, Scrollbar, useToast } from "@shiguang/ui";
import { useQuery } from "@tanstack/react-query";
import type { MenuProps } from "antd";
import { Badge, Button, Dropdown, Flex, Input, Layout, Menu, Select, Space } from "antd";
import { createStyles } from "antd-style";
import {
  ArrowRight,
  Bell,
  Blocks,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleDollarSign,
  CloudUpload,
  Code2,
  Database,
  FileStack,
  FileText,
  FolderKanban,
  Home,
  Layers3,
  LayoutTemplate,
  LoaderCircle,
  LogOut,
  MonitorPlay,
  MoreHorizontal,
  Plus,
  Search,
  SearchX,
  Settings,
  Share2,
  Sparkles,
  Star,
  UserRound,
  UsersRound,
  X,
} from "lucide-react";
import {
  createContext,
  type Dispatch,
  type SetStateAction,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  type AccountOrganization,
  type AuthSession,
  canWriteWorkspace,
  fetchMyOrganizations,
  getAuthSession,
  performLogout,
  switchContext,
} from "../auth/session.js";
import {
  type Asset,
  api,
  type CreditAccount,
  type HomeData,
  type SearchResult,
  uploadFile,
  uploadFiles,
} from "../entities/api.js";
import { AppTabs } from "../shared/AppTabs.js";
import {
  type ImportConflict,
  ImportConflictModal,
  type ImportResolutionValue,
} from "../shared/ImportConflictModal.js";
import { isOwnedBySession, ownerDisplayName } from "../shared/owner.js";
import { useSse } from "../shared/sse.js";

const { Header, Sider, Content } = Layout;

type ShellBreadcrumb = { section: string; current?: string };
type SetShellBreadcrumb = Dispatch<SetStateAction<ShellBreadcrumb | null>>;
export type ImportedDocumentEntry = { asset: Asset; path: string };
export type DocumentImportResult = {
  assets: Asset[];
  entries: ImportedDocumentEntry[];
  folders: string[];
};

export function isDocumentImportResult(
  value: Asset | DocumentImportResult,
): value is DocumentImportResult {
  return "assets" in value && Array.isArray(value.assets);
}

export type DocumentImportHandler = (result: DocumentImportResult) => void;

type ShellDocumentActions = {
  openDocumentFilePicker: () => void;
  openDocumentFolderPicker: () => void;
  registerImportHandler: (handler: DocumentImportHandler) => () => void;
};

const ShellBreadcrumbContext = createContext<SetShellBreadcrumb | null>(null);
const ShellDocumentActionsContext = createContext<ShellDocumentActions | null>(null);
const BRAND_TITLE = "知序";

export function useShellBreadcrumb(section: string, current?: string) {
  const setBreadcrumb = useContext(ShellBreadcrumbContext);
  useEffect(() => {
    if (!setBreadcrumb) return;
    setBreadcrumb({ section, current });
    return () => setBreadcrumb(null);
  }, [current, section, setBreadcrumb]);
}

export function useShellDocumentActions(): ShellDocumentActions | null {
  return useContext(ShellDocumentActionsContext);
}

const useShellStyles = createStyles(() => ({
  root: {
    height: "100vh",
    minHeight: 0,
    overflow: "hidden",
  },
  main: {
    minWidth: 0,
    minHeight: 0,
    overflow: "hidden",
  },
  content: {
    minHeight: 0,
    overflow: "hidden",
  },
  viewport: {
    height: "100%",
    minHeight: 0,
  },
}));

const NAV = [
  { to: "/", label: "首页", icon: Home },
  { to: "/documents", label: "文档", icon: FileText },
  { to: "/assets", label: "资产", icon: FolderKanban },
  { to: "/knowledge", label: "知识库", icon: BookOpen },
  { to: "/research", label: "调研", icon: Search },
  { to: "/tasks", label: "任务", icon: CheckCircle2 },
  { to: "/presentations", label: "在线演示", icon: MonitorPlay },
  { to: "/templates", label: "模板", icon: LayoutTemplate },
];

const BREADCRUMBS: Array<{ match: RegExp; label: string }> = [
  { match: /^\/assets/, label: "资产中心" },
  { match: /^\/documents/, label: "文档" },
  { match: /^\/html/, label: "HTML 页面" },
  { match: /^\/knowledge/, label: "知识库" },
  { match: /^\/research/, label: "调研" },
  { match: /^\/tasks/, label: "任务中心" },
  { match: /^\/datasets/, label: "数据看板" },
  { match: /^\/presentations/, label: "在线演示" },
  { match: /^\/templates/, label: "模板中心" },
  { match: /^\/publishes/, label: "已发布" },
  { match: /^\/assistant/, label: "AI 助手" },
  { match: /^\/notifications/, label: "通知中心" },
  { match: /^\/billing/, label: "套餐 / Credits" },
  { match: /^\/profile/, label: "个人中心" },
  { match: /^\/settings/, label: "设置" },
];

const CONTEXT_CREATE_ACTIONS: Array<{
  match: RegExp;
  label: string;
  target: string;
}> = [
  { match: /^\/documents(?:\/|$)/, label: "新建文档", target: "/documents/new" },
  { match: /^\/html(?:\/|$)/, label: "新建 HTML 页面", target: "/html/new" },
  { match: /^\/knowledge(?:\/|$)/, label: "新建知识库", target: "/knowledge/new" },
  { match: /^\/research(?:\/|$)/, label: "新建调研", target: "/research/new" },
  { match: /^\/tasks(?:\/|$)/, label: "新建任务", target: "/tasks/new" },
  { match: /^\/presentations(?:\/|$)/, label: "新建在线演示", target: "/presentations/new" },
];

function accountInitial(displayName: string): string {
  return Array.from(displayName.trim())[0]?.toLocaleUpperCase() || "光";
}

export function Shell() {
  useSse();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [pageBreadcrumb, setPageBreadcrumb] = useState<ShellBreadcrumb | null>(null);
  const { styles } = useShellStyles();
  const { data: home } = useQuery<HomeData>({
    queryKey: ["home"],
    queryFn: () => api<HomeData>("/home"),
  });
  const { data: creditData } = useQuery<{ account: CreditAccount | null }>({
    queryKey: ["credits"],
    queryFn: () => api("/credits"),
  });
  const authSession = getAuthSession();
  const canWrite = canWriteWorkspace(authSession);
  const creditAccount = creditData?.account;
  const creditTotal = Math.max(creditAccount?.totalGranted ?? home?.credits ?? 0, 0);
  const creditsUsed = Math.max(creditAccount?.totalUsed ?? 0, 0);
  const creditUsagePercent = creditTotal > 0 ? Math.min(100, (creditsUsed / creditTotal) * 100) : 0;
  const displayName = authSession?.displayName ?? "用户";

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!paletteOpen) return;
    const frame = window.requestAnimationFrame(() => {
      document.querySelector<HTMLInputElement>(".sg-search input")?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [paletteOpen]);

  const breadcrumbSection =
    pageBreadcrumb?.section ??
    BREADCRUMBS.find((b) => b.match.test(location.pathname))?.label ??
    "";
  const fallbackCurrent = location.pathname.endsWith("/new")
    ? "新建"
    : location.pathname.endsWith("/play")
      ? "播放"
      : location.pathname.split("/").filter(Boolean).length > 1
        ? "内容"
        : "";
  const breadcrumbCurrent = pageBreadcrumb?.current || fallbackCurrent;
  useEffect(() => {
    const pageTitle = breadcrumbSection
      ? [breadcrumbCurrent, breadcrumbSection].filter(Boolean).join(" · ")
      : location.pathname === "/"
        ? "首页"
        : "页面未找到";
    document.title = `${pageTitle} | ${BRAND_TITLE}`;
  }, [breadcrumbCurrent, breadcrumbSection, location.pathname]);
  const contextCreate = CONTEXT_CREATE_ACTIONS.find((action) =>
    action.match.test(location.pathname),
  );
  const showCreateMenu = location.pathname === "/";
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const documentFileInputRef = useRef<HTMLInputElement>(null);
  const documentFolderInputRef = useRef<HTMLInputElement>(null);
  const importHandlersRef = useRef<DocumentImportHandler[]>([]);
  const documentActions = useMemo<ShellDocumentActions>(
    () => ({
      openDocumentFilePicker: () => documentFileInputRef.current?.click(),
      openDocumentFolderPicker: () => documentFolderInputRef.current?.click(),
      registerImportHandler: (handler) => {
        importHandlersRef.current.push(handler);
        return () => {
          importHandlersRef.current = importHandlersRef.current.filter((h) => h !== handler);
        };
      },
    }),
    [],
  );

  const activeKey = useMemo(() => {
    const match = NAV.filter((item) => item.to !== "/").find((item) =>
      location.pathname.startsWith(item.to),
    );
    return match?.to ?? "/";
  }, [location.pathname]);

  const menuItems: MenuProps["items"] = NAV.map((item) => {
    const Icon = item.icon;
    return {
      key: item.to,
      icon: <Icon size={17} strokeWidth={1.8} />,
      label: item.label,
    };
  });

  const onMenuClick: MenuProps["onClick"] = ({ key }) => {
    setPaletteOpen(false);
    navigate(key);
  };
  const onCreate = (key: string) => {
    if (key === "upload") {
      uploadInputRef.current?.click();
      return;
    }
    const target: Record<string, string> = {
      doc: "/documents/new",
      html: "/html/new",
      kb: "/knowledge/new",
      research: "/research/new",
      presentation: "/presentations/new",
    };
    navigate(target[key] ?? "/");
  };

  const userMenuItems: MenuProps["items"] = [
    {
      key: "identity",
      disabled: true,
      label: (
        <span className="sg-user-menu-identity">
          <strong>{displayName}</strong>
          <small>{authSession?.email ?? authSession?.organizationName ?? "个人空间"}</small>
        </span>
      ),
    },
    { type: "divider" },
    { key: "profile", icon: <UserRound size={15} />, label: "个人中心" },
    { key: "settings", icon: <Settings size={15} />, label: "设置" },
    ...(authSession?.localBroker
      ? []
      : ([
          { type: "divider" },
          { key: "logout", icon: <LogOut size={15} />, label: "退出登录", danger: true },
        ] as NonNullable<MenuProps["items"]>)),
  ];

  const onUserMenuClick: MenuProps["onClick"] = ({ key }) => {
    if (key === "logout") {
      void performLogout();
      return;
    }
    if (key === "profile") navigate("/profile");
    if (key === "settings") navigate("/settings");
  };

  const uploadAsset = async (file: File | undefined) => {
    if (!file) return;
    try {
      const asset = await uploadFile<Asset>("/assets/files", file);
      toast("success", "文件已上传到资产中心");
      navigate(`/assets/${asset.id}`);
    } catch (error) {
      toast("error", error instanceof Error ? error.message : "文件上传失败");
    }
  };

  const conflictResolverRef = useRef<{
    resolve: (resolutions: Record<string, ImportResolutionValue> | null) => void;
  } | null>(null);
  const [conflictModal, setConflictModal] = useState<{ conflicts: ImportConflict[] } | null>(null);

  const requestConflictResolution = (conflicts: ImportConflict[]) =>
    new Promise<Record<string, ImportResolutionValue> | null>((resolve) => {
      conflictResolverRef.current = { resolve };
      setConflictModal({ conflicts });
    });

  const handleConflictResolve = (resolutions: Record<string, ImportResolutionValue> | null) => {
    conflictResolverRef.current?.resolve(resolutions);
    conflictResolverRef.current = null;
    setConflictModal(null);
  };

  const computeCandidateTitles = (files: File[]): string[] => {
    const titles: string[] = [];
    for (const file of files) {
      const rel = (file as File & { webkitRelativePath?: string }).webkitRelativePath;
      const name = rel ? (rel.split("/").pop() ?? file.name) : file.name;
      if (!/\.(?:md|markdown|txt)$/i.test(name)) continue;
      const title = name.replace(/\.(?:md|markdown|txt)$/i, "").trim() || "未命名文档";
      titles.push(title);
    }
    return titles;
  };

  const importDocument = async (files: File[]) => {
    if (files.length === 0) return;
    try {
      const titles = computeCandidateTitles(files);
      let resolutions: Record<string, ImportResolutionValue> = {};
      if (titles.length > 0) {
        const { existing } = await api<{ existing: Record<string, string> }>(
          "/assets/documents/import/check",
          { method: "POST", body: { titles } },
        );
        const conflicts = titles
          .filter((title) => existing[title])
          .map((title) => ({ title, existingId: existing[title] }));
        if (conflicts.length > 0) {
          const chosen = await requestConflictResolution(conflicts);
          if (!chosen) return;
          resolutions = chosen;
        }
      }
      const query =
        Object.keys(resolutions).length > 0
          ? `?resolutions=${encodeURIComponent(JSON.stringify(resolutions))}`
          : "";
      const result = await uploadFiles<Asset | DocumentImportResult>(
        `/assets/documents/import${query}`,
        files,
      );
      if (isDocumentImportResult(result)) {
        for (const handler of importHandlersRef.current) {
          handler(result);
        }
        toast(
          "success",
          result.assets.length > 1 ? `已导入 ${result.assets.length} 个文档` : "文档已导入",
        );
        return;
      }
      toast("success", "文档已导入");
      navigate(`/documents/${result.id}`);
    } catch (error) {
      toast("error", error instanceof Error ? error.message : "文档导入失败");
    }
  };

  return (
    <ShellBreadcrumbContext.Provider value={setPageBreadcrumb}>
      <ShellDocumentActionsContext.Provider value={documentActions}>
        <Layout className={cx("sg-shell", styles.root)}>
          <input
            ref={uploadInputRef}
            type="file"
            hidden
            onChange={(event) => {
              void uploadAsset(event.target.files?.[0]);
              event.target.value = "";
            }}
          />
          <input
            ref={documentFileInputRef}
            type="file"
            multiple
            accept=".md,.markdown,.txt,.zip,text/markdown,text/plain,application/zip"
            hidden
            onChange={(event) => {
              void importDocument(Array.from(event.target.files ?? []));
              event.target.value = "";
            }}
          />
          <input
            ref={documentFolderInputRef}
            type="file"
            multiple
            // Chromium exposes a directory picker through this standard attribute.
            {...({ webkitdirectory: "" } as Record<string, string>)}
            hidden
            onChange={(event) => {
              void importDocument(Array.from(event.target.files ?? []));
              event.target.value = "";
            }}
          />
          <Sider width={266} className="sg-sidebar" theme="dark">
            <Scrollbar className={styles.viewport}>
              <Flex vertical style={{ minHeight: "100%" }}>
                <Link to="/" className="sg-sidebar-logo">
                  <span className="sg-brand-mark">
                    <Blocks size={18} />
                  </span>
                  <span className="sg-sidebar-logo-copy">
                    <b>知序</b>
                    <small>AI 知识与创作空间</small>
                  </span>
                </Link>
                <Menu
                  mode="inline"
                  items={menuItems}
                  selectedKeys={[activeKey]}
                  onClick={onMenuClick}
                  className="sg-nav"
                  style={{ background: "transparent", border: "none", flex: 1 }}
                />
                <div className="sg-sidebar-footer">
                  <Link
                    to="/settings"
                    className={cx(
                      "sg-sidebar-settings",
                      location.pathname.startsWith("/settings") && "active",
                    )}
                  >
                    <Settings size={17} />
                    <span>设置</span>
                    <ChevronRight size={15} />
                  </Link>
                  <Link to="/billing" className="sg-credits-box">
                    <div className="sg-credits-head">
                      <span className="sg-credits-title">
                        <CircleDollarSign size={13} /> AI Credits
                      </span>
                      <span className="sg-credits-percent">{Math.round(creditUsagePercent)}%</span>
                    </div>
                    <div className="sg-credits-progress">
                      <span style={{ width: `${creditUsagePercent}%` }} />
                    </div>
                  </Link>
                </div>
              </Flex>
            </Scrollbar>
          </Sider>

          <Layout className={styles.main}>
            <Header className={cx("sg-header", paletteOpen && "search-mode")}>
              <div className="sg-breadcrumb">
                {breadcrumbSection && (
                  <span className="sg-breadcrumb-section">{breadcrumbSection}</span>
                )}
                {breadcrumbSection && breadcrumbCurrent && (
                  <>
                    <ChevronRight className="sg-breadcrumb-separator" size={15} />
                    <strong className="sg-breadcrumb-current">{breadcrumbCurrent}</strong>
                  </>
                )}
              </div>
              <div className="sg-header-tools">
                <Input
                  className="sg-search"
                  value={searchQuery}
                  onFocus={() => setPaletteOpen(true)}
                  onClick={() => setPaletteOpen(true)}
                  onChange={(event) => {
                    setSearchQuery(event.target.value);
                    setPaletteOpen(true);
                  }}
                  placeholder="搜索模板、任务、文档…"
                  prefix={<Search size={15} />}
                  suffix={
                    <span className={cx("sg-search-suffix", paletteOpen && "is-active")}>
                      <button
                        type="button"
                        aria-label="关闭搜索"
                        tabIndex={paletteOpen ? 0 : -1}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={(event) => {
                          event.stopPropagation();
                          setPaletteOpen(false);
                        }}
                      >
                        <X size={15} />
                      </button>
                      <span className="sg-kbd">⌘K</span>
                    </span>
                  }
                />
                <Space size={12} className="sg-header-actions">
                  {canWrite && contextCreate && !location.pathname.startsWith("/documents") ? (
                    <Button
                      className="sg-create-button is-context"
                      type="primary"
                      icon={<Plus size={17} />}
                      onClick={() => navigate(contextCreate.target)}
                    >
                      {contextCreate.label}
                    </Button>
                  ) : canWrite && showCreateMenu ? (
                    <Dropdown
                      trigger={["click"]}
                      placement="bottomRight"
                      popupRender={() => (
                        <CreatePopover
                          onSelect={onCreate}
                          onBrowse={() => navigate("/templates")}
                        />
                      )}
                      rootClassName="sg-create-dropdown"
                    >
                      <Button className="sg-create-button" type="primary" icon={<Plus size={17} />}>
                        新建 <ChevronDown size={14} />
                      </Button>
                    </Dropdown>
                  ) : null}
                  {authSession && <SpaceSwitcher session={authSession} />}
                  <Dropdown
                    trigger={["click"]}
                    placement="bottomRight"
                    menu={{ items: userMenuItems, onClick: onUserMenuClick }}
                    rootClassName="sg-user-dropdown"
                  >
                    <button
                      type="button"
                      className="sg-header-user sg-search-profile"
                      aria-label={`${displayName}，打开用户菜单`}
                      title={displayName}
                    >
                      <span className="sg-header-account-avatar" aria-hidden="true">
                        {accountInitial(displayName)}
                      </span>
                    </button>
                  </Dropdown>
                  <Badge count={home?.unreadNotifications ?? 0} size="small">
                    <Button
                      className="sg-header-notifications"
                      type="text"
                      icon={<Bell size={18} />}
                      onClick={() => navigate("/notifications")}
                      aria-label="通知"
                    />
                  </Badge>
                </Space>
              </div>
            </Header>
            <Content className={cx(styles.content, "sg-content-shell")}>
              <Scrollbar
                className={cx(
                  styles.viewport,
                  !paletteOpen &&
                    /^\/documents\/[^/]+/.test(location.pathname) &&
                    (location.pathname.endsWith("/preview")
                      ? "sg-content-viewport-document-preview"
                      : "sg-content-viewport-document-editor"),
                )}
              >
                <div className={cx("sg-content", paletteOpen && "sg-search-content")}>
                  {paletteOpen ? (
                    <SearchWorkspace
                      query={searchQuery}
                      onQueryChange={setSearchQuery}
                      onClose={() => setPaletteOpen(false)}
                    />
                  ) : (
                    <Outlet />
                  )}
                </div>
              </Scrollbar>
            </Content>
          </Layout>
        </Layout>
      </ShellDocumentActionsContext.Provider>
      <ImportConflictModal
        open={conflictModal !== null}
        conflicts={conflictModal?.conflicts ?? []}
        onResolve={handleConflictResolve}
      />
    </ShellBreadcrumbContext.Provider>
  );
}

function SpaceSwitcher({ session }: { session: AuthSession }) {
  const toast = useToast();
  const [organizations, setOrganizations] = useState<AccountOrganization[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [switching, setSwitching] = useState(false);

  const loadOrganizations = async () => {
    if (loading || organizations) return;
    setLoading(true);
    try {
      setOrganizations(await fetchMyOrganizations());
    } catch (error) {
      toast("error", error instanceof Error ? error.message : "Group 列表加载失败");
    } finally {
      setLoading(false);
    }
  };

  const currentLabel =
    session.tenantType === "org" ? (session.organizationName ?? "Group 空间") : "个人空间";
  const CurrentIcon = session.tenantType === "org" ? UsersRound : UserRound;

  if (session.localBroker) {
    return (
      <Button
        type="text"
        className="sg-space-switcher"
        icon={<CurrentIcon size={16} />}
        title="本地 Broker 的空间由环境配置决定"
      >
        <span>{currentLabel}</span>
      </Button>
    );
  }

  const items: NonNullable<MenuProps["items"]> = [
    {
      key: "personal",
      icon: <UserRound size={15} />,
      label: "个人空间",
    },
    { type: "divider" },
  ];
  if (loading) {
    items.push({
      key: "loading",
      disabled: true,
      icon: <LoaderCircle className="sg-spin" size={15} />,
      label: "正在加载 Group…",
    });
  } else if (organizations?.length) {
    for (const organization of organizations) {
      items.push({
        key: organization.id,
        icon: <UsersRound size={15} />,
        label: organization.name,
      });
    }
  } else if (organizations) {
    items.push({ key: "empty", disabled: true, label: "暂无可用 Group" });
  }

  const selectedKey = session.tenantType === "org" ? session.tenantId : "personal";
  const onSelect: MenuProps["onClick"] = ({ key }) => {
    if (switching || key === "loading" || key === "empty" || key === selectedKey) return;
    setSwitching(true);
    void switchContext(key === "personal" ? "" : key)
      .then(() => window.location.assign("/"))
      .catch((error) => {
        setSwitching(false);
        toast("error", error instanceof Error ? error.message : "空间切换失败");
      });
  };

  return (
    <Dropdown
      trigger={["click"]}
      placement="bottomRight"
      onOpenChange={(open) => {
        if (open) void loadOrganizations();
      }}
      menu={{ items, selectable: true, selectedKeys: [selectedKey], onClick: onSelect }}
      rootClassName="sg-space-dropdown"
    >
      <Button
        type="text"
        className="sg-space-switcher"
        loading={switching}
        icon={!switching ? <CurrentIcon size={16} /> : undefined}
        aria-label={`当前空间：${currentLabel}，点击切换`}
      >
        <span>{currentLabel}</span>
        <ChevronDown size={14} />
      </Button>
    </Dropdown>
  );
}

const CREATE_CARDS = [
  { key: "doc", title: "文档", hint: "撰写 Markdown 与研究文档", icon: FileText, tone: "blue" },
  {
    key: "html",
    title: "HTML 页面",
    hint: "创建可在线访问的 HTML 内容",
    icon: Code2,
    tone: "green",
  },
  { key: "kb", title: "知识库", hint: "整理资料并支持 AI 问答", icon: BookOpen, tone: "violet" },
  { key: "research", title: "调研", hint: "发起深度研究与分析任务", icon: Search, tone: "blue" },
  {
    key: "presentation",
    title: "在线演示",
    hint: "生成 H5 演示稿",
    icon: MonitorPlay,
    tone: "violet",
  },
  {
    key: "upload",
    title: "上传文件",
    hint: "导入 PDF、Markdown、数据等",
    icon: CloudUpload,
    tone: "orange",
  },
] as const;

const RECENT_TEMPLATES = [
  { name: "行业调研", image: "/reference/template-research.webp" },
  { name: "竞品分析", image: "/reference/template-compare.webp" },
  { name: "技术方案演示", image: "/reference/template-presentation.webp" },
  { name: "市场分析报告", image: "/reference/template-research.webp" },
];

function CreatePopover({
  onSelect,
  onBrowse,
}: {
  onSelect: (key: string) => void;
  onBrowse: () => void;
}) {
  return (
    <div className="sg-create-popover">
      <h2>新建</h2>
      <div className="sg-create-grid">
        {CREATE_CARDS.map(({ key, title, hint, icon: Icon, tone }) => (
          <button key={key} type="button" className="sg-create-card" onClick={() => onSelect(key)}>
            <span className={`sg-create-card-icon ${tone}`}>
              <Icon size={20} strokeWidth={1.9} />
            </span>
            <span className="sg-create-card-copy">
              <strong>{title}</strong>
              <small>{hint}</small>
            </span>
            <ChevronRight className="sg-create-card-arrow" size={17} />
          </button>
        ))}
      </div>
      <section className="sg-create-recent">
        <div className="sg-create-recent-head">
          <h3>最近使用的模板</h3>
          <button type="button" onClick={onBrowse}>
            查看全部 <ChevronRight size={15} />
          </button>
        </div>
        <div className="sg-create-template-grid">
          {RECENT_TEMPLATES.map((template) => (
            <button key={template.name} type="button" onClick={onBrowse}>
              <img src={template.image} alt="" />
              <strong>{template.name}</strong>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

type SearchKind = "document" | "knowledge" | "research" | "data" | "presentation" | "more";

interface SearchWorkspaceItem {
  id: string;
  title: string;
  description: string;
  kind: SearchKind;
  kindLabel: string;
  to: string;
  updatedAt: string;
  owner: string;
  source: string;
  tags: string[];
  meta: string;
}

const SEARCH_KIND_META: Record<SearchKind, { label: string; icon: typeof FileText; tone: string }> =
  {
    document: { label: "文档", icon: FileText, tone: "violet" },
    knowledge: { label: "知识库", icon: BookOpen, tone: "green" },
    research: { label: "调研", icon: Search, tone: "purple" },
    data: { label: "数据", icon: Database, tone: "green" },
    presentation: { label: "在线演示", icon: MonitorPlay, tone: "orange" },
    more: { label: "更多", icon: Layers3, tone: "blue" },
  };

function assetSearchKind(type: string): SearchKind {
  if (["document", "report", "html"].includes(type)) return "document";
  if (["dataset", "spreadsheet"].includes(type)) return "data";
  if (type === "presentation") return "presentation";
  return "more";
}

function relativeSearchTime(value: string): string {
  const minutes = Math.max(1, Math.round((Date.now() - new Date(value).getTime()) / 60_000));
  if (minutes < 60) return `${minutes} 分钟前更新`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} 小时前更新`;
  return `${Math.round(hours / 24)} 天前更新`;
}

function SearchWorkspace({
  query,
  onQueryChange,
  onClose,
}: {
  query: string;
  onQueryChange: (value: string) => void;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const toast = useToast();
  const authSession = getAuthSession();
  const [category, setCategory] = useState<"all" | SearchKind>("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [timeFilter, setTimeFilter] = useState("all");
  const [creatorFilter, setCreatorFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [tagFilter, setTagFilter] = useState("all");
  const [mineOnly, setMineOnly] = useState(false);
  const [sort, setSort] = useState("relevance");
  const [selectedId, setSelectedId] = useState("");
  const [previewTab, setPreviewTab] = useState<"preview" | "outline" | "sources" | "related">(
    "preview",
  );
  const [starred, setStarred] = useState(false);
  const normalizedQuery = query.trim();
  const { data, isFetching } = useQuery<SearchResult>({
    queryKey: ["search", normalizedQuery],
    queryFn: () => api<SearchResult>(`/search?q=${encodeURIComponent(normalizedQuery)}&limit=50`),
    enabled: normalizedQuery.length > 0,
  });

  const items = useMemo<SearchWorkspaceItem[]>(() => {
    const result: SearchWorkspaceItem[] = [];
    for (const asset of data?.assets ?? []) {
      const kind = assetSearchKind(asset.type);
      result.push({
        id: asset.id,
        title: asset.title,
        description:
          asset.description || `与“${normalizedQuery}”相关的${SEARCH_KIND_META[kind].label}内容`,
        kind,
        kindLabel: SEARCH_KIND_META[kind].label,
        to:
          kind === "presentation"
            ? `/presentations/${asset.id}`
            : kind === "data"
              ? `/assets/${asset.id}`
              : asset.type === "document" || asset.type === "report"
                ? `/documents/${asset.id}`
                : `/assets/${asset.id}`,
        updatedAt: asset.updatedAt,
        owner: isOwnedBySession(asset, authSession)
          ? "我创建的"
          : ownerDisplayName(asset, authSession),
        source: asset.sourceType || "manual",
        tags: asset.tags ?? [],
        meta: `${asset.type === "report" ? "研究报告" : SEARCH_KIND_META[kind].label} · ${relativeSearchTime(asset.updatedAt)}`,
      });
    }
    for (const task of data?.tasks ?? []) {
      result.push({
        id: task.id,
        title: task.goal,
        description: task.currentStep || "调研任务正在整理相关信息与输出结果",
        kind: "research",
        kindLabel: "调研",
        to: `/tasks/${task.id}`,
        updatedAt: task.updatedAt,
        owner:
          task.ownerSubject && isOwnedBySession({ ownerSubject: task.ownerSubject }, authSession)
            ? "我创建的"
            : task.ownerSubject || "我创建的",
        source: "task",
        tags: [task.type],
        meta: `${task.status === "completed" ? "已完成" : "执行中"} · ${relativeSearchTime(task.updatedAt)}`,
      });
    }
    for (const knowledge of data?.knowledgeBases ?? []) {
      result.push({
        id: knowledge.id,
        title: knowledge.name,
        description: knowledge.description || `包含 ${knowledge.sourceCount} 个来源的知识库`,
        kind: "knowledge",
        kindLabel: "知识库",
        to: `/knowledge/${knowledge.id}`,
        updatedAt: knowledge.updatedAt,
        owner: "我创建的",
        source: "knowledge",
        tags: [],
        meta: `包含 ${knowledge.chunkCount} 个内容 · ${relativeSearchTime(knowledge.updatedAt)}`,
      });
    }
    return result;
  }, [authSession, data, normalizedQuery]);

  const availableTags = useMemo(
    () => [...new Set(items.flatMap((item) => item.tags))].slice(0, 20),
    [items],
  );
  const filteredItems = useMemo(() => {
    const now = Date.now();
    const result = items.filter((item) => {
      if (category !== "all" && item.kind !== category) return false;
      if (typeFilter !== "all" && item.kind !== typeFilter) return false;
      if (creatorFilter === "mine" && item.owner !== "我创建的") return false;
      if (mineOnly && item.owner !== "我创建的") return false;
      if (sourceFilter !== "all" && item.source !== sourceFilter) return false;
      if (tagFilter !== "all" && !item.tags.includes(tagFilter)) return false;
      if (timeFilter !== "all") {
        const age = now - new Date(item.updatedAt).getTime();
        const limit =
          timeFilter === "day" ? 86_400_000 : timeFilter === "week" ? 604_800_000 : 2_592_000_000;
        if (age > limit) return false;
      }
      return true;
    });
    if (sort === "updated")
      return result.sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      );
    if (sort === "title") return result.sort((a, b) => a.title.localeCompare(b.title, "zh-CN"));
    return result;
  }, [
    category,
    creatorFilter,
    items,
    mineOnly,
    sort,
    sourceFilter,
    tagFilter,
    timeFilter,
    typeFilter,
  ]);
  const selectedIndex = Math.max(
    0,
    filteredItems.findIndex((item) => item.id === selectedId),
  );
  const selectedItem = filteredItems[selectedIndex];

  useEffect(() => {
    if (!filteredItems.length) {
      setSelectedId("");
      return;
    }
    if (!filteredItems.some((item) => item.id === selectedId)) setSelectedId(filteredItems[0].id);
  }, [filteredItems, selectedId]);

  const openItem = (item: SearchWorkspaceItem | undefined) => {
    if (!item) return;
    onClose();
    navigate(item.to);
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowDown" && filteredItems.length) {
        event.preventDefault();
        setSelectedId(filteredItems[Math.min(filteredItems.length - 1, selectedIndex + 1)].id);
      }
      if (event.key === "ArrowUp" && filteredItems.length) {
        event.preventDefault();
        setSelectedId(filteredItems[Math.max(0, selectedIndex - 1)].id);
      }
      if (event.key === "Enter") openItem(selectedItem);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [filteredItems, onClose, selectedIndex, selectedItem]);

  const categoryTabs = [
    { id: "all", label: "全部", icon: FileStack },
    { id: "document", label: "文档", icon: FileText },
    { id: "knowledge", label: "知识库", icon: BookOpen },
    { id: "research", label: "调研", icon: Search },
    { id: "data", label: "数据", icon: Database },
    { id: "presentation", label: "在线演示", icon: MonitorPlay },
    { id: "more", label: "更多", icon: Layers3 },
  ] as const;
  const groups = (
    ["research", "data", "knowledge", "presentation", "document", "more"] as SearchKind[]
  )
    .map((kind) => ({ kind, items: filteredItems.filter((item) => item.kind === kind) }))
    .filter((group) => group.items.length > 0);

  return (
    <div className="sg-global-search">
      <nav className="sg-global-search-tabs" aria-label="搜索类型">
        {categoryTabs.map((item) => {
          const TabIcon = item.icon;
          const count =
            item.id === "all"
              ? items.length
              : items.filter((result) => result.kind === item.id).length;
          return (
            <button
              type="button"
              className={category === item.id ? "active" : ""}
              key={item.id}
              onClick={() => setCategory(item.id)}
            >
              <TabIcon size={18} />
              {item.label}
              <span>{count}</span>
            </button>
          );
        })}
      </nav>
      <section className="sg-global-search-filters">
        <Select
          value={typeFilter}
          onChange={setTypeFilter}
          options={[
            { value: "all", label: "类型" },
            ...Object.entries(SEARCH_KIND_META).map(([value, meta]) => ({
              value,
              label: meta.label,
            })),
          ]}
        />
        <Select
          value={timeFilter}
          onChange={setTimeFilter}
          options={[
            { value: "all", label: "时间" },
            { value: "day", label: "最近一天" },
            { value: "week", label: "最近一周" },
            { value: "month", label: "最近一月" },
          ]}
        />
        <Select
          value={creatorFilter}
          onChange={setCreatorFilter}
          options={[
            { value: "all", label: "创建者" },
            { value: "mine", label: "我创建的" },
          ]}
        />
        <Select
          value={sourceFilter}
          onChange={setSourceFilter}
          options={[
            { value: "all", label: "来源" },
            { value: "manual", label: "手动创建" },
            { value: "research", label: "调研生成" },
            { value: "upload", label: "上传文件" },
            { value: "task", label: "任务输出" },
          ]}
        />
        <Select
          value={tagFilter}
          onChange={setTagFilter}
          options={[
            { value: "all", label: "标签" },
            ...availableTags.map((tag) => ({ value: tag, label: tag })),
          ]}
        />
        <label>
          仅看我的
          <input
            type="checkbox"
            checked={mineOnly}
            onChange={(event) => setMineOnly(event.target.checked)}
          />
          <i />
        </label>
        <div className="sg-global-search-sort">
          <span>排序：</span>
          <Select
            value={sort}
            onChange={setSort}
            options={[
              { value: "relevance", label: "相关度" },
              { value: "updated", label: "更新时间" },
              { value: "title", label: "标题" },
            ]}
          />
        </div>
      </section>

      {!normalizedQuery ? (
        <section className="sg-global-search-start">
          <span>
            <Search size={26} />
          </span>
          <h1>搜索整个工作区</h1>
          <p>查找文档、知识库、调研任务、数据集和在线演示</p>
          <div>
            {["新能源汽车", "市场分析", "产品需求"].map((suggestion) => (
              <button type="button" key={suggestion} onClick={() => onQueryChange(suggestion)}>
                {suggestion}
              </button>
            ))}
          </div>
        </section>
      ) : isFetching ? (
        <section className="sg-global-search-loading">
          <LoaderCircle size={22} />
          <span>正在搜索整个工作区…</span>
        </section>
      ) : filteredItems.length === 0 ? (
        <section className="sg-global-search-start">
          <span>
            <SearchX size={26} />
          </span>
          <h1>没有找到匹配内容</h1>
          <p>尝试减少筛选条件或更换关键词</p>
        </section>
      ) : (
        <div className="sg-global-search-layout">
          <main className="sg-global-search-results">
            {filteredItems[0] && category === "all" && (
              <section>
                <h2>最佳匹配</h2>
                <SearchResultRow
                  item={filteredItems[0]}
                  featured
                  selected={selectedItem?.id === filteredItems[0].id}
                  onSelect={() => setSelectedId(filteredItems[0].id)}
                  onOpen={() => openItem(filteredItems[0])}
                />
              </section>
            )}
            {groups.map((group) => {
              const groupItems =
                category === "all"
                  ? group.items.filter((item) => item.id !== filteredItems[0]?.id)
                  : group.items;
              if (!groupItems.length) return null;
              return (
                <section key={group.kind}>
                  <h2>{SEARCH_KIND_META[group.kind].label}</h2>
                  {groupItems.map((item) => (
                    <SearchResultRow
                      item={item}
                      key={item.id}
                      selected={selectedItem?.id === item.id}
                      onSelect={() => setSelectedId(item.id)}
                      onOpen={() => openItem(item)}
                    />
                  ))}
                </section>
              );
            })}
            <button
              type="button"
              className="sg-global-search-more"
              onClick={() => setCategory("all")}
            >
              查看全部 {filteredItems.length} 条结果 <ArrowRight size={14} />
            </button>
          </main>
          {selectedItem && (
            <aside className="sg-global-search-preview">
              <header>
                <span
                  className={`sg-global-search-icon ${SEARCH_KIND_META[selectedItem.kind].tone}`}
                >
                  {(() => {
                    const PreviewIcon = SEARCH_KIND_META[selectedItem.kind].icon;
                    return <PreviewIcon size={18} />;
                  })()}
                </span>
                <div>
                  <h2>{selectedItem.title}</h2>
                  <p>
                    {selectedItem.kindLabel} · {selectedItem.owner} ·{" "}
                    {relativeSearchTime(selectedItem.updatedAt)}
                  </p>
                </div>
                <button
                  type="button"
                  aria-label={starred ? "取消收藏" : "收藏"}
                  className={starred ? "active" : ""}
                  onClick={() => setStarred((value) => !value)}
                >
                  <Star size={15} />
                </button>
                <button
                  type="button"
                  aria-label="分享"
                  onClick={() => {
                    void navigator.clipboard?.writeText(
                      `${window.location.origin}${selectedItem.to}`,
                    );
                    toast("success", "链接已复制");
                  }}
                >
                  <Share2 size={15} />
                </button>
                <button
                  type="button"
                  aria-label="更多操作"
                  onClick={() => toast("info", "更多操作即将开放")}
                >
                  <MoreHorizontal size={16} />
                </button>
              </header>
              <AppTabs
                items={[
                  ["preview", "预览"],
                  ["outline", "大纲"],
                  ["sources", "来源"],
                  ["related", "相关内容"],
                ].map(([id, label]) => ({ key: id, label }))}
                activeKey={previewTab}
                onChange={(key) => setPreviewTab(key as typeof previewTab)}
              />
              <div className="sg-global-search-preview-body">
                {previewTab === "preview" && (
                  <>
                    <h3>1. 内容概览</h3>
                    <p>{selectedItem.description}</p>
                    <SearchPreviewChart />
                    <h3>2. 核心要点</h3>
                    <ul>
                      <li>关键数据与趋势已经整理为结构化内容</li>
                      <li>来源、任务与相关资产保持可追溯关系</li>
                      <li>可继续用于调研、知识库或在线演示</li>
                    </ul>
                  </>
                )}
                {previewTab === "outline" && (
                  <ol>
                    <li>背景与目标</li>
                    <li>核心分析</li>
                    <li>数据与来源</li>
                    <li>结论与建议</li>
                  </ol>
                )}
                {previewTab === "sources" && (
                  <div className="sg-global-search-preview-empty">
                    来源信息将在打开内容后完整展示
                  </div>
                )}
                {previewTab === "related" && (
                  <div className="sg-global-search-related">
                    {filteredItems
                      .filter((item) => item.id !== selectedItem.id)
                      .slice(0, 4)
                      .map((item) => (
                        <button type="button" key={item.id} onClick={() => setSelectedId(item.id)}>
                          {item.title}
                        </button>
                      ))}
                  </div>
                )}
              </div>
              <footer>
                <Button type="primary" onClick={() => openItem(selectedItem)}>
                  打开{selectedItem.kindLabel}
                </Button>
                <Button
                  onClick={() => window.open(selectedItem.to, "_blank", "noopener,noreferrer")}
                >
                  在新标签打开
                </Button>
                <Button onClick={() => toast("info", "更多操作即将开放")}>更多操作</Button>
              </footer>
            </aside>
          )}
        </div>
      )}
      {normalizedQuery && (
        <button
          type="button"
          className="sg-global-search-ask"
          onClick={() => toast("info", `可以继续向 AI 询问“${normalizedQuery}”`)}
        >
          <Sparkles size={15} /> 向 AI 提问
        </button>
      )}
    </div>
  );
}

function SearchResultRow({
  item,
  featured = false,
  selected,
  onSelect,
  onOpen,
}: {
  item: SearchWorkspaceItem;
  featured?: boolean;
  selected: boolean;
  onSelect: () => void;
  onOpen: () => void;
}) {
  const meta = SEARCH_KIND_META[item.kind];
  const ItemIcon = meta.icon;
  return (
    <article
      className={`sg-global-search-result${featured ? " featured" : ""}${selected ? " selected" : ""}`}
      onMouseEnter={onSelect}
    >
      <button
        type="button"
        className={`sg-global-search-icon ${meta.tone}`}
        aria-label={`选择 ${item.title}`}
        onClick={onSelect}
      >
        <ItemIcon size={17} />
      </button>
      <div>
        <button
          type="button"
          className="sg-global-search-result-title"
          onClick={onSelect}
          onDoubleClick={onOpen}
        >
          {item.title}
          <span>{item.kindLabel}</span>
        </button>
        <p>{item.description}</p>
        <small>
          {item.owner} · {item.meta}
        </small>
      </div>
      {featured && <SearchResultVisual />}
      {item.kind === "research" && <span className="sg-global-search-status">已完成</span>}
    </article>
  );
}

function SearchResultVisual() {
  return (
    <span className="sg-global-search-visual" aria-hidden="true">
      <small>MARKET REPORT</small>
      <b>市场研究 2024</b>
      <i />
    </span>
  );
}

function SearchPreviewChart() {
  return (
    <div className="sg-global-search-chart" role="img" aria-label="市场规模保持增长趋势">
      <span>市场规模趋势</span>
      <svg viewBox="0 0 320 120" aria-hidden="true">
        <polyline
          points="16,94 62,76 108,62 154,48 200,35 246,22 300,10"
          fill="none"
          stroke="#8f63ff"
          strokeWidth="2"
        />
        {["16,94", "62,76", "108,62", "154,48", "200,35", "246,22", "300,10"].map((point) => {
          const [cx, cy] = point.split(",");
          return <circle key={point} cx={cx} cy={cy} r="3" fill="#9c73ff" />;
        })}
      </svg>
      <div>
        {["2021", "2022", "2023", "2024E", "2025E", "2026E", "2027E"].map((year) => (
          <small key={year}>{year}</small>
        ))}
      </div>
    </div>
  );
}
