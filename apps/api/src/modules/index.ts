import type { FastifyInstance } from "fastify";
import { registerAssets } from "./assets.js";
import { registerBilling } from "./billing.js";
import { registerComments } from "./comments.js";
import { registerDatasets } from "./datasets.js";
import { registerDocumentFolders } from "./document-folders.js";
import { registerHome } from "./home.js";
import { registerIntegrations } from "./integrations.js";
import { registerKnowledge } from "./knowledge.js";
import { registerNotifications } from "./notifications.js";
import { registerPresentations } from "./presentations.js";
import { registerPublishing } from "./publishing.js";
import { registerTasks } from "./tasks.js";
import { registerTemplates } from "./templates.js";
import { registerWorkspace } from "./workspace.js";

export function registerModules(app: FastifyInstance): void {
  registerHome(app);
  registerAssets(app);
  registerDocumentFolders(app);
  registerKnowledge(app);
  registerTasks(app);
  registerDatasets(app);
  registerPresentations(app);
  registerPublishing(app);
  registerComments(app);
  registerNotifications(app);
  registerBilling(app);
  registerIntegrations(app);
  registerTemplates(app);
  registerWorkspace(app);
}
