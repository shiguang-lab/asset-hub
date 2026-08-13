import {
  Button,
  Card,
  Empty,
  Field,
  Input,
  Select,
  Spinner,
  Textarea,
  useToast,
} from "@shiguang/ui";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { type Asset, api, type Template } from "../../entities/api.js";

interface Slide {
  id: string;
  layout: string;
  title: string;
  blocks: Array<{ id: string; type: string; content: string }>;
}
interface Outline {
  title: string;
  theme: string;
  aspectRatio: string;
  slides: Slide[];
}

export function PresentationNewPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [assetId, setAssetId] = useState(params.get("asset") ?? "");
  const [title, setTitle] = useState("");
  const [theme, setTheme] = useState("light");
  const [templateId, setTemplateId] = useState(params.get("template") ?? "");
  const [outline, setOutline] = useState<Outline | null>(null);
  const [step, setStep] = useState<1 | 2 | 3>(1);

  const { data: assets } = useQuery<{ items: Asset[] }>({
    queryKey: ["assets"],
    queryFn: () => api("/assets", { params: { limit: 50 } }),
  });
  const { data: templates } = useQuery<Template[]>({
    queryKey: ["templates", "presentation"],
    queryFn: () => api("/templates", { params: { type: "presentation" } }),
  });

  const outlineMutation = useMutation({
    mutationFn: () =>
      api<{ outline: Outline }>("/presentations/outline", {
        method: "POST",
        body: { assetId: assetId || undefined, title: title || undefined, theme },
      }),
    onSuccess: (data) => {
      setOutline(data.outline);
      if (!title) setTitle(data.outline.title);
      setStep(2);
      toast("success", "AI 大纲已生成，请确认后创建");
    },
    onError: (e: Error) => toast("error", e.message),
  });

  const confirmMutation = useMutation({
    mutationFn: () =>
      api<Asset>("/presentations/outline/confirm", {
        method: "POST",
        body: {
          title: outline?.title ?? title,
          theme: outline?.theme ?? theme,
          aspectRatio: outline?.aspectRatio ?? "16:9",
          slides: outline?.slides ?? [],
          sourceAssetId: assetId || undefined,
        },
      }),
    onSuccess: (asset) => {
      toast("success", "演示已创建");
      navigate(`/presentations/${asset.id}`);
    },
    onError: (e: Error) => toast("error", e.message),
  });

  const docAssets = (assets?.items ?? []).filter((a) => ["document", "report"].includes(a.type));

  const updateSlide = (index: number, patch: Partial<Slide>) => {
    setOutline((o) =>
      o ? { ...o, slides: o.slides.map((s, i) => (i === index ? { ...s, ...patch } : s)) } : o,
    );
  };

  const updateBlock = (slideIndex: number, blockIndex: number, value: string) => {
    setOutline((o) =>
      o
        ? {
            ...o,
            slides: o.slides.map((s, si) =>
              si === slideIndex
                ? {
                    ...s,
                    blocks: s.blocks.map((b, bj) =>
                      bj === blockIndex ? { ...b, content: value } : b,
                    ),
                  }
                : s,
            ),
          }
        : o,
    );
  };

  return (
    <div style={{ maxWidth: 860, margin: "0 auto" }}>
      <h1 className="sg-h1 sg-mb">生成在线演示</h1>
      <div className="sg-tabs">
        {[
          { id: 1, label: "1 选择源" },
          { id: 2, label: "2 大纲确认" },
          { id: 3, label: "3 创建" },
        ].map((s) => (
          <div key={s.id} className={`sg-tab ${step === s.id ? "active" : ""}`}>
            {s.label}
          </div>
        ))}
      </div>

      {step === 1 && (
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
            <Field label="模板（可选）">
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
            disabled={(!assetId && !title) || outlineMutation.isPending}
            onClick={() => outlineMutation.mutate()}
          >
            {outlineMutation.isPending ? <Spinner size={14} /> : "生成大纲"}
          </Button>
        </Card>
      )}

      {step === 2 && outline && (
        <div className="sg-col">
          <Card>
            <div className="sg-row-between sg-mb">
              <div className="sg-row">
                <strong className="sg-h3">大纲确认</strong>
                <span className="sg-badge sg-badge-accent">{outline.slides.length} 页</span>
              </div>
              <div className="sg-row">
                <Button size="sm" onClick={() => setStep(1)}>
                  返回修改
                </Button>
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() => {
                    setStep(3);
                    confirmMutation.mutate();
                  }}
                >
                  {confirmMutation.isPending ? <Spinner size={14} /> : "确认并创建"}
                </Button>
              </div>
            </div>
            <div className="sg-row sg-mb">
              <Input
                value={outline.title}
                onChange={(e) => setOutline((o) => o && { ...o, title: e.target.value })}
                placeholder="演示标题"
                style={{ maxWidth: 320 }}
              />
              <Select
                value={outline.theme}
                onChange={(v) => setOutline((o) => o && { ...o, theme: v })}
                options={[
                  { value: "light", label: "明亮" },
                  { value: "dark", label: "深色" },
                  { value: "brand", label: "品牌" },
                  { value: "minimal", label: "极简" },
                  { value: "gradient", label: "渐变" },
                ]}
                className=""
                style={{ width: 140 }}
              />
            </div>
          </Card>
          {outline.slides.map((slide, i) => (
            <Card key={slide.id}>
              <div className="sg-row-between sg-mb">
                <strong>
                  第 {i + 1} 页 · {slide.layout}
                </strong>
                <div className="sg-row">
                  <Select
                    value={slide.layout}
                    onChange={(v) => updateSlide(i, { layout: v })}
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
                    style={{ width: 120 }}
                  />
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() =>
                      setOutline((o) => o && { ...o, slides: o.slides.filter((_, j) => j !== i) })
                    }
                  >
                    删除
                  </Button>
                </div>
              </div>
              <Input
                value={slide.title}
                onChange={(e) => updateSlide(i, { title: e.target.value })}
                placeholder="幻灯片标题"
                className="sg-mb"
              />
              {slide.blocks.map((block, bi) => (
                <Textarea
                  key={block.id}
                  value={block.content}
                  onChange={(e) => updateBlock(i, bi, e.target.value)}
                  style={{ minHeight: 80, marginBottom: 8 }}
                />
              ))}
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  setOutline((o) =>
                    o
                      ? {
                          ...o,
                          slides: o.slides.map((s, si) =>
                            si === i
                              ? {
                                  ...s,
                                  blocks: [
                                    ...s.blocks,
                                    {
                                      id: `b-${Date.now().toString(36)}`,
                                      type: "text",
                                      content: "",
                                    },
                                  ],
                                }
                              : s,
                          ),
                        }
                      : o,
                  )
                }
              >
                + 内容块
              </Button>
            </Card>
          ))}
        </div>
      )}

      {step === 3 && (
        <Card>
          <div className="sg-center" style={{ padding: 32 }}>
            {confirmMutation.isPending ? (
              <div className="sg-col sg-center">
                <Spinner size={28} />
                <span className="sg-subtle">正在创建演示资产…</span>
              </div>
            ) : (
              <Empty title="创建中" />
            )}
          </div>
        </Card>
      )}
    </div>
  );
}
