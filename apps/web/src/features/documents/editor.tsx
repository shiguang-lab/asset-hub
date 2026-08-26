import { autocompletion } from "@codemirror/autocomplete";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import {
  bracketMatching,
  defaultHighlightStyle,
  indentOnInput,
  syntaxHighlighting,
} from "@codemirror/language";
import { Compartment, EditorState } from "@codemirror/state";
import { EditorView, highlightActiveLine, keymap, lineNumbers } from "@codemirror/view";
import { Empty, Scrollbar, useToast } from "@shiguang/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { MenuProps } from "antd";
import { Button, Card, Dropdown, Input, Modal, Select, Switch, Tabs } from "antd";
import { createStyles } from "antd-style";
import {
  Download,
  FileDiff,
  ImagePlus,
  Link2,
  MoreHorizontal,
  Paperclip,
  RefreshCcw,
  Share2,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  type Asset,
  api,
  downloadFile,
  publishedShortUrl,
  uploadFile,
} from "../../entities/api.js";
import { loadDocumentLocal, saveDocumentLocal } from "../../shared/document-local.js";
import { DocumentMarkdown } from "../../shared/document-markdown.js";
import { loadDraft, markSynced, saveDraft } from "../../shared/draft.js";
import { useDeleteConfirm } from "../../shared/useDeleteConfirm";
import { useShellBreadcrumb } from "../../shell/layout.js";
import { PublishDialog } from "../publishing/publish-dialog.js";

type Mode = "edit" | "split" | "preview";
type SaveState = "saved" | "saving" | "failed";

interface DocumentVersion {
  id: string;
  sequence: number;
  changeKind: string;
  createdAt: string;
  contentHash: string;
}

interface DiffBlock {
  kind: "add" | "remove" | "modify" | "unchanged";
  id: string;
  label: string;
  text: string;
  oldText?: string;
}

interface VersionDiffResponse {
  baseVersionId: string;
  targetVersionId: string;
  diff: {
    added: number;
    removed: number;
    modified: number;
    unchanged: number;
    blocks: DiffBlock[];
  };
}

interface LocalAttachment {
  id: string;
  assetId?: string;
  name: string;
  size: number;
  type: string;
  dataUrl?: string;
  createdAt: string;
}

interface LocalChart {
  id: string;
  name: string;
  type: string;
  createdAt: string;
}

interface AssetRelationRow {
  relation: { relationType: string; targetAssetId: string };
  asset: Asset | null;
  direction: "in" | "out";
}

const useDocumentEditorStyles = createStyles(({ token }) => ({
  header: {
    marginBottom: 10,
  },
  titleRow: {
    flex: 1,
    minWidth: 0,
  },
  titleInput: {
    border: "none",
    background: "transparent",
    fontSize: 18,
    fontWeight: 700,
    color: token.colorText,
    outline: "none",
    width: "100%",
  },
  sectionTitle: {
    margin: 0,
  },
  chartMeta: {
    marginLeft: 8,
  },
  attachmentRow: {
    minWidth: 0,
  },
  attachmentName: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  versionItem: {
    padding: "10px 0",
    borderBottom: `1px solid ${token.colorBorder}`,
  },
  versionMeta: {
    marginLeft: 8,
  },
  versionActions: {
    gap: 6,
  },
  diffTitle: {
    fontSize: 14,
  },
  diffStats: {
    fontSize: 12,
  },
  diffBlocks: {
    gap: 4,
  },
  diffBlock: {
    padding: "6px 10px",
    borderRadius: 6,
    fontSize: 13,
  },
  diffOld: {
    opacity: 0.7,
  },
  diffNew: {
    textDecoration: "none",
    fontWeight: 600,
  },
  aiLabel: {
    marginLeft: 8,
  },
  editorFooter: {
    padding: "8px 4px 0",
    fontSize: 12,
    color: token.colorTextSecondary,
  },
  picker: {
    gap: 12,
  },
  pickerResults: {
    gap: 6,
    maxHeight: 360,
  },
  pickerItem: {
    textAlign: "left",
    cursor: "pointer",
  },
  aiPreview: {
    minHeight: 260,
  },
}));

const useOutlineItemStyles = createStyles(({ token }, props: { paddingLeft: number }) => ({
  item: {
    paddingLeft: props.paddingLeft,
    fontSize: 12.5,
    paddingTop: 3,
    paddingBottom: 3,
    color: token.colorTextSecondary,
  },
}));

function OutlineItem({
  paddingLeft,
  children,
}: {
  paddingLeft: number;
  children: React.ReactNode;
}) {
  const { styles } = useOutlineItemStyles({ paddingLeft });
  return <div className={styles.item}>{children}</div>;
}

