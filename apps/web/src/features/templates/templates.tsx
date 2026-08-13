import { Button, Card, Empty, Tabs, useToast } from "@shiguang/ui";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, type Template } from "../../entities/api.js";

export function TemplatesPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [type, setType] = useState("research");
  const { data } = useQuery<Template[]>({
    queryKey: ["templates", type],
    queryFn: () => api("/templates", { params: { type } }),
  });
  const useTemplate = useMutation({
    mutationFn: (id: string) => api<Template>(`/templates/${id}/use`, { method: "POST" }),
    onSuccess: (t) => {
      toast("success", `已应用模板「${t.name}」`);
      navigate(
        type === "research"
          ? `/research/new?template=${t.id}`
          : `/presentations/new?template=${t.id}`,
      );
    },
  });
  return (
    <div>
      <h1 className="sg-h1 sg-mb">模板中心</h1>
      <Tabs
        tabs={[
          { id: "research", label: "调研模板" },
          { id: "presentation", label: "演示模板" },
        ]}
        active={type}
        onChange={setType}
      />
      {(data?.length ?? 0) === 0 ? (
        <Empty title="暂无模板" />
      ) : (
        <div className="sg-grid" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
          {data?.map((t) => (
            <Card key={t.id}>
              <strong>{t.name}</strong>
              <p className="sg-subtle" style={{ margin: "6px 0 12px" }}>
                {t.description}
              </p>
              <div className="sg-row-between">
                <span className="sg-subtle">已使用 {t.usageCount} 次</span>
                <Button size="sm" variant="primary" onClick={() => useTemplate.mutate(t.id)}>
                  使用
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
