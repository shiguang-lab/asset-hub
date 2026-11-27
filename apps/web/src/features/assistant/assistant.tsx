import { Empty, StatusBadge, useToast } from "@shiguang/ui";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button, Card, Input, Select, Tag } from "antd";
import { createStyles } from "antd-style";
import {
  ArrowUpRight,
  BookOpen,
  Database,
  FileText,
  Presentation,
  Search,
  Sparkles,
  Telescope,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api, type KnowledgeBase, type SearchResult } from "../../entities/api.js";

interface AskCitation {
  index: number;
  chunkId: string;
  sourceId: string;
  sourceTitle: string;
  headingPath?: string;
  excerpt: string;
  kbId: string;
}

interface AskResponse {
  answer: string;
  citations: AskCitation[];
}

interface AssistantTurn {
  id: string;
  prompt: string;
  answer: string | null;
  kbName: string | null;
  citations: AskCitation[];
  search: SearchResult | null;
  error?: string;
}

const useAssistantPageStyles = createStyles(({ token }) => ({
  hero: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },
  composer: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  composerControls: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    flexWrap: "wrap",
  },
  kbSelect: {
    minWidth: 220,
    maxWidth: 320,
  },
  suggestions: {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
  },
  turnCard: {
    marginTop: 14,
  },
  answerBody: {
    whiteSpace: "pre-wrap",
    lineHeight: 1.65,
    marginTop: 8,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: 600,
    color: token.colorTextSecondary,
    marginTop: 12,
    marginBottom: 6,
    display: "block",
  },
  citationList: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
    gap: 8,
  },
  citationItem: {
    padding: 10,
    borderRadius: 8,
    border: `1px solid ${token.colorBorderSecondary}`,
    background: token.colorFillQuaternary,
    fontSize: 12,
  },
  matchRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    padding: "6px 8px",
    borderRadius: 6,
    border: `1px solid ${token.colorBorderSecondary}`,
    textDecoration: "none",
    color: "inherit",
  },
  quickGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: 10,
    marginTop: 14,
  },
}));

function assetHref(type: string, id: string): string {
  if (type === "presentation") return `/presentations/${id}`;
  if (type === "html_document") return `/documents/${id}/html`;
  if (type === "markdown" || type === "document") return `/documents/${id}`;
  return `/assets/${id}`;
}

