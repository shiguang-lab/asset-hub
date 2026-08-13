import { Button, Field, Input, Modal, Select, Switch, useToast } from "@shiguang/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import QRCode from "qrcode";
import { useEffect as qrEffect, useEffect, useState } from "react";
import { type Asset, api, type Publish } from "../../entities/api.js";

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

  const publishMutation = useMutation({
    mutationFn: () =>
      api<Publish>("/publishes", {
        method: "POST",
        body: {
          assetId: asset.id,
          visibility,
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
  qrEffect(() => {
    if (result?.url) {
      void QRCode.toDataURL(result.url, { width: 220, margin: 1 }).then(setQrUrl);
    }
  }, [result?.url]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`发布「${asset.title}」`}
      footer={
        result ? (
          <Button onClick={onClose}>完成</Button>
        ) : (
          <Button variant="primary" onClick={() => publishMutation.mutate()}>
            发布
          </Button>
        )
      }
    >
      {!result ? (
        <div>
          <Field label="可见性">
            <Select
              value={visibility}
              onChange={setVisibility}
              options={[
                { value: "public", label: "公开（所有人可访问）" },
                { value: "unlisted", label: "未列出（有链接即可访问）" },
                { value: "password", label: "密码保护" },
              ]}
            />
          </Field>
          {visibility === "password" && (
            <Field label="访问密码" hint="用户需输入密码才能查看内容">
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="至少 4 位"
              />
            </Field>
          )}
          <Field label="有效期（可选）">
            <Input
              type="datetime-local"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
            />
          </Field>
          <div className="sg-row-between">
            <span>允许下载原文件</span>
            <Switch checked={allowDownload} onChange={setAllowDownload} />
          </div>
          <div className="sg-row-between" style={{ marginTop: 10 }}>
            <span>允许复制内容</span>
            <Switch checked={allowCopy} onChange={setAllowCopy} />
          </div>
          <p className="sg-hint">发布后生成稳定 URL；更新内容后需手动“重新发布”生成新版本链接。</p>
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
              <img src={qrUrl} alt="二维码" style={{ width: 140, height: 140, borderRadius: 8 }} />
            )}
            <p className="sg-hint">扫码即可打开；链接受有效期与可见性策略控制。</p>
          </div>
        </div>
      )}
    </Modal>
  );
}
