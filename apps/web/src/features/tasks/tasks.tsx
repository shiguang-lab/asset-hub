import { Empty, Loading, Scrollbar, StatusBadge, useToast } from "@shiguang/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Input, Modal, Select, Switch } from "antd";
import { createStyles } from "antd-style";
import {
  ArrowRight,
  BarChart3,
  Bell,
  BookOpen,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
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
  Target,
  Trash2,
  TrendingUp,
  Users,
  WandSparkles,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getAuthSession } from "../../auth/session.js";
import { type Asset, api, downloadFile, type Notification, type Task } from "../../entities/api.js";
import { AppTabs } from "../../shared/AppTabs.js";
import { DocumentMarkdown } from "../../shared/document-markdown.js";
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

const useTaskWidthStyles = createStyles((_utils, props: { value: number }) => ({
  fill: {
    width: `${props.value}%`,
  },
}));

function TaskWidthFill({ value, as = "i" }: { value: number; as?: "i" | "b" }) {
  const { styles } = useTaskWidthStyles({ value });
  return as === "b" ? <b className={styles.fill} /> : <i className={styles.fill} />;
}

const useTaskZoomStyles = createStyles((_utils, props: { scale: number }) => ({
  canvas: {
    transform: `scale(${props.scale})`,
  },
}));

