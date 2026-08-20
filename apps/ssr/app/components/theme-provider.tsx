"use client";

import { App, ConfigProvider, theme } from "antd";
import { StyleProvider } from "antd-style";
import type { PropsWithChildren } from "react";

export function ThemeProvider({ children }: PropsWithChildren) {
  return (
    <StyleProvider hashPriority="low">
      <ConfigProvider
        theme={{
          algorithm: theme.darkAlgorithm,
          token: {
            colorPrimary: "#8b72ff",
            colorBgBase: "#0f1218",
            colorBgContainer: "#171b24",
            colorText: "#f1f3f7",
            colorTextSecondary: "#c1c8d4",
            colorBorder: "#2b3442",
            borderRadius: 7,
          },
          components: {
            Button: { primaryShadow: "none", defaultShadow: "none" },
            Menu: { itemBorderRadius: 6 },
          },
        }}
      >
        <App>{children}</App>
      </ConfigProvider>
    </StyleProvider>
  );
}
