import { formatRelative } from "@shiguang/ui";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, FileText, Send, Sparkles } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { type Asset, api, type HomeData } from "../../entities/api.js";
import {
  AssetMiniPreview,
  PanoramicTemplateArt,
  type StudioBadgeKind,
  StudioModeBadge,
} from "../../shared/studio-visuals.js";

const FALLBACK_TEMPLATES = [
  {
    id: "industry-research",
    type: "research",
    name: "行业调研",
    description: "全面的行业研究与趋势分析框架",
  },
  {
    id: "competitive-analysis",
    type: "research",
    name: "竞品分析",
    description: "多维度竞品对比矩阵与商业洞察",
  },
  {
    id: "solution-presentation",
    type: "presentation",
    name: "技术方案演示",
    description: "面向架构评审与路演的演示模板",
  },
];

const ASSET_TYPE_META: Record<string, { label: string; tone: string }> = {
  document: { label: "文档", tone: "indigo" },
  report: { label: "调研报告", tone: "emerald" },
  knowledge: { label: "知识库", tone: "sky" },
  presentation: { label: "演示文稿", tone: "violet" },
  pdf: { label: "PDF", tone: "rose" },
  html: { label: "HTML 页面", tone: "sky" },
  dataset: { label: "数据集", tone: "emerald" },
};

