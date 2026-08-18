import { Button, Field, Input, Modal, Switch, useToast } from "@shiguang/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import QRCode from "qrcode";
import { useEffect, useMemo, useRef, useState } from "react";
import { type Asset, api, PUBLIC_GATEWAY_BASE, type Publish } from "../../entities/api.js";

type ShareVisibility = "link" | "password" | "public";

interface PublishDraft {
  visibility: ShareVisibility;
  password: string;
  expiresAt: string;
  allowDownload: boolean;
  allowCopy: boolean;
}

const ACCESS_OPTIONS: Array<{ id: ShareVisibility; label: string; description: string }> = [
  { id: "link", label: "链接访问", description: "获得链接的人可查看，不会被搜索引擎收录" },
  { id: "password", label: "密码访问", description: "获得链接并输入正确密码的人可查看" },
  { id: "public", label: "公开访问", description: "任何人可访问，并允许被搜索引擎收录" },
];

function toShareVisibility(visibility: string): ShareVisibility {
  if (visibility === "password") return "password";
  if (visibility === "public") return "public";
  return "link";
}

function toDateTimeLocal(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

async function copyText(value: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const input = document.createElement("textarea");
  input.value = value;
  input.style.position = "fixed";
  input.style.opacity = "0";
  document.body.append(input);
  input.select();
  document.execCommand("copy");
  input.remove();
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
  const draftKey = `shiguang.publish-draft:${asset.id}`;
  const [visibility, setVisibility] = useState<ShareVisibility>("link");
  const [password, setPassword] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [allowDownload, setAllowDownload] = useState(true);
  const [allowCopy, setAllowCopy] = useState(true);
  const [activePublish, setActivePublish] = useState<Publish | null>(null);
  const [qrUrl, setQrUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const lastSyncedPublishId = useRef<string | null>(null);

  const { data: existingPublishes = [] } = useQuery<Publish[]>({
    queryKey: ["publishes", asset.id],
    queryFn: () => api<Publish[]>("/publishes", { params: { assetId: asset.id } }),
    enabled: open,
  });
  const existingPublish = existingPublishes.find((publish) => publish.status === "active") ?? null;
  const publish = activePublish ?? existingPublish;
  const shareUrl = publish?.shortUrl ?? "";
  const canonicalUrl = publish?.url ?? shareUrl;

  const invalidatePublishedData = () => {
    void queryClient.invalidateQueries({ queryKey: ["publishes"] });
    void queryClient.invalidateQueries({ queryKey: ["assets"] });
    void queryClient.invalidateQueries({ queryKey: ["asset", asset.id] });
  };

  // Reset transient UI state when the dialog opens. The dialog is conditionally
  // mounted by its parent, so this effectively runs once per open.
  useEffect(() => {
    if (!open) return;
    setActivePublish(null);
    setQrUrl("");
    setCopied(false);
  }, [open]);

  // Sync form fields once per publish identity (initial open, or when the query
  // first resolves with a publish). Guarding by publish id means the refetch
  // triggered after a create/update mutation — or any other background refetch
  // of the same publish — will NOT clobber the user's in-progress edits. This
  // effect also never resets activePublish/qrUrl/copied, so a freshly generated
  // QR code survives those refetches.
  useEffect(() => {
    if (!open) return;
    const publishId = existingPublish?.id ?? null;
    if (publishId === lastSyncedPublishId.current) return;
    lastSyncedPublishId.current = publishId;
    if (existingPublish) {
      setVisibility(toShareVisibility(existingPublish.visibility));
      setPassword("");
      setExpiresAt(toDateTimeLocal(existingPublish.expiresAt));
      setAllowDownload(existingPublish.allowDownload);
      setAllowCopy(existingPublish.allowCopy);
      return;
    }
    try {
      const draft = JSON.parse(
        window.localStorage.getItem(draftKey) ?? "null",
      ) as PublishDraft | null;
      if (!draft) return;
      setVisibility(draft.visibility);
      setPassword(draft.password);
      setExpiresAt(draft.expiresAt);
      setAllowDownload(draft.allowDownload);
      setAllowCopy(draft.allowCopy);
    } catch {
      window.localStorage.removeItem(draftKey);
    }
  }, [draftKey, existingPublish, open]);

  useEffect(() => {
    if (!shareUrl) {
      setQrUrl("");
      return;
    }
    let cancelled = false;
    void QRCode.toDataURL(shareUrl, { width: 220, margin: 1 }).then((dataUrl) => {
      if (!cancelled) setQrUrl(dataUrl);
    });
    return () => {
      cancelled = true;
    };
  }, [shareUrl]);

  const expiresAtIso = useMemo(() => {
    if (!expiresAt) return null;
    const parsed = new Date(expiresAt);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }, [expiresAt]);
  const isExpiredDate = Boolean(
    expiresAt && (!expiresAtIso || new Date(expiresAtIso).getTime() <= Date.now()),
  );
  const passwordMustBeSet = visibility === "password" && publish?.visibility !== "password";
  const passwordIsInvalid =
    (passwordMustBeSet && password.length < 4) || (password.length > 0 && password.length < 4);
  const canSave = !passwordIsInvalid && !isExpiredDate;

  const settingsPayload = () => ({
    visibility: visibility === "link" ? "unlisted" : visibility,
    ...(visibility === "password" && password ? { password } : {}),
    expiresAt: expiresAtIso,
    allowDownload,
    allowCopy,
  });

  const createPublish = useMutation({
    mutationFn: () =>
      api<Publish>("/publishes", {
        method: "POST",
        body: { assetId: asset.id, ...settingsPayload() },
      }),
    onSuccess: (next) => {
      setActivePublish(next);
      setPassword("");
      window.localStorage.removeItem(draftKey);
      toast("success", "已发布，分享短链已生成");
      invalidatePublishedData();
    },
    onError: (error: Error) => toast("error", error.message),
  });

  const updatePublish = useMutation({
    mutationFn: () =>
      api<Publish>(`/publishes/${publish?.id}`, { method: "PATCH", body: settingsPayload() }),
    onSuccess: (next) => {
      setActivePublish(next);
      setPassword("");
      toast("success", "发布设置已更新");
      invalidatePublishedData();
    },
    onError: (error: Error) => toast("error", error.message),
  });

  const saveDraft = () => {
    window.localStorage.setItem(
      draftKey,
      JSON.stringify({ visibility, password, expiresAt, allowDownload, allowCopy }),
    );
    toast("success", "发布设置草稿已保存");
    onClose();
  };

  const copyLink = async () => {
    if (!shareUrl) return;
    try {
      await copyText(shareUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast("error", "复制链接失败，请手动复制");
    }
  };

  const downloadPoster = async (url: string) => {
    const canvas = document.createElement("canvas");
    canvas.width = 1200;
    canvas.height = 630;
    const context = canvas.getContext("2d");
    if (!context) return;

    context.fillStyle = "#0b0a0f";
    context.fillRect(0, 0, canvas.width, canvas.height);

    const fitText = (text: string, maxWidth: number): string => {
      if (context.measureText(text).width <= maxWidth) return text;
      let result = text;
      while (result.length > 0 && context.measureText(`${result}…`).width > maxWidth) {
        result = result.slice(0, -1);
      }
      return `${result}…`;
    };

    context.fillStyle = "#f4f3fb";
    context.font = "bold 56px sans-serif";
    context.fillText(fitText(asset.title, 780), 72, 220);

    context.fillStyle = "#a887ff";
    context.font = "28px sans-serif";
    context.fillText("知序", 72, 285);

    const displayedUrl = url.length > 60 ? `${url.slice(0, 57)}…` : url;
    context.fillStyle = "#b8b5c9";
    context.font = "24px sans-serif";
    context.fillText(displayedUrl, 72, 500);

    // Embed the QR code on the right side so the poster is scannable.
    let qrDataUrl = qrUrl;
    if (!qrDataUrl) {
      try {
        qrDataUrl = await QRCode.toDataURL(url, { width: 220, margin: 1 });
      } catch {
        qrDataUrl = "";
      }
    }
    if (qrDataUrl) {
      const qrImage = new Image();
      qrImage.src = qrDataUrl;
      try {
        await qrImage.decode();
      } catch {
        // QR image failed to load; fall back to a poster without the code.
      }
      if (qrImage.naturalWidth > 0) {
        const size = 220;
        const x = canvas.width - size - 72;
        const y = Math.round((canvas.height - size) / 2);
        context.fillStyle = "#ffffff";
        context.fillRect(x - 20, y - 20, size + 40, size + 40);
        context.drawImage(qrImage, x, y, size, size);
      }
    }

    const anchor = document.createElement("a");
    anchor.download = `${asset.title || "文档"}-分享海报.png`;
    anchor.href = canvas.toDataURL("image/png");
    anchor.click();
  };

  const copyEmbedCode = async () => {
    if (!canonicalUrl) return;
    await copyText(
      `<iframe src="${canonicalUrl}" title="${asset.title}" width="100%" height="720" frameborder="0"></iframe>`,
    );
    toast("success", "嵌入代码已复制");
  };

  const emailShare = () => {
    if (!shareUrl) return;
    window.location.href = `mailto:?subject=${encodeURIComponent(asset.title)}&body=${encodeURIComponent(shareUrl)}`;
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={publish ? "分享设置" : "发布并分享"}
      wide
      footer={
        <div className="sg-row">
          <Button onClick={onClose}>取消</Button>
          {!publish ? <Button onClick={saveDraft}>保存草稿</Button> : null}
          <Button
            variant="primary"
            disabled={!canSave || createPublish.isPending || updatePublish.isPending}
            onClick={() => (publish ? updatePublish.mutate() : createPublish.mutate())}
          >
            {createPublish.isPending || updatePublish.isPending
              ? "保存中…"
              : publish
                ? "保存设置"
                : "发布并生成短链"}
          </Button>
        </div>
      }
    >
      <div className="sg-grid" style={{ gridTemplateColumns: "1fr 1fr", gap: 24 }}>
        <div className="sg-col">
          <div>
            <h3 className="sg-h3">访问方式</h3>
            <div className="sg-col sg-mt-sm">
              {ACCESS_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className="sg-card"
                  style={{
                    textAlign: "left",
                    cursor: "pointer",
                    borderColor: visibility === option.id ? "var(--sg-accent)" : undefined,
                    background: visibility === option.id ? "var(--sg-accent-soft)" : undefined,
                  }}
                  onClick={() => setVisibility(option.id)}
                >
                  <strong>{option.label}</strong>
                  <div className="sg-subtle">{option.description}</div>
                </button>
              ))}
            </div>
          </div>

          <Field
            label="分享短链"
            hint={publish ? "短链保持不变，更新权限或内容不会改变链接" : "发布后生成稳定短链"}
          >
            <Input readOnly value={shareUrl || `${PUBLIC_GATEWAY_BASE}/s/自动生成`} />
          </Field>

          {visibility === "password" ? (
            <Field
              label={publish?.visibility === "password" ? "更新访问密码（可选）" : "访问密码"}
              hint={publish?.visibility === "password" ? "留空则继续使用当前密码" : "至少 4 个字符"}
            >
              <Input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder={
                  publish?.visibility === "password" ? "留空保持当前密码" : "设置访问密码"
                }
              />
            </Field>
          ) : null}

          <Field label="有效期（可选）" hint="到期后短链将无法访问">
            <Input
              type="datetime-local"
              value={expiresAt}
              onChange={(event) => setExpiresAt(event.target.value)}
            />
            {isExpiredDate ? <span className="sg-error">有效期必须晚于当前时间</span> : null}
          </Field>
        </div>

        <div className="sg-col">
          <div>
            <h3 className="sg-h3">访问限制</h3>
            <div className="sg-option-row">
              <span>允许下载源文件及附件</span>
              <Switch checked={allowDownload} onChange={setAllowDownload} />
            </div>
            <div className="sg-option-row">
              <span>允许复制正文</span>
              <Switch checked={allowCopy} onChange={setAllowCopy} />
            </div>
            {!allowCopy ? <p className="sg-hint">将阻止公开页面中的常规复制操作。</p> : null}
          </div>

          <div>
            <h3 className="sg-h3">分享链接</h3>
            {publish ? (
              <div className="sg-col sg-mt-sm">
                <a href={shareUrl} target="_blank" rel="noreferrer">
                  {shareUrl}
                </a>
                <div className="sg-row sg-wrap">
                  <Button size="sm" variant="primary" onClick={() => void copyLink()}>
                    {copied ? "已复制" : "复制链接"}
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => window.open(shareUrl, "_blank", "noopener,noreferrer")}
                  >
                    打开链接
                  </Button>
                  <Button size="sm" onClick={() => void downloadPoster(shareUrl)}>
                    下载海报
                  </Button>
                  <Button size="sm" onClick={() => void copyEmbedCode()}>
                    复制嵌入代码
                  </Button>
                  <Button size="sm" onClick={emailShare}>
                    邮件分享
                  </Button>
                </div>
                {qrUrl ? (
                  <img
                    src={qrUrl}
                    alt="分享链接二维码"
                    style={{ width: 150, height: 150, borderRadius: 8 }}
                  />
                ) : null}
              </div>
            ) : (
              <p className="sg-hint">发布后可复制短链、获取二维码、下载海报或嵌入页面。</p>
            )}
          </div>

          {publish ? (
            <div className="sg-option-row">
              <span>访问次数</span>
              <span>{publish.viewCount.toLocaleString("zh-CN")}</span>
            </div>
          ) : null}
        </div>
      </div>
    </Modal>
  );
}
