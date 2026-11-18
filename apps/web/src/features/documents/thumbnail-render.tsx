import { useEffect, useMemo, useState } from "react";
import { DocumentMarkdown } from "../../shared/document-markdown.js";
import { useShellStyles } from "../../styles/shell.js";

interface ThumbnailPayload {
  title: string;
  markdown: string;
  seq: number;
}

declare global {
  interface Window {
    __thumbnailRendererReady?: boolean;
    __thumbnailRenderedSeq?: number;
    __renderThumbnail?: (payload: ThumbnailPayload) => void;
  }
}

function startsWithH1(markdown: string): boolean {
  const firstNonEmpty = markdown
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.length > 0);
  return Boolean(firstNonEmpty && /^#\s+/.test(firstNonEmpty));
}

function extractOutlineHeadings(markdown: string): Array<{ level: number; text: string }> {
  const result: Array<{ level: number; text: string }> = [];
  let inFence = false;
  for (const rawLine of markdown.split("\n")) {
    const line = rawLine.trim();
    if (/^```|^~~~/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const match = /^(#{1,4})\s+(.+)$/.exec(line);
    if (!match) continue;
    const level = match[1]?.length ?? 1;
    const text = (match[2] ?? "").replace(/\s+#+\s*$/, "").trim();
    if (text) result.push({ level, text });
  }
  return result;
}

export function ThumbnailRenderPage() {
  const { styles } = useShellStyles();
  const [payload, setPayload] = useState<ThumbnailPayload>({
    title: "",
    markdown: "",
    seq: 0,
  });

  useEffect(() => {
    window.__renderThumbnail = (next) => {
      setPayload(next);
    };
    window.__thumbnailRendererReady = true;
    document.documentElement.dataset.thumbnailReady = "1";
    return () => {
      delete window.__renderThumbnail;
      delete window.__thumbnailRendererReady;
    };
  }, []);

  useEffect(() => {
    if (payload.seq <= 0) return;
    let cancelled = false;
    const markDone = () => {
      if (cancelled) return;
      window.__thumbnailRenderedSeq = payload.seq;
      document.documentElement.dataset.renderSeq = String(payload.seq);
    };
    // Allow React + XMarkdown + Mermaid/styles to flush two animation frames.
    const raf1 = requestAnimationFrame(() => {
      const raf2 = requestAnimationFrame(markDone);
      if (cancelled) cancelAnimationFrame(raf2);
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf1);
    };
  }, [payload]);

  const headings = useMemo(() => extractOutlineHeadings(payload.markdown), [payload.markdown]);
  const showTitleHeading = Boolean(payload.title && !startsWithH1(payload.markdown));

  return (
    <div
      className={styles.root}
      style={{
        width: "100vw",
        height: "100vh",
        overflow: "hidden",
        boxSizing: "border-box",
        padding: "24px 28px",
        background:
          "radial-gradient(900px 520px at 12% 0%, rgba(124, 58, 237, 0.22), transparent 62%), radial-gradient(760px 460px at 88% 12%, rgba(56, 189, 248, 0.14), transparent 58%), #0B0E1A",
        display: "grid",
        gridTemplateColumns: headings.length > 0 ? "228px minmax(0, 1fr)" : "minmax(0, 1fr)",
        gap: 20,
      }}
    >
      {headings.length > 0 ? (
        <aside className="zx-outline-rail" style={{ overflow: "hidden" }}>
          <div className="zx-outline-title">大纲目录</div>
          {headings.slice(0, 18).map((heading, idx) => (
            <div
              key={`${heading.level}-${heading.text}-${idx}`}
              className={`zx-toc-item ${idx === 0 ? "first" : ""}`}
              style={{ paddingLeft: 12 + (heading.level - 1) * 12 }}
            >
              {heading.text}
            </div>
          ))}
        </aside>
      ) : null}

      <div
        className="zx-paper-sheet"
        style={{
          minWidth: 0,
          minHeight: 0,
          height: "100%",
          padding: "36px 46px",
          overflow: "hidden",
          borderRadius: 22,
        }}
      >
        {showTitleHeading ? (
          <h1
            style={{
              margin: "0 0 18px",
              color: "var(--sg-fg)",
              fontSize: 30,
              fontWeight: 800,
              letterSpacing: "-0.025em",
              lineHeight: 1.25,
            }}
          >
            {payload.title}
          </h1>
        ) : null}
        {payload.markdown ? (
          <DocumentMarkdown source={payload.markdown} />
        ) : (
          <div style={{ color: "var(--sg-muted)", fontSize: 16 }}>空文档</div>
        )}
      </div>
    </div>
  );
}
