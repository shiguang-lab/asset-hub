import { Button, Card, Input, Select, Spinner, Textarea, useToast } from "@shiguang/ui";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { type Asset, api } from "../../entities/api.js";

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
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [assetId, setAssetId] = useState(params.get("asset") ?? "");
  const [title, setTitle] = useState("");
  const [theme, setTheme] = useState("light");
  const [outline, setOutline] = useState<Outline | null>(null);

  const { data: assets } = useQuery<{ items: Asset[] }>({
    queryKey: ["assets"],
    queryFn: () => api("/assets", { params: { limit: 50 } }),
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
      toast("success", "AI 大纲已生成，可编辑后确认");
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
      toast("success", "演示已生成，可进入编辑与发布");
      setStep(4);
      setTimeout(() => navigate(`/presentations/${asset.id}`), 1200);
    },
    onError: (e: Error) => toast("error", e.message),
  });

  const docAssets = (assets?.items ?? []).filter((a) => ["document", "report"].includes(a.type));
  const recentAssets = (assets?.items ?? []).slice(0, 4);

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
    <div className="sg-workflow-page">
      <h1 className="sg-h1 sg-mb">新建在线演示</h1>
      <div className="sg-stepper">
        {[
          { id: 1, label: "选择内容来源" },
          { id: 2, label: "AI 生成大纲" },
          { id: 3, label: "确认并生成" },
          { id: 4, label: "编辑与发布" },
        ].map((s) => (
          <div
            key={s.id}
            className={`sg-step ${step === s.id ? "active" : step > s.id ? "done" : ""}`}
          >
            <span className="num">{step > s.id ? "✓" : s.id}</span>
            {s.label}
          </div>
        ))}
      </div>

      {step === 1 && (
        <div className="sg-col">
          <p className="sg-subtle">选择现有内容或从空白开始，AI 将帮助您生成演示大纲</p>
          <div className="sg-grid" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
            {[
              {
                label: "从文档选择",
                sub: "从文档中提取内容，智能生成演示",
                count: "我的文档 128",
                icon: "📄",
              },
              {
                label: "从报告选择",
                sub: "基于研究报告快速生成专业演示",
                count: "我的报告 36",
                icon: "📊",
              },
              {
                label: "从模板创建",
                sub: "使用精选模板，快速创建演示",
                count: "模板中心 64",
                icon: "▣",
              },
              {
                label: "AI 智能生成",
                sub: "输入主题，AI 帮你生成完整演示",
                count: "智能创作",
                icon: "✦",
              },
            ].map((item) => (
              <Card key={item.label} onClick={() => setStep(2)}>
                <div style={{ fontSize: 26, marginBottom: 8 }}>{item.icon}</div>
                <strong>{item.label}</strong>
                <p className="sg-subtle" style={{ margin: "6px 0" }}>
                  {item.sub}
                </p>
                <span className="sg-badge">{item.count}</span>
              </Card>
            ))}
          </div>
          <div className="sg-row">
            <Button variant="ghost" onClick={() => toast("info", "请到知识库或数据集页上传文件")}>
              ⬆ 上传文件
            </Button>
            <Button variant="ghost" onClick={() => setStep(2)}>
              空白演示
            </Button>
          </div>
          <h2 className="sg-h2 sg-mt">最近使用</h2>
          <div className="sg-grid" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
            {recentAssets.map((a) => (
              <Card
                key={a.id}
                onClick={() => {
                  setAssetId(a.id);
                  setStep(2);
                }}
              >
                <strong style={{ fontSize: 13 }}>{a.title}</strong>
                <div className="sg-subtle" style={{ marginTop: 6 }}>
                  {a.type}
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="sg-col">
          <Card>
            <div className="sg-row-between">
              <div>
                <h2 className="sg-h3">AI 生成演示大纲</h2>
                <p className="sg-subtle">
                  基于文档内容，提炼核心观点，生成结构化演示大纲。您可以编辑后再生成演示。
                </p>
              </div>
              <div className="sg-row">
                <Button size="sm" onClick={() => setStep(1)}>
                  返回
                </Button>
                <Button size="sm" variant="primary" onClick={() => setStep(3)}>
                  下一步：确认并生成
                </Button>
              </div>
            </div>
            <div className="sg-row sg-mt">
              <Select
                value={assetId}
                onChange={setAssetId}
                options={[
                  { value: "", label: "选择来源文档…" },
                  ...docAssets.map((a) => ({ value: a.id, label: a.title })),
                ]}
                className=""
                style={{ maxWidth: 300 }}
              />
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="演示标题"
                style={{ maxWidth: 260 }}
              />
              <Select
                value={theme}
                onChange={setTheme}
                options={[
                  { value: "light", label: "明亮" },
                  { value: "dark", label: "深色" },
                  { value: "brand", label: "商务" },
                  { value: "minimal", label: "简约" },
                  { value: "gradient", label: "创意" },
                ]}
                className=""
                style={{ width: 120 }}
              />
              <Button
                variant="primary"
                disabled={(!assetId && !title) || outlineMutation.isPending}
                onClick={() => outlineMutation.mutate()}
              >
                {outlineMutation.isPending ? <Spinner size={14} /> : "生成大纲"}
              </Button>
            </div>
          </Card>

          {outline && (
            <div className="sg-grid" style={{ gridTemplateColumns: "1.2fr 1fr" }}>
              <Card>
                <div className="sg-row-between sg-mb">
                  <strong>AI 生成的大纲（共 {outline.slides.length} 页）</strong>
                  <Button size="sm" onClick={() => outlineMutation.mutate()}>
                    重新生成
                  </Button>
                </div>
                <div className="sg-col">
                  {outline.slides.map((slide, i) => (
                    <div key={slide.id} className="sg-card" style={{ padding: 12 }}>
                      <div className="sg-row-between sg-mb-sm">
                        <span className="sg-badge">
                          {i + 1}. {slide.layout}
                        </span>
                        <Button
                          size="sm"
                          variant="danger"
                          onClick={() =>
                            setOutline(
                              (o) => o && { ...o, slides: o.slides.filter((_, j) => j !== i) },
                            )
                          }
                        >
                          删除
                        </Button>
                      </div>
                      <Input
                        value={slide.title}
                        onChange={(e) => updateSlide(i, { title: e.target.value })}
                        className="sg-mb-sm"
                      />
                      {slide.blocks.map((block, bi) => (
                        <Textarea
                          key={block.id}
                          value={block.content}
                          onChange={(e) => updateBlock(i, bi, e.target.value)}
                          style={{ minHeight: 52, marginBottom: 6 }}
                        />
                      ))}
                    </div>
                  ))}
                </div>
                <p className="sg-hint sg-mt">
                  提示：您可以编辑章节标题与内容，点击章节内容进行编辑。
                </p>
              </Card>
              <div className="sg-col">
                <Card>
                  <h3 className="sg-h3">大纲预览</h3>
                  <div className="sg-col sg-mt-sm">
                    {outline.slides.slice(0, 8).map((slide, i) => (
                      <div key={slide.id} className="sg-row">
                        <span className="sg-badge sg-badge-accent">{i + 1}</span>
                        <span style={{ fontSize: 13 }}>{slide.title || "未命名"}</span>
                      </div>
                    ))}
                  </div>
                </Card>
                <Card>
                  <h3 className="sg-h3">演示风格</h3>
                  <div className="sg-option-row">
                    <span>模板主题</span>
                    <span className="sg-badge sg-badge-accent">{theme}</span>
                  </div>
                  <div className="sg-option-row">
                    <span>配色方案</span>
                    <span>Tech Purple</span>
                  </div>
                  <div className="sg-option-row">
                    <span>字体风格</span>
                    <span>思源黑体 / Source Han Sans</span>
                  </div>
                  <div className="sg-option-row">
                    <span>页面比例</span>
                    <span>16:9</span>
                  </div>
                </Card>
              </div>
            </div>
          )}
        </div>
      )}

      {step === 3 && outline && (
        <div className="sg-col">
          <Card>
            <h2 className="sg-h3">确认生成内容</h2>
            <p className="sg-subtle">
              请确认以下演示大纲与风格设置，确认后将自动生成 H5 演示，预计 1-2 分钟完成。
            </p>
            <div className="sg-grid sg-mt" style={{ gridTemplateColumns: "1fr 1.4fr" }}>
              <div className="sg-col">
                <div className="sg-option-row">
                  <span>演示标题</span>
                  <strong>{outline.title}</strong>
                </div>
                <div className="sg-option-row">
                  <span>大纲页数</span>
                  <strong>{outline.slides.length} 页</strong>
                </div>
                <div className="sg-option-row">
                  <span>演示风格</span>
                  <strong>{theme}</strong>
                </div>
                <div className="sg-option-row">
                  <span>页面比例</span>
                  <strong>16:9</strong>
                </div>
                <div className="sg-option-row">
                  <span>预计生成时间</span>
                  <strong>1-2 分钟</strong>
                </div>
                <div className="sg-option-row">
                  <span>内容来源</span>
                  <strong>{docAssets.find((a) => a.id === assetId)?.title ?? title}</strong>
                </div>
              </div>
              <Card>
                <h3 className="sg-h3">大纲预览（共 {outline.slides.length} 页）</h3>
                <div className="sg-col sg-mt-sm">
                  {outline.slides.slice(0, 10).map((slide, i) => (
                    <div key={slide.id} className="sg-row">
                      <span className="sg-badge">{String(i + 1).padStart(2, "0")}</span>
                      <span style={{ fontSize: 13 }}>{slide.title || "未命名"}</span>
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          </Card>
          <div className="sg-row" style={{ justifyContent: "flex-end" }}>
            <Button onClick={() => setStep(2)}>上一步</Button>
            <Button
              variant="primary"
              onClick={() => confirmMutation.mutate()}
              disabled={confirmMutation.isPending}
            >
              {confirmMutation.isPending ? <Spinner size={14} /> : "确认生成"}
            </Button>
          </div>
        </div>
      )}

      {step === 4 && (
        <Card className="sg-center" style={{ padding: 48 }}>
          <Spinner size={30} />
          <p className="sg-subtle sg-mt">演示已生成，正在进入编辑器…</p>
        </Card>
      )}
    </div>
  );
}
