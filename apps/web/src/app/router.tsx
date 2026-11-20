import { Loading } from "@shiguang/ui";
import { type ComponentType, lazy, Suspense } from "react";
import { createBrowserRouter } from "react-router-dom";
import { Shell } from "../shell/layout.js";

function lazyRoute(loader: () => Promise<{ default: ComponentType }>) {
  const Component = lazy(loader);
  return (
    <Suspense fallback={<Loading loading minHeight={360} />}>
      <Component />
    </Suspense>
  );
}

export const router = createBrowserRouter([
  {
    path: "/render/thumbnail",
    element: lazyRoute(() =>
      import("../features/documents/thumbnail-render.js").then((m) => ({
        default: m.ThumbnailRenderPage,
      })),
    ),
  },
  {
    path: "/",
    element: <Shell />,
    children: [
      {
        index: true,
        element: lazyRoute(() =>
          import("../features/home/home.js").then((m) => ({ default: m.HomePage })),
        ),
      },
      {
        path: "assets",
        element: lazyRoute(() =>
          import("../features/assets/assets.js").then((m) => ({ default: m.AssetsPage })),
        ),
      },
      {
        path: "assets/:id",
        element: lazyRoute(() =>
          import("../features/assets/asset-detail.js").then((m) => ({
            default: m.AssetDetailPage,
          })),
        ),
      },
      {
        path: "assets/:id/edit",
        element: lazyRoute(() =>
          import("../features/assets/asset-edit.js").then((m) => ({ default: m.AssetEditPage })),
        ),
      },
      {
        path: "documents",
        element: lazyRoute(() =>
          import("../features/documents/documents.js").then((m) => ({ default: m.DocumentsPage })),
        ),
      },
      {
        path: "documents/new",
        element: lazyRoute(() =>
          import("../features/documents/editor.js").then((m) => ({
            default: m.DocumentEditorPage,
          })),
        ),
      },
      {
        path: "documents/:id/preview",
        element: lazyRoute(() =>
          import("../features/documents/preview.js").then((m) => ({
            default: m.DocumentPreviewPage,
          })),
        ),
      },
      {
        path: "documents/:id",
        element: lazyRoute(() =>
          import("../features/documents/editor.js").then((m) => ({
            default: m.DocumentEditorPage,
          })),
        ),
      },
      {
        path: "html/new",
        element: lazyRoute(() =>
          import("../features/documents/html-editor.js").then((m) => ({
            default: m.HtmlEditorPage,
          })),
        ),
      },
      {
        path: "html/:id",
        element: lazyRoute(() =>
          import("../features/documents/html-editor.js").then((m) => ({
            default: m.HtmlEditorPage,
          })),
        ),
      },
      {
        path: "knowledge",
        element: lazyRoute(() =>
          import("../features/knowledge/knowledge.js").then((m) => ({ default: m.KnowledgePage })),
        ),
      },
      {
        path: "knowledge/new",
        element: lazyRoute(() =>
          import("../features/knowledge/knowledge.js").then((m) => ({
            default: m.KnowledgeNewPage,
          })),
        ),
      },
      {
        path: "knowledge/:id",
        element: lazyRoute(() =>
          import("../features/knowledge/knowledge.js").then((m) => ({
            default: m.KnowledgeDetailPage,
          })),
        ),
      },
      {
        path: "research",
        element: lazyRoute(() =>
          import("../features/research/research.js").then((m) => ({ default: m.ResearchPage })),
        ),
      },
      {
        path: "research/new",
        element: lazyRoute(() =>
          import("../features/research/research.js").then((m) => ({ default: m.ResearchNewPage })),
        ),
      },
      {
        path: "tasks",
        element: lazyRoute(() =>
          import("../features/tasks/tasks.js").then((m) => ({ default: m.TasksPage })),
        ),
      },
      {
        path: "tasks/new",
        element: lazyRoute(() =>
          import("../features/tasks/tasks.js").then((m) => ({ default: m.TaskNewPage })),
        ),
      },
      {
        path: "tasks/:id",
        element: lazyRoute(() =>
          import("../features/tasks/tasks.js").then((m) => ({ default: m.TaskDetailPage })),
        ),
      },
      {
        path: "datasets",
        element: lazyRoute(() =>
          import("../features/datasets/datasets.js").then((m) => ({ default: m.DatasetsPage })),
        ),
      },
      {
        path: "datasets/:id",
        element: lazyRoute(() =>
          import("../features/datasets/datasets.js").then((m) => ({
            default: m.DatasetDetailPage,
          })),
        ),
      },
      {
        path: "presentations",
        element: lazyRoute(() =>
          import("../features/presentations/presentations.js").then((m) => ({
            default: m.PresentationsPage,
          })),
        ),
      },
      {
        path: "presentations/new",
        element: lazyRoute(() =>
          import("../features/presentations/presentation-new.js").then((m) => ({
            default: m.PresentationNewPage,
          })),
        ),
      },
      {
        path: "presentations/generate/:taskId",
        element: lazyRoute(() =>
          import("../features/presentations/presentation-new.js").then((m) => ({
            default: m.PresentationNewPage,
          })),
        ),
      },
      {
        path: "presentations/:id",
        element: lazyRoute(() =>
          import("../features/presentations/presentations.js").then((m) => ({
            default: m.PresentationEditorPage,
          })),
        ),
      },
      {
        path: "presentations/:id/play",
        element: lazyRoute(() =>
          import("../features/presentations/presentations.js").then((m) => ({
            default: m.PresentationPlayerPage,
          })),
        ),
      },
      {
        path: "presentations/snapshot/:taskId",
        element: lazyRoute(() =>
          import("../features/presentations/presentations.js").then((m) => ({
            default: m.PresentationSnapshotPlayerPage,
          })),
        ),
      },
      {
        path: "templates",
        element: lazyRoute(() =>
          import("../features/templates/templates.js").then((m) => ({ default: m.TemplatesPage })),
        ),
      },
      {
        path: "notifications",
        element: lazyRoute(() =>
          import("../features/notifications/notifications.js").then((m) => ({
            default: m.NotificationsPage,
          })),
        ),
      },
      {
        path: "billing",
        element: lazyRoute(() =>
          import("../features/billing/billing.js").then((m) => ({ default: m.BillingPage })),
        ),
      },
      {
        path: "profile",
        element: lazyRoute(() =>
          import("../features/profile/profile.js").then((m) => ({ default: m.ProfilePage })),
        ),
      },
      {
        path: "publishes",
        element: lazyRoute(() =>
          import("../features/publishing/publishes.js").then((m) => ({ default: m.PublishesPage })),
        ),
      },
      {
        path: "assistant",
        element: lazyRoute(() =>
          import("../features/assistant/assistant.js").then((m) => ({ default: m.AssistantPage })),
        ),
      },
      {
        path: "settings",
        element: lazyRoute(() =>
          import("../features/settings/settings.js").then((m) => ({ default: m.SettingsPage })),
        ),
      },
      {
        path: "*",
        element: lazyRoute(() =>
          import("../features/misc/not-found.js").then((m) => ({ default: m.NotFoundPage })),
        ),
      },
    ],
  },
]);
