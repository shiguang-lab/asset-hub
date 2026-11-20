import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv, type PluginOption } from "vite";
import { createLocalAuthMiddleware, LocalAuthBroker } from "./dev/local-auth-broker.js";

function resolveVendorChunk(id: string): string | undefined {
  if (!id.includes("node_modules")) return undefined;
  if (
    id.includes("/react/") ||
    id.includes("/react-dom/") ||
    id.includes("/react-router") ||
    id.includes("/scheduler/")
  ) {
    return "vendor-react";
  }
  if (id.includes("/@tanstack/")) return "vendor-query";
  if (id.includes("/lucide-react/")) return "vendor-icons";
  if (
    id.includes("/antd/") ||
    id.includes("/antd-style/") ||
    id.includes("/@ant-design/") ||
    id.includes("/@rc-component/") ||
    id.includes("/rc-")
  ) {
    return "vendor-antd";
  }
  return undefined;
}

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
        // broker 初始化异步进行，不阻塞中间件注册；失败时中间件会用 demo 用户 fallback
        broker.identity().catch(() => {});
        server.middlewares.use(createLocalAuthMiddleware(broker, loginName));
      },
    });
  }

  return {
    plugins,
    build: {
      rolldownOptions: {
        output: {
          manualChunks: resolveVendorChunk,
        },
      },
    },
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
