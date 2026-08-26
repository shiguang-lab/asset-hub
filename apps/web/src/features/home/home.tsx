import { formatRelative } from "@shiguang/ui";
import { useQuery } from "@tanstack/react-query";
import { createStyles } from "antd-style";
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  FilePenLine,
  FileText,
  FileType2,
  MonitorPlay,
  Search,
  Send,
} from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { type Asset, api, type HomeData } from "../../entities/api.js";
import { AppTable } from "../../shared/AppTable.js";

const useHomePageStyles = createStyles((_token, props: { progress: number }) => ({
  progress: {
    width: `${props.progress}%`,
  },
}));

const TEMPLATE_PREVIEWS = [
  "/reference/template-research.webp",
  "/reference/template-compare.webp",
  "/reference/template-presentation.webp",
];

const FALLBACK_TEMPLATES = [
  {
    id: "industry-research",
    type: "research",
    name: "行业调研",
    description: "全面的行业研究与趋势分析",
  },
  {
    id: "competitive-analysis",
    type: "research",
    name: "竞品分析",
    description: "多维度竞品对比与洞察",
  },
  {
    id: "solution-presentation",
    type: "presentation",
    name: "技术方案演示",
    description: "专业的技术方案展示模板",
  },
];

const ASSET_TYPE_LABELS: Record<string, string> = {
  document: "文档",
  report: "文档",
  knowledge: "知识库",
  presentation: "演示文稿",
  pdf: "PDF",
  html: "HTML 页面",
  dataset: "数据集",
};

function assetHref(asset: Asset): string {
  if (asset.type === "document" || asset.type === "report") return `/documents/${asset.id}`;
  if (asset.type === "html") return `/html/${asset.id}`;
  if (asset.type === "presentation") return `/presentations/${asset.id}`;
  if (asset.type === "dataset") return `/datasets/${asset.id}`;
  return `/assets/${asset.id}`;
}

