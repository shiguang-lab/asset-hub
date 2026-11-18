/**
 * Asset Hub 平台级视觉 token，单一事实来源。
 * 采用 V6「极光流彩暗色 (Aurora Nebula Glass)」C 端视觉体系。
 */
export const platformPalette = {
  colorPrimary: "#9333EA",
  colorSuccess: "#34D399",
  colorWarning: "#FBBF24",
  colorError: "#FB7185",
  colorInfo: "#38BDF8",

  borderRadius: 11,
  borderRadiusLG: 18,
  fontSize: 14,
  // Keep antd's default middle control height.
  controlHeight: 34,
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Inter", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif',

  scheme: {
    light: {
      colorBgLayout: "#F2F3F0",
      colorBgContainer: "#FFFFFF",
      colorBgElevated: "#FFFFFF",
      colorBorder: "rgba(15, 23, 42, 0.08)",
      colorBorderSecondary: "rgba(15, 23, 42, 0.05)",
    },
    dark: {
      colorBgLayout: "#060811",
      colorBgContainer: "#13172B",
      colorBgElevated: "#191F38",
      colorBorder: "rgba(255, 255, 255, 0.095)",
      colorBorderSecondary: "rgba(255, 255, 255, 0.065)",
    },
  },
} as const;

export type PlatformPalette = typeof platformPalette;
