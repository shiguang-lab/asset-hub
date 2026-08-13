import { Button, Card, Empty, formatDate, StatusBadge, Table, useToast } from "@shiguang/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { type Asset, api, type Publish } from "../../entities/api.js";

export function PublishesPage() {
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
    mutationFn: (id: string) => api(`/publishes/${id}/release`, { method: "POST" }),
    onSuccess: () => {
      toast("success", "已基于最新版本重新发布");
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
          <Table>
            <thead>
              <tr>
                <th>内容</th>
                <th>可见性</th>
                <th>访问量</th>
                <th>链接</th>
                <th>更新时间</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {publishes?.map((p) => (
                <tr key={p.id}>
                  <td>{titleOf(p.assetId)}</td>
                  <td>
                    <StatusBadge status={p.visibility} />
                  </td>
                  <td>{p.viewCount}</td>
                  <td>
                    <a href={p.url} target="_blank" rel="noreferrer">
                      {p.slug}
                    </a>
                    <div className="sg-subtle" style={{ fontSize: 11 }}>
                      {p.shortUrl}
                    </div>
                  </td>
                  <td>{formatDate(p.updatedAt)}</td>
                  <td>
                    <div className="sg-row">
                      <Button size="sm" onClick={() => setQr({ url: p.url ?? "", dataUrl: "" })}>
                        二维码
                      </Button>
                      <Button size="sm" onClick={() => rebuild.mutate(p.id)}>
                        重新发布
                      </Button>
                      <Button
                        size="sm"
                        variant="danger"
                        disabled={p.status !== "active"}
                        onClick={() => revoke.mutate(p.id)}
                      >
                        撤销
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}

      {qr && (
        <Card className="sg-mt">
          <div className="sg-row">
            <img
              src={qr.dataUrl}
              alt="二维码"
              style={{ width: 140, height: 140, borderRadius: 8 }}
            />
            <div>
              <strong>扫描访问</strong>
              <a href={qr.url} target="_blank" rel="noreferrer" style={{ display: "block" }}>
                {qr.url}
              </a>
              <Button size="sm" className="sg-mt" onClick={() => setQr(null)}>
                关闭
              </Button>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
