import { Empty, formatDate, Scrollbar, StatusBadge, useToast } from "@shiguang/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Card, Modal } from "antd";
import { createStyles } from "antd-style";
import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { type Asset, api, type Publish } from "../../entities/api.js";
import { AppTable } from "../../shared/AppTable.js";

const usePublishesStyles = createStyles(() => ({
  tableWrap: { minWidth: 0 },
  shortUrl: { fontSize: 11 },
  qrCard: { width: 140, height: 140, borderRadius: 8 },
  qrLink: { display: "block" },
  references: { maxHeight: 240 },
  reference: { padding: 10 },
}));

export function PublishesPage() {
  const { styles } = usePublishesStyles();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { data: publishes } = useQuery<Publish[]>({
    queryKey: ["publishes"],
    queryFn: () => api("/publishes"),
  });
  const { data: assets } = useQuery<{ items: Asset[] }>({
    queryKey: ["assets"],
    queryFn: () => api("/assets", { params: { limit: 100 } }),
  });
  const [qr, setQr] = useState<{ url: string; dataUrl: string } | null>(null);
  const [rebuildTarget, setRebuildTarget] = useState<Publish | null>(null);
  const { data: rebuildReferences } = useQuery<{
    references: Array<{ id: string; title: string; type: string; visibility: string }>;
  }>({
    queryKey: ["publish-references", rebuildTarget?.assetId],
    queryFn: () => api(`/assets/${rebuildTarget?.assetId}/publish-references`),
    enabled: Boolean(rebuildTarget),
  });

  useEffect(() => {
    if (!qr) return;
    void QRCode.toDataURL(qr.url, { width: 180, margin: 1 }).then((dataUrl) =>
      setQr((q) => (q ? { ...q, dataUrl } : q)),
    );
  }, [qr?.url]);

  const revoke = useMutation({
    mutationFn: (id: string) => api(`/publishes/${id}/revoke`, { method: "POST" }),
    onSuccess: () => {
      toast("success", "已撤销发布");
      void queryClient.invalidateQueries({ queryKey: ["publishes"] });
    },
  });

  const rebuild = useMutation({
    mutationFn: ({ id, allowPrivateReferences }: { id: string; allowPrivateReferences: boolean }) =>
      api(`/publishes/${id}/release`, {
        method: "POST",
        body: { allowPrivateReferences },
      }),
    onSuccess: () => {
      toast("success", "已基于最新版本重新发布");
      setRebuildTarget(null);
      void queryClient.invalidateQueries({ queryKey: ["publishes"] });
    },
  });

  const titleOf = (assetId: string) =>
    assets?.items.find((a) => a.id === assetId)?.title ?? assetId;

  return (
    <div>
      <h1 className="sg-h1 sg-mb">发布管理</h1>
      {(publishes?.length ?? 0) === 0 ? (
        <Empty title="还没有发布内容" hint="在文档 / 演示详情页点击「发布」生成稳定 URL。" />
      ) : (
        <Card>
          <Scrollbar className={styles.tableWrap}>
            <AppTable<Publish>
              rowKey="id"
              dataSource={publishes ?? []}
              pagination={false}
              size="middle"
              columns={[
                { title: "内容", dataIndex: "assetId", render: (v) => titleOf(v) },
                {
                  title: "可见性",
                  dataIndex: "visibility",
                  render: (v) => <StatusBadge status={v} />,
                },
                { title: "访问量", dataIndex: "viewCount" },
                {
                  title: "链接",
                  dataIndex: "slug",
                  key: "link",
                  render: (_v, p) => (
                    <>
                      <a href={p.url} target="_blank" rel="noreferrer">
                        {p.slug}
                      </a>
                      <div className={`sg-subtle ${styles.shortUrl}`}>{p.shortUrl}</div>
                    </>
                  ),
                },
                { title: "更新时间", dataIndex: "updatedAt", render: (v) => formatDate(v) },
                {
                  title: "操作",
                  key: "actions",
                  render: (_v, p) => (
                    <div className="sg-row">
                      <Button size="small" onClick={() => setQr({ url: p.url ?? "", dataUrl: "" })}>
                        二维码
                      </Button>
                      <Button size="small" onClick={() => setRebuildTarget(p)}>
                        重新发布
                      </Button>
                      <Button
                        size="small"
                        type="primary"
                        danger
                        disabled={p.status !== "active"}
                        onClick={() => revoke.mutate(p.id)}
                      >
                        撤销
                      </Button>
                    </div>
                  ),
                },
              ]}
            />
          </Scrollbar>
        </Card>
      )}

      {qr && (
        <Card className="sg-mt">
          <div className="sg-row">
            <img src={qr.dataUrl} alt="二维码" className={styles.qrCard} />
            <div>
              <strong>扫描访问</strong>
              <a href={qr.url} target="_blank" rel="noreferrer" className={styles.qrLink}>
                {qr.url}
              </a>
              <Button size="small" className="sg-mt" onClick={() => setQr(null)}>
                关闭
              </Button>
            </div>
          </div>
        </Card>
      )}
      <Modal
        open={Boolean(rebuildTarget)}
        title="确认发布关联资源"
        onCancel={() => {
          if (rebuildTarget)
            rebuild.mutate({ id: rebuildTarget.id, allowPrivateReferences: false });
        }}
        onOk={() => {
          if (rebuildTarget) rebuild.mutate({ id: rebuildTarget.id, allowPrivateReferences: true });
        }}
        cancelText="仅发布当前文档"
        okText="一起发布并允许访问"
        confirmLoading={rebuild.isPending}
        destroyOnHidden
      >
        <p className="sg-subtle">
          重新发布不会改变当前文档的发布流程。选择是否让关联资源在本次公开快照中可访问。
        </p>
        <Scrollbar className={`sg-col ${styles.references}`}>
          {(rebuildReferences?.references ?? []).map((reference) => (
            <div key={reference.id} className={`sg-row-between sg-card ${styles.reference}`}>
              <span>{reference.title}</span>
              <span className="sg-subtle">
                {reference.visibility === "private" ? "私有" : "已公开"}
              </span>
            </div>
          ))}
        </Scrollbar>
      </Modal>
    </div>
  );
}