const useSaveBadgeStyles = createStyles(({ token }, props: { state: SaveState }) => ({
  badge: {
    color:
      props.state === "saved"
        ? token.colorSuccess
        : props.state === "saving"
          ? token.colorTextSecondary
          : token.colorError,
  },
}));

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function DocumentEditorPage() {
  const { id } = useParams<{ id: string }>();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { confirmDelete } = useDeleteConfirm();
  const queryClient = useQueryClient();
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const [mode, setMode] = useState<Mode>("edit");
  const [tab, setTab] = useState("内容编辑");
  const [title, setTitle] = useState(params.get("title") ?? "");
  const [content, setContent] = useState("");
  const [contentLoadKey, setContentLoadKey] = useState(0);
  const [contentReady, setContentReady] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [aiModal, setAiModal] = useState(false);
  const [aiResult, setAiResult] = useState<{ patchId: string; proposed: string } | null>(null);
  const [publishOpen, setPublishOpen] = useState(false);
  const { styles } = useDocumentEditorStyles();
  const [attachmentPublishAsset, setAttachmentPublishAsset] = useState<Asset | null>(null);
  const [chartModal, setChartModal] = useState(false);
  const [chartName, setChartName] = useState("");
  const [chartType, setChartType] = useState("bar");
  const [attachments, setAttachments] = useState<LocalAttachment[]>([]);
  const [attachmentUploading, setAttachmentUploading] = useState(false);
  const [charts, setCharts] = useState<LocalChart[]>([]);
  const [linkPickerOpen, setLinkPickerOpen] = useState(false);
  const [linkPickerMode, setLinkPickerMode] = useState<"link" | "image">("link");
  const [linkQuery, setLinkQuery] = useState("");
  const [_dirty, setDirty] = useState(false);
  const draftBaseRef = useRef<string>("");
  const lockVersionRef = useRef(1);
  const selfSavedVersionRef = useRef<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const patchQueueRef = useRef<Promise<void>>(Promise.resolve());
  const attachmentInputRef = useRef<HTMLInputElement>(null);
  const localReadyRef = useRef<string | null>(null);

  useShellBreadcrumb("文档", title || "未命名文档");

  const { data: asset, refetch } = useQuery<Asset>({
    queryKey: ["asset", id],
    queryFn: () => api<Asset>(`/assets/${id}`),
    enabled: Boolean(id),
  });

  const toggleVisibility = useMutation({
    mutationFn: (visibility: "private" | "public") =>
      api<Asset>(`/assets/${id}`, { method: "PATCH", body: { visibility } }),
    onSuccess: (updated) => {
      toast("success", updated.visibility === "public" ? "文档已设为公开" : "文档已设为私有");
      void refetch();
      void queryClient.invalidateQueries({ queryKey: ["assets"] });
    },
    onError: (error: Error) => toast("error", error.message),
  });

  const { data: linkPickerData } = useQuery<{ items: Asset[] }>({
    queryKey: ["asset-picker", linkQuery, linkPickerMode],
    queryFn: () =>
      api<{ items: Asset[] }>("/assets", {
        params: {
          q: linkQuery || undefined,
          type: linkPickerMode === "image" ? "file" : undefined,
          limit: 20,
        },
      }),
    enabled: linkPickerOpen,
  });

  const { data: versions = [] } = useQuery<DocumentVersion[]>({
    queryKey: ["asset-versions", id],
    queryFn: () => api<DocumentVersion[]>(`/assets/${id}/versions`),
    enabled: Boolean(id),
  });

  const [diffVersionId, setDiffVersionId] = useState<string | null>(null);
  const { data: diffData, isFetching: diffLoading } = useQuery<VersionDiffResponse>({
    queryKey: ["asset-version-diff", id, diffVersionId],
    queryFn: () => api<VersionDiffResponse>(`/assets/${id}/versions/${diffVersionId}/diff`),
    enabled: Boolean(id && diffVersionId),
  });

  const { data: serverAttachments } = useQuery<LocalAttachment[]>({
    queryKey: ["document-attachments", id],
    queryFn: async () => {
      const relations = await api<AssetRelationRow[]>(`/assets/${id}/relations`);
      const fileAssets = relations
        .filter(
          (row) =>
            row.direction === "out" &&
            row.relation.relationType === "references" &&
            row.asset?.type === "file" &&
            !row.asset.deletedAt,
        )
        .map((row) => row.asset as Asset);
      const assets = await Promise.all(fileAssets.map((file) => api<Asset>(`/assets/${file.id}`)));
      return assets.map((file) => {
        const ref = file.content?.refs?.[0];
        return {
          id: file.id,
          assetId: file.id,
          name: file.title,
          size: ref?.size ?? 0,
          type: ref?.mediaType ?? "application/octet-stream",
          createdAt: file.createdAt,
        };
      });
    },
    enabled: Boolean(id),
  });

  useEffect(() => {
    if (!serverAttachments) return;
    setAttachments((current) => {
      const legacy = current.filter((item) => !item.assetId);
      return [...serverAttachments, ...legacy];
    });
  }, [serverAttachments]);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    localReadyRef.current = null;
    void Promise.all([
      loadDocumentLocal<LocalAttachment[]>(`${id}:attachments`, []),
      loadDocumentLocal<LocalChart[]>(`${id}:charts`, []),
    ])
      .then(([savedAttachments, savedCharts]) => {
        if (cancelled) return;
        localReadyRef.current = id;
        setAttachments((current) => {
          const merged = new Map(
            [...savedAttachments, ...current].map((attachment) => [attachment.id, attachment]),
          );
          return [...merged.values()];
        });
        setCharts(savedCharts);
      })
      .catch(() => {
        if (!cancelled) localReadyRef.current = id;
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    if (!id || localReadyRef.current !== id) return;
    void saveDocumentLocal(`${id}:attachments`, attachments).catch(() => undefined);
  }, [attachments, id]);
  useEffect(() => {
    if (!id || localReadyRef.current !== id) return;
    void saveDocumentLocal(`${id}:charts`, charts).catch(() => undefined);
  }, [charts, id]);

  const createMutation = useMutation({
    mutationFn: () =>
      api<Asset>("/assets", {
        method: "POST",
        body: { type: "document", title: title || "未命名文档", content: { markdown: "" } },
      }),
    onSuccess: (asset) => {
      navigate(`/documents/${asset.id}`, { replace: true });
      void queryClient.invalidateQueries({ queryKey: ["assets"] });
    },
  });

  const restoreMutation = useMutation({
    mutationFn: (versionId: string) =>
      api<Asset>(`/assets/${id}/versions/${versionId}/restore`, { method: "POST" }),
    onSuccess: () => {
      toast("success", "已恢复该版本");
      void refetch();
      void queryClient.invalidateQueries({ queryKey: ["asset-versions", id] });
    },
    onError: (error: Error) => toast("error", error.message),
  });

  useEffect(() => {
    if (!id) {
      createMutation.mutate();
      return;
    }
    if (!asset) return;
    lockVersionRef.current = asset.lockVersion;
    if (asset.currentVersionId && selfSavedVersionRef.current === asset.currentVersionId) {
      selfSavedVersionRef.current = null;
      return;
    }
    let cancelled = false;
    setContentReady(false);
    setTitle(asset.title);
    const serverText = asset.content?.text ?? "";
    void loadDraft("dev-user", id).then((draft) => {
      if (cancelled) return;
      if (draft && draft.baseVersionId === asset.currentVersionId && draft.content !== serverText) {
        toast("info", "已恢复本地未同步的草稿");
        setContent(draft.content);
      } else {
        setContent(serverText);
      }
      draftBaseRef.current = asset.currentVersionId ?? "";
      setDirty(false);
      setContentReady(true);
      setContentLoadKey((current) => current + 1);
    });
    return () => {
      cancelled = true;
    };
  }, [id, asset?.currentVersionId]);

  useEffect(() => {
    if (asset && params.get("publish") === "1") setPublishOpen(true);
  }, [asset, params]);

  const _applyContent = useCallback((text: string) => {
    const view = viewRef.current;
    if (view) {
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } });
    } else {
      setContent(text);
    }
  }, []);

  const _insertAtCursor = useCallback((text: string) => {
    const view = viewRef.current;
    if (view) {
      const { from } = view.state.selection.main;
      view.dispatch({
        changes: { from, insert: text },
        selection: { anchor: from + text.length },
      });
      view.focus();
    } else {
      setContent((current) => current + text);
    }
  }, []);

  const openLinkPicker = (mode: "link" | "image") => {
    setLinkPickerMode(mode);
    setLinkQuery("");
    setLinkPickerOpen(true);
  };

  const insertReference = (target: Asset) => {
    const label = target.title || "未命名";
    const snippet =
      linkPickerMode === "image"
        ? `![${label}](asset:${target.id})`
        : `[${label}](asset:${target.id})`;
    _insertAtCursor(snippet);
    setLinkPickerOpen(false);
    toast("success", linkPickerMode === "image" ? "图片引用已插入" : "文档引用已插入");
  };

  const patchAsset = useCallback(
    (body: { title?: string; content?: { markdown: string } }): Promise<Asset> => {
      if (!id) return Promise.reject(new Error("文档不存在"));
      const request = patchQueueRef.current.then(async () => {
        const updated = await api<Asset>(`/assets/${id}`, {
          method: "PATCH",
          headers: { "if-match": `"${lockVersionRef.current}"` },
          body,
        });
        lockVersionRef.current = updated.lockVersion;
        return updated;
      });
      patchQueueRef.current = request.then(
        () => undefined,
        () => undefined,
      );
      return request;
    },
    [id],
  );

  const saveTitle = async () => {
    const nextTitle = title.trim();
    if (!id || !nextTitle || nextTitle === asset?.title) return;
    try {
      const updated = await patchAsset({ title: nextTitle });
      queryClient.setQueryData<Asset>(["asset", id], (current) => ({
        ...(current ?? updated),
        ...updated,
        content: current?.content ?? updated.content,
      }));
      toast("success", "标题已保存");
      void queryClient.invalidateQueries({ queryKey: ["asset", id] });
    } catch (error) {
      toast("error", error instanceof Error ? error.message : "标题保存失败");
    }
  };

  const exportMarkdown = () => {
    const url = URL.createObjectURL(new Blob([content], { type: "text/markdown;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${title || "未命名文档"}.md`;
    anchor.click();
    URL.revokeObjectURL(url);
    toast("success", "Markdown 已导出");
  };

  const copyPublishedLink = async () => {
    if (!asset) return;
    const shortUrl = await publishedShortUrl(asset.id);
    if (!shortUrl) {
      toast("info", "该文档尚未发布，请先发布后再复制链接");
      return;
    }
    await navigator.clipboard?.writeText(shortUrl);
    toast("success", "链接已复制");
  };

  const insertChart = () => {
    const name = chartName.trim() || "未命名图表";
    const chart: LocalChart = {
      id: crypto.randomUUID(),
      name,
      type: chartType,
      createdAt: new Date().toISOString(),
    };
    setCharts((current) => [chart, ...current]);
    const block = `\n\n### ${name}\n\n> 图表类型：${chartType}\n`;
    _applyContent(`${content}${block}`);
    setChartName("");
    setChartModal(false);
    toast("success", "图表已插入文档");
  };

  const handleAttachment = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > 100 * 1024 * 1024) {
      toast("error", "附件不能超过 100MB");
      return;
    }
    if (!id) return;
    setAttachmentUploading(true);
    try {
      const uploaded = await uploadFile<Asset>("/assets/files", file);
      await api(`/assets/${id}/relations`, {
        method: "POST",
        body: { targetAssetId: uploaded.id, relationType: "references" },
      });
      const ref = uploaded.content?.refs?.[0];
      setAttachments((current) => [
        {
          id: uploaded.id,
          assetId: uploaded.id,
          name: uploaded.title,
          size: ref?.size ?? file.size,
          type: ref?.mediaType ?? file.type ?? "application/octet-stream",
          createdAt: uploaded.createdAt,
        },
        ...current,
      ]);
      void queryClient.invalidateQueries({ queryKey: ["assets"] });
      void queryClient.invalidateQueries({ queryKey: ["document-attachments", id] });
      toast("success", "附件已添加");
    } catch (error) {
      toast("error", error instanceof Error ? error.message : "附件上传失败");
    } finally {
      setAttachmentUploading(false);
    }
  };

  const downloadAttachment = async (attachment: LocalAttachment) => {
    try {
      if (attachment.assetId) {
        await downloadFile(`/assets/${attachment.assetId}/download`, attachment.name);
        return;
      }
      if (!attachment.dataUrl) throw new Error("附件内容不存在");
      const anchor = document.createElement("a");
      anchor.href = attachment.dataUrl;
      anchor.download = attachment.name;
      anchor.click();
    } catch (error) {
      toast("error", error instanceof Error ? error.message : "附件下载失败");
    }
  };

  const shareAttachment = async (attachment: LocalAttachment) => {
    if (!attachment.assetId) {
      toast("info", "请重新上传该本地附件后再分享");
      return;
    }
    try {
      setAttachmentPublishAsset(await api<Asset>(`/assets/${attachment.assetId}`));
    } catch (error) {
      toast("error", error instanceof Error ? error.message : "附件读取失败");
    }
  };

  const removeAttachment = async (attachment: LocalAttachment) => {
    try {
      if (attachment.assetId) {
        await api(`/assets/${attachment.assetId}`, { method: "DELETE" });
        void queryClient.invalidateQueries({ queryKey: ["assets"] });
        void queryClient.invalidateQueries({ queryKey: ["document-attachments", id] });
      }
      setAttachments((current) => current.filter((item) => item.id !== attachment.id));
      toast("success", "附件已删除");
    } catch (error) {
      toast("error", error instanceof Error ? error.message : "附件删除失败");
    }
  };

  useEffect(() => {
    if (!editorRef.current || !id || tab !== "内容编辑" || !contentReady) return;
    const langConf = new Compartment();
    const state = EditorState.create({
      doc: content,
      extensions: [
        lineNumbers(),
        highlightActiveLine(),
        history(),
        bracketMatching(),
        indentOnInput(),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        autocompletion(),
        langConf.of(markdown({ base: markdownLanguage })),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            const text = update.state.doc.toString();
            setContent(text);
            setSaveState("saving");
            setDirty(true);
            if (id)
              void saveDraft({
                key: `dev-user:${id}`,
                assetId: id,
                baseVersionId: draftBaseRef.current,
                content: text,
              });
            if (saveTimer.current) clearTimeout(saveTimer.current);
            saveTimer.current = setTimeout(() => void persist(text), 900);
          }
        }),
      ],
    });
    const view = new EditorView({ state, parent: editorRef.current });
    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, [contentLoadKey, contentReady, id, tab]);

  const persist = async (text: string) => {
    if (!id) return;
    try {
      const updated = await patchAsset({ content: { markdown: text } });
      selfSavedVersionRef.current = updated.currentVersionId;
      draftBaseRef.current = updated.currentVersionId ?? "";
      setSaveState("saved");
      setDirty(false);
      await markSynced("dev-user", id, updated.currentVersionId ?? "");
      queryClient.setQueryData<Asset>(["asset", id], (current) => ({
        ...(current ?? updated),
        ...updated,
        content: current?.content ?? updated.content,
      }));
      void queryClient.invalidateQueries({ queryKey: ["asset", id] });
    } catch (err) {
      setSaveState("failed");
      toast("error", err instanceof Error ? err.message : "保存失败，已保留本地草稿");
    }
  };

  const aiAction = useMutation({
    mutationFn: (action: string) => {
      const view = viewRef.current;
      const selection = view
        ? view.state.sliceDoc(view.state.selection.main.from, view.state.selection.main.to)
        : "";
      return api<{ patchId: string; proposed: string }>(`/assets/${id}/ai-action`, {
        method: "POST",
        body: { action, selection: selection || content.slice(0, 2000) },
      });
    },
    onSuccess: (data) => {
      setAiResult(data);
      setAiModal(true);
    },
    onError: (e: Error) => toast("error", e.message),
  });

  const applyPatch = useMutation({
    mutationFn: (patchId: string) =>
      api<Asset>(`/assets/${id}/patches/${patchId}/apply`, { method: "POST" }),
    onSuccess: () => {
      toast("success", "AI 修改已应用");
      setAiModal(false);
      void refetch();
    },
  });

  const headings = useMemo(
    () =>
      content
        .split("\n")
        .filter((line) => /^#{1,4}\s+/.test(line))
        .map((line) => {
          const level = line.match(/^#+/)?.[0].length ?? 1;
          return { level, text: line.replace(/^#+\s*/, "") };
        }),
    [content],
  );

  return (
    <div className={`sg-document-editor-page ${tab === "内容编辑" ? "is-content-editing" : ""}`}>
      <div className={`sg-row-between ${styles.header}`}>
        <div className={`sg-row ${styles.titleRow}`}>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => void saveTitle()}
            placeholder="文档标题"
            className={styles.titleInput}
          />
        </div>
        <div className="sg-row">
          <SaveBadge state={saveState} />
          {asset ? (
            <span className="sg-row" title="独立控制文档本身的公有/私有状态">
              <Switch
                size="small"
                checked={asset.visibility === "public"}
                checkedChildren="公开"
                unCheckedChildren="私有"
                loading={toggleVisibility.isPending}
                onChange={(checked) => toggleVisibility.mutate(checked ? "public" : "private")}
              />
            </span>
          ) : null}
          <Button size="small" onClick={() => navigate(`/documents/${id}/preview`)}>
            ◎ 预览
          </Button>
          <Button size="small" onClick={() => setPublishOpen(true)}>
            发布 / 分享
          </Button>
          <Dropdown
            trigger={["hover"]}
            mouseEnterDelay={0}
            mouseLeaveDelay={0.15}
            placement="bottomRight"
            menu={{
              items: [
                { key: "copy", label: "复制发布链接" },
                { key: "export", label: "导出 Markdown" },
                { key: "presentation", label: "生成演示" },
                { key: "asset", label: "查看资产详情" },
                { key: "delete", label: "删除文档", danger: true },
              ] satisfies MenuProps["items"],
              onClick: ({ key }) => {
                if (key === "copy") void copyPublishedLink();
                if (key === "export") exportMarkdown();
                if (key === "presentation") navigate(`/presentations/new?asset=${id}`);
                if (key === "asset") navigate(`/assets/${id}`);
                if (key === "delete" && id) {
                  confirmDelete({
                    title: `删除文档「${title || id}」？`,
                    content: "删除后可在回收站恢复。",
                    onConfirm: async () => {
                      try {
                        await api(`/assets/${id}`, { method: "DELETE" });
                        toast("success", "文档已移入回收站");
                        navigate("/documents");
                      } catch (error) {
                        toast("error", error instanceof Error ? error.message : "删除失败");
                      }
                    },
                  });
                }
              },
            }}
          >
            <button type="button" className="sg-asset-more" aria-label="更多操作" title="更多操作">
              <MoreHorizontal size={16} />
            </button>
          </Dropdown>
        </div>
      </div>

      <Tabs
        items={["内容编辑", "图表管理", "附件管理", "版本历史"].map((t) => ({ key: t, label: t }))}
        activeKey={tab}
        onChange={setTab}
      />

      {tab === "图表管理" && (
        <Card className="sg-mb">
          <div className="sg-row-between sg-mb-sm">
            <h3 className={`sg-h3 ${styles.sectionTitle}`}>全部图表（{charts.length}）</h3>
            <div className="sg-row">
              <Button size="small" type="primary" onClick={() => setChartModal(true)}>
                + 新建图表
              </Button>
            </div>
          </div>
          {charts.length === 0 ? (
            <Empty title="还没有图表" hint="新建图表后会插入正文，并保存在当前文档中。" />
          ) : (
            <div className="sg-col">
              {charts.map((chart) => (
                <div key={chart.id} className="sg-row-between sg-card">
                  <div>
                    <strong>{chart.name}</strong>
                    <span className={`sg-subtle ${styles.chartMeta}`}>
                      {chart.type} ·{" "}
                      {new Date(chart.createdAt).toLocaleString("zh-CN", { hour12: false })}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="sg-asset-more"
                    aria-label="删除图表"
                    onClick={() =>
                      setCharts((current) => current.filter((item) => item.id !== chart.id))
                    }
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {tab === "附件管理" && (
        <Card className="sg-mb">
          <div className="sg-row-between sg-mb-sm">
            <h3 className={`sg-h3 ${styles.sectionTitle}`}>附件管理（{attachments.length}）</h3>
            <Button
              size="small"
              type="primary"
              disabled={attachmentUploading}
              onClick={() => attachmentInputRef.current?.click()}
            >
              <Paperclip size={15} /> {attachmentUploading ? "上传中…" : "添加附件"}
            </Button>
            <input
              ref={attachmentInputRef}
              type="file"
              hidden
              onChange={(event) => {
                void handleAttachment(event.target.files?.[0]);
                event.target.value = "";
              }}
            />
          </div>
          {attachments.length === 0 ? (
            <Empty
              title="还没有附件"
              hint="支持 APK、XLSX、PNG、PDF 等格式，单个文件最大 200MB。"
            />
          ) : (
            <div className="sg-col">
              {attachments.map((attachment) => (
                <div key={attachment.id} className="sg-row-between sg-card">
                  <div className={`sg-row ${styles.attachmentRow}`}>
                    <Paperclip size={16} />
                    <span className={styles.attachmentName}>{attachment.name}</span>
                    <span className="sg-subtle">{formatBytes(attachment.size)}</span>
                  </div>
                  <div className="sg-row">
                    <button
                      type="button"
                      className="sg-asset-more"
                      aria-label="分享附件"
                      disabled={!attachment.assetId}
                      onClick={() => void shareAttachment(attachment)}
                    >
                      <Share2 size={15} />
                    </button>
                    <button
                      type="button"
                      className="sg-asset-more"
                      aria-label="下载附件"
                      onClick={() => void downloadAttachment(attachment)}
                    >
                      <Download size={15} />
                    </button>
                    <button
                      type="button"
                      className="sg-asset-more"
                      aria-label="删除附件"
                      onClick={() => void removeAttachment(attachment)}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {tab === "版本历史" && (
        <Card className="sg-mb">
          <h3 className="sg-h3">版本历史</h3>
          {versions.length === 0 ? (
            <div className="sg-mt-sm">
              <Empty title="还没有版本记录" hint="保存文档后会自动生成版本历史。" />
            </div>
          ) : (
            <div className="sg-col sg-mt-sm">
              {versions.map((version) => (
                <div key={version.id} className={`sg-row-between ${styles.versionItem}`}>
                  <div>
                    <strong>v{version.sequence}.0</strong>
                    <span className={`sg-subtle ${styles.versionMeta}`}>
                      {version.changeKind} ·{" "}
                      {new Date(version.createdAt).toLocaleString("zh-CN", { hour12: false })}
                    </span>
                  </div>
                  <div className={`sg-row ${styles.versionActions}`}>
                    {version.id !== asset?.currentVersionId && (
                      <Button
                        size="small"
                        type="text"
                        onClick={() =>
                          setDiffVersionId(diffVersionId === version.id ? null : version.id)
                        }
                        disabled={diffLoading}
                      >
                        <FileDiff size={14} /> 对比
                      </Button>
                    )}
                    {version.id === asset?.currentVersionId ? (
                      <span className="sg-badge sg-badge-success">当前版本</span>
                    ) : (
                      <Button
                        size="small"
                        type="text"
                        onClick={() => restoreMutation.mutate(version.id)}
                        disabled={restoreMutation.isPending}
                      >
                        <RefreshCcw size={14} /> 恢复
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
          {diffData?.diff && (
            <div className="sg-col sg-mt-sm">
              <div className="sg-row-between">
                <strong className={styles.diffTitle}>
                  结构化 Diff
                  {(() => {
                    const baseSeq = versions.find((v) => v.id === diffData.baseVersionId)?.sequence;
                    const targetSeq = versions.find(
                      (v) => v.id === diffData.targetVersionId,
                    )?.sequence;
                    return baseSeq !== undefined && targetSeq !== undefined
                      ? ` · v${baseSeq} → v${targetSeq}`
                      : "";
                  })()}
                </strong>
                <span className={`sg-subtle ${styles.diffStats}`}>
                  +{diffData.diff.added} −{diffData.diff.removed} ~{diffData.diff.modified}
                </span>
              </div>
              <div className={`sg-col sg-mt-sm ${styles.diffBlocks}`}>
                {diffData.diff.blocks
                  .filter((block) => block.kind !== "unchanged")
                  .map((block) => (
                    <div
                      key={block.id}
                      data-kind={block.kind}
                      className={`sg-diff-block ${styles.diffBlock}`}
                    >
                      <span className="sg-diff-label">{block.label || block.id}</span>
                      {block.kind === "modify" ? (
                        <span>
                          <del className={styles.diffOld}>{block.oldText}</del> →{" "}
                          <ins className={styles.diffNew}>{block.text}</ins>
                        </span>
                      ) : (
                        <span>{block.text || "（新增块）"}</span>
                      )}
                    </div>
                  ))}
              </div>
            </div>
          )}
        </Card>
      )}

      {tab === "内容编辑" && (
        <div className="sg-document-editor-layout">
          <Scrollbar className="sg-document-editor-outline sg-editor-right">
            <h4>文档结构</h4>
            {headings.map((h, i) => (
              <OutlineItem key={i} paddingLeft={(h.level - 1) * 10}>
                {h.text}
              </OutlineItem>
            ))}
          </Scrollbar>

          <section className="sg-document-editor-main">
            <div className="sg-editor-toolbar">
              <Button size="small" type="text" onClick={() => openLinkPicker("link")}>
                <Link2 size={14} /> 插入引用
              </Button>
              <Button size="small" type="text" onClick={() => openLinkPicker("image")}>
                <ImagePlus size={14} /> 插入图片
              </Button>
              <span className={`sg-subtle ${styles.aiLabel}`}>AI 选区处理：</span>
              {["rewrite", "summarize", "expand", "translate", "explain"].map((action) => (
                <Button
                  key={action}
                  size="small"
                  type="text"
                  onClick={() => aiAction.mutate(action)}
                >
                  {action === "rewrite"
                    ? "改写"
                    : action === "summarize"
                      ? "精简"
                      : action === "expand"
                        ? "扩写"
                        : action === "translate"
                          ? "翻译"
                          : "解释"}
                </Button>
              ))}
              <div className="mode">
                <button
                  type="button"
                  className={mode === "edit" ? "active" : ""}
                  onClick={() => setMode("edit")}
                >
                  编辑
                </button>
                <button
                  type="button"
                  className={mode === "split" ? "active" : ""}
                  onClick={() => setMode("split")}
                >
                  分屏
                </button>
                <button
                  type="button"
                  className={mode === "preview" ? "active" : ""}
                  onClick={() => setMode("preview")}
                >
                  预览
                </button>
              </div>
            </div>

            <div className={`sg-document-editor-workspace mode-${mode}`}>
              <section className="sg-editor-pane sg-editor-source">
                <div ref={editorRef} className="sg-code-editor-host" />
              </section>
              {mode !== "edit" && (
                <section className="sg-editor-pane sg-editor-rendered">
                  <Scrollbar className="sg-preview">
                    <DocumentMarkdown source={content} />
                  </Scrollbar>
                </section>
              )}
            </div>

            <div className={`sg-row-between ${styles.editorFooter}`}>
              <span>共 {content.length} 字 · 自动保存已开启</span>
              <span>Markdown · 行 1 列 1</span>
            </div>
          </section>
        </div>
      )}

      <Modal
        open={linkPickerOpen}
        onCancel={() => setLinkPickerOpen(false)}
        title={linkPickerMode === "image" ? "选择图片" : "插入文档引用"}
        footer={
          <div className="sg-row">
            <Button onClick={() => setLinkPickerOpen(false)}>取消</Button>
          </div>
        }
        destroyOnHidden
      >
        <div className={`sg-col ${styles.picker}`}>
          <input
            className="sg-input"
            value={linkQuery}
            onChange={(event) => setLinkQuery(event.target.value)}
            placeholder="搜索资产名称…"
          />
          <Scrollbar className={`sg-col ${styles.pickerResults}`}>
            {(linkPickerData?.items?.length ?? 0) === 0 ? (
              <Empty title="没有找到资产" hint="换个关键词试试，或先在资产中心创建。" />
            ) : (
              linkPickerData?.items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`sg-card ${styles.pickerItem}`}
                  onClick={() => insertReference(item)}
                >
                  <strong>{item.title || "未命名"}</strong>
                  <div className="sg-subtle">{item.type}</div>
                </button>
              ))
            )}
          </Scrollbar>
        </div>
      </Modal>

      <Modal
        open={chartModal}
        onCancel={() => setChartModal(false)}
        title="新建图表"
        footer={
          <div className="sg-row">
            <Button onClick={() => setChartModal(false)}>取消</Button>
            <Button type="primary" onClick={insertChart}>
              插入图表
            </Button>
          </div>
        }
        destroyOnHidden
      >
        <div className={`sg-col ${styles.picker}`}>
          <label className="sg-label" htmlFor="document-chart-name">
            图表名称
          </label>
          <input
            id="document-chart-name"
            className="sg-input"
            value={chartName}
            onChange={(event) => setChartName(event.target.value)}
            placeholder="例如：季度收入趋势"
          />
          <label className="sg-label" htmlFor="document-chart-type">
            图表类型
          </label>
          <Select
            value={chartType}
            onChange={setChartType}
            options={[
              { value: "bar", label: "柱状图" },
              { value: "line", label: "折线图" },
              { value: "pie", label: "饼图" },
              { value: "table", label: "数据表" },
            ]}
          />
        </div>
      </Modal>

      <Modal
        open={aiModal}
        onCancel={() => setAiModal(false)}
        title="AI 修改预览"
        footer={
          <div className="sg-row">
            <Button onClick={() => setAiModal(false)}>取消</Button>
            <Button
              type="primary"
              disabled={!aiResult}
              onClick={() => aiResult && applyPatch.mutate(aiResult.patchId)}
            >
              应用修改
            </Button>
          </div>
        }
        width={820}
        destroyOnHidden
      >
        <p className="sg-hint">AI 输出先预览，应用后才会写入文档（不会静默覆盖）。</p>
        <Input.TextArea readOnly value={aiResult?.proposed ?? ""} className={styles.aiPreview} />
      </Modal>

      {publishOpen && asset && (
        <PublishDialog asset={asset} open onClose={() => setPublishOpen(false)} />
      )}
      {attachmentPublishAsset && (
        <PublishDialog
          asset={attachmentPublishAsset}
          open
          onClose={() => setAttachmentPublishAsset(null)}
        />
      )}
    </div>
  );
}

function SaveBadge({ state }: { state: SaveState }) {
  const label = state === "saved" ? "已保存" : state === "saving" ? "保存中…" : "保存失败";
  const { styles } = useSaveBadgeStyles({ state });
  return (
    <span className={`sg-subtle ${styles.badge}`} aria-live="polite">
      {label}
    </span>
  );
}