export function AssistantPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [searchParams] = useSearchParams();
  const { styles } = useAssistantPageStyles();
  const initialQuery = searchParams.get("q") ?? "";
  const [prompt, setPrompt] = useState(initialQuery);
  const [selectedKbId, setSelectedKbId] = useState<string>("");
  const [turns, setTurns] = useState<AssistantTurn[]>([]);

  const { data: knowledgeBases = [] } = useQuery<KnowledgeBase[]>({
    queryKey: ["knowledge"],
    queryFn: () => api<KnowledgeBase[]>("/knowledge-bases"),
  });

  useEffect(() => {
    if (selectedKbId || knowledgeBases.length === 0) return;
    const preferred = knowledgeBases.find((kb) => kb.sourceCount > 0) ?? knowledgeBases[0];
    if (preferred) setSelectedKbId(preferred.id);
  }, [knowledgeBases, selectedKbId]);

  const askMutation = useMutation({
    mutationFn: async (input: { query: string; kbId: string }) => {
      const searchPromise = api<SearchResult>("/search", { params: { q: input.query } });
      const askPromise = input.kbId
        ? api<AskResponse>(`/knowledge-bases/${input.kbId}/ask`, {
            method: "POST",
            body: { query: input.query, topK: 6 },
          })
        : Promise.resolve(null);
      const [search, askRes] = await Promise.all([searchPromise, askPromise]);
      return { search, askRes, kbId: input.kbId, query: input.query };
    },
    onSuccess: ({ search, askRes, kbId, query }) => {
      const kbName = knowledgeBases.find((kb) => kb.id === kbId)?.name ?? null;
      setTurns((prev) => [
        {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          prompt: query,
          answer: askRes?.answer ?? null,
          kbName,
          citations: askRes?.citations ?? [],
          search,
        },
        ...prev,
      ]);
      setPrompt("");
    },
    onError: (err: Error, vars) => {
      toast("error", err.message);
      setTurns((prev) => [
        {
          id: `${Date.now()}`,
          prompt: vars.query,
          answer: null,
          kbName: null,
          citations: [],
          search: null,
          error: err.message,
        },
        ...prev,
      ]);
    },
  });

  const submitQuery = useCallback(
    (raw?: string) => {
      const text = (raw ?? prompt).trim();
      if (!text || askMutation.isPending) return;
      askMutation.mutate({ query: text, kbId: selectedKbId });
    },
    [askMutation, prompt, selectedKbId],
  );

  useEffect(() => {
    if (!initialQuery.trim() || turns.length > 0 || askMutation.isPending) return;
    if (knowledgeBases.length > 0 && !selectedKbId) return;
    askMutation.mutate({ query: initialQuery.trim(), kbId: selectedKbId });
    // Run once when arriving with ?q=...
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQuery, knowledgeBases.length, selectedKbId]);

  const samplePrompts = [
    "总结当前知识库中的核心结论并给出引用",
    "查找近期文档和调研资产",
    "基于知识库准备一份行业分析演示大纲",
  ];

  return (
    <div className="sg-page">
      <div className="sg-row-between sg-mb">
        <div className={styles.hero}>
          <h1 className="sg-h1">
            <Sparkles size={20} /> AI 工作台助手
          </h1>
          <p className="sg-subtle">
            同时检索工作区全部资产、任务与知识库引用，并一键衔接演示生成、深度研究与文档创作。
          </p>
        </div>
      </div>

      <Card>
        <div className={styles.composer}>
          <Input.TextArea
            rows={3}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onPressEnter={(e) => {
              if (!e.shiftKey) {
                e.preventDefault();
                submitQuery();
              }
            }}
            placeholder="提问知识库、检索工作区资产，或输入主题开始研究/生成演示（Enter 发送，Shift+Enter 换行）"
          />
          <div className={styles.composerControls}>
            <div className="sg-row">
              <Select
                className={styles.kbSelect}
                value={selectedKbId || undefined}
                onChange={setSelectedKbId}
                placeholder="选择问答知识库（可选）"
                allowClear
                options={knowledgeBases.map((kb) => ({
                  value: kb.id,
                  label: `${kb.name}（${kb.sourceCount} 来源 / ${kb.chunkCount} 片段）`,
                }))}
              />
              <div className={styles.suggestions}>
                {samplePrompts.map((item) => (
                  <Button key={item} size="small" onClick={() => submitQuery(item)}>
                    {item}
                  </Button>
                ))}
              </div>
            </div>
            <Button
              type="primary"
              loading={askMutation.isPending}
              disabled={!prompt.trim()}
              onClick={() => submitQuery()}
            >
              提问与检索
            </Button>
          </div>
        </div>
      </Card>

      <div className={styles.quickGrid}>
        <Button
          icon={<Presentation size={15} />}
          onClick={() =>
            navigate(
              prompt.trim()
                ? `/presentations/new?topic=${encodeURIComponent(prompt.trim())}`
                : "/presentations/new",
            )
          }
        >
          生成在线演示
        </Button>
        <Button
          icon={<Telescope size={15} />}
          onClick={() =>
            navigate(
              prompt.trim()
                ? `/research/new?goal=${encodeURIComponent(prompt.trim())}`
                : "/research/new",
            )
          }
        >
          发起深度研究
        </Button>
        <Button
          icon={<FileText size={15} />}
          onClick={() =>
            navigate(
              prompt.trim()
                ? `/documents/new?title=${encodeURIComponent(prompt.trim())}`
                : "/documents/new",
            )
          }
        >
          新建文档
        </Button>
        <Button icon={<Database size={15} />} onClick={() => navigate("/datasets")}>
          浏览数据集
        </Button>
        <Button icon={<BookOpen size={15} />} onClick={() => navigate("/knowledge")}>
          管理知识库
        </Button>
      </div>

      {turns.length === 0 ? (
        <Card className={styles.turnCard}>
          <Empty
            title="输入问题即可开始"
            hint="将基于所选知识库生成带出处的回答，并实时检索工作区文档、演示与任务。"
          />
        </Card>
      ) : (
        turns.map((turn) => {
          const encodedPrompt = encodeURIComponent(turn.prompt);
          const totalHits =
            (turn.search?.assets.length ?? 0) +
            (turn.search?.tasks.length ?? 0) +
            (turn.search?.knowledgeBases.length ?? 0);
          return (
            <Card key={turn.id} className={styles.turnCard}>
              <div className="sg-row-between">
                <strong>{turn.prompt}</strong>
                {turn.kbName && <Tag color="purple">知识库：{turn.kbName}</Tag>}
              </div>

              {turn.error && <p className="sg-subtle">请求失败：{turn.error}</p>}

              {turn.answer && <div className={styles.answerBody}>{turn.answer}</div>}
              {!turn.answer && !turn.error && (
                <p className="sg-subtle">未选择知识库，仅执行工作区全文检索。</p>
              )}

              {turn.citations.length > 0 && (
                <>
                  <span className={styles.sectionLabel}>引用来源（{turn.citations.length}）</span>
                  <div className={styles.citationList}>
                    {turn.citations.map((c) => (
                      <div key={c.chunkId} className={styles.citationItem}>
                        <div className="sg-row-between">
                          <strong>{c.sourceTitle}</strong>
                          <span className="sg-subtle">#{c.index}</span>
                        </div>
                        {c.headingPath && <div className="sg-subtle">{c.headingPath}</div>}
                        <p className="sg-subtle">{c.excerpt}</p>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {turn.search && totalHits > 0 && (
                <>
                  <span className={styles.sectionLabel}>
                    <Search size={12} /> 工作区匹配（{totalHits}）
                  </span>
                  <div className="sg-col sg-gap-sm">
                    {turn.search.assets.slice(0, 6).map((a) => (
                      <Link key={a.id} to={assetHref(a.type, a.id)} className={styles.matchRow}>
                        <span>
                          <strong>{a.title || "未命名资产"}</strong>{" "}
                          <span className="sg-subtle">· {a.type}</span>
                        </span>
                        <ArrowUpRight size={14} />
                      </Link>
                    ))}
                    {turn.search.tasks.slice(0, 4).map((t) => (
                      <Link key={t.id} to={`/tasks/${t.id}`} className={styles.matchRow}>
                        <span>
                          <strong>{String(t.spec?.name || t.goal || "未命名任务")}</strong>
                        </span>
                        <StatusBadge status={t.status} />
                      </Link>
                    ))}
                  </div>
                </>
              )}

              <div className="sg-row sg-mt">
                <Button
                  size="small"
                  onClick={() => navigate(`/presentations/new?topic=${encodedPrompt}`)}
                >
                  以此主题生成演示
                </Button>
                <Button
                  size="small"
                  onClick={() => navigate(`/research/new?goal=${encodedPrompt}`)}
                >
                  转为深度研究
                </Button>
                <Button
                  size="small"
                  onClick={() => navigate(`/documents/new?title=${encodedPrompt}`)}
                >
                  新建同名文档
                </Button>
              </div>
            </Card>
          );
        })
      )}
    </div>
  );
}
