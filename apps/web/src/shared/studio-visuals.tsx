import { useEffect, useState } from "react";
import { API_BASE, type Asset } from "../entities/api.js";

export type StudioBadgeKind = "research" | "write" | "slides" | "kb";

export function StudioModeBadge({ kind }: { kind: StudioBadgeKind }) {
  if (kind === "research") {
    return (
      <svg width="38" height="38" viewBox="0 0 38 38" fill="none" aria-hidden="true">
        <defs>
          <linearGradient id="zx-sb-r" x1="2" y1="2" x2="36" y2="36" gradientUnits="userSpaceOnUse">
            <stop stopColor="#38BDF8" />
            <stop offset="1" stopColor="#2563EB" />
          </linearGradient>
        </defs>
        <rect width="38" height="38" rx="11" fill="url(#zx-sb-r)" />
        <circle cx="17.8" cy="17.8" r="5.4" stroke="#FFF" strokeWidth="2.1" />
        <path d="M22 22L26.2 26.2" stroke="#FFF" strokeWidth="2.3" strokeLinecap="round" />
      </svg>
    );
  }
  if (kind === "write") {
    return (
      <svg width="38" height="38" viewBox="0 0 38 38" fill="none" aria-hidden="true">
        <defs>
          <linearGradient id="zx-sb-w" x1="2" y1="2" x2="36" y2="36" gradientUnits="userSpaceOnUse">
            <stop stopColor="#34D399" />
            <stop offset="1" stopColor="#059669" />
          </linearGradient>
        </defs>
        <rect width="38" height="38" rx="11" fill="url(#zx-sb-w)" />
        <path
          d="M21.5 11.5H14.5C13.7 11.5 13 12.2 13 13V25C13 25.8 13.7 26.5 14.5 26.5H23.5C24.3 26.5 25 25.8 25 25V18.5"
          stroke="#FFF"
          strokeWidth="1.9"
          strokeLinecap="round"
        />
        <path
          d="M16 16.8H19.5M16 20.5H20.5"
          stroke="#FFF"
          strokeWidth="1.9"
          strokeLinecap="round"
        />
        <path d="M21 18L25.5 13.5L27.3 15.3L22.8 19.8L20.5 20.2L21 18Z" fill="#FFF" />
      </svg>
    );
  }
  if (kind === "slides") {
    return (
      <svg width="38" height="38" viewBox="0 0 38 38" fill="none" aria-hidden="true">
        <defs>
          <linearGradient id="zx-sb-s" x1="2" y1="2" x2="36" y2="36" gradientUnits="userSpaceOnUse">
            <stop stopColor="#C084FC" />
            <stop offset="0.55" stopColor="#8B5CF6" />
            <stop offset="1" stopColor="#EC4899" />
          </linearGradient>
        </defs>
        <rect width="38" height="38" rx="11" fill="url(#zx-sb-s)" />
        <rect x="10.5" y="12" width="17" height="11.5" rx="2.3" stroke="#FFF" strokeWidth="1.9" />
        <polygon points="17.8,15.4 21.8,17.75 17.8,20.1" fill="#FFF" />
        <path
          d="M15.5 26.5H22.5M19 23.5V26.5"
          stroke="#FFF"
          strokeWidth="1.9"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  return (
    <svg width="38" height="38" viewBox="0 0 38 38" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="zx-sb-k" x1="2" y1="2" x2="36" y2="36" gradientUnits="userSpaceOnUse">
          <stop stopColor="#60A5FA" />
          <stop offset="1" stopColor="#6366F1" />
        </linearGradient>
      </defs>
      <rect width="38" height="38" rx="11" fill="url(#zx-sb-k)" />
      <path
        d="M11.5 13.8C11.5 13 12.2 12.3 13 12.3H17.2C18.2 12.3 19 13 19 14V25.5C19 24.8 18.2 24.2 17.2 24.2H11.5V13.8Z"
        stroke="#FFF"
        strokeWidth="1.9"
        strokeLinejoin="round"
      />
      <path
        d="M26.5 13.8C26.5 13 25.8 12.3 25 12.3H20.8C19.8 12.3 19 13 19 14V25.5C19 24.8 19.8 24.2 20.8 24.2H26.5V13.8Z"
        stroke="#FFF"
        strokeWidth="1.9"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function PanoramicTemplateArt({ index }: { index: number }) {
  const variant = index % 3;
  if (variant === 0) {
    return (
      <svg
        width="100%"
        height="100%"
        viewBox="0 0 352 116"
        fill="none"
        preserveAspectRatio="xMidYMid slice"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="zx-tpl-bg-1" x1="0" y1="0" x2="1" y2="1">
            <stop stopColor="#1E2552" />
            <stop offset="0.55" stopColor="#172C52" />
            <stop offset="1" stopColor="#12344D" />
          </linearGradient>
          <linearGradient id="zx-pt-r-b" x1="0" y1="0" x2="0" y2="1">
            <stop stopColor="#38BDF8" />
            <stop offset="1" stopColor="#4F46E5" />
          </linearGradient>
          <linearGradient id="zx-pt-r-m" x1="0" y1="0" x2="1" y2="1">
            <stop stopColor="#60A5FA" />
            <stop offset="1" stopColor="#818CF8" />
          </linearGradient>
        </defs>
        <rect width="352" height="116" fill="url(#zx-tpl-bg-1)" />
        <circle cx="290" cy="20" r="64" fill="#38BDF8" fillOpacity="0.16" />
        <circle cx="62" cy="104" r="56" fill="#6366F1" fillOpacity="0.14" />
        <rect
          x="172"
          y="14"
          width="128"
          height="68"
          rx="12"
          fill="rgba(28, 34, 58, 0.72)"
          stroke="#60A5FA"
          strokeOpacity="0.30"
        />
        <circle cx="206" cy="48" r="18" stroke="#60A5FA" strokeOpacity="0.32" strokeWidth="6" />
        <path d="M206 30 A18 18 0 0 1 224 48 L206 48 Z" fill="#38BDF8" />
        <path d="M206 48 L224 48 A18 18 0 0 1 195 62 Z" fill="#818CF8" />
        <rect x="236" y="34" width="46" height="5" rx="2.5" fill="#60A5FA" fillOpacity="0.65" />
        <rect x="236" y="45" width="34" height="4.5" rx="2.25" fill="#818CF8" fillOpacity="0.45" />
        <rect x="236" y="56" width="40" height="4.5" rx="2.25" fill="#38BDF8" fillOpacity="0.38" />
        <rect
          x="38"
          y="22"
          width="148"
          height="80"
          rx="13"
          fill="rgba(22, 27, 46, 0.86)"
          stroke="#38BDF8"
          strokeOpacity="0.40"
        />
        <rect x="54" y="34" width="56" height="5.5" rx="2.75" fill="#38BDF8" fillOpacity="0.78" />
        <rect x="128" y="34" width="40" height="5.5" rx="2.75" fill="#818CF8" fillOpacity="0.35" />
        <rect x="56" y="72" width="16" height="18" rx="4" fill="#60A5FA" fillOpacity="0.50" />
        <rect x="80" y="61" width="16" height="29" rx="4" fill="#60A5FA" fillOpacity="0.78" />
        <rect x="104" y="48" width="16" height="42" rx="4" fill="url(#zx-pt-r-b)" />
        <rect x="128" y="55" width="16" height="35" rx="4" fill="#818CF8" fillOpacity="0.86" />
        <rect x="152" y="44" width="16" height="46" rx="4" fill="#38BDF8" />
        <circle
          cx="282"
          cy="74"
          r="21"
          fill="rgba(22, 27, 46, 0.86)"
          stroke="url(#zx-pt-r-m)"
          strokeWidth="4.2"
        />
        <path
          d="M273 77L279 71L284 74L291 66"
          stroke="#38BDF8"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path d="M297 89L312 103" stroke="#38BDF8" strokeWidth="5.2" strokeLinecap="round" />
      </svg>
    );
  }
  if (variant === 1) {
    return (
      <svg
        width="100%"
        height="100%"
        viewBox="0 0 352 116"
        fill="none"
        preserveAspectRatio="xMidYMid slice"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="zx-tpl-bg-2" x1="0" y1="0" x2="1" y2="1">
            <stop stopColor="#103835" />
            <stop offset="0.55" stopColor="#133148" />
            <stop offset="1" stopColor="#1A254B" />
          </linearGradient>
          <linearGradient id="zx-pt-c-l" x1="0" y1="0" x2="1" y2="1">
            <stop stopColor="#34D399" />
            <stop offset="1" stopColor="#0D9488" />
          </linearGradient>
          <linearGradient id="zx-pt-c-r" x1="0" y1="0" x2="1" y2="1">
            <stop stopColor="#2DD4BF" />
            <stop offset="1" stopColor="#0EA5E9" />
          </linearGradient>
        </defs>
        <rect width="352" height="116" fill="url(#zx-tpl-bg-2)" />
        <circle cx="74" cy="22" r="56" fill="#10B981" fillOpacity="0.16" />
        <circle cx="284" cy="96" r="62" fill="#0EA5E9" fillOpacity="0.15" />
        <g transform="rotate(-2.5 104 60)">
          <rect
            x="42"
            y="18"
            width="118"
            height="82"
            rx="13"
            fill="rgba(22, 27, 46, 0.86)"
            stroke="#34D399"
            strokeOpacity="0.42"
          />
          <rect x="56" y="31" width="54" height="5.5" rx="2.75" fill="url(#zx-pt-c-l)" />
          <rect x="56" y="42" width="38" height="4.5" rx="2.25" fill="#34D399" fillOpacity="0.42" />
          <path
            d="M56 84L80 68L104 74L144 54V90H56V84Z"
            fill="url(#zx-pt-c-l)"
            fillOpacity="0.30"
          />
          <path
            d="M56 84L80 68L104 74L144 54"
            stroke="#34D399"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>
        <g transform="rotate(2.5 248 60)">
          <rect
            x="192"
            y="18"
            width="118"
            height="82"
            rx="13"
            fill="rgba(22, 27, 46, 0.86)"
            stroke="#38BDF8"
            strokeOpacity="0.42"
          />
          <rect x="206" y="31" width="54" height="5.5" rx="2.75" fill="url(#zx-pt-c-r)" />
          <rect
            x="206"
            y="42"
            width="38"
            height="4.5"
            rx="2.25"
            fill="#38BDF8"
            fillOpacity="0.42"
          />
          <path
            d="M206 84L232 64L258 72L294 52V90H206V84Z"
            fill="url(#zx-pt-c-r)"
            fillOpacity="0.30"
          />
          <path
            d="M206 84L232 64L258 72L294 52"
            stroke="#38BDF8"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>
        <circle
          cx="176"
          cy="58"
          r="18"
          fill="url(#zx-pt-c-l)"
          stroke="#FFFFFF"
          strokeOpacity="0.88"
          strokeWidth="2.6"
        />
        <text
          x="176"
          y="62.5"
          textAnchor="middle"
          fill="#FFFFFF"
          fontSize="11.5"
          fontWeight="800"
          fontFamily="sans-serif"
        >
          VS
        </text>
      </svg>
    );
  }
  return (
    <svg
      width="100%"
      height="100%"
      viewBox="0 0 352 116"
      fill="none"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="zx-tpl-bg-3" x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#3B1C47" />
          <stop offset="0.55" stopColor="#291E4E" />
          <stop offset="1" stopColor="#19274A" />
        </linearGradient>
        <linearGradient id="zx-pt-d-m" x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#A855F7" />
          <stop offset="1" stopColor="#EC4899" />
        </linearGradient>
        <linearGradient id="zx-pt-d-s" x1="0" y1="0" x2="1" y2="0">
          <stop stopColor="#8B5CF6" />
          <stop offset="1" stopColor="#6366F1" />
        </linearGradient>
      </defs>
      <rect width="352" height="116" fill="url(#zx-tpl-bg-3)" />
      <circle cx="284" cy="24" r="64" fill="#EC4899" fillOpacity="0.16" />
      <circle cx="76" cy="94" r="56" fill="#8B5CF6" fillOpacity="0.16" />
      <rect
        x="118"
        y="14"
        width="194"
        height="84"
        rx="13"
        fill="rgba(22, 27, 46, 0.86)"
        stroke="#C084FC"
        strokeOpacity="0.42"
      />
      <rect
        x="118"
        y="14"
        width="194"
        height="16"
        rx="13"
        fill="url(#zx-pt-d-s)"
        fillOpacity="0.45"
      />
      <circle cx="131" cy="22" r="2.3" fill="#FFF" fillOpacity="0.82" />
      <circle cx="139" cy="22" r="2.3" fill="#FFF" fillOpacity="0.56" />
      <circle cx="147" cy="22" r="2.3" fill="#FFF" fillOpacity="0.36" />
      <rect
        x="142"
        y="42"
        width="76"
        height="42"
        rx="8.5"
        fill="url(#zx-pt-d-m)"
        fillOpacity="0.24"
        stroke="#C084FC"
        strokeOpacity="0.48"
      />
      <text
        x="180"
        y="68"
        textAnchor="middle"
        fill="#E9D5FF"
        fontSize="16"
        fontWeight="800"
        fontFamily="sans-serif"
      >
        AI
      </text>
      <rect x="230" y="45" width="62" height="5.5" rx="2.75" fill="#C084FC" fillOpacity="0.65" />
      <rect x="230" y="57" width="48" height="4.5" rx="2.25" fill="#C084FC" fillOpacity="0.40" />
      <rect x="230" y="68" width="54" height="4.5" rx="2.25" fill="#F472B6" fillOpacity="0.40" />
      <path d="M196 106H234M215 98V106" stroke="#A855F7" strokeWidth="3.5" strokeLinecap="round" />
      <rect
        x="40"
        y="38"
        width="96"
        height="58"
        rx="11"
        fill="rgba(22, 27, 46, 0.86)"
        stroke="#F472B6"
        strokeOpacity="0.44"
      />
      <rect x="52" y="48" width="72" height="26" rx="6.5" fill="url(#zx-pt-d-m)" />
      <polygon points="84,56.5 94,61 84,65.5" fill="#FFF" />
      <rect x="54" y="81" width="46" height="4.5" rx="2.25" fill="#C084FC" fillOpacity="0.56" />
    </svg>
  );
}

export type MiniPreviewKind =
  | "docReport"
  | "kbSpace"
  | "slideDeck"
  | "codePlan"
  | "htmlDash"
  | "docSpec";

export function resolvePreviewKind(asset: Pick<Asset, "type" | "title" | "path">): MiniPreviewKind {
  const text = `${asset.title} ${asset.path ?? ""}`.toLowerCase();
  if (
    asset.type === "presentation" ||
    text.includes("演示") ||
    text.includes("路演") ||
    text.includes("蓝图")
  ) {
    return "slideDeck";
  }
  if (asset.type === "knowledge" || text.includes("知识") || text.includes("消费金融")) {
    return "kbSpace";
  }
  if (
    asset.type === "html" ||
    asset.type === "dataset" ||
    text.includes("dashboard") ||
    text.includes("看板") ||
    text.includes("复盘")
  ) {
    return "htmlDash";
  }
  if (
    text.includes("规范") ||
    text.includes("plan") ||
    text.includes("架构") ||
    text.includes("agent")
  ) {
    return "codePlan";
  }
  if (text.includes("需求") || text.includes("prd") || text.includes("产品")) {
    return "docSpec";
  }
  return "docReport";
}

const IMAGE_FILE_RE = /\.(?:png|jpe?g|webp|gif|svg|avif)$/i;
const COVERABLE_ASSET_TYPES = new Set(["document", "report", "html", "presentation"]);

function resolveThumbnailUrl(
  asset?: Pick<Asset, "type" | "title" | "path"> & {
    id?: string;
    thumbnailRef?: string | null;
  },
): string | null {
  if (!asset?.id) return null;
  if (asset.thumbnailRef) {
    return `${API_BASE}/assets/${asset.id}/thumbnail?v=${encodeURIComponent(asset.thumbnailRef)}`;
  }
  if (asset.type === "file" && IMAGE_FILE_RE.test(asset.path || asset.title)) {
    return `${API_BASE}/assets/${asset.id}/download`;
  }
  return null;
}

export function AssetMiniPreview({
  asset,
  kind,
}: {
  asset?: Pick<Asset, "type" | "title" | "path"> & {
    id?: string;
    thumbnailRef?: string | null;
    hasContent?: boolean;
  };
  kind?: MiniPreviewKind;
}) {
  const resolved = kind ?? (asset ? resolvePreviewKind(asset) : "docReport");
  const thumbnailUrl = resolveThumbnailUrl(asset);
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);

  useEffect(() => {
    setFailedUrl(null);
  }, [thumbnailUrl]);

  const showImage = Boolean(thumbnailUrl && failedUrl !== thumbnailUrl);
  const isLoaded = Boolean(thumbnailUrl && loadedUrl === thumbnailUrl);

  if (!showImage) {
    if (asset?.hasContent === false) {
      return <AssetEmptyCover assetType={asset.type} />;
    }
    if (!thumbnailUrl && asset?.hasContent === true && COVERABLE_ASSET_TYPES.has(asset.type)) {
      return <AssetLoadingCover label="正在生成封面…" />;
    }
    return <AssetMiniPlaceholder resolved={resolved} />;
  }

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden" }}>
      {!isLoaded ? <AssetLoadingCover /> : null}
      <img
        src={thumbnailUrl ?? undefined}
        alt={asset?.title ? `${asset.title} 封面预览` : "文档封面预览"}
        loading="lazy"
        decoding="async"
        onLoad={() => setLoadedUrl(thumbnailUrl)}
        onError={() => setFailedUrl(thumbnailUrl)}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
          objectPosition: "top center",
          opacity: isLoaded ? 1 : 0,
          transition: "opacity 180ms ease",
          display: "block",
          background: "#0B0E1A",
        }}
      />
    </div>
  );
}

