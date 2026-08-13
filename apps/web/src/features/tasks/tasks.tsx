import { Button, Card, Empty, Progress, StatusBadge, Tabs, useToast } from "@shiguang/ui";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, type Task } from "../../entities/api.js";

const STATUSES = [
  "all",
  "running",
  "queued",
  "completed",
  "partial_completed",
  "failed",
  "cancelled",
];

export function TasksPage() {
  const [status, setStatus] = useState("all");
  const { data } = useQuery<{ items: Task[]; total: number }>({
    queryKey: ["tasks", status],
    queryFn: () =>
      api("/tasks", { params: { status: status === "all" ? undefined : status, limit: 100 } }),
  });
  const navigate = useNavigate();
  return (
    <div>
      <h1 className="sg-h1 sg-mb">任务中心</h1>
      <Tabs
        tabs={STATUSES.map((s) => ({ id: s, label: s === "all" ? "全部" : s }))}
        active={status}
        onChange={setStatus}
      />
      {(data?.items.length ?? 0) === 0 ? (
        <Empty title="没有任务" hint="调研、演示生成、数据导入等后台任务会显示在这里。" />
      ) : (
        <div className="sg-col">
          {data?.items.map((task) => (
            <Card key={task.id} onClick={() => navigate(`/tasks/${task.id}`)}>
              <div className="sg-row-between">
                <div className="sg-col" style={{ gap: 4 }}>
                  <strong>{task.goal}</strong>
                  <span className="sg-subtle">
                    {task.type} · {task.currentStep || "等待执行"} · {task.creditsUsed} Credits
                  </span>
                </div>
                <div className="sg-row">
                  <StatusBadge status={task.status} />
                  <Progress value={task.progress} className="" />
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

export function TaskDetailPage() {
  const { id } = useParams<{ id: string }>();
  const toast = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { data: task } = useQuery<Task>({
    queryKey: ["task", id],
    queryFn: () => api(`/tasks/${id}`),
    refetchInterval: (query) => {
      const t = query.state.data as Task | undefined;
      return t && ["created", "planning", "queued", "running", "waiting_user"].includes(t.status)
        ? 3000
        : false;
    },
  });

  const action = (path: string) =>
    api(`/tasks/${id}/${path}`, { method: "POST" }).then(() => {
      toast("success", "操作已提交");
      void queryClient.invalidateQueries({ queryKey: ["task", id] });
      void queryClient.invalidateQueries({ queryKey: ["tasks"] });
    });

  if (!task) return <Empty title="加载中…" />;
  const active = ["created", "planning", "queued", "running", "waiting_user"].includes(task.status);

  return (
    <div style={{ maxWidth: 900, margin: "0 auto" }}>
      <div className="sg-row-between sg-mb">
        <div>
          <h1 className="sg-h1">{task.goal}</h1>
          <div className="sg-row sg-mt-sm">
            <StatusBadge status={task.status} />
            <span className="sg-badge">{task.type}</span>
            <span className="sg-subtle">{task.creditsUsed} Credits</span>
          </div>
        </div>
        <div className="sg-row">
          {active && <Button onClick={() => action("pause")}>暂停</Button>}
          {task.status === "paused" && <Button onClick={() => action("resume")}>继续</Button>}
          {active && (
            <Button variant="danger" onClick={() => action("cancel")}>
              取消
            </Button>
          )}
          {["failed", "partial_completed", "cancelled"].includes(task.status) && (
            <Button variant="primary" onClick={() => action("retry")}>
              重试
            </Button>
          )}
        </div>
      </div>

      <Card className="sg-mb">
        <div className="sg-row-between sg-mb-sm">
          <strong>总体进度 {Math.round(task.progress)}%</strong>
          <span className="sg-subtle">{task.currentStep}</span>
        </div>
        <Progress value={task.progress} />
        {task.error && (
          <p className="sg-subtle" style={{ color: "var(--sg-danger)", marginTop: 8 }}>
            {task.error}
          </p>
        )}
      </Card>

      <h2 className="sg-h2">执行步骤</h2>
      <div className="sg-col sg-mb">
        {(task.steps ?? []).map((step) => (
          <Card key={step.id}>
            <div className="sg-row-between">
              <div className="sg-col" style={{ gap: 2 }}>
                <strong>{step.detail || step.type}</strong>
                <span className="sg-subtle">
                  {step.type} · 第 {step.attempt} 次尝试
                </span>
              </div>
              <StatusBadge status={step.status} />
            </div>
          </Card>
        ))}
        {(task.steps?.length ?? 0) === 0 && (
          <Empty title="还没有步骤" hint="任务开始执行后显示进度。" />
        )}
      </div>

      {task.evidence && task.evidence.length > 0 && (
        <>
          <h2 className="sg-h2">证据（Evidence）</h2>
          <div className="sg-col sg-mb">
            {task.evidence.map((e, i) => (
              <Card key={i}>
                <p style={{ margin: 0 }}>{String(e.claim)}</p>
                <div className="sg-row sg-mt-sm">
                  <span className="sg-badge">{String(e.sourceTitle)}</span>
                  <span className="sg-subtle">{String(e.locator ?? "")}</span>
                </div>
              </Card>
            ))}
          </div>
        </>
      )}

      <h2 className="sg-h2">输出</h2>
      <div className="sg-grid" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
        {(task.outputs?.length ?? 0) === 0 ? (
          <Empty title="暂无输出" hint="任务完成后在这里查看结果。" />
        ) : (
          task.outputs?.map((asset) => (
            <Card
              key={asset.id}
              onClick={() => {
                const href =
                  asset.type === "report" || asset.type === "document"
                    ? `/documents/${asset.id}`
                    : asset.type === "dataset"
                      ? `/datasets/${asset.id}`
                      : asset.type === "presentation"
                        ? `/presentations/${asset.id}`
                        : `/assets/${asset.id}`;
                navigate(href);
              }}
            >
              <strong>{asset.title}</strong>
              <div className="sg-row sg-mt-sm">
                <span className="sg-badge">{asset.type}</span>
                <StatusBadge status={asset.status} />
              </div>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
