import { createBrowserRouter } from "react-router-dom";
import { AssetDetailPage } from "../features/assets/asset-detail.js";
import { AssetsPage } from "../features/assets/assets.js";
import { BillingPage } from "../features/billing/billing.js";
import { DatasetDetailPage, DatasetsPage } from "../features/datasets/datasets.js";
import { DocumentEditorPage } from "../features/documents/editor.js";
import { HtmlEditorPage } from "../features/documents/html-editor.js";
import { HomePage } from "../features/home/home.js";
import {
  KnowledgeDetailPage,
  KnowledgeNewPage,
  KnowledgePage,
} from "../features/knowledge/knowledge.js";
import { NotFoundPage } from "../features/misc/not-found.js";
import { NotificationsPage } from "../features/notifications/notifications.js";
import {
  PresentationEditorPage,
  PresentationNewPage,
  PresentationPlayerPage,
  PresentationsPage,
} from "../features/presentations/presentations.js";
import { ResearchNewPage, ResearchPage } from "../features/research/research.js";
import { SettingsPage } from "../features/settings/settings.js";
import { TaskDetailPage, TasksPage } from "../features/tasks/tasks.js";
import { TemplatesPage } from "../features/templates/templates.js";
import { Shell } from "../shell/layout.js";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <Shell />,
    children: [
      { index: true, element: <HomePage /> },
      { path: "assets", element: <AssetsPage /> },
      { path: "assets/:id", element: <AssetDetailPage /> },
      { path: "documents/new", element: <DocumentEditorPage /> },
      { path: "documents/:id", element: <DocumentEditorPage /> },
      { path: "html/new", element: <HtmlEditorPage /> },
      { path: "html/:id", element: <HtmlEditorPage /> },
      { path: "knowledge", element: <KnowledgePage /> },
      { path: "knowledge/new", element: <KnowledgeNewPage /> },
      { path: "knowledge/:id", element: <KnowledgeDetailPage /> },
      { path: "research", element: <ResearchPage /> },
      { path: "research/new", element: <ResearchNewPage /> },
      { path: "tasks", element: <TasksPage /> },
      { path: "tasks/:id", element: <TaskDetailPage /> },
      { path: "datasets", element: <DatasetsPage /> },
      { path: "datasets/:id", element: <DatasetDetailPage /> },
      { path: "presentations", element: <PresentationsPage /> },
      { path: "presentations/new", element: <PresentationNewPage /> },
      { path: "presentations/:id", element: <PresentationEditorPage /> },
      { path: "presentations/:id/play", element: <PresentationPlayerPage /> },
      { path: "templates", element: <TemplatesPage /> },
      { path: "notifications", element: <NotificationsPage /> },
      { path: "billing", element: <BillingPage /> },
      { path: "settings", element: <SettingsPage /> },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
]);
