import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv, type PluginOption } from "vite";
import { createLocalAuthMiddleware, LocalAuthBroker } from "./dev/local-auth-broker.js";

export default defineConfig(({ command, mode }) => {
  const repoRoot = resolve(import.meta.dirname, "../..");
  const env = { ...loadEnv(mode, repoRoot, ""), ...process.env };
  const authTarget = env.ASSET_HUB_AUTH_TARGET ?? "https://shiguanglab.com";
  const apiTarget = env.ASSET_HUB_LOCAL_API_TARGET ?? "http://localhost:3001";
  const brokerRequested = env.ASSET_HUB_LOCAL_BROKER_ENABLED === "true";
  const brokerEnabled = command === "serve" && brokerRequested;
  const testMode = mode === "test" || process.env.VITEST === "true";
  const loginName = env.ASSET_HUB_LOCAL_AUTH_USERNAME?.trim();
  const password = env.ASSET_HUB_LOCAL_AUTH_PASSWORD;
  if (brokerEnabled && (!loginName || !password)) {
    throw new Error(
      "ASSET_HUB_LOCAL_AUTH_USERNAME and ASSET_HUB_LOCAL_AUTH_PASSWORD are required in broker mode",
    );
  }

  const unifiedLoginProxy = () => ({
    target: authTarget,
    changeOrigin: true,
    cookieDomainRewrite: "",
    headers: { Origin: authTarget },
  });

  const plugins: PluginOption[] = [react()];
  if (brokerEnabled && !testMode && loginName && password) {
    const broker = new LocalAuthBroker({ authTarget, loginName, password });
    plugins.push({
      name: "asset-hub-local-auth-broker",
      async configureServer(server) {
        await broker.identity();
        server.middlewares.use(createLocalAuthMiddleware(broker));
      },
    });
  }

  return {
    plugins,
    server: {
      host: brokerEnabled ? "127.0.0.1" : undefined,
      proxy: {
        "/login": unifiedLoginProxy(),
        "/register": unifiedLoginProxy(),
        "/auth": unifiedLoginProxy(),
        "/api/auth": brokerEnabled ? apiTarget : unifiedLoginProxy(),
        "/api/account": brokerEnabled ? apiTarget : unifiedLoginProxy(),
        "^/assets/.*\\.(?:css|js|mjs|woff2?|ttf|png|jpe?g|svg|ico)$": unifiedLoginProxy(),
        "/api": apiTarget,
        "/mcp": apiTarget,
      },
    },
  };
});
