import { Avatar, useTheme, useToast } from "@shiguang/ui";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { api, type HomeData, type SearchResult } from "../entities/api.js";
import { useSse } from "../shared/sse.js";

const NAV = [
  { to: "/", label: "首页", icon: "⌂" },
  { to: "/assets", label: "资产", icon: "▦" },
  { to: "/documents/new", label: "文档", icon: "📄" },
  { to: "/knowledge", label: "知识库", icon: "▤" },
  { to: "/research", label: "调研", icon: "◎" },
  { to: "/tasks", label: "任务中心", icon: "⚙" },
  { to: "/assistant", label: "AI 助手", icon: "✦" },
  { to: "/templates", label: "模板中心", icon: "▣" },
  { to: "/presentations", label: "在线演示", icon: "▶" },
  { to: "/datasets", label: "数据看板", icon: "▥" },
  { to: "/publishes", label: "已发布", icon: "⇪" },
  { to: "/notifications", label: "通知中心", icon: "🔔" },
  { to: "/profile", label: "个人中心", icon: "👤" },
  { to: "/settings", label: "设置", icon: "⚙" },
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
  { match: /^\/notifications/, label: "通知中心" },
  { match: /^\/billing/, label: "套餐 / Credits" },
  { match: /^\/profile/, label: "个人中心" },
  { match: /^\/settings/, label: "设置" },
];

