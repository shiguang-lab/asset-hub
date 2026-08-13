import { Avatar, Button, IconButton, useTheme, useToast } from "@shiguang/ui";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { api, type HomeData, type SearchResult } from "../entities/api.js";
import { useSse } from "../shared/sse.js";

const NAV = [
  {
    group: "工作区",
    items: [
      { to: "/", label: "首页", icon: "⌂" },
      { to: "/assets", label: "资产", icon: "▦" },
      { to: "/knowledge", label: "知识库", icon: "▤" },
      { to: "/research", label: "调研", icon: "◎" },
      { to: "/tasks", label: "任务", icon: "⚙" },
    ],
  },
  {
    group: "创作",
    items: [
      { to: "/datasets", label: "数据", icon: "▥" },
      { to: "/presentations", label: "在线演示", icon: "▶" },
      { to: "/templates", label: "模板", icon: "▣" },
    ],
  },
  {
    group: "系统",
    items: [
      { to: "/notifications", label: "通知", icon: "🔔" },
      { to: "/billing", label: "Credits", icon: "✦" },
      { to: "/settings", label: "设置", icon: "⚙" },
    ],
  },
];

export function Shell() {
  useSse();
  const toast = useToast();
  const navigate = useNavigate();
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

  const createItems = [
    { label: "Markdown 文档", icon: "📄", to: "/documents/new" },
    { label: "HTML 页面", icon: "🖥", to: "/html/new" },
    { label: "知识库", icon: "▤", to: "/knowledge/new" },
    { label: "深度调研", icon: "◎", to: "/research/new" },
    { label: "在线演示", icon: "▶", to: "/presentations/new" },
    { label: "上传文件", icon: "⬆", action: () => toast("info", "请到知识库或数据集页上传文件") },
  ];

  return (
    <div className="sg-shell">
      <aside className="sg-sidebar">
        <Link to="/" className="sg-sidebar-logo">
          <span
            style={{
              width: 28,
              height: 28,
              borderRadius: 8,
              background: "var(--sg-accent)",
              color: "#fff",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 15,
            }}
          >
            S
          </span>
          Shiguang Lab
        </Link>
        {NAV.map((group) => (
          <div key={group.group}>
            <div className="sg-nav-group">{group.group}</div>
            {group.items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/"}
                className={({ isActive }) => (isActive ? "sg-nav-item active" : "sg-nav-item")}
              >
                <span style={{ width: 16, textAlign: "center" }}>{item.icon}</span>
                {item.label}
                {item.to === "/notifications" && (home?.unreadNotifications ?? 0) > 0 && (
                  <span className="sg-badge sg-badge-danger" style={{ marginLeft: "auto" }}>
                    {home?.unreadNotifications}
                  </span>
                )}
              </NavLink>
            ))}
          </div>
        ))}
        <div className="spacer" />
        <div
          className="sg-row"
          style={{ padding: "8px 10px", color: "var(--sg-muted)", fontSize: 12.5 }}
        >
          <Avatar name="演示用户" size={28} />
          <span>演示用户</span>
          <span style={{ marginLeft: "auto", fontWeight: 700, color: "var(--sg-accent)" }}>
            {home?.credits ?? 0}
          </span>
        </div>
      </aside>

      <div className="sg-main">
        <header className="sg-header">
          <button type="button" className="sg-search" onClick={() => setPaletteOpen(true)}>
            <span>⌘K</span>
            <span>搜索资产、任务、知识库…</span>
          </button>
          <div className="spacer" />
          <HeaderButton label={`${home?.credits ?? 0} Credits`} to="/billing" />
          <HeaderButton label={`${home?.unreadNotifications ?? 0} 通知`} to="/notifications" />
          <div className="sg-dropdown">
            <Button variant="primary" onClick={() => setNewOpen((v) => !v)}>
              + 新建
            </Button>
            {newOpen && (
              <div className="sg-dropdown-menu" style={{ right: 0 }}>
                {createItems.map((item) => (
                  <button
                    key={item.label}
                    type="button"
                    className="sg-dropdown-item"
                    onClick={() => {
                      setNewOpen(false);
                      if (item.to) navigate(item.to);
                      else item.action?.();
                    }}
                  >
                    <span>{item.icon}</span> {item.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <ThemeToggle />
        </header>
        <main className="sg-content">
          <Outlet />
        </main>
      </div>
      {paletteOpen && <CommandPalette onClose={() => setPaletteOpen(false)} />}
    </div>
  );
}

function HeaderButton({ label, to }: { label: string; to: string }) {
  return (
    <Link to={to} className="sg-btn sg-btn-sm" style={{ textDecoration: "none" }}>
      {label}
    </Link>
  );
}

function ThemeToggle() {
  const { theme, toggle } = useTheme();
  return (
    <IconButton onClick={toggle} title="切换主题">
      {theme === "light" ? "🌙" : "☀️"}
    </IconButton>
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
      for (const nav of NAV)
        for (const item of nav.items) out.push({ label: item.label, sub: nav.group, to: item.to });
    }
    return out.slice(0, 12);
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
          placeholder="搜索资产、任务、知识库，或输入页面名称…"
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
