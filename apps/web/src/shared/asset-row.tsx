import { formatRelative, StatusBadge } from "@shiguang/ui";
import { Card } from "antd";
import { createStyles } from "antd-style";
import { useNavigate } from "react-router-dom";
import type { Asset } from "../entities/api.js";

const useAssetRowStyles = createStyles(() => ({
  copy: {
    gap: 2,
    minWidth: 0,
  },
  title: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
}));

export function AssetRow({ asset, actions }: { asset: Asset; actions?: React.ReactNode }) {
  const navigate = useNavigate();
  const { styles } = useAssetRowStyles();
  const href =
    asset.type === "document" || asset.type === "report"
      ? `/documents/${asset.id}`
      : asset.type === "html"
        ? `/html/${asset.id}`
        : asset.type === "presentation"
          ? `/presentations/${asset.id}`
          : asset.type === "dataset"
            ? `/datasets/${asset.id}`
            : `/assets/${asset.id}`;
  return (
    <Card hoverable onClick={() => navigate(href)}>
      <div className="sg-row-between">
        <div className={`sg-col ${styles.copy}`}>
          <strong className={styles.title}>{asset.title}</strong>
          <span className="sg-subtle">
            {asset.type} · {formatRelative(asset.updatedAt)}
          </span>
        </div>
        <div className="sg-row">
          <StatusBadge status={asset.status} />
          {actions}
        </div>
      </div>
    </Card>
  );
}
