import { Empty, Field, useToast } from "@shiguang/ui";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button, Card, Checkbox, Input, Select, Spin } from "antd";
import { createStyles } from "antd-style";
import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api, type Task, type Template } from "../../entities/api.js";

const useResearchStyles = createStyles(() => ({
  taskMeta: { margin: "6px 0 0" },
  twoColumns: {
    gridTemplateColumns: "1fr 1fr",
    "@media (max-width: 760px)": { gridTemplateColumns: "1fr" },
  },
  previewActions: { marginBottom: 16 },
  scopeItem: { cursor: "pointer" },
}));

export function ResearchPage() {
  const { styles } = useResearchStyles();
  const navigate = useNavigate();
  const { data } = useQuery<{ items: Task[]; total: number }>({
    queryKey: ["tasks", "research"],
    queryFn: () => api("/tasks", { params: { status: "all", limit: 50 } }),
  });
  const research = (data?.items ?? []).filter((t) => t.type === "research");
  return (
    <div>
      <div className="sg-row-between sg-mb">
        <div>
          <h1 className="sg-h1">深度调研</h1>
          <p className="sg-subtle">输入目标 → AI 推荐范围 → 后台执行 → 输出报告、来源与数据。</p>
        </div>
        <Button type="primary" onClick={() => navigate("/research/new")}>
          + 新建调研
        </Button>
      </div>
      {research.length === 0 ? (
        <Empty
          title="还没有调研任务"
          hint="发起一次行业研究、竞品分析或主题调研。"
          action={
            <Button type="primary" onClick={() => navigate("/research/new")}>
              新建调研
            </Button>
          }
        />
      ) : (
        <div className="sg-col">
          {research.map((task) => (
            <Card key={task.id} onClick={() => navigate(`/tasks/${task.id}`)} hoverable>
              <div className="sg-row-between">
                <strong>{task.goal}</strong>
                <span
                  className={`sg-badge ${task.status === "completed" ? "sg-badge-success" : task.status.includes("fail") ? "sg-badge-danger" : "sg-badge-accent"}`}
                >
                  {task.status}
                </span>
              </div>
              <p className={`sg-subtle ${styles.taskMeta}`}>{task.currentStep || "排队中"}</p>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

interface ScopeItem {
  id: string;
  label: string;
  enabled: boolean;
}

export function ResearchNewPage() {
  const { styles } = useResearchStyles();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [goal, setGoal] = useState(params.get("goal") ?? "");
  const [region, setRegion] = useState("全球");
  const [timeRange, setTimeRange] = useState("最近 12 个月");
  const [depth, setDepth] = useState("standard");
  const [quality, setQuality] = useState("balanced");
  const [outputs, setOutputs] = useState<string[]>(["report", "sources"]);
  const [scope, setScope] = useState<ScopeItem[]>([]);
  const [useTemplate, setUseTemplate] = useState(params.get("template") ?? "");

  const { data: templates } = useQuery<Template[]>({
    queryKey: ["templates", "research"],
    queryFn: () => api("/templates", { params: { type: "research" } }),
  });

  const previewMutation = useMutation({
    mutationFn: () =>
      api<{ scope: ScopeItem[]; region: string; timeRange: string }>("/research/specs:preview", {
        method: "POST",
        body: { goal, region },
      }),
    onSuccess: (data) => {
      setScope(data.scope);
      setRegion(data.region);
      setTimeRange(data.timeRange);
      toast("success", "AI 已生成推荐研究范围，可调整后再创建任务");
    },
    onError: (e: Error) => toast("error", e.message),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      api<{ task: Task }>("/research/tasks", {
        method: "POST",
        body: { goal, region, timeRange, depth, quality, outputs, scope },
      }),
    onSuccess: (data) => {
      toast("success", "任务已创建");
      navigate(`/tasks/${data.task.id}`);
    },
    onError: (e: Error) => toast("error", e.message),
  });

  useEffect(() => {
    if (useTemplate) {
      const template = templates?.find((t) => t.id === useTemplate);
      if (template) {
        const content = template.content as {
          scope?: ScopeItem[];
          depth?: string;
          quality?: string;
          outputs?: string[];
        };
        if (content.scope) setScope(content.scope);
        if (content.depth) setDepth(content.depth);
        if (content.quality) setQuality(content.quality);
        if (content.outputs) setOutputs(content.outputs);
      }
    }
  }, [useTemplate, templates]);

  const toggleOutput = (o: string) => {
    setOutputs((prev) => (prev.includes(o) ? prev.filter((x) => x !== o) : [...prev, o]));
  };
  const toggleScope = (id: string) => {
    setScope((prev) => prev.map((s) => (s.id === id ? { ...s, enabled: !s.enabled } : s)));
  };

  return (
    <div className="sg-workflow-page sg-research-workflow">
      <h1 className="sg-h1 sg-mb">新建深度调研</h1>
      <Card>
        <Field label="研究目标" hint="用自然语言描述你想研究的问题，例如：帮我分析越南消费金融市场">
          <Input
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            placeholder="输入研究目标…"
          />
        </Field>

        <div className={`sg-grid ${styles.twoColumns}`}>
          <Field label="地区">
            <Input value={region} onChange={(e) => setRegion(e.target.value)} />
          </Field>
          <Field label="时间范围">
            <Input value={timeRange} onChange={(e) => setTimeRange(e.target.value)} />
          </Field>
        </div>

        <div className={`sg-grid ${styles.twoColumns}`}>
          <Field label="研究深度">
            <Select
              value={depth}
              onChange={setDepth}
              options={[
                { value: "quick", label: "快速" },
                { value: "standard", label: "标准" },
                { value: "deep", label: "深度" },
              ]}
            />
          </Field>
          <Field label="质量模式">
            <Select
              value={quality}
              onChange={setQuality}
              options={[
                { value: "economy", label: "经济" },
                { value: "balanced", label: "均衡" },
                { value: "best", label: "最佳" },
              ]}
            />
          </Field>
        </div>

        <Field label="输出选择">
          <div className="sg-row sg-wrap">
            {["report", "sources", "dataset", "presentation"].map((o) => (
              <button
                key={o}
                type="button"
                className={`sg-btn sg-btn-sm ${outputs.includes(o) ? "sg-btn-primary" : ""}`}
                onClick={() => toggleOutput(o)}
              >
                {o === "report"
                  ? "报告"
                  : o === "sources"
                    ? "来源"
                    : o === "dataset"
                      ? "数据"
                      : "演示"}
              </button>
            ))}
          </div>
        </Field>

        <div className={`sg-row ${styles.previewActions}`}>
          <Button
            onClick={() => previewMutation.mutate()}
            disabled={!goal.trim() || previewMutation.isPending}
          >
            {previewMutation.isPending ? <Spin size="small" /> : "AI 生成推荐范围"}
          </Button>
          <span className="sg-hint">复杂调研建议先让 AI 生成可调整的研究范围。</span>
        </div>

        {scope.length > 0 && (
          <Field label="研究范围（可增删改）">
            <div className="sg-col">
              {scope.map((item) => (
                <Checkbox
                  key={item.id}
                  className={`sg-row ${styles.scopeItem}`}
                  checked={item.enabled}
                  onChange={() => toggleScope(item.id)}
                >
                  {item.label}
                </Checkbox>
              ))}
            </div>
          </Field>
        )}

        {templates && templates.length > 0 && (
          <Field label="使用模板">
            <Select
              value={useTemplate}
              onChange={(v) => setUseTemplate(v)}
              options={[
                { value: "", label: "不使用模板" },
                ...templates.map((t) => ({ value: t.id, label: t.name })),
              ]}
            />
          </Field>
        )}

        <Button
          type="primary"
          size="large"
          disabled={!goal.trim() || createMutation.isPending}
          onClick={() => createMutation.mutate()}
        >
          {createMutation.isPending ? "创建中…" : "创建并开始调研"}
        </Button>
        <p className="sg-hint">创建后任务在后台执行，关闭页面也不会中断；完成后会通知你。</p>
      </Card>
    </div>
  );
}