function AssetLoadingCover({ label }: { label?: string }) {
  return (
    <div
      className="zx-cover-skeleton"
      aria-hidden="true"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {label ? (
        <span
          style={{
            position: "relative",
            zIndex: 1,
            fontSize: 11,
            fontWeight: 550,
            color: "rgba(226, 232, 240, 0.56)",
            letterSpacing: "0.02em",
          }}
        >
          {label}
        </span>
      ) : null}
    </div>
  );
}

function AssetEmptyCover({ assetType }: { assetType?: string }) {
  const subtitle =
    assetType === "html"
      ? "暂无 HTML 源码 · 点击编写页面"
      : assetType === "presentation"
        ? "暂无演示内容 · 等待或点击编辑"
        : "暂无正文内容 · 点击进入编写";
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 12,
        boxSizing: "border-box",
        background:
          "radial-gradient(circle at 20% 15%, rgba(168, 85, 247, 0.08), transparent 55%), rgba(12, 16, 32, 0.92)",
      }}
    >
      <div
        style={{
          width: "100%",
          height: "100%",
          borderRadius: 10,
          border: "1px dashed rgba(255, 255, 255, 0.16)",
          background: "rgba(255, 255, 255, 0.02)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 5,
          textAlign: "center",
        }}
      >
        <svg width="26" height="26" viewBox="0 0 26 26" fill="none" aria-hidden="true">
          <rect
            x="4.25"
            y="3.25"
            width="17.5"
            height="19.5"
            rx="3.2"
            stroke="rgba(148, 163, 184, 0.55)"
            strokeWidth="1.4"
            strokeDasharray="3 2.2"
          />
          <path
            d="M8.5 10.5H17.5M8.5 14.5H14"
            stroke="rgba(148, 163, 184, 0.42)"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
        </svg>
        <span
          style={{
            fontSize: 11.5,
            fontWeight: 600,
            color: "rgba(226, 232, 240, 0.72)",
            letterSpacing: "0.01em",
          }}
        >
          暂无内容
        </span>
        <span style={{ fontSize: 10, color: "rgba(148, 163, 184, 0.62)" }}>{subtitle}</span>
      </div>
    </div>
  );
}

