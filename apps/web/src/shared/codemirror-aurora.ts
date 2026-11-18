import { defaultHighlightStyle, HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { EditorView } from "@codemirror/view";

const AURORA_COLOR_MAP: Record<string, string> = {
  "#00f": "#C084FC",
  "#219": "#A78BFA",
  "#164": "#34D399",
  "#a11": "#7DD3FC",
  "#e40": "#FB7185",
  "#085": "#38BDF8",
  "#256": "#38BDF8",
  "#00c": "#818CF8",
  "#940": "#94A3B8",
  "#404740": "#94A3B8",
  "#7a757a": "#94A3B8",
  "#f00": "#FDA4AF",
};

const auroraHighlightStyle = HighlightStyle.define(
  defaultHighlightStyle.specs.map((spec) => ({
    ...spec,
    ...(spec.color ? { color: AURORA_COLOR_MAP[spec.color.toLowerCase()] ?? "#E2E8F0" } : {}),
  })),
);

const auroraEditorTheme = EditorView.theme(
  {
    "&": {
      color: "#CBD5E1",
      backgroundColor: "transparent",
    },
    ".cm-content": {
      caretColor: "#C084FC",
      fontFamily: 'var(--sg-mono, "SF Mono", "JetBrains Mono", ui-monospace, monospace)',
      fontSize: "13px",
      lineHeight: "1.8",
      padding: "18px 12px",
    },
    "&.cm-focused .cm-cursor, .cm-dropCursor": {
      borderLeftColor: "#C084FC",
    },
    "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": {
      backgroundColor: "rgba(168, 85, 247, 0.28) !important",
    },
    ".cm-activeLine": {
      backgroundColor: "rgba(168, 85, 247, 0.08)",
    },
    ".cm-activeLineGutter": {
      backgroundColor: "rgba(168, 85, 247, 0.14)",
      color: "#E9D5FF",
    },
    ".cm-gutters": {
      backgroundColor: "rgba(255, 255, 255, 0.02)",
      color: "#64748B",
      borderRight: "1px solid rgba(255, 255, 255, 0.08)",
    },
    ".cm-lineNumbers .cm-gutterElement": {
      padding: "0 12px 0 14px",
      fontSize: "12px",
    },
  },
  { dark: true },
);

/** Shared dark Aurora Glass extensions for CodeMirror editors. */
export const auroraEditorExtensions = [
  auroraEditorTheme,
  syntaxHighlighting(auroraHighlightStyle, { fallback: true }),
];
