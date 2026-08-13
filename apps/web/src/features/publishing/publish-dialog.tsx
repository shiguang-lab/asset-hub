import { Button, Field, Input, Modal, Switch, useToast } from "@shiguang/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { type Asset, api, PUBLIC_GATEWAY_BASE, type Publish } from "../../entities/api.js";

export function PublishDialog({
  asset,
  open,
  onClose,
}: {
  asset: Asset;
  open: boolean;
  onClose: () => void;
}) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [visibility, setVisibility] = useState("public");
  const [password, setPassword] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [allowDownload, setAllowDownload] = useState(true);
  const [allowCopy, setAllowCopy] = useState(true);
  const [result, setResult] = useState<Publish | null>(null);
  const [qrUrl, setQrUrl] = useState("");
  const [copied, setCopied] = useState(false);

  const publishMutation = useMutation({
    mutationFn: () =>
      api<Publish>("/publishes", {
        method: "POST",
        body: {
          assetId: asset.id,
          visibility: visibility === "private" ? "public" : visibility,
          ...(visibility === "password" ? { password } : {}),
          ...(expiresAt ? { expiresAt: new Date(expiresAt).toISOString() } : {}),
          allowDownload,
          allowCopy,
        },
      }),
    onSuccess: (data) => {
      setResult(data);
      toast("success", "发布成功");
      void queryClient.invalidateQueries({ queryKey: ["publishes"] });
      void queryClient.invalidateQueries({ queryKey: ["assets"] });
    },
    onError: (e: Error) => toast("error", e.message),
  });

  useEffect(() => setResult(null), [open]);
  useEffect(() => {
    if (result?.url) {
      void QRCode.toDataURL(result.url, { width: 220, margin: 1 }).then(setQrUrl);
    }
  }, [result?.url]);

  const copyLink = () => {
    if (!result?.url) return;
    void navigator.clipboard.writeText(result.url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="发布 / 分享"
      wide
      footer={
        <div className="sg-row">
          <Button onClick={onClose}>保存草稿</Button>
          {!result ? (
            <Button variant="primary" onClick={() => publishMutation.mutate()}>
              发布并分享
            </Button>
          ) : (
            <Button variant="primary" onClick={onClose}>
              完成
            </Button>
          )}
        </div>
      }
    >
      {!result ? (
        <div className="sg-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
          <div>
            <h3 className="sg-h3">① 访问权限设置</h3>
            <div className="sg-col sg-mt-sm">
              {[
                { id: "private", label: "私有（仅我可见）", sub: "仅创建者可见，不允许他人访问" },
                { id: "link", label: "链接访问", sub: "获得链接的人可查看，可设置密码与有效期" },
                { id: "public", label: "公开访问", sub: "任何人可通过链接访问，会被搜索引擎收录" },
              ].map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="sg-card"
                  style={{
                    textAlign: "left",
                    cursor: "pointer",
                    borderColor: visibility === item.id ? "var(--sg-accent)" : undefined,
                    background: visibility === item.id ? "var(--sg-accent-soft)" : undefined,
                  }}
                  onClick={() => setVisibility(item.id)}
                >
                  <strong>{item.label}</strong>
                  <div className="sg-subtle">{item.sub}</div>
                </button>
              ))}
            </div>

            <h3 className="sg-h3 sg-mt">② 链接设置</h3>
            <Field label="稳定链接（推荐长期使用）" hint="发布后生成稳定 URL，更新内容需重新发布">
              <div className="sg-row">
                <Input readOnly value={`${PUBLIC_GATEWAY_BASE}/p/xxxxxxxx`} />
                <Button size="sm">复制</Button>
              </div>
            </Field>
            <div className="sg-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
              <Field label="密码保护（可选）">
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="设置访问密码"
                />
              </Field>
              <Field label="有效期（可选）">
                <Input
                  type="datetime-local"
                  value={expiresAt}
                  onChange={(e) => setExpiresAt(e.target.value)}
                />
              </Field>
            </div>
          </div>

          <div>
            <h3 className="sg-h3">访问限制</h3>
            <div className="sg-option-row">
              <span>允许下载报告</span>
              <Switch checked={allowDownload} onChange={setAllowDownload} />
            </div>
            <div className="sg-option-row">
              <span>允许复制内容</span>
              <Switch checked={allowCopy} onChange={setAllowCopy} />
            </div>
            <div className="sg-option-row">
              <span>仅允许企业内成员访问</span>
              <Switch checked={false} onChange={() => toast("info", "企业内访问控制为 P1 能力")} />
            </div>

            <h3 className="sg-h3 sg-mt">访问状态（发布后）</h3>
            <div className="sg-option-row">
              <span>访问次数</span>
              <span>发布后将统计访问总次数</span>
            </div>
            <div className="sg-option-row">
              <span>独立访客</span>
              <span>发布后将统计独立访客数</span>
            </div>
            <div className="sg-option-row">
              <span>统计数据</span>
              <span>每 5 分钟更新一次</span>
            </div>

            <h3 className="sg-h3 sg-mt">分享与推广</h3>
            <div className="sg-row sg-wrap">
              <Button size="sm" onClick={copyLink}>
                复制链接
              </Button>
              <Button size="sm" onClick={() => toast("info", "生成二维码分享")}>
                二维码
              </Button>
              <Button size="sm" onClick={() => toast("info", "生成分享海报")}>
                分享海报
              </Button>
              <Button size="sm" onClick={() => toast("info", "获取嵌入代码")}>
                嵌入网站
              </Button>
              <Button size="sm" onClick={() => toast("info", "通过邮件发送")}>
                邮件分享
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="sg-col">
          <div className="sg-card" style={{ background: "var(--sg-bg-3)" }}>
            <div className="sg-label">公开链接</div>
            <a href={result.url} target="_blank" rel="noreferrer">
              {result.url}
            </a>
            <div className="sg-label" style={{ marginTop: 10 }}>
              短链
            </div>
            <a href={result.shortUrl} target="_blank" rel="noreferrer">
              {result.shortUrl}
            </a>
          </div>
          <div className="sg-row sg-mt">
            {qrUrl && (
              <img src={qrUrl} alt="二维码" style={{ width: 150, height: 150, borderRadius: 8 }} />
            )}
            <div className="sg-col">
              <strong>扫描二维码访问</strong>
              <span className="sg-subtle">分享到朋友圈、微信群或打印物料</span>
              <Button size="sm" variant="primary" onClick={copyLink}>
                {copied ? "已复制 ✓" : "复制链接"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
