import { createBrowserRouter } from "react-router-dom";
import { AssetDetailPage } from "../features/assets/asset-detail.js";
import { AssetEditPage } from "../features/assets/asset-edit.js";
import { AssetsPage } from "../features/assets/assets.js";
import { AssistantPage } from "../features/assistant/assistant.js";
import { BillingPage } from "../features/billing/billing.js";
import { DatasetDetailPage, DatasetsPage } from "../features/datasets/datasets.js";
import { DocumentsPage } from "../features/documents/documents.js";
import { DocumentEditorPage } from "../features/documents/editor.js";
import { HtmlEditorPage } from "../features/documents/html-editor.js";
import { DocumentPreviewPage } from "../features/documents/preview.js";
import { HomePage } from "../features/home/home.js";
import {
  KnowledgeDetailPage,
  KnowledgeNewPage,
  KnowledgePage,
} from "../features/knowledge/knowledge.js";
import { NotFoundPage } from "../features/misc/not-found.js";
import { NotificationsPage } from "../features/notifications/notifications.js";
import { PresentationNewPage } from "../features/presentations/presentation-new.js";
import {
  PresentationEditorPage,
  PresentationPlayerPage,
  PresentationsPage,
} from "../features/presentations/presentations.js";
import { ProfilePage } from "../features/profile/profile.js";
import { PublishesPage } from "../features/publishing/publishes.js";
import { ResearchNewPage, ResearchPage } from "../features/research/research.js";
import { SettingsPage } from "../features/settings/settings.js";
import { TaskDetailPage, TaskNewPage, TasksPage } from "../features/tasks/tasks.js";
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
      { path: "assets/:id/edit", element: <AssetEditPage /> },
      { path: "documents", element: <DocumentsPage /> },
      { path: "documents/new", element: <DocumentEditorPage /> },
      { path: "documents/:id/preview", element: <DocumentPreviewPage /> },
      { path: "documents/:id", element: <DocumentEditorPage /> },
      { path: "html/new", element: <HtmlEditorPage /> },
      { path: "html/:id", element: <HtmlEditorPage /> },
      { path: "knowledge", element: <KnowledgePage /> },
      { path: "knowledge/new", element: <KnowledgeNewPage /> },
      { path: "knowledge/:id", element: <KnowledgeDetailPage /> },
      { path: "research", element: <ResearchPage /> },
      { path: "research/new", element: <ResearchNewPage /> },
      { path: "tasks", element: <TasksPage /> },
      { path: "tasks/new", element: <TaskNewPage /> },
      { path: "tasks/:id", element: <TaskDetailPage /> },
      { path: "datasets", element: <DatasetsPage /> },
      { path: "datasets/:id", element: <DatasetDetailPage /> },
      { path: "presentations", element: <PresentationsPage /> },
      { path: "presentations/new", element: <PresentationNewPage /> },
      { path: "presentations/generate/:taskId", element: <PresentationNewPage /> },
      { path: "presentations/:id", element: <PresentationEditorPage /> },
      { path: "presentations/:id/play", element: <PresentationPlayerPage /> },
      { path: "templates", element: <TemplatesPage /> },
      { path: "notifications", element: <NotificationsPage /> },
      { path: "billing", element: <BillingPage /> },
      { path: "profile", element: <ProfilePage /> },
      { path: "publishes", element: <PublishesPage /> },
      { path: "assistant", element: <AssistantPage /> },
      { path: "settings", element: <SettingsPage /> },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
]);
