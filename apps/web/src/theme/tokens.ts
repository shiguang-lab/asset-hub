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

/** Stable visual aliases consumed by scoped feature styles. Keeping these as
 * ThemeConfig tokens preserves the existing palette while allowing every
 * feature stylesheet to read values through antd-style's token object. */
const visualToken = {
  colorTextPrimary: "#f4f3fb",
  colorTextSecondary: "#b8b5c9",
  colorTextMuted: "#777489",
  colorSurface: "#0b0a0f",
  colorSurfaceSecondary: "#121116",
  colorSurfaceTertiary: "#1a181f",
  colorStroke: "#2a2731",
  colorAccent: "#7c3cff",
  colorAccentHover: "#965eff",
  colorAccentSoft: "rgba(124, 60, 255, 0.14)",
} as const;

const buildComponents = (mode: ThemeMode): ThemeConfig["components"] => {
  const surface = platformPalette.scheme[mode];
  return {
    Button: {
      controlHeight: 32,
      controlHeightLG: 40,
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
      controlHeight: 32,
      borderRadius: platformPalette.borderRadius,
    },
    Select: {
      controlHeight: 32,
      borderRadius: platformPalette.borderRadius,
    },
    Segmented: {
      // colorBgLayout is the page background in dark mode; use the container
      // surface for the track so the antd control remains visually distinct.
      trackBg: mode === "dark" ? surface.colorBgContainer : surface.colorBgLayout,
    },
    Tabs: {
      titleFontSize: 13,
      titleFontSizeSM: 13,
      titleFontSizeLG: 13,
      horizontalItemGutter: 2,
      horizontalItemPadding: "9px 12px 12px",
      horizontalMargin: "0 0 14px",
      itemColor: "#777489",
      itemHoverColor: "#b8b5c9",
      itemSelectedColor: "#c6b1ff",
      itemActiveColor: "#c6b1ff",
      inkBarColor: "#7c3cff",
      // nav 底部下划线，对齐资产页 .sg-type-bar 的 --sg-border
      colorBorderSecondary: "#2a2731",
    },
    Layout: {
      headerHeight: 56,
      headerPadding: "0 24px",
      headerBg: surface.colorBgContainer,
      siderBg: surface.colorBgContainer,
      bodyBg: surface.colorBgLayout,
    },
    Table: {
      // 扁平通栏表格：对齐资产页 sg-assets-table 观感
      headerBg: "#17151b",
      headerColor: "#777489",
      rowHoverBg: "#17151c",
      rowSelectedBg: "rgba(124, 60, 255, 0.14)",
      rowSelectedHoverBg: "rgba(124, 60, 255, 0.2)",
      borderColor: "#232129",
      headerSplitColor: "transparent",
      cellFontSize: 13,
      cellFontSizeMD: 13,
      cellFontSizeSM: 13,
      cellPaddingBlock: 18,
      cellPaddingInline: 12,
      cellPaddingBlockMD: 16,
      cellPaddingInlineMD: 12,
      cellPaddingBlockSM: 8,
      cellPaddingInlineSM: 8,
      headerBorderRadius: 0,
      selectionColumnWidth: 40,
    },
  };
};

export const themeConfig: Record<ThemeMode, ThemeConfig> = {
  light: {
    algorithm: theme.defaultAlgorithm,
    token: { ...sharedToken, ...visualToken, ...platformPalette.scheme.light },
    components: buildComponents("light"),
  },
  dark: {
    algorithm: theme.darkAlgorithm,
    token: { ...sharedToken, ...visualToken, ...platformPalette.scheme.dark },
    components: buildComponents("dark"),
  },
};

export const resolveThemeConfig = (mode: ThemeMode): ThemeConfig => themeConfig[mode];
