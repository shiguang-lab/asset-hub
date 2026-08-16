import { type ThemeConfig, theme } from "antd";
import { platformPalette } from "./palette";
import type { ThemeMode } from "./useThemeMode";

const sharedToken = {
  colorPrimary: platformPalette.colorPrimary,
  colorSuccess: platformPalette.colorSuccess,
  colorWarning: platformPalette.colorWarning,
  colorError: platformPalette.colorError,
  colorInfo: platformPalette.colorInfo,
  borderRadius: platformPalette.borderRadius,
  borderRadiusLG: platformPalette.borderRadiusLG,
  fontSize: platformPalette.fontSize,
  controlHeight: platformPalette.controlHeight,
  fontFamily: platformPalette.fontFamily,
  wireframe: false,
} as const;

const buildComponents = (mode: ThemeMode): ThemeConfig["components"] => {
  const surface = platformPalette.scheme[mode];
  return {
    Button: {
      controlHeight: 36,
      controlHeightLG: 44,
      borderRadius: platformPalette.borderRadius,
      fontWeight: 500,
      primaryShadow: "none",
      defaultShadow: "none",
    },
    Card: {
      borderRadiusLG: platformPalette.borderRadiusLG,
      paddingLG: 20,
      colorBorderSecondary: surface.colorBorderSecondary,
    },
    Menu: {
      itemBorderRadius: 8,
      itemHeight: 40,
      itemMarginInline: 8,
      activeBarBorderWidth: 0,
    },
    Input: {
      controlHeight: 36,
      borderRadius: platformPalette.borderRadius,
    },
    Select: {
      controlHeight: 36,
      borderRadius: platformPalette.borderRadius,
    },
    Tabs: {
      titleFontSize: platformPalette.fontSize,
    },
    Layout: {
      headerHeight: 56,
      headerPadding: "0 24px",
      headerBg: surface.colorBgContainer,
      siderBg: surface.colorBgContainer,
      bodyBg: surface.colorBgLayout,
    },
  };
};

export const themeConfig: Record<ThemeMode, ThemeConfig> = {
  light: {
    algorithm: theme.defaultAlgorithm,
    token: { ...sharedToken, ...platformPalette.scheme.light },
    components: buildComponents("light"),
  },
  dark: {
    algorithm: theme.darkAlgorithm,
    token: { ...sharedToken, ...platformPalette.scheme.dark },
    components: buildComponents("dark"),
  },
};

export const resolveThemeConfig = (mode: ThemeMode): ThemeConfig => themeConfig[mode];
