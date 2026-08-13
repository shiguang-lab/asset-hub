import { Button, Empty, Input, Select, Tabs, useToast } from "@shiguang/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { type Asset, api } from "../../entities/api.js";
import { AssetRow } from "../../shared/asset-row.js";

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
        <h1 className="sg-h1">资产中心</h1>
        <Button variant="primary" onClick={() => navigate("/documents/new")}>
          + 新建文档
        </Button>
      </div>

      <Tabs
        tabs={TYPES.map((t) => ({ id: t, label: t === "all" ? "全部" : t }))}
        active={type}
        onChange={setType}
      />

      <div className="sg-row sg-mb" style={{ flexWrap: "wrap" }}>
        <Input
          placeholder="搜索名称 / 描述 / 标签"
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
          style={{ width: 150 }}
        />
        <label className="sg-row" style={{ cursor: "pointer", marginLeft: 4 }}>
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
        <div className="sg-col">
          {data?.items.map((asset) => (
            <div key={asset.id} className="sg-row" style={{ alignItems: "stretch" }}>
              <div className="sg-center" style={{ padding: "0 6px" }}>
                <input
                  type="checkbox"
                  checked={selected.has(asset.id)}
                  onChange={() => toggle(asset.id)}
                />
              </div>
              <div style={{ flex: 1 }}>
                <AssetRow asset={asset} />
              </div>
            </div>
          ))}
        </div>
      )}
      {!includeDeleted && data && data.total > 0 && (
        <p className="sg-subtle sg-mt">共 {data.total} 个资产（点击行可打开）</p>
      )}
    </div>
  );
}
