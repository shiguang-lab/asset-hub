import { AssetsGlobalStyles } from "./assets.js";
import { AssistantGlobalStyles } from "./assistant.js";
import { BreadcrumbGlobalStyles } from "./breadcrumb.js";
import { DocumentCardsGlobalStyles } from "./document-cards.js";
import { DocumentTreeGlobalStyles } from "./document-tree.js";
import { DocumentsGlobalStyles } from "./documents.js";
import { HomeGlobalStyles } from "./home.js";
import { KnowledgeGlobalStyles } from "./knowledge.js";
import { PresentationsGlobalStyles } from "./presentations.js";
import { SearchGlobalStyles } from "./search.js";
import { ShellGlobalStyles } from "./shell.js";
import { TasksGlobalStyles } from "./tasks.js";
import { ThemeLockGlobalStyles } from "./theme-lock.js";

export function AppGlobalStyles() {
  return (
    <>
      <DocumentTreeGlobalStyles />
      <ShellGlobalStyles />
      <HomeGlobalStyles />
      <AssetsGlobalStyles />
      <DocumentsGlobalStyles />
      <AssistantGlobalStyles />
      <TasksGlobalStyles />
      <KnowledgeGlobalStyles />
      <ThemeLockGlobalStyles />
      <DocumentCardsGlobalStyles />
      <BreadcrumbGlobalStyles />
      <PresentationsGlobalStyles />
      <SearchGlobalStyles />
    </>
  );
}
