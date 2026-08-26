import { Empty, Scrollbar, StatusBadge } from "@shiguang/ui";
import { useQuery } from "@tanstack/react-query";
import { Button, Tag } from "antd";
import { createStyles } from "antd-style";
import { ArrowLeft, Edit3, Info } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import type { Asset } from "../../entities/api.js";
import { api } from "../../entities/api.js";
import { DocumentMarkdown } from "../../shared/document-markdown.js";
import { useShellBreadcrumb } from "../../shell/layout.js";

const useDocumentPreviewStyles = createStyles(() => ({
  headerRow: {
    minWidth: 0,
  },
  titleWrap: {
    minWidth: 0,
  },
  title: {
    margin: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
}));

export function DocumentPreviewPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { styles } = useDocumentPreviewStyles();
  const { data: asset, isLoading } = useQuery<Asset>({
    queryKey: ["asset", id],
    queryFn: () => api<Asset>(`/assets/${id}`),
    enabled: Boolean(id),
  });

  useShellBreadcrumb("文档", asset?.title ?? "文档预览");

  if (isLoading || !asset) return <Empty title="加载中…" />;

  const source = asset.content?.text ?? "";

  return (
    <div className="sg-document-preview-page">
      <div className="sg-row-between sg-document-preview-header">
        <div className={`sg-row ${styles.headerRow}`}>
          <Button type="text" icon={<ArrowLeft size={16} />} onClick={() => navigate(-1)} />
          <div className={styles.titleWrap}>
            <h1 className={`sg-h1 ${styles.title}`}>{asset.title}</h1>
            <div className="sg-row sg-mt-sm">
              <StatusBadge status={asset.status} />
              <Tag>{asset.type === "report" ? "调研报告" : "文档"}</Tag>
              <span className="sg-subtle">{asset.visibility === "public" ? "公开" : "私有"}</span>
            </div>
          </div>
        </div>
        <div className="sg-row">
          <Button icon={<Info size={15} />} onClick={() => navigate(`/assets/${asset.id}`)}>
            资产信息
          </Button>
          <Button
            type="primary"
            icon={<Edit3 size={15} />}
            onClick={() => navigate(`/documents/${asset.id}`)}
          >
            编辑文档
          </Button>
        </div>
      </div>

      <section className="sg-document-preview-content">
        <Scrollbar>
          {source ? <DocumentMarkdown source={source} /> : <Empty title="文档暂无内容" />}
        </Scrollbar>
      </section>
    </div>
  );
}