function TaskZoomCanvas({ scale, children }: { scale: number; children: React.ReactNode }) {
  const { styles } = useTaskZoomStyles({ scale });
  return <article className={styles.canvas}>{children}</article>;
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
  const { data, refetch, isFetching, isLoading } = useQuery<{ items: Task[]; total: number }>({
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
  const { data: notifications = [] } = useQuery<Notification[]>({
    queryKey: ["notifications"],
    queryFn: () => api<Notification[]>("/notifications"),
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
        <Button type="primary" onClick={() => navigate("/tasks/new")}>
          <Plus size={14} />
          新建任务
        </Button>
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
            <Input
              className="sg-task-search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索任务名称、关键词…"
              aria-label="搜索任务"
              prefix={<Search size={16} />}
              allowClear
            />
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
            {isLoading ? (
              <Loading loading minHeight={300} />
            ) : visibleTasks.length === 0 ? (
              <div className="sg-task-empty">
                <ListChecks size={34} />
                <strong>没有匹配的任务</strong>
                <span>调整筛选条件，或点击右上角“新建任务”创建。</span>
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
                            <TaskWidthFill value={Math.max(2, task.progress)} />
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
                      <Button
                        size="small"
                        type="text"
                        className="sg-list-action-btn sg-task-more"
                        onClick={() => navigate(`/tasks/${task.id}`)}
                        aria-label="更多任务操作"
                      >
                        <MoreHorizontal size={17} />
                      </Button>
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
              <span>实时统计</span>
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
              {notifications.length === 0 ? (
                <li>
                  <i className="blue" />
                  <span>暂无系统通知</span>
                </li>
              ) : (
                notifications.slice(0, 3).map((item) => (
                  <li key={item.id}>
                    <i className={item.readAt ? "blue" : "green"} />
                    <span>{item.title}</span>
                    <time>{shortDate(item.createdAt)}</time>
                  </li>
                ))
              )}
            </ul>
          </section>
          <section className="sg-task-side-card sg-task-settings-card">
            <div className="sg-task-side-title">
              <h2>任务设置</h2>
              <button type="button" onClick={() => navigate("/profile")}>
                通知偏好
              </button>
            </div>
            <dl>
              <div>
                <dt>当前执行中</dt>
                <dd>{counts.active} 个</dd>
              </div>
              <div>
                <dt>定时任务</dt>
                <dd>{schedules?.length ?? 0} 个</dd>
              </div>
              <div>
                <dt>累计成功率</dt>
                <dd>{successRate}%</dd>
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
  const [resourceQuery, setResourceQuery] = useState("");
  const { data: assets } = useQuery<{ items: Asset[] }>({
    queryKey: ["assets", "task-new"],
    queryFn: () => api("/assets", { params: { limit: 30 } }),
    enabled: step >= 2,
  });
  const optimizeDescription = useMutation({
    mutationFn: () =>
      api<{ items: Array<{ id: string; label: string; enabled: boolean }> }>(
        "/research/specs:preview",
        { method: "POST", body: { goal: description.trim(), region } },
      ),
    onSuccess: (res) => {
      const enabledLabels = res.items.filter((i) => i.enabled).map((i) => i.label);
      if (enabledLabels.length > 0) {
        setDescription(
          (prev) =>
            `${prev.trim().replace(/[。.]?$/, "")}。重点研究维度：${enabledLabels.join("、")}。`,
        );
        toast("success", "已生成结构化研究范围并补充至描述");
      } else {
        toast("info", "描述已较为完整");
      }
    },
    onError: (err: Error) => toast("error", err.message),
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
                <div className="sg-task-description-field">
                  <Input.TextArea
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    placeholder="例如：帮我分析越南消费金融市场，包括市场规模、增长趋势、主要玩家、竞争格局、监管环境和未来趋势预测。"
                    maxLength={2000}
                    autoSize={{ minRows: 4, maxRows: 8 }}
                  />
                  <span>{description.length} / 2000</span>
                </div>
                <button
                  type="button"
                  className="sg-task-ai-optimize"
                  disabled={optimizeDescription.isPending}
                  onClick={() => {
                    if (!description.trim()) {
                      toast("info", "请先输入任务描述");
                      return;
                    }
                    optimizeDescription.mutate();
                  }}
                >
                  <WandSparkles size={14} />
                  {optimizeDescription.isPending ? "正在拆解优化…" : "使用 AI 优化描述"}
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
              <Input
                className="sg-task-resource-search"
                placeholder="搜索可用资源"
                prefix={<Search size={15} />}
                allowClear
                aria-label="搜索可用资源"
                value={resourceQuery}
                onChange={(e) => setResourceQuery(e.target.value)}
              />
              <div className="sg-task-resource-list">
                {(assets?.items ?? [])
                  .filter((asset) => {
                    const q = resourceQuery.trim().toLowerCase();
                    if (!q) return true;
                    return `${asset.title} ${asset.type} ${asset.description ?? ""}`
                      .toLowerCase()
                      .includes(q);
                  })
                  .map((asset) => {
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
                    <em>推荐模板</em>
                  </i>
                </button>
              );
            })}
          </section>
          <section>
            <div className="sg-task-side-title">
              <h2>历史任务参考</h2>
            </div>
            {(history?.items ?? []).slice(0, 3).map((task) => {
              const histMeta = taskMeta(task.type);
              const HistIcon = histMeta.icon;
              return (
                <button
                  type="button"
                  className="sg-task-history-item"
                  key={task.id}
                  onClick={() => {
                    setName(taskTitle(task));
                    setDescription(task.goal);
                  }}
                >
                  <span className={histMeta.tone}>
                    <HistIcon size={15} />
                  </span>
                  <span>
                    <b>{taskTitle(task)}</b>
                    <small>
                      {STATUS_LABEL[task.status]} · {shortDate(task.updatedAt)}
                    </small>
                  </span>
                  <StatusBadge status={task.status} />
                </button>
              );
            })}
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
  if (!task) return <Loading loading />;
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
              <TaskWidthFill value={Math.max(2, task.progress)} />
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
        <Scrollbar className="sg-task-stage-hero">
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
        </Scrollbar>
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
          {tab === "process" && (
            <TaskProcess
              task={task}
              steps={steps}
              outputs={outputs}
              onOpenPreview={() => setTab("preview")}
            />
          )}
          {tab === "findings" && (
            <TaskFindings task={task} evidence={evidence} onOpenSources={() => setTab("sources")} />
          )}
          {tab === "preview" && (
            <TaskPreview
              task={task}
              outputs={outputs}
              onOpen={(asset) => openAsset(asset, navigate)}
              onOpenReport={() => setTab("report")}
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
              outputs={outputs}
              onDownload={() => {
                const report = outputs.find(
                  (asset) =>
                    asset.type === "report" ||
                    asset.type === "document" ||
                    asset.type === "markdown",
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
                  <h2>任务上下文</h2>
                  <span>{outputs.length} 输出</span>
                </div>
                <dl className="sg-task-info-list">
                  <div>
                    <dt>创建者</dt>
                    <dd>{getAuthSession()?.displayName ?? "工作区成员"}</dd>
                  </div>
                  <div>
                    <dt>关联资源</dt>
                    <dd>{task.inputAssetIds?.length ?? 0} 个</dd>
                  </div>
                  <div>
                    <dt>引用证据</dt>
                    <dd>{evidence.length} 条</dd>
                  </div>
                </dl>
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

function TaskProcess({
  task,
  steps,
  outputs,
  onOpenPreview,
}: {
  task: Task;
  steps: NonNullable<Task["steps"]>;
  outputs: Asset[];
  onOpenPreview: () => void;
}) {
  const [liveLogs, setLiveLogs] = useState<Array<{ time: string; text: string }>>([]);
  const [showAllLogs, setShowAllLogs] = useState(false);

  useEffect(() => {
    if (!ACTIVE_STATUSES.includes(task.status)) return;
    const es = new EventSource(`/api/v1/tasks/${task.id}/stream`, { withCredentials: true });
    const push = (label: string) => {
      const now = new Date().toLocaleTimeString("zh-CN", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
      setLiveLogs((prev) => {
        if (prev.at(-1)?.text === label) return prev;
        return [...prev.slice(-30), { time: now, text: label }];
      });
    };
    es.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data) as {
          currentStep?: string;
          status?: string;
          step?: string;
        };
        const msg = parsed.currentStep || parsed.step || parsed.status;
        if (msg) push(msg);
      } catch {
        // ignore keepalive comments
      }
    };
    es.onerror = () => {
      es.close();
    };
    return () => es.close();
  }, [task.id, task.status]);

  const logEntries = useMemo(() => {
    const items: Array<{ time: string; text: string; badge?: string; current?: boolean }> = [
      { time: shortDate(task.createdAt), text: "任务已创建" },
    ];
    if (task.startedAt) {
      items.push({ time: shortDate(task.startedAt), text: "开始执行任务" });
    }
    for (const s of steps) {
      if (s.status === "pending") continue;
      items.push({
        time: shortDate(s.completedAt ?? s.startedAt ?? task.updatedAt),
        text: `${s.detail || s.type}（${
          s.status === "completed" ? "已完成" : s.status === "failed" ? "失败" : "进行中"
        }）`,
        badge: s.status === "running" ? `${Math.round(s.progress)}%` : undefined,
        current: s.status === "running",
      });
    }
    for (const entry of liveLogs) {
      items.push({ time: entry.time, text: entry.text, current: true });
    }
    if (task.currentStep && items.at(-1)?.text !== task.currentStep) {
      items.push({
        time: shortDate(task.updatedAt),
        text: task.currentStep,
        current: ACTIVE_STATUSES.includes(task.status),
      });
    }
    return items;
  }, [liveLogs, steps, task]);

  const visibleLogs = showAllLogs ? logEntries : logEntries.slice(-6);
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
                      <TaskWidthFill as="b" value={step.progress} />
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
            {ACTIVE_STATUSES.includes(task.status) ? "实时" : "记录"}
          </span>
        </div>
        <div>
          {visibleLogs.map((entry, index) => (
            <p key={`${entry.time}-${entry.text}-${index}`}>
              <time>{entry.time}</time>
              <i className={entry.current ? "current" : ""} />
              <span>{entry.text}</span>
              {entry.badge && <b>{entry.badge}</b>}
            </p>
          ))}
        </div>
        {logEntries.length > 6 && (
          <Button onClick={() => setShowAllLogs((v) => !v)}>
            {showAllLogs ? "收起日志" : `查看完整日志 (${logEntries.length})`}
          </Button>
        )}
      </section>
      <section className="sg-task-process-preview">
        <div className="sg-task-panel-title">
          <h3>已生成输出（{outputs.length}）</h3>
          <button type="button" onClick={onOpenPreview}>
            查看全部预览 <ChevronRight size={13} />
          </button>
        </div>
        {outputs.length === 0 ? (
          <Empty title="尚无输出产物" hint="任务执行产生报告、数据或演示后将在此处显示。" />
        ) : (
          <div className="sg-task-preview-grid">
            {outputs.slice(0, 4).map((asset) => (
              <article key={asset.id}>
                <h4>{asset.title || "未命名输出"}</h4>
                <p className="sg-subtle">
                  {asset.type} · {asset.status}
                </p>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function TaskFindings({
  task,
  evidence,
  onOpenSources,
}: {
  task: Task;
  evidence: Array<Record<string, unknown>>;
  onOpenSources: () => void;
}) {
  const findings = evidence.slice(0, 8).map((item) => ({
    title: String(item.claim ?? "研究发现"),
    value: String(item.confidence ? `${Math.round(Number(item.confidence) * 100)}%` : "已提取"),
    note: String(item.sourceTitle ?? item.source_title ?? "任务证据"),
  }));
  return (
    <div className="sg-task-findings">
      <section>
        <h2>AI 执行摘要</h2>
        <p>
          任务“{taskTitle(task)}”当前状态为 {STATUS_LABEL[task.status] ?? task.status}，已收集{" "}
          {evidence.length} 条可核验证据、生成 {task.outputs?.length ?? 0} 份输出产物。
        </p>
      </section>
      {findings.length === 0 ? (
        <Empty
          title="暂无关键发现"
          hint="任务完成资料分析并提取可核验结论后，核心发现卡片将呈现在这里。"
        />
      ) : (
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
              <button type="button" onClick={onOpenSources}>
                查看详情 <ArrowRight size={13} />
              </button>
            </article>
          ))}
        </div>
      )}
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
function extractMarkdownHeadings(markdown: string): string[] {
  const matches: string[] = [];
  for (const line of markdown.split("\n")) {
    const m = line.match(/^#{1,3}\s+(.+)$/);
    if (m?.[1]) matches.push(m[1].trim());
  }
  return matches;
}

function TaskPreview({
  task,
  outputs,
  onOpen,
  onOpenReport,
  onDownload,
}: {
  task: Task;
  outputs: Asset[];
  onOpen: (asset: Asset) => void;
  onOpenReport: () => void;
  onDownload: (asset: Asset) => void;
}) {
  const [previewTab, setPreviewTab] = useState<"report" | "evidence" | "files">("report");
  const reportAsset = outputs.find(
    (asset) => asset.type === "report" || asset.type === "document" || asset.type === "markdown",
  );
  const { data: reportDetail } = useQuery<Asset & { content?: { kind: string; text?: string } }>({
    queryKey: ["asset", reportAsset?.id],
    queryFn: () => api(`/assets/${reportAsset!.id}`),
    enabled: Boolean(reportAsset?.id),
  });
  const reportText = reportDetail?.content?.text ?? "";
  const headings = useMemo(() => extractMarkdownHeadings(reportText), [reportText]);
  const evidence = task.evidence ?? [];

  return (
    <div className="sg-task-output-preview">
      <div className="sg-task-preview-toolbar">
        <div>
          <button
            type="button"
            className={previewTab === "report" ? "active" : ""}
            onClick={() => setPreviewTab("report")}
          >
            研究报告（预览）
          </button>
          <button
            type="button"
            className={previewTab === "evidence" ? "active" : ""}
            onClick={() => setPreviewTab("evidence")}
          >
            证据摘要（{evidence.length}）
          </button>
          <button
            type="button"
            className={previewTab === "files" ? "active" : ""}
            onClick={() => setPreviewTab("files")}
          >
            输出文件（{outputs.length}）
          </button>
        </div>
        <Button onClick={onOpenReport}>查看完整报告</Button>
      </div>

      {previewTab === "report" && (
        <div className="sg-task-preview-body">
          <nav>
            <h3>目录</h3>
            {headings.length === 0 ? (
              <p className="sg-subtle">报告生成后将自动提取目录</p>
            ) : (
              headings.map((item, index) => (
                <button
                  type="button"
                  className={index === 0 ? "active" : ""}
                  key={`${item}-${index}`}
                >
                  {item}
                </button>
              ))
            )}
          </nav>
          <article>
            {reportText ? (
              <DocumentMarkdown source={reportText} />
            ) : (
              <Empty
                title={reportAsset ? "正在加载报告内容…" : "报告尚未生成"}
                hint={
                  reportAsset
                    ? "请稍候"
                    : `任务“${taskTitle(task)}”完成后，可在此直接预览完整内容。`
                }
              />
            )}
          </article>
        </div>
      )}

      {previewTab === "evidence" && (
        <section className="sg-task-real-outputs">
          <div className="sg-task-panel-title">
            <h3>证据与来源（{evidence.length}）</h3>
          </div>
          {evidence.length === 0 ? (
            <Empty title="暂无结构化证据" hint="任务检索到证据片段后会展示在这里。" />
          ) : (
            evidence.slice(0, 12).map((item, index) => (
              <div key={String(item.id ?? index)}>
                <Globe2 size={16} />
                <span>
                  <b>{String(item.sourceTitle ?? item.source_title ?? `来源 ${index + 1}`)}</b>
                  <small>{String(item.claim ?? item.excerpt ?? "")}</small>
                </span>
              </div>
            ))
          )}
        </section>
      )}

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
  const [sourceQuery, setSourceQuery] = useState("");
  const filteredEvidence = useMemo(() => {
    const q = sourceQuery.trim().toLowerCase();
    if (!q) return evidence;
    return evidence.filter((item) =>
      `${item.sourceTitle ?? item.source_title ?? ""} ${item.claim ?? item.excerpt ?? ""} ${item.locator ?? item.source_url ?? ""}`
        .toLowerCase()
        .includes(q),
    );
  }, [evidence, sourceQuery]);

  return (
    <div className="sg-task-sources">
      <div className="sg-task-source-head">
        <h2>引用来源</h2>
        <Input
          className="sg-task-source-search"
          placeholder="搜索来源"
          prefix={<Search size={15} />}
          allowClear
          aria-label="搜索来源"
          value={sourceQuery}
          onChange={(e) => setSourceQuery(e.target.value)}
        />
      </div>
      {filteredEvidence.length ? (
        filteredEvidence.map((item, index) => (
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
        <Empty
          title={evidence.length ? "没有匹配的来源" : "暂无引用来源"}
          hint={
            evidence.length
              ? "尝试更换搜索关键词或清空筛选条件。"
              : "任务开始检索资料后，引用来源会实时出现在这里。"
          }
        />
      )}
    </div>
  );
}
function TaskReport({
  task,
  outputs,
  onDownload,
}: {
  task: Task;
  outputs: Asset[];
  onDownload: () => void;
}) {
  const [zoom, setZoom] = useState(100);
  const [showOutline, setShowOutline] = useState(true);
  const [activeSection, setActiveSection] = useState("");
  const reportAsset = outputs.find(
    (asset) => asset.type === "report" || asset.type === "document" || asset.type === "markdown",
  );
  const { data: reportDetail, isLoading } = useQuery<
    Asset & { content?: { kind: string; text?: string } }
  >({
    queryKey: ["asset", reportAsset?.id],
    queryFn: () => api(`/assets/${reportAsset!.id}`),
    enabled: Boolean(reportAsset?.id),
  });
  const reportText = reportDetail?.content?.text ?? "";
  const outline = useMemo(() => extractMarkdownHeadings(reportText), [reportText]);
  const changeZoom = (value: number) => setZoom(Math.min(140, Math.max(70, value)));

  return (
    <div className="sg-task-report">
      {showOutline && (
        <aside className="sg-task-report-outline">
          <div>
            <h3>报告大纲</h3>
            <ListTree size={15} />
          </div>
          <nav aria-label="报告大纲">
            {outline.length === 0 ? (
              <p className="sg-subtle">暂无章节目录</p>
            ) : (
              outline.map((label, index) => (
                <button
                  type="button"
                  className={`done${activeSection === label ? " selected" : ""}`}
                  key={`${label}-${index}`}
                  onClick={() => setActiveSection(label)}
                >
                  <CheckCircle2 size={13} />
                  <b>{label}</b>
                </button>
              ))
            )}
          </nav>
        </aside>
      )}
      <main className="sg-task-report-viewer">
        <div className="sg-task-report-toolbar">
          <div className="sg-task-report-toolbar-start">
            <button
              type="button"
              title="显示/隐藏大纲"
              aria-label="显示/隐藏大纲"
              onClick={() => setShowOutline((v) => !v)}
            >
              <ListTree size={15} />
            </button>
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
        <Scrollbar className="sg-task-report-canvas">
          <TaskZoomCanvas scale={zoom / 100}>
            {isLoading ? (
              <Loading loading />
            ) : reportText ? (
              <DocumentMarkdown source={reportText} />
            ) : (
              <Empty
                title="报告尚未生成"
                hint={`任务“${taskTitle(task)}”完成后，完整报告正文与大纲将在此处展示。`}
              />
            )}
          </TaskZoomCanvas>
        </Scrollbar>
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
            <dt>完成时间</dt>
            <dd>{task.completedAt ? dateTime(task.completedAt) : remaining(task)}</dd>
          </div>
          <div>
            <dt>输出产物</dt>
            <dd>{outputs.length} 份</dd>
          </div>
          <div>
            <dt>数据来源</dt>
            <dd>{task.evidence?.length ?? 0} 个</dd>
          </div>
          <div>
            <dt>负责人</dt>
            <dd>{getAuthSession()?.displayName ?? "工作区成员"}</dd>
          </div>
        </dl>
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
