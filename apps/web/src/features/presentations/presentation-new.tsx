import { useToast } from "@shiguang/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Card, Input, Select, Tooltip, Typography } from "antd";
import {
  ArrowLeft,
  BrainCircuit,
  Check,
  Circle,
  CircleX,
  Eye,
  FileText,
  Layers3,
  LoaderCircle,
  PanelTop,
  RotateCcw,
  Save,
  ScanSearch,
  Sparkles,
  Square,
  WandSparkles,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { type Asset, api, type Task, type TaskStreamEvent } from "../../entities/api.js";
import { ChatStreamChunk } from "../../shared/chat-stream-chunk.js";
import { usePresentationsStyles } from "../../styles/presentations.js";
import { latestPlanningStream } from "./presentation-planning-stream.js";

const profiles = [
  { value: "research", label: "研究分析" },
  { value: "pitch", label: "商业提案" },
  { value: "product-launch", label: "产品发布" },
  { value: "data-story", label: "数据故事" },
];

const phaseOrder = [
  { id: "source", label: "准备资料", icon: FileText },
  { id: "planning", label: "深度规划", icon: BrainCircuit },
  { id: "rendering", label: "生成页面", icon: Layers3 },
  { id: "visualizing", label: "真实渲染", icon: ScanSearch },
  { id: "reviewing", label: "视觉审查", icon: Sparkles },
  { id: "repairing", label: "定向修复", icon: WandSparkles },
  { id: "compiling", label: "编译编辑能力", icon: PanelTop },
  { id: "saving", label: "保存演示", icon: Save },
] as const;

type GenerationPhase = (typeof phaseOrder)[number]["id"] | "failed" | "cancelled";
type GenerationActivity = "waiting" | "reasoning" | "streaming" | "processing" | "done" | "failed";

interface PresentationPlan {
  audience?: string;
  coreMessage?: string;
  narrative?: string;
  visualDirection?: string;
  style?: string;
  density?: "speaker-led" | "reading-first";
  selectedStyle?: string;
  styleCandidates?: Array<{ name?: string; thesis?: string; fit?: string }>;
  designSystem?: {
    visualThesis?: string;
    displayFont?: string;
    bodyFont?: string;
    grid?: string;
    chartLanguage?: string;
  };
  slides?: Array<{
    title?: string;
    purpose?: string;
    layoutIntent?: string;
    visualType?: string;
    contentBudget?: string;
    focalPoint?: string;
    composition?: string;
    visualBrief?: string;
  }>;
}

interface PresentationCheckpoint {
  schema?: string;
  phase?: GenerationPhase;
  phaseLabel?: string;
  activity?: GenerationActivity;
  startedAt?: string;
  updatedAt?: string;
  receivedChars?: number;
  completedPages?: number;
  estimatedPages?: number;
  pageTitles?: string[];
  plan?: PresentationPlan;
  reviewSummary?: string;
  renderSummary?: string;
  renderIssueCount?: number;
  repairApplied?: boolean;
  repairPages?: number[];
  repairingPages?: number[];
  verifyingPages?: number[];
  repairFailedPages?: number[];
  repairedPages?: number[];
  renderingPages?: number[];
  renderedPages?: number[];
  reviewingPages?: number[];
  reviewedPages?: number[];
  compilingPages?: number[];
  compiledPages?: number[];
  repairPass?: number;
  stoppedAtPhase?: GenerationPhase;
  failureStage?: string;
  failureDetails?: Record<string, unknown>;
  errorCode?: string;
  errorMessage?: string;
}

interface PresentationDraft {
  assetId?: string | null;
  title?: string;
  prompt?: string;
  profile?: string;
  theme?: string;
}

function asCheckpoint(task?: Task): PresentationCheckpoint {
  return (task?.checkpoint ?? {}) as PresentationCheckpoint;
}

function formatDuration(start?: string, end?: string): string {
  if (!start) return "刚刚开始";
  const seconds = Math.max(
    0,
    Math.floor(((end ? new Date(end).getTime() : Date.now()) - new Date(start).getTime()) / 1000),
  );
  if (seconds < 60) return `${seconds} 秒`;
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return `${minutes} 分 ${remaining} 秒`;
}

function useElapsed(start?: string, end?: string, active = false): string {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!active || !start) return;
    const timer = window.setInterval(() => setTick((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [active, start]);
  return useMemo(() => formatDuration(start, end), [start, end, tick]);
}

function activityLabel(activity?: GenerationActivity): string {
  if (activity === "reasoning") return "模型正在深度推理";
  if (activity === "streaming") return "模型正在持续输出";
  if (activity === "processing") return "系统正在处理";
  if (activity === "done") return "阶段已完成";
  if (activity === "failed") return "阶段失败";
  return "等待模型响应";
}

type PageProgressKind = "pending" | "processing" | "done";

function pageProgress(input: {
  checkpoint: PresentationCheckpoint;
  phase: GenerationPhase;
  pageNumber: number;
  pageCount: number;
  generatedCount: number;
}): { kind: PageProgressKind; label: string; repair: boolean } {
  const { checkpoint, phase, pageNumber, pageCount, generatedCount } = input;
  const repairPages = checkpoint.repairPages ?? [];
  const repairingPages = checkpoint.repairingPages ?? [];
  const verifyingPages = checkpoint.verifyingPages ?? [];
  const repairFailedPages = checkpoint.repairFailedPages ?? [];
  const repairedPages = checkpoint.repairedPages ?? [];
  if (phase === "repairing") {
    if (repairingPages.includes(pageNumber)) {
      return { kind: "processing", label: "修复中", repair: true };
    }
    if (verifyingPages.includes(pageNumber)) {
      return { kind: "processing", label: "复检中", repair: true };
    }
    if (repairedPages.includes(pageNumber)) {
      return { kind: "done", label: "修复完成", repair: true };
    }
    if (repairFailedPages.includes(pageNumber)) {
      return { kind: "pending", label: "待重新修复", repair: true };
    }
    if (repairPages.includes(pageNumber) && !repairedPages.includes(pageNumber)) {
      return { kind: "pending", label: "待修复", repair: true };
    }
  }

  if (phase === "rendering") {
    if (pageNumber <= generatedCount) return { kind: "done", label: "已生成", repair: false };
    if (pageNumber === generatedCount + 1 && generatedCount < pageCount) {
      return { kind: "processing", label: "生成中", repair: false };
    }
    return { kind: "pending", label: "待生成", repair: false };
  }

  const renderedPages = checkpoint.renderedPages ?? [];
  const renderingPages = checkpoint.renderingPages ?? [];
  if (phase === "visualizing") {
    if (renderingPages.includes(pageNumber)) {
      return { kind: "processing", label: "渲染中", repair: false };
    }
    if (renderedPages.includes(pageNumber)) {
      return { kind: "done", label: "已渲染", repair: false };
    }
    return { kind: "pending", label: "待渲染", repair: false };
  }

  const reviewedPages = checkpoint.reviewedPages ?? [];
  const reviewingPages = checkpoint.reviewingPages ?? [];
  if (phase === "reviewing") {
    if (reviewingPages.includes(pageNumber)) {
      return { kind: "processing", label: "审查中", repair: false };
    }
    if (reviewedPages.includes(pageNumber)) {
      return { kind: "done", label: "已审查", repair: false };
    }
    return { kind: "pending", label: "待审查", repair: false };
  }

  const compiledPages = checkpoint.compiledPages ?? [];
  const compilingPages = checkpoint.compilingPages ?? [];
  if (phase === "compiling") {
    if (compilingPages.includes(pageNumber)) {
      return { kind: "processing", label: "编译中", repair: false };
    }
    if (compiledPages.includes(pageNumber)) {
      return { kind: "done", label: "已编译", repair: false };
    }
    return { kind: "pending", label: "待编译", repair: false };
  }

  const phaseIndex = phaseOrder.findIndex((item) => item.id === phase);
  const visualizingIndex = phaseOrder.findIndex((item) => item.id === "visualizing");
  const reviewingIndex = phaseOrder.findIndex((item) => item.id === "reviewing");
  const compilingIndex = phaseOrder.findIndex((item) => item.id === "compiling");
  if (phaseIndex > compilingIndex) {
    return { kind: "done", label: "已编译", repair: false };
  }
  if (phaseIndex > reviewingIndex) {
    return { kind: "done", label: "已审查", repair: false };
  }
  if (phaseIndex > visualizingIndex) {
    return { kind: "done", label: "已渲染", repair: false };
  }
  return { kind: "pending", label: "等待前序阶段", repair: false };
}

export function PresentationNewPage() {
  const { styles } = usePresentationsStyles();
  const { taskId } = useParams<{ taskId?: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [params] = useSearchParams();
  const toast = useToast();
  const routeDraft = (location.state as { draft?: PresentationDraft } | null)?.draft;
  const [assetId, setAssetId] = useState(routeDraft?.assetId ?? params.get("assetId") ?? "");
  const [title, setTitle] = useState(routeDraft?.title ?? "我的在线演示");
  const [prompt, setPrompt] = useState(routeDraft?.prompt ?? "");
  const [profile, setProfile] = useState(routeDraft?.profile ?? "research");
  const [theme, setTheme] = useState(routeDraft?.theme ?? "dark");

  const assets = useQuery({
    queryKey: ["presentation-source-assets"],
    queryFn: () => api<{ items: Asset[] }>("/assets", { params: { limit: 100 } }),
    enabled: !taskId,
  });
  const task = useQuery({
    queryKey: ["presentation-generation-task", taskId],
    queryFn: () => api<Task>(`/tasks/${taskId}`),
    enabled: Boolean(taskId),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === "completed" || status === "failed" || status === "cancelled"
        ? false
        : 2_000;
    },
  });
  const taskStream = useQuery({
    queryKey: ["presentation-generation-stream", taskId],
    queryFn: () =>
      api<{ taskId: string; events: TaskStreamEvent[] }>(`/tasks/${taskId}/stream`, {
        params: { limit: 2000 },
      }),
    enabled: Boolean(taskId),
    refetchInterval: () => {
      const status = task.data?.status;
      const checkpoint = asCheckpoint(task.data);
      return status === "completed" ||
        status === "failed" ||
        status === "cancelled" ||
        checkpoint.plan
        ? false
        : 1_000;
    },
  });

  const generate = useMutation({
    mutationFn: () =>
      api<{ task: Task }>("/presentations/generate", {
        method: "POST",
        body: {
          ...(assetId ? { assetId } : {}),
          title,
          prompt,
          profile,
          theme,
          operation: "asset",
        },
      }),
    onSuccess: (result) => {
      navigate(`/presentations/generate/${result.task.id}`, { replace: true });
    },
    onError: (error) => toast("error", error instanceof Error ? error.message : "生成失败"),
  });

  const cancel = useMutation({
    mutationFn: () => api<Task>(`/tasks/${taskId}/cancel`, { method: "POST" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["presentation-generation-task", taskId],
      });
    },
    onError: (error) => toast("error", error instanceof Error ? error.message : "取消失败"),
  });

  const retry = useMutation({
    mutationFn: () => api<{ ok: boolean }>(`/tasks/${taskId}/retry`, { method: "POST" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["presentation-generation-task", taskId],
      });
    },
    onError: (error) => toast("error", error instanceof Error ? error.message : "重试失败"),
  });

  useEffect(() => {
    const current = task.data;
    if (current?.status !== "completed") return;
    const output = current.outputs?.[0];
    if (output?.id) navigate(`/presentations/${output.id}`, { replace: true });
  }, [task.data, navigate]);

  const sourceAssets = (assets.data?.items ?? []).filter((item) =>
    ["document", "report", "text"].includes(item.type),
  );
  const taskActive = Boolean(
    task.data && !["completed", "failed", "cancelled"].includes(task.data.status),
  );
  const elapsed = useElapsed(
    asCheckpoint(task.data).startedAt ?? task.data?.startedAt ?? task.data?.createdAt,
    taskActive ? undefined : (task.data?.completedAt ?? undefined),
    taskActive,
  );

  if (taskId) {
    return (
      <div className={`${styles.root} sg-presentation-generation-root`}>
        <GenerationWorkspace
          taskId={taskId}
          task={task.data}
          streamEvents={taskStream.data?.events ?? []}
          loading={task.isLoading}
          loadError={
            task.isError
              ? task.error instanceof Error
                ? task.error.message
                : "任务加载失败"
              : null
          }
          cancelling={cancel.isPending}
          retrying={retry.isPending}
          onCancel={() => cancel.mutate()}
          onRetry={() => retry.mutate()}
          onEdit={() => {
            const draft = (task.data?.spec ?? {}) as PresentationDraft;
            navigate("/presentations/new", { state: { draft } });
          }}
          elapsed={elapsed}
        />
      </div>
    );
  }

  return (
    <div className={styles.root}>
      <main className="sg-pg-new">
        <header className="sg-pg-new-hero">
          <div>
            <span className="sg-pg-kicker">
              <Sparkles size={14} />
              AI PRESENTATION STUDIO
            </span>
            <h1>把主题变成一场有叙事、有画面的演示</h1>
            <p>
              AI 先推演受众、叙事和视觉方向，再自由生成完整 HTML
              画布；系统最后只增加可编辑标签，不把创意压回固定模板。
            </p>
          </div>
          <div className="sg-pg-capabilities">
            <span>自由布局</span>
            <span>图表与图解</span>
            <span>分步动画</span>
            <span>局部可编辑</span>
          </div>
        </header>

        <Card className="sg-pg-form-card">
          <div className="sg-pg-form-grid">
            <section className="sg-pg-form-main">
              <label htmlFor="presentation-title">
                <span>演示标题</span>
                <Input
                  id="presentation-title"
                  size="large"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="输入一个清晰的主题"
                />
              </label>
              <label className="sg-pg-prompt-field" htmlFor="presentation-prompt">
                <span>你希望这场演示达成什么</span>
                <Input.TextArea
                  id="presentation-prompt"
                  autoSize={{ minRows: 9, maxRows: 15 }}
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                  placeholder="例如：面向管理层解释北京文旅市场的增长机会。需要有强视觉封面、北京城市图片、趋势图、机会四象限和三阶段行动路径；风格现代、克制。"
                />
              </label>
            </section>

            <aside className="sg-pg-form-options">
              <label htmlFor="presentation-source">
                <span>参考资料</span>
                <Select
                  id="presentation-source"
                  size="large"
                  allowClear
                  value={assetId || undefined}
                  onChange={(value) => setAssetId(value ?? "")}
                  loading={assets.isLoading}
                  options={sourceAssets.map((asset) => ({ value: asset.id, label: asset.title }))}
                  placeholder="可选：读取已有文档或报告"
                />
              </label>
              <label htmlFor="presentation-profile">
                <span>叙事类型</span>
                <Select
                  id="presentation-profile"
                  size="large"
                  value={profile}
                  onChange={setProfile}
                  options={profiles}
                />
              </label>
              <label htmlFor="presentation-theme">
                <span>视觉基调</span>
                <Select
                  id="presentation-theme"
                  size="large"
                  value={theme}
                  onChange={setTheme}
                  options={[
                    { value: "dark", label: "深色沉浸" },
                    { value: "light", label: "明亮编辑感" },
                    { value: "brand", label: "品牌表达" },
                    { value: "minimal", label: "极简克制" },
                  ]}
                />
              </label>
              <div className="sg-pg-form-note">
                <BrainCircuit size={18} />
                <div>
                  <strong>会进行深度规划</strong>
                  <p>复杂推理用于叙事与审查；HTML 使用流式生成，因此可以看到模型是否在正常工作。</p>
                </div>
              </div>
            </aside>
          </div>
          <footer className="sg-pg-form-footer">
            <span>生成期间可以离开此页面，任务会继续执行。</span>
            <Button
              type="primary"
              size="large"
              icon={<Sparkles size={17} />}
              loading={generate.isPending}
              disabled={!title.trim() && !prompt.trim() && !assetId}
              onClick={() => generate.mutate()}
            >
              开始生成
            </Button>
          </footer>
        </Card>
      </main>
    </div>
  );
}

