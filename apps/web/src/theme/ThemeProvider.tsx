import { UiGlobalStyles } from "@shiguang/ui";
import { App, ConfigProvider } from "antd";
import zhCN from "antd/locale/zh_CN.js";
import { StyleProvider } from "antd-style";
import type { PropsWithChildren } from "react";
import { AppStylesBoundary } from "../styles/AppGlobalStyles.js";
import { AppDocumentReset } from "../styles/document-reset.js";
import { resolveThemeConfig } from "./tokens";
import { useThemeMode } from "./useThemeMode";

export const ThemeProvider = ({ children }: PropsWithChildren) => {
  const mode = useThemeMode((state) => state.mode);

  return (
    <StyleProvider>
      <ConfigProvider locale={zhCN} theme={resolveThemeConfig(mode)}>
        <App>
          <AppDocumentReset />
          <UiGlobalStyles>
            <AppStylesBoundary>{children}</AppStylesBoundary>
          </UiGlobalStyles>
        </App>
      </ConfigProvider>
    </StyleProvider>
  );
};
