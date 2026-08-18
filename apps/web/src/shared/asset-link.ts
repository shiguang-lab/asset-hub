import type { AssetLinkResolver } from "@shiguang/content";

/**
 * 应用内的 asset: 引用解析：链接指向资产详情页，图片走下载端点。
 * 注意：图片内联渲染目前依赖下载端点（阶段 4 发布打包后才会在公开页面内联渲染）。
 */
export const assetLinkResolver: AssetLinkResolver = ({ assetId, kind }) => {
  if (kind === "image") return `/api/v1/assets/${assetId}/download`;
  return `/assets/${assetId}`;
};