function GenerationWorkspace({
  taskId,
  task,
  streamEvents,
  loading,
  loadError,
  cancelling,
  retrying,
  elapsed,
  onCancel,
  onRetry,
  onEdit,
}: {
  taskId: string;
  task?: Task;
  streamEvents: TaskStreamEvent[];
  loading: boolean;
  loadError: string | null;
  cancelling: boolean;
  retrying: boolean;
  elapsed: string;
  onCancel: () => void;
  onRetry: () => void;
  onEdit: () => void;
}) {
  const navigate = useNavigate();
  const checkpoint = asCheckpoint(task);
  const planningStream = useMemo(
    () => latestPlanningStream(streamEvents, checkpoint.startedAt),
    [checkpoint.startedAt, streamEvents],
  );
  const planningStreamRef = useRef<HTMLDivElement>(null);
  const terminal = Boolean(
    loadError || (task && ["completed", "failed", "cancelled"].includes(task.status)),
  );
  const failed = task?.status === "failed" || Boolean(loadError);
  const cancelled = task?.status === "cancelled";
  const retryable = task?.status === "failed" || task?.status === "cancelled";
  const phase = checkpoint.phase ?? "source";
  const effectivePhase = checkpoint.stoppedAtPhase ?? phase;
  const currentIndex = phaseOrder.findIndex((item) => item.id === effectivePhase);
  const progress = task?.progress ?? 0;
  const pageTitles = checkpoint.pageTitles ?? [];
  const planSlides = checkpoint.plan?.slides ?? [];
  const outputPageCount = phase === "rendering" ? pageTitles.length : planSlides.length;
  const errorMessage =
    loadError ?? checkpoint.errorMessage ?? task?.error ?? "任务执行失败，请重试。";
  const errorCode = checkpoint.errorCode ?? task?.error?.match(/^\[([^\]]+)\]/)?.[1];
  const errorSummary = errorMessage.replace(/^\[[^\]]+\]\s*/, "").trim();
  const stoppedPhaseLabel = phaseOrder.find((item) => item.id === checkpoint.stoppedAtPhase)?.label;
  const modelOutput =
    checkpoint.failureDetails && typeof checkpoint.failureDetails.modelOutput === "object"
      ? (checkpoint.failureDetails.modelOutput as Record<string, unknown>)
      : null;
  const retryInfo =
    checkpoint.failureDetails && typeof checkpoint.failureDetails.retry === "object"
      ? (checkpoint.failureDetails.retry as Record<string, unknown>)
      : null;
  const planningIsStreaming = !terminal && phase === "planning" && !checkpoint.plan;

  // The deck exists once generation moves past the rendering stage (or the run
  // finished). The snapshot entry on the "生成页面" stage node stays available
  // from then on — not only when the task failed. Rendering "done" is included
  // because the snapshot blob is written right after the real render, so the
  // entry should appear as soon as that stage completes.
  const renderingIndex = phaseOrder.findIndex((item) => item.id === "rendering");
  const canViewSnapshot = Boolean(
    taskId &&
      (currentIndex > renderingIndex ||
        (phase === "rendering" && checkpoint.activity === "done") ||
        progress >= 100 ||
        (failed && currentIndex === renderingIndex)),
  );

  const snapshotQuery = useQuery<{
    schema: string;
    html: string;
    updatedAt: string;
  }>({
    queryKey: ["presentation-snapshot", taskId],
    queryFn: () => api(`/tasks/${taskId}/presentation-snapshot`),
    enabled: canViewSnapshot,
    retry: 2,
    // The review-resume blob is written by the worker right after the real
    // render finishes, so the very first probe can race ahead of it and 404.
    // Keep polling until the html snapshot actually exists, then stop.
    refetchInterval: (query) => (query.state.data?.html ? false : 5_000),
  });

  useEffect(() => {
    const streamElement = planningStreamRef.current;
    if (!streamElement || !planningStream) return;
    streamElement.scrollTop = streamElement.scrollHeight;
  }, [planningStream]);

  return (
    <main className="sg-pg-workspace">
      <header className="sg-pg-workspace-head">
        <div>
          <span className="sg-pg-kicker">
            <WandSparkles size={14} />
            GENERATION WORKSPACE
          </span>
          <h1>{task?.goal || "正在准备演示生成任务"}</h1>
          <p>
            任务 <code>{taskId}</code> · 已运行 {elapsed}
          </p>
        </div>
        <div className="sg-pg-head-actions">
          {!terminal && (
            <Button
              icon={<Square size={14} />}
              loading={cancelling}
              disabled={loading}
              onClick={onCancel}
            >
              停止生成
            </Button>
          )}
          {(failed || cancelled) && (
            <>
              <Button icon={<ArrowLeft size={15} />} onClick={onEdit}>
                返回
              </Button>
              {retryable && (
                <Button
                  type="primary"
                  icon={<RotateCcw size={15} />}
                  loading={retrying}
                  onClick={onRetry}
                >
                  重试
                </Button>
              )}
            </>
          )}
        </div>
      </header>

      <section
        className={`sg-pg-progress-card ${failed || cancelled ? "is-error" : ""} ${!terminal ? "is-active" : ""}`}
      >
        <div className="sg-pg-progress-copy">
          <div className={`sg-pg-live ${failed || cancelled ? "is-error" : ""}`}>
            {failed || cancelled ? (
              <CircleX size={18} />
            ) : (
              <LoaderCircle className="sg-spin" size={18} />
            )}
            <span>
              {failed
                ? "生成失败"
                : cancelled
                  ? "任务已取消"
                  : (checkpoint.phaseLabel ?? task?.currentStep ?? "任务排队中")}
            </span>
          </div>
          <strong>{progress}%</strong>
        </div>
        <div
          className="sg-pg-progress-track"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progress}
        >
          <i style={{ width: `${progress}%` }} />
        </div>
        <div className="sg-pg-progress-meta">
          <span>
            {failed || cancelled ? "流程已停止" : activityLabel(checkpoint.activity)}
            {failed || cancelled ? (
              <Tooltip title={errorSummary} placement="topLeft">
                <Typography.Text
                  className="sg-pg-progress-error-text"
                  ellipsis={{ tooltip: false }}
                >
                  {errorSummary}
                </Typography.Text>
              </Tooltip>
            ) : null}
          </span>
          <span>
            {checkpoint.receivedChars?.toLocaleString() ?? 0} 字符 ·{" "}
            {checkpoint.completedPages ?? 0}
            {checkpoint.estimatedPages ? ` / ${checkpoint.estimatedPages}` : ""} 页
          </span>
        </div>
      </section>

      <div className="sg-pg-workspace-grid">
        <section className="sg-pg-pipeline">
          <div className="sg-pg-section-head">
            <div>
              <span>生成流程</span>
              <h2>真实阶段状态</h2>
            </div>
            <small>进度由服务端任务统一管理</small>
          </div>
          <ol>
            {phaseOrder.map((item, index) => {
              const Icon = item.icon;
              const isCurrent = !terminal && item.id === phase;
              const isFailed = (failed || cancelled) && item.id === checkpoint.stoppedAtPhase;
              const isDone =
                progress === 100 ||
                currentIndex > index ||
                (item.id === phase && checkpoint.activity === "done");
              const isSkipped =
                item.id === "repairing" &&
                currentIndex > index &&
                checkpoint.repairApplied !== true;
              return (
                <li
                  key={item.id}
                  className={[
                    isCurrent ? "is-current" : "",
                    isFailed ? "is-failed" : "",
                    isDone ? "is-done" : "",
                    isSkipped ? "is-skipped" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  <span className="sg-pg-step-icon">
                    {isDone ? (
                      <Check size={16} />
                    ) : isFailed ? (
                      <X size={15} />
                    ) : isCurrent ? (
                      <LoaderCircle className="sg-spin" size={16} />
                    ) : (
                      <Circle size={14} />
                    )}
                  </span>
                  <Icon size={18} />
                  <div>
                    <strong>{item.label}</strong>
                    <small>
                      {isSkipped
                        ? "无需修复"
                        : isFailed
                          ? cancelled
                            ? "在此阶段停止"
                            : "在此阶段失败"
                          : isCurrent
                            ? activityLabel(checkpoint.activity)
                            : isDone
                              ? "已完成"
                              : "等待前序阶段"}
                    </small>
                  </div>
                  {item.id === "rendering" && snapshotQuery.data?.html && (
                    <button
                      type="button"
                      className="sg-pg-snapshot-link"
                      onClick={() => navigate(`/presentations/snapshot/${taskId}`)}
                    >
                      <Eye size={13} />
                      查看生成快照
                    </button>
                  )}
                </li>
              );
            })}
          </ol>
        </section>

        <section className={`sg-pg-output ${failed || cancelled ? "is-error" : ""}`}>
          <div className="sg-pg-section-head">
            <div>
              <span>实时产物</span>
              <h2>
                {failed
                  ? "阶段异常"
                  : cancelled
                    ? "任务已取消"
                    : outputPageCount
                      ? phase === "rendering"
                        ? "页面正在逐页成形"
                        : phase === "visualizing"
                          ? "页面正在真实渲染"
                          : phase === "reviewing"
                            ? "页面正在接受视觉审查"
                            : phase === "compiling"
                              ? "页面正在编译编辑能力"
                              : "页面已进入后处理"
                      : "等待页面输出"}
              </h2>
            </div>
            <small>
              {failed || cancelled
                ? "生成已停止"
                : `${outputPageCount} 页${phase === "rendering" ? "已闭合" : "已进入当前阶段"}`}
            </small>
          </div>
          {failed || cancelled ? (
            <div className="sg-pg-output-error">
              <div className="sg-pg-output-error-heading">
                <div className="sg-pg-error-icon">
                  <X size={18} />
                </div>
                <div>
                  <strong>{cancelled ? "任务已取消" : "生成阶段未完成"}</strong>
                  <Tooltip title={errorSummary} placement="topLeft">
                    <Typography.Paragraph
                      className="sg-pg-error-summary"
                      ellipsis={{ rows: 3, tooltip: false }}
                    >
                      {errorSummary}
                    </Typography.Paragraph>
                  </Tooltip>
                </div>
              </div>
              <dl>
                <div>
                  <dt>失败阶段</dt>
                  <dd>{stoppedPhaseLabel ?? checkpoint.failureStage ?? "未知阶段"}</dd>
                </div>
                <div>
                  <dt>错误代码</dt>
                  <dd>{errorCode ?? (cancelled ? "GENERATION_CANCELLED" : "GENERATION_FAILED")}</dd>
                </div>
                {retryInfo && (
                  <div>
                    <dt>重试情况</dt>
                    <dd>
                      {String(retryInfo.retries ?? 0)} 次重试 / 共 {String(retryInfo.attempts ?? 1)}{" "}
                      次尝试
                    </dd>
                  </div>
                )}
                {modelOutput && (
                  <div>
                    <dt>模型输出</dt>
                    <dd>
                      {String(modelOutput.receivedChars ?? 0)} 字符 ·{" "}
                      {String(modelOutput.sectionOpenCount ?? 0)} 个页面节点 ·{" "}
                      {modelOutput.hasGeneratedSlidesMarker ? "包含" : "缺少"}页面 marker
                    </dd>
                  </div>
                )}
              </dl>
            </div>
          ) : (phase === "rendering" ? pageTitles.length : planSlides.length) ? (
            <div className="sg-pg-page-list">
              {(phase === "rendering" ? planSlides.slice(0, pageTitles.length) : planSlides).map(
                (slide, index) =>
                  (() => {
                    const pageNumber = index + 1;
                    const pageTitle = slide.title ?? pageTitles[index] ?? `第 ${pageNumber} 页`;
                    const progressState = pageProgress({
                      checkpoint,
                      phase,
                      pageNumber,
                      pageCount: planSlides.length,
                      generatedCount: pageTitles.length,
                    });
                    return (
                      <article
                        key={`${index}-${pageTitle}`}
                        className={[
                          progressState.repair ? "is-repair-target" : "",
                          progressState.kind === "processing" ? "is-page-processing" : "",
                          progressState.kind === "done" ? "is-page-done" : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                      >
                        <div className="sg-pg-page-number">
                          {String(index + 1).padStart(2, "0")}
                        </div>
                        <div>
                          <strong>{pageTitle}</strong>
                          <span>{planSlides[index]?.visualType ?? "自由画布"}</span>
                        </div>
                        <div className="sg-pg-page-status">
                          {progressState.kind === "processing" ? (
                            <>
                              <LoaderCircle className="sg-spin" size={14} />
                              <span>{progressState.label}</span>
                            </>
                          ) : progressState.kind === "pending" ? (
                            <>
                              {progressState.repair ? (
                                <WandSparkles size={14} />
                              ) : (
                                <Circle size={13} />
                              )}
                              <span>{progressState.label}</span>
                            </>
                          ) : (
                            <>
                              <Check size={14} />
                              <span>{progressState.label}</span>
                            </>
                          )}
                        </div>
                      </article>
                    );
                  })(),
              )}
            </div>
          ) : (
            <div className="sg-pg-output-empty">
              <LoaderCircle className="sg-spin" size={25} />
              <strong>{activityLabel(checkpoint.activity)}</strong>
              <p>模型的推理活动和输出流会持续更新在这里；页面只有完整闭合后才计数。</p>
            </div>
          )}
        </section>

        <section className="sg-pg-plan">
          <div className="sg-pg-section-head">
            <div>
              <span>创意计划</span>
              <h2>
                {checkpoint.plan
                  ? "AI 已确定叙事方向"
                  : planningStream
                    ? "正在流式形成创意计划"
                    : "正在形成创意计划"}
              </h2>
            </div>
            {!checkpoint.plan && planningStream && (
              <small>
                {(planningStream.reasoning.length + planningStream.content.length).toLocaleString()}{" "}
                字符
              </small>
            )}
          </div>
          {planningStream ? (
            <div
              ref={planningStreamRef}
              className="sg-pg-plan-stream"
              role="log"
              aria-live="polite"
              aria-label="AI 创意计划的思考过程和正文"
            >
              <div className="sg-pg-plan-stream-status">
                {planningIsStreaming ? (
                  <LoaderCircle className="sg-spin" size={14} />
                ) : (
                  <Check size={14} />
                )}
                <span>{planningIsStreaming ? "AI 正在深度规划" : "深度规划已完成"}</span>
              </div>
              <ChatStreamChunk
                reasoningContent={planningStream.reasoning}
                textContent={planningStream.content}
                streaming={planningIsStreaming}
              />
              {checkpoint.plan && (
                <dl>
                  <div>
                    <dt>核心信息</dt>
                    <dd>{checkpoint.plan.coreMessage}</dd>
                  </div>
                  <div>
                    <dt>目标受众</dt>
                    <dd>{checkpoint.plan.audience}</dd>
                  </div>
                  <div>
                    <dt>叙事路径</dt>
                    <dd>{checkpoint.plan.narrative}</dd>
                  </div>
                  <div>
                    <dt>视觉方向</dt>
                    <dd>{checkpoint.plan.visualDirection ?? checkpoint.plan.style}</dd>
                  </div>
                  {checkpoint.plan.selectedStyle && (
                    <div>
                      <dt>选定设计系统</dt>
                      <dd>
                        {checkpoint.plan.selectedStyle}
                        {checkpoint.plan.density
                          ? ` · ${checkpoint.plan.density === "speaker-led" ? "现场讲述" : "异步阅读"}`
                          : ""}
                      </dd>
                    </div>
                  )}
                  {checkpoint.plan.designSystem?.visualThesis && (
                    <div>
                      <dt>视觉论点</dt>
                      <dd>{checkpoint.plan.designSystem.visualThesis}</dd>
                    </div>
                  )}
                  {checkpoint.renderSummary && (
                    <div>
                      <dt>浏览器渲染</dt>
                      <dd>{checkpoint.renderSummary}</dd>
                    </div>
                  )}
                  {checkpoint.reviewSummary && (
                    <div>
                      <dt>审查结论</dt>
                      <dd>{checkpoint.reviewSummary}</dd>
                    </div>
                  )}
                </dl>
              )}
            </div>
          ) : checkpoint.plan ? (
            <dl>
              <div>
                <dt>核心信息</dt>
                <dd>{checkpoint.plan.coreMessage}</dd>
              </div>
              <div>
                <dt>目标受众</dt>
                <dd>{checkpoint.plan.audience}</dd>
              </div>
              <div>
                <dt>叙事路径</dt>
                <dd>{checkpoint.plan.narrative}</dd>
              </div>
              <div>
                <dt>视觉方向</dt>
                <dd>{checkpoint.plan.visualDirection ?? checkpoint.plan.style}</dd>
              </div>
              {checkpoint.plan.selectedStyle && (
                <div>
                  <dt>选定设计系统</dt>
                  <dd>
                    {checkpoint.plan.selectedStyle}
                    {checkpoint.plan.density
                      ? ` · ${checkpoint.plan.density === "speaker-led" ? "现场讲述" : "异步阅读"}`
                      : ""}
                  </dd>
                </div>
              )}
              {checkpoint.plan.designSystem?.visualThesis && (
                <div>
                  <dt>视觉论点</dt>
                  <dd>{checkpoint.plan.designSystem.visualThesis}</dd>
                </div>
              )}
              {checkpoint.renderSummary && (
                <div>
                  <dt>浏览器渲染</dt>
                  <dd>{checkpoint.renderSummary}</dd>
                </div>
              )}
              {checkpoint.reviewSummary && (
                <div>
                  <dt>审查结论</dt>
                  <dd>{checkpoint.reviewSummary}</dd>
                </div>
              )}
            </dl>
          ) : (
            <div className="sg-pg-plan-skeleton">
              <i />
              <i />
              <i />
              <i />
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