function AssetMiniPlaceholder({ resolved }: { resolved: MiniPreviewKind }) {
  const line = "rgba(255, 255, 255, 0.16)";
  const paper = "rgba(24, 29, 49, 0.94)";

  if (resolved === "slideDeck") {
    return (
      <svg
        width="100%"
        height="100%"
        viewBox="0 0 260 118"
        fill="none"
        preserveAspectRatio="xMidYMid slice"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="zx-mp-dk" x1="0" y1="0" x2="1" y2="1">
            <stop stopColor="#7C3AED" />
            <stop offset="0.6" stopColor="#C026D3" />
            <stop offset="1" stopColor="#F43F5E" />
          </linearGradient>
        </defs>
        <rect width="260" height="118" fill="#2B1938" />
        <rect x="30" y="16" width="200" height="86" rx="11" fill="url(#zx-mp-dk)" />
        <circle cx="196" cy="42" r="34" fill="#FFF" fillOpacity="0.12" />
        <rect x="48" y="34" width="38" height="12" rx="6" fill="#FFF" fillOpacity="0.22" />
        <rect x="48" y="54" width="112" height="7" rx="3.5" fill="#FFF" />
        <rect x="48" y="67" width="84" height="5" rx="2.5" fill="#FFF" fillOpacity="0.72" />
        <circle cx="196" cy="59" r="14" fill="#FFF" fillOpacity="0.24" />
        <polygon points="193,54 202,59 193,64" fill="#FFF" />
      </svg>
    );
  }

  if (resolved === "kbSpace") {
    return (
      <svg
        width="100%"
        height="100%"
        viewBox="0 0 260 118"
        fill="none"
        preserveAspectRatio="xMidYMid slice"
        aria-hidden="true"
      >
        <rect width="260" height="118" fill="#14273E" />
        <rect
          x="46"
          y="14"
          width="168"
          height="86"
          rx="10"
          fill="rgba(30, 36, 60, 0.65)"
          stroke="rgba(56,189,248,0.22)"
        />
        <rect
          x="32"
          y="26"
          width="196"
          height="92"
          rx="11"
          fill={paper}
          stroke="rgba(56,189,248,0.32)"
        />
        <circle cx="58" cy="52" r="13" fill="rgba(14,165,233,0.18)" />
        <path d="M53 48h10v9H53z" stroke="#0EA5E9" strokeWidth="1.8" />
        <rect x="80" y="45" width="96" height="6" rx="3" fill="#0EA5E9" />
        <rect x="80" y="56" width="124" height="4.5" rx="2.2" fill={line} />
        <rect x="46" y="76" width="50" height="16" rx="8" fill="rgba(14,165,233,0.14)" />
        <rect x="102" y="76" width="56" height="16" rx="8" fill="rgba(99,102,241,0.14)" />
        <rect x="164" y="76" width="46" height="16" rx="8" fill="rgba(16,185,129,0.14)" />
      </svg>
    );
  }

  if (resolved === "codePlan") {
    return (
      <svg
        width="100%"
        height="100%"
        viewBox="0 0 260 118"
        fill="none"
        preserveAspectRatio="xMidYMid slice"
        aria-hidden="true"
      >
        <rect width="260" height="118" fill="#122C2D" />
        <rect
          x="28"
          y="16"
          width="204"
          height="102"
          rx="10"
          fill={paper}
          stroke="rgba(16,185,129,0.28)"
        />
        <rect x="44" y="34" width="84" height="6" rx="3" fill="#10B981" />
        <rect x="44" y="48" width="158" height="4.5" rx="2.2" fill={line} />
        <rect x="44" y="59" width="136" height="4.5" rx="2.2" fill={line} />
        <rect x="44" y="74" width="96" height="22" rx="6.5" fill="rgba(16,185,129,0.14)" />
        <rect x="148" y="74" width="64" height="22" rx="6.5" fill="rgba(56,189,248,0.14)" />
      </svg>
    );
  }

  if (resolved === "htmlDash") {
    return (
      <svg
        width="100%"
        height="100%"
        viewBox="0 0 260 118"
        fill="none"
        preserveAspectRatio="xMidYMid slice"
        aria-hidden="true"
      >
        <rect width="260" height="118" fill="#14273E" />
        <rect
          x="26"
          y="14"
          width="208"
          height="92"
          rx="11"
          fill={paper}
          stroke="rgba(56,189,248,0.32)"
        />
        <rect x="40" y="28" width="54" height="30" rx="7" fill="rgba(56,189,248,0.14)" />
        <rect x="102" y="28" width="54" height="30" rx="7" fill="rgba(168,85,247,0.14)" />
        <rect x="164" y="28" width="56" height="30" rx="7" fill="rgba(52,211,153,0.14)" />
        <path
          d="M42 88L78 72L116 80L162 64L216 70"
          stroke="#38BDF8"
          strokeWidth="2.6"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  if (resolved === "docSpec") {
    return (
      <svg
        width="100%"
        height="100%"
        viewBox="0 0 260 118"
        fill="none"
        preserveAspectRatio="xMidYMid slice"
        aria-hidden="true"
      >
        <rect width="260" height="118" fill="#2A221E" />
        <rect
          x="28"
          y="16"
          width="204"
          height="102"
          rx="10"
          fill={paper}
          stroke="rgba(245,158,11,0.28)"
        />
        <rect x="44" y="30" width="84" height="6" rx="3" fill="#F59E0B" />
        <rect x="44" y="44" width="166" height="4.5" rx="2.2" fill={line} />
        <rect x="44" y="55" width="146" height="4.5" rx="2.2" fill={line} />
        <rect x="44" y="70" width="78" height="28" rx="7" fill="rgba(245,158,11,0.13)" />
        <rect x="130" y="70" width="82" height="28" rx="7" fill="rgba(139,92,246,0.12)" />
      </svg>
    );
  }

  return (
    <svg
      width="100%"
      height="100%"
      viewBox="0 0 260 118"
      fill="none"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      <rect width="260" height="118" fill="#191F3D" />
      <rect
        x="28"
        y="16"
        width="204"
        height="102"
        rx="10"
        fill={paper}
        stroke="rgba(99,102,241,0.25)"
      />
      <rect x="44" y="30" width="92" height="6.5" rx="3.2" fill="#6366F1" />
      <rect x="44" y="44" width="164" height="4.5" rx="2.2" fill={line} />
      <rect x="44" y="54" width="142" height="4.5" rx="2.2" fill={line} />
      <rect x="44" y="68" width="168" height="36" rx="7" fill="rgba(99,102,241,0.10)" />
      <rect x="58" y="86" width="14" height="12" rx="2.5" fill="#818CF8" />
      <rect x="80" y="80" width="14" height="18" rx="2.5" fill="#6366F1" />
      <rect x="102" y="74" width="14" height="24" rx="2.5" fill="#38BDF8" />
      <rect x="132" y="79" width="64" height="4.5" rx="2.2" fill={line} />
      <rect x="132" y="89" width="46" height="4.5" rx="2.2" fill={line} />
    </svg>
  );
}
