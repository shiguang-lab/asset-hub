import { useToast } from "@shiguang/ui";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button, Card, Input, Select, Spin } from "antd";
import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { type Asset, api } from "../../entities/api.js";

interface Section {
  id: string;
  title: string;
  summary: string;
  points: string[];
  data: unknown[];
  visual: string;
}
interface Outline {
  title: string;
  theme: string;
  aspectRatio: string;
  sections: Section[];
}

function stringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

/** Normalize API/model output so an incomplete or legacy outline never crashes the editor. */
export function normalizeOutline(value: unknown): Outline | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const rawSections = Array.isArray(raw.sections) ? raw.sections : [];
  const sections: Section[] = rawSections.flatMap((item, index) => {
    if (!item || typeof item !== "object") return [];
    const section = item as Record<string, unknown>;
    return [
      {
        id: stringValue(section.id, `sec-${index + 1}`),
        title: stringValue(section.title, `要点 ${index + 1}`),
        summary: stringValue(section.summary),
        points: Array.isArray(section.points)
          ? section.points.filter((point): point is string => typeof point === "string")
          : [],
        data: Array.isArray(section.data) ? section.data : [],

        visual: VISUAL_OPTIONS.some((option) => option.value === section.visual)
          ? String(section.visual)
          : "default",
      },
    ];
  });

  // Older API versions returned slides here. Convert them into editable sections.
  if (sections.length === 0 && Array.isArray(raw.slides)) {
    for (const [index, item] of raw.slides.entries()) {
      if (!item || typeof item !== "object") continue;
      const slide = item as Record<string, unknown>;
      const blocks = Array.isArray(slide.blocks) ? slide.blocks : [];
      const points = blocks.flatMap((block) => {
        if (!block || typeof block !== "object") return [];
        const value = block as Record<string, unknown>;
        if (value.type !== "bullet" && value.type !== "text") return [];
        return stringValue(value.content)
          .split(/\r?\n/)
          .map((point) => point.trim())
          .filter(Boolean);
      });
      sections.push({
        id: stringValue(slide.id, `sec-${index + 1}`),
        title: stringValue(slide.title, `要点 ${index + 1}`),
        summary: points[0] ?? "",
        points: points.slice(0, 4),
        data: [],

        visual: "default",
      });
    }
  }

  if (sections.length === 0) return null;
  return {
    title: stringValue(raw.title, "演示文稿"),
    theme: stringValue(raw.theme, "light"),
    aspectRatio: stringValue(raw.aspectRatio, "16:9"),
    sections,
  };
}

const VISUAL_OPTIONS = [
  { value: "default", label: "通用" },
  { value: "metrics", label: "指标卡" },
  { value: "chart", label: "图表" },
  { value: "two-column", label: "双栏对比" },
  { value: "quote", label: "金句" },
  { value: "timeline", label: "时间轴" },
];

