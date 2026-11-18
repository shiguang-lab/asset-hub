import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { html } from "@codemirror/lang-html";
import { bracketMatching, indentOnInput } from "@codemirror/language";
import { Compartment, EditorState } from "@codemirror/state";
import { EditorView, highlightActiveLine, keymap, lineNumbers } from "@codemirror/view";
import { useToast } from "@shiguang/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { MenuProps } from "antd";
import { Dropdown } from "antd";
import { ArrowLeft, Globe, Lock, MoreHorizontal, Save, Share2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { type Asset, api, publishedShortUrl } from "../../entities/api.js";
import { auroraEditorExtensions } from "../../shared/codemirror-aurora.js";
import {
  fileNameOf,
  folderPathOf,
  joinFolderPath,
  leafFromTitle,
  normalizeFolderPath,
} from "../../shared/document-path.js";
import { SandboxHtmlPreview } from "../../shared/sandbox-preview.js";
import { useDeleteConfirm } from "../../shared/useDeleteConfirm";
import { useShellBreadcrumb } from "../../shell/layout.js";
import { PublishDialog } from "../publishing/publish-dialog.js";

type HtmlMode = "edit" | "split" | "preview";
type SaveState = "saved" | "saving" | "failed";

const DEFAULT_HTML = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>交互式 HTML 页面</title>
  <style>
    body {
      margin: 0;
      padding: 40px;
      font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif;
      background: #0f172a;
      color: #f8fafc;
    }
    .card {
      max-width: 680px;
      margin: 0 auto;
      padding: 28px 32px;
      border-radius: 18px;
      background: linear-gradient(145deg, rgba(56, 189, 248, 0.14), rgba(168, 85, 247, 0.14));
      border: 1px solid rgba(255, 255, 255, 0.12);
    }
    h1 { margin: 0 0 10px; font-size: 24px; }
    p { margin: 0; color: #cbd5e1; line-height: 1.7; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Hello, 知序</h1>
    <p>在此编写 HTML、CSS 与交互脚本，右侧沙箱将实时渲染运行效果。</p>
  </div>
</body>
</html>`;

function SaveBadge({ state }: { state: SaveState }) {
  const tone = state === "saved" ? "emerald" : state === "saving" ? "amber" : "rose";
  const label = state === "saved" ? "已自动保存" : state === "saving" ? "正在保存…" : "保存失败";
  return (
    <span className={`zx-pill ${tone}`}>
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: "currentColor",
        }}
      />
      {label}
    </span>
  );
}

export function HtmlEditorPage() {
  const { id } = useParams<{ id: string }>();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { confirmDelete } = useDeleteConfirm();
  const queryClient = useQueryClient();
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lockVersionRef = useRef(1);
  const selfSavedVersionRef = useRef<string | null>(null);

  const [mode, setMode] = useState<HtmlMode>(params.get("preview") === "1" ? "preview" : "split");
  const [title, setTitle] = useState(params.get("title") ?? "未命名 HTML 页面");
  const [source, setSource] = useState(DEFAULT_HTML);
  const [sourceLoadKey, setSourceLoadKey] = useState(0);
  const [contentReady, setContentReady] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [publishOpen, setPublishOpen] = useState(false);

  useShellBreadcrumb("文档", title || "未命名 HTML 页面");

  const { data: asset, refetch } = useQuery<Asset>({
    queryKey: ["asset", id],
    queryFn: () => api<Asset>(`/assets/${id}`),
    enabled: Boolean(id),
  });

  const folderPath = normalizeFolderPath(params.get("folder") ?? "");
  const createMutation = useMutation({
    mutationFn: () => {
      const name = title.trim() || "未命名 HTML 页面";
      const path = folderPath ? joinFolderPath(folderPath, leafFromTitle(name)) : "";
      return api<Asset>("/assets", {
        method: "POST",
        body: {
          type: "html",
          title: name,
          ...(path ? { path } : {}),
          content: { html: source },
        },
      });
    },
    onSuccess: (created) => {
      navigate(`/html/${created.id}`, { replace: true });
      void queryClient.invalidateQueries({ queryKey: ["assets"] });
    },
  });

  const toggleVisibility = useMutation({
    mutationFn: (visibility: "private" | "public") =>
      api<Asset>(`/assets/${id}`, { method: "PATCH", body: { visibility } }),
    onSuccess: (updated) => {
      toast("success", updated.visibility === "public" ? "页面已设为公开" : "页面已设为私有");
      void refetch();
      void queryClient.invalidateQueries({ queryKey: ["assets"] });
    },
    onError: (error: Error) => toast("error", error.message),
  });

  const patchAsset = async (body: {
    title?: string;
    path?: string;
    content?: { html: string };
  }) => {
    if (!id) throw new Error("缺少资产 ID");
    const updated = await api<Asset>(`/assets/${id}`, {
      method: "PATCH",
      headers: { "if-match": `"${lockVersionRef.current}"` },
      body,
    });
    lockVersionRef.current = updated.lockVersion;
    return updated;
  };

  const persistSource = async (text: string) => {
    if (!id) return;
    try {
      const updated = await patchAsset({ content: { html: text } });
      selfSavedVersionRef.current = updated.currentVersionId;
      setSaveState("saved");
      queryClient.setQueryData<Asset>(["asset", id], (current) => ({
        ...(current ?? updated),
        ...updated,
        content: current?.content ?? updated.content,
      }));
      void queryClient.invalidateQueries({ queryKey: ["asset", id] });
    } catch (error) {
      setSaveState("failed");
      toast("error", error instanceof Error ? error.message : "保存失败");
    }
  };

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
    setTitle(asset.title);
    setSource(asset.content?.text ?? DEFAULT_HTML);
    setContentReady(true);
    setSourceLoadKey((current) => current + 1);
  }, [id, asset?.currentVersionId]);

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  useEffect(() => {
    if (!editorRef.current || !id || !contentReady || mode === "preview") return;
    const langConf = new Compartment();
    const state = EditorState.create({
      doc: source,
      extensions: [
        lineNumbers(),
        EditorView.lineWrapping,
        highlightActiveLine(),
        history(),
        bracketMatching(),
        indentOnInput(),
        ...auroraEditorExtensions,
        langConf.of(html()),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            const text = update.state.doc.toString();
            setSource(text);
            setSaveState("saving");
            if (saveTimer.current) clearTimeout(saveTimer.current);
            saveTimer.current = setTimeout(() => void persistSource(text), 900);
          }
        }),
        keymap.of([...defaultKeymap, ...historyKeymap]),
      ],
    });
    const view = new EditorView({ state, parent: editorRef.current });
    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, [contentReady, id, mode, sourceLoadKey]);

  const saveTitle = async () => {
    if (!id || !title.trim() || !asset || title.trim() === asset.title) return;
    const trimmed = title.trim();
    const currentFolder = folderPathOf(asset.path);
    const nextPath = currentFolder
      ? joinFolderPath(currentFolder, leafFromTitle(trimmed))
      : undefined;
    try {
      await patchAsset({ title: trimmed, ...(nextPath ? { path: nextPath } : {}) });
      void queryClient.invalidateQueries({ queryKey: ["assets"] });
      void refetch();
      toast("success", "标题已更新");
    } catch (error) {
      toast("error", error instanceof Error ? error.message : "标题更新失败");
    }
  };

  const exportHtml = () => {
    const blob = new Blob([source], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${fileNameOf(title || "page")}.html`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const copyPublishedLink = async () => {
    if (!asset) return;
    const shortUrl = await publishedShortUrl(asset.id);
    if (!shortUrl) {
      toast("info", "该页面尚未发布，请先发布后再复制链接");
      return;
    }
    await navigator.clipboard?.writeText(shortUrl);
    toast("success", "链接已复制");
  };

  const folderCrumb = folderPathOf(asset?.path ?? "") || "文档";

  return (
    <div className="zx-ed-studio">
      <div className="zx-ed-topbar">
        <div className="zx-ed-left">
          <button
            type="button"
            className="zx-btn-glass"
            style={{ height: 32, padding: "0 12px" }}
            onClick={() => navigate("/documents")}
          >
            <ArrowLeft size={14} /> {folderCrumb.split("/").pop() || "文档"}
          </button>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => void saveTitle()}
            placeholder="输入 HTML 页面标题…"
            className="zx-ed-title-input"
          />
          <SaveBadge state={saveState} />
        </div>

        <div className="zx-ed-sub-pills" role="tablist" aria-label="HTML 视图模式">
          {(
            [
              { key: "edit", label: "源码" },
              { key: "split", label: "分屏" },
              { key: "preview", label: "运行预览" },
            ] as const
          ).map((item) => (
            <button
              key={item.key}
              type="button"
              role="tab"
              aria-selected={mode === item.key}
              className={`zx-ed-sp ${mode === item.key ? "active" : ""}`}
              onClick={() => setMode(item.key)}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          {asset ? (
            <button
              type="button"
              className={`zx-pill ${asset.visibility === "public" ? "emerald" : "neutral"}`}
              style={{
                height: 34,
                padding: "0 12px",
                border: "1px solid var(--zx-border)",
                cursor: "pointer",
              }}
              title="点击切换页面公开/私有状态"
              disabled={toggleVisibility.isPending}
              onClick={() =>
                toggleVisibility.mutate(asset.visibility === "public" ? "private" : "public")
              }
            >
              {asset.visibility === "public" ? <Globe size={12.5} /> : <Lock size={12.5} />}
              {asset.visibility === "public" ? "公开" : "私有"}
            </button>
          ) : null}
          <button
            type="button"
            className="zx-btn-glass"
            style={{ height: 34, padding: "0 13px" }}
            onClick={() => {
              setSaveState("saving");
              void persistSource(source).then(() => toast("success", "已保存"));
            }}
          >
            <Save size={13.5} /> 保存
          </button>
          <button
            type="button"
            className="zx-btn-cta"
            style={{ height: 34, padding: "0 15px" }}
            onClick={() => setPublishOpen(true)}
          >
            <Share2 size={13.5} /> 发布 / 分享
          </button>
          <Dropdown
            trigger={["click"]}
            placement="bottomRight"
            menu={{
              items: [
                { key: "copy", label: "复制发布链接" },
                { key: "export", label: "导出 HTML 文件" },
                { key: "asset", label: "查看资产详情" },
                { key: "delete", label: "删除页面", danger: true },
              ] satisfies MenuProps["items"],
              onClick: ({ key }) => {
                if (key === "copy") void copyPublishedLink();
                if (key === "export") exportHtml();
                if (key === "asset") navigate(`/assets/${id}`);
                if (key === "delete" && id) {
                  confirmDelete({
                    title: `删除页面「${title || id}」？`,
                    content: "删除后可在回收站恢复。",
                    onConfirm: async () => {
                      try {
                        await api(`/assets/${id}`, { method: "DELETE" });
                        toast("success", "页面已移入回收站");
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

      <div className={`zx-ed-workspace html-${mode}`}>
        {mode !== "preview" && (
          <section className="zx-md-pane">
            <div ref={editorRef} className="sg-code-editor-host" />
            <div className="zx-md-footer tabular">
              <span>HTML 源码</span>
              <span>共 {source.length} 字符 · 独立 Origin 安全沙箱预览</span>
            </div>
          </section>
        )}

        {mode !== "edit" && (
          <section className="zx-paper-sheet">
            <SandboxHtmlPreview
              source={source}
              minHeight={0}
              style={{
                width: "100%",
                height: "100%",
                flex: 1,
                border: 0,
                borderRadius: 20,
              }}
            />
          </section>
        )}
      </div>

      {asset && (
        <PublishDialog asset={asset} open={publishOpen} onClose={() => setPublishOpen(false)} />
      )}
    </div>
  );
}
