import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { html } from "@codemirror/lang-html";
import { Compartment, EditorState } from "@codemirror/state";
import { EditorView, highlightActiveLine, keymap, lineNumbers } from "@codemirror/view";
import { useToast } from "@shiguang/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "antd";
import { createStyles } from "antd-style";
import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { type Asset, api } from "../../entities/api.js";
import { SandboxHtmlPreview } from "../../shared/sandbox-preview.js";

const useHtmlEditorStyles = createStyles(({ token }) => ({
  header: { marginBottom: 10 },
  title: {
    border: "none",
    outline: "none",
    background: "transparent",
    color: token.colorText,
    fontSize: 18,
    fontWeight: 700,
  },
}));

export function HtmlEditorPage() {
  const { styles } = useHtmlEditorStyles();
  const { id } = useParams<{ id: string }>();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const [title, setTitle] = useState(params.get("title") ?? "未命名 HTML 页面");
  const [source, setSource] = useState(
    '<!doctype html>\n<html>\n<head><meta charset="utf-8"><title>页面</title></head>\n<body>\n  <h1>Hello, Shiguang</h1>\n</body>\n</html>',
  );
  const [preview, setPreview] = useState(false);

  const { data: asset } = useQuery<Asset>({
    queryKey: ["asset", id],
    queryFn: () => api<Asset>(`/assets/${id}`),
    enabled: Boolean(id),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      api<Asset>("/assets", {
        method: "POST",
        body: { type: "html", title, content: { html: source } },
      }),
    onSuccess: (a) => {
      navigate(`/html/${a.id}`, { replace: true });
      void queryClient.invalidateQueries({ queryKey: ["assets"] });
    },
  });

  useEffect(() => {
    if (!id) {
      createMutation.mutate();
      return;
    }
    if (asset?.content?.text) {
      setSource(asset.content.text);
      setTitle(asset.title);
    }
  }, [id, asset?.content?.text]);

  useEffect(() => {
    if (!editorRef.current) return;
    const langConf = new Compartment();
    const state = EditorState.create({
      doc: source,
      extensions: [
        lineNumbers(),
        highlightActiveLine(),
        history(),
        langConf.of(html()),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) setSource(update.state.doc.toString());
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
  }, []);

  const save = () => {
    if (!id) return;
    api<Asset>(`/assets/${id}`, {
      method: "PATCH",
      headers: { "if-match": `"${asset?.lockVersion ?? 1}"` },
      body: { content: { html: source } },
    })
      .then(() => {
        toast("success", "已保存");
        void queryClient.invalidateQueries({ queryKey: ["asset", id] });
      })
      .catch((e: Error) => toast("error", e.message));
  };

  return (
    <div>
      <div className={`sg-row-between ${styles.header}`}>
        <input value={title} onChange={(e) => setTitle(e.target.value)} className={styles.title} />
        <div className="sg-row">
          <Button size="small" onClick={() => setPreview((p) => !p)}>
            {preview ? "回到源码" : "运行预览"}
          </Button>
          <Button size="small" type="primary" onClick={save}>
            保存
          </Button>
        </div>
      </div>
      {preview ? (
        <SandboxHtmlPreview source={source} minHeight={600} />
      ) : (
        <div className="sg-editor">
          <div ref={editorRef} />
        </div>
      )}
      <p className="sg-hint">预览运行在独立 Origin 沙箱中，无法访问主站 Cookie / Storage / DOM。</p>
    </div>
  );
}