export function PresentationNewPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [assetId, setAssetId] = useState(params.get("asset") ?? "");
  const [title, setTitle] = useState("");
  const [prompt, setPrompt] = useState(params.get("topic") ?? "");
  const [theme, setTheme] = useState("light");
  const [outline, setOutline] = useState<Outline | null>(null);
  const [sourceMode, setSourceMode] = useState<"document" | "report" | "template" | "ai">(
    (params.get("source") as "document" | "report" | "template" | "ai") || "document",
  );

  const { data: assets } = useQuery<{ items: Asset[] }>({
    queryKey: ["assets"],
    queryFn: () => api("/assets", { params: { limit: 50 } }),
  });
  const outlineMutation = useMutation({
    mutationFn: () =>
      api<{ outline?: unknown }>("/presentations/outline", {
        method: "POST",
        body: { assetId: assetId || undefined, title: title || undefined, theme, prompt: prompt || undefined },
      }),
    onSuccess: (data) => {
      // Accept both the current `{ outline }` envelope and older direct-outline responses.
      const normalized = normalizeOutline(data.outline ?? data);
      if (!normalized) {
        toast("error", "服务返回了空的大纲，请重试");
        return;
      }
      setOutline(normalized);
      if (!title) setTitle(normalized.title);
      setStep(2);
      toast("success", "章节大纲已生成，可编辑后确认");
    },
    onError: (e: Error) => toast("error", `生成失败：${e.message}，可点击「生成大纲」重试`),
  });

  const confirmMutation = useMutation({
    mutationFn: () =>
      api<Asset>("/presentations/outline/confirm", {
        method: "POST",
        body: {
          title: outline?.title ?? title,
          theme: outline?.theme ?? theme,
          aspectRatio: outline?.aspectRatio ?? "16:9",
          sections: outline?.sections ?? [],
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

  const docAssets = (assets?.items ?? []).filter((a) =>
    sourceMode === "document"
      ? a.type === "document"
      : sourceMode === "report"
        ? a.type === "report"
        : ["document", "report"].includes(a.type),
  );
  const recentAssets = (assets?.items ?? [])
    .slice()
    .sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""))
    .slice(0, 4);

  const updateSection = (index: number, patch: Partial<Section>) => {
    setOutline((o) =>
      o ? { ...o, sections: o.sections.map((s, i) => (i === index ? { ...s, ...patch } : s)) } : o,
    );
  };
  const updatePoints = (index: number, value: string) => {
    updateSection(index, {
      points: value
        .split("\n")
        .map((p) => p.trim())
        .filter(Boolean),
    });
  };

  const removeSection = (index: number) => {
    setOutline((o) => o && { ...o, sections: o.sections.filter((_, i) => i !== index) });
  };
  const addSection = () => {
    setOutline((o) =>
      o
        ? {
            ...o,
            sections: [
              ...o.sections,
              {
                id: `sec-${Date.now().toString(36)}`,
                title: "新章节",
                summary: "",
                points: [],
                data: [],

                visual: "default",
              },
            ],
          }
        : o,
    );
  };


  return (
    <div className="sg-workflow-page">

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
              { mode: "document", label: "从文档选择", sub: "从文档中提取内容，智能生成演示", icon: "📄" },
              { mode: "report", label: "从报告选择", sub: "基于研究报告快速生成专业演示", icon: "📊" },
              { mode: "template", label: "从模板创建", sub: "使用精选模板，快速创建演示", icon: "▣" },
              { mode: "ai", label: "AI 智能生成", sub: "输入主题，AI 帮你生成完整演示", icon: "✦" },
            ].map((item) => (
              <Card
                key={item.label}
                hoverable
                onClick={() => {
                  setSourceMode(item.mode as "document" | "report" | "template" | "ai");
                  setStep(2);
                }}
              >
                <div style={{ fontSize: 26, marginBottom: 8 }}>{item.icon}</div>
                <strong>{item.label}</strong>
                <p className="sg-subtle" style={{ margin: "6px 0" }}>
                  {item.sub}
                </p>
              </Card>
            ))}
          </div>
          <div className="sg-row">
            <Button type="text" onClick={() => toast("info", "请到知识库或数据集页上传文件")}>
              ⬆ 上传文件
            </Button>
            <Button type="text" onClick={() => setStep(2)}>
              空白演示
            </Button>
          </div>
          <h2 className="sg-h2 sg-mt">最近使用</h2>
          <div className="sg-grid" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
            {recentAssets.map((a) => (
              <Card
                key={a.id}
                hoverable
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
                  基于文档内容提炼「章节大纲」（断言式标题 + 要点 + 数据 +
                  视觉类型）。一个章节在生成时会展开为一页或多页。
                </p>
              </div>
              <div className="sg-row">
                <Button size="small" onClick={() => setStep(1)}>
                  返回
                </Button>
                <Button size="small" type="primary" disabled={!outline} onClick={() => setStep(3)}>
                  下一步：确认并生成
                </Button>
              </div>
            </div>
            <div className="sg-col sg-mt" style={{ gap: 16 }}>
              <div className="sg-grid" style={{ gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div>
                  <small className="sg-subtle" style={{ display: "block", marginBottom: 4 }}>
                    来源文档
                  </small>
                  <Select
                    showSearch
                    optionFilterProp="label"
                    value={assetId}
                    onChange={setAssetId}
                    options={[
                      { value: "", label: "不指定来源文档" },
                      ...docAssets.map((a) => ({ value: a.id, label: a.title })),
                    ]}
                    placeholder="搜索或选择来源文档…"
                    style={{ width: "100%" }}
                  />
                </div>
                <div>
                  <small className="sg-subtle" style={{ display: "block", marginBottom: 4 }}>
                    演示标题
                  </small>
                  <Input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="输入演示标题（可选）"
                    style={{ width: "100%" }}
                  />
                </div>
              </div>
              <div>
                <small className="sg-subtle" style={{ display: "block", marginBottom: 4 }}>
                  生成要求（可选）
                </small>
                <Input.TextArea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="补充生成指令，例如：侧重财务数据、面向高管汇报、控制在 6 页以内"
                  autoSize={{ minRows: 4, maxRows: 8 }}
                  style={{ width: "100%" }}
                />
              </div>
              <div className="sg-grid" style={{ gridTemplateColumns: "auto 1fr", gap: 16, alignItems: "end" }}>
                <div>
                  <small className="sg-subtle" style={{ display: "block", marginBottom: 4 }}>
                    演示风格
                  </small>
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
                    style={{ width: 200 }}
                  />
                </div>
                <div className="sg-row" style={{ justifyContent: "flex-end" }}>
                  <Button
                    type="primary"
                    disabled={(!assetId && !prompt) || outlineMutation.isPending}
                    onClick={() => outlineMutation.mutate()}
                  >
                    {outlineMutation.isPending ? <Spin size="small" /> : "生成大纲"}
                  </Button>
                </div>
              </div>
            </div>
          </Card>

          {outline && (
            <Card>
              <div className="sg-row-between sg-mb">
                <strong>AI 生成的章节大纲（共 {outline.sections.length} 章）</strong>
                <div className="sg-row">
                  <Button size="small" onClick={addSection}>
                    + 章节
                  </Button>
                  <Button size="small" onClick={() => outlineMutation.mutate()}>
                    重新生成
                  </Button>
                </div>
              </div>
              <div className="sg-col">
                {outline.sections.map((section, i) => (
                  <div key={section.id} className="sg-card" style={{ padding: 14 }}>
                    <div className="sg-row-between sg-mb-sm">
                      <span className="sg-badge">{i + 1}</span>
                      <div className="sg-row">
                        <Select
                          value={section.visual}
                          onChange={(v) => updateSection(i, { visual: v })}
                          options={VISUAL_OPTIONS}
                          style={{ width: 110 }}
                        />
                        <Button size="small" type="primary" danger onClick={() => removeSection(i)}>
                          删除
                        </Button>
                      </div>
                    </div>
                    <div className="sg-mb-sm">
                      <small className="sg-subtle" style={{ display: "block", marginBottom: 4 }}>
                        章节标题
                      </small>
                      <Input
                        value={section.title}
                        onChange={(e) => updateSection(i, { title: e.target.value })}
                        placeholder="断言式标题，如「营收同比增长 23%」"
                      />
                    </div>
                    <div className="sg-mb-sm">
                      <small className="sg-subtle" style={{ display: "block", marginBottom: 4 }}>
                        一句话概述（可选）
                      </small>
                      <Input
                        value={section.summary}
                        onChange={(e) => updateSection(i, { summary: e.target.value })}
                        placeholder="该章的一句话概述"
                      />
                    </div>
                    <div className="sg-mb-sm">
                      <small className="sg-subtle">要点（每行一条）</small>
                      <Input.TextArea
                        value={section.points.join("\n")}
                        onChange={(e) => updatePoints(i, e.target.value)}
                        style={{ minHeight: 72, marginTop: 4 }}
                      />
                    </div>
                  </div>
                ))}
              </div>
              <p className="sg-hint sg-mt">
                提示：章节标题建议用「结论先行」的完整句（如「AI 正加速渗透传统行业」）。
                一个章节在生成阶段会自动展开为一页或多页。
              </p>
            </Card>
          )}
        </div>
      )}

      {step === 3 && outline && (
        <div className="sg-col">
          <Card>
            <h2 className="sg-h3">确认生成内容</h2>
            <p className="sg-subtle">
              请确认以下章节大纲与风格设置，确认后将按大纲自动生成 H5 演示（章节可展开为多页），预计
              1-2 分钟完成。
            </p>
            <div className="sg-grid sg-mt" style={{ gridTemplateColumns: "1fr 1.4fr" }}>
              <div className="sg-col">
                <div className="sg-option-row">
                  <span>演示标题</span>
                  <strong>{outline.title}</strong>
                </div>
                <div className="sg-option-row">
                  <span>章节数</span>
                  <strong>{outline.sections.length} 章</strong>
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
                  <span>内容来源</span>
                  <strong>{docAssets.find((a) => a.id === assetId)?.title ?? title}</strong>
                </div>
              </div>
              <Card>
                <h3 className="sg-h3">章节预览（共 {outline.sections.length} 章）</h3>
                <div className="sg-col sg-mt-sm">
                  {outline.sections.map((section, i) => (
                    <div key={section.id} className="sg-row">
                      <span className="sg-badge">{String(i + 1).padStart(2, "0")}</span>
                      <span style={{ fontSize: 13 }}>{section.title || "未命名"}</span>
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          </Card>
          <div className="sg-row" style={{ justifyContent: "flex-end" }}>
            <Button onClick={() => setStep(2)}>上一步</Button>
            <Button
              type="primary"
              onClick={() => confirmMutation.mutate()}
              disabled={confirmMutation.isPending}
            >
              {confirmMutation.isPending ? <Spin size="small" /> : "确认生成"}
            </Button>
          </div>
        </div>
      )}

      {step === 4 && (
        <Card className="sg-center" style={{ padding: 48 }}>
          <Spin />
          <p className="sg-subtle sg-mt">演示已生成，正在进入编辑器…</p>
        </Card>
      )}
    </div>
  );
}
