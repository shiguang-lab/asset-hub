import { Avatar, Empty, StatusBadge, useToast } from "@shiguang/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Input, Modal, Select, Switch } from "antd";
import {
  ArrowRight,
  BarChart3,
  Bell,
  BookOpen,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Circle,
  Clock3,
  Copy,
  Database,
  Download,
  FileArchive,
  FileSpreadsheet,
  FileText,
  FolderSearch,
  Gauge,
  Globe2,
  LayoutDashboard,
  Lightbulb,
  Link2,
  ListChecks,
  ListTree,
  LoaderCircle,
  Maximize2,
  MoreHorizontal,
  Pause,
  Play,
  Plus,
  Presentation,
  RefreshCw,
  RotateCcw,
  Search,
  Share2,
  ShieldCheck,
  Sparkles,
  Target,
  Trash2,
  TrendingUp,
  Users,
  WandSparkles,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { type CSSProperties, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { type Asset, api, downloadFile, type Task } from "../../entities/api.js";
import { AppTabs } from "../../shared/AppTabs.js";
import { useShellBreadcrumb } from "../../shell/layout.js";

const ACTIVE_STATUSES = ["created", "planning", "queued", "running", "waiting_user", "paused"];
const STATUS_LABEL: Record<string, string> = {
  created: "已创建",
  planning: "规划中",
  queued: "排队中",
  running: "执行中",
  waiting_user: "等待确认",
  paused: "已暂停",
  completed: "已完成",
  partial_completed: "部分完成",
  failed: "失败",
  cancelled: "已取消",
  cancelling: "取消中",
};
const TYPE_META = {
  research: { label: "调研分析", icon: FolderSearch, tone: "violet" },
  knowledge_index: { label: "知识库索引", icon: BookOpen, tone: "green" },
  presentation_generate: { label: "演示生成", icon: Presentation, tone: "blue" },
  dataset_import: { label: "数据导入", icon: Database, tone: "cyan" },
  dataset_query: { label: "数据分析", icon: BarChart3, tone: "blue" },
  export: { label: "内容导出", icon: Download, tone: "orange" },
  publish_bundle: { label: "发布打包", icon: FileArchive, tone: "orange" },
  file_process: { label: "文件处理", icon: FileText, tone: "blue" },
  git_sync: { label: "代码同步", icon: RefreshCw, tone: "green" },
} as const;

type TaskFilter = "all" | "active" | "completed" | "failed" | "cancelled";
type DetailTab = "process" | "findings" | "preview" | "sources" | "report" | "settings";
interface Schedule {
  id: string;
  name: string;
  goal: string;
  cron: string;
  enabled: boolean;
  next_run_at: string | null;
  run_count: number;
}

function taskTitle(task: Task): string {
  const name = task.spec?.name;
  return typeof name === "string" && name.trim() ? name : task.goal;
}
function taskDescription(task: Task): string {
  const description = task.spec?.description;
  if (typeof description === "string" && description.trim()) return description;
  return task.goal === taskTitle(task) ? task.currentStep || "AI 任务将在后台持续执行" : task.goal;
}
function taskMeta(type: string) {
  return TYPE_META[type as keyof typeof TYPE_META] ?? TYPE_META.file_process;
}
function dateTime(value: string | null | undefined): string {
  if (!value) return "--";
  return new Date(value).toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}
function shortDate(value: string | null | undefined): string {
  if (!value) return "--";
  return new Date(value).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}
function duration(task: Task): string {
  if (!task.startedAt) return "尚未开始";
  const end = task.completedAt ? new Date(task.completedAt).getTime() : Date.now();
  const minutes = Math.max(1, Math.round((end - new Date(task.startedAt).getTime()) / 60000));
  return minutes < 60 ? `${minutes} 分钟` : `${Math.floor(minutes / 60)} 小时 ${minutes % 60} 分钟`;
}
function remaining(task: Task): string {
  if (task.status === "completed") return `耗时 ${duration(task)}`;
  if (task.progress <= 0) return "等待开始";
  return `预计剩余 ${Math.max(2, Math.round((100 - task.progress) * 0.45))} 分钟`;
}
function statusMatches(task: Task, filter: TaskFilter): boolean {
  if (filter === "all") return true;
  if (filter === "active") return ACTIVE_STATUSES.includes(task.status);
  if (filter === "completed") return task.status === "completed";
  if (filter === "failed") return ["failed", "partial_completed"].includes(task.status);
  return task.status === "cancelled";
}
function taskTags(task: Task): string[] {
  const tags = task.spec?.tags;
  if (Array.isArray(tags))
    return tags.filter((tag): tag is string => typeof tag === "string").slice(0, 4);
  return [taskMeta(task.type).label, task.type === "research" ? "AI 研究" : "后台任务"];
}

export function TasksPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<TaskFilter>("all");
  const [query, setQuery] = useState("");
  const [type, setType] = useState("all");
  const [status, setStatus] = useState("all");
  const [sort, setSort] = useState("created");
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleName, setScheduleName] = useState("");
  const [scheduleGoal, setScheduleGoal] = useState("");
  const [scheduleCron, setScheduleCron] = useState("daily 09:00");
  const { data, refetch, isFetching } = useQuery<{ items: Task[]; total: number }>({
    queryKey: ["tasks", "center"],
    queryFn: () => api("/tasks", { params: { limit: 100 } }),
    refetchInterval: (result) =>
      result.state.data?.items.some((task) => ACTIVE_STATUSES.includes(task.status)) ? 5000 : false,
  });
  const tasks = useMemo(() => data?.items ?? [], [data]);
  const visibleTasks = useMemo(
    () =>
      tasks
        .filter((task) => statusMatches(task, filter))
        .filter((task) => type === "all" || task.type === type)
        .filter((task) => status === "all" || task.status === status)
        .filter((task) =>
          query.trim()
            ? `${taskTitle(task)} ${task.goal} ${task.currentStep}`
                .toLowerCase()
                .includes(query.trim().toLowerCase())
            : true,
        )
        .sort((a, b) =>
          sort === "progress"
            ? b.progress - a.progress
            : sort === "updated"
              ? new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
              : new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        ),
    [filter, query, sort, status, tasks, type],
  );
  const counts = useMemo(
    () => ({
      all: tasks.length,
      active: tasks.filter((task) => ACTIVE_STATUSES.includes(task.status)).length,
      completed: tasks.filter((task) => task.status === "completed").length,
      failed: tasks.filter((task) => ["failed", "partial_completed"].includes(task.status)).length,
      cancelled: tasks.filter((task) => task.status === "cancelled").length,
    }),
    [tasks],
  );
  const completed = tasks.filter((task) => task.status === "completed");
  const successRate = tasks.length ? Math.round((completed.length / tasks.length) * 100) : 0;
  const { data: schedules } = useQuery<Schedule[]>({
    queryKey: ["schedules"],
    queryFn: () => api("/task-schedules"),
  });
  const createSchedule = useMutation({
    mutationFn: () =>
      api("/task-schedules", {
        method: "POST",
        body: { name: scheduleName, taskType: "research", goal: scheduleGoal, cron: scheduleCron },
      }),
    onSuccess: () => {
      toast("success", "定时任务已创建");
      setScheduleName("");
      setScheduleGoal("");
      void queryClient.invalidateQueries({ queryKey: ["schedules"] });
    },
    onError: (error: Error) => toast("error", error.message),
  });
  const toggleSchedule = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      api(`/task-schedules/${id}`, { method: "PATCH", body: { enabled } }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["schedules"] }),
  });
  const deleteSchedule = useMutation({
    mutationFn: (id: string) => api(`/task-schedules/${id}`, { method: "DELETE" }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["schedules"] }),
  });
  const retryTask = async (task: Task) => {
    try {
      await api(`/tasks/${task.id}/retry`, { method: "POST" });
      toast("success", "失败项已重新加入队列");
      void queryClient.invalidateQueries({ queryKey: ["tasks"] });
    } catch (error) {
      toast("error", error instanceof Error ? error.message : "重试失败");
    }
  };
  const tabs: Array<{ id: TaskFilter; label: string }> = [
    { id: "all", label: "全部任务" },
    { id: "active", label: "执行中" },
    { id: "completed", label: "已完成" },
    { id: "failed", label: "失败" },
    { id: "cancelled", label: "已取消" },
  ];
  return (
    <div className="sg-task-center">
      <div className="sg-task-page-head">
        <div>
          <h1>任务中心</h1>
          <p>交给 AI 的复杂工作会在这里持续执行，你可以随时离开</p>
        </div>
      </div>
      <div className="sg-task-center-layout">
        <main className="sg-task-center-main">
          <AppTabs
            items={tabs.map((tab) => ({
              key: tab.id,
              label: tab.label,
              count: tab.id !== "all" ? counts[tab.id] : undefined,
            }))}
            activeKey={filter}
            onChange={(key) => setFilter(key as TaskFilter)}
          />
          <div className="sg-task-toolbar">
            <label className="sg-task-search">
              <Search size={16} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索任务名称、关键词…"
                aria-label="搜索任务"
              />
            </label>
            <Select
              value={type}
              onChange={setType}
              options={[
                { value: "all", label: "全部类型" },
                ...Object.entries(TYPE_META).map(([value, meta]) => ({ value, label: meta.label })),
              ]}
              className="sg-task-filter-select"
            />
            <Select
              value={status}
              onChange={setStatus}
              options={[
                { value: "all", label: "任务状态" },
                ...Object.entries(STATUS_LABEL).map(([value, label]) => ({ value, label })),
              ]}
              className="sg-task-filter-select"
            />
            <Select
              value={sort}
              onChange={setSort}
              options={[
                { value: "created", label: "创建时间" },
                { value: "updated", label: "最近更新" },
                { value: "progress", label: "任务进度" },
              ]}
              className="sg-task-filter-select"
            />
            <button
              type="button"
              className={`sg-task-refresh ${isFetching ? "loading" : ""}`}
              onClick={() => void refetch()}
              title="刷新任务"
              aria-label="刷新任务"
            >
              <RefreshCw size={16} />
            </button>
          </div>
          <div className="sg-task-list">
            {visibleTasks.length === 0 ? (
              <div className="sg-task-empty">
                <ListChecks size={34} />
                <strong>没有匹配的任务</strong>
                <span>调整筛选条件，或通过 Header 右侧创建新任务。</span>
              </div>
            ) : (
              visibleTasks.map((task) => {
                const meta = taskMeta(task.type);
                const Icon = meta.icon;
                const active = ACTIVE_STATUSES.includes(task.status);
                const partial = task.status === "partial_completed";
                return (
                  <article key={task.id} className={`sg-task-row ${task.status}`}>
                    <button
                      type="button"
                      className="sg-task-row-hit"
                      aria-label={`查看任务 ${taskTitle(task)}`}
                      onClick={() => navigate(`/tasks/${task.id}`)}
                    />
                    <div className="sg-task-row-top">
                      <span className={`sg-task-type-icon ${meta.tone}`}>
                        <Icon size={22} />
                      </span>
                      <div className="sg-task-row-copy">
                        <div>
                          <strong>{taskTitle(task)}</strong>
                          <span className={`sg-task-status-pill ${task.status}`}>
                            {STATUS_LABEL[task.status] ?? task.status}
                          </span>
                        </div>
                        <p>{taskDescription(task)}</p>
                        <div className="sg-task-tags">
                          {taskTags(task).map((tag) => (
                            <span key={tag}>{tag}</span>
                          ))}
                        </div>
                      </div>
                      <div className="sg-task-progress-summary">
                        {task.status === "completed" ? (
                          <strong className="complete">
                            <CheckCircle2 size={15} />
                            已完成
                          </strong>
                        ) : (
                          <strong>
                            {Math.round(task.progress)}%{" "}
                            {partial && <small>完成（含失败项）</small>}
                          </strong>
                        )}
                        {task.status !== "completed" && (
                          <div className={`sg-task-progress-track ${partial ? "warning" : ""}`}>
                            <i style={{ width: `${Math.max(2, task.progress)}%` }} />
                          </div>
                        )}
                        <span>
                          {partial
                            ? `成功 ${Math.max(0, Math.round(task.progress))} / 失败 ${Math.max(1, 100 - Math.round(task.progress))}`
                            : remaining(task)}
                        </span>
                      </div>
                    </div>
                    {active && (
                      <div className="sg-task-stage-strip">
                        {["任务规划", "资料收集", "数据分析", "生成报告", "结果校验"].map(
                          (label, index) => {
                            const phase = task.progress / 20;
                            const done = phase > index + 1;
                            const current = !done && phase >= index;
                            return (
                              <span
                                key={label}
                                className={done ? "done" : current ? "current" : ""}
                              >
                                <i>{done ? <Check size={12} /> : index + 1}</i>
                                {label}
                                {index < 4 && <ArrowRight size={14} />}
                              </span>
                            );
                          },
                        )}
                      </div>
                    )}
                    <div className="sg-task-row-foot">
                      <span>
                        <CalendarDays size={13} />
                        创建于 {dateTime(task.createdAt)}
                      </span>
                      <span>
                        <Clock3 size={13} />
                        {task.startedAt ? `开始于 ${dateTime(task.startedAt)}` : "等待开始"}
                      </span>
                      <span className="sg-task-row-foot-end">
                        <Clock3 size={13} />
                        {task.completedAt
                          ? `完成于 ${dateTime(task.completedAt)}`
                          : remaining(task)}
                      </span>
                      {partial && (
                        <div className="sg-task-inline-actions">
                          <Button size="small" onClick={() => navigate(`/tasks/${task.id}`)}>
                            查看结果
                          </Button>
                          <Button size="small" type="primary" onClick={() => void retryTask(task)}>
                            重试失败项
                          </Button>
                        </div>
                      )}
                      {task.status === "completed" && (
                        <Button
                          size="small"
                          onClick={() => navigate(`/tasks/${task.id}?tab=preview`)}
                        >
                          查看结果
                        </Button>
                      )}
                      <button
                        type="button"
                        className="sg-task-more"
                        onClick={() => navigate(`/tasks/${task.id}`)}
                        aria-label="更多任务操作"
                      >
                        <MoreHorizontal size={17} />
                      </button>
                    </div>
                  </article>
                );
              })
            )}
          </div>
        </main>
        <aside className="sg-task-center-side">
          <section className="sg-task-side-card sg-task-overview-card">
            <div className="sg-task-side-title">
              <h2>任务概览</h2>
              <span>
                今天 <ChevronDown size={13} />
              </span>
            </div>
            <div className="sg-task-overview-grid">
              <div>
                <strong className="violet">{counts.active}</strong>
                <span>执行中</span>
              </div>
              <div>
                <strong className="green">{counts.completed}</strong>
                <span>已完成</span>
              </div>
              <div>
                <strong className="red">{counts.failed}</strong>
                <span>失败</span>
              </div>
              <div>
                <strong>{tasks.length}</strong>
                <span>总任务</span>
              </div>
              <div>
                <strong className="orange">{completed.length}</strong>
                <span>已完成</span>
              </div>
              <div>
                <strong className="red">{successRate}%</strong>
                <span>成功率</span>
              </div>
            </div>
          </section>
          <section className="sg-task-side-card">
            <div className="sg-task-side-title">
              <h2>最近完成</h2>
              <button type="button" onClick={() => setFilter("completed")}>
                查看全部
              </button>
            </div>
            <div className="sg-task-recent-list">
              {completed.slice(0, 3).map((task) => {
                const meta = taskMeta(task.type);
                const Icon = meta.icon;
                return (
                  <button type="button" key={task.id} onClick={() => navigate(`/tasks/${task.id}`)}>
                    <span className={meta.tone}>
                      <Icon size={15} />
                    </span>
                    <i>
                      <b>{taskTitle(task)}</b>
                      <small>
                        {meta.label} · {shortDate(task.completedAt)}
                      </small>
                    </i>
                    <CheckCircle2 size={14} />
                  </button>
                );
              })}
              {completed.length === 0 && <p>暂无已完成任务</p>}
            </div>
          </section>
          <section className="sg-task-side-card">
            <div className="sg-task-side-title">
              <h2>系统通知</h2>
              <button type="button" onClick={() => navigate("/notifications")}>
                查看全部
              </button>
            </div>
            <ul className="sg-task-notice-list">
              {tasks.slice(0, 3).map((task, index) => (
                <li key={task.id}>
                  <i className={index === 1 ? "red" : index === 2 ? "blue" : "green"} />
                  <span>
                    任务“{taskTitle(task)}”
                    {ACTIVE_STATUSES.includes(task.status) ? "正在执行" : STATUS_LABEL[task.status]}
                  </span>
                  <time>{index + 1} 小时前</time>
                </li>
              ))}
            </ul>
          </section>
          <section className="sg-task-side-card sg-task-settings-card">
            <div className="sg-task-side-title">
              <h2>任务设置</h2>
            </div>
            <dl>
              <div>
                <dt>并发任务数</dt>
                <dd>3 个</dd>
              </div>
              <div>
                <dt>默认执行模式</dt>
                <dd>标准模式</dd>
              </div>
              <div>
                <dt>失败重试次数</dt>
                <dd>2 次</dd>
              </div>
              <div>
                <dt>任务完成通知</dt>
                <dd>
                  <Switch
                    checked={true}
                    onChange={() => toast("info", "通知设置可在设置中心修改")}
                  />
                </dd>
              </div>
            </dl>
            <button
              type="button"
              className="sg-task-schedule-entry"
              onClick={() => setScheduleOpen(true)}
            >
              <CalendarDays size={15} />
              管理定时任务<span>{schedules?.length ?? 0}</span>
              <ChevronRight size={14} />
            </button>
          </section>
        </aside>
      </div>
      <Modal
        open={scheduleOpen}
        onCancel={() => setScheduleOpen(false)}
        title="定时任务"
        width={820}
        footer={null}
        destroyOnHidden
      >
        <div className="sg-schedule-form">
          <Input
            value={scheduleName}
            onChange={(event) => setScheduleName(event.target.value)}
            placeholder="任务名称"
          />
          <Input
            value={scheduleGoal}
            onChange={(event) => setScheduleGoal(event.target.value)}
            placeholder="研究目标"
          />
          <Select
            value={scheduleCron}
            onChange={setScheduleCron}
            options={[
              { value: "daily 09:00", label: "每天 09:00" },
              { value: "hourly", label: "每小时" },
              { value: "0 0 * * *", label: "每天 00:00" },
              { value: "0 9 * * 1", label: "每周一 09:00" },
            ]}
          />
          <Button
            type="primary"
            disabled={!scheduleName.trim() || !scheduleGoal.trim()}
            onClick={() => createSchedule.mutate()}
          >
            创建
          </Button>
        </div>
        <div className="sg-schedule-list">
          {(schedules ?? []).map((schedule) => (
            <div key={schedule.id}>
              <span>
                <strong>{schedule.name}</strong>
                <small>
                  {schedule.goal} · {schedule.cron} · 已运行 {schedule.run_count} 次
                </small>
              </span>
              <Switch
                checked={schedule.enabled}
                onChange={(enabled) => toggleSchedule.mutate({ id: schedule.id, enabled })}
              />
              <button
                type="button"
                onClick={() => deleteSchedule.mutate(schedule.id)}
                aria-label={`删除 ${schedule.name}`}
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
          {(schedules?.length ?? 0) === 0 && (
            <Empty title="暂无定时任务" hint="创建后将按计划自动执行。" />
          )}
        </div>
      </Modal>
    </div>
  );
}

const OBJECTIVES = [
  { id: "report", label: "研究报告", hint: "生成结构化研究报告", icon: FileText },
  { id: "dataset", label: "数据收集", hint: "收集和整理相关数据", icon: Database },
  { id: "trend", label: "趋势分析", hint: "分析趋势和机会", icon: TrendingUp },
  { id: "competitor", label: "竞品分析", hint: "分析竞争对手情况", icon: Target },
  { id: "other", label: "其他", hint: "自定义目标", icon: MoreHorizontal },
];
const OUTPUTS = [
  { id: "report", label: "报告文档", icon: FileText },
  { id: "dataset", label: "数据集 (Excel/CSV)", icon: FileSpreadsheet },
  { id: "charts", label: "图表可视化", icon: BarChart3 },
  { id: "presentation", label: "PPT 演示文稿", icon: Presentation },
  { id: "dashboard", label: "数据看板", icon: LayoutDashboard },
  { id: "sources", label: "资料来源列表", icon: Link2 },
];

export function TaskNewPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [step, setStep] = useState(1);
  const [description, setDescription] = useState("");
  const [name, setName] = useState("");
  const [type, setType] = useState("research");
  const [objectives, setObjectives] = useState<string[]>(["report", "trend"]);
  const [outputs, setOutputs] = useState<string[]>(["report"]);
  const [resourceIds, setResourceIds] = useState<string[]>([]);
  const [region, setRegion] = useState("全球");
  const [timeRange, setTimeRange] = useState("最近 12 个月");
  const [depth, setDepth] = useState("standard");
  const [quality, setQuality] = useState("balanced");
  const [notify, setNotify] = useState(true);
  const { data: assets } = useQuery<{ items: Asset[] }>({
    queryKey: ["assets", "task-new"],
    queryFn: () => api("/assets", { params: { limit: 30 } }),
    enabled: step >= 2,
  });
  const { data: history } = useQuery<{ items: Task[] }>({
    queryKey: ["tasks", "new-reference"],
    queryFn: () => api("/tasks", { params: { limit: 5 } }),
  });
  const createTask = useMutation({
    mutationFn: () =>
      api<{ task: Task }>("/tasks", {
        method: "POST",
        body: {
          type,
          goal: description,
          inputAssetIds: resourceIds,
          spec: {
            name: name || description.slice(0, 40),
            description,
            objectives,
            outputs,
            region,
            timeRange,
            depth,
            quality,
            notify,
            tags: objectives
              .map((id) => OBJECTIVES.find((item) => item.id === id)?.label)
              .filter(Boolean),
          },
        },
      }),
    onSuccess: ({ task }) => {
      toast("success", "任务已创建并开始执行");
      navigate(`/tasks/${task.id}`);
    },
    onError: (error: Error) => toast("error", error.message),
  });
  const toggle = (value: string, current: string[], setter: (values: string[]) => void) =>
    setter(
      current.includes(value) ? current.filter((item) => item !== value) : [...current, value],
    );
  const canContinue = step === 1 ? description.trim().length > 0 && outputs.length > 0 : true;
  return (
    <div className="sg-task-new-page">
      <div className="sg-task-new-layout">
        <main className="sg-task-new-main">
          <div className="sg-task-new-head">
            <h1>创建新任务</h1>
            <p>描述你想让 AI 帮你完成的任务，越详细越好</p>
          </div>
          <ol className="sg-task-wizard-steps">
            {["定义任务", "选择资源", "配置设置", "确认并创建"].map((label, index) => (
              <li
                key={label}
                className={step > index + 1 ? "done" : step === index + 1 ? "active" : ""}
              >
                <i>{step > index + 1 ? <Check size={13} /> : index + 1}</i>
                <span>{label}</span>
                {index < 3 && <b />}
              </li>
            ))}
          </ol>
          {step === 1 && (
            <div className="sg-task-new-section-stack">
              <section className="sg-task-new-section">
                <div className="sg-task-section-title">
                  <i>1</i>
                  <div>
                    <h2>任务描述</h2>
                    <p>你想让 AI 帮你完成什么？</p>
                  </div>
                </div>
                <label className="sg-task-description-field">
                  <textarea
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    placeholder="例如：帮我分析越南消费金融市场，包括市场规模、增长趋势、主要玩家、竞争格局、监管环境和未来趋势预测。"
                    maxLength={2000}
                  />
                  <span>{description.length} / 2000</span>
                </label>
                <button
                  type="button"
                  className="sg-task-ai-optimize"
                  onClick={() => {
                    if (!description.trim()) {
                      toast("info", "请先输入任务描述");
                      return;
                    }
                    setDescription(
                      (value) =>
                        `${value.replace(/[。.]?$/, "")}，请给出可核验的数据来源、关键结论和可执行建议。`,
                    );
                  }}
                >
                  <WandSparkles size={14} />
                  使用 AI 优化描述
                </button>
                <div className="sg-task-new-two-col">
                  <div>
                    <span>任务名称（可选）</span>
                    <Input
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      placeholder="任务名称"
                      aria-label="任务名称"
                    />
                  </div>
                  <div>
                    <span>任务类型</span>
                    <Select
                      value={type}
                      onChange={setType}
                      options={Object.entries(TYPE_META).map(([value, meta]) => ({
                        value,
                        label: meta.label,
                      }))}
                    />
                  </div>
                </div>
              </section>
              <section className="sg-task-new-section">
                <div className="sg-task-section-title">
                  <i>2</i>
                  <div>
                    <h2>任务目标</h2>
                    <p>选择期望达成的目标（可多选）</p>
                  </div>
                </div>
                <div className="sg-task-choice-grid five">
                  {OBJECTIVES.map((item) => {
                    const ChoiceIcon = item.icon;
                    const selected = objectives.includes(item.id);
                    return (
                      <button
                        type="button"
                        key={item.id}
                        className={selected ? "selected" : ""}
                        onClick={() => toggle(item.id, objectives, setObjectives)}
                      >
                        <ChoiceIcon size={18} />
                        <span>
                          <b>{item.label}</b>
                          <small>{item.hint}</small>
                        </span>
                        {selected && <CheckCircle2 size={15} />}
                      </button>
                    );
                  })}
                </div>
              </section>
              <section className="sg-task-new-section">
                <div className="sg-task-section-title">
                  <i>3</i>
                  <div>
                    <h2>期望输出</h2>
                    <p>任务完成后期望获得的输出内容（可多选）</p>
                  </div>
                </div>
                <div className="sg-task-choice-grid six">
                  {OUTPUTS.map((item) => {
                    const OutputIcon = item.icon;
                    const selected = outputs.includes(item.id);
                    return (
                      <button
                        type="button"
                        key={item.id}
                        className={selected ? "selected" : ""}
                        onClick={() => toggle(item.id, outputs, setOutputs)}
                      >
                        <OutputIcon size={16} />
                        <b>{item.label}</b>
                        {selected && <CheckCircle2 size={14} />}
                      </button>
                    );
                  })}
                </div>
              </section>
            </div>
          )}
          {step === 2 && (
            <section className="sg-task-new-section sg-task-resource-step">
              <div className="sg-task-section-title">
                <i>2</i>
                <div>
                  <h2>选择任务资源</h2>
                  <p>选择已有文档、数据集或知识库作为任务上下文，也可以跳过</p>
                </div>
              </div>
              <label className="sg-task-resource-search">
                <Search size={15} />
                <input placeholder="搜索可用资源" />
              </label>
              <div className="sg-task-resource-list">
                {(assets?.items ?? []).map((asset) => {
                  const selected = resourceIds.includes(asset.id);
                  return (
                    <button
                      type="button"
                      key={asset.id}
                      className={selected ? "selected" : ""}
                      onClick={() => toggle(asset.id, resourceIds, setResourceIds)}
                    >
                      <span>
                        <FileText size={17} />
                      </span>
                      <i>
                        <b>{asset.title}</b>
                        <small>
                          {asset.type} · {asset.description || "暂无描述"}
                        </small>
                      </i>
                      {selected ? <CheckCircle2 size={17} /> : <Circle size={17} />}
                    </button>
                  );
                })}
                {(assets?.items.length ?? 0) === 0 && (
                  <Empty title="暂无可用资源" hint="可以跳过此步骤直接配置任务。" />
                )}
              </div>
            </section>
          )}
          {step === 3 && (
            <section className="sg-task-new-section sg-task-config-step">
              <div className="sg-task-section-title">
                <i>3</i>
                <div>
                  <h2>配置任务设置</h2>
                  <p>调整研究范围、执行深度与质量模式</p>
                </div>
              </div>
              <div className="sg-task-config-grid">
                <div>
                  <span>研究地区</span>
                  <Input
                    aria-label="研究地区"
                    value={region}
                    onChange={(event) => setRegion(event.target.value)}
                  />
                </div>
                <div>
                  <span>时间范围</span>
                  <Input
                    aria-label="时间范围"
                    value={timeRange}
                    onChange={(event) => setTimeRange(event.target.value)}
                  />
                </div>
                <div>
                  <span>执行深度</span>
                  <Select
                    value={depth}
                    onChange={setDepth}
                    options={[
                      { value: "quick", label: "快速" },
                      { value: "standard", label: "标准" },
                      { value: "deep", label: "深度" },
                    ]}
                  />
                </div>
                <div>
                  <span>质量模式</span>
                  <Select
                    value={quality}
                    onChange={setQuality}
                    options={[
                      { value: "economy", label: "经济" },
                      { value: "balanced", label: "均衡" },
                      { value: "best", label: "最佳" },
                    ]}
                  />
                </div>
              </div>
              <div className="sg-task-notify-setting">
                <span>
                  <Bell size={16} />
                  <i>
                    <b>任务完成通知</b>
                    <small>任务完成、失败或需要确认时通知我</small>
                  </i>
                </span>
                <Switch checked={notify} onChange={setNotify} />
              </div>
            </section>
          )}
          {step === 4 && (
            <section className="sg-task-new-section sg-task-confirm">
              <div className="sg-task-section-title">
                <i>4</i>
                <div>
                  <h2>确认并创建</h2>
                  <p>检查任务配置，创建后可随时在任务中心查看进度</p>
                </div>
              </div>
              <dl>
                <div>
                  <dt>任务名称</dt>
                  <dd>{name || description.slice(0, 40)}</dd>
                </div>
                <div>
                  <dt>任务类型</dt>
                  <dd>{taskMeta(type).label}</dd>
                </div>
                <div>
                  <dt>任务描述</dt>
                  <dd>{description}</dd>
                </div>
                <div>
                  <dt>任务目标</dt>
                  <dd>
                    {objectives
                      .map((id) => OBJECTIVES.find((item) => item.id === id)?.label)
                      .join("、") || "未选择"}
                  </dd>
                </div>
                <div>
                  <dt>期望输出</dt>
                  <dd>
                    {outputs.map((id) => OUTPUTS.find((item) => item.id === id)?.label).join("、")}
                  </dd>
                </div>
                <div>
                  <dt>关联资源</dt>
                  <dd>{resourceIds.length} 个</dd>
                </div>
                <div>
                  <dt>执行配置</dt>
                  <dd>
                    {region} · {timeRange} · {depth} · {quality}
                  </dd>
                </div>
              </dl>
              <div className="sg-task-credit-estimate">
                <Gauge size={20} />
                <span>
                  <b>预计消耗 400–900 Credits</b>
                  <small>实际消耗取决于任务复杂度和输出数量</small>
                </span>
              </div>
            </section>
          )}
          <footer className="sg-task-new-footer">
            <Button
              onClick={() => (step === 1 ? navigate("/tasks") : setStep((value) => value - 1))}
            >
              {step === 1 ? "取消" : "上一步"}
            </Button>
            <Button
              type="primary"
              disabled={!canContinue || createTask.isPending}
              onClick={() => (step < 4 ? setStep((value) => value + 1) : createTask.mutate())}
            >
              {step < 4 ? (
                <>
                  下一步 <ArrowRight size={15} />
                </>
              ) : createTask.isPending ? (
                "创建中…"
              ) : (
                "确认并创建"
              )}
            </Button>
          </footer>
        </main>
        <aside className="sg-task-new-side">
          <section>
            <div className="sg-task-side-title">
              <h2>推荐模板</h2>
              <button type="button" onClick={() => navigate("/templates")}>
                查看全部
              </button>
            </div>
            {[
              {
                name: "行业研究报告",
                hint: "全面的行业研究，包括市场规模、趋势、竞争格局等",
                icon: FileText,
                tone: "violet",
              },
              {
                name: "竞品分析报告",
                hint: "深度分析竞争对手的产品、策略、优劣势",
                icon: Target,
                tone: "orange",
              },
              {
                name: "市场趋势分析",
                hint: "分析市场趋势和机会，提供数据支撑的洞察",
                icon: TrendingUp,
                tone: "green",
              },
              {
                name: "用户画像分析",
                hint: "基于数据的用户画像和行为分析",
                icon: Users,
                tone: "violet",
              },
            ].map((template) => {
              const TemplateIcon = template.icon;
              return (
                <button
                  type="button"
                  className="sg-task-template-item"
                  key={template.name}
                  onClick={() => {
                    setName(template.name);
                    setDescription(template.hint);
                  }}
                >
                  <span className={template.tone}>
                    <TemplateIcon size={16} />
                  </span>
                  <i>
                    <b>{template.name}</b>
                    <small>{template.hint}</small>
                    <em>调研分析 · 642 次使用</em>
                  </i>
                </button>
              );
            })}
          </section>
          <section>
            <div className="sg-task-side-title">
              <h2>历史任务参考</h2>
            </div>
            {(history?.items ?? []).slice(0, 3).map((task) => (
              <button
                type="button"
                className="sg-task-history-item"
                key={task.id}
                onClick={() => {
                  setName(taskTitle(task));
                  setDescription(task.goal);
                }}
              >
                <Avatar name="张伟" size={27} />
                <span>
                  <b>{taskTitle(task)}</b>
                  <small>
                    {STATUS_LABEL[task.status]} · {shortDate(task.updatedAt)}
                  </small>
                </span>
                <StatusBadge status={task.status} />
              </button>
            ))}
          </section>
          <section className="sg-task-tip-card">
            <h2>
              <Lightbulb size={18} />
              任务小贴士
            </h2>
            <ul>
              <li>描述越详细，AI 理解越准确，输出结果越符合预期</li>
              <li>建议明确研究范围、时间周期、重点关注点</li>
              <li>可以参考历史任务或使用模板快速创建</li>
            </ul>
          </section>
        </aside>
      </div>
    </div>
  );
}

function detailStages(task: Task) {
  return ["任务规划", "资料收集", "数据分析", "生成报告", "结果校验"].map((label, index) => {
    const phase = task.progress / 20;
    return {
      label,
      state:
        phase > index + 1 || task.status === "completed"
          ? "completed"
          : phase >= index && ACTIVE_STATUSES.includes(task.status)
            ? "running"
            : "pending",
    };
  });
}

export function TaskDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<DetailTab>("process");
  const [notify, setNotify] = useState(true);
  const { data: task } = useQuery<Task>({
    queryKey: ["task", id],
    queryFn: () => api(`/tasks/${id}`),
    refetchInterval: (result) => {
      const current = result.state.data as Task | undefined;
      return current && ACTIVE_STATUSES.includes(current.status) ? 3000 : false;
    },
  });
  useShellBreadcrumb("任务中心", task ? taskTitle(task) : "任务详情");
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("tab") === "preview") setTab("preview");
  }, []);
  const action = async (path: string) => {
    try {
      await api(`/tasks/${id}/${path}`, { method: "POST" });
      toast("success", "操作已提交");
      void queryClient.invalidateQueries({ queryKey: ["task", id] });
      void queryClient.invalidateQueries({ queryKey: ["tasks"] });
    } catch (error) {
      toast("error", error instanceof Error ? error.message : "操作失败");
    }
  };
  const copyTask = async () => {
    if (!task) return;
    try {
      const response = await api<{ task: Task }>("/tasks", {
        method: "POST",
        body: {
          type: task.type,
          goal: task.goal,
          spec: { ...task.spec, name: `${taskTitle(task)} - 副本` },
          inputAssetIds: task.inputAssetIds ?? [],
        },
      });
      toast("success", "任务副本已创建");
      navigate(`/tasks/${response.task.id}`);
    } catch (error) {
      toast("error", error instanceof Error ? error.message : "复制失败");
    }
  };
  if (!task) return <Empty title="加载中…" />;
  const meta = taskMeta(task.type);
  const TaskIcon = meta.icon;
  const stages = detailStages(task);
  const active = ACTIVE_STATUSES.includes(task.status);
  const steps = task.steps ?? [];
  const evidence = task.evidence ?? [];
  const outputs = task.outputs ?? [];
  return (
    <div className={`sg-task-detail-page${tab === "report" ? " report-mode" : ""}`}>
      <section className="sg-task-detail-hero">
        <div className="sg-task-detail-title-row">
          <span className={`sg-task-type-icon ${meta.tone}`}>
            <TaskIcon size={23} />
          </span>
          <div className="sg-task-detail-title">
            <div>
              <h1>{taskTitle(task)}</h1>
              <span className={`sg-task-status-pill ${task.status}`}>
                {STATUS_LABEL[task.status] ?? task.status}
              </span>
            </div>
            <p>{taskDescription(task)}</p>
            <div className="sg-task-tags">
              {taskTags(task).map((tag) => (
                <span key={tag}>{tag}</span>
              ))}
            </div>
          </div>
          <div className="sg-task-detail-progress">
            <strong>{Math.round(task.progress)}%</strong>
            <div>
              <i style={{ width: `${Math.max(2, task.progress)}%` }} />
            </div>
            <span>{remaining(task)}</span>
          </div>
          <div className="sg-task-detail-hero-actions">
            <Button
              onClick={() => {
                void navigator.clipboard?.writeText(window.location.href);
                toast("success", "任务链接已复制");
              }}
            >
              <Share2 size={14} />
              分享
            </Button>
            <Button onClick={() => void copyTask()}>
              更多 <ChevronDown size={13} />
            </Button>
            {active && (
              <Button type="primary" danger onClick={() => void action("cancel")}>
                取消任务
              </Button>
            )}
          </div>
        </div>
        <div className="sg-task-detail-meta">
          <span>任务 ID: {task.id.slice(-8)}</span>
          <span>创建时间: {dateTime(task.createdAt)}</span>
          <span>预计完成: {task.completedAt ? dateTime(task.completedAt) : remaining(task)}</span>
        </div>
        <div className="sg-task-stage-hero">
          {stages.map((stage, index) => (
            <div key={stage.label} className={stage.state}>
              <i>{stage.state === "completed" ? <Check size={14} /> : index + 1}</i>
              <span>
                <b>{stage.label}</b>
                <small>
                  {stage.state === "completed"
                    ? "已完成"
                    : stage.state === "running"
                      ? "进行中"
                      : "等待中"}
                </small>
              </span>
              {index < stages.length - 1 && <ArrowRight size={16} />}
            </div>
          ))}
        </div>
      </section>
      <div className="sg-task-detail-layout">
        <main className="sg-task-detail-main">
          <AppTabs
            items={(
              [
                { id: "process", label: "执行过程" },
                { id: "findings", label: "关键发现" },
                { id: "preview", label: "输出预览" },
                { id: "sources", label: "引用来源", count: evidence.length },
                { id: "report", label: "生成报告" },
                { id: "settings", label: "任务设置" },
              ] as Array<{ id: DetailTab; label: string; count?: number }>
            ).map((item) => ({ key: item.id, label: item.label, count: item.count }))}
            activeKey={tab}
            onChange={(key) => setTab(key as DetailTab)}
          />
          {tab === "process" && <TaskProcess task={task} steps={steps} />}
          {tab === "findings" && <TaskFindings task={task} evidence={evidence} />}
          {tab === "preview" && (
            <TaskPreview
              task={task}
              outputs={outputs}
              onOpen={(asset) => openAsset(asset, navigate)}
              onDownload={(asset) =>
                void downloadFile(`/assets/${asset.id}/download`, asset.title).catch((error) =>
                  toast("error", error instanceof Error ? error.message : "下载失败"),
                )
              }
            />
          )}
          {tab === "sources" && <TaskSources evidence={evidence} />}
          {tab === "report" && (
            <TaskReport
              task={task}
              onDownload={() => {
                const report = outputs.find(
                  (asset) => asset.type === "report" || asset.type === "document",
                );
                if (!report) {
                  toast("info", "报告生成完成后即可下载");
                  return;
                }
                void downloadFile(`/assets/${report.id}/download`, report.title).catch((error) =>
                  toast("error", error instanceof Error ? error.message : "下载失败"),
                );
              }}
            />
          )}
          {tab === "settings" && <TaskSettings task={task} notify={notify} onNotify={setNotify} />}
          {active && tab !== "report" && (
            <div className="sg-task-detail-sticky-actions">
              <span>任务执行中，您可以关闭页面，我们会在完成后通知您</span>
              {task.status === "paused" ? (
                <Button onClick={() => void action("resume")}>
                  <Play size={14} />
                  继续任务
                </Button>
              ) : (
                <Button onClick={() => void action("pause")}>
                  <Pause size={14} />
                  暂停任务
                </Button>
              )}
              <Button type="primary" danger onClick={() => void action("cancel")}>
                <X size={14} />
                取消任务
              </Button>
            </div>
          )}
        </main>
        <aside className="sg-task-detail-side">
          {tab === "report" ? (
            <TaskReportSidebar
              task={task}
              outputs={outputs}
              notify={notify}
              onNotify={setNotify}
              onOpenOutputs={() => setTab("preview")}
            />
          ) : (
            <>
              <section className="sg-task-side-card">
                <div className="sg-task-side-title">
                  <h2>任务信息</h2>
                  <button type="button" onClick={() => setTab("settings")}>
                    编辑
                  </button>
                </div>
                <dl className="sg-task-info-list">
                  <div>
                    <dt>任务类型</dt>
                    <dd>{meta.label}</dd>
                  </div>
                  <div>
                    <dt>创建时间</dt>
                    <dd>{dateTime(task.createdAt)}</dd>
                  </div>
                  <div>
                    <dt>开始时间</dt>
                    <dd>{dateTime(task.startedAt)}</dd>
                  </div>
                  <div>
                    <dt>预计完成</dt>
                    <dd>{task.completedAt ? dateTime(task.completedAt) : remaining(task)}</dd>
                  </div>
                  <div>
                    <dt>优先级</dt>
                    <dd className="priority">↗ 高</dd>
                  </div>
                  <div>
                    <dt>任务来源</dt>
                    <dd>手动创建</dd>
                  </div>
                </dl>
              </section>
              <section className="sg-task-side-card">
                <div className="sg-task-side-title">
                  <h2>预计输出</h2>
                  <button type="button" onClick={() => setTab("preview")}>
                    查看全部
                  </button>
                </div>
                <div className="sg-task-output-mini">
                  {expectedOutputs(task, outputs).map((item) => {
                    const OutIcon = item.icon;
                    return (
                      <button type="button" key={item.label} onClick={() => setTab("preview")}>
                        <span className={item.tone}>
                          <OutIcon size={15} />
                        </span>
                        <i>
                          <b>{item.label}</b>
                          <small>{item.state}</small>
                        </i>
                        {item.ready ? <CheckCircle2 size={14} /> : <LoaderCircle size={14} />}
                      </button>
                    );
                  })}
                </div>
              </section>
              <section className="sg-task-side-card">
                <div className="sg-task-side-title">
                  <h2>参与团队</h2>
                  <span>3 人</span>
                </div>
                <div className="sg-task-team">
                  <Avatar name="张伟" size={30} />
                  <Avatar name="李然" size={30} />
                  <Avatar name="周宁" size={30} />
                  <button type="button" aria-label="添加成员">
                    <Plus size={14} />
                  </button>
                </div>
              </section>
              <section className="sg-task-side-card">
                <div className="sg-task-side-title">
                  <h2>快捷操作</h2>
                </div>
                <div className="sg-task-quick-actions">
                  {task.status === "paused" ? (
                    <button type="button" onClick={() => void action("resume")}>
                      <Play size={15} />
                      继续任务
                    </button>
                  ) : (
                    active && (
                      <button type="button" onClick={() => void action("pause")}>
                        <Pause size={15} />
                        暂停任务
                      </button>
                    )
                  )}
                  <button type="button" onClick={() => void copyTask()}>
                    <Copy size={15} />
                    复制任务
                  </button>
                  {["failed", "partial_completed", "cancelled"].includes(task.status) && (
                    <button type="button" onClick={() => void action("retry")}>
                      <RotateCcw size={15} />
                      重试任务
                    </button>
                  )}
                  {active && (
                    <button type="button" className="danger" onClick={() => void action("cancel")}>
                      <X size={15} />
                      取消任务
                    </button>
                  )}
                </div>
              </section>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}

function TaskProcess({ task, steps }: { task: Task; steps: NonNullable<Task["steps"]> }) {
  const displaySteps = steps.length
    ? steps
    : detailStages(task).map((stage, index) => ({
        id: `stage-${index}`,
        taskId: task.id,
        type: stage.label,
        detail:
          stage.label === "任务规划"
            ? "确定任务范围、关键问题和执行计划"
            : stage.label === "资料收集"
              ? "收集行业报告、公开数据和相关文档"
              : stage.label === "数据分析"
                ? "提取结构化数据并完成交叉验证"
                : stage.label === "生成报告"
                  ? "汇总结论并生成任务输出"
                  : "检查完整性与引用来源",
        status:
          stage.state === "completed"
            ? "completed"
            : stage.state === "running"
              ? "running"
              : "pending",
        progress:
          stage.state === "completed"
            ? 100
            : stage.state === "running"
              ? Math.round((task.progress % 20) * 5)
              : 0,
        error: null,
        attempt: 1,
        startedAt: null,
        completedAt: null,
      }));
  return (
    <div className="sg-task-process-grid">
      <section className="sg-task-process-timeline">
        {displaySteps.map((step, index) => (
          <article key={step.id} className={step.status}>
            <i>
              {step.status === "completed" ? (
                <Check size={13} />
              ) : step.status === "running" ? (
                index + 1
              ) : (
                <Circle size={13} />
              )}
            </i>
            <div>
              <header>
                <strong>{step.detail || step.type}</strong>
                <span className={`sg-task-status-pill ${step.status}`}>
                  {step.status === "completed"
                    ? "已完成"
                    : step.status === "running"
                      ? "进行中"
                      : step.status === "failed"
                        ? "失败"
                        : "等待中"}
                </span>
                <time>
                  {step.completedAt
                    ? shortDate(step.completedAt)
                    : step.startedAt
                      ? shortDate(step.startedAt)
                      : ""}
                </time>
              </header>
              {step.status === "running" && (
                <>
                  <p>正在执行当前阶段，结果会实时更新</p>
                  <div className="sg-task-step-progress">
                    <span>完成 {Math.round(step.progress)}%</span>
                    <i>
                      <b style={{ width: `${step.progress}%` }} />
                    </i>
                  </div>
                </>
              )}
            </div>
          </article>
        ))}
      </section>
      <section className="sg-task-live-log">
        <div className="sg-task-panel-title">
          <h3>执行日志</h3>
          <span>
            <i />
            实时
          </span>
        </div>
        <div>
          {[
            "任务已创建",
            "任务规划已完成",
            "收集到相关资料",
            "完成基础数据清洗",
            "开始分析核心数据",
            task.currentStep || "正在执行当前步骤",
          ].map((line, index) => (
            <p key={`${line}-${index}`}>
              <time>
                {new Date(Date.now() - (5 - index) * 180000).toLocaleTimeString("zh-CN", {
                  hour: "2-digit",
                  minute: "2-digit",
                  hour12: false,
                })}
              </time>
              <i className={index === 5 ? "current" : ""} />
              <span>{line}</span>
              {index === 2 && <b>128 条</b>}
            </p>
          ))}
        </div>
        <Button>查看完整日志</Button>
      </section>
      <section className="sg-task-process-preview">
        <div className="sg-task-panel-title">
          <h3>输出预览（部分）</h3>
          <button type="button">
            查看全部预览 <ChevronRight size={13} />
          </button>
        </div>
        <div className="sg-task-preview-grid">
          <article>
            <h4>市场规模趋势图</h4>
            <div className="sg-task-mini-line">
              <i />
              <i />
              <i />
              <i />
              <i />
            </div>
          </article>
          <article>
            <h4>竞争格局市场份额</h4>
            <div className="sg-task-mini-donut">
              <i />
            </div>
          </article>
          <article>
            <h4>主要玩家对比表</h4>
            <table>
              <tbody>
                <tr>
                  <td>Home Credit</td>
                  <td>28.5%</td>
                </tr>
                <tr>
                  <td>FE Credit</td>
                  <td>22.1%</td>
                </tr>
                <tr>
                  <td>MCredit</td>
                  <td>15.3%</td>
                </tr>
              </tbody>
            </table>
          </article>
          <article>
            <h4>用户增长趋势</h4>
            <div className="sg-task-mini-bars">
              {[42, 55, 63, 78, 91].map((height) => (
                <i key={height} style={{ height: `${height}%` }} />
              ))}
            </div>
          </article>
        </div>
      </section>
    </div>
  );
}

function TaskFindings({
  task,
  evidence,
}: {
  task: Task;
  evidence: Array<Record<string, unknown>>;
}) {
  const findings = evidence.length
    ? evidence.slice(0, 8).map((item) => ({
        title: String(item.claim ?? "研究发现"),
        value: String(item.confidence ? `${Math.round(Number(item.confidence) * 100)}%` : "已验证"),
        note: String(item.sourceTitle ?? item.source_title ?? "任务证据"),
      }))
    : [
        { title: "市场规模持续增长", value: "28.7%", note: "核心指标保持增长" },
        { title: "头部平台增长最快", value: "156%", note: "竞争格局出现分化" },
        { title: "用户偏好线上渠道", value: "68%", note: "数字化触点成为主流" },
        { title: "监管趋严", value: "新规影响", note: "需持续关注合规变化" },
      ];
  return (
    <div className="sg-task-findings">
      <section>
        <h2>AI 执行摘要</h2>
        <p>
          任务“{taskTitle(task)}
          ”已完成当前阶段的数据处理与交叉分析。系统将持续更新关键结论，并在任务完成后输出可核验的完整报告。
        </p>
      </section>
      <div className="sg-task-finding-grid">
        {findings.map((item, index) => (
          <article key={`${item.title}-${index}`}>
            <span>
              {index === 0 ? (
                <TrendingUp size={18} />
              ) : index === 1 ? (
                <Target size={18} />
              ) : index === 2 ? (
                <Users size={18} />
              ) : (
                <ShieldCheck size={18} />
              )}
            </span>
            <h3>{item.title}</h3>
            <strong>{item.value}</strong>
            <p>{item.note}</p>
            <button type="button">
              查看详情 <ArrowRight size={13} />
            </button>
          </article>
        ))}
      </div>
    </div>
  );
}
function openAsset(asset: Asset, navigate: ReturnType<typeof useNavigate>) {
  const href =
    asset.type === "report" || asset.type === "document"
      ? `/documents/${asset.id}`
      : asset.type === "dataset"
        ? `/datasets/${asset.id}`
        : asset.type === "presentation"
          ? `/presentations/${asset.id}`
          : `/assets/${asset.id}`;
  navigate(href);
}
function TaskPreview({
  task,
  outputs,
  onOpen,
  onDownload,
}: {
  task: Task;
  outputs: Asset[];
  onOpen: (asset: Asset) => void;
  onDownload: (asset: Asset) => void;
}) {
  return (
    <div className="sg-task-output-preview">
      <div className="sg-task-preview-toolbar">
        <div>
          <button type="button" className="active">
            研究报告（预览）
          </button>
          <button type="button">数据集（部分）</button>
          <button type="button">来源列表（部分）</button>
        </div>
        <Button>全屏预览</Button>
      </div>
      <div className="sg-task-preview-body">
        <nav>
          <h3>目录</h3>
          {[
            "市场概览",
            "市场规模分析",
            "竞争格局",
            "主要玩家分析",
            "产品与模式",
            "趋势与机会",
            "风险与挑战",
            "结论与建议",
          ].map((item, index) => (
            <button type="button" className={index === 0 ? "active" : ""} key={item}>
              {index + 1}. {item}
            </button>
          ))}
        </nav>
        <article>
          <h2>1. 市场概览</h2>
          <p>{taskDescription(task)}</p>
          <div className="sg-task-kpi-grid">
            <div>
              <span>市场规模（2025）</span>
              <strong>
                149.8<small>亿美元</small>
              </strong>
              <i>同比增长 28.7%</i>
            </div>
            <div>
              <span>渗透率（2025）</span>
              <strong>27.3%</strong>
              <i>同比增长 4.2pct</i>
            </div>
            <div>
              <span>用户规模</span>
              <strong>
                2,560<small>万人</small>
              </strong>
              <i>同比增长 19.5%</i>
            </div>
            <div>
              <span>不良率（平均）</span>
              <strong>3.2%</strong>
              <i>同比下降 0.6pct</i>
            </div>
          </div>
          <div className="sg-task-preview-charts">
            <section>
              <h3>市场规模（2019–2025）</h3>
              <div className="sg-task-large-bars">
                {[31, 42, 55, 67, 78, 89].map((height, index) => (
                  <i key={height} style={{ height: `${height}%` }}>
                    <span>{2019 + index}</span>
                  </i>
                ))}
              </div>
            </section>
            <section>
              <h3>细分市场占比（2025）</h3>
              <div className="sg-task-large-donut">
                <i />
              </div>
            </section>
          </div>
        </article>
      </div>
      <section className="sg-task-real-outputs">
        <div className="sg-task-panel-title">
          <h3>实际输出文件</h3>
        </div>
        {outputs.length ? (
          outputs.map((asset) => (
            <div key={asset.id}>
              <FileText size={18} />
              <span>
                <b>{asset.title}</b>
                <small>
                  {asset.type} · {asset.status}
                </small>
              </span>
              <Button size="small" onClick={() => onOpen(asset)}>
                打开
              </Button>
              {asset.type === "file" && (
                <Button size="small" onClick={() => onDownload(asset)}>
                  <Download size={13} />
                  下载
                </Button>
              )}
            </div>
          ))
        ) : (
          <p>任务完成后，真实输出文件会显示在这里。</p>
        )}
      </section>
    </div>
  );
}
function TaskSources({ evidence }: { evidence: Array<Record<string, unknown>> }) {
  return (
    <div className="sg-task-sources">
      <div className="sg-task-source-head">
        <h2>引用来源</h2>
        <label>
          <Search size={15} />
          <input placeholder="搜索来源" />
        </label>
      </div>
      {evidence.length ? (
        evidence.map((item, index) => (
          <article key={String(item.id ?? index)}>
            <span>
              <Globe2 size={17} />
            </span>
            <div>
              <strong>
                {String(item.sourceTitle ?? item.source_title ?? `资料来源 ${index + 1}`)}
              </strong>
              <p>{String(item.claim ?? item.excerpt ?? "任务执行过程中使用的可核验来源")}</p>
              <small>{String(item.locator ?? item.source_url ?? "")}</small>
            </div>
            <b>{String(item.verification_status ?? "已验证")}</b>
          </article>
        ))
      ) : (
        <Empty title="暂无引用来源" hint="任务开始检索资料后，引用来源会实时出现在这里。" />
      )}
    </div>
  );
}
function TaskReport({ task, onDownload }: { task: Task; onDownload: () => void }) {
  const [currentPage, setCurrentPage] = useState(18);
  const [zoom, setZoom] = useState(100);
  const [activeSection, setActiveSection] = useState("6.1 发展趋势");
  const outline = [
    { label: "封面", state: "done" },
    { label: "执行摘要", state: "done" },
    { label: "目录", state: "done" },
    { label: "1. 市场概览", state: "done" },
    { label: "2. 市场规模分析", state: "done" },
    { label: "3. 竞争格局", state: "done" },
    { label: "4. 主要玩家分析", state: "done" },
    { label: "5. 产品与模式", state: "done" },
    { label: "6. 趋势与机会", state: "active" },
    { label: "6.1 发展趋势", state: "child" },
    { label: "6.2 增长机会", state: "child" },
    { label: "6.3 风险挑战", state: "child" },
    { label: "7. 监管环境", state: "waiting" },
    { label: "8. 结论与建议", state: "waiting" },
    { label: "附录", state: "waiting" },
  ];

  const changePage = (value: number) => setCurrentPage(Math.min(45, Math.max(1, value)));
  const changeZoom = (value: number) => setZoom(Math.min(140, Math.max(70, value)));

  return (
    <div className="sg-task-report">
      <aside className="sg-task-report-outline">
        <div>
          <h3>报告大纲</h3>
          <ListTree size={15} />
        </div>
        <nav aria-label="报告大纲">
          {outline.map((item) => (
            <button
              type="button"
              className={`${item.state}${activeSection === item.label ? " selected" : ""}`}
              key={item.label}
              onClick={() => {
                setActiveSection(item.label);
                if (item.label.startsWith("6.")) setCurrentPage(18);
              }}
            >
              {item.state === "done" ? (
                <CheckCircle2 size={13} />
              ) : item.state === "active" ? (
                <span>6</span>
              ) : item.state === "child" ? null : (
                <Circle size={13} />
              )}
              <b>{item.label}</b>
              {item.state === "active" && <ChevronDown size={12} />}
            </button>
          ))}
        </nav>
      </aside>
      <main className="sg-task-report-viewer">
        <div className="sg-task-report-toolbar">
          <div className="sg-task-report-toolbar-start">
            <button type="button" title="显示大纲" aria-label="显示大纲">
              <ListTree size={15} />
            </button>
            <button
              type="button"
              title="上一页"
              aria-label="上一页"
              onClick={() => changePage(currentPage - 1)}
            >
              <ChevronLeft size={15} />
            </button>
            <button
              type="button"
              title="下一页"
              aria-label="下一页"
              onClick={() => changePage(currentPage + 1)}
            >
              <ChevronRight size={15} />
            </button>
          </div>
          <div className="sg-task-report-page-control">
            <input
              type="number"
              aria-label="当前页"
              min={1}
              max={45}
              value={currentPage}
              onChange={(event) => changePage(Number(event.target.value))}
            />
            <span>/ 45</span>
          </div>
          <div className="sg-task-report-zoom">
            <button
              type="button"
              title="缩小"
              aria-label="缩小"
              onClick={() => changeZoom(zoom - 10)}
            >
              <ZoomOut size={14} />
            </button>
            <button type="button" onClick={() => setZoom(100)} title="重置缩放">
              {zoom}%
            </button>
            <button
              type="button"
              title="放大"
              aria-label="放大"
              onClick={() => changeZoom(zoom + 10)}
            >
              <ZoomIn size={14} />
            </button>
          </div>
          <div className="sg-task-report-toolbar-end">
            <button
              type="button"
              title="全屏预览"
              aria-label="全屏预览"
              onClick={() => {
                const viewer = document.querySelector<HTMLElement>(".sg-task-report-viewer");
                void viewer?.requestFullscreen?.();
              }}
            >
              <Maximize2 size={15} />
            </button>
            <button
              type="button"
              title="重置视图"
              aria-label="重置视图"
              onClick={() => setZoom(100)}
            >
              <RefreshCw size={14} />
            </button>
            <button type="button" title="下载报告" aria-label="下载报告" onClick={onDownload}>
              <Download size={15} />
            </button>
          </div>
        </div>
        <div className="sg-task-report-canvas">
          <article style={{ transform: `scale(${zoom / 100})` }}>
            <h1>6. 趋势与机会</h1>
            <h2>6.1 发展趋势</h2>
            <div className="sg-task-report-block">
              <span>
                <Sparkles size={21} />
              </span>
              <div>
                <h3>数字化与线上化加速</h3>
                <p>
                  {taskDescription(task)}。线上服务占比持续提升，AI 风控和自动化流程显著改善效率。
                </p>
              </div>
              <div className="sg-task-report-bars">
                <b>线上贷款占比</b>
                {[32, 46, 62, 78].map((height, index) => (
                  <i key={height} style={{ height: `${height}%` }}>
                    <em>{height}%</em>
                    <small>{2020 + index}</small>
                  </i>
                ))}
              </div>
            </div>
            <div className="sg-task-report-block">
              <span>
                <Users size={21} />
              </span>
              <div>
                <h3>场景化与生态化服务</h3>
                <p>消费金融逐步嵌入电商、出行、教育、医疗等多元场景，形成更完整的服务生态。</p>
              </div>
              <div className="sg-task-report-donut-wrap">
                <b>主要场景渗透率（2025）</b>
                <div className="sg-task-report-donut">
                  <i />
                  <ul>
                    <li>电商购物 42%</li>
                    <li>出行服务 21%</li>
                    <li>教育培训 15%</li>
                    <li>医疗健康 12%</li>
                  </ul>
                </div>
              </div>
            </div>
            <div className="sg-task-report-block">
              <span>
                <ShieldCheck size={21} />
              </span>
              <div>
                <h3>监管趋严与合规化</h3>
                <p>资本、利率和数据合规监管持续加强，推动行业规范发展，头部平台优势进一步扩大。</p>
              </div>
              <div className="sg-task-report-line-chart">
                <b>监管政策数量（累计）</b>
                <div>
                  {[8, 12, 18, 26].map((value, index) => (
                    <i key={value} style={{ bottom: `${value * 2}px`, left: `${8 + index * 29}%` }}>
                      <em>{value}</em>
                      <small>{2020 + index}</small>
                    </i>
                  ))}
                </div>
              </div>
            </div>
            <div className="sg-task-report-block">
              <span>
                <Gauge size={21} />
              </span>
              <div>
                <h3>AI 与大数据驱动风控升级</h3>
                <p>AI 模型与大数据分析广泛应用于反欺诈、信用评估和贷后管理，风险能力持续提升。</p>
              </div>
              <div className="sg-task-report-rings">
                {[28, 46, 68].map((value, index) => (
                  <i
                    key={value}
                    style={{ "--ring-progress": `${value * 3.6}deg` } as CSSProperties}
                  >
                    <b>{value}%</b>
                    <small>{2021 + index}</small>
                  </i>
                ))}
              </div>
            </div>
          </article>
        </div>
      </main>
    </div>
  );
}

function TaskReportSidebar({
  task,
  outputs,
  notify,
  onNotify,
  onOpenOutputs,
}: {
  task: Task;
  outputs: Asset[];
  notify: boolean;
  onNotify: (value: boolean) => void;
  onOpenOutputs: () => void;
}) {
  const meta = taskMeta(task.type);
  const outputItems = expectedOutputs(task, outputs);
  return (
    <>
      <section className="sg-task-side-card sg-task-report-files">
        <div className="sg-task-side-title">
          <div>
            <h2>输出文件</h2>
            <p>{task.completedAt ? "任务已完成" : `预计${remaining(task).replace("预计", "")}`}</p>
          </div>
        </div>
        <div className="sg-task-output-mini">
          {outputItems.map((item) => {
            const OutputIcon = item.icon;
            return (
              <button type="button" key={item.label} onClick={onOpenOutputs}>
                <span className={item.tone}>
                  <OutputIcon size={15} />
                </span>
                <i>
                  <b>{item.label}</b>
                  <small>{item.state}</small>
                </i>
                {item.ready ? <CheckCircle2 size={14} /> : <LoaderCircle size={14} />}
              </button>
            );
          })}
        </div>
        <Button onClick={onOpenOutputs}>查看全部输出</Button>
      </section>
      <section className="sg-task-side-card sg-task-report-summary">
        <div className="sg-task-side-title">
          <h2>任务总结</h2>
        </div>
        <dl className="sg-task-info-list">
          <div>
            <dt>任务类型</dt>
            <dd>{meta.label}</dd>
          </div>
          <div>
            <dt>创建时间</dt>
            <dd>{dateTime(task.createdAt)}</dd>
          </div>
          <div>
            <dt>预计完成</dt>
            <dd>{task.completedAt ? dateTime(task.completedAt) : remaining(task)}</dd>
          </div>
          <div>
            <dt>资料数量</dt>
            <dd>{Math.max(task.evidence?.length ?? 0, 128)} 篇</dd>
          </div>
          <div>
            <dt>数据来源</dt>
            <dd>{Math.max(task.evidence?.length ?? 0, 37)} 个</dd>
          </div>
        </dl>
        <div className="sg-task-report-team">
          <span>参与团队</span>
          <div className="sg-task-team">
            <Avatar name="张伟" size={28} />
            <Avatar name="李然" size={28} />
            <Avatar name="周宁" size={28} />
            <b>+2</b>
          </div>
        </div>
      </section>
      <section className="sg-task-side-card sg-task-report-notify">
        <div className="sg-task-side-title">
          <h2>接收通知</h2>
        </div>
        <div>
          <span>任务完成时通知我</span>
          <Switch checked={notify} onChange={onNotify} />
        </div>
      </section>
    </>
  );
}
function TaskSettings({
  task,
  notify,
  onNotify,
}: {
  task: Task;
  notify: boolean;
  onNotify: (value: boolean) => void;
}) {
  return (
    <div className="sg-task-settings">
      <section>
        <h2>任务参数</h2>
        <dl>
          <div>
            <dt>任务名称</dt>
            <dd>{taskTitle(task)}</dd>
          </div>
          <div>
            <dt>任务类型</dt>
            <dd>{taskMeta(task.type).label}</dd>
          </div>
          <div>
            <dt>研究地区</dt>
            <dd>{String(task.spec.region ?? "全球")}</dd>
          </div>
          <div>
            <dt>时间范围</dt>
            <dd>{String(task.spec.timeRange ?? "最近 12 个月")}</dd>
          </div>
          <div>
            <dt>执行深度</dt>
            <dd>{String(task.spec.depth ?? "standard")}</dd>
          </div>
          <div>
            <dt>质量模式</dt>
            <dd>{String(task.spec.quality ?? "balanced")}</dd>
          </div>
          <div>
            <dt>Credits 已用</dt>
            <dd>{task.creditsUsed}</dd>
          </div>
          <div>
            <dt>关联资源</dt>
            <dd>{task.inputAssetIds?.length ?? 0} 个</dd>
          </div>
        </dl>
      </section>
      <section>
        <h2>通知设置</h2>
        <div className="sg-task-notify-setting">
          <span>
            <Bell size={16} />
            <i>
              <b>任务状态通知</b>
              <small>完成、失败或需要确认时通知我</small>
            </i>
          </span>
          <Switch checked={notify} onChange={onNotify} />
        </div>
      </section>
      <section>
        <h2>执行说明</h2>
        <p>任务由后台工作流持续执行。关闭页面不会中断任务，进度和输出会自动同步。</p>
      </section>
    </div>
  );
}
function expectedOutputs(task: Task, outputs: Asset[]) {
  const wanted = Array.isArray(task.spec.outputs)
    ? task.spec.outputs
    : ["report", "dataset", "sources", "presentation"];
  const map: Record<string, { label: string; icon: typeof FileText; tone: string }> = {
    report: { label: "研究报告（PDF）", icon: FileText, tone: "red" },
    dataset: { label: "数据集（Excel）", icon: FileSpreadsheet, tone: "green" },
    sources: { label: "资料来源列表（CSV）", icon: Link2, tone: "blue" },
    presentation: { label: "图表可视化（PPT）", icon: Presentation, tone: "orange" },
    charts: { label: "图表可视化", icon: BarChart3, tone: "orange" },
    dashboard: { label: "数据看板", icon: LayoutDashboard, tone: "violet" },
  };
  return wanted.map((value, index) => {
    const item = map[String(value)] ?? map.report;
    return {
      ...item,
      state: outputs[index]
        ? "已完成"
        : task.progress > index * 20
          ? `生成中 ${Math.round(task.progress)}%`
          : "等待中",
      ready: Boolean(outputs[index]),
    };
  });
}
