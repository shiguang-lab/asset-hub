/**
 * Asset Hub 平台级视觉 token，单一事实来源。
 * 颜色沿用 72 张设计稿的紫/深色体系，主题色为 #5B36F5；
 * 结构对齐 superagents/apps/web 的 palette/tokens 模式。
 */
export const platformPalette = {
  colorPrimary: "#5B36F5",
  colorSuccess: "#43D19E",
  colorWarning: "#FFB14A",
  colorError: "#FF5D66",
  colorInfo: "#5B36F5",

  borderRadius: 6,
  borderRadiusLG: 10,
  fontSize: 14,
  // Keep antd's default middle control height.
  controlHeight: 32,
  fontFamily:
    '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Helvetica Neue", Arial, sans-serif',

  scheme: {
    light: {
      colorBgLayout: "#F5F7FA",
      colorBgContainer: "#FFFFFF",
      colorBgElevated: "#FFFFFF",
      colorBorder: "#E4E8ED",
      colorBorderSecondary: "#EEF1F4",
    },
    dark: {
      colorBgLayout: "#0B0A0F",
      colorBgContainer: "#121116",
      colorBgElevated: "#1A181F",
      colorBorder: "#2A2731",
      colorBorderSecondary: "#23272E",
    },
  },
} as const;

export type PlatformPalette = typeof platformPalette;
