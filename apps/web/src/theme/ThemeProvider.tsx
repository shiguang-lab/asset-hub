import { UiGlobalStyles } from "@shiguang/ui";
import { App, ConfigProvider } from "antd";
import { StyleProvider } from "antd-style";
import type { PropsWithChildren } from "react";
import { AppGlobalStyles } from "../styles/AppGlobalStyles.js";
import { resolveThemeConfig } from "./tokens";
import { useThemeMode } from "./useThemeMode";

export const ThemeProvider = ({ children }: PropsWithChildren) => {
  const mode = useThemeMode((state) => state.mode);

  return (
    <StyleProvider>
      <ConfigProvider theme={resolveThemeConfig(mode)}>
        <App>
          <UiGlobalStyles />
          <AppGlobalStyles />
          {children}
        </App>
      </ConfigProvider>
    </StyleProvider>
  );
};
