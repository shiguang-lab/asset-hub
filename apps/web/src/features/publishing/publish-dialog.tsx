import { Button, Field, Input, Modal, Switch, useToast } from "@shiguang/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { type Asset, api, PUBLIC_GATEWAY_BASE, type Publish } from "../../entities/api.js";

interface PublishDraft {
  visibility: string;
  password: string;
  expiresAt: string;
  allowDownload: boolean;
  allowCopy: boolean;
  internalOnly: boolean;
}

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
  const [internalOnly, setInternalOnly] = useState(false);
  const [result, setResult] = useState<Publish | null>(null);
  const [qrUrl, setQrUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const draftKey = `shiguang.publish-draft:${asset.id}`;

  const publishMutation = useMutation({
    mutationFn: () =>
      api<Publish>("/publishes", {
        method: "POST",
        body: {
          assetId: asset.id,
          visibility:
            internalOnly || visibility === "private" || visibility === "link"
              ? "unlisted"
              : visibility,
          ...(visibility === "password" ? { password } : {}),
          ...(expiresAt ? { expiresAt: new Date(expiresAt).toISOString() } : {}),
          allowDownload,
          allowCopy,
        },
      }),
    onSuccess: (data) => {
      setResult(data);
      window.localStorage.removeItem(draftKey);
      toast("success", "发布成功");
      void queryClient.invalidateQueries({ queryKey: ["publishes"] });
      void queryClient.invalidateQueries({ queryKey: ["assets"] });
      void queryClient.invalidateQueries({ queryKey: ["asset", asset.id] });
    },
    onError: (e: Error) => toast("error", e.message),
  });

  useEffect(() => {
    if (!open) return;
    setResult(null);
    setQrUrl("");
    try {
      const saved = window.localStorage.getItem(draftKey);
      if (!saved) return;
      const draft = JSON.parse(saved) as PublishDraft;
      setVisibility(draft.visibility);
      setPassword(draft.password);
      setExpiresAt(draft.expiresAt);
      setAllowDownload(draft.allowDownload);
      setAllowCopy(draft.allowCopy);
      setInternalOnly(draft.internalOnly);
    } catch {
      window.localStorage.removeItem(draftKey);
    }
  }, [draftKey, open]);
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

  const requireResult = (action: (url: string) => void) => {
    if (!result?.url) {
      toast("info", "请先发布文档后再使用分享功能");
      return;
    }
    action(result.url);
  };

  const generateQr = (url: string) => {
    void QRCode.toDataURL(url, { width: 220, margin: 1 }).then(setQrUrl);
  };

  const downloadPoster = (url: string) => {
    const canvas = document.createElement("canvas");
    canvas.width = 1200;
    canvas.height = 630;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.fillStyle = "#0b0a0f";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#f4f3fb";
    context.font = "bold 56px sans-serif";
    context.fillText(asset.title.slice(0, 24), 72, 220);
    context.fillStyle = "#a887ff";
    context.font = "28px sans-serif";
    context.fillText("Shiguang Lab", 72, 285);
    context.fillStyle = "#b8b5c9";
    context.font = "24px sans-serif";
    context.fillText(url, 72, 500);
    const anchor = document.createElement("a");
    anchor.download = `${asset.title || "文档"}-分享海报.png`;
    anchor.href = canvas.toDataURL("image/png");
    anchor.click();
  };

  const copyEmbedCode = (url: string) => {
    void navigator.clipboard?.writeText(
      `<iframe src="${url}" title="${asset.title}" width="100%" height="720" frameborder="0"></iframe>`,
    );
    toast("success", "嵌入代码已复制");
  };

  const emailShare = (url: string) => {
    window.location.href = `mailto:?subject=${encodeURIComponent(asset.title)}&body=${encodeURIComponent(url)}`;
  };

  const savePublishDraft = () => {
    window.localStorage.setItem(
      draftKey,
      JSON.stringify({ visibility, password, expiresAt, allowDownload, allowCopy, internalOnly }),
    );
    toast("success", "发布设置草稿已保存");
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="发布 / 分享"
      wide
      footer={
        <div className="sg-row">
          <Button onClick={savePublishDraft}>保存草稿</Button>
          {!result ? (
            <Button
              variant="primary"
              disabled={
                publishMutation.isPending || (visibility === "password" && password.length < 4)
              }
              onClick={() => publishMutation.mutate()}
            >
              {publishMutation.isPending ? "发布中…" : "发布并分享"}
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
                { id: "private", label: "不公开", sub: "不进入公开列表，仅通过链接访问" },
                { id: "link", label: "链接访问", sub: "获得链接的人可查看，可设置密码与有效期" },
                { id: "password", label: "密码访问", sub: "访问者输入正确密码后才能查看" },
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
                <Input readOnly value={`${PUBLIC_GATEWAY_BASE}/p/发布后自动生成`} />
                <Button size="sm" disabled>
                  发布后生成
                </Button>
              </div>
            </Field>
            <div className="sg-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
              <Field label="密码保护（可选）">
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="设置访问密码"
                  disabled={visibility !== "password"}
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
              <span>仅允许通过链接访问</span>
              <Switch checked={internalOnly} onChange={setInternalOnly} />
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
              <Button size="sm" onClick={copyLink} disabled={!result}>
                复制链接
              </Button>
              <Button size="sm" onClick={() => requireResult(generateQr)} disabled={!result}>
                二维码
              </Button>
              <Button size="sm" onClick={() => requireResult(downloadPoster)} disabled={!result}>
                分享海报
              </Button>
              <Button size="sm" onClick={() => requireResult(copyEmbedCode)} disabled={!result}>
                嵌入网站
              </Button>
              <Button size="sm" onClick={() => requireResult(emailShare)} disabled={!result}>
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
              <div className="sg-row sg-wrap">
                <Button size="sm" onClick={() => downloadPoster(result.url ?? "")}>
                  下载海报
                </Button>
                <Button size="sm" onClick={() => copyEmbedCode(result.url ?? "")}>
                  复制嵌入代码
                </Button>
                <Button size="sm" onClick={() => emailShare(result.url ?? "")}>
                  邮件分享
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