function assetHref(asset: Asset): string {
  if (asset.type === "document" || asset.type === "report") return `/documents/${asset.id}`;
  if (asset.type === "html") return `/html/${asset.id}`;
  if (asset.type === "presentation") return `/presentations/${asset.id}`;
  if (asset.type === "dataset") return `/datasets/${asset.id}`;
  return `/assets/${asset.id}`;
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
  const templates = [...(data?.templates ?? []), ...FALLBACK_TEMPLATES]
    .filter(
      (item, index, items) =>
        items.findIndex((candidate) => candidate.name === item.name) === index,
    )
    .slice(0, 3);

  const recentAssets = data?.recentAssets?.slice(0, 4) ?? [];

  const quickModes: Array<{
    label: string;
    sub: string;
    badge: StudioBadgeKind;
    to: string;
  }> = [
    { label: "深度调研", sub: "全面调研与分析", badge: "research", to: "/research/new" },
    { label: "写文档", sub: "AI 协助撰写文档", badge: "write", to: "/documents/new" },
    { label: "在线演示", sub: "生成演示文稿", badge: "slides", to: "/presentations/new" },
    { label: "知识库", sub: "构建知识体系", badge: "kb", to: "/knowledge/new" },
  ];

  return (
    <div className="zx-home-studio">
      <section className="zx-hero-open">
        <h1>今天想完成什么？</h1>
        <div className="zx-omni-rim">
          <div className="zx-omni-inner">
            <input
              aria-label="描述目标"
              placeholder="描述你的目标，例如：帮我调研越南消费金融市场..."
              value={goal}
              onChange={(event) => setGoal(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && submit()}
            />
            <button type="button" className="zx-omni-send" onClick={submit} aria-label="提交目标">
              <Send size={18} />
            </button>
          </div>
        </div>

        <div className="zx-mode-cluster">
          {quickModes.map((item) => (
            <button
              key={item.label}
              type="button"
              className="zx-mode-pill"
              onClick={() => navigate(item.to)}
            >
              <StudioModeBadge kind={item.badge} />
              <span className="zx-mode-txt">
                <strong>{item.label}</strong>
                <small>{item.sub}</small>
              </span>
            </button>
          ))}
        </div>

        {running ? (
          <button
            type="button"
            className="zx-live-island tabular"
            onClick={() => navigate(`/tasks/${running.id}`)}
          >
            <span style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
              <span className="zx-pulse-dot" />
              <strong
                style={{
                  fontWeight: 660,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                正在执行 · {running.goal}
              </strong>
              <span style={{ color: "var(--sg-muted)", whiteSpace: "nowrap" }}>
                {running.currentStep || "正在读取资料"} · 可随时关闭页面
              </span>
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: 11, flexShrink: 0 }}>
              <span className="zx-island-bar">
                <i style={{ width: `${Math.max(4, Math.min(100, running.progress))}%` }} />
              </span>
              <strong style={{ color: "var(--zx-brand)" }}>{running.progress}%</strong>
              <span style={{ color: "var(--sg-muted)" }}>
                剩余 {Math.max(1, Math.ceil((100 - running.progress) / 12))} 分钟
              </span>
              <ArrowRight size={14} color="#C084FC" />
            </span>
          </button>
        ) : (
          <button
            type="button"
            className="zx-live-island"
            onClick={() => navigate("/research/new")}
          >
            <span style={{ display: "flex", alignItems: "center", gap: 9 }}>
              <Sparkles size={14} color="#C084FC" />
              <strong style={{ fontWeight: 640 }}>还没有正在执行的后台任务</strong>
              <span style={{ color: "var(--sg-muted)" }}>
                发起深度调研后将在此实时播报步骤进度，可随时关闭页面
              </span>
            </span>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                color: "var(--zx-brand)",
                fontWeight: 620,
                flexShrink: 0,
              }}
            >
              发起调研 <ArrowRight size={14} />
            </span>
          </button>
        )}
      </section>

      <div className="zx-showcase-wrap">
        <section>
          <div className="zx-sec-bar">
            <h2>
              最近内容 <span>继续上次的创作</span>
            </h2>
            <button type="button" className="zx-sec-more" onClick={() => navigate("/assets")}>
              查看全部 <ArrowRight size={14} />
            </button>
          </div>
          {recentAssets.length === 0 ? (
            <button
              type="button"
              className="zx-home-empty-card"
              onClick={() => navigate("/documents/new")}
            >
              <span style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <span className="zx-jewel indigo" style={{ width: 42, height: 42 }}>
                  <FileText size={19} />
                </span>
                <span>
                  <strong style={{ display: "block", fontSize: 14.5 }}>还没有最近内容</strong>
                  <small style={{ color: "var(--sg-muted)", fontSize: 12.5 }}>
                    创建第一份 Markdown 文档或发起 AI 深度调研开始创作
                  </small>
                </span>
              </span>
              <span className="zx-btn-cta">立即新建</span>
            </button>
          ) : (
            <div className="zx-rec-gallery">
              {recentAssets.map((asset) => {
                const meta = ASSET_TYPE_META[asset.type] ?? { label: asset.type, tone: "neutral" };
                return (
                  <button
                    key={asset.id}
                    type="button"
                    className="zx-work-card"
                    onClick={() => navigate(assetHref(asset))}
                  >
                    <div className="zx-work-thumb">
                      <AssetMiniPreview asset={asset} />
                    </div>
                    <div className="zx-work-meta">
                      <div className="zx-work-title">{asset.title}</div>
                      <div className="zx-work-foot tabular">
                        <span className={`zx-pill ${meta.tone}`}>{meta.label}</span>
                        <span>{formatRelative(asset.updatedAt)}</span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        <section>
          <div className="zx-sec-bar">
            <h2>
              推荐模板 <span>开箱即用的结构化创作范式</span>
            </h2>
            <button type="button" className="zx-sec-more" onClick={() => navigate("/templates")}>
              全部模板 <ArrowRight size={14} />
            </button>
          </div>
          <div className="zx-tpl-gallery">
            {templates.map((template, index) => {
              const href =
                template.type === "research"
                  ? `/research/new?template=${template.id}`
                  : `/presentations/new?template=${template.id}`;
              return (
                <article key={template.id} className="zx-pano-tpl" onClick={() => navigate(href)}>
                  <div className="zx-pano-art">
                    <PanoramicTemplateArt index={index} />
                  </div>
                  <div className="zx-pano-foot">
                    <div className="zx-pano-copy">
                      <strong>{template.name}</strong>
                      <small>{template.description}</small>
                    </div>
                    <button
                      type="button"
                      className={`zx-pano-btn b${index % 3}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        navigate(href);
                      }}
                    >
                      使用模板
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}
