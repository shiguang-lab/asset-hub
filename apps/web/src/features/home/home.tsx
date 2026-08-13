import { Card, formatRelative, Progress, StatusBadge } from "@shiguang/ui";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, type HomeData } from "../../entities/api.js";
import { AssetRow } from "../../shared/asset-row.js";

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

  const running = data?.runningTasks?.[0];

  return (
    <div>
      <p className="sg-eyebrow">AI 原生知识与数字资产工作台</p>
      <h1 className="sg-h1" style={{ fontSize: 28, marginBottom: 18 }}>
        今天想完成什么？
      </h1>

      <input
        className="sg-hero-input"
        placeholder="描述你的目标，例如：帮我调研越南消费金融市场…"
        value={goal}
        onChange={(e) => setGoal(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        style={{ marginBottom: 18 }}
      />

      <div className="sg-quick-create" style={{ marginBottom: 24 }}>
        {[
          { label: "深度调研", sub: "全面调研与分析", icon: "◎", to: "/research/new" },
          { label: "写文档", sub: "AI 协助撰写文档", icon: "📄", to: "/documents/new" },
          { label: "在线演示", sub: "生成演示文稿", icon: "▶", to: "/presentations/new" },
          { label: "知识库", sub: "构建知识体系", icon: "▤", to: "/knowledge/new" },
        ].map((item) => (
          <button
            key={item.label}
            type="button"
            className="sg-quick-item"
            onClick={() => navigate(item.to)}
          >
            <span className="icon">{item.icon}</span>
            <strong>{item.label}</strong>
            <span className="sub">{item.sub}</span>
          </button>
        ))}
      </div>

      <div className="sg-grid" style={{ gridTemplateColumns: "1fr 1.4fr" }}>
        <div className="sg-col">
          <h2 className="sg-h2">正在执行</h2>
          {!running ? (
            <Card>
              <div className="sg-subtle">没有运行中的任务</div>
              <p className="sg-subtle" style={{ margin: "4px 0 0" }}>
                创建调研或生成演示后，任务会在这里显示进度。
              </p>
            </Card>
          ) : (
            <Card>
              <div className="sg-row-between">
                <strong>{running.goal}</strong>
                <StatusBadge status={running.status} />
              </div>
              <div className="sg-subtle" style={{ margin: "8px 0 10px" }}>
                {running.currentStep || "等待执行"} · 可以关闭页面
              </div>
              <Progress value={running.progress} />
              <div className="sg-subtle" style={{ marginTop: 8, fontSize: 12 }}>
                预计剩余 {Math.max(1, Math.ceil((100 - running.progress) / 12))} 分钟
              </div>
            </Card>
          )}
        </div>

        <div className="sg-col">
          <h2 className="sg-h2">最近内容</h2>
          {(data?.recentAssets.length ?? 0) === 0 ? (
            <Card>
              <div className="sg-subtle">还没有资产，创建第一份文档开始。</div>
            </Card>
          ) : (
            <Card style={{ padding: 8 }}>
              <table className="sg-table">
                <thead>
                  <tr>
                    <th>名称</th>
                    <th>类型</th>
                    <th>更新时间</th>
                  </tr>
                </thead>
                <tbody>
                  {data?.recentAssets.map((asset) => (
                    <tr
                      key={asset.id}
                      style={{ cursor: "pointer" }}
                      onClick={() => {
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
                        navigate(href);
                      }}
                    >
                      <td>
                        <span style={{ marginRight: 6 }}>📄</span>
                        {asset.title}
                      </td>
                      <td>
                        <span className="sg-badge">{asset.type}</span>
                      </td>
                      <td className="sg-subtle">{formatRelative(asset.updatedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </div>
      </div>

      {(data?.templates.length ?? 0) > 0 && (
        <div className="sg-mt">
          <div className="sg-row-between">
            <h2 className="sg-h2">推荐模板</h2>
            <button
              type="button"
              className="sg-subtle"
              style={{ cursor: "pointer", border: 0, background: "transparent" }}
              onClick={() => navigate("/templates")}
            >
              查看全部 &gt;
            </button>
          </div>
          <div className="sg-grid" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
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
                <p className="sg-subtle" style={{ margin: "6px 0 12px" }}>
                  {t.description}
                </p>
                <div className="sg-row-between">
                  <span className="sg-subtle">{t.usageCount} 次使用</span>
                  <span className="sg-btn sg-btn-sm sg-btn-primary">使用模板</span>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export { AssetRow };
