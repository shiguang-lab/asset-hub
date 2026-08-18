import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import { router } from "./app/router.js";
import { requireAuthSession } from "./auth/session.js";
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

void requireAuthSession().then((session) => {
  if (session) renderApp();
});