function AssetIcon({ type }: { type: string }) {
  if (type === "presentation") return <MonitorPlay size={16} />;
  if (type === "pdf") return <FileType2 size={16} />;
  if (type === "knowledge") return <BookOpen size={16} />;
  return <FileText size={16} />;
}

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
  const { styles } = useHomePageStyles({ progress: running?.progress ?? 0 });
  const templates = [...(data?.templates ?? []), ...FALLBACK_TEMPLATES]
    .filter(
      (item, index, items) =>
        items.findIndex((candidate) => candidate.name === item.name) === index,
    )
    .slice(0, 3);

  return (
    <div className="sg-home">
      <section className="sg-home-hero">
        <h1>今天想完成什么？</h1>
        <div className="sg-hero-compose">
          <input
            aria-label="描述目标"
            placeholder="描述你的目标，例如：帮我调研越南消费金融市场..."
            value={goal}
            onChange={(event) => setGoal(event.target.value)}
            onKeyDown={(event) => event.key === "Enter" && submit()}
          />
          <button type="button" onClick={submit} aria-label="提交目标">
            <Send size={18} />
          </button>
        </div>
      </section>

      <div className="sg-quick-create">
        {[
          {
            label: "深度调研",
            sub: "全面调研与分析",
            icon: Search,
            tone: "blue",
            to: "/research/new",
          },
          {
            label: "写文档",
            sub: "AI 协助撰写文档",
            icon: FilePenLine,
            tone: "green",
            to: "/documents/new",
          },
          {
            label: "在线演示",
            sub: "生成演示文稿",
            icon: MonitorPlay,
            tone: "violet",
            to: "/presentations/new",
          },
          {
            label: "知识库",
            sub: "构建知识体系",
            icon: BookOpen,
            tone: "cyan",
            to: "/knowledge/new",
          },
        ].map((item) => (
          <button
            key={item.label}
            type="button"
            className="sg-quick-item"
            onClick={() => navigate(item.to)}
          >
            <span className={`icon ${item.tone}`}>
              <item.icon size={30} strokeWidth={1.8} />
            </span>
            <span className="sg-quick-copy">
              <strong>{item.label}</strong>
              <small>{item.sub}</small>
            </span>
            <ArrowRight size={17} className="arrow" />
          </button>
        ))}
      </div>

      <div className="sg-home-columns">
        <section className="sg-home-panel sg-running-panel">
          <div className="sg-section-head">
            <h2>正在执行</h2>
            <button type="button" aria-label="更多任务">
              •••
            </button>
          </div>

          <div className="sg-running-body">
            {running ? (
              <button
                type="button"
                className="sg-running-card"
                onClick={() => navigate(`/tasks/${running.id}`)}
              >
                <span className="sg-running-icon">
                  <BarChart3 size={25} />
                </span>
                <span className="sg-running-info">
                  <strong>{running.goal}</strong>
                  <span className="sg-progress-line">
                    <i className={styles.progress} />
                  </span>
                  <small>{running.currentStep || "正在读取资料"} · 可以关闭页面</small>
                </span>
                <span className="sg-running-progress">
                  <b>{running.progress}%</b>
                  <small>
                    预计剩余 {Math.max(1, Math.ceil((100 - running.progress) / 12))} 分钟
                  </small>
                </span>
              </button>
            ) : (
              <button
                type="button"
                className="sg-running-empty"
                onClick={() => navigate("/research/new")}
              >
                <span className="sg-running-icon">
                  <BarChart3 size={25} />
                </span>
                <span>
                  <strong>还没有正在执行的任务</strong>
                  <small>发起调研后，可在这里随时查看进度</small>
                </span>
                <ArrowRight size={17} />
              </button>
            )}
          </div>

          <div className="sg-template-section">
            <h3>推荐模板</h3>
            <div className="sg-template-grid">
              {templates.map((template, index) => (
                <article className="sg-template-card" key={template.id}>
                  <img src={TEMPLATE_PREVIEWS[index]} alt="" />
                  <div>
                    <strong>{template.name}</strong>
                    <small>{template.description}</small>
                    <button
                      type="button"
                      onClick={() =>
                        navigate(
                          template.type === "research"
                            ? `/research/new?template=${template.id}`
                            : `/presentations/new?template=${template.id}`,
                        )
                      }
                    >
                      使用模板
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="sg-home-panel sg-recent-panel">
          <div className="sg-section-head">
            <h2>最近内容</h2>
          </div>
          <div className="sg-recent-content">
            {(data?.recentAssets.length ?? 0) === 0 ? (
              <button
                type="button"
                className="sg-recent-empty"
                onClick={() => navigate("/documents/new")}
              >
                <FileText size={24} />
                <span>
                  <strong>还没有内容</strong>
                  <small>创建第一份文档开始</small>
                </span>
                <ArrowRight size={17} />
              </button>
            ) : (
              <AppTable<Asset>
                rowKey="id"
                dataSource={data?.recentAssets.slice(0, 6) ?? []}
                pagination={false}
                size="middle"
                onRow={(asset) => ({
                  className: "sg-home-recent-row",
                  onClick: () => navigate(assetHref(asset)),
                })}
                columns={[
                  {
                    title: "名称",
                    dataIndex: "title",
                    render: (_v, asset) => (
                      <div className="sg-home-recent-name">
                        <span className={`sg-file-icon ${asset.type}`}>
                          <AssetIcon type={asset.type} />
                        </span>
                        <strong>{asset.title}</strong>
                      </div>
                    ),
                  },
                  {
                    title: "类型",
                    dataIndex: "type",
                    render: (v) => ASSET_TYPE_LABELS[v] ?? v,
                  },
                  {
                    title: "更新时间",
                    dataIndex: "updatedAt",
                    render: (v) => formatRelative(v),
                  },
                ]}
              />
            )}
          </div>
          <button type="button" className="sg-view-all" onClick={() => navigate("/assets")}>
            查看全部 <ArrowRight size={16} />
          </button>
        </section>
      </div>
    </div>
  );
}
