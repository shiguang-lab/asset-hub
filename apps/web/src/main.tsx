import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createStyles } from "antd-style";
import React from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import { router } from "./app/router.js";
import { BrokerUnavailableError, requireAuthSession } from "./auth/session.js";
import { ThemeProvider } from "./theme/ThemeProvider.js";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 15_000 },
  },
});

document.documentElement.dataset.theme = "dark";
document.documentElement.style.colorScheme = "dark";

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root element");

const useBrokerErrorStyles = createStyles(({ token }) => ({
  root: {
    position: "fixed",
    inset: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#0b0e16",
    color: "#e6e8ef",
    fontFamily: "system-ui, sans-serif",
    padding: 24,
  },
  card: {
    maxWidth: 560,
    background: "#141925",
    border: "1px solid #2a3142",
    borderRadius: 12,
    padding: 28,
    lineHeight: 1.7,
  },
  title: {
    margin: "0 0 12px",
    fontSize: 18,
    color: token.colorError,
  },
  message: {
    margin: "0 0 12px",
    color: "#aab2c5",
    fontSize: 14,
  },
  finalMessage: {
    margin: "0 0 16px",
    color: "#aab2c5",
    fontSize: 14,
  },
  retry: {
    background: "#6d5dfc",
    border: "none",
    color: "#fff",
    padding: "10px 18px",
    borderRadius: 8,
    fontSize: 14,
    cursor: "pointer",
  },
}));

function BrokerErrorPage({ onRetry }: { onRetry: () => void }) {
  const { styles } = useBrokerErrorStyles();
  return (
    <div className={styles.root}>
      <div className={styles.card}>
        <h2 className={styles.title}>本地自动登录失败</h2>
        <p className={styles.message}>
          本地开发身份 Broker 无法从 <code>shiguanglab.com</code> 换取身份令牌。最常见原因是
          <b> Cloudflare </b>拦截了 <code>/api/auth/local-broker</code> 的登录请求（返回 405）。
        </p>
        <p className={styles.finalMessage}>
          排查：① 在 Cloudflare 给 <code>/api/auth/local-broker*</code> 加 WAF 放行规则；② 确认
          <code>.env.local</code> 的账号密码正确；③ 确认线上 auth-service 已启用 broker。
        </p>
        <button type="button" className={styles.retry} onClick={onRetry}>
          重试
        </button>
      </div>
    </div>
  );
}

const renderApp = () => {
  createRoot(root).render(
    <React.StrictMode>
      <ThemeProvider>
        <QueryClientProvider client={queryClient}>
          <RouterProvider router={router} />
        </QueryClientProvider>
      </ThemeProvider>
    </React.StrictMode>,
  );
};

/**
 * 本地身份 Broker 不可用时的兜底页：明确告知根因（通常是 Cloudflare 拦截了本地
 * broker 向 shiguanglab.com 的登录请求），并提供重试，而不是陷入 /login ⇄ / 重定向循环。
 */
function renderBrokerError() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const brokerRoot = createRoot(container);
  brokerRoot.render(
    <BrokerErrorPage
      onRetry={() => {
        brokerRoot.unmount();
        container.remove();
        void bootstrap();
      }}
    />,
  );
}

async function bootstrap() {
  try {
    const session = await requireAuthSession();
    if (session) renderApp();
  } catch (error) {
    if (error instanceof BrokerUnavailableError) {
      renderBrokerError();
      return;
    }
    // 其它未登录场景由 session 内部处理跳转；这里兜底避免白屏。
    console.error("auth bootstrap failed", error);
  }
}

void bootstrap();