export function Shell() {
  useSse();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const { data: home } = useQuery<HomeData>({
    queryKey: ["home"],
    queryFn: () => api<HomeData>("/home"),
  });

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

  const breadcrumb = BREADCRUMBS.find((b) => b.match.test(location.pathname))?.label ?? "";

  const createItems = [
    { label: "文档", sub: "撰写 Markdown 与研究文档", icon: "📄", to: "/documents/new" },
    { label: "HTML 页面", sub: "创建可在线访问的 HTML 内容", icon: "🖥", to: "/html/new" },
    { label: "知识库", sub: "整理资料并支持 AI 问答", icon: "▤", to: "/knowledge/new" },
    { label: "调研", sub: "发起深度研究与分析任务", icon: "◎", to: "/research/new" },
    { label: "在线演示", sub: "生成 H5 演示稿", icon: "▶", to: "/presentations/new" },
    {
      label: "上传文件",
      sub: "导入 PDF、Markdown、数据等",
      icon: "⬆",
      action: () => toast("info", "请到知识库或数据集页上传文件"),
    },
  ];

  return (
    <div className="sg-shell">
      <aside className="sg-sidebar">
        <Link to="/" className="sg-sidebar-logo">
          <span
            style={{
              width: 26,
              height: 26,
              borderRadius: 8,
              background: "var(--sg-accent)",
              color: "#fff",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 14,
              fontWeight: 800,
            }}
          >
            S
          </span>
          Shiguang Lab
        </Link>
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/"}
            className={({ isActive }) => (isActive ? "sg-nav-item active" : "sg-nav-item")}
          >
            <span className="sg-nav-icon">{item.icon}</span>
            {item.label}
            {item.to === "/notifications" && (home?.unreadNotifications ?? 0) > 0 && (
              <span className="sg-badge sg-badge-danger" style={{ marginLeft: "auto" }}>
                {home?.unreadNotifications}
              </span>
            )}
          </NavLink>
        ))}
        <div className="spacer" />
        <div className="sg-credits-box">
          <div className="sg-row-between">
            <span className="sg-subtle">AI Credits</span>
            <span className="num">{home?.credits ?? 12_450}</span>
          </div>
          <div className="sg-subtle" style={{ fontSize: 11.5 }}>
            / 20,000
          </div>
          <Link to="/billing" className="buy">
            购买 Credits
          </Link>
        </div>
        <div className="sg-team-box">
          <span>🧑‍🤝‍🧑</span> 团队版
        </div>
      </aside>

      <div className="sg-main">
        <header className="sg-header">
          <span className="sg-breadcrumb">
            {breadcrumb && <strong>{breadcrumb}</strong>}
            {location.pathname !== "/" && breadcrumb && location.pathname !== "/" && (
              <span> &gt; 内容</span>
            )}
          </span>
          <button type="button" className="sg-search" onClick={() => setPaletteOpen(true)}>
            <span>🔍</span>
            <span>搜索资产、知识库、文件、任务、模板等</span>
            <span className="sg-kbd" style={{ marginLeft: "auto" }}>
              ⌘K
            </span>
          </button>
          <div className="spacer" />
          <HeaderLink to="/billing" label={`${home?.credits ?? 0} Credits`} />
          <HeaderLink to="/notifications" label={`${home?.unreadNotifications ?? 0} 通知`} />
          <div className="sg-dropdown">
            <button
              type="button"
              className="sg-btn sg-btn-primary"
              onClick={() => setNewOpen((v) => !v)}
            >
              + 新建
            </button>
            {newOpen && (
              <div className="sg-dropdown-menu" style={{ right: 0, width: 260 }}>
                {createItems.map((item) => (
                  <button
                    key={item.label}
                    type="button"
                    className="sg-dropdown-item"
                    style={{ flexDirection: "column", alignItems: "flex-start", gap: 1 }}
                    onClick={() => {
                      setNewOpen(false);
                      if (item.to) navigate(item.to);
                      else item.action?.();
                    }}
                  >
                    <span>
                      {item.icon} <strong>{item.label}</strong>
                    </span>
                    <span className="sg-subtle" style={{ fontSize: 12 }}>
                      {item.sub}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <ThemeToggle />
          <Avatar name="张伟" size={30} />
        </header>
        <main className="sg-content">
          <Outlet />
        </main>
      </div>
      {paletteOpen && <CommandPalette onClose={() => setPaletteOpen(false)} />}
    </div>
  );
}

function HeaderLink({ label, to }: { label: string; to: string }) {
  return (
    <Link to={to} className="sg-btn sg-btn-sm" style={{ textDecoration: "none" }}>
      {label}
    </Link>
  );
}

function ThemeToggle() {
  const { theme, toggle } = useTheme();
  return (
    <button type="button" className="sg-btn sg-btn-sm" onClick={toggle} title="切换主题">
      {theme === "light" ? "🌙" : "☀️"}
    </button>
  );
}

function CommandPalette({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState("");
  const navigate = useNavigate();
  const [selected, setSelected] = useState(0);
  const { data, isFetching } = useQuery<SearchResult>({
    queryKey: ["search", query],
    queryFn: () => api<SearchResult>(`/search?q=${encodeURIComponent(query)}`),
    enabled: query.trim().length > 0,
  });

  const items = useMemo(() => {
    const out: Array<{ label: string; sub: string; to: string }> = [];
    for (const a of data?.assets ?? [])
      out.push({ label: a.title, sub: `资产 · ${a.type}`, to: `/assets/${a.id}` });
    for (const t of data?.tasks ?? [])
      out.push({ label: t.goal, sub: `任务 · ${t.status}`, to: `/tasks/${t.id}` });
    for (const k of data?.knowledgeBases ?? [])
      out.push({ label: k.name, sub: "知识库", to: `/knowledge/${k.id}` });
    if (query.trim().length === 0) {
      for (const item of NAV) out.push({ label: item.label, sub: "页面", to: item.to });
    }
    return out.slice(0, 14);
  }, [data, query]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowDown") setSelected((s) => Math.min(items.length - 1, s + 1));
      if (e.key === "ArrowUp") setSelected((s) => Math.max(0, s - 1));
      if (e.key === "Enter") {
        const item = items[selected];
        if (item) {
          navigate(item.to);
          onClose();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [items, selected, navigate, onClose]);

  return (
    <div className="sg-palette-backdrop">
      <button
        type="button"
        aria-label="关闭搜索"
        className="sg-palette-backdrop-close"
        onClick={onClose}
      />
      <div className="sg-palette">
        <input
          // biome-ignore lint/a11y/noAutofocus: 命令面板打开时聚焦输入框是预期行为
          autoFocus
          placeholder="搜索资产、知识库、文件、任务、模板等"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setSelected(0);
          }}
        />
        <div className="sg-palette-list">
          {isFetching && (
            <div className="sg-subtle" style={{ padding: 12 }}>
              搜索中…
            </div>
          )}
          {items.map((item, i) => (
            <button
              type="button"
              key={`${item.to}-${item.label}`}
              className={`sg-palette-item ${selected === i ? "active" : ""}`}
              onMouseEnter={() => setSelected(i)}
              onClick={() => {
                navigate(item.to);
                onClose();
              }}
            >
              <span>{item.label}</span>
              <span className="sg-subtle" style={{ marginLeft: "auto" }}>
                {item.sub}
              </span>
            </button>
          ))}
          {!isFetching && query && items.length === 0 && (
            <div className="sg-subtle" style={{ padding: 12 }}>
              没有匹配结果
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
