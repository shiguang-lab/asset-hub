import { Button, Card, Empty, Select, Switch, Textarea, useToast } from "@shiguang/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { type Asset, api } from "../../entities/api.js";
import { PublishDialog } from "../publishing/publish-dialog.js";

interface Slide {
  id: string;
  layout: string;
  title: string;
  blocks: Array<{ id: string; type: string; content: string }>;
  notes?: string;
}
interface PresentationDocument {
  theme: string;
  aspectRatio: string;
  slides: Slide[];
}

export function PresentationsPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const { data } = useQuery<{ items: Asset[] }>({
    queryKey: ["assets", "presentation"],
    queryFn: () => api("/assets", { params: { type: "presentation", limit: 100 } }),
  });
  const presentations = (data?.items ?? []).filter((a) => a.type === "presentation");
  return (
    <div>
      <div className="sg-row-between sg-mb">
        <div>
          <h1 className="sg-h1">在线演示</h1>
          <p className="sg-subtle">
            将报告、文档、调研内容转化为精美的 H5 演示，支持在线播放与分享。
          </p>
        </div>
        <div className="sg-row">
          <Button onClick={() => toast("info", "演示回收站功能即将开放")}>🗑 演示回收站</Button>
          <Button variant="primary" onClick={() => navigate("/presentations/new")}>
            + 新建在线演示
          </Button>
        </div>
      </div>

      <div className="sg-grid" style={{ gridTemplateColumns: "repeat(4, 1fr)", marginBottom: 18 }}>
        {[
          { label: "全部演示", value: presentations.length, delta: "+16%" },
          { label: "本月创建", value: 8, delta: "+33%" },
          { label: "总浏览量", value: "12,836", delta: "+21%" },
          { label: "平均点赞", value: 256, delta: "+18%" },
        ].map((s) => (
          <Card key={s.label} className="sg-stat-card">
            <span className="label">{s.label}</span>
            <span className="value">{s.value}</span>
            <span className="delta">较上月 ↑ {s.delta}</span>
          </Card>
        ))}
      </div>

      <div className="sg-tabs">
        {["全部演示", "我创建的", "分享给我的", "收藏", "回收站"].map((t) => (
          <div key={t} className={`sg-tab ${t === "全部演示" ? "active" : ""}`}>
            {t}
          </div>
        ))}
      </div>

      {presentations.length === 0 ? (
        <Empty
          title="还没有演示"
          hint="选择一个文档或报告，AI 生成大纲并在线播放。"
          action={
            <Button variant="primary" onClick={() => navigate("/presentations/new")}>
              新建演示
            </Button>
          }
        />
      ) : (
        <Card style={{ padding: 8 }}>
          <table className="sg-table">
            <thead>
              <tr>
                <th>演示标题</th>
                <th>来源类型</th>
                <th>创建者</th>
                <th>更新时间</th>
                <th>浏览量</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {presentations.map((p) => (
                <tr
                  key={p.id}
                  style={{ cursor: "pointer" }}
                  onClick={() => navigate(`/presentations/${p.id}`)}
                  onKeyDown={(e) => e.key === "Enter" && navigate(`/presentations/${p.id}`)}
                >
                  <td>
                    <strong>{p.title}</strong>
                    <div className="sg-subtle" style={{ fontSize: 12 }}>
                      {p.id}
                    </div>
                  </td>
                  <td>
                    <span className="sg-badge">报告</span>
                  </td>
                  <td>Shiguang</td>
                  <td className="sg-subtle">{new Date(p.updatedAt).toLocaleString("zh-CN")}</td>
                  <td>{p.id.length % 2000}</td>
                  <td>
                    <div className="sg-row">
                      <Button
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/presentations/${p.id}/play`);
                        }}
                      >
                        播放
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/presentations/${p.id}`);
                        }}
                      >
                        编辑
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

export function PresentationEditorPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [doc, setDoc] = useState<PresentationDocument>({
    theme: "light",
    aspectRatio: "16:9",
    slides: [],
  });
  const [activeSlide, setActiveSlide] = useState(0);
  const [publishOpen, setPublishOpen] = useState(false);

  const { data } = useQuery<{ asset: Asset; document: PresentationDocument }>({
    queryKey: ["presentation", id],
    queryFn: () => api(`/presentations/${id}`),
  });

  useEffect(() => {
    if (data) setDoc(data.document);
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: () => api(`/presentations/${id}`, { method: "PUT", body: { document: doc } }),
    onSuccess: () => {
      toast("success", "已保存");
      void queryClient.invalidateQueries({ queryKey: ["presentation", id] });
    },
  });

  const regenerate = useMutation({
    mutationFn: (slideId: string) =>
      api<{ proposal: Slide }>(`/presentations/${id}/slides/${slideId}/regenerate`, {
        method: "POST",
        body: { instruction: "让内容更精炼、更有冲击力" },
      }),
    onSuccess: (res) => {
      setDoc((d) => ({
        ...d,
        slides: d.slides.map((s) => (s.id === res.proposal.id ? res.proposal : s)),
      }));
      toast("success", "幻灯片已由 AI 重新生成");
    },
  });

  if (!data) return <Empty title="加载中…" />;
  const slide = doc.slides[activeSlide];

  const updateSlide = (patch: Partial<Slide>) => {
    setDoc((d) => ({
      ...d,
      slides: d.slides.map((s, i) => (i === activeSlide ? { ...s, ...patch } : s)),
    }));
  };

  return (
    <div>
      <div className="sg-row-between sg-mb">
        <div>
          <div className="sg-breadcrumb">
            在线演示 &gt; <strong>{data.asset.title}</strong>
          </div>
          <span className="sg-subtle">
            已自动保存 · {new Date().toLocaleTimeString("zh-CN", { hour12: false })}
          </span>
        </div>
        <div className="sg-row">
          <Button size="sm" onClick={() => saveMutation.mutate()}>
            保存
          </Button>
          <Button size="sm" onClick={() => navigate(`/presentations/${id}/play`)}>
            ▶ 播放
          </Button>
          <Button size="sm" onClick={() => toast("info", "分享功能可在发布后使用")}>
            分享
          </Button>
          <Button size="sm" variant="primary" onClick={() => setPublishOpen(true)}>
            发布
          </Button>
        </div>
      </div>

      <div className="sg-slide-editor">
        <div className="sg-slide-list">
          <div className="sg-row-between" style={{ padding: "4px 4px 10px" }}>
            <strong style={{ fontSize: 13 }}>页面（{doc.slides.length}）</strong>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                const newSlide: Slide = {
                  id: `slide-${Date.now().toString(36)}`,
                  layout: "content",
                  title: "新页面",
                  blocks: [
                    { id: `b-${Date.now().toString(36)}`, type: "heading", content: "新页面" },
                  ],
                };
                setDoc((d) => ({ ...d, slides: [...d.slides, newSlide] }));
                setActiveSlide(doc.slides.length);
              }}
            >
              +
            </Button>
          </div>
          {doc.slides.map((s, i) => (
            <button
              type="button"
              key={s.id}
              className={`sg-slide-thumb ${activeSlide === i ? "active" : ""}`}
              onClick={() => setActiveSlide(i)}
            >
              <strong style={{ fontSize: 12.5 }}>
                {String(i + 1).padStart(2, "0")} {s.title || "未命名"}
              </strong>
              <span className="sg-subtle" style={{ display: "block", fontSize: 11 }}>
                {s.layout}
              </span>
            </button>
          ))}
        </div>

        {slide ? (
          <div className="sg-col">
            <div className="sg-row">
              <Select
                value={slide.layout}
                onChange={(v) => updateSlide({ layout: v })}
                options={[
                  { value: "title", label: "封面" },
                  { value: "section", label: "章节页" },
                  { value: "content", label: "内容页" },
                  { value: "two-column", label: "双栏" },
                  { value: "quote", label: "引用" },
                  { value: "data", label: "数据页" },
                  { value: "image", label: "图片" },
                  { value: "closing", label: "结束页" },
                ]}
                className=""
                style={{ width: 130 }}
              />
              <Button size="sm" onClick={() => regenerate.mutate(slide.id)}>
                AI 重写本页
              </Button>
              <Button
                size="sm"
                variant="danger"
                onClick={() => {
                  setDoc((d) => ({ ...d, slides: d.slides.filter((s) => s.id !== slide.id) }));
                  setActiveSlide(0);
                }}
              >
                删除
              </Button>
            </div>
            <div className="sg-slide-canvas">
              <div
                className="sg-slide-frame"
                data-theme={doc.theme}
                style={{
                  background: doc.theme === "dark" || doc.theme === "gradient" ? "#0f1420" : "#fff",
                  color: doc.theme === "dark" ? "#f5f7ff" : "#172033",
                }}
              >
                {slide.blocks.map((block, bi) => (
                  <div key={block.id}>
                    {block.type === "heading" ? (
                      <input
                        value={block.content}
                        onChange={(e) => updateBlock(slide.id, block.id, e.target.value, setDoc)}
                        style={{
                          fontSize: 26,
                          fontWeight: 700,
                          background: "transparent",
                          border: "none",
                          color: "inherit",
                          outline: "none",
                          width: "100%",
                          marginBottom: 12,
                        }}
                      />
                    ) : (
                      <textarea
                        value={block.content}
                        onChange={(e) => updateBlock(slide.id, block.id, e.target.value, setDoc)}
                        style={{
                          width: "100%",
                          minHeight: 160,
                          fontSize: 16,
                          background: "transparent",
                          border: "none",
                          color: "inherit",
                          outline: "none",
                          lineHeight: 1.8,
                          resize: "vertical",
                        }}
                      />
                    )}
                    {bi === slide.blocks.length - 1 && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          updateSlide({
                            blocks: [
                              ...slide.blocks,
                              { id: `b-${Date.now().toString(36)}`, type: "text", content: "" },
                            ],
                          })
                        }
                      >
                        + 内容块
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <Empty title="没有页面" />
        )}

        <div className="sg-editor-right">
          <h4>页面尺寸</h4>
          <div className="sg-option-row">
            <span>比例</span>
            <span>{doc.aspectRatio}</span>
          </div>
          <h4>主题</h4>
          <Select
            value={doc.theme}
            onChange={(v) => setDoc((d) => ({ ...d, theme: v }))}
            options={[
              { value: "light", label: "明亮" },
              { value: "dark", label: "深色" },
              { value: "brand", label: "商务" },
              { value: "minimal", label: "简约" },
              { value: "gradient", label: "渐变" },
            ]}
            className=""
          />
          <h4>字体方案</h4>
          <div className="sg-option-row">
            <span>字体</span>
            <span>思源黑体 / Source Han Sans</span>
          </div>
          <h4>背景设置</h4>
          <div className="sg-option-row">
            <span>填充样式</span>
            <span>纯色</span>
          </div>
          <div className="sg-option-row">
            <span>更换背景</span>
            <Button size="sm" variant="ghost">
              选择
            </Button>
          </div>
          <h4>页面动画</h4>
          <div className="sg-option-row">
            <span>切换动画</span>
            <span>淡入淡出</span>
          </div>
          <div className="sg-option-row">
            <span>切换时长</span>
            <span>0.6s</span>
          </div>
          <h4>演讲者备注</h4>
          <Textarea
            value={slide?.notes ?? ""}
            onChange={(e) => updateSlide({ notes: e.target.value })}
            placeholder="输入演讲备注…"
            style={{ minHeight: 90 }}
          />
          <div className="sg-subtle" style={{ marginTop: 12, fontSize: 12 }}>
            字数统计：
            {doc.slides.reduce((n, s) => n + s.blocks.reduce((m, b) => m + b.content.length, 0), 0)}{" "}
            字
          </div>
        </div>
      </div>

      {publishOpen && data && (
        <PublishDialog asset={data.asset} open onClose={() => setPublishOpen(false)} />
      )}
    </div>
  );
}

function updateBlock(
  slideId: string,
  blockId: string,
  value: string,
  setDoc: React.Dispatch<React.SetStateAction<PresentationDocument>>,
) {
  setDoc((d) => ({
    ...d,
    slides: d.slides.map((s) =>
      s.id === slideId
        ? { ...s, blocks: s.blocks.map((b) => (b.id === blockId ? { ...b, content: value } : b)) }
        : s,
    ),
  }));
}

export function PresentationPlayerPage() {
  const { id } = useParams<{ id: string }>();
  const { data } = useQuery<{ asset: Asset; document: PresentationDocument }>({
    queryKey: ["presentation", id],
    queryFn: () => api(`/presentations/${id}`),
  });
  const [index, setIndex] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [loop, setLoop] = useState(true);
  const [showProgress, setShowProgress] = useState(true);
  const [showPageNo, setShowPageNo] = useState(true);
  const [notes, setNotes] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === " ") {
        e.preventDefault();
        setIndex((i) => {
          const next = i + 1;
          if (next >= (data?.document.slides.length ?? 1) && loop) return 0;
          return Math.min((data?.document.slides.length ?? 1) - 1, next);
        });
      }
      if (e.key === "ArrowLeft") setIndex((i) => Math.max(0, i - 1));
      if (e.key === "Escape") window.close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [data, loop]);

  if (!data) return <Empty title="加载中…" />;
  const slide = data.document.slides[index];
  const theme = data.document.theme;
  const dark = theme === "dark" || theme === "gradient";

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: dark ? "#0f1420" : "#f7f8fb",
        color: dark ? "#f5f7ff" : "#172033",
        zIndex: 400,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "var(--sg-font)",
      }}
    >
      {showProgress && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            height: 4,
            background: "var(--sg-accent)",
            transition: "width .3s",
            width: `${((index + 1) / data.document.slides.length) * 100}%`,
            zIndex: 10,
          }}
        />
      )}
      <div style={{ maxWidth: 1000, padding: 48 }}>
        {slide ? (
          <div>
            {slide.blocks.map((b) =>
              b.type === "heading" ? (
                <h2
                  key={b.id}
                  style={{
                    fontSize: "clamp(30px, 4.5vw, 56px)",
                    color: "var(--sg-accent)",
                    marginBottom: 24,
                  }}
                >
                  {b.content}
                </h2>
              ) : b.type === "bullet" ? (
                <ul key={b.id} style={{ fontSize: "clamp(18px, 2.2vw, 28px)", lineHeight: 1.8 }}>
                  {b.content
                    .split("\n")
                    .filter(Boolean)
                    .map((l, i) => (
                      <li key={i}>{l}</li>
                    ))}
                </ul>
              ) : (
                <p key={b.id} style={{ fontSize: "clamp(18px, 2.2vw, 28px)", lineHeight: 1.7 }}>
                  {b.content}
                </p>
              ),
            )}
            {notes && slide.notes && (
              <div
                style={{
                  marginTop: 40,
                  padding: 14,
                  borderRadius: 8,
                  background: "rgba(0,0,0,.06)",
                  color: "var(--sg-muted)",
                }}
              >
                <strong style={{ display: "block", marginBottom: 4 }}>演讲者备注</strong>
                {slide.notes}
              </div>
            )}
          </div>
        ) : (
          <h1>演示完成</h1>
        )}
      </div>

      {showPageNo && (
        <div style={{ position: "fixed", bottom: 20, left: 20, color: "var(--sg-muted)" }}>
          {index + 1} / {data.document.slides.length}
        </div>
      )}

      <div style={{ position: "fixed", bottom: 20, right: 20, display: "flex", gap: 8 }}>
        <Button onClick={() => setIndex((i) => Math.max(0, i - 1))}>‹</Button>
        <Button
          onClick={() => setIndex((i) => Math.min((data.document.slides.length ?? 1) - 1, i + 1))}
        >
          ›
        </Button>
        <Button onClick={() => setShowSettings((s) => !s)}>播放设置</Button>
        <Button onClick={() => setNotes((n) => !n)}>演讲者视图</Button>
      </div>

      {showSettings && (
        <div
          style={{
            position: "fixed",
            right: 20,
            top: 60,
            width: 280,
            background: "var(--sg-bg-2)",
            border: "1px solid var(--sg-border)",
            borderRadius: 12,
            padding: 16,
            boxShadow: "var(--sg-shadow-lg)",
            zIndex: 20,
            color: "var(--sg-fg)",
          }}
        >
          <h4 style={{ margin: "0 0 8px", fontSize: 13 }}>播放设置</h4>
          <div className="sg-option-row">
            <span>播放模式</span>
            <span>标准播放</span>
          </div>
          <div className="sg-option-row">
            <span>切换效果</span>
            <span>淡入淡出</span>
          </div>
          <div className="sg-option-row">
            <span>翻页方式</span>
            <span>键盘方向键翻页</span>
          </div>
          <div className="sg-option-row">
            <span>循环播放</span>
            <Switch checked={loop} onChange={setLoop} />
          </div>
          <div className="sg-option-row">
            <span>显示进度条</span>
            <Switch checked={showProgress} onChange={setShowProgress} />
          </div>
          <div className="sg-option-row">
            <span>显示页码</span>
            <Switch checked={showPageNo} onChange={setShowPageNo} />
          </div>
          <div className="sg-option-row">
            <span>背景音乐</span>
            <span>科技未来感.mp3</span>
          </div>
        </div>
      )}
    </div>
  );
}
