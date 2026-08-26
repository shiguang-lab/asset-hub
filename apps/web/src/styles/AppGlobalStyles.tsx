import { createStyles } from "antd-style";
import type { PropsWithChildren } from "react";
import { useAssetsStyles } from "./assets.js";
import { useAssistantStyles } from "./assistant.js";
import { useBreadcrumbStyles } from "./breadcrumb.js";
import { useDocumentCardsStyles } from "./document-cards.js";
import { useDocumentTreeStyles } from "./document-tree.js";
import { useDocumentsStyles } from "./documents.js";
import { useHomeStyles } from "./home.js";
import { useKnowledgeStyles } from "./knowledge.js";
import { usePresentationsStyles } from "./presentations.js";
import { useSearchStyles } from "./search.js";
import { useShellStyles } from "./shell.js";
import { useTasksStyles } from "./tasks.js";
import { useThemeLockStyles } from "./theme-lock.js";

const useBoundaryStyles = createStyles(() => ({
  boundary: {
    display: "contents",
  },
}));

/** Scoped application style boundary. `display: contents` preserves layout. */
export function AppStylesBoundary({ children }: PropsWithChildren) {
  const { styles: boundary } = useBoundaryStyles();
  const { styles: documentTree } = useDocumentTreeStyles();
  const { styles: shell } = useShellStyles();
  const { styles: home } = useHomeStyles();
  const { styles: assets } = useAssetsStyles();
  const { styles: documents } = useDocumentsStyles();
  const { styles: assistant } = useAssistantStyles();
  const { styles: tasks } = useTasksStyles();
  const { styles: knowledge } = useKnowledgeStyles();
  const { styles: themeLock } = useThemeLockStyles();
  const { styles: documentCards } = useDocumentCardsStyles();
  const { styles: breadcrumb } = useBreadcrumbStyles();
  const { styles: presentations } = usePresentationsStyles();
  const { styles: search } = useSearchStyles();
  const root = [
    shell.root,
    themeLock.root,
    documentTree.root,
    home.root,
    assets.root,
    documents.root,
    assistant.root,
    tasks.root,
    knowledge.root,
    documentCards.root,
    breadcrumb.root,
    presentations.root,
    search.root,
  ].join(" ");

  return <div className={`${root} ${boundary.boundary}`}>{children}</div>;
}
