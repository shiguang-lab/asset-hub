import { Card, Empty, formatRelative, Progress, StatusBadge } from "@shiguang/ui";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { type Asset, api, type HomeData } from "../../entities/api.js";

export function HomePage() {
  const navigate = useNavigate();
  const [goal, setGoal] = useState("");
  const { data } = useQuery<HomeData>({
    queryKey: ["home"],
    queryFn: () => api<HomeData>("/home"),
  });

  const submit = () => {
    const text = goal.trim();
    if (!text) return;
    if (/调研|研究|分析|research/i.test(text)) {
      navigate(`/research/new?goal=${encodeURIComponent(text)}`);
    } else {
      navigate(`/documents/new?title=${encodeURIComponent(text)}`);
    }
  };

  return (
    <div>
      <p className="sg-eyebrow">SHIGUANG LAB</p>
      <h1 className="sg-h1" style={{ fontSize: 30, marginBottom: 20 }}>
        今天想完成什么？
      </h1>

      <div style={{ marginBottom: 12 }}>
        <input
          className="sg-hero-input"
          placeholder="描述你的目标，例如：帮我分析越南消费金融市场"
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
        />
      </div>

      <div className="sg-quick-create" style={{ marginBottom: 28 }}>
        {[
          { label: "深度调研", icon: "◎", to: "/research/new" },
          { label: "写文档", icon: "📄", to: "/documents/new" },
          { label: "在线演示", icon: "▶", to: "/presentations/new" },
          { label: "知识库", icon: "▤", to: "/knowledge/new" },
        ].map((item) => (
          <button
            key={item.label}
            type="button"
            className="sg-quick-item"
            onClick={() => navigate(item.to)}
          >
            <span className="icon">{item.icon}</span>
            <strong>{item.label}</strong>
          </button>
        ))}
      </div>

      <div className="sg-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <div className="sg-col">
          <h2 className="sg-h2">运行中任务</h2>
          {(data?.runningTasks.length ?? 0) === 0 ? (
            <Empty title="没有运行中的任务" hint="创建调研或生成演示后，任务会在这里显示进度。" />
          ) : (
            (data?.runningTasks ?? []).map((task) => (
              <Card key={task.id} onClick={() => navigate(`/tasks/${task.id}`)}>
                <div className="sg-row-between">
                  <strong>{task.goal}</strong>
                  <StatusBadge status={task.status} />
                </div>
                <div className="sg-subtle" style={{ margin: "6px 0 10px" }}>
                  {task.currentStep || "等待执行"}
                </div>
                <Progress value={task.progress} />
              </Card>
            ))
          )}
        </div>
        <div className="sg-col">
          <h2 className="sg-h2">最近内容</h2>
          {(data?.recentAssets.length ?? 0) === 0 ? (
            <Empty title="还没有资产" hint="创建第一份文档，或从 + 新建开始。" />
          ) : (
            (data?.recentAssets ?? []).map((asset) => <AssetRow key={asset.id} asset={asset} />)
          )}
        </div>
      </div>

      {(data?.templates.length ?? 0) > 0 && (
        <div className="sg-mt">
          <h2 className="sg-h2">推荐模板</h2>
          <div className="sg-grid" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
            {data?.templates.map((t) => (
              <Card
                key={t.id}
                onClick={() =>
                  navigate(
                    t.type === "research"
                      ? `/research/new?template=${t.id}`
                      : `/presentations/new?template=${t.id}`,
                  )
                }
              >
                <strong>{t.name}</strong>
                <p className="sg-subtle" style={{ margin: "4px 0 0" }}>
                  {t.description}
                </p>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function AssetRow({ asset, actions }: { asset: Asset; actions?: React.ReactNode }) {
  const navigate = useNavigate();
  const href =
    asset.type === "document" || asset.type === "report"
      ? `/documents/${asset.id}`
      : asset.type === "html"
        ? `/html/${asset.id}`
        : asset.type === "presentation"
          ? `/presentations/${asset.id}`
          : asset.type === "dataset"
            ? `/datasets/${asset.id}`
            : `/assets/${asset.id}`;
  return (
    <Card onClick={() => navigate(href)}>
      <div className="sg-row-between">
        <div className="sg-col" style={{ gap: 2, minWidth: 0 }}>
          <strong style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {asset.title}
          </strong>
          <span className="sg-subtle">
            {asset.type} · {formatRelative(asset.updatedAt)}
          </span>
        </div>
        <div className="sg-row">
          <StatusBadge status={asset.status} />
          {actions}
        </div>
      </div>
    </Card>
  );
}
