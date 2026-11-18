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

/** Stable visual aliases consumed by scoped feature styles. */
const visualToken = {
  colorTextPrimary: "#F6F7FB",
  colorTextSecondary: "#B5BED2",
  colorTextMuted: "#7B859F",
  colorSurface: "#060811",
  colorSurfaceSecondary: "#13172B",
  colorSurfaceTertiary: "#191F38",
  colorStroke: "rgba(255, 255, 255, 0.095)",
  colorAccent: "#C084FC",
  colorAccentHover: "#D8B4FE",
  colorAccentSoft: "rgba(168, 85, 247, 0.20)",
} as const;

const buildComponents = (mode: ThemeMode): ThemeConfig["components"] => {
  const surface = platformPalette.scheme[mode];
  return {
    Button: {
      controlHeight: 34,
      controlHeightLG: 40,
      borderRadius: 999,
      fontWeight: 600,
      primaryShadow: "0 8px 22px -3px rgba(168, 85, 247, 0.45)",
      defaultShadow: "none",
      defaultBg: "rgba(255, 255, 255, 0.05)",
      defaultBorderColor: "rgba(255, 255, 255, 0.14)",
    },
    Card: {
      borderRadiusLG: 20,
      paddingLG: 22,
      colorBorderSecondary: surface.colorBorder,
    },
    Menu: {
      itemBorderRadius: 11,
      itemHeight: 38,
      itemMarginInline: 4,
      activeBarBorderWidth: 0,
    },
    Input: {
      controlHeight: 35,
      borderRadius: 999,
      colorBgContainer: "rgba(255, 255, 255, 0.048)",
      colorBorder: "rgba(255, 255, 255, 0.095)",
      activeBorderColor: "rgba(192, 132, 252, 0.55)",
      hoverBorderColor: "rgba(192, 132, 252, 0.35)",
    },
    Select: {
      controlHeight: 35,
      borderRadius: 999,
      colorBgContainer: "rgba(255, 255, 255, 0.048)",
      colorBorder: "rgba(255, 255, 255, 0.095)",
    },
    Segmented: {
      trackBg: "rgba(255, 255, 255, 0.05)",
      itemSelectedBg: "rgba(168, 85, 247, 0.24)",
      itemSelectedColor: "#F6F7FB",
      borderRadius: 999,
    },
    Modal: {
      borderRadiusLG: 22,
      contentBg: "#15192E",
      headerBg: "#15192E",
    },
    Dropdown: {
      borderRadiusLG: 16,
      colorBgElevated: "rgba(20, 24, 43, 0.96)",
    },
    Tabs: {
      titleFontSize: 13,
      titleFontSizeSM: 13,
      titleFontSizeLG: 13,
      horizontalItemGutter: 6,
      horizontalItemPadding: "9px 12px 11px",
      horizontalMargin: "0 0 14px",
      itemColor: "#7B859F",
      itemHoverColor: "#D4DCF0",
      itemSelectedColor: "#E9D5FF",
      itemActiveColor: "#E9D5FF",
      inkBarColor: "#C084FC",
      colorBorderSecondary: "rgba(255, 255, 255, 0.085)",
    },
    Layout: {
      headerHeight: 56,
      headerPadding: "0 24px",
      headerBg: "transparent",
      siderBg: "transparent",
      bodyBg: surface.colorBgLayout,
    },
    Table: {
      headerBg: "rgba(255, 255, 255, 0.03)",
      headerColor: "#7B859F",
      rowHoverBg: "rgba(168, 85, 247, 0.08)",
      rowSelectedBg: "rgba(168, 85, 247, 0.16)",
      rowSelectedHoverBg: "rgba(168, 85, 247, 0.22)",
      borderColor: "rgba(255, 255, 255, 0.065)",
      headerSplitColor: "transparent",
      cellFontSize: 13,
      cellFontSizeMD: 13,
      cellFontSizeSM: 13,
      cellPaddingBlock: 16,
      cellPaddingInline: 14,
      cellPaddingBlockMD: 14,
      cellPaddingInlineMD: 14,
      cellPaddingBlockSM: 8,
      cellPaddingInlineSM: 10,
      headerBorderRadius: 12,
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

export const resolveThemeConfig = (_mode?: ThemeMode): ThemeConfig => themeConfig.dark;
