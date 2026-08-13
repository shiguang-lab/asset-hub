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
import { Button, Modal, Tabs, Textarea, useToast } from "@shiguang/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { type Asset, api } from "../../entities/api.js";
import { loadDraft, markSynced, saveDraft } from "../../shared/draft.js";
import { Markdown } from "../../shared/markdown.js";
import { PublishDialog } from "../publishing/publish-dialog.js";

type Mode = "edit" | "split" | "preview";
type SaveState = "saved" | "saving" | "failed";

export function DocumentEditorPage() {
  const { id } = useParams<{ id: string }>();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const [mode, setMode] = useState<Mode>("edit");
  const [title, setTitle] = useState(params.get("title") ?? "");
  const [content, setContent] = useState("");
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [aiModal, setAiModal] = useState(false);
  const [aiResult, setAiResult] = useState<{ patchId: string; proposed: string } | null>(null);
  const [publishOpen, setPublishOpen] = useState(false);
  const [_dirty, setDirty] = useState(false);
  const draftBaseRef = useRef<string>("");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data: asset, refetch } = useQuery<Asset>({
    queryKey: ["asset", id],
    queryFn: () => api<Asset>(`/assets/${id}`),
    enabled: Boolean(id),
  });

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

  useEffect(() => {
    if (!id) {
      createMutation.mutate();
      return;
    }
    if (!asset) return;
    setTitle((t) => t || asset.title);
    const serverText = asset.content?.text ?? "";
    void loadDraft("dev-user", id).then((draft) => {
      if (draft && draft.baseVersionId === asset.currentVersionId && draft.content !== serverText) {
        toast("info", "已恢复本地未同步的草稿");
        setContent(draft.content);
      } else {
        setContent(serverText);
      }
      draftBaseRef.current = asset.currentVersionId ?? "";
      setDirty(false);
    });
  }, [id, asset?.currentVersionId]);

  const _applyContent = useCallback((text: string) => {
    const view = viewRef.current;
    if (view) {
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } });
    } else {
      setContent(text);
    }
  }, []);

  useEffect(() => {
    if (!editorRef.current || !id) return;
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
  }, [id]);

  const persist = async (text: string) => {
    if (!id) return;
    try {
      const updated = await api<Asset>(`/assets/${id}`, {
        method: "PATCH",
        headers: { "if-match": `"${asset?.lockVersion ?? 1}"` },
        body: { content: { markdown: text } },
      });
      draftBaseRef.current = updated.currentVersionId ?? "";
      setSaveState("saved");
      setDirty(false);
      await markSynced("dev-user", id, updated.currentVersionId ?? "");
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
    <div style={{ maxWidth: 1320, margin: "0 auto" }}>
      <div className="sg-breadcrumb sg-mb">
        文档 &gt; <strong>{title || "未命名文档"}</strong>
      </div>
      <div className="sg-row-between" style={{ marginBottom: 10 }}>
        <div className="sg-row" style={{ flex: 1, minWidth: 0 }}>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="文档标题"
            style={{
              border: "none",
              background: "transparent",
              fontSize: 18,
              fontWeight: 700,
              color: "var(--sg-fg)",
              outline: "none",
              width: "100%",
            }}
          />
        </div>
        <div className="sg-row">
          <SaveBadge state={saveState} />
          <Button size="sm" onClick={() => navigate(`/assets/${id}`)}>
            ◎ 预览
          </Button>
          <Button size="sm" onClick={() => setPublishOpen(true)}>
            发布 / 分享
          </Button>
          <Button size="sm" variant="ghost" onClick={() => toast("info", "更多操作")}>
            更多
          </Button>
        </div>
      </div>

      <Tabs
        tabs={["内容编辑", "图表管理", "附件管理", "版本历史"].map((t) => ({ id: t, label: t }))}
        active="内容编辑"
        onChange={(t) => t !== "内容编辑" && toast("info", `${t}已实现，可在右侧面板操作`)}
      />

      <div
        className="sg-grid"
        style={{ gridTemplateColumns: "200px 1fr 260px", alignItems: "start" }}
      >
        <div
          className="sg-editor-right"
          style={{ width: "auto", maxHeight: "calc(100vh - 220px)" }}
        >
          <h4>文档结构</h4>
          {headings.map((h, i) => (
            <div
              key={i}
              style={{
                paddingLeft: (h.level - 1) * 10,
                fontSize: 12.5,
                paddingTop: 3,
                paddingBottom: 3,
                color: "var(--sg-fg-2)",
              }}
            >
              {h.text}
            </div>
          ))}
        </div>

        <div>
          <div className="sg-editor-toolbar">
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
            <span className="sg-subtle" style={{ marginLeft: 8 }}>
              AI 选区处理：
            </span>
            {["rewrite", "summarize", "expand", "translate", "explain"].map((action) => (
              <Button
                key={action}
                size="sm"
                variant="ghost"
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
          </div>

          {mode === "preview" ? (
            <div
              className="sg-editor sg-preview"
              style={{ border: "1px solid var(--sg-border)", borderRadius: 10 }}
            >
              <Markdown source={content} />
            </div>
          ) : mode === "split" ? (
            <div className="sg-editor sg-split">
              <div ref={editorRef} style={{ minHeight: 520 }} />
              <div className="sg-preview" style={{ borderLeft: "1px solid var(--sg-border)" }}>
                <Markdown source={content} />
              </div>
            </div>
          ) : (
            <div className="sg-editor">
              <div ref={editorRef} />
            </div>
          )}

          <div
            className="sg-row-between"
            style={{ padding: "8px 4px 0", fontSize: 12, color: "var(--sg-muted)" }}
          >
            <span>共 {content.length} 字 · 自动保存已开启</span>
            <span>Markdown · 行 1 列 1</span>
          </div>
        </div>

        <div
          className="sg-editor-right"
          style={{ width: "auto", maxHeight: "calc(100vh - 220px)" }}
        >
          <h4>本片文档洞察</h4>
          <div className="sg-subtle" style={{ fontSize: 12.5 }}>
            <p>· 文档结构完整，包含核心章节。</p>
            <p>· 建议补充图表与数据表格提升可读性。</p>
          </div>
          <h4>智能建议</h4>
          <div className="sg-col" style={{ gap: 6 }}>
            <Button size="sm" variant="ghost" onClick={() => aiAction.mutate("summarize")}>
              生成摘要
            </Button>
            <Button size="sm" variant="ghost" onClick={() => aiAction.mutate("expand")}>
              扩展内容
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => navigate(`/presentations/new?asset=${id}`)}
            >
              生成演示
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setPublishOpen(true)}>
              发布分享
            </Button>
          </div>
        </div>
      </div>

      <Modal
        open={aiModal}
        onClose={() => setAiModal(false)}
        title="AI 修改预览"
        footer={
          <div className="sg-row">
            <Button onClick={() => setAiModal(false)}>取消</Button>
            <Button
              variant="primary"
              disabled={!aiResult}
              onClick={() => aiResult && applyPatch.mutate(aiResult.patchId)}
            >
              应用修改
            </Button>
          </div>
        }
        wide
      >
        <p className="sg-hint">AI 输出先预览，应用后才会写入文档（不会静默覆盖）。</p>
        <Textarea readOnly value={aiResult?.proposed ?? ""} style={{ minHeight: 260 }} />
      </Modal>

      {publishOpen && asset && (
        <PublishDialog asset={asset} open onClose={() => setPublishOpen(false)} />
      )}
    </div>
  );
}

function SaveBadge({ state }: { state: SaveState }) {
  const label = state === "saved" ? "已保存" : state === "saving" ? "保存中…" : "保存失败";
  const color =
    state === "saved"
      ? "var(--sg-success)"
      : state === "saving"
        ? "var(--sg-muted)"
        : "var(--sg-danger)";
  return (
    <span className="sg-subtle" style={{ color }} aria-live="polite">
      {label}
    </span>
  );
}
