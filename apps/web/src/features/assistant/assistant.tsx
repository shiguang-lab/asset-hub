import { useQuery } from "@tanstack/react-query";
import { Button, Progress } from "antd";
import {
  ChartNoAxesCombined,
  FileText,
  MonitorPlay,
  Search,
  Send,
  Sparkles,
  Wand2,
} from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, type HomeData } from "../../entities/api.js";

const QUICK_ACTIONS = [
  { icon: Search, label: "搜索资料", prompt: "帮我搜索资料", to: "/assets" },
  { icon: FileText, label: "写一份报告", prompt: "写一份报告：", to: "/documents/new" },
  { icon: MonitorPlay, label: "生成演示", prompt: "生成一个演示：", to: "/presentations/new" },
  { icon: ChartNoAxesCombined, label: "分析数据", prompt: "帮我分析数据：", to: "/datasets" },
  { icon: Wand2, label: "自由创作", prompt: "", to: "/documents/new" },
];

const SUGGESTIONS = [
  "帮我分析这个行业的发展机会",
  "基于这些资料，生成一份调研报告",
  "如何制作一个生动的演示？",
];

export function AssistantPage() {
  const navigate = useNavigate();
  const [input, setInput] = useState("");
  const { data: home } = useQuery<HomeData>({ queryKey: ["home"], queryFn: () => api("/home") });

  const submit = (text: string) => {
    const value = text.trim();
    if (!value) return;
    if (/调研|研究|分析|research/i.test(value)) {
      navigate(`/research/new?goal=${encodeURIComponent(value)}`);
    } else if (/演示|slides|presentation/i.test(value)) {
      navigate(`/presentations/new?topic=${encodeURIComponent(value)}`);
    } else {
      navigate(`/documents/new?title=${encodeURIComponent(value)}`);
    }
  };

  const credits = home?.credits ?? 0;

  return (
    <div className="sg-assistant">
      <div className="sg-assistant-main">
        <p className="sg-eyebrow">AI 助手</p>
        <h1 className="sg-h1" style={{ fontSize: 26, marginBottom: 4 }}>
          你好，很高兴见到你
        </h1>
        <p className="sg-subtle" style={{ marginBottom: 22 }}>
          更高效地整理信息，探索知识，创造有价值的产出。
        </p>

        <div className="sg-assistant-prompt">
          <div className="sg-row" style={{ gap: 8, marginBottom: 12 }}>
            <span className="sg-assistant-label">
              <Sparkles size={13} /> AI 助手
            </span>
          </div>
          <textarea
            className="sg-assistant-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit(input);
              }
            }}
            placeholder="告诉我你想做什么…"
            rows={3}
          />
          <div className="sg-row-between" style={{ marginTop: 12 }}>
            <span className="sg-subtle" style={{ fontSize: 12 }}>
              支持搜索、写作、调研、演示与数据分析
            </span>
            <Button type="primary" onClick={() => submit(input)} disabled={!input.trim()}>
              <Send size={14} /> 发送
            </Button>
          </div>
        </div>

        <div className="sg-row" style={{ flexWrap: "wrap", gap: 10, marginTop: 18 }}>
          {QUICK_ACTIONS.map((q) => (
            <button
              key={q.label}
              type="button"
              className="sg-assistant-action"
              onClick={() => navigate(q.to)}
            >
              <q.icon size={17} />
              {q.label}
            </button>
          ))}
        </div>

        <h3 className="sg-h3" style={{ margin: "26px 0 10px" }}>
          你可以这样问我
        </h3>
        <div className="sg-col" style={{ gap: 8 }}>
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              className="sg-assistant-suggestion"
              onClick={() => submit(s)}
            >
              {s}
              <span style={{ marginLeft: "auto", opacity: 0.5 }}>→</span>
            </button>
          ))}
        </div>
      </div>

      <aside className="sg-assistant-side">
        <div className="sg-card">
          <div className="sg-row-between">
            <h3 className="sg-h3" style={{ margin: 0 }}>
              今日待办 {home?.runningTasks?.length ?? 0}
            </h3>
            <Button size="small" type="text" onClick={() => navigate("/tasks")}>
              查看任务
            </Button>
          </div>
          {home?.runningTasks?.slice(0, 3).map((t) => (
            <div key={t.id} className="sg-assistant-task">
              <strong>{t.goal}</strong>
              <span className="sg-subtle">{t.status}</span>
            </div>
          ))}
          {(home?.runningTasks?.length ?? 0) === 0 && <p className="sg-subtle">没有待办任务</p>}
        </div>

        <div className="sg-card">
          <h3 className="sg-h3">使用概览</h3>
          <div className="sg-row-between" style={{ marginBottom: 6 }}>
            <span className="sg-subtle">本月剩余 AI Credits</span>
            <strong>{credits.toLocaleString("zh-CN")}</strong>
          </div>
          <Progress
            percent={Math.max(
              0,
              Math.min(100, Math.min(100, Math.max(0, (credits / 10_000) * 100))),
            )}
          />
          <div className="sg-subtle" style={{ fontSize: 12, marginTop: 6 }}>
            额度上限 10,000
          </div>
        </div>
      </aside>
    </div>
  );
}
