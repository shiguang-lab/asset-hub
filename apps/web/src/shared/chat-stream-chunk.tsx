import { MarkdownSurfaceStyles } from "@shiguang/ui";
import { XMarkdown } from "@shiguang2/components";
import { createStyles } from "antd-style";

const useStyles = createStyles(({ css }) => ({
  root: css`
    display: grid;
    gap: 14px;
    color: var(--sg-fg-2);
    font-size: 12px;
    line-height: 1.7;
  `,
  reasoning: css`
    position: relative;
    padding: 2px 0 2px 15px;
    color: var(--sg-muted);
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    word-break: break-word;

    &::before {
      position: absolute;
      top: 2px;
      bottom: 2px;
      left: 3px;
      width: 2px;
      border-radius: 2px;
      background: rgba(169, 139, 255, 0.46);
      content: "";
    }
  `,
  reasoningLabel: css`
    display: block;
    margin-bottom: 6px;
    color: #a98bff;
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.04em;
  `,
  reasoningCursor: css`
    display: inline-block;
    width: 2px;
    height: 1em;
    margin-left: 3px;
    vertical-align: -0.12em;
    border-radius: 1px;
    background: #a98bff;
    animation: sg-chat-stream-cursor 0.8s steps(2, jump-none) infinite;

    @keyframes sg-chat-stream-cursor {
      50% {
        opacity: 0;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      animation: none;
    }
  `,
  content: css`
    min-width: 0;
    color: var(--sg-fg-2);
    font-size: 12px;
    line-height: 1.7;
    overflow-wrap: anywhere;
    word-break: break-word;

    p {
      margin: 0 0 10px;
    }

    p:last-child {
      margin-bottom: 0;
    }
  `,
}));

/** OPC Chat 同款内容渲染：思考过程单独展示，正文使用共享 XMarkdown 流式组件。 */
export function ChatStreamChunk({
  reasoningContent,
  textContent,
  streaming,
}: {
  reasoningContent: string;
  textContent: string;
  streaming: boolean;
}) {
  const { styles } = useStyles();

  return (
    <div className={styles.root}>
      <MarkdownSurfaceStyles />
      {reasoningContent && (
        <div className={styles.reasoning}>
          <span className={styles.reasoningLabel}>深度推理</span>
          {reasoningContent}
          {streaming && !textContent && <i className={styles.reasoningCursor} aria-hidden="true" />}
        </div>
      )}
      {textContent && (
        <XMarkdown
          rootClassName={["sg-markdown-content", styles.content].join(" ")}
          hasNextChunk={streaming}
        >
          {textContent}
        </XMarkdown>
      )}
    </div>
  );
}
