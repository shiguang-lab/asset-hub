"use client";

import {Scrollbar} from "@shiguang2/components";
import {Empty} from "@shiguang/ui";
import {useRequest} from "ahooks";
import {Menu as AntMenu, Avatar, Button, type MenuProps, Skeleton, Tooltip} from "antd";
import {createStyles} from "antd-style";
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
  MessageSquare,
  MoreHorizontal,
  StretchHorizontal,
} from "lucide-react";
import {type MouseEvent, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState,} from "react";

import {rewriteAssetLinks} from "../render/rewrite-asset-links";
import {isClient} from "../utils/environment";
import {InteractiveMarkdown} from "./interactive-markdown";
import {SeoSnapshot} from "./seo-snapshot";

export interface PublicReaderContent {
  title: string;
  markdown: string;
  visibility: string;
  visitorCount: number;
  publishId: string;
  releaseId: string;
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

interface PublicComment {
  id: string;
  publishId: string;
  releaseId: string;
  authorSubject: string;
  authorName: string;
  content: string;
  createdAt: string;
}

type ContentWidth = "default" | "wide" | "full";

interface PublicTocItem {
  /** Readable, stable anchor written to both the URL hash and the heading element. */
  id: string;
  /** Positional index used to address the matching heading in XMarkdown's rendered DOM. */
  domIndex: number;
  level: number;
  text: string;
}

const tocOpenStorageKey = "sg-public-toc-open";
const widthModeStorageKey = "sg-public-width-mode";
const visitorStorageKey = "sg-public-visitor-fingerprint";
const ACTIVE_TOC_OFFSET_PX = 32;
const SCROLL_KEYS = new Set(["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "]);

interface PresenceResult {
  visitorCount: number;
  viewers: PublicViewer[];
}

function getOrCreateVisitorId(): string {
  try {
    const existing = window.localStorage.getItem(visitorStorageKey);
    if (existing && existing.length >= 16) return existing;
  } catch {
    // localStorage can be unavailable in private browsing.
  }
  const generated =
    typeof window.crypto?.randomUUID === "function"
      ? window.crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  try {
    window.localStorage.setItem(visitorStorageKey, generated);
  } catch {
    // The in-memory value still supports presence for this page lifetime.
  }
  return generated;
}

interface PresenceIdentity {
  userId: string;
  displayName: string | null;
  avatarUrl: string | null;
}

let presenceIdentityPromise: Promise<PresenceIdentity | null> | null = null;

/**
 * Resolves the signed-in identity for the presence feed without ever forcing a
 * login: `/api/auth/session` returns plain JSON state (401 when anonymous), so a
 * logged-out visitor simply resolves to `null` and is reported as a guest. The
 * result is cached for the page lifetime so the 30s presence poll does not
 * re-hit the auth endpoint on every tick.
 */
async function fetchPresenceIdentity(): Promise<PresenceIdentity | null> {
  let response: Response;
  try {
    response = await fetch("/api/auth/session", {
      credentials: "include",
      headers: {Accept: "application/json"},
    });
  } catch {
    return null;
  }
  if (!response.ok) return null;
  let body: {
    authenticated?: boolean;
    subject?: string;
    displayName?: string;
    preferredUsername?: string;
    avatarUrl?: string | null;
    user?: {id?: string; username?: string; avatarUrl?: string | null};
  };
  try {
    body = (await response.json()) as typeof body;
  } catch {
    return null;
  }
  const userId = body.user?.id || (body.authenticated === true ? body.subject : undefined);
  if (!userId) return null;
  const displayName =
    body.user?.username?.trim() ||
    body.displayName?.trim() ||
    body.preferredUsername?.trim() ||
    userId;
  const avatarUrl = body.user?.avatarUrl ?? body.avatarUrl ?? null;
  return {
    userId,
    displayName: displayName.slice(0, 120) || null,
    avatarUrl: isHttpUrl(avatarUrl) ? avatarUrl.slice(0, 2_000) : null,
  };
}

function getPresenceIdentity(): Promise<PresenceIdentity | null> {
  if (!presenceIdentityPromise) {
    presenceIdentityPromise = fetchPresenceIdentity().catch(() => null);
  }
  return presenceIdentityPromise;
}

function isHttpUrl(value: string | null | undefined): value is string {
  if (!value) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

const usePublicReaderStyles = createStyles(({token}) => ({
  headerButton: {
    width: 32,
    height: 32,
    padding: 0,
    color: `${token.colorTextSecondary} !important`,
    border: "0 !important",
    background: "transparent !important",
    boxShadow: "none !important",
    "&:hover": {
      color: `${token.colorText} !important`,
      background: `${token.colorFillSecondary} !important`,
    },
    "&.sg-public-width-toggle.is-open": {
      color: `${token.colorText} !important`,
      border: "1px solid #7aa2ff !important",
      background: `${token.colorFillSecondary} !important`,
    },
  },
  viewerAvatar: {
    width: 28,
    height: 28,
    fontSize: 11,
    fontWeight: 700,
    border: `2px solid ${token.colorBgBase}`,
    background: "linear-gradient(135deg, #7c5cff, #2c9cdb)",
  },
  publisherAvatar: {
    border: "1px solid rgba(255, 255, 255, 0.12)",
    background: "linear-gradient(135deg, #8b72ff, #30b8a5)",
  },
}));

export interface PublicReaderProps {
  slug: string;
  content: PublicReaderContent;
  snapshotHtml: string;
}

/**
 * Live public document reader. Mirrors the pattern used by superagentui's
 * kbDocPreview: XMarkdown renders the markdown content on the client, the TOC
 * is extracted from rendered heading elements (via useLayoutEffect), and
 * navigation uses the browser's native
 * `scrollIntoView` against a heading index — no offsetTop chains, no
 * hand-injected heading ids, no risk of the DOM positions drifting between
 * server and client renders.
 */
export function PublicReader({slug, content, snapshotHtml}: PublicReaderProps) {
  const {styles} = usePublicReaderStyles();
  const rewritten = useMemo(() => rewriteAssetLinks(content), [content]);

  const [toc, setToc] = useState<PublicTocItem[]>([]);
  const [activeTocId, setActiveTocId] = useState<string | null>(null);
  const [tocOpen, setTocOpen] = useState(() => {
    if (!isClient()) return true;
    try {
      return window.localStorage.getItem(tocOpenStorageKey) !== "false";
    } catch {
      return true;
    }
  });
  const [widthMode, setWidthMode] = useState<ContentWidth>(() => {
    if (!isClient()) return "default";
    try {
      const stored = window.localStorage.getItem(widthModeStorageKey);
      return stored === "wide" || stored === "full" ? stored : "default";
    } catch {
      return "default";
    }
  });
  const [widthMenuOpen, setWidthMenuOpen] = useState(false);
  const [widthSubmenuOpen, setWidthSubmenuOpen] = useState(false);
  // Comments panel visibility. Default hidden, intentionally NOT persisted — it is
  // a per-view preference, not a stored setting.
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [clientReady, setClientReady] = useState(false);
  const [transitionsEnabled, setTransitionsEnabled] = useState(false);

  const {data: presence} = useRequest(
    async (): Promise<PresenceResult> => {
      const identity = await getPresenceIdentity();
      const response = await fetch(`/p/${encodeURIComponent(slug)}/presence`, {
        method: "POST",
        credentials: "include",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({
          visitorId: getOrCreateVisitorId(),
          userId: identity?.userId ?? null,
          displayName: identity?.displayName ?? null,
          avatarUrl: identity?.avatarUrl ?? null,
        }),
      });
      if (!response.ok) throw new Error("PRESENCE_UNAVAILABLE");
      return (await response.json()) as PresenceResult;
    },
    {
      ready: clientReady,
      pollingInterval: 30_000,
      pollingWhenHidden: false,
      refreshDeps: [slug],
    },
  );
  const visitorCount = presence?.visitorCount ?? content.visitorCount;
  const activeViewers = presence?.viewers ?? [];

  // ---------------- Comments ----------------
  // Identity is resolved server-side on write (the edge forward-auth turns the
  // session cookie into X-SG-Identity). The client only probes login state for
  // UI (show an input vs "log in to comment"); it never sends userId/displayName.
  const [comments, setComments] = useState<PublicComment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const [commentLoginRequired, setCommentLoginRequired] = useState(false);
  const [commentError, setCommentError] = useState<string | null>(null);
  const [commentAuthor, setCommentAuthor] = useState<PresenceIdentity | null>(null);

  useEffect(() => {
    if (!clientReady) return;
    let cancelled = false;
    setCommentsLoading(true);
    void (async () => {
      try {
        const response = await fetch(`/p/${encodeURIComponent(slug)}/comments`, {
          credentials: "include",
          headers: {Accept: "application/json"},
        });
        if (!response.ok) throw new Error("COMMENTS_UNAVAILABLE");
        const body = (await response.json()) as {comments?: PublicComment[]};
        if (!cancelled) setComments(body.comments ?? []);
      } catch {
        // Leave the section empty rather than crashing the reader.
      } finally {
        if (!cancelled) setCommentsLoading(false);
      }
    })();
    void getPresenceIdentity().then((identity) => {
      if (!cancelled) setCommentAuthor(identity);
    });
    return () => {
      cancelled = true;
    };
  }, [clientReady, slug]);

  const submitComment = async () => {
    const text = commentText.trim();
    if (!text || !content.publishId || !content.releaseId) return;
    setCommentSubmitting(true);
    setCommentLoginRequired(false);
    setCommentError(null);
    try {
      const response = await fetch("/api/v1/comments", {
        method: "POST",
        credentials: "include",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({
          publishId: content.publishId,
          releaseId: content.releaseId,
          content: text.slice(0, 2_000),
        }),
      });
      if (response.status === 401) {
        setCommentLoginRequired(true);
        return;
      }
      if (!response.ok) throw new Error("COMMENT_FAILED");
      const body = (await response.json()) as {comment: PublicComment};
      setComments((current) => [...current, body.comment]);
      setCommentText("");
    } catch {
      setCommentError("评论发送失败，请稍后重试");
    } finally {
      setCommentSubmitting(false);
    }
  };

  const contentRef = useRef<HTMLElement>(null);
  const [contentViewport, setContentViewport] = useState<HTMLElement | null>(null);
  const [tocViewport, setTocViewport] = useState<HTMLElement | null>(null);
  const tocLinkRefs = useRef(new Map<string, HTMLAnchorElement>());

  const activeTocIdRef = useRef<string | null>(null);
  const headingOffsetsRef = useRef<Array<{ id: string; top: number }>>([]);
  const scrollFrameIdRef = useRef<number | null>(null);
  const navigationTargetIdRef = useRef<string | null>(null);
  const userScrollIntentRef = useRef(false);
  const widthMenuCloseTimerRef = useRef<number | null>(null);

  const commitActiveToc = useCallback((nextActiveId: string | null) => {
    if (nextActiveId === activeTocIdRef.current) return;
    activeTocIdRef.current = nextActiveId;
    setActiveTocId(nextActiveId);
  }, []);

  const clearWidthMenuCloseTimer = useCallback(() => {
    if (widthMenuCloseTimerRef.current !== null) {
      window.clearTimeout(widthMenuCloseTimerRef.current);
      widthMenuCloseTimerRef.current = null;
    }
  }, []);

  const openWidthMenu = useCallback(() => {
    clearWidthMenuCloseTimer();
    setWidthMenuOpen(true);
  }, [clearWidthMenuCloseTimer]);

  const scheduleWidthMenuClose = useCallback(() => {
    clearWidthMenuCloseTimer();
    widthMenuCloseTimerRef.current = window.setTimeout(() => {
      setWidthMenuOpen(false);
      setWidthSubmenuOpen(false);
      widthMenuCloseTimerRef.current = null;
    }, 160);
  }, [clearWidthMenuCloseTimer]);

  useLayoutEffect(() => {
    // Mount the interactive reader before the browser paints.
    if (isClient()) setClientReady(true);
  }, []);

  useEffect(() => {
    return () => {
      clearWidthMenuCloseTimer();
    };
  }, [clearWidthMenuCloseTimer]);

  useEffect(() => {
    const frameId = window.requestAnimationFrame(() => setTransitionsEnabled(true));
    return () => window.cancelAnimationFrame(frameId);
  }, []);

  // ---------------- Build TOC from rendered DOM ----------------
  // XMarkdown doesn't add `id` attributes to headings, so build the TOC from its DOM.
  useLayoutEffect(() => {
    if (!clientReady) return;
    // Re-read headings after the client markdown source changes.
    void rewritten;
    const container = contentRef.current;
    if (!container) return;
    const headings = getMarkdownHeadings(container);
    const nextToc = buildTocFromHeadings(headings);
    for (const item of nextToc) headings[item.domIndex].id = item.id;
    navigationTargetIdRef.current = null;
    userScrollIntentRef.current = false;
    setToc(nextToc);
    commitActiveToc(nextToc[0]?.id ?? null);
  }, [clientReady, commitActiveToc, rewritten]);

  // ---------------- Heading offset tracking & active heading ----------------
  const measureHeadingOffsets = useCallback(() => {
    const container = contentRef.current;
    if (!contentViewport || !container) return;
    const headings = getMarkdownHeadings(container);
    if (!headings.length) {
      headingOffsetsRef.current = [];
      return;
    }
    const viewportRect = contentViewport.getBoundingClientRect();
    headingOffsetsRef.current = headings.map((element, index) => ({
      id: element.id || String(index),
      top:
        element.getBoundingClientRect().top -
        viewportRect.top +
        contentViewport.scrollTop,
    }));
  }, [contentViewport]);

  const findActiveTocId = useCallback((): string | null => {
    if (!contentViewport) return null;
    const offsets = headingOffsetsRef.current;
    if (!offsets.length) return null;
    const targetTop = contentViewport.scrollTop + ACTIVE_TOC_OFFSET_PX;
    let low = 0;
    let high = offsets.length - 1;
    let activeIndex = 0;
    while (low <= high) {
      const middle = Math.floor((low + high) / 2);
      if (offsets[middle].top <= targetTop) {
        activeIndex = middle;
        low = middle + 1;
      } else {
        high = middle - 1;
      }
    }
    return offsets[activeIndex]?.id ?? null;
  }, [contentViewport]);

  const scheduleActiveHeadingUpdate = useCallback(() => {
    if (scrollFrameIdRef.current !== null) return;
    scrollFrameIdRef.current = window.requestAnimationFrame(() => {
      scrollFrameIdRef.current = null;
      if (navigationTargetIdRef.current) return;
      const next = findActiveTocId();
      if (next !== null) commitActiveToc(next);
    });
  }, [commitActiveToc, findActiveTocId]);

  useLayoutEffect(() => {
    if (!clientReady) return;
    const container = contentRef.current;
    if (!contentViewport || !container) return;
    let measureTimerId: number | null = null;
    const scheduleMeasure = () => {
      if (measureTimerId !== null) window.clearTimeout(measureTimerId);
      measureTimerId = window.setTimeout(() => {
        measureTimerId = null;
        measureHeadingOffsets();
        scheduleActiveHeadingUpdate();
      }, 120);
    };
    const onContentScroll = () => {
      if (navigationTargetIdRef.current) {
        if (!userScrollIntentRef.current) return;
        navigationTargetIdRef.current = null;
      }
      userScrollIntentRef.current = false;
      scheduleActiveHeadingUpdate();
    };
    const onUserScrollIntent = (event: Event) => {
      if (event.type === "pointermove" && (event as PointerEvent).buttons === 0) return;
      userScrollIntentRef.current = true;
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (SCROLL_KEYS.has(event.key)) userScrollIntentRef.current = true;
    };
    contentViewport.addEventListener("scroll", onContentScroll, {passive: true});
    contentViewport.addEventListener("wheel", onUserScrollIntent, {passive: true});
    contentViewport.addEventListener("touchmove", onUserScrollIntent, {passive: true});
    contentViewport.addEventListener("pointermove", onUserScrollIntent, {passive: true});
    contentViewport.addEventListener("keydown", onKeyDown);
    const resizeObserver =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(scheduleMeasure);
    resizeObserver?.observe(container);
    // initial measure + first active heading computation
    const initialFrameId = window.requestAnimationFrame(() => {
      measureHeadingOffsets();
      const next = findActiveTocId();
      if (next !== null) commitActiveToc(next);
    });
    return () => {
      window.cancelAnimationFrame(initialFrameId);
      if (scrollFrameIdRef.current !== null) {
        window.cancelAnimationFrame(scrollFrameIdRef.current);
        scrollFrameIdRef.current = null;
      }
      if (measureTimerId !== null) window.clearTimeout(measureTimerId);
      contentViewport.removeEventListener("scroll", onContentScroll);
      contentViewport.removeEventListener("wheel", onUserScrollIntent);
      contentViewport.removeEventListener("touchmove", onUserScrollIntent);
      contentViewport.removeEventListener("pointermove", onUserScrollIntent);
      contentViewport.removeEventListener("keydown", onKeyDown);
      resizeObserver?.disconnect();
    };
  }, [
    clientReady,
    commitActiveToc,
    contentViewport,
    findActiveTocId,
    measureHeadingOffsets,
    scheduleActiveHeadingUpdate,
  ]);

  // Auto-scroll the active toc item into view inside the toc nav.
  useEffect(() => {
    if (!activeTocId) return;
    const link = tocLinkRefs.current.get(activeTocId);
    if (!tocViewport || !link) return;
    const viewportRect = tocViewport.getBoundingClientRect();
    const linkRect = link.getBoundingClientRect();
    if (linkRect.top < viewportRect.top) {
      tocViewport.scrollTop -= viewportRect.top - linkRect.top;
    } else if (linkRect.bottom > viewportRect.bottom) {
      tocViewport.scrollTop += linkRect.bottom - viewportRect.bottom;
    }
  }, [activeTocId, tocViewport]);

  // ---------------- Hash navigation on mount ----------------
  useLayoutEffect(() => {
    if (!toc.length) return;
    const hash = window.location.hash;
    if (!hash) return;
    const decoded = decodeURIComponent(hash.replace(/^#/, ""));
    const headings = getMarkdownHeadings(contentRef.current);
    const legacyIndex = /^\d+$/.test(decoded) ? Number(decoded) : -1;
    const target =
      headings.find(
        (heading) => heading.id === decoded || heading.textContent?.trim() === decoded,
      ) ?? headings[legacyIndex];
    if (target) {
      navigationTargetIdRef.current = target.id;
      userScrollIntentRef.current = false;
      commitActiveToc(target.id);
      target.scrollIntoView({behavior: "auto", block: "start"});
    }
  }, [commitActiveToc, toc]);

  // ---------------- Handlers ----------------
  const handleTocClick = (event: MouseEvent<HTMLAnchorElement>, item: PublicTocItem) => {
    event.preventDefault();
    const headings = getMarkdownHeadings(contentRef.current);
    const target = headings[item.domIndex];
    if (!target) return;
    navigationTargetIdRef.current = item.id;
    userScrollIntentRef.current = false;
    commitActiveToc(item.id);
    target.scrollIntoView({behavior: "smooth", block: "start"});
    try {
      window.history.replaceState(null, "", `#${encodeURIComponent(item.id)}`);
    } catch {
      // ignore
    }
  };

  const handleTocToggle = () => {
    setTocOpen((open) => {
      const next = !open;
      try {
        window.localStorage.setItem(tocOpenStorageKey, String(next));
      } catch {
        // Keep the toggle usable when localStorage is unavailable.
      }
      return next;
    });
  };

  const copyLink = async () => {
    await navigator.clipboard?.writeText(window.location.href);
  };

  const moreMenuItems = useMemo<MenuProps["items"]>(
  () => [
    {
      key: "copy",
      icon: <Copy size={15}/>,
      label: "复制链接",
      onMouseEnter: () => setWidthSubmenuOpen(false),
    },
    {
      key: "toggle-comments",
      icon: <MessageSquare size={15}/>,
      label: commentsOpen ? "隐藏评论" : "显示评论",
      onMouseEnter: () => setWidthSubmenuOpen(false),
    },
    {
      key: "width",
      className: widthSubmenuOpen ? "is-active" : undefined,
      icon: <AlignJustify size={15}/>,
      label: "页宽设置",
      extra: <ChevronRight size={15}/>,
      onMouseEnter: () => setWidthSubmenuOpen(true),
    },
  ],
  [widthSubmenuOpen, commentsOpen],
);

  const handleMoreMenuClick: MenuProps["onClick"] = ({key}) => {
    if (key === "toggle-comments") {
      setCommentsOpen((open) => !open);
      setWidthMenuOpen(false);
      setWidthSubmenuOpen(false);
      return;
    }
    if (key === "copy") {
      void copyLink();
      setWidthMenuOpen(false);
      setWidthSubmenuOpen(false);
      return;
    }
    if (key === "width") setWidthSubmenuOpen(true);
  };

  const handleWidthModeChange = (mode: ContentWidth) => {
    if (mode !== widthMode) {
      setWidthMode(mode);
      try {
        window.localStorage.setItem(widthModeStorageKey, mode);
      } catch {
        // Keep the control usable when localStorage is unavailable.
      }
    }
    setWidthMenuOpen(false);
    setWidthSubmenuOpen(false);
  };

  const publisherName = content.publisher?.name?.trim() || "发布人";
  const publisherInitial = Array.from(publisherName)[0] ?? "发";
  const visibleViewers = activeViewers.slice(0, 5);
  const viewerOverflow = Math.max(0, activeViewers.length - visibleViewers.length);

  const pageClassName = [
    "sg-public-page",
    `width-${widthMode}`,
    clientReady && tocOpen ? "toc-open" : "",
    commentsOpen ? "comments-open" : "",
    transitionsEnabled ? "transitions-enabled" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={pageClassName} suppressHydrationWarning>
      <header className="sg-public-header">
        <div className="sg-public-header-leading">
          <Tooltip title={tocOpen ? "隐藏目录" : "显示目录"}>
            <Button
              key={transitionsEnabled ? "toc-toggle-ready" : "toc-toggle-initial"}
              type="text"
              className={`${styles.headerButton} sg-public-toc-toggle`}
              onClick={handleTocToggle}
              aria-label={tocOpen ? "隐藏目录" : "显示目录"}
              suppressHydrationWarning
              icon={
                <span className="sg-public-toc-toggle-icons" aria-hidden="true">
                  <Menu className="sg-public-toc-toggle-menu-icon" size={18}/>
                  <AlignLeft className="sg-public-toc-toggle-close-icon" size={18}/>
                </span>
              }
            />
          </Tooltip>
          <h1 className="sg-public-header-title" title={content.title}>
            {content.title}
          </h1>
        </div>
        <div className="sg-public-actions">
          {visibleViewers.length > 0 ? (
            <div className="sg-public-viewer-stack">
              {visibleViewers.map((viewer, index) => {
                const name = viewer.displayName?.trim() || (viewer.userId ? "用户" : "访客");
                const initial = Array.from(name)[0] ?? "访";
                return (
                  <span
                    key={viewer.visitorKey}
                    className="sg-public-viewer-avatar-wrap"
                    style={{zIndex: visibleViewers.length - index}}
                  >
                    <Avatar className={styles.viewerAvatar} src={viewer.avatarUrl ?? undefined}>
                      {initial}
                    </Avatar>
                  </span>
                );
              })}
              {viewerOverflow > 0 ? (
                <span className="sg-public-viewer-avatar-wrap sg-public-viewer-overflow-wrap">
                  <Avatar className={styles.viewerAvatar}>+{viewerOverflow}</Avatar>
                </span>
              ) : null}
            </div>
          ) : null}
          <span className="sg-public-visitor-count">
            <Eye size={15}/>
            <span>{visitorCount}</span>
            <span className="sg-public-visitor-label">浏览人数</span>
          </span>
          <span
            className={`sg-public-visibility-tag ${
              content.visibility === "public" ? "is-public" : "is-private"
            }`}
          >
            {content.visibility === "public" ? <Globe2 size={13}/> : <LockKeyhole size={13}/>}
            {content.visibility === "public" ? "公开" : "私有"}
          </span>
          <fieldset
            className="sg-public-width-menu"
            aria-label="更多操作"
            onMouseEnter={openWidthMenu}
            onMouseLeave={scheduleWidthMenuClose}
            onFocus={openWidthMenu}
            onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget)) {
                setWidthMenuOpen(false);
                setWidthSubmenuOpen(false);
              }
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                setWidthMenuOpen(false);
                setWidthSubmenuOpen(false);
              }
            }}
          >
            <Button
              type="text"
              className={`${styles.headerButton} sg-public-width-toggle${
                widthMenuOpen ? " is-open" : ""
              }`}
              aria-label="更多操作"
              aria-expanded={widthMenuOpen}
              aria-haspopup="menu"
              icon={<MoreHorizontal size={18}/>}
            />
            {widthMenuOpen ? (
              <div className="sg-public-width-popover" role="menu" aria-label="更多操作">
                <AntMenu
                  className="sg-public-actions-menu"
                  items={moreMenuItems}
                  selectable={false}
                  onClick={handleMoreMenuClick}
                />
                {widthSubmenuOpen ? (
                  <div className="sg-public-width-subpopover" role="menu" aria-label="页宽设置">
                    <p className="sg-public-width-subtitle">
                      为当前窗口选择合适页宽 <HelpCircle size={14} aria-hidden="true"/>
                    </p>
                    <div className="sg-public-width-options">
                      {(
                        [
                          ["default", "默认", <AlignJustify key="default" size={15}/>],
                          ["wide", "较宽", <StretchHorizontal key="wide" size={15}/>],
                          ["full", "全宽", <Maximize2 key="full" size={15}/>],
                        ] as const
                      ).map(([mode, label, icon]) => (
                        <button
                          key={mode}
                          type="button"
                          role="menuitemradio"
                          aria-checked={widthMode === mode}
                          className={`sg-public-width-option sg-public-width-choice${
                            widthMode === mode ? " is-active" : ""
                          }`}
                          onClick={(event) => {
                            event.stopPropagation();
                            handleWidthModeChange(mode);
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
            ) : null}
          </fieldset>
          <Tooltip title={publisherName}>
            <div className="sg-public-publisher">
              <Avatar
                className={styles.publisherAvatar}
                src={content.publisher?.avatarUrl ?? undefined}
              >
                {publisherInitial}
              </Avatar>
            </div>
          </Tooltip>
        </div>
      </header>
      <div className="sg-public-layout">
        <SeoSnapshot title={content.title} html={snapshotHtml}/>
        {clientReady && isClient() ? (
          <>
            <div className="sg-public-toc-container">
              <aside
                className="sg-public-toc-panel"
                aria-label="文档目录"
                aria-hidden={!tocOpen}
              >
                <Scrollbar ref={setTocViewport} className="sg-public-toc" scrollX={false}>
                  {toc.length > 0 ? (
                    <nav>
                      {toc.map((item) => (
                        <a
                          key={item.id}
                          ref={(link) => {
                            if (link) tocLinkRefs.current.set(item.id, link);
                            else tocLinkRefs.current.delete(item.id);
                          }}
                          className={`level-${item.level}${activeTocId === item.id ? " is-active" : ""}`}
                          href={`#${encodeURIComponent(item.id)}`}
                          aria-current={activeTocId === item.id ? "location" : undefined}
                          onClick={(event) => handleTocClick(event, item)}
                        >
                          {item.text}
                        </a>
                      ))}
                    </nav>
                  ) : (
                    <p className="sg-public-toc-empty">本文档暂无目录</p>
                  )}
                </Scrollbar>
              </aside>
            </div>
            <div className="sg-public-content-container">
              <Scrollbar
                ref={setContentViewport}
                className="sg-public-content-scrollbar"
                scrollX={false}
              >
                <main
                  ref={contentRef}
                  className="sg-public-container"
                  onCopy={content.allowCopy ? undefined : (event) => event.preventDefault()}
                  onContextMenu={content.allowCopy ? undefined : (event) => event.preventDefault()}
                >
                  <article className="sg-public-content">
                    <InteractiveMarkdown source={rewritten}/>
                    <footer className="sg-public-footer">由 知序 发布 · 内容可追溯</footer>
                  </article>
                </main>
              </Scrollbar>
            </div>
            <div className="sg-public-comments-container">
              <PublicComments
                open={commentsOpen}
                comments={comments}
                loading={commentsLoading}
                text={commentText}
                onTextChange={setCommentText}
                submitting={commentSubmitting}
                loginRequired={commentLoginRequired}
                error={commentError}
                canComment={commentAuthor !== null}
                onSubmit={submitComment}
              />
            </div>
          </>
        ) : (
          <PublicReaderSkeleton/>
        )}
      </div>
    </div>
  );
}

// ---------------- Helpers ----------------

function PublicComments({
  open,
  comments,
  loading,
  text,
  onTextChange,
  submitting,
  loginRequired,
  error,
  canComment,
  onSubmit,
}: {
  open: boolean;
  comments: PublicComment[];
  loading: boolean;
  text: string;
  onTextChange: (value: string) => void;
  submitting: boolean;
  loginRequired: boolean;
  error: string | null;
  canComment: boolean;
  onSubmit: () => void;
}) {
  return (
    <aside className="sg-public-comments-panel" aria-label="评论" aria-hidden={!open}>
      <div className="sg-public-comments-header">
        <h2 className="sg-public-comments-title">评论（{comments.length}）</h2>
      </div>
      <Scrollbar className="sg-public-comments-scroll" scrollX={false}>
        {loading ? (
          <div className="sg-public-comments-loading">
            <Skeleton active paragraph={{rows: 4}} title={false}/>
          </div>
        ) : comments.length === 0 ? (
          <div className="sg-public-comments-empty">
            <Empty title="还没有评论" hint="成为第一个发表看法的人"/>
          </div>
        ) : (
          <ul className="sg-public-comment-list">
            {comments.map((comment) => (
              <li key={comment.id} className="sg-public-comment-item">
                <div className="sg-public-comment-meta">
                  <strong>{comment.authorName}</strong>
                  <time dateTime={comment.createdAt}>
                    {new Date(comment.createdAt).toLocaleString("zh-CN", {hour12: false})}
                  </time>
                </div>
                <p className="sg-public-comment-body">{comment.content}</p>
              </li>
            ))}
          </ul>
        )}
      </Scrollbar>
      <div className="sg-public-comment-editor">
        {canComment ? (
          <>
            <textarea
              className="sg-public-comment-input"
              rows={3}
              placeholder="写下你的评论…（以真实身份发布）"
              value={text}
              onChange={(event) => onTextChange(event.target.value)}
            />
            <div className="sg-public-comment-actions">
              {error || loginRequired ? (
                <span className="sg-public-comment-error">
                  {loginRequired ? "请先登录后再评论" : error}
                </span>
              ) : null}
              <button
                type="button"
                className="sg-public-comment-submit"
                disabled={submitting || !text.trim()}
                onClick={onSubmit}
              >
                {submitting ? "发送中…" : "发表评论"}
              </button>
            </div>
          </>
        ) : (
          <p className="sg-public-comment-login-hint">登录后可发表评论</p>
        )}
      </div>
    </aside>
  );
}

function PublicReaderSkeleton() {
  return (
    <main className="sg-public-content sg-public-content-skeleton" aria-hidden="true">
      <Skeleton active title={{width: "42%"}} paragraph={{rows: 12}}/>
    </main>
  );
}

const HEADING_SELECTOR = "h1, h2, h3, h4, h5, h6";

function getMarkdownHeadings(container: HTMLElement | null): HTMLElement[] {
  if (!container) return [];
  const markdownRoot = container.querySelector(".x-markdown");
  if (!markdownRoot) return [];
  return Array.from(markdownRoot.querySelectorAll<HTMLElement>(HEADING_SELECTOR)).filter(
    (heading) => heading.closest(".x-markdown") === markdownRoot,
  );
}

function buildTocFromHeadings(headings: HTMLElement[]): PublicTocItem[] {
  const counters = Array<number>(7).fill(0);
  const items: PublicTocItem[] = [];
  const anchorCounts = new Map<string, number>();

  headings.forEach((heading, domIndex) => {
    const text = heading.textContent?.trim() || "";
    if (!text) return;

    const level = Number(heading.tagName.slice(1));
    counters[level] += 1;
    counters.fill(0, level + 1);
    const firstNumberedLevel = counters.findIndex((count, index) => index > 0 && count > 0);
    const outlineIndex = counters.slice(firstNumberedLevel, level + 1).join("-");
    const headingSlug = slugifyHeading(text);
    const baseId = hasExplicitHeadingIndex(text) ? headingSlug : `${outlineIndex}-${headingSlug}`;
    const duplicateIndex = (anchorCounts.get(baseId) ?? 0) + 1;
    anchorCounts.set(baseId, duplicateIndex);
    items.push({
      id: duplicateIndex === 1 ? baseId : `${baseId}-${duplicateIndex}`,
      domIndex,
      level,
      text,
    });
  });

  return items;
}

function hasExplicitHeadingIndex(text: string): boolean {
  return /^\d+(?:(?:[.-]\d+)+|[.、)])(?:\s+|(?=[^\d]))/.test(text.trim());
}

function slugifyHeading(text: string): string {
  return (
    text
      .normalize("NFKC")
      .trim()
      .replace(/[^\p{L}\p{M}\p{N}_-]+/gu, "-")
      .replace(/-{2,}/g, "-")
      .replace(/^-|-$/g, "") || "section"
  );
}
