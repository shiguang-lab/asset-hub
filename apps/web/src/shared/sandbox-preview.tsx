import { createStyles } from "antd-style";
import { useMemo } from "react";

const useSandboxPreviewStyles = createStyles((_token, props: { minHeight: number }) => ({
  frame: {
    width: "100%",
    minHeight: props.minHeight,
    border: "1px solid var(--sg-border)",
    borderRadius: 8,
    background: "#fff",
  },
}));

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
  const { styles } = useSandboxPreviewStyles({ minHeight });
  return (
    <iframe
      title="HTML 沙箱预览"
      sandbox="allow-scripts allow-forms allow-popups allow-modals"
      srcDoc={srcDoc}
      className={styles.frame}
    />
  );
}
