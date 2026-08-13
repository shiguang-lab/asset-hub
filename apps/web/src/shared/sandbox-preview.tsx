import { useMemo } from "react";

/**
 * 统一 HTML 沙箱预览：srcdoc + sandbox（不含 allow-same-origin），
 * 渲染在独立 opaque origin，无法访问主站 Cookie / Storage / DOM。
 */
export function SandboxHtmlPreview({
  source,
  minHeight = 480,
}: {
  source: string;
  minHeight?: number;
}) {
  const srcDoc = useMemo(() => source, [source]);
  return (
    <iframe
      title="HTML 沙箱预览"
      sandbox="allow-scripts allow-forms allow-popups allow-modals"
      srcDoc={srcDoc}
      style={{
        width: "100%",
        minHeight,
        border: "1px solid var(--sg-border)",
        borderRadius: 8,
        background: "#fff",
      }}
    />
  );
}
