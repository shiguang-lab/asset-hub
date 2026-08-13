import {
  Button,
  Card,
  Empty,
  Field,
  Input,
  Select,
  Spinner,
  StatusBadge,
  useToast,
} from "@shiguang/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { type Asset, api, type Task, type Template } from "../../entities/api.js";
import { PublishDialog } from "../publishing/publish-dialog.js";

interface Slide {
  id: string;
  layout: string;
  title: string;
  blocks: Array<{ id: string; type: string; content: string }>;
  notes?: string;
}
interface PresentationDocument {
  theme: string;
  aspectRatio: string;
  slides: Slide[];
}

export function PresentationsPage() {
  const navigate = useNavigate();
  const { data } = useQuery<{ items: Asset[] }>({
    queryKey: ["assets", "presentation"],
    queryFn: () => api("/assets", { params: { type: "presentation", limit: 100 } }),
  });
  const presentations = (data?.items ?? []).filter((a) => a.type === "presentation");
  return (
    <div>
      <div className="sg-row-between sg-mb">
        <div>
          <h1 className="sg-h1">在线演示</h1>
          <p className="sg-subtle">从文档/报告一键生成 H5 演示，支持主题、布局与在线播放。</p>
        </div>
        <Button variant="primary" onClick={() => navigate("/presentations/new")}>
          + 新建演示
        </Button>
      </div>
      {presentations.length === 0 ? (
        <Empty
          title="还没有演示"
          hint="选择一个文档或报告，AI 生成大纲并在线播放。"
          action={
            <Button variant="primary" onClick={() => navigate("/presentations/new")}>
              新建演示
            </Button>
          }
        />
      ) : (
        <div className="sg-grid" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
          {presentations.map((p) => (
            <Card key={p.id} onClick={() => navigate(`/presentations/${p.id}`)}>
              <strong>{p.title}</strong>
              <div className="sg-row sg-mt-sm">
                <StatusBadge status={p.status} />
                <Button
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate(`/presentations/${p.id}/play`);
                  }}
                >
                  播放
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

export function PresentationNewPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [assetId, setAssetId] = useState(params.get("asset") ?? "");
  const [title, setTitle] = useState("");
  const [theme, setTheme] = useState("light");
  const [templateId, setTemplateId] = useState(params.get("template") ?? "");

  const { data: assets } = useQuery<{ items: Asset[] }>({
    queryKey: ["assets"],
    queryFn: () => api("/assets", { params: { limit: 50 } }),
  });
  const { data: templates } = useQuery<Template[]>({
    queryKey: ["templates", "presentation"],
    queryFn: () => api("/templates", { params: { type: "presentation" } }),
  });

  const mutation = useMutation({
    mutationFn: () =>
      api<{ task: Task }>("/presentations/generate", {
        method: "POST",
        body: { assetId: assetId || undefined, title, theme, templateId: templateId || undefined },
      }),
    onSuccess: (data) => {
      toast("success", "演示生成任务已创建，后台生成中");
      navigate(`/tasks/${data.task.id}`);
    },
    onError: (e: Error) => toast("error", e.message),
  });

  const docAssets = (assets?.items ?? []).filter((a) => ["document", "report"].includes(a.type));

  return (
    <div style={{ maxWidth: 640, margin: "0 auto" }}>
      <h1 className="sg-h1 sg-mb">生成在线演示</h1>
      <Card>
        <Field label="源文档 / 报告" hint="选择文档后 AI 自动提取内容生成大纲">
          <Select
            value={assetId}
            onChange={setAssetId}
            options={[
              { value: "", label: "选择文档…" },
              ...docAssets.map((a) => ({ value: a.id, label: a.title })),
            ]}
          />
        </Field>
        <Field label="演示标题">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={docAssets.find((a) => a.id === assetId)?.title ?? "演示标题"}
          />
        </Field>
        <Field label="主题">
          <Select
            value={theme}
            onChange={setTheme}
            options={[
              { value: "light", label: "明亮" },
              { value: "dark", label: "深色" },
              { value: "brand", label: "品牌" },
              { value: "minimal", label: "极简" },
              { value: "gradient", label: "渐变" },
            ]}
          />
        </Field>
        {templates && templates.length > 0 && (
          <Field label="模板">
            <Select
              value={templateId}
              onChange={setTemplateId}
              options={[
                { value: "", label: "不使用模板" },
                ...templates.map((t) => ({ value: t.id, label: t.name })),
              ]}
            />
          </Field>
        )}
        <Button
          variant="primary"
          size="lg"
          disabled={(!assetId && !title) || mutation.isPending}
          onClick={() => mutation.mutate()}
        >
          {mutation.isPending ? <Spinner size={14} /> : "生成大纲并创建演示"}
        </Button>
      </Card>
    </div>
  );
}

export function PresentationEditorPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [doc, setDoc] = useState<PresentationDocument>({
    theme: "light",
    aspectRatio: "16:9",
    slides: [],
  });
  const [activeSlide, setActiveSlide] = useState(0);
  const [publishOpen, setPublishOpen] = useState(false);

  const { data } = useQuery<{ asset: Asset; document: PresentationDocument }>({
    queryKey: ["presentation", id],
    queryFn: () => api(`/presentations/${id}`),
  });

  useEffect(() => {
    if (data) setDoc(data.document);
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: () => api(`/presentations/${id}`, { method: "PUT", body: { document: doc } }),
    onSuccess: () => {
      toast("success", "演示已保存");
      void queryClient.invalidateQueries({ queryKey: ["presentation", id] });
      void queryClient.invalidateQueries({ queryKey: ["assets"] });
    },
  });

  const regenerate = useMutation({
    mutationFn: (slideId: string) =>
      api<{ proposal: Slide }>(`/presentations/${id}/slides/${slideId}/regenerate`, {
        method: "POST",
        body: { instruction: "让内容更精炼、更有冲击力" },
      }),
    onSuccess: (res) => {
      setDoc((d) => ({
        ...d,
        slides: d.slides.map((s) => (s.id === res.proposal.id ? res.proposal : s)),
      }));
      toast("success", "幻灯片已由 AI 重新生成");
    },
  });

  if (!data) return <Empty title="加载中…" />;
  const slide = doc.slides[activeSlide];

  const updateSlide = (patch: Partial<Slide>) => {
    setDoc((d) => ({
      ...d,
      slides: d.slides.map((s, i) => (i === activeSlide ? { ...s, ...patch } : s)),
    }));
  };

  return (
    <div>
      <div className="sg-row-between sg-mb">
        <h1 className="sg-h1">{data.asset.title}</h1>
        <div className="sg-row">
          <Select
            value={doc.theme}
            onChange={(v) => setDoc((d) => ({ ...d, theme: v }))}
            options={[
              { value: "light", label: "明亮" },
              { value: "dark", label: "深色" },
              { value: "brand", label: "品牌" },
              { value: "minimal", label: "极简" },
              { value: "gradient", label: "渐变" },
            ]}
            className=""
            style={{ width: 120 }}
          />
          <Button onClick={() => navigate(`/presentations/${id}/play`)}>播放</Button>
          <Button variant="primary" onClick={() => saveMutation.mutate()}>
            保存
          </Button>
          <Button onClick={() => setPublishOpen(true)}>发布</Button>
        </div>
      </div>

      <div className="sg-slide-editor">
        <div className="sg-slide-list">
          {doc.slides.map((s, i) => (
            <button
              type="button"
              key={s.id}
              className={`sg-slide-thumb ${activeSlide === i ? "active" : ""}`}
              onClick={() => setActiveSlide(i)}
            >
              <strong>
                {i + 1}. {s.title || "未命名幻灯片"}
              </strong>
              <span className="sg-subtle" style={{ display: "block" }}>
                {s.layout}
              </span>
            </button>
          ))}
          <Button
            size="sm"
            style={{ width: "100%", marginTop: 8 }}
            onClick={() => {
              const newSlide: Slide = {
                id: `slide-${Date.now().toString(36)}`,
                layout: "content",
                title: "新幻灯片",
                blocks: [
                  { id: `b-${Date.now().toString(36)}`, type: "heading", content: "新幻灯片" },
                ],
              };
              setDoc((d) => ({ ...d, slides: [...d.slides, newSlide] }));
              setActiveSlide(doc.slides.length);
            }}
          >
            + 添加幻灯片
          </Button>
        </div>

        {slide ? (
          <div className="sg-col">
            <div className="sg-row">
              <Select
                value={slide.layout}
                onChange={(v) => updateSlide({ layout: v })}
                options={[
                  { value: "title", label: "封面" },
                  { value: "section", label: "章节页" },
                  { value: "content", label: "内容页" },
                  { value: "two-column", label: "双栏" },
                  { value: "quote", label: "引用" },
                  { value: "data", label: "数据页" },
                  { value: "image", label: "图片" },
                  { value: "closing", label: "结束页" },
                ]}
                className=""
                style={{ width: 140 }}
              />
              <Button size="sm" onClick={() => regenerate.mutate(slide.id)}>
                AI 重写本页
              </Button>
              <Button
                size="sm"
                variant="danger"
                onClick={() => {
                  setDoc((d) => ({ ...d, slides: d.slides.filter((s) => s.id !== slide.id) }));
                  setActiveSlide(0);
                }}
              >
                删除本页
              </Button>
            </div>
            <Input
              value={slide.title}
              onChange={(e) => updateSlide({ title: e.target.value })}
              placeholder="幻灯片标题"
            />
            <div className="sg-slide-canvas">
              <div
                className="sg-slide-frame"
                data-theme={doc.theme}
                style={{
                  background: doc.theme === "dark" ? "#0f1420" : "#fff",
                  color: doc.theme === "dark" ? "#f5f7ff" : "#172033",
                }}
              >
                {slide.blocks.map((block, bi) => (
                  <div key={block.id}>
                    {block.type === "heading" ? (
                      <input
                        value={block.content}
                        onChange={(e) => updateBlock(slide.id, block.id, e.target.value, setDoc)}
                        style={{
                          fontSize: 26,
                          fontWeight: 700,
                          background: "transparent",
                          border: "none",
                          color: "inherit",
                          outline: "none",
                          width: "100%",
                          marginBottom: 12,
                        }}
                      />
                    ) : block.type === "bullet" ? (
                      <textarea
                        value={block.content}
                        onChange={(e) => updateBlock(slide.id, block.id, e.target.value, setDoc)}
                        style={{
                          width: "100%",
                          minHeight: 180,
                          fontSize: 16,
                          background: "transparent",
                          border: "none",
                          color: "inherit",
                          outline: "none",
                          lineHeight: 1.8,
                          resize: "vertical",
                        }}
                      />
                    ) : (
                      <textarea
                        value={block.content}
                        onChange={(e) => updateBlock(slide.id, block.id, e.target.value, setDoc)}
                        style={{
                          width: "100%",
                          minHeight: 120,
                          fontSize: 16,
                          background: "transparent",
                          border: "none",
                          color: "inherit",
                          outline: "none",
                          resize: "vertical",
                        }}
                      />
                    )}
                    {bi === slide.blocks.length - 1 && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          updateSlide({
                            blocks: [
                              ...slide.blocks,
                              {
                                id: `b-${Date.now().toString(36)}`,
                                type: "text",
                                content: "新内容",
                              },
                            ],
                          })
                        }
                      >
                        + 内容块
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <Empty title="没有幻灯片" />
        )}
      </div>

      {publishOpen && (
        <PublishDialog asset={data.asset} open onClose={() => setPublishOpen(false)} />
      )}
    </div>
  );
}

function updateBlock(
  slideId: string,
  blockId: string,
  value: string,
  setDoc: React.Dispatch<React.SetStateAction<PresentationDocument>>,
) {
  setDoc((d) => ({
    ...d,
    slides: d.slides.map((s) =>
      s.id === slideId
        ? { ...s, blocks: s.blocks.map((b) => (b.id === blockId ? { ...b, content: value } : b)) }
        : s,
    ),
  }));
}

export function PresentationPlayerPage() {
  const { id } = useParams<{ id: string }>();
  const { data } = useQuery<{ asset: Asset; document: PresentationDocument }>({
    queryKey: ["presentation", id],
    queryFn: () => api(`/presentations/${id}`),
  });
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === " ") {
        e.preventDefault();
        setIndex((i) => Math.min((data?.document.slides.length ?? 1) - 1, i + 1));
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        setIndex((i) => Math.max(0, i - 1));
      }
      if (e.key === "Escape") window.close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [data]);

  if (!data) return <Empty title="加载中…" />;
  const slide = data.document.slides[index];
  const theme = data.document.theme;
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: theme === "dark" || theme === "gradient" ? "#0f1420" : "#f7f8fb",
        color: theme === "dark" ? "#f5f7ff" : "#172033",
        zIndex: 400,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "var(--sg-font)",
      }}
    >
      {slide ? (
        <div style={{ maxWidth: 1000, padding: 48 }}>
          {slide.blocks.map((b) =>
            b.type === "heading" ? (
              <h2
                key={b.id}
                style={{
                  fontSize: "clamp(30px, 4.5vw, 56px)",
                  color: "var(--sg-accent)",
                  marginBottom: 24,
                }}
              >
                {b.content}
              </h2>
            ) : b.type === "bullet" ? (
              <ul key={b.id} style={{ fontSize: "clamp(18px, 2.2vw, 28px)", lineHeight: 1.8 }}>
                {b.content
                  .split("\n")
                  .filter(Boolean)
                  .map((l, i) => (
                    <li key={i}>{l}</li>
                  ))}
              </ul>
            ) : (
              <p key={b.id} style={{ fontSize: "clamp(18px, 2.2vw, 28px)", lineHeight: 1.7 }}>
                {b.content}
              </p>
            ),
          )}
        </div>
      ) : (
        <h1>演示完成</h1>
      )}
      <div style={{ position: "fixed", bottom: 20, right: 20, display: "flex", gap: 8 }}>
        <Button onClick={() => setIndex((i) => Math.max(0, i - 1))}>‹</Button>
        <Button
          onClick={() => setIndex((i) => Math.min((data.document.slides.length ?? 1) - 1, i + 1))}
        >
          ›
        </Button>
      </div>
      <div style={{ position: "fixed", bottom: 20, left: 20, color: "var(--sg-muted)" }}>
        {index + 1} / {data.document.slides.length}
      </div>
    </div>
  );
}
