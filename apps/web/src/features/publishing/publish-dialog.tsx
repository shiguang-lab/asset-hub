import { Field, Scrollbar, useToast } from "@shiguang/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Input, Modal, Switch } from "antd";
import { createStyles } from "antd-style";
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

interface PublishReference {
  id: string;
  title: string;
  type: string;
  visibility: string;
}

const ACCESS_OPTIONS: Array<{ id: ShareVisibility; label: string; description: string }> = [
  { id: "link", label: "链接访问", description: "获得链接的人可查看，不会被搜索引擎收录" },
  { id: "password", label: "密码访问", description: "获得链接并输入正确密码的人可查看" },
  { id: "public", label: "公开访问", description: "任何人可访问，并允许被搜索引擎收录" },
];

const usePublishDialogStyles = createStyles(({ token }) => {
  const visual = token as typeof token & Record<string, string>;
  return {
    draftActions: { marginBottom: 12, textAlign: "right" },
    layout: {
      gridTemplateColumns: "1fr 1fr",
      gap: 24,
      "@media (max-width: 760px)": { gridTemplateColumns: "1fr", gap: 16 },
    },
    accessOption: {
      display: "block",
      width: "100%",
      border: "1px solid transparent",
      color: "inherit",
      textAlign: "left",
      cursor: "pointer",
      transition: "border-color 160ms ease, background 160ms ease, box-shadow 160ms ease",
    },
    accessOptionActive: {
      borderColor: visual.colorAccent ?? "#7c3cff",
      background: visual.colorAccentSoft ?? "rgba(124, 60, 255, 0.14)",
      boxShadow: `0 0 0 1px ${visual.colorAccent ?? "#7c3cff"}`,
    },
    qr: { width: 150, height: 150, borderRadius: 8 },
    references: { maxHeight: 260 },
    reference: { padding: 12 },
  };
});

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
  const { styles, cx } = usePublishDialogStyles();
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
  const [referenceConfirmOpen, setReferenceConfirmOpen] = useState(false);
  const [referenceDecision, setReferenceDecision] = useState<boolean | null>(null);
  const lastSyncedPublishId = useRef<string | null>(null);

  const { data: existingPublishes = [] } = useQuery<Publish[]>({
    queryKey: ["publishes", asset.id],
    queryFn: () => api<Publish[]>("/publishes", { params: { assetId: asset.id } }),
    enabled: open,
  });
  const { data: referenceData, isLoading: referencesLoading } = useQuery<{
    references: PublishReference[];
  }>({
    queryKey: ["publish-references", asset.id],
    queryFn: () => api(`/assets/${asset.id}/publish-references`),
    enabled: open,
  });
  const references = referenceData?.references ?? [];
  const existingPublish = existingPublishes.find((publish) => publish.status === "active") ?? null;
  const publish = activePublish ?? existingPublish;
  const shareUrl = publish?.shortUrl ?? "";

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
    setReferenceConfirmOpen(false);
    setReferenceDecision(null);
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
    mutationFn: (allowPrivateReferences: boolean) =>
      api<Publish>("/publishes", {
        method: "POST",
        body: { assetId: asset.id, ...settingsPayload(), allowPrivateReferences },
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
    mutationFn: (allowPrivateReferences: boolean) =>
      api<Publish>(`/publishes/${publish?.id}`, {
        method: "PATCH",
        body: { ...settingsPayload(), allowPrivateReferences },
      }),
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

  const submitPublish = () => {
    if (references.length > 0 && referenceDecision === null) {
      setReferenceConfirmOpen(true);
      return;
    }
    const allowPrivateReferences = referenceDecision ?? false;
    if (publish) updatePublish.mutate(allowPrivateReferences);
    else createPublish.mutate(allowPrivateReferences);
  };

  const confirmReferenceDecision = (allowPrivateReferences: boolean) => {
    setReferenceDecision(allowPrivateReferences);
    setReferenceConfirmOpen(false);
    if (publish) updatePublish.mutate(allowPrivateReferences);
    else createPublish.mutate(allowPrivateReferences);
  };

  return (
    <Modal
      open={open}
      // Keep the dialog under the app style boundary. The publish form uses
      // shared `sg-*` utility classes whose styles and theme variables are
      // intentionally scoped to that boundary; rendering the modal into
      // document.body would leave those classes unstyled.
      getContainer={false}
      onCancel={onClose}
      title={publish ? "分享设置" : "发布并分享"}
      width={820}
      destroyOnHidden
      onOk={submitPublish}
      okText={publish ? "保存设置" : "发布并生成短链"}
      cancelText="取消"
      confirmLoading={createPublish.isPending || updatePublish.isPending}
      okButtonProps={{ disabled: !canSave || referencesLoading }}
    >
      {!publish ? (
        <div className={styles.draftActions}>
          <Button type="link" onClick={saveDraft}>
            保存草稿
          </Button>
        </div>
      ) : null}
      <div className={`sg-grid ${styles.layout}`}>
        <div className="sg-col">
          <div>
            <h3 className="sg-h3">访问方式</h3>
            <div className="sg-col sg-mt-sm">
              {ACCESS_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className={cx(
                    "sg-card",
                    styles.accessOption,
                    visibility === option.id && styles.accessOptionActive,
                  )}
                  aria-pressed={visibility === option.id}
                  style={
                    visibility === option.id
                      ? {
                          border: "1px solid var(--sg-accent)",
                          background: "var(--sg-accent-soft)",
                          boxShadow: "0 0 0 1px var(--sg-accent)",
                        }
                      : undefined
                  }
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
                  <Button size="small" type="primary" onClick={() => void copyLink()}>
                    {copied ? "已复制" : "复制链接"}
                  </Button>
                  <Button
                    size="small"
                    onClick={() => window.open(shareUrl, "_blank", "noopener,noreferrer")}
                  >
                    打开链接
                  </Button>
                </div>
                {qrUrl ? <img src={qrUrl} alt="分享链接二维码" className={styles.qr} /> : null}
              </div>
            ) : (
              <p className="sg-hint">发布后可复制短链、打开链接或获取二维码。</p>
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
      <Modal
        open={referenceConfirmOpen}
        getContainer={false}
        title="确认发布关联资源"
        onCancel={() => confirmReferenceDecision(false)}
        onOk={() => confirmReferenceDecision(true)}
        cancelText="仅发布当前文档"
        okText="一起发布并允许访问"
        confirmLoading={createPublish.isPending || updatePublish.isPending}
        width={560}
        destroyOnHidden
      >
        <p className="sg-subtle">
          当前文档引用了以下资源。选择“一起发布”会把它们纳入本次发布快照；选择“仅发布当前文档”不会阻止当前文档发布，但这些引用在公开页面中不可访问。
        </p>
        <Scrollbar className={`sg-col ${styles.references}`}>
          {references.map((reference) => (
            <div key={reference.id} className={`sg-row-between sg-card ${styles.reference}`}>
              <span>{reference.title}</span>
              <span className="sg-subtle">
                {reference.visibility === "private" ? "私有" : "已公开"} · {reference.type}
              </span>
            </div>
          ))}
        </Scrollbar>
      </Modal>
    </Modal>
  );
}
