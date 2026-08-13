import {
  Button,
  Card,
  Empty,
  formatRelative,
  Input,
  Select,
  StatusBadge,
  Tabs,
  useToast,
} from "@shiguang/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { type Asset, api } from "../../entities/api.js";

const TYPES = ["all", "document", "html", "report", "dataset", "presentation", "source", "file"];

export function AssetsPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [type, setType] = useState("all");
  const [q, setQ] = useState("");
  const [visibility, setVisibility] = useState("all");
  const [includeDeleted, setIncludeDeleted] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [tagInput, setTagInput] = useState("");

  const { data } = useQuery<{ items: Asset[]; total: number }>({
    queryKey: ["assets", type, q, visibility, includeDeleted],
    queryFn: () =>
      api<{ items: Asset[]; total: number }>("/assets", {
        params: {
          type: type === "all" ? undefined : type,
          q: q || undefined,
          visibility: visibility === "all" ? undefined : visibility,
          includeDeleted,
          limit: 100,
        },
      }),
  });

  const batchMutation = useMutation({
    mutationFn: (input: { action: "delete" | "restore" | "tag"; ids: string[]; tags?: string[] }) =>
      api("/assets:batch", { method: "POST", body: input }),
    onSuccess: () => {
      toast("success", "批量操作成功");
      setSelected(new Set());
      void queryClient.invalidateQueries({ queryKey: ["assets"] });
      void queryClient.invalidateQueries({ queryKey: ["home"] });
    },
  });

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div>
      <div className="sg-row-between sg-mb">
        <div>
          <h1 className="sg-h1">资产</h1>
          <p className="sg-subtle">统一管理文档、报告、数据、演示与来源资产。</p>
        </div>
        <Button variant="primary" onClick={() => navigate("/documents/new")}>
          + 新建文档
        </Button>
      </div>

      <div className="sg-grid" style={{ gridTemplateColumns: "repeat(4, 1fr)", marginBottom: 18 }}>
        {[
          { label: "资产总数", value: data?.total ?? 0, delta: "+16%" },
          {
            label: "文档",
            value: (data?.items ?? []).filter((a) => a.type === "document").length,
            delta: "+8%",
          },
          {
            label: "报告",
            value: (data?.items ?? []).filter((a) => a.type === "report").length,
            delta: "+12%",
          },
          {
            label: "已发布",
            value: (data?.items ?? []).filter((a) => a.publishedUrl).length,
            delta: "+21%",
          },
        ].map((s) => (
          <Card key={s.label} className="sg-stat-card">
            <span className="label">{s.label}</span>
            <span className="value">{s.value}</span>
            <span className="delta">较上月 ↑ {s.delta}</span>
          </Card>
        ))}
      </div>

      <Tabs
        tabs={TYPES.map((t) => ({ id: t, label: t === "all" ? "全部" : t }))}
        active={type}
        onChange={setType}
      />

      <div className="sg-row sg-mb" style={{ flexWrap: "wrap" }}>
        <Input
          placeholder="搜索资产标题或描述…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{ maxWidth: 320 }}
        />
        <Select
          value={visibility}
          onChange={setVisibility}
          options={[
            { value: "all", label: "全部可见性" },
            { value: "private", label: "私有" },
            { value: "link", label: "链接" },
            { value: "public", label: "公开" },
          ]}
          className=""
          style={{ width: 140 }}
        />
        <label className="sg-row" style={{ cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={includeDeleted}
            onChange={(e) => setIncludeDeleted(e.target.checked)}
          />
          回收站
        </label>
        {selected.size > 0 && (
          <div className="sg-row" style={{ marginLeft: "auto" }}>
            {!includeDeleted && (
              <>
                <Input
                  placeholder="输入标签后回车"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  style={{ maxWidth: 160 }}
                />
                <Button
                  size="sm"
                  onClick={() =>
                    tagInput &&
                    batchMutation.mutate({ action: "tag", ids: [...selected], tags: [tagInput] })
                  }
                >
                  加标签
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  onClick={() => batchMutation.mutate({ action: "delete", ids: [...selected] })}
                >
                  删除
                </Button>
              </>
            )}
            {includeDeleted && (
              <Button
                size="sm"
                onClick={() => batchMutation.mutate({ action: "restore", ids: [...selected] })}
              >
                恢复
              </Button>
            )}
          </div>
        )}
      </div>

      {(data?.items.length ?? 0) === 0 ? (
        <Empty
          title={includeDeleted ? "回收站为空" : "还没有资产"}
          hint="创建文档、上传文件或发起调研后，资产会出现在这里。"
        />
      ) : (
        <Card style={{ padding: 8 }}>
          <table className="sg-table">
            <thead>
              <tr>
                <th style={{ width: 32 }}></th>
                <th>名称</th>
                <th>类型</th>
                <th>可见性</th>
                <th>标签</th>
                <th>更新时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {data?.items.map((asset) => (
                <tr
                  key={asset.id}
                  style={{ cursor: "pointer" }}
                  onClick={(e) => {
                    if ((e.target as HTMLElement).tagName !== "INPUT") navigate(assetHref(asset));
                  }}
                  onKeyDown={(e) => e.key === "Enter" && navigate(assetHref(asset))}
                >
                  <td>
                    <input
                      type="checkbox"
                      checked={selected.has(asset.id)}
                      onChange={() => toggle(asset.id)}
                    />
                  </td>
                  <td>
                    <strong>{asset.title}</strong>
                    {asset.description && (
                      <div className="sg-subtle" style={{ fontSize: 12 }}>
                        {asset.description}
                      </div>
                    )}
                  </td>
                  <td>
                    <span className="sg-badge">{asset.type}</span>
                  </td>
                  <td>
                    <StatusBadge status={asset.visibility} />
                  </td>
                  <td>
                    {asset.tags.slice(0, 3).map((t) => (
                      <span key={t} className="sg-tag" style={{ marginRight: 4 }}>
                        #{t}
                      </span>
                    ))}
                  </td>
                  <td className="sg-subtle">{formatRelative(asset.updatedAt)}</td>
                  <td>
                    <div className="sg-row">
                      <Button size="sm" variant="ghost" onClick={() => navigate(assetHref(asset))}>
                        打开
                      </Button>
                      {!includeDeleted && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            batchMutation.mutate({ action: "delete", ids: [asset.id] })
                          }
                        >
                          删除
                        </Button>
                      )}
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

function assetHref(asset: Asset): string {
  return asset.type === "document" || asset.type === "report"
    ? `/documents/${asset.id}`
    : asset.type === "html"
      ? `/html/${asset.id}`
      : asset.type === "presentation"
        ? `/presentations/${asset.id}`
        : asset.type === "dataset"
          ? `/datasets/${asset.id}`
          : `/assets/${asset.id}`;
}
