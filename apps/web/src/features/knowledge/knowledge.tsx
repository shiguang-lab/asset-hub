import {
  Button,
  Card,
  Empty,
  Field,
  Input,
  Select,
  StatusBadge,
  Tabs,
  Textarea,
  useToast,
} from "@shiguang/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  type Asset,
  api,
  type KnowledgeBase,
  type KnowledgeSource,
  uploadFile,
} from "../../entities/api.js";
import { Markdown } from "../../shared/markdown.js";

export function KnowledgePage() {
  const navigate = useNavigate();
  const { data } = useQuery<KnowledgeBase[]>({
    queryKey: ["knowledge"],
    queryFn: () => api<KnowledgeBase[]>("/knowledge-bases"),
  });
  return (
    <div>
      <div className="sg-row-between sg-mb">
        <h1 className="sg-h1">知识库</h1>
        <Button variant="primary" onClick={() => navigate("/knowledge/new")}>
          + 新建知识库
        </Button>
      </div>
      {(data?.length ?? 0) === 0 ? (
        <Empty
          title="还没有知识库"
          hint="把资料变成可检索、可问答的知识资产。"
          action={
            <Button variant="primary" onClick={() => navigate("/knowledge/new")}>
              创建知识库
            </Button>
          }
        />
      ) : (
        <div className="sg-grid" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
          {data?.map((kb) => (
            <Card key={kb.id} onClick={() => navigate(`/knowledge/${kb.id}`)}>
              <div className="sg-row-between">
                <strong>{kb.name}</strong>
                <StatusBadge status={kb.status} />
              </div>
              <p className="sg-subtle" style={{ margin: "6px 0 0" }}>
                {kb.description || "暂无描述"}
              </p>
              <div className="sg-row sg-mt-sm">
                <span className="sg-badge">{kb.sourceCount} 来源</span>
                <span className="sg-badge sg-badge-accent">{kb.chunkCount} 分块</span>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

export function KnowledgeNewPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const mutation = useMutation({
    mutationFn: () =>
      api<KnowledgeBase>("/knowledge-bases", { method: "POST", body: { name, description } }),
    onSuccess: (kb) => {
      toast("success", "知识库已创建");
      navigate(`/knowledge/${kb.id}`);
    },
  });
  return (
    <div style={{ maxWidth: 560 }}>
      <h1 className="sg-h1 sg-mb">新建知识库</h1>
      <Card>
        <Field label="名称" hint="例如：越南消费金融市场资料库">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="知识库名称" />
        </Field>
        <Field label="描述（可选）">
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="这个知识库用来做什么？"
            style={{ minHeight: 90 }}
          />
        </Field>
        <Button variant="primary" disabled={!name.trim()} onClick={() => mutation.mutate()}>
          创建
        </Button>
      </Card>
    </div>
  );
}

export function KnowledgeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState("ask");
  const [sourceType, setSourceType] = useState("asset");
  const [assetId, setAssetId] = useState("");
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [askQuery, setAskQuery] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  const { data: kb } = useQuery<KnowledgeBase & { sources: KnowledgeSource[] }>({
    queryKey: ["knowledge", id],
    queryFn: () => api(`/knowledge-bases/${id}`),
  });
  const { data: assets } = useQuery<{ items: Asset[] }>({
    queryKey: ["assets"],
    queryFn: () => api("/assets", { params: { limit: 50 } }),
  });
  const { data: searchResults } = useQuery<
    Array<{
      chunk: { text: string; headingPath: string; ordinal: number };
      source: KnowledgeSource;
      score: number;
    }>
  >({
    queryKey: ["knowledge-search", id, searchQuery],
    queryFn: () =>
      api(`/knowledge-bases/${id}/search`, {
        method: "POST",
        body: { query: searchQuery, limit: 10 },
      }),
    enabled: searchQuery.trim().length > 0,
  });
  const { data: askResult } = useQuery<{
    answer: string;
    insufficient: boolean;
    citations: Array<{ index: number; sourceTitle: string; excerpt: string; headingPath: string }>;
  }>({
    queryKey: ["knowledge-ask", id, askQuery],
    queryFn: () =>
      api(`/knowledge-bases/${id}/ask`, { method: "POST", body: { query: askQuery, topK: 6 } }),
    enabled: askQuery.trim().length > 0,
  });

  const addSource = useMutation({
    mutationFn: async () => {
      if (sourceType === "upload" && file) {
        return uploadFile<KnowledgeSource>(`/knowledge-bases/${id}/sources`, file);
      }
      if (sourceType === "url") {
        return api<KnowledgeSource>(`/knowledge-bases/${id}/sources`, {
          method: "POST",
          body: { sourceType: "url", url },
        });
      }
      return api<KnowledgeSource>(`/knowledge-bases/${id}/sources`, {
        method: "POST",
        body: { sourceType: "asset", assetId },
      });
    },
    onSuccess: () => {
      toast("success", "来源已添加，正在后台解析索引");
      setFile(null);
      setUrl("");
      setAssetId("");
      void queryClient.invalidateQueries({ queryKey: ["knowledge", id] });
    },
    onError: (e: Error) => toast("error", e.message),
  });

  const retrySource = useMutation({
    mutationFn: (sid: string) =>
      api(`/knowledge-bases/${id}/sources/${sid}/retry`, { method: "POST" }),
    onSuccess: () => {
      toast("success", "已重新加入队列");
      void queryClient.invalidateQueries({ queryKey: ["knowledge", id] });
    },
  });

  const removeSource = useMutation({
    mutationFn: (sid: string) => api(`/knowledge-bases/${id}/sources/${sid}`, { method: "DELETE" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["knowledge", id] });
    },
  });

  if (!kb) return <Empty title="加载中…" />;

  return (
    <div>
      <div className="sg-row-between sg-mb">
        <div>
          <h1 className="sg-h1">{kb.name}</h1>
          <p className="sg-subtle">
            {kb.description} · {kb.sourceCount} 个来源 · {kb.chunkCount} 个分块
          </p>
        </div>
        <Button variant="primary" onClick={() => setTab("sources")}>
          + 添加来源
        </Button>
      </div>

      <Tabs
        tabs={[
          { id: "ask", label: "Ask 问答" },
          { id: "search", label: "搜索资料" },
          { id: "sources", label: `资料管理 (${kb.sourceCount})` },
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === "ask" && (
        <div className="sg-grid" style={{ gridTemplateColumns: "2fr 1fr" }}>
          <Card>
            <div className="sg-row">
              <Input
                value={askQuery}
                onChange={(e) => setAskQuery(e.target.value)}
                placeholder="基于知识库提问，例如：越南消费金融的主要玩家有哪些？"
              />
              <Button
                variant="primary"
                onClick={() => setAskQuery(askQuery)}
                disabled={!askQuery.trim()}
              >
                提问
              </Button>
            </div>
            {askResult && (
              <div className="sg-mt">
                <Markdown source={askResult.answer} />
                {askResult.insufficient && (
                  <p className="sg-hint">当前资料不足以回答，建议补充来源。</p>
                )}
                {askResult.citations.length > 0 && (
                  <div className="sg-mt">
                    <strong className="sg-h3">引用来源</strong>
                    {askResult.citations.map((c) => (
                      <div key={c.index} className="sg-card" style={{ marginTop: 8, padding: 12 }}>
                        <div className="sg-row">
                          <span className="sg-badge sg-badge-accent">[{c.index}]</span>
                          <strong>{c.sourceTitle}</strong>
                        </div>
                        <p className="sg-subtle" style={{ margin: "6px 0 0" }}>
                          {c.headingPath || "正文"} · {c.excerpt.slice(0, 120)}…
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </Card>
          <Card>
            <h3 className="sg-h3">使用建议</h3>
            <ul className="sg-subtle">
              <li>问题越具体，答案越准确。</li>
              <li>点击引用可定位到原文片段。</li>
              <li>没有足够依据时会明确说明。</li>
            </ul>
          </Card>
        </div>
      )}

      {tab === "search" && (
        <Card>
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="输入关键词检索资料…"
          />
          {searchResults && (
            <div className="sg-col sg-mt">
              {searchResults.map((r) => (
                <div key={r.chunk.ordinal + r.source.id} className="sg-card">
                  <div className="sg-row-between">
                    <strong>{r.source.title}</strong>
                    <span className="sg-subtle">相关度 {(1 - r.score).toFixed(2)}</span>
                  </div>
                  <p className="sg-subtle" style={{ margin: "6px 0 0" }}>
                    {r.chunk.headingPath}
                  </p>
                  <p style={{ margin: "8px 0 0" }}>{r.chunk.text.slice(0, 300)}…</p>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {tab === "sources" && (
        <div className="sg-col">
          <Card>
            <div className="sg-row sg-mb">
              <Select
                value={sourceType}
                onChange={setSourceType}
                options={[
                  { value: "asset", label: "已有资产" },
                  { value: "upload", label: "上传文件" },
                  { value: "url", label: "URL 抓取" },
                ]}
                className=""
                style={{ width: 140 }}
              />
              {sourceType === "asset" && (
                <Select
                  value={assetId}
                  onChange={setAssetId}
                  options={[
                    { value: "", label: "选择资产…" },
                    ...(assets?.items ?? []).map((a) => ({
                      value: a.id,
                      label: `${a.title} (${a.type})`,
                    })),
                  ]}
                  style={{ flex: 1 }}
                />
              )}
              {sourceType === "url" && (
                <Input
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://…"
                  style={{ flex: 1 }}
                />
              )}
              {sourceType === "upload" && (
                <input
                  type="file"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  style={{ flex: 1 }}
                />
              )}
              <Button
                variant="primary"
                disabled={addSource.isPending}
                onClick={() => addSource.mutate()}
              >
                添加
              </Button>
            </div>
          </Card>

          {(kb.sources?.length ?? 0) === 0 ? (
            <Empty title="还没有来源" hint="添加文档、文件或 URL，解析完成后即可搜索和 Ask。" />
          ) : (
            kb.sources?.map((s) => (
              <Card key={s.id}>
                <div className="sg-row-between">
                  <div>
                    <strong>{s.title}</strong>
                    <div className="sg-row sg-mt-sm">
                      <StatusBadge status={s.status} />
                      <span className="sg-badge">{s.sourceType}</span>
                      {s.chunkCount > 0 && (
                        <span className="sg-badge sg-badge-accent">{s.chunkCount} 分块</span>
                      )}
                    </div>
                    {s.error && (
                      <p
                        className="sg-subtle"
                        style={{ color: "var(--sg-danger)", margin: "6px 0 0" }}
                      >
                        {s.error}
                      </p>
                    )}
                  </div>
                  <div className="sg-row">
                    {s.status === "failed" && (
                      <Button size="sm" onClick={() => retrySource.mutate(s.id)}>
                        重试
                      </Button>
                    )}
                    <Button size="sm" variant="danger" onClick={() => removeSource.mutate(s.id)}>
                      移除
                    </Button>
                  </div>
                </div>
              </Card>
            ))
          )}
        </div>
      )}
    </div>
  );
}
