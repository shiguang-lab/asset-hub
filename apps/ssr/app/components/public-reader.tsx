"use client";

import { extractMarkdownToc } from "@shiguang/markdown-viewer/toc";
import {
  AlignJustify,
  AlignLeft,
  ChevronRight,
  Copy,
  Eye,
  Globe2,
  HelpCircle,
  LockKeyhole,
  Maximize2,
  Menu,
  MoreHorizontal,
  StretchHorizontal,
} from "lucide-react";
import dynamic from "next/dynamic";
import { type MouseEvent, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

const InteractiveMarkdown = dynamic(
  () => import("./interactive-markdown").then((module) => module.InteractiveMarkdown),
  { ssr: false },
);

export interface PublicReaderContent {
  title: string;
  markdown: string;
  visibility: string;
  visitorCount: number;
  activeViewers: PublicViewer[];
  publisher: {
    name: string;
    avatarUrl: string | null;
  } | null;
  allowDownload: boolean;
  allowCopy: boolean;
  assetLinks: Record<string, string>;
}

export interface PublicViewer {
  visitorKey: string;
  userId: string | null;
  displayName: string | null;
  avatarUrl: string | null;
}

interface PublicSession {
  authenticated?: boolean;
  subject?: string;
  displayName?: string;
  avatarUrl?: string;
  user?: { id?: string; username?: string; avatarUrl?: string };
}

type ContentWidth = "default" | "wide" | "full";

const tocOpenStorageKey = "sg-public-toc-open";
const widthModeStorageKey = "sg-public-width-mode";

export function PublicReader({
  slug,
  content,
  serverMarkdownHtml,
}: {
  slug: string;
  content: PublicReaderContent;
  serverMarkdownHtml: string;
}) {
  const [tocOpen, setTocOpen] = useState(false);
  const [widthMode, setWidthMode] = useState<ContentWidth>("default");
  const [transitionsEnabled, setTransitionsEnabled] = useState(false);
  const [hasInitialHash, setHasInitialHash] = useState(false);
  const [initialPositionReady, setInitialPositionReady] = useState(false);
  const [layoutStateReady, setLayoutStateReady] = useState(false);
  const [widthMenuOpen, setWidthMenuOpen] = useState(false);
  const [widthSubmenuOpen, setWidthSubmenuOpen] = useState(false);
  const [activeTocAnchor, setActiveTocAnchor] = useState<string | null>(null);
  const [visitorCount, setVisitorCount] = useState(content.visitorCount);
  const [activeViewers, setActiveViewers] = useState<PublicViewer[]>(content.activeViewers ?? []);
  const [interactiveReady, setInteractiveReady] = useState(false);
  const [clientHydrated, setClientHydrated] = useState(false);
  const layoutRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLElement>(null);
  const widthMenuRef = useRef<HTMLDivElement>(null);
  const tocNavRef = useRef<HTMLElement>(null);
  const tocLinkRefs = useRef(new Map<string, HTMLAnchorElement>());
  const tocNavigationLockRef = useRef(false);
  const scrollAnimationFrameRef = useRef<number | null>(null);
  const toc = useMemo(() => extractMarkdownToc(content.markdown), [content.markdown]);

  useLayoutEffect(() => {
    try {
      const storedTocOpen = window.localStorage.getItem(tocOpenStorageKey);
      if (storedTocOpen === "true" || storedTocOpen === "false")
        setTocOpen(storedTocOpen === "true");
      const storedWidthMode = window.localStorage.getItem(widthModeStorageKey);
      if (
        storedWidthMode === "default" ||
        storedWidthMode === "wide" ||
        storedWidthMode === "full"
      ) {
        setWidthMode(storedWidthMode);
      }
    } catch {
      // localStorage can be unavailable in private browsing or restricted contexts.
    }
    setLayoutStateReady(true);

    const syncStoredState = (event: StorageEvent) => {
      if (
        event.key === tocOpenStorageKey &&
        (event.newValue === "true" || event.newValue === "false")
      ) {
        setTocOpen(event.newValue === "true");
      }
      if (
        event.key === widthModeStorageKey &&
        (event.newValue === "default" || event.newValue === "wide" || event.newValue === "full")
      ) {
        setWidthMode(event.newValue);
      }
    };
    window.addEventListener("storage", syncStoredState);
    return () => window.removeEventListener("storage", syncStoredState);
  }, []);

  useEffect(() => {
    setClientHydrated(true);
  }, []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setTransitionsEnabled(true));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useLayoutEffect(() => {
    setVisitorCount(content.visitorCount);
    setActiveViewers(content.activeViewers ?? []);
  }, [content.activeViewers, content.visitorCount]);

  useEffect(() => {
    let stopped = false;
    let timer: number | null = null;
    const visitorStorageKey = "sg-public-visitor-fingerprint";
    const getVisitorId = () => {
      const existing = window.localStorage.getItem(visitorStorageKey);
      if (existing && existing.length >= 16) return existing;
      const generated =
        typeof window.crypto?.randomUUID === "function"
          ? window.crypto.randomUUID()
          : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
      window.localStorage.setItem(visitorStorageKey, generated);
      return generated;
    };
    const sendPresence = async () => {
      const visitorId = getVisitorId();
      let session: PublicSession | null = null;
      try {
        const response = await fetch("/api/auth/session", {
          credentials: "include",
          headers: { Accept: "application/json" },
        });
        if (response.ok) session = (await response.json()) as PublicSession;
      } catch {
        session = null;
      }
      const userId = session?.user?.id || session?.subject || null;
      const displayName = session?.displayName || session?.user?.username || null;
      const avatarUrl = session?.avatarUrl || session?.user?.avatarUrl || null;
      try {
        const response = await fetch(`/p/${encodeURIComponent(slug)}/presence`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ visitorId, userId, displayName, avatarUrl }),
        });
        if (!response.ok || stopped) return;
        const result = (await response.json()) as {
          visitorCount?: number;
          viewers?: PublicViewer[];
        };
        if (typeof result.visitorCount === "number") setVisitorCount(result.visitorCount);
        if (Array.isArray(result.viewers)) setActiveViewers(result.viewers);
      } catch {
        // Presence is supplementary and must not block document reading.
      }
    };
    void sendPresence();
    timer = window.setInterval(() => void sendPresence(), 30_000);
    return () => {
      stopped = true;
      if (timer !== null) window.clearInterval(timer);
    };
  }, [slug]);

  const getHeading = (anchor: string) => {
    const root = contentRef.current;
    if (!root) return null;
    const headingSelector = "h1, h2, h3, h4";
    const interactiveHeading = Array.from(
      root.querySelectorAll<HTMLElement>(`.sg-public-interactive-markdown ${headingSelector}`),
    ).find((heading) => heading.id === anchor);
    if (interactiveHeading) return interactiveHeading;
    const seoHeading = Array.from(
      root.querySelectorAll<HTMLElement>(`.sg-public-seo-markdown ${headingSelector}`),
    ).find((heading) => heading.id === anchor);
    return seoHeading ?? null;
  };

  const resolveHashAnchor = () => {
    const rawAnchor = decodeURIComponent(window.location.hash.slice(1));
    if (!rawAnchor) return null;
    const canonicalAnchor = rawAnchor.replace(/^sg-heading-(?=\d+-)/, "");
    return toc.find((item) => item.anchor === canonicalAnchor)?.anchor ?? null;
  };

  const scrollToHeading = (anchor: string, behavior: ScrollBehavior = "smooth") => {
    const layout = layoutRef.current ?? document.querySelector<HTMLDivElement>(".sg-public-layout");
    const heading = getHeading(anchor);
    if (!layout || !heading) return false;
    const maxScrollTop = Math.max(0, layout.scrollHeight - layout.clientHeight);
    const targetTop = Math.min(
      maxScrollTop,
      Math.max(
        0,
        layout.scrollTop +
          heading.getBoundingClientRect().top -
          layout.getBoundingClientRect().top -
          24,
      ),
    );
    if (scrollAnimationFrameRef.current !== null) {
      window.cancelAnimationFrame(scrollAnimationFrameRef.current);
      scrollAnimationFrameRef.current = null;
    }
    if (behavior === "auto") {
      layout.scrollTop = targetTop;
      return true;
    }

    const startTop = layout.scrollTop;
    const distance = targetTop - startTop;
    if (Math.abs(distance) < 1) return true;
    const duration = Math.min(520, Math.max(260, Math.abs(distance) * 0.18));
    const startedAt = performance.now();
    const step = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / duration);
      const eased = progress < 0.5 ? 2 * progress * progress : 1 - (2 - 2 * progress) ** 2 / 2;
      layout.scrollTop = startTop + distance * eased;
      if (progress < 1 && tocNavigationLockRef.current) {
        scrollAnimationFrameRef.current = window.requestAnimationFrame(step);
      } else {
        scrollAnimationFrameRef.current = null;
      }
    };
    scrollAnimationFrameRef.current = window.requestAnimationFrame(step);
    return true;
  };

  useLayoutEffect(() => {
    const headings = contentRef.current?.querySelectorAll(
      ".x-markdown h1, .x-markdown h2, .x-markdown h3, .x-markdown h4, .sg-public-markdown h1, .sg-public-markdown h2, .sg-public-markdown h3, .sg-public-markdown h4",
    );
    headings?.forEach((heading, index) => {
      const item = toc[index];
      if (item) heading.id = item.anchor;
    });
  }, [toc, interactiveReady]);

  useLayoutEffect(() => {
    const syncHash = () => {
      setHasInitialHash(Boolean(window.location.hash));
      const anchor = resolveHashAnchor();
      if (!anchor || !getHeading(anchor)) {
        setInitialPositionReady(true);
        return;
      }
      setActiveTocAnchor(anchor);
      scrollToHeading(anchor, "auto");
      if (interactiveReady) setInitialPositionReady(true);
    };
    syncHash();
    window.addEventListener("hashchange", syncHash);
    return () => window.removeEventListener("hashchange", syncHash);
  }, [interactiveReady, toc]);

  useLayoutEffect(() => {
    const hashAnchor = resolveHashAnchor();
    setActiveTocAnchor(hashAnchor ?? toc[0]?.anchor ?? null);
  }, [toc]);

  useEffect(() => {
    const layout = layoutRef.current;
    const contentElement = contentRef.current;
    if (!layout || !contentElement || toc.length === 0) return;

    const cancelProgrammaticScroll = () => {
      if (scrollAnimationFrameRef.current !== null) {
        window.cancelAnimationFrame(scrollAnimationFrameRef.current);
        scrollAnimationFrameRef.current = null;
      }
      tocNavigationLockRef.current = false;
    };
    let frame = 0;
    const updateActiveHeading = () => {
      frame = 0;
      const rootTop = layout.getBoundingClientRect().top;
      const threshold = rootTop + 96;
      const headings = toc
        .map((item) => getHeading(item.anchor))
        .filter((heading): heading is HTMLElement => heading !== null);
      if (headings.length === 0) return;

      let current = headings[0];
      if (layout.scrollTop >= layout.scrollHeight - layout.clientHeight - 2) {
        current = headings[headings.length - 1];
      } else {
        for (const heading of headings) {
          if (heading.getBoundingClientRect().top <= threshold) current = heading;
          else break;
        }
      }
      setActiveTocAnchor((previous) => (previous === current.id ? previous : current.id));
    };
    const onScroll = () => {
      if (tocNavigationLockRef.current) return;
      if (frame === 0) frame = window.requestAnimationFrame(updateActiveHeading);
    };
    const onUserScrollStart = () => {
      if (!tocNavigationLockRef.current) return;
      cancelProgrammaticScroll();
      if (frame === 0) frame = window.requestAnimationFrame(updateActiveHeading);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "].includes(event.key)) {
        onUserScrollStart();
      }
    };

    layout.addEventListener("scroll", onScroll, { passive: true });
    layout.addEventListener("wheel", onUserScrollStart, { passive: true });
    layout.addEventListener("touchstart", onUserScrollStart, { passive: true });
    layout.addEventListener("pointerdown", onUserScrollStart, { passive: true });
    layout.addEventListener("keydown", onKeyDown);
    updateActiveHeading();
    return () => {
      layout.removeEventListener("scroll", onScroll);
      layout.removeEventListener("wheel", onUserScrollStart);
      layout.removeEventListener("touchstart", onUserScrollStart);
      layout.removeEventListener("pointerdown", onUserScrollStart);
      layout.removeEventListener("keydown", onKeyDown);
      if (frame !== 0) window.cancelAnimationFrame(frame);
      cancelProgrammaticScroll();
    };
  }, [toc, interactiveReady]);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (!widthMenuRef.current?.contains(event.target as Node)) {
        setWidthMenuOpen(false);
        setWidthSubmenuOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setWidthMenuOpen(false);
        setWidthSubmenuOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  useEffect(() => {
    if (!activeTocAnchor) return;
    const nav = tocNavRef.current;
    const link = tocLinkRefs.current.get(activeTocAnchor);
    if (!nav || !link) return;
    const linkTop = link.offsetTop;
    const linkBottom = linkTop + link.offsetHeight;
    if (linkTop < nav.scrollTop) nav.scrollTop = linkTop;
    else if (linkBottom > nav.scrollTop + nav.clientHeight)
      nav.scrollTop = linkBottom - nav.clientHeight;
  }, [activeTocAnchor]);

  const handleTocClick = (event: MouseEvent<HTMLAnchorElement>, anchor: string) => {
    event.preventDefault();
    if (!getHeading(anchor)) return;
    setActiveTocAnchor(anchor);
    tocNavigationLockRef.current = true;
    scrollToHeading(anchor);
    window.history.replaceState(null, "", `#${anchor}`);
  };

  const copyLink = async () => {
    await navigator.clipboard?.writeText(window.location.href);
  };

  const publisherName = content.publisher?.name?.trim() || "发布人";
  const publisherInitial = Array.from(publisherName)[0] ?? "发";
  const visibleViewers = activeViewers.slice(0, 5);
  const viewerOverflow = Math.max(0, activeViewers.length - visibleViewers.length);

  return (
    <div
      className={`sg-public-page width-${widthMode}${tocOpen ? " toc-open" : ""}${transitionsEnabled ? " transitions-enabled" : ""}${hasInitialHash ? " has-initial-hash" : ""}${initialPositionReady ? " initial-position-ready" : ""}${layoutStateReady ? " layout-state-ready" : ""}${clientHydrated ? " client-hydrated" : ""}${interactiveReady ? " client-ready" : ""}`}
    >
      <header className="sg-public-header">
        <div className="sg-public-header-leading">
          {interactiveReady ? (
            <button
              type="button"
              className={`sg-public-icon-button sg-public-toc-toggle${tocOpen ? " is-open" : ""}`}
              onClick={() =>
                setTocOpen((open) => {
                  const next = !open;
                  try {
                    window.localStorage.setItem(tocOpenStorageKey, String(next));
                  } catch {
                    // Keep the control usable when localStorage is unavailable.
                  }
                  return next;
                })
              }
              aria-label={tocOpen ? "隐藏目录" : "显示目录"}
              title={tocOpen ? "隐藏目录" : "显示目录"}
            >
              {tocOpen ? <AlignLeft size={18} /> : <Menu size={18} />}
            </button>
          ) : clientHydrated ? (
            <span
              className="sg-public-hydration-skeleton sg-public-header-control-skeleton"
              aria-hidden="true"
            />
          ) : (
            <span className="sg-public-header-control-placeholder" aria-hidden="true" />
          )}
          <h1 className="sg-public-header-title" title={content.title}>
            {content.title}
          </h1>
        </div>
        <div className="sg-public-actions">
          <div className="sg-public-viewer-stack" aria-label="当前浏览的人">
            {visibleViewers.map((viewer, index) => {
              const name = viewer.displayName?.trim() || (viewer.userId ? "用户" : "访客");
              const initial = Array.from(name)[0] ?? "访";
              return (
                <span
                  key={viewer.visitorKey}
                  className="sg-public-viewer-avatar-wrap"
                  title={name}
                  style={{ zIndex: visibleViewers.length - index }}
                >
                  <span className="sg-public-viewer-avatar" aria-label={name}>
                    {viewer.avatarUrl ? (
                      // biome-ignore lint/performance/noImgElement: viewer avatars may come from an arbitrary public gateway URL.
                      <img src={viewer.avatarUrl} alt={name} />
                    ) : (
                      <span>{initial}</span>
                    )}
                  </span>
                  <span className="sg-public-viewer-tooltip" role="tooltip">
                    {name}
                  </span>
                </span>
              );
            })}
            {viewerOverflow > 0 ? (
              <span
                className="sg-public-viewer-avatar-wrap sg-public-viewer-overflow-wrap"
                title={`${viewerOverflow} 位其他浏览者`}
              >
                <span className="sg-public-viewer-avatar sg-public-viewer-overflow">
                  +{viewerOverflow}
                </span>
                <span className="sg-public-viewer-tooltip" role="tooltip">
                  {viewerOverflow} 位其他浏览者
                </span>
              </span>
            ) : null}
          </div>
          <span className="sg-public-visitor-count" title="浏览人数">
            <Eye size={15} />
            <span>{visitorCount}</span>
            <span className="sg-public-visitor-label">浏览人数</span>
          </span>
          <span
            className={`sg-public-visibility-tag${content.visibility === "public" ? " is-public" : ""}`}
          >
            {content.visibility === "public" ? <Globe2 size={13} /> : <LockKeyhole size={13} />}
            {content.visibility === "public" ? "公开" : "私有"}
          </span>
          <div ref={widthMenuRef} className="sg-public-width-menu">
            <button
              type="button"
              className="sg-public-icon-button sg-public-width-toggle"
              onClick={() => {
                setWidthMenuOpen((open) => {
                  if (open) setWidthSubmenuOpen(false);
                  return !open;
                });
              }}
              aria-expanded={widthMenuOpen}
              aria-haspopup="menu"
              aria-label="内容宽度"
              title="内容宽度"
            >
              <MoreHorizontal size={18} />
            </button>
            {widthMenuOpen ? (
              <div className="sg-public-width-popover" role="menu" aria-label="更多操作">
                <button
                  type="button"
                  role="menuitem"
                  className="sg-public-width-option"
                  onClick={() => {
                    void copyLink();
                    setWidthMenuOpen(false);
                    setWidthSubmenuOpen(false);
                  }}
                >
                  <Copy size={15} />
                  <span>复制链接</span>
                </button>
                <div className="sg-public-width-submenu">
                  <button
                    type="button"
                    role="menuitem"
                    className={`sg-public-width-option${widthSubmenuOpen ? " is-active" : ""}`}
                    aria-expanded={widthSubmenuOpen}
                    aria-haspopup="menu"
                    onMouseEnter={() => setWidthSubmenuOpen(true)}
                    onFocus={() => setWidthSubmenuOpen(true)}
                    onClick={() => setWidthSubmenuOpen(true)}
                  >
                    <span className="sg-public-menu-item-leading">
                      <AlignJustify size={15} />
                      <span>页宽设置</span>
                    </span>
                    <ChevronRight size={15} />
                  </button>
                  {widthSubmenuOpen ? (
                    <div className="sg-public-width-subpopover" role="menu" aria-label="页宽设置">
                      <p className="sg-public-width-subtitle">
                        为当前窗口选择合适页宽 <HelpCircle size={14} aria-hidden="true" />
                      </p>
                      <div className="sg-public-width-options">
                        {(
                          [
                            ["default", "默认", <AlignJustify key="default" size={15} />],
                            ["wide", "较宽", <StretchHorizontal key="wide" size={15} />],
                            ["full", "全宽", <Maximize2 key="full" size={15} />],
                          ] as const
                        ).map(([mode, label, icon]) => (
                          <button
                            key={mode}
                            type="button"
                            role="menuitemradio"
                            aria-checked={widthMode === mode}
                            className={`sg-public-width-option sg-public-width-choice${widthMode === mode ? " is-active" : ""}`}
                            onClick={() => {
                              setWidthMode(mode);
                              try {
                                window.localStorage.setItem(widthModeStorageKey, mode);
                              } catch {
                                // Keep the control usable when localStorage is unavailable.
                              }
                              setWidthMenuOpen(false);
                              setWidthSubmenuOpen(false);
                            }}
                          >
                            {icon}
                            <span>{label}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
          <div className="sg-public-publisher" title={`发布人：${publisherName}`}>
            {content.publisher?.avatarUrl ? (
              // biome-ignore lint/performance/noImgElement: publisher avatars may come from an arbitrary public gateway URL.
              <img src={content.publisher.avatarUrl} alt={publisherName} />
            ) : (
              <span>{publisherInitial}</span>
            )}
          </div>
        </div>
      </header>
      <div ref={layoutRef} className="sg-public-layout sg-scrollbar">
        {interactiveReady ? (
          <aside
            className={`sg-public-toc sg-scrollbar${tocOpen ? " is-open" : ""}`}
            aria-label="文档目录"
            aria-hidden={!tocOpen}
          >
            {toc.length > 0 ? (
              <nav ref={tocNavRef}>
                {toc.map((item) => (
                  <a
                    key={item.anchor}
                    ref={(link) => {
                      if (link) tocLinkRefs.current.set(item.anchor, link);
                      else tocLinkRefs.current.delete(item.anchor);
                    }}
                    className={`level-${item.level}${activeTocAnchor === item.anchor ? " is-active" : ""}`}
                    href={`#${item.anchor}`}
                    aria-current={activeTocAnchor === item.anchor ? "location" : undefined}
                    onClick={(event) => handleTocClick(event, item.anchor)}
                  >
                    {item.text}
                  </a>
                ))}
              </nav>
            ) : (
              <p className="sg-public-toc-empty">本文档暂无目录</p>
            )}
          </aside>
        ) : clientHydrated ? (
          <aside className="sg-public-toc sg-public-toc-skeleton" aria-hidden="true">
            <div className="sg-public-skeleton-line is-wide" />
            {toc.slice(0, 12).map((item, index) => (
              <div
                key={`${item.anchor}-skeleton`}
                className={`sg-public-skeleton-line${index % 4 === 0 ? " is-short" : ""}`}
              />
            ))}
          </aside>
        ) : null}
        <main
          ref={contentRef}
          className="sg-public-content"
          onCopy={content.allowCopy ? undefined : (event) => event.preventDefault()}
          onContextMenu={content.allowCopy ? undefined : (event) => event.preventDefault()}
        >
          <div
            className="sg-public-seo-markdown"
            dangerouslySetInnerHTML={{ __html: serverMarkdownHtml }}
          />
          {clientHydrated && !interactiveReady ? (
            <div className="sg-public-content-skeleton" aria-hidden="true">
              <div className="sg-public-skeleton-line is-title" />
              <div className="sg-public-skeleton-line is-medium" />
              <div className="sg-public-skeleton-line" />
              <div className="sg-public-skeleton-line is-wide" />
              <div className="sg-public-skeleton-line is-wide" />
              <div className="sg-public-skeleton-line is-short" />
              <div className="sg-public-skeleton-block" />
              <div className="sg-public-skeleton-line is-medium" />
              <div className="sg-public-skeleton-line is-wide" />
              <div className="sg-public-skeleton-line" />
              <div className="sg-public-skeleton-line is-short" />
            </div>
          ) : null}
          <div className="sg-public-interactive-markdown" hidden={!interactiveReady}>
            <InteractiveMarkdown
              source={content.markdown}
              assetLinks={content.assetLinks}
              onReady={() => setInteractiveReady(true)}
            />
          </div>
          <footer className="sg-public-footer">由 Shiguang Lab 发布 · 内容可追溯</footer>
        </main>
      </div>
    </div>
  );
}
